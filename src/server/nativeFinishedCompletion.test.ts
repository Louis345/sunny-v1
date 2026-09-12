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

vi.mock("../engine/learningCycleRuntime", async original => ({
  ...await original<typeof import("../engine/learningCycleRuntime")>(),
  advanceCanonicalCycleFromEvidence: vi.fn(async () => ({ lifecycle: "baseline_evaluating", revision: 2 })),
}));
vi.mock("../engine/canonicalProgressionGenerator", () => ({ generateCanonicalProgressionArtifact: vi.fn(() => { throw new Error("provider_forbidden"); }) }));
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn(() => ({ companionCare: { plan: {} } })) }));
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
function nativeEnding(game: "wordle" | "wheel", won: boolean): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];
  const params = new URLSearchParams({ nodeId: "native-practice", childId: "lab-child", sessionId: "host-launch", preview: "go-live", spellingItemBindings: JSON.stringify([{ itemId: "frozen-night", word: "night" }]) });
  const sandbox = {
    location: { search: `?${params}` }, URLSearchParams, console, Date, Math,
    document: { title: game, addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ style: {} }) },
    window: { parent: { postMessage: (message: Record<string, unknown>) => messages.push(message) } },
    nodeSent: false, gameOver: false, word: "night", triesUsed: won ? 1 : 6, lastGuess: won ? "night" : "light", startTime: Date.now() - 1000, targetResults: [],
    WORD_RAW: "night", wrongGuesses: won ? 0 : 6, ilaCoins: 110, wofSessionCoinDelta: (coins: number) => coins - 100,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), "web/public/games/_contract.js"), "utf8"), sandbox);
  const source = fs.readFileSync(path.join(process.cwd(), `web/public/games/${game === "wordle" ? "wordle.html" : "WheelOfFortune.html"}`), "utf8");
  if (game === "wordle") {
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
  it.each(["wordle", "wheel"] as const)("saves an ended %s loss once, without a win award or invented answer", async game => {
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
    expect(saved.observations[0].result).toEqual(game === "wordle" ? { correct: false, score: 0 } : { observedErrorType: "response_not_captured" });
    expect(saved.observations[0].childResponse).toBe(game === "wordle" ? "light" : undefined);
    expect(saved.evidence.engagement[0].summary).toContain("won=false");
    expect((await post(result)).body.nodeState).toBe("completed");
    expect(current()).toEqual(saved);
    expect(advanceCanonicalCycleFromEvidence).toHaveBeenCalledTimes(1);
    expect(reconcileCompanionCareCurrencyAward).not.toHaveBeenCalled();
  });

  it.each(["wordle", "wheel"] as const)("preserves the existing %s win award, once", async game => {
    const { post } = fixture();
    const result = nativeEnding(game, true);
    expect(result).toMatchObject({ completed: true, ended: true, won: true });
    expect((await post(result)).body).toMatchObject({ nodeState: "completed", coinAward: { amount: 25, balance: 125 } });
    expect((await post(result)).body.coinAward).toBeUndefined();
    expect(reconcileCompanionCareCurrencyAward).toHaveBeenCalledTimes(1);
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
});
