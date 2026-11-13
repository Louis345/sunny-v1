import express from "express";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLearningCycle, getLearningCycle, type LearningCycleNodeContract } from "../engine/learningCycleRepository";
import { advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion } from "../engine/learningCycleRuntime";
import { reconcileCompanionCareCurrencyAward } from "./currencyAward";
import { setupRoutes } from "./routes";
import { CHEST_TABLE } from "../shared/rewardCatalog";

vi.mock("../engine/learningCycleRuntime", async original => ({
  ...await original<typeof import("../engine/learningCycleRuntime")>(),
  advanceCanonicalCycleFromEvidence: vi.fn(async () => ({ lifecycle: "baseline_evaluating", revision: 2 })),
}));
vi.mock("../engine/canonicalProgressionGenerator", () => ({ generateCanonicalProgressionArtifact: vi.fn(() => { throw new Error("provider_forbidden"); }) }));
vi.mock("../profiles/childChart", async () => {
  const { createStarterCompanionCarePlan } = await import("../engine/companionCareEngine");
  return { getChildChart: vi.fn(() => ({ companionCare: { plan: createStarterCompanionCarePlan({ childId: "lab-child", companionId: "elli" }) } })) };
});
vi.mock("../profiles/companionCarePlan", () => ({ saveCompanionCarePlan: vi.fn(), mirrorCompanionCareToLearningProfile: vi.fn() }));
vi.mock("../engine/companionCareEngine", async original => ({
  ...await original<typeof import("../engine/companionCareEngine")>(),
  grantVideoCallTicket: vi.fn(() => ({ granted: false, plan: { economy: { videoCallTickets: [] } } })),
}));
vi.mock("./currencyAward", () => ({ reconcileCompanionCareCurrencyAward: vi.fn(() => ({ ok: true, balance: 125 })) }));

const roots: string[] = [];
const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(() => {
  servers.splice(0).forEach(server => server.close());
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-finished-loss-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubEnv("SUNNY_MODE", "real");
  const node: LearningCycleNodeContract = {
    nodeId: "native-practice", role: "baseline", state: "ready", title: "Spelling practice",
    academicTarget: { domain: "spelling", skill: "spelling", targets: ["night"] },
    algorithmOwner: "retrieval-practice", theoryId: "theory", experimentId: "practice", mechanic: "native", theme: "lab",
    openingScreen: { title: "Spelling practice", purpose: "Practice captured words" }, generationPrompt: null,
    artifactBinding: { contentId: "native", artifactId: "native", localArtifactPath: "/games/wordle.html", localArtworkPath: "/lab.png", contractFingerprint: "frozen", validationStatus: "passed" },
    artwork: { status: "ready", localPath: "/lab.png", prompt: null }, sfxContract: [], companionContract: { events: [] }, evidenceIds: [],
    evidenceContract: {
      academic: true, engagement: true, companionObservations: true, itemRoles: { "frozen-night": "practice" },
      spellingItems: { "frozen-night": { domain: "spelling", id: "frozen-night", wordId: "word-night", word: "night", constructId: "spelling.night", lineage: { sourceEvidenceIds: ["source:lab"], exposure: "practiced", measurementRole: "practice" }, response: { mode: "spelling_letters", acceptedForms: ["night"], caseSensitive: false } } },
    },
  };
  const before = createLearningCycle({
    childId: "lab-child", homeworkId: "hw-finished", domain: "spelling",
    assignment: { title: "Lab words", contentFingerprint: "lab", capturedEvidenceIds: ["source:lab"], targets: ["night"] },
    academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Practice", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] },
    engagementTheory: null, nodes: [node],
  }, { rootDir });
  const app = express(); app.use(express.json()); setupRoutes(app);
  const server = app.listen(0); servers.push(server);
  const post = async (result: Record<string, unknown>) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/learning-cycle/node-complete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId: before.childId, homeworkId: before.homeworkId, nodeId: node.nodeId, result }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { before, post, current: () => getLearningCycle(before.childId, before.homeworkId)! };
}

/** Human saw the loss screen but no saved participation. HTTP-success logs and
 * win-only lab paths missed it. Execute the actual endings and identity bridge. */
