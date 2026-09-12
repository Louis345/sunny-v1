import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLearningCycle, getLearningCycle, transitionLearningCycle, type LearningCycleRecordV2 } from "./learningCycleRepository";
import { interpretReturnedWorkBatch, recordConfirmedReturnedWork, type TheoryDecisionContent } from "./longitudinalLearning";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function fixture(eligible: boolean, sourceType: "graded_work" | "delayed_reassessment" = "graded_work", initialLifecycle: LearningCycleRecordV2["lifecycle"] = "awaiting_calibration") {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-calibration-evidence-"));
  roots.push(rootDir);
  const childId = "lab-review", homeworkId = "lab-legacy", sourceId = "lab-return";
  const constructId = "math.equal_groups", registered = "2026-07-18T12:00:00.000Z";
  createLearningCycle({
    childId, homeworkId, domain: "math", initialLifecycle,
    assignment: { title: "Synthetic review", contentFingerprint: "lab-only", capturedEvidenceIds: ["lab-source"], targets: [constructId] },
    academicTheory: { theoryId: "lab-theory", revision: 1, hypothesis: "Synthetic test", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] },
    engagementTheory: null, nodes: [],
    academicPredictions: [{
      predictionId: "lab-prediction", theoryId: "lab-theory", constructId, context: "returned work", horizon: "legacy window",
      ...(eligible ? { eligibility: { sources: [sourceType], maxDelayDays: 7 } } : {}),
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 1 }, predictedErrorPatterns: [], confidence: 0.5,
      evidenceIds: ["lab-source"], intervention: "lab practice", evidenceLimit: "calibrated_mastery", createdAt: registered, lockedAt: registered,
    }],
  }, { rootDir });
  const cycle = recordConfirmedReturnedWork({
    childId, homeworkId,
    source: { sourceId, type: sourceType, fileFingerprint: "lab-return-only", sourceFile: "synthetic.pdf", provenance: "caregiver",
      capturedAt: "2026-07-19T12:00:00.000Z", assignmentLink: { homeworkId, method: "explicit_selection", confidence: 1, confirmedBy: "caregiver" }, status: "confirmed" },
    items: [
      { itemId: "lab-item", prompt: "2 groups of 5", childResponse: "10", correct: true, extractionConfidence: 1, constructLinks: [{ constructId, role: "primary", confidence: 1 }] },
      { itemId: "unrelated-item", prompt: "Other construct", correct: true, extractionConfidence: 1, constructLinks: [{ constructId: "math.unrelated", role: "primary", confidence: 1 }] },
    ],
  }, { rootDir });
  return { rootDir, childId, homeworkId, sourceId, cycle };
}

function decision(cycle: LearningCycleRecordV2, status: TheoryDecisionContent["status"]): TheoryDecisionContent {
  return {
    status, reason: "RECORDED diagnostic decision, not live inference", nextAction: "Planner-authored next step",
    evidenceIds: [cycle.observations[0]!.observationId], predictionEvaluationIds: cycle.predictionEvaluations.map(row => row.evaluationId),
    preserve: [], change: [], testNext: [], nextEvidenceRequired: [],
  };
}

