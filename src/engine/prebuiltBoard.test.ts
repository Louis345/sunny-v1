import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { plainDraw, successorToolReply } from "../scripts/fixtures/successorToolConversation";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle, type LearningCycleNodeContract } from "./learningCycleRepository";
import { advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion } from "./learningCycleRuntime";
import { preparingBoardInstance, publishBoardInstance } from "./learningBoardInstances";
import { prepareSuccessorBoard } from "./canonicalProgressionGenerator";
import { kitFromCapture, readPrebuiltKit, savePrebuiltKit } from "./prebuiltBoard";

// Owner, 2026-11-05 (experiment): "build while she plays and only reveal when the content has been generated".
// A wait between her board and her Quest "will kill it". So the paid Planner and game builder run ahead on a
// sandbox copy of her cycle; when her real board finishes, Sunny uses that saved decision and game at once,
// with no model call. A saved decision that no longer fits is never forced: it is marked failed and skipped.
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const GOOD = `<!doctype html><html><head><title>Lantern Harbor</title></head><body><p>Spell the word Elli says.</p><input id="box"><script>
const words = window.GAME_PARAMS.words; let i = 0;
window.openSpellingItem(words[i], "Lantern 1");
document.getElementById("box").onchange = event => { window.fireAttemptEvent({ domain: "spelling", target: words[i], attemptedValue: event.target.value, correct: event.target.value === words[i] });
  i += 1; if (i < words.length) window.openSpellingItem(words[i], "Lantern " + (i + 1)); else { window.reportStep("done", "All answered."); window.sendNodeComplete({ completed: true }); } };
</script></body></html>`;

const childId = "prebuilt-child", homeworkId = "school-words";
function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-prebuilt-board-")); roots.push(rootDir);
  seedSpellingLab(rootDir, ["night", "light"], "", childId);
  const items = buildSpellingRecallItems({ homeworkId, words: ["night", "light"], evidenceIds: ["school:one"], measurementRole: "practice", exposure: "unseen" });
  const node: LearningCycleNodeContract = {
    nodeId: "practice", role: "baseline", title: "Word workshop", state: "ready", implementationType: "word-radar",
    academicTarget: { domain: "spelling", skill: "school words", targets: items.map(item => item.word) },
    algorithmOwner: "retrieval-practice", theoryId: "theory", experimentId: "practice", mechanic: "guided spelling", theme: "harbor",
    openingScreen: { title: "Word workshop", purpose: "Practice school words" }, generationPrompt: null,
    artifactBinding: { contentId: "practice", artifactId: "practice", localArtifactPath: "/games/practice.html", localArtworkPath: "/generated/practice.png", contractFingerprint: "recorded", validationStatus: "passed" },
    artwork: { status: "ready", localPath: "/generated/practice.png", prompt: null }, sfxContract: [], companionContract: { events: ["completion"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(items.map(item => [item.id, item])),
      nativeConfig: { activityId: "word-radar", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } } }, evidenceIds: [],
  };
  const base = { childId, homeworkId, domain: "spelling", assignment: { title: "School spelling", contentFingerprint: "recorded", capturedEvidenceIds: ["school:one"], targets: ["night", "light"] }, academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Test the spelling gap", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node], initialLifecycle: "board_ready" as const };
  const board = publishBoardInstance({ ...base, boards: [] } as never, { kind: "teaching", predecessorBoardId: null, plannerDecisionId: "original-plan", evidenceIds: ["school:one"], nodeIds: [node.nodeId], publishedAt: "2026-10-01T00:00:00Z" });
  createLearningCycle({ ...base, boards: [board] }, { rootDir });
  recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "recorded", nodeId: node.nodeId, result: { completed: true, accuracy: 0, timeSpent_ms: 1000, targetResults: items.map(item => ({ target: item.id, correct: false, attemptedValue: "unknown" })) } }, { rootDir });
  const instrument = { nodeId: "her-game", title: "Lantern Harbor", academicTarget: "school words", openingPurpose: "Practice the missed words in a world made for her", spelling: { builtInActivityId: "generated-game", wordIds: items.map(item => item.wordId) } };
  const decision = { boardDefinition: linearJourneyFixture([instrument.nodeId]), status: "revised", reason: "Practice the gap in a game made for her", progressionAction: "generate_support", preserve: [], change: ["a game made for her"], testNext: ["recall"], nextEvidenceRequired: ["later recall"], nextInstruments: [instrument] };
  return { rootDir, decision };
}

