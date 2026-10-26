import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle, spellingAssignmentItems, type LearningCycleNodeContract } from "./learningCycleRepository";
import { advanceCanonicalCycleFromEvidence, recordCanonicalNodeCompletion, parseCanonicalProgressionDecision, scoreSpellingRecall } from "./learningCycleRuntime";
import { currentBoardInstance, preparingBoardInstance, publishBoardInstance } from "./learningBoardInstances";
import { buildAdaptiveProgressionCreatorPrompt } from "./directMathExperience";
import { runMathProviderStage } from "./adaptiveMathDiscovery";
import { plainDraw, successorToolReply } from "../scripts/fixtures/successorToolConversation";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(responseCount = 2, builtIn = false) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-successor-contract-")); roots.push(rootDir);
  const childId = "contract-child", homeworkId = "school-words";
  seedSpellingLab(rootDir, ["night", "light"], "", childId);
  const items = buildSpellingRecallItems({ homeworkId, words: ["night", "light"], evidenceIds: ["school:one"], measurementRole: "practice", exposure: "unseen" });
  const node: LearningCycleNodeContract = {
    nodeId: "practice", role: "baseline", title: "Word workshop", state: "ready", ...(builtIn ? { implementationType: "word-radar" } : {}),
    academicTarget: { domain: "spelling", skill: "school words", targets: items.map(item => item.word) },
    algorithmOwner: "retrieval-practice", theoryId: "theory", experimentId: "practice", mechanic: "guided spelling", theme: "harbor",
    openingScreen: { title: "Word workshop", purpose: "Practice school words" }, generationPrompt: null,
    artifactBinding: { contentId: "practice", artifactId: "practice", localArtifactPath: "/games/practice.html", localArtworkPath: "/generated/practice.png", contractFingerprint: "recorded", validationStatus: "passed" },
    artwork: { status: "ready", localPath: "/generated/practice.png", prompt: null }, sfxContract: [], companionContract: { events: ["completion"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(items.map(item => [item.id, item])),
      // A built-in carries the setup the re-run step prepares again; without one it cannot be offered.
      ...(builtIn ? { nativeConfig: { activityId: "word-radar", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } } } : {}) }, evidenceIds: [],
  };
  const base = { childId, homeworkId, domain: "spelling", assignment: { title: "School spelling", contentFingerprint: "recorded", capturedEvidenceIds: ["school:one"], targets: ["night", "light"] }, academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Test the spelling gap", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node], initialLifecycle: "board_ready" as const };
  const board = publishBoardInstance({ ...base, boards: [] } as never, { kind: "teaching", predecessorBoardId: null, plannerDecisionId: "original-plan", evidenceIds: ["school:one"], nodeIds: [node.nodeId], publishedAt: "2026-10-01T00:00:00Z" });
  createLearningCycle({ ...base, boards: [board] }, { rootDir });
  recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "recorded", nodeId: node.nodeId, result: { completed: true, accuracy: 0, timeSpent_ms: 1000, targetResults: items.slice(0, responseCount).map(item => ({ target: item.id, correct: false, attemptedValue: "unknown" })) } }, { rootDir });
  const instrument = { nodeId: builtIn ? "practice" : "support", title: "Lantern letters", academicTarget: "school words", mechanic: "build words", theme: "harbor", openingPurpose: "Practice the observed gap", creatorPrompt: "Build words from captured evidence", stakesDesign: "Mission", failureMode: "Try again", escalation: "Fade support", mechanicSpec: "Move letters", mathematicalHook: "Word patterns", spelling: { wordIds: builtIn ? items.map(item => item.wordId) : [items[0].wordId], measurementRole: "practice", responseMode: "spelling_letters" } };
  const decision = { boardDefinition:linearJourneyFixture([instrument.nodeId]), status: "revised", reason: "Support the observed spelling gap", progressionAction: "generate_support", preserve: [], change: ["guided practice"], testNext: ["recall"], nextEvidenceRequired: ["later recall"], nextInstruments: [instrument] };
  return { rootDir, childId, homeworkId, items, instrument, decision, board };
}

it("carries the Planner's saved word references through its tool, frozen successor, Creator and scorer", async () => {
  // Human saw a completed session fail to produce a usable next board. Old lab
  // fixtures supplied generic support prose, so green tests missed empty words.
  // Board 3 re-runs a tested built-in through the tools; code binds that built-in's own saved words.
  const f = fixture(2, true); const requests: any[] = [];
  const stream = (payload: any) => { requests.push(payload); return { finalMessage: async () => successorToolReply(f.decision as never, payload) }; };
  const cycle = await advanceCanonicalCycleFromEvidence({ childId: f.childId, homeworkId: f.homeworkId, client: { messages: { stream } } as never, draw: plainDraw }, { rootDir: f.rootDir });
  const addStep = requests[0].tools.find((tool: any) => tool.name === "add_step");
  expect(addStep.input_schema.properties.built_in.enum).toEqual(["practice"]);
  expect(requests[0].messages[0].content[0].text).toContain(f.items[0].wordId);
  const board = preparingBoardInstance(cycle)!;
  const node = cycle.nodes.find(node => board.nodeIds.includes(node.nodeId))!;
  expect(node.academicTarget.targets).toEqual(["night", "light"]);
  const frozen = Object.values(node.evidenceContract.spellingItems ?? {});
  expect(frozen).toHaveLength(2);
  expect(frozen[0]).toMatchObject({ wordId: f.items[0].wordId, word: "night", response: f.items[0].response, lineage: { exposure: "practiced", measurementRole: "practice" } });
  expect(frozen[0].id).not.toBe(f.items[0].id);
  expect(node.evidenceContract.itemRoles).toEqual(Object.fromEntries(frozen.map(item => [item.id, "practice"])));
  const prompt = buildAdaptiveProgressionCreatorPrompt({ cycle, node, childContext: "Recorded child context" } as never);
  expect(prompt).toContain(frozen[0].id);
  expect(prompt).toContain('"night"');
  expect(scoreSpellingRecall(frozen[0], "nite").correct).toBe(false);
  expect(scoreSpellingRecall(frozen[0], "night").correct).toBe(true);
  expect(currentBoardInstance(cycle).boardId).toBe(f.board.boardId);
});

