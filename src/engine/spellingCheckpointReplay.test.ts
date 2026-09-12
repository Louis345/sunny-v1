import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { createLearningCycle, getLearningCycle, type LearningCycleNodeContract } from "./learningCycleRepository";
import {
  advanceCanonicalCycleFromEvidence,
  baselineQuestEvidenceEligibility,
  recordCanonicalNodeCompletion,
  recordSpellingDiscoveryAttempt,
  type CanonicalProgressionDecision,
} from "./learningCycleRuntime";
import { evaluateAcademicPredictions } from "./longitudinalLearning";

let rootDir: string;
beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-checkpoint-replay-"));
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubGlobal("fetch", () => { throw new Error("checkpoint_replay_provider_forbidden"); });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(rootDir, { recursive: true, force: true });
});

function fixture() {
  const identity = { childId: "lab-child", homeworkId: "hw-checkpoint-replay" };
  const registeredAt = "2026-09-08T12:00:00Z";
  const observedAt = "2026-09-08T12:01:00Z";
  const items = buildSpellingRecallItems({
    homeworkId: identity.homeworkId, words: ["night", "light"], evidenceIds: ["source:lab"],
    measurementRole: "fresh_checkpoint", exposure: "practiced", occasionId: "check",
  });
  const node: LearningCycleNodeContract = {
    nodeId: "check", role: "baseline", state: "ready", implementationType: "word-radar", title: "Recall check",
    academicTarget: { domain: "spelling", skill: "recall", targets: items.map(item => item.word) },
    algorithmOwner: "retrieval-practice", theoryId: "theory", experimentId: "recall",
    mechanic: "word-radar", theme: "lab", openingScreen: { title: "Recall check", purpose: "Capture recall" },
    generationPrompt: null, artifactBinding: null, artwork: { status: "pending", localPath: null, prompt: null },
    sfxContract: [], companionContract: { events: [] }, evidenceIds: [],
    evidenceContract: {
      academic: true, engagement: true, companionObservations: true,
      spellingItems: Object.fromEntries(items.map(item => [item.id, item])),
      itemRoles: Object.fromEntries(items.map(item => [item.id, item.lineage.measurementRole])),
    },
  };
  createLearningCycle({
    ...identity, domain: "spelling",
    assignment: { title: "Lab spelling", contentFingerprint: "lab", capturedEvidenceIds: ["source:lab"], targets: items.map(item => item.word) },
    academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Practice may improve immediate recall", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] },
    engagementTheory: null, nodes: [node, { ...node, nodeId: "quest", role: "quest", state: "locked", evidenceContract: { academic: true, engagement: true, companionObservations: true } }],
    academicPredictions: items.map(item => ({
      predictionId: `prediction:${item.id}`, theoryId: "theory", constructId: item.constructId,
      context: "After practice", horizon: "Immediate recall, not retention",
      eligibility: { sources: ["practice"], maxDelayDays: 1, checkpointItemIds: [item.id] },
      expectedMetric: { key: "unassisted_recall_accuracy", min: 0.5, max: 1 }, predictedErrorPatterns: [],
      confidence: 0.5, evidenceIds: ["source:lab"], intervention: "Practice", evidenceLimit: "practice_only",
      createdAt: registeredAt, lockedAt: registeredAt,
    })),
  }, { rootDir, now: new Date(registeredAt) });
  for (const item of items) recordSpellingDiscoveryAttempt({
    ...identity,
    attempt: { attemptId: `original:${item.id}`, itemId: item.id, attemptedValue: item.word, observedAt },
    support: { status: "unassisted", scaffolds: [] },
  }, { rootDir, now: new Date(observedAt) });
  const completion = { ...identity, nodeId: node.nodeId, sessionId: "initial", result: { completed: true, accuracy: 0, timeSpent_ms: 100 } };
  const current = () => getLearningCycle(identity.childId, identity.homeworkId, { rootDir })!;
  const decide = vi.fn(async (): Promise<CanonicalProgressionDecision> => ({
    status: "inconclusive", reason: "Immediate recall is not retention", progressionAction: "await_calibration",
    preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Delayed evidence"],
    predictionEvaluationIds: current().predictionEvaluations.map(row => row.evaluationId),
  }));
  const advance = () => advanceCanonicalCycleFromEvidence({ ...identity, decide }, { rootDir, now: new Date("2026-09-08T12:02:00Z") });
  const finish = async () => {
    recordCanonicalNodeCompletion(completion, { rootDir });
    return advance();
  };
  return { items, completion, current, decide, advance, finish };
}

/** Human review compared a changed replay answer with its unchanged score.
 * Logs reported successful completion but reused the original checkpoint facts.
 * The earlier lab covered initial recall and generic math replay separately,
 * never a completed spelling checkpoint replayed through practice completion.
 */