type NativeGame = "wordle" | "wheel" | "monster-stampede" | "speed-catcher";
const GAME_FILES: Record<NativeGame, string> = { wordle: "wordle.html", wheel: "WheelOfFortune.html", "monster-stampede": "monster-stampede.html", "speed-catcher": "speed-catcher.html" };
function nativeEnding(game: NativeGame, won: boolean): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];
  const params = new URLSearchParams({ nodeId: "native-practice", childId: "lab-child", sessionId: "host-launch", preview: "go-live", spellingItemBindings: JSON.stringify([{ itemId: "frozen-night", word: "night" }]) });
  const sandbox = {
    location: { search: `?${params}` }, URLSearchParams, console, Date, Math,
    document: { title: game, addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ style: {} }) },
    window: { parent: { postMessage: (message: Record<string, unknown>) => messages.push(message) } },
    nodeSent: false, gameOver: false, word: "night", triesUsed: won ? 1 : 6, lastGuess: won ? "night" : "light", startTime: Date.now() - 1000, targetResults: [],
    WORD_RAW: "night", wrongGuesses: won ? 0 : 6, ilaCoins: 110, wofSessionCoinDelta: (coins: number) => coins - 100,
    // React arcade games (Monster Stampede, Speed Catcher): the real endGame callback with hooks stubbed.
    WORDS_RAW: ["night"], WORDS: ["night"], score: won ? 30 : 10, completedRef: { current: false },
    wordsCorrect: { current: won ? ["night"] : [] }, wordsWrong: { current: won ? [] : ["night"] },
    timerRef: { current: 0 }, compTimerRef: { current: 0 }, SE: { fanfare() {}, gameover() {} },
    setPhase() {}, setBubbles() {}, setCompMood() {}, setCompSpeech() {}, reportState() {},
    setTimeout: (fn: () => void) => fn(), clearInterval() {}, clearTimeout() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), "web/public/games/_contract.js"), "utf8"), sandbox);
  const source = fs.readFileSync(path.join(process.cwd(), `web/public/games/${GAME_FILES[game]}`), "utf8");
  if (game === "monster-stampede" || game === "speed-catcher") {
    const start = source.indexOf("const endGame = useCallback(") + "const endGame = useCallback(".length;
    const callback = source.slice(start, source.indexOf("},[score]);", start) + 1);
    vm.runInContext(`startTime = { current: Date.now() - 1000 }; const endGame = ${callback};\nendGame(${won}); endGame(${won});`, sandbox);
  } else if (game === "wordle") {
    vm.runInContext(`${source.slice(source.indexOf("function endGame("), source.indexOf("function runFlipThenApply("))}\nendGame(${won}); endGame(${won});`, sandbox);
  } else {
    const region = source.slice(source.indexOf(won ? "if (!isSolved" : "// Game-over detection"));
    const timer = region.slice(region.indexOf("setTimeout(() => {") + "setTimeout(() => {".length, region.indexOf(won ? "}, 3500);" : "}, 2000);"));
    vm.runInContext(`startTime = { current: Date.now() - 1000 }; ${timer}`, sandbox);
  }
  const completions = messages.filter(message => message.type === "node_complete");
  expect(completions).toHaveLength(1);
  return completions[0];
}

