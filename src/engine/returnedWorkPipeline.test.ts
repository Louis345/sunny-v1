import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLearningCycle, getLearningCycle } from "./learningCycleRepository";
import {
  confirmReturnedWorkDraft,
  createReturnedWorkDraft,
  getAssignmentLearningReport,
  listReturnedWorkAssignments,
  summarizePredictionCalibration,
} from "./returnedWorkPipeline";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-returned-work-"));
}

function seed(rootDir: string): void {
  createLearningCycle({
    childId: "reina",
    homeworkId: "hw-original",
    domain: "math",
    assignment: {
      title: "Pashley multiplication",
      contentFingerprint: "original-unmarked-hash",
      capturedEvidenceIds: ["assignment:original"],
      targets: ["math.multiplication.equal_groups"],
    },
    academicTheory: {
      theoryId: "theory:original", revision: 1,
      hypothesis: "Equal groups are developing.",
      supportCriteria: ["external work supports it"], reviseCriteria: ["mixed"], falsifyCriteria: ["contradicted"],
    },
    engagementTheory: null,
    nodes: [],
    academicPredictions: [{
      predictionId: "prediction:original", theoryId: "theory:original",
      constructId: "math.multiplication.equal_groups", context: "returned schoolwork", horizon: "within_7_days",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: ["operation_selection"], confidence: 0.6,
      evidenceIds: ["assignment:original"], intervention: "equal-groups instruction",
      evidenceLimit: "calibrated_mastery", createdAt: "2026-07-18T12:00:00.000Z", lockedAt: "2026-07-18T12:00:00.000Z",
    }],
    assumptions: [{
      assumptionId: "assumption:equal-groups",
      claim: "Equal-groups representation will transfer to returned work.",
      evidenceIds: ["assignment:original"], confidence: 0.6, uncertainty: "No returned work yet.",
      createdAt: "2026-07-18T12:00:00.000Z", lockedAt: "2026-07-18T12:00:00.000Z",
    }],
  }, { rootDir });
}