describe("spelling checkpoint replay evidence", () => {
  it("reuses committed recall capture for initial completion/resume only, idempotently", () => {
    const { completion, current } = fixture();
    const captured = current().observations;
    const completed = recordCanonicalNodeCompletion(completion, { rootDir })!;
    expect(completed.observations).toEqual(captured);
    expect(completed.evidence.academic.find(row => row.evidenceId === "initial:check:completion")?.accuracy).toBe(1);
    expect(recordCanonicalNodeCompletion(completion, { rootDir })).toEqual(completed);
  });

  it("scores actual replay responses as repeated practice without changing predictions, lifecycle or prior facts", async () => {
    const { items, completion, current, finish, advance, decide } = fixture();
    const original = await finish();
    expect(original.predictionEvaluations).toHaveLength(2);
    const replay = { ...completion, sessionId: "replay", result: { ...completion.result, replay: false, targetResults: [
      { target: items[0].id, attemptedValue: "nite", correct: true },
      { target: items[1].id, attemptedValue: "light", correct: false },
    ] } };
    const replayed = recordCanonicalNodeCompletion(replay, { rootDir, now: new Date("2026-09-08T12:03:00Z") })!;
    const fresh = replayed.observations.slice(original.observations.length);
    expect(fresh.map(row => row.childResponse)).toEqual(["nite", "light"]);
    expect(fresh.map(row => row.result.correct)).toEqual([false, true]);
    expect(fresh.map(row => row.observationId)).toEqual(["replay:check:observation:1", "replay:check:observation:2"]);
    for (const row of fresh) {
      expect(row).toMatchObject({ provenance: "practice", exposure: "previously_practiced", assistance: { status: "unknown" }, observedAt: "2026-09-08T12:03:00.000Z" });
      expect(row.confounds).toContain("item_previously_exposed");
    }
    expect(replayed.evidence.academic.find(row => row.evidenceId === "replay:check:completion")?.accuracy).toBe(0.5);
    expect(replayed.evidence.engagement.at(-1)?.summary).toContain("replay=true");
    expect(replayed.observations.slice(0, original.observations.length)).toEqual(original.observations);
    expect(replayed.nodes.map(row => [row.nodeId, row.state])).toEqual(original.nodes.map(row => [row.nodeId, row.state]));
    expect(replayed.lifecycle).toBe(original.lifecycle);
    expect(replayed.academicPredictions).toEqual(original.academicPredictions);
    expect(replayed.predictionEvaluations).toEqual(original.predictionEvaluations);
    expect(evaluateAcademicPredictions(replayed.academicPredictions, fresh)).toEqual([]);
    expect(baselineQuestEvidenceEligibility(replayed).eligible).toBe(false);
    expect(recordCanonicalNodeCompletion(replay, { rootDir })).toEqual(replayed);
    expect(await advance()).toEqual(replayed);
    expect(decide).toHaveBeenCalledOnce();
    expect(current()).toEqual(replayed);
  });

  it("keeps a replay without captured letters unscored rather than borrowing the original answer", async () => {
    const { items, completion, finish } = fixture();
    const original = await finish();
    const replayed = recordCanonicalNodeCompletion({ ...completion, sessionId: "uncaptured", result: {
      ...completion.result, accuracy: 1, targetResults: [{ target: items[0].id, correct: true }],
    } }, { rootDir })!;
    expect(replayed.observations).toHaveLength(original.observations.length + 1);
    expect(replayed.observations.at(-1)).toMatchObject({ provenance: "practice", exposure: "previously_practiced", result: { observedErrorType: "response_not_captured" } });
    expect(replayed.observations.at(-1)?.childResponse).toBeUndefined();
    expect(replayed.evidence.academic.find(row => row.evidenceId === "uncaptured:check:completion")?.accuracy).toBeUndefined();
  });

  it.each(["missing", "unknown", "duplicate"] as const)("rejects %s replay target results without mutating canonical evidence", async variant => {
    const { items, completion, current, finish } = fixture();
    const original = await finish();
    const row = { target: items[0].id, attemptedValue: "night", correct: true };
    const targetResults = variant === "missing" ? undefined : variant === "unknown" ? [{ ...row, target: "invented" }] : [row, row];
    const error = variant === "missing" ? "learning_cycle_instrument_target_results_missing:check"
      : variant === "unknown" ? "learning_cycle_instrument_unknown_item:invented" : `learning_cycle_duplicate_item:${row.target}`;
    expect(() => recordCanonicalNodeCompletion({ ...completion, sessionId: "invalid-replay", result: { ...completion.result, targetResults } }, { rootDir })).toThrow(error);
    expect(current()).toEqual(original);
  });
});