describe("finished native spelling participation", () => {
  // Owner, 2026-11-08: Ila lost Monster Stampede and the stop stayed open, so she replayed until she won.
  // The arcade games reported a loss as completed:false with no ended flag, which reads as quitting.
  it.each(["wordle", "wheel", "monster-stampede", "speed-catcher"] as const)("saves an ended %s loss once, without a win award or invented answer", async game => {
    const { post, current } = fixture();
    const result = nativeEnding(game, false);
    expect(result).toMatchObject({ completed: false, ended: true, won: false });
    const response = await post(result);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ nodeState: "completed" });
    expect(response.body.coinAward).toBeUndefined();
    const saved = current();
    expect(saved.nodes[0].state).toBe("completed");
    expect(saved.observations).toHaveLength(1);
    expect(saved.observations[0]).toMatchObject({ itemId: "frozen-night", provenance: "practice", exposure: "previously_practiced" });
    expect(saved.observations[0].assistance.status).not.toBe("unassisted");
    if (game === "wordle" || game === "wheel") {
      expect(saved.observations[0].result).toEqual(game === "wordle" ? { correct: false, score: 0 } : { observedErrorType: "response_not_captured" });
      expect(saved.observations[0].childResponse).toBe(game === "wordle" ? "light" : undefined);
    }
    expect(saved.evidence.engagement[0].summary).toContain("won=false");
    expect((await post(result)).body.nodeState).toBe("completed");
    expect(current()).toEqual(saved);
    expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1);
    expect(reconcileCompanionCareCurrencyAward).not.toHaveBeenCalled();
  });

  // Owner, 2026-11-06: a win opens a wooden treasure chest that pays the stop's coins, once.
  it.each(["wordle", "wheel", "monster-stampede", "speed-catcher"] as const)("opens one treasure chest for a %s win, paying its coins once", async game => {
    const { post } = fixture();
    const result = nativeEnding(game, true);
    expect(result).toMatchObject({ completed: true, ended: true, won: true });
    const first = (await post(result)).body;
    // Every chest is a surprise (owner, 2026-11-07): a practice stop's chest is at least common and rolls its coins.
    expect(first).toMatchObject({ nodeState: "completed", nodeChest: { kind: "common" } });
    const chest = first.nodeChest as { rarity: keyof typeof CHEST_TABLE; coins: number };
    const [min, max] = CHEST_TABLE[chest.rarity].coinRange;
    expect(chest.coins).toBeGreaterThanOrEqual(min);
    expect(chest.coins).toBeLessThanOrEqual(max);
    expect((first.coinAward as { amount: number }).amount).toBe(chest.coins);
    expect((first.coinAward as { balance: number }).balance).toBeGreaterThanOrEqual(chest.coins);
    const again = (await post(result)).body;
    expect(again.coinAward).toBeUndefined();
    expect(again.nodeChest).toBeUndefined();
    expect(reconcileCompanionCareCurrencyAward).not.toHaveBeenCalled();
  });

  it.each([{ completed: false }, { completed: false, ended: true, won: false, earlyExit: true }, { completed: true, ended: true, won: true, earlyExit: true }])("keeps an unfinished/early exit incomplete: %j", async ending => {
    const { before, post, current } = fixture();
    const response = await post({ ...nativeEnding("wordle", false), ended: false, ...ending });
    expect(response.body).toMatchObject({ nodeState: "ready", academicAccuracy: null });
    expect(current()).toEqual(before);
    expect(reconcileCompanionCareCurrencyAward).not.toHaveBeenCalled();
    expect(advanceCanonicalCycleFromEvidence).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "  "])("requires a stable session for frozen spelling: %s", async sessionId => {
    const { before, post, current } = fixture();
    expect(await post({ ...nativeEnding("wordle", false), sessionId })).toMatchObject({ status: 400, body: { error: "canonical_completion_session_required" } });
    expect(current()).toEqual(before);
  });

  it("enforces frozen spelling session identity at the runtime boundary too", () => {
    const { before, current } = fixture();
    expect(() => recordCanonicalNodeCompletion({ childId: before.childId, homeworkId: before.homeworkId, nodeId: "native-practice", sessionId: " ", result: { completed: true, accuracy: 0, timeSpent_ms: 1, targetResults: [{ target: "frozen-night", correct: false, attemptedValue: "light" }] } })).toThrow("canonical_completion_session_required");
    expect(current()).toEqual(before);
  });

  it("still rejects unknown target IDs on a terminal loss", async () => {
    const { before, post, current } = fixture();
    const response = await post({ ...nativeEnding("wordle", false), ended: true, targetResults: [{ target: "invented", attemptedValue: "night", correct: true }] });
    expect(response).toMatchObject({ status: 409, body: { error: "learning_cycle_instrument_unknown_item:invented" } });
    expect(current()).toEqual(before);
    expect(reconcileCompanionCareCurrencyAward).not.toHaveBeenCalled();
  });

  // 2026-11-10, Reina's test morning: her record refused every save (a hand edit broke its seal), the route answered
  // 409, and her 37 answers were gone. A refused save now keeps her answers, held to replay once the record accepts them.
  it("holds her answers when the record refuses the save, and says so", async () => {
    const runtime = await import("../engine/learningCycleRuntime");
    const { post } = fixture();
    vi.spyOn(runtime, "recordCanonicalNodeCompletion").mockImplementationOnce(() => { throw new Error("learning_board_topology_changed:hw-finished:board:1"); });
    const response = await post({ completed: true, sessionId: "host-launch", accuracy: 1, timeSpent_ms: 60_000, targetResults: [{ target: "frozen-night", correct: true, attemptedValue: "night" }] });
    expect(response).toMatchObject({ status: 409, body: { held: true } });
    const held = JSON.parse(fs.readFileSync(path.join(process.env.SUNNY_CONTEXT_ROOT!, "lab-child", "sunny_health", "held-completions.json"), "utf8"));
    expect(held).toEqual([expect.objectContaining({ nodeId: "native-practice", result: expect.objectContaining({ targetResults: [expect.objectContaining({ attemptedValue: "night" })] }) })]);
  });
});
