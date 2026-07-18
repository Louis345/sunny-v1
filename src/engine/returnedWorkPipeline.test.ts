import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLearningCycle, getLearningCycle } from "./learningCycleRepository";
import {
  confirmReturnedWorkDraft,
  createReturnedWorkDraft,
  listReturnedWorkAssignments,
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
  }, { rootDir });
}

describe("returned work pipeline", () => {
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
});
