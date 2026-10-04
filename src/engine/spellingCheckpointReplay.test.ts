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
  it("records a Visual Explainer result as assisted exposure, never a wrong whole-word recall", () => {
    const identity = { childId: "lab-child", homeworkId: "hw-visual-exposure" };
    const items = buildSpellingRecallItems({
      homeworkId: identity.homeworkId,
      words: ["light"],
      evidenceIds: ["source:lab"],
      measurementRole: "practice",
      exposure: "taught",
      occasionId: "visual",
    });
    const item = items[0];
    const visualNode: LearningCycleNodeContract = {
      nodeId: "visual", role: "baseline", state: "ready", implementationType: "visual-explainer", title: "See the chunk",
      academicTarget: { domain: "spelling", skill: "orthographic strategy", targets: [item.word] },
      algorithmOwner: "error-pattern-remediation", theoryId: "theory", experimentId: "visual",
      mechanic: "visual-explainer", theme: "lab", openingScreen: { title: "See the chunk", purpose: "Assisted instruction" },
      generationPrompt: null, artifactBinding: null, artwork: { status: "pending", localPath: null, prompt: null },
      sfxContract: [], companionContract: { events: [] }, evidenceIds: [],
      evidenceContract: {
        academic: true, engagement: true, companionObservations: true,
        spellingItems: { [item.id]: item }, itemRoles: { [item.id]: "practice" },
      },
    };
    createLearningCycle({
      ...identity, domain: "spelling",
      assignment: { title: "Lab spelling", contentFingerprint: "lab", capturedEvidenceIds: ["source:lab"], targets: [item.word] },
      academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Modeling may support later recall", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] },
      engagementTheory: null, nodes: [visualNode],
    }, { rootDir, now: new Date("2026-09-08T12:00:00Z") });

    const completed = recordCanonicalNodeCompletion({
      ...identity, nodeId: visualNode.nodeId, sessionId: "visual-session",
      result: {
        completed: true, accuracy: 1, timeSpent_ms: 100,
        targetResults: [{ target: item.id, masteryEligible: false }],
      } as never,
    }, { rootDir, now: new Date("2026-09-08T12:01:00Z") })!;

    expect(completed.observations).toHaveLength(1);
    expect(completed.observations[0]).toMatchObject({
      itemId: item.id,
      provenance: "practice",
      exposure: "previously_practiced",
      assistance: { status: "assisted" },
      result: { observedErrorType: "assisted_instruction" },
    });
    expect(completed.observations[0].result.correct).toBeUndefined();
    expect(completed.observations[0].childResponse).toBeUndefined();
  });

  it("rejects a client claim that an ordinary spelling activity was assisted instruction", () => {
    const { items, completion, current } = fixture();
    const before = current();
    expect(() => recordCanonicalNodeCompletion({
      ...completion,
      sessionId: "forged-assisted-role",
      result: {
        ...completion.result,
        targetResults: [{
          target: items[0].id,
          evidenceRole: "assisted_instruction",
          masteryEligible: false,
        }],
      } as never,
    }, { rootDir })).toThrow(`learning_cycle_evidence_role_conflict:${completion.nodeId}`);
    expect(current()).toEqual(before);
  });

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

it('does not distribute a session companion interaction across every spelling response',async()=>{
 const f=fixture();await f.finish();
 const cycle=recordCanonicalNodeCompletion({...f.completion,sessionId:'per-word',result:{completed:true,accuracy:1,timeSpent_ms:100,companionInteractions:['Help was requested somewhere in this activity'],targetResults:f.items.map((item,index)=>({target:item.id,correct:true,attemptedValue:item.word,scaffoldLevel:index===0?1:0}))}},{rootDir})!;
 const rows=cycle.observations.filter(row=>row.sourceId==='activity:per-word:check');
 expect(rows).toHaveLength(2);
 expect(rows[0].assistance.status).toBe('assisted');
 expect(rows[1].assistance).toEqual({status:'unknown',scaffolds:[]});
 expect(rows.every(row=>row.provenance==='practice')).toBe(true);
});

it('records a replay item as practice without reopening a completed node or lifecycle',async()=>{
 const f=fixture();await f.finish();const before=f.current();
 const after=recordSpellingDiscoveryAttempt({childId:before.childId,homeworkId:before.homeworkId,sessionId:'replay-voice',attempt:{attemptId:'replay-raw',itemId:f.items[0].id,attemptedValue:'nite',observedAt:'2026-10-04T01:10:00Z'},support:{status:'unknown',scaffolds:[]}},{rootDir});
 expect(after.nodes.find(n=>n.nodeId==='check')?.state).toBe('completed');
 expect(after.lifecycle).toBe(before.lifecycle);
 expect(after.observations).toHaveLength(before.observations.length+1);
 expect(after.observations.at(-1)).toMatchObject({childResponse:'nite',provenance:'practice',result:{correct:false}});
 expect(after.decisionHistory.filter(d=>d.eventType==='theory_decided')).toEqual(before.decisionHistory.filter(d=>d.eventType==='theory_decided'));
 expect(after.decisionHistory.at(-1)?.eventType).toBe('instrument_observed');
 expect(f.decide).toHaveBeenCalledTimes(1);
 expect(after.predictionEvaluations).toEqual(before.predictionEvaluations);
 expect(recordSpellingDiscoveryAttempt({childId:before.childId,homeworkId:before.homeworkId,sessionId:'replay-voice',attempt:{attemptId:'replay-raw',itemId:f.items[0].id,attemptedValue:'nite',observedAt:'2026-10-04T01:10:00Z'},support:{status:'unknown',scaffolds:[]}},{rootDir}).revision).toBe(after.revision);
});