// 2026-10-24: board 3 is decided through small locked tools. Prediction citations are a pick-list of
// the real evaluations and there is no Planner-written catalog list, so the citation-patch purchase and
// the catalog-list checks these tests covered no longer exist. Their replacements: the toolkit tests
// (spellingSuccessorTools.test.ts) and successorThroughTools.test.ts, which fails on any correction stage.

it("keeps a received historical journey correction while executing the original without another purchase", async () => {
  // A decision received through the old single form is on disk for older homework. It replays as it
  // was received (its historical missing edge is derived from the order), and nothing is bought again.
  const f = fixture();
  const cycle = getLearningCycle(f.childId,f.homeworkId,{rootDir:f.rootDir})!;
  const batch = cycle.decisionHistory.at(-1)!;
  const revision = Number(batch.decisionId.match(/:r(\d+)$/)![1]);
  const draftDir = path.join(f.rootDir,`src/context/${f.childId}/homework/cycles/.planner/${f.homeworkId}`,batch.decisionId.replace(/[^a-zA-Z0-9_-]+/g,'_'));
  const received = structuredClone(f.decision);
  received.boardDefinition.edges.pop();
  expect(parseCanonicalProgressionDecision(received).successor).toBeDefined();
  const snapshot = { childId: f.childId, homeworkId: f.homeworkId, batchId: batch.decisionId, lifecycle: cycle.lifecycle, cycleRevision: revision,
    observationIds: cycle.observations.filter(row => row.provenance !== "practice").map(row => row.observationId), model: process.env.SUNNY_EXPERIENCE_PLANNER_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5" };
  await runMathProviderStage({ draftDir, stage: `progression-decision-r${revision}`, model: snapshot.model, request: snapshot, execute: async () => ({ plannerMessage: { content: [{ type: "tool_use", name: "decide_learning_cycle_progression", input: received }] } }) });
  let calls = 0;
  const result = await advanceCanonicalCycleFromEvidence({childId:f.childId,homeworkId:f.homeworkId,client:{messages:{stream:()=>{calls++;throw new Error("must_not_repurchase_received_work");}}} as never},{rootDir:f.rootDir});
  expect(preparingBoardInstance(result)).toBeDefined();
  expect(calls).toBe(0);
});

it.each(["missing", "unknown", "duplicate", "invalid-role"])("rejects a %s word prescription before saving a successor", async kind => {
  const f = fixture();
  const spelling = kind === "missing" ? undefined : { ...f.instrument.spelling,
    wordIds: kind === "unknown" ? ["invented-word"] : kind === "duplicate" ? [f.items[0].wordId, f.items[0].wordId] : f.instrument.spelling.wordIds,
    measurementRole: kind === "invalid-role" ? "mastery" : "practice" };
  await expect(advanceCanonicalCycleFromEvidence({ childId: f.childId, homeworkId: f.homeworkId, decide: async () => parseCanonicalProgressionDecision({ ...f.decision, nextInstruments: [{ ...f.instrument, spelling }] }) }, { rootDir: f.rootDir })).rejects.toThrow(/spelling_successor/);
  expect(preparingBoardInstance(getLearningCycle(f.childId, f.homeworkId, { rootDir: f.rootDir })!)).toBeUndefined();
});

it("derives prior exposure from observations without inventing exposure for unobserved words", async () => {
  const f = fixture(1);
  const cycle = await advanceCanonicalCycleFromEvidence({ childId: f.childId, homeworkId: f.homeworkId, decide: async () => parseCanonicalProgressionDecision({ ...f.decision, nextInstruments: [{ ...f.instrument, spelling: { ...f.instrument.spelling, wordIds: f.items.map(item => item.wordId), measurementRole: "fresh_checkpoint" } }] }) }, { rootDir: f.rootDir });
  const board = preparingBoardInstance(cycle)!;
  const items = Object.values(cycle.nodes.find(node => board.nodeIds.includes(node.nodeId))!.evidenceContract.spellingItems!);
  expect(items.map(item => [item.word, item.lineage.exposure, item.lineage.measurementRole])).toEqual([
    ["night", "practiced", "fresh_checkpoint"], ["light", "unseen", "fresh_checkpoint"],
  ]);
});

it("uses the same assignment allowlist for tool references and binding, excluding foreign words", () => {
  const f = fixture();
  const cycle = getLearningCycle(f.childId, f.homeworkId, { rootDir: f.rootDir })!;
  const foreign = { ...f.items[0], id: "other-item", wordId: "other-word", word: "unassigned" };
  cycle.nodes.push({ ...cycle.nodes[0], nodeId: "other", evidenceContract: { ...cycle.nodes[0].evidenceContract, spellingItems: { [foreign.id]: foreign } } });
  expect([...spellingAssignmentItems(cycle).keys()]).toEqual(f.items.map(item => item.wordId));
});