describe("returned work pipeline", () => {
  it("does not call cross-construct prediction errors an improvement trend", () => {
    expect(summarizePredictionCalibration([
      { construct: "math.fractions.partitioning", error: "60%" },
      { construct: "math.multiplication.equal_groups", error: "10%" },
    ])).toMatchObject({
      generalAccuracyClaimPermitted: false,
      message: "No construct has enough calibrated predictions to show a comparable trend.",
    });
  });
  it("lists assignment cards from canonical cycles", () => {
    const rootDir = root();
    seed(rootDir);
    expect(listReturnedWorkAssignments("reina", { rootDir })).toEqual([expect.objectContaining({
      homeworkId: "hw-original",
      title: "Pashley multiplication",
    })]);
  });

  it("keeps extraction pending until a parent confirms the exact original assignment", async () => {
    const rootDir = root();
    seed(rootDir);
    const draft = await createReturnedWorkDraft({
      childId: "reina", homeworkId: "hw-original", filename: "marked-copy.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("different marked file").toString("base64"),
    }, {
      rootDir,
      now: new Date("2026-07-24T12:00:00.000Z"),
      extract: async () => ({
        score: { earned: 1, possible: 2 },
        items: [{
          itemId: "item-1", prompt: "4 groups of 5", childResponse: "20", correct: true,
          extractionConfidence: 0.98,
          constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 0.95 }],
        }, {
          itemId: "item-2", prompt: "3 rows of 10", childResponse: "13", correct: false,
          observedErrorType: "operation_selection", extractionConfidence: 0.72,
          constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 0.9 }],
        }],
      }),
    });

    expect(draft.source.assignmentLink).toMatchObject({ homeworkId: "hw-original", method: "explicit_selection" });
    expect(draft.source.fileFingerprint).not.toBe("original-unmarked-hash");
    expect(draft.requiresConfirmation).toBe(true);
    expect(getLearningCycle("reina", "hw-original", { rootDir })?.observations).toHaveLength(0);
  });

  it("confirmation writes facts and one interpretation while duplicate confirmation is idempotent", async () => {
    const rootDir = root();
    seed(rootDir);
    const draft = await createReturnedWorkDraft({
      childId: "reina", homeworkId: "hw-original", filename: "marked-copy.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("different marked file").toString("base64"),
    }, {
      rootDir,
      extract: async () => ({
        score: { earned: 1, possible: 1 },
        items: [{
          itemId: "item-1", prompt: "4 groups of 5", childResponse: "20", correct: true,
          extractionConfidence: 0.98,
          constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 0.95 }],
        }],
      }),
    });
    const interpret = async (cycle: NonNullable<ReturnType<typeof getLearningCycle>>) => ({
      status: "supported" as const,
      reason: "The external result matched the predicted range.",
      nextAction: "Preserve equal-groups representation and test transfer.",
      evidenceIds: cycle.observations.map((observation) => observation.observationId),
      predictionEvaluationIds: cycle.predictionEvaluations.map((evaluation) => evaluation.evaluationId),
      preserve: ["equal-groups representation"], change: [], testNext: ["unseen transfer"],
      nextEvidenceRequired: ["delayed unassisted item"],
    });
    const first = await confirmReturnedWorkDraft({ childId: "reina", homeworkId: "hw-original", sourceId: draft.source.sourceId }, { rootDir, interpret });
    const second = await confirmReturnedWorkDraft({ childId: "reina", homeworkId: "hw-original", sourceId: draft.source.sourceId }, { rootDir, interpret });
    const cycle = getLearningCycle("reina", "hw-original", { rootDir });

    expect(first.interpretationStatus).toBe("interpreted");
    expect(second.interpretationStatus).toBe("already_interpreted");
    expect(cycle?.evidenceSources).toHaveLength(1);
    expect(cycle?.decisionHistory.filter((decision) => decision.eventType === "theory_decided")).toHaveLength(1);
  });

  it("can resume extraction after a provider failure without losing the immutable upload", async () => {
    const rootDir = root();
    seed(rootDir);
    const input = {
      childId: "reina", homeworkId: "hw-original", filename: "marked-copy.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("same marked file").toString("base64"),
    };
    await expect(createReturnedWorkDraft(input, {
      rootDir,
      extract: async () => { throw new Error("provider_overloaded"); },
    })).rejects.toThrow("provider_overloaded");

    const resumed = await createReturnedWorkDraft(input, {
      rootDir,
      extract: async () => ({
        items: [{
          itemId: "item-1", prompt: "4 groups of 5", childResponse: "20", correct: true,
          extractionConfidence: 1,
          constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 1 }],
        }],
      }),
    });
    expect(resumed.source.status).toBe("pending_confirmation");
  });

  it("normalizes a provider's markedItems wrapper into canonical returned-work items", async () => {
    const rootDir = root();
    seed(rootDir);
    const client = {
      messages: {
        create: async () => ({
          content: [{
            type: "tool_use",
            name: "extract_returned_graded_work",
            input: {
              score: { earned: 1, possible: 1 },
              markedItems: [{
                itemNumber: 1,
                prompt: "Partition one whole into thirds",
                studentResponse: "three equal parts",
                mark: "CORRECT",
                primaryConstructId: "math.multiplication.equal_groups",
                extractionConfidence: "high",
              }],
            },
          }],
        }),
      },
    };

    const draft = await createReturnedWorkDraft({
      childId: "reina", homeworkId: "hw-original", filename: "marked-copy.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("marked wrapper variant").toString("base64"),
    }, { rootDir, client: client as never });

    expect(draft.items).toEqual([expect.objectContaining({
      itemId: "item-1",
      childResponse: "three equal parts",
      correct: true,
      extractionConfidence: 0.9,
      constructLinks: [expect.objectContaining({ constructId: "math.multiplication.equal_groups", role: "primary" })],
    })]);
  });

  it("derives a read-only assignment report from the confirmed canonical cycle", async () => {
    const rootDir = root();
    seed(rootDir);
    const draft = await createReturnedWorkDraft({
      childId: "reina", homeworkId: "hw-original", filename: "marked.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("marked report").toString("base64"),
    }, {
      rootDir,
      extract: async () => ({ items: [{
        itemId: "item-1", prompt: "4 groups of 5", childResponse: "20", correct: true, extractionConfidence: 1,
        assistanceStatus: "unassisted",
        constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 1 }],
      }] }),
    });
    await confirmReturnedWorkDraft({ childId: "reina", homeworkId: "hw-original", sourceId: draft.source.sourceId }, {
      rootDir,
      interpret: async (cycle) => ({
        status: "revised", reason: "Returned work changed the original belief.", nextAction: "Test delayed transfer.",
        evidenceIds: cycle.observations.map((item) => item.observationId),
        predictionEvaluationIds: cycle.predictionEvaluations.map((item) => item.evaluationId),
        preserve: ["equal groups"], change: ["add delayed transfer"], testNext: ["unseen array"], nextEvidenceRequired: ["delayed work"],
        readinessAssessment: {
          status: "ready_independent", scope: { homeworkId: "hw-original", assignmentTitle: "Pashley multiplication", constructIds: ["math.multiplication.equal_groups"] },
          reason: "Confirmed returned work supports independent readiness for equal groups.",
          evidenceIds: cycle.observations.map((item) => item.observationId),
          predictionEvaluationIds: cycle.predictionEvaluations.map((item) => item.evaluationId),
          uncertainty: "Limited to the returned assignment.", nextAction: "Complete this assignment independently.",
        },
        assumptionAssessments: [{
          assumptionId: "assumption:equal-groups", outcome: "rejected", reason: "The prediction did not match.",
          observationIds: cycle.observations.map((item) => item.observationId),
        }],
      }),
    });
    const before = JSON.stringify(getLearningCycle("reina", "hw-original", { rootDir }));

    const report = getAssignmentLearningReport("reina", "hw-original", { rootDir });

    expect(report.status).toBe("interpreted");
    expect(report.latestDecision).toMatchObject({ status: "revised", preserve: ["equal groups"], change: ["add delayed transfer"] });
    expect(report.readiness).toMatchObject({
      status: "ready_independent",
      headline: "Sunny believes Reina can complete Pashley multiplication independently.",
      constructIds: ["math.multiplication.equal_groups"],
    });
    expect(report.assumptions[0]).toMatchObject({ assessment: { outcome: "rejected" } });
    expect(report.predictions[0].evaluation?.sourceId).toBe(draft.source.sourceId);
    expect(report.predictionAccuracy).toEqual([expect.objectContaining({
      assignment: "Pashley multiplication",
      construct: "math.multiplication.equal_groups",
      prediction: "70–90%",
      actual: "100%",
      error: "10%",
      evidenceType: "graded_work",
      assistance: "unassisted",
      adjustment: "add delayed transfer",
    })]);
    expect(report.calibrationSummary).toMatchObject({
      externallyCalibratedPredictions: 1,
      generalAccuracyClaimPermitted: false,
    });
    expect(JSON.stringify(getLearningCycle("reina", "hw-original", { rootDir }))).toBe(before);
  });

  it("reports pending interpretation honestly without inventing a decision", async () => {
    const rootDir = root();
    seed(rootDir);
    const draft = await createReturnedWorkDraft({
      childId: "reina", homeworkId: "hw-original", filename: "marked.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("pending report").toString("base64"),
    }, {
      rootDir,
      extract: async () => ({ items: [{
        itemId: "item-1", prompt: "4 groups of 5", correct: true, extractionConfidence: 1,
        constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 1 }],
      }] }),
    });
    await confirmReturnedWorkDraft({ childId: "reina", homeworkId: "hw-original", sourceId: draft.source.sourceId }, {
      rootDir,
      interpret: async () => { throw new Error("provider_unavailable"); },
    });

    const report = getAssignmentLearningReport("reina", "hw-original", { rootDir });
    expect(report.status).toBe("awaiting_interpretation");
    expect(report.latestDecision).toBeNull();
  });

  it("does not combine a newer returned-work source with an older readiness decision", async () => {
    const rootDir = root();
    seed(rootDir);
    const first = await createReturnedWorkDraft({
      childId: "reina", homeworkId: "hw-original", filename: "first.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("first marked work").toString("base64"),
    }, { rootDir, now: new Date("2026-08-08T10:00:00.000Z"), extract: async () => ({ items: [{
      itemId: "first", prompt: "4 groups of 5", correct: true, extractionConfidence: 1, assistanceStatus: "unassisted",
      constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 1 }],
    }] }) });
    await confirmReturnedWorkDraft({ childId: "reina", homeworkId: "hw-original", sourceId: first.source.sourceId }, {
      rootDir,
      interpret: async (cycle) => ({
        status: "supported", reason: "First work supports readiness.", nextAction: "complete", progressionAction: "complete",
        evidenceIds: cycle.observations.filter((item) => item.sourceId === first.source.sourceId).map((item) => item.observationId),
        predictionEvaluationIds: cycle.predictionEvaluations.filter((item) => item.sourceId === first.source.sourceId).map((item) => item.evaluationId),
        preserve: [], change: [], testNext: [], nextEvidenceRequired: [],
        readinessAssessment: {
          status: "ready_independent", scope: { homeworkId: "hw-original", assignmentTitle: "Pashley multiplication", constructIds: ["math.multiplication.equal_groups"] },
          reason: "First work was independently correct.",
          evidenceIds: cycle.observations.filter((item) => item.sourceId === first.source.sourceId).map((item) => item.observationId),
          predictionEvaluationIds: cycle.predictionEvaluations.filter((item) => item.sourceId === first.source.sourceId).map((item) => item.evaluationId),
          uncertainty: "Only the first return is interpreted.", nextAction: "Complete independently.",
        },
      }),
    });
    const second = await createReturnedWorkDraft({
      childId: "reina", homeworkId: "hw-original", filename: "second.pdf",
      mimeType: "application/pdf", dataBase64: Buffer.from("second marked work").toString("base64"),
    }, { rootDir, now: new Date("2026-08-08T11:00:00.000Z"), extract: async () => ({ items: [{
      itemId: "second", prompt: "5 groups of 5", correct: false, extractionConfidence: 1, assistanceStatus: "unassisted",
      constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 1 }],
    }] }) });
    await confirmReturnedWorkDraft({ childId: "reina", homeworkId: "hw-original", sourceId: second.source.sourceId }, {
      rootDir,
      interpret: async () => { throw new Error("provider_unavailable"); },
    });

    const report = getAssignmentLearningReport("reina", "hw-original", { rootDir });
    expect(report.status).toBe("awaiting_interpretation");
    expect(report.latestDecision).toBeNull();
    expect(report.readiness).toBeNull();
  });
});