describe("returned-work calibration requires sufficient linked evidence", () => {
  // The review caught a correct insufficiency label being ignored downstream.
  // Earlier labs separately tested that label and successful cycle closure.
  it.each(["supported", "falsified"] as const)("repository rejects an insufficient %s calibration claim before any canonical mutation", status => {
    const { cycle, ...scope } = fixture(false);
    const file = path.join(scope.rootDir, "src/context", scope.childId, "homework/cycles", `${scope.homeworkId}.json`);
    const before = fs.readFileSync(file);
    expect(() => transitionLearningCycle(scope.childId, scope.homeworkId, cycle.revision, {
      type: "theory_decided",
      decision: { ...decision(cycle, status), revisedHypothesis: "Unsupported replacement hypothesis" },
    }, scope)).toThrow("learning_cycle_calibration_evidence_insufficient");
    expect(fs.readFileSync(file)).toEqual(before);
    expect(getLearningCycle(scope.childId, scope.homeworkId, scope)).toEqual(cycle);
  });

  it.each([
    "baseline_evaluating", "quest_evaluating", "boss_evaluating",
  ] as const)("does not apply the calibration claim guard to %s decisions", lifecycle => {
    const { cycle, ...scope } = fixture(false, "graded_work", lifecycle);
    let current = cycle;
    for (const status of ["supported", "falsified"] as const) {
      current = transitionLearningCycle(scope.childId, scope.homeworkId, current.revision, {
        type: "theory_decided", decision: decision(current, status),
      }, scope);
      expect(current.lifecycle).toBe(lifecycle);
      expect(current.decisionHistory.at(-1)?.status).toBe(status);
    }
    expect(current.observations).toEqual(cycle.observations);
    expect(current.academicPredictions).toEqual(cycle.academicPredictions);
  });

  it.each(["supported", "falsified"] as const)("rejects %s from unknown legacy eligibility without changing facts or closing", async status => {
    const { cycle, ...scope } = fixture(false);
    expect(cycle.predictionEvaluations.map(row => row.sufficiency)).toEqual(["insufficient"]);
    const interpret = vi.fn(async () => decision(cycle, status));
    await expect(interpretReturnedWorkBatch({ ...scope, interpret })).rejects.toThrow("longitudinal_prediction_evidence_insufficient");
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(getLearningCycle(scope.childId, scope.homeworkId, scope)).toEqual(cycle);
  });

  it.each(["supported", "falsified"] as const)("rejects %s citing an unrelated observation in the same returned batch", async status => {
    const { cycle, ...scope } = fixture(true);
    const interpret = vi.fn(async () => ({ ...decision(cycle, status), evidenceIds: [cycle.observations[1]!.observationId] }));
    await expect(interpretReturnedWorkBatch({ ...scope, interpret })).rejects.toThrow("longitudinal_prediction_evidence_insufficient");
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(getLearningCycle(scope.childId, scope.homeworkId, scope)).toEqual(cycle);
  });

  it.each(["revised", "inconclusive", "awaiting_calibration"] as const)("retains a truthful %s decision without treating insufficient evidence as closure", async status => {
    const { cycle, ...scope } = fixture(false);
    const content = { ...decision(cycle, status), reason: "Eligibility remains unknown; more evidence is needed.", nextEvidenceRequired: ["eligible external evidence"] };
    const interpret = vi.fn(async () => content);
    const result = await interpretReturnedWorkBatch({ ...scope, interpret });
    expect(result.cycle.lifecycle).toBe("awaiting_calibration");
    expect(result.cycle.observations).toEqual(cycle.observations);
    expect(result.cycle.academicPredictions).toEqual(cycle.academicPredictions);
    expect(result.cycle.predictionEvaluations).toEqual(cycle.predictionEvaluations);
    expect(result.cycle.decisionHistory.at(-1)).toMatchObject(content);
    expect(await interpretReturnedWorkBatch({ ...scope, interpret })).toMatchObject({ applied: false, reason: "already_interpreted" });
    expect(interpret).toHaveBeenCalledTimes(1);
  });

  it.each(["graded_work", "delayed_reassessment"] as const)("still permits one sufficient source-linked %s decision to close", async sourceType => {
    const { cycle, ...scope } = fixture(true, sourceType);
    const interpret = vi.fn(async () => decision(cycle, "supported"));
    const result = await interpretReturnedWorkBatch({ ...scope, interpret });
    expect(result.cycle.lifecycle).toBe("complete");
    expect(result.cycle.observations).toEqual(cycle.observations);
    expect(result.cycle.academicPredictions).toEqual(cycle.academicPredictions);
    expect(await interpretReturnedWorkBatch({ ...scope, interpret })).toMatchObject({ applied: false, reason: "already_interpreted" });
    expect(interpret).toHaveBeenCalledTimes(1);
  });

  it.each(["insufficient", "other-source", "uncited-observation", "mixed-sufficiency"] as const)("repository cannot close from %s citations even when called directly", kind => {
    const { cycle, ...scope } = fixture(kind !== "insufficient");
    const current = kind === "other-source" || kind === "mixed-sufficiency"
      ? transitionLearningCycle(scope.childId, scope.homeworkId, cycle.revision, {
        type: "prediction_evaluations_recorded", evaluations: [{ ...cycle.predictionEvaluations[0]!, evaluationId: "extra-evaluation",
          ...(kind === "other-source" ? { sourceId: "different-return" } : { sufficiency: "insufficient" as const }) }],
      }, scope) : cycle;
    const content = decision(current, "revised");
    if (kind === "other-source") content.predictionEvaluationIds = ["extra-evaluation"];
    if (kind === "uncited-observation") content.evidenceIds = [cycle.observations[1]!.observationId];
    const result = transitionLearningCycle(scope.childId, scope.homeworkId, current.revision, { type: "theory_decided", decision: content }, scope);
    expect(result.lifecycle).toBe("awaiting_calibration");
    expect(result.observations).toEqual(current.observations);
    expect(result.academicPredictions).toEqual(current.academicPredictions);
    expect(result.predictionEvaluations).toEqual(current.predictionEvaluations);
  });
});