/** The sandbox run: the real (here recorded) Planner and builder, with capture on. */
async function captureAhead() {
  const sandbox = fixture();
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-prebuilt-capture-")); roots.push(captureDir);
  vi.stubEnv("SUNNY_PREBUILD_CAPTURE", captureDir);
  const stream = (payload: any) => ({ finalMessage: async () => successorToolReply(sandbox.decision as never, payload) });
  await advanceCanonicalCycleFromEvidence({ childId, homeworkId, client: { messages: { stream } } as never, draw: plainDraw }, { rootDir: sandbox.rootDir });
  const builder = { messages: { stream: () => ({ finalMessage: async () => ({ content: [{ type: "text", text: GOOD }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }) as never }) } };
  await prepareSuccessorBoard({ childId, homeworkId, spellingGameClient: builder }, { rootDir: sandbox.rootDir });
  vi.unstubAllEnvs();
  return kitFromCapture(captureDir, { childId, homeworkId, fromLifecycle: "baseline_evaluating" });
}

it("uses the decision and game built ahead the moment her real board finishes, with no model call", async () => {
  const kit = await captureAhead();
  expect(kit.decision.progressionAction).toBe("generate_support");
  expect(Object.keys(kit.games)).toHaveLength(1);

  const real = fixture();
  savePrebuiltKit(kit, { rootDir: real.rootDir });
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubGlobal("fetch", () => { throw new Error("no_model_call_allowed"); });
  const decided = await advanceCanonicalCycleFromEvidence({ childId, homeworkId, draw: plainDraw }, { rootDir: real.rootDir });
  const node = decided.nodes.find(row => preparingBoardInstance(decided)!.nodeIds.includes(row.nodeId))!;
  expect(node.implementationType).toBe("generated-game");
  expect(Object.keys(kit.games)).toEqual([node.nodeId]);
  expect(readPrebuiltKit(childId, homeworkId, { rootDir: real.rootDir })?.status).toBe("used");

  const ready = await prepareSuccessorBoard({ childId, homeworkId }, { rootDir: real.rootDir });
  const built = ready.nodes.find(row => row.nodeId === node.nodeId)!;
  expect(built.notReadyReason).toBeUndefined();
  expect(built.artifactBinding?.validationStatus).toBe("passed");
  const html = fs.readFileSync(path.join(real.rootDir, "src/context", childId, built.artifactBinding!.localArtifactPath), "utf8");
  expect(html).toContain("Lantern Harbor");
});

it("never forces a saved decision that no longer fits her cycle", async () => {
  const kit = await captureAhead();
  const real = fixture();
  // A Boss is never valid straight after her first board; the runtime refuses it.
  savePrebuiltKit({ ...kit, decision: { ...kit.decision, progressionAction: "generate_boss" } }, { rootDir: real.rootDir });
  const stream = vi.fn((payload: any) => ({ finalMessage: async () => successorToolReply(real.decision as never, payload) }));
  // The kit is checked first; when it is refused the live Planner decides as it does today.
  const decided = await advanceCanonicalCycleFromEvidence({ childId, homeworkId, draw: plainDraw, client: { messages: { stream } } as never }, { rootDir: real.rootDir });
  expect(readPrebuiltKit(childId, homeworkId, { rootDir: real.rootDir })?.status).toBe("failed");
  expect(stream).toHaveBeenCalled();
  expect(decided.lifecycle).not.toBe("blocked");
  expect(getLearningCycle(childId, homeworkId, { rootDir: real.rootDir })!.nodes.some(row => row.implementationType === "generated-game")).toBe(true);
});
