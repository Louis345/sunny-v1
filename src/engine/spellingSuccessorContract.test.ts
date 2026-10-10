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

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(responseCount = 2) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-successor-contract-")); roots.push(rootDir);
  const childId = "contract-child", homeworkId = "school-words";
  seedSpellingLab(rootDir, ["night", "light"], "", childId);
  const items = buildSpellingRecallItems({ homeworkId, words: ["night", "light"], evidenceIds: ["school:one"], measurementRole: "practice", exposure: "unseen" });
  const node: LearningCycleNodeContract = {
    nodeId: "practice", role: "baseline", title: "Word workshop", state: "ready",
    academicTarget: { domain: "spelling", skill: "school words", targets: items.map(item => item.word) },
    algorithmOwner: "retrieval-practice", theoryId: "theory", experimentId: "practice", mechanic: "guided spelling", theme: "harbor",
    openingScreen: { title: "Word workshop", purpose: "Practice school words" }, generationPrompt: null,
    artifactBinding: { contentId: "practice", artifactId: "practice", localArtifactPath: "/games/practice.html", localArtworkPath: "/generated/practice.png", contractFingerprint: "recorded", validationStatus: "passed" },
    artwork: { status: "ready", localPath: "/generated/practice.png", prompt: null }, sfxContract: [], companionContract: { events: ["completion"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: Object.fromEntries(items.map(item => [item.id, item])) }, evidenceIds: [],
  };
  const base = { childId, homeworkId, domain: "spelling", assignment: { title: "School spelling", contentFingerprint: "recorded", capturedEvidenceIds: ["school:one"], targets: ["night", "light"] }, academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Test the spelling gap", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node], initialLifecycle: "board_ready" as const };
  const board = publishBoardInstance({ ...base, boards: [] } as never, { kind: "teaching", predecessorBoardId: null, plannerDecisionId: "original-plan", evidenceIds: ["school:one"], nodeIds: [node.nodeId], publishedAt: "2026-10-01T00:00:00Z" });
  createLearningCycle({ ...base, boards: [board] }, { rootDir });
  recordCanonicalNodeCompletion({ childId, homeworkId, sessionId: "recorded", nodeId: node.nodeId, result: { completed: true, accuracy: 0, timeSpent_ms: 1000, targetResults: items.slice(0, responseCount).map(item => ({ target: item.id, correct: false, attemptedValue: "unknown" })) } }, { rootDir });
  const instrument = { nodeId: "support", title: "Lantern letters", academicTarget: "school words", mechanic: "build words", theme: "harbor", openingPurpose: "Practice the observed gap", creatorPrompt: "Build words from captured evidence", stakesDesign: "Mission", failureMode: "Try again", escalation: "Fade support", mechanicSpec: "Move letters", mathematicalHook: "Word patterns", spelling: { wordIds: [items[0].wordId], measurementRole: "practice", responseMode: "spelling_letters" } };
  const decision = { boardDefinition:linearJourneyFixture(["support"]), status: "revised", reason: "Support the observed spelling gap", progressionAction: "generate_support", preserve: [], change: ["guided practice"], testNext: ["recall"], nextEvidenceRequired: ["later recall"], nextInstruments: [instrument] };
  return { rootDir, childId, homeworkId, items, instrument, decision, board };
}

it("carries the Planner's saved word references through its tool, frozen successor, Creator and scorer", async () => {
  // Human saw a completed session fail to produce a usable next board. Old lab
  // fixtures supplied generic support prose, so green tests missed empty words.
  const f = fixture(); let request: any;
  const execute = async (payload: unknown) => { request = payload; return { content: [{ type: "tool_use", name: "decide_learning_cycle_progression", input: f.decision }] }; };
  const cycle = await advanceCanonicalCycleFromEvidence({ childId: f.childId, homeworkId: f.homeworkId, client: { messages: { create: execute, stream: (payload: unknown) => ({ finalMessage: () => execute(payload) }) } } as never }, { rootDir: f.rootDir });
  const schema = request.tools[0].input_schema.properties.nextInstruments.items;
  expect(schema.required).toContain("spelling");
  expect(schema.properties.spelling.properties.wordIds.items.enum).toEqual(expect.arrayContaining(f.items.map(item => item.wordId)));
  expect(request.messages[0].content).toContain(f.items[0].wordId);
  const board = preparingBoardInstance(cycle)!;
  const node = cycle.nodes.find(node => board.nodeIds.includes(node.nodeId))!;
  expect(node.academicTarget.targets).toEqual(["night"]);
  const frozen = Object.values(node.evidenceContract.spellingItems ?? {});
  expect(frozen).toHaveLength(1);
  expect(frozen[0]).toMatchObject({ wordId: f.items[0].wordId, word: "night", response: f.items[0].response, lineage: { exposure: "practiced", measurementRole: "practice" } });
  expect(frozen[0].id).not.toBe(f.items[0].id);
  expect(node.evidenceContract.itemRoles).toEqual({ [frozen[0].id]: "practice" });
  const prompt = buildAdaptiveProgressionCreatorPrompt({ cycle, node, childContext: "Recorded child context" } as never);
  expect(prompt).toContain(frozen[0].id);
  expect(prompt).toContain('"night"');
  expect(scoreSpellingRecall(frozen[0], "nite").correct).toBe(false);
  expect(scoreSpellingRecall(frozen[0], "night").correct).toBe(true);
  expect(currentBoardInstance(cycle).boardId).toBe(f.board.boardId);
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
