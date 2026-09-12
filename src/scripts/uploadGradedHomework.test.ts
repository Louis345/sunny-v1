import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLearningCycle, getLearningCycle } from "../engine/learningCycleRepository";
import { runUploadGradedHomework, selectHomeworkMatch, type HomeworkMatchCandidate } from "./uploadGradedHomework";

function candidate(homeworkId: string, confidence: number): HomeworkMatchCandidate {
  return {
    homeworkId,
    title: homeworkId,
    confidence,
    evidence: ["content overlap"],
    cycle: { homeworkId } as never,
  };
}

describe("returned-work assignment linking", () => {
  it("uses the parent-selected assignment even when fuzzy matching prefers another cycle", () => {
    const selected = selectHomeworkMatch([
      candidate("hw-wrong", 0.98),
      candidate("hw-selected", 0.12),
    ], "hw-selected");
    expect(selected).toMatchObject({ homeworkId: "hw-selected" });
  });

  it("refuses an explicit assignment identity that is not present in the child chart", () => {
    expect(() => selectHomeworkMatch([candidate("hw-one", 0.9)], "hw-missing"))
      .toThrow("returned_work_selected_assignment_missing:hw-missing");
  });

  it("routes a confirmed generic upload into the canonical evidence loop", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-canonical-"));
    createLearningCycle({
      childId: "reina", homeworkId: "hw-selected", domain: "math",
      assignment: { title: "Multiplication", contentFingerprint: "original", capturedEvidenceIds: ["source:assignment"], targets: ["math.multiplication.equal_groups"] },
      academicTheory: { theoryId: "theory:one", revision: 1, hypothesis: "Equal groups are developing.", supportCriteria: ["external result"], reviseCriteria: ["mixed"], falsifyCriteria: ["contradiction"] },
      engagementTheory: null,
      nodes: [],
      academicPredictions: [{
        predictionId: "prediction:one", theoryId: "theory:one", constructId: "math.multiplication.equal_groups",
        context: "returned work", horizon: "one week", expectedMetric: { key: "academic.accuracy", min: 0.6, max: 0.9 },
        predictedErrorPatterns: [], confidence: 0.5, evidenceIds: ["source:assignment"], intervention: "equal groups",
        evidenceLimit: "calibrated_mastery", createdAt: "2026-07-18T12:00:00.000Z",
        lockedAt: "2026-07-18T12:00:00.000Z",
        eligibility: { sources: ["graded_work"], maxDelayDays: 365 },
      }],
    }, { rootDir });
    const uploadFile = path.join(rootDir, "marked.json");
    fs.writeFileSync(uploadFile, JSON.stringify({
      title: "Multiplication", score: 1,
      gradedItems: [{ target: "math.multiplication.equal_groups", correct: true }],
    }), "utf8");

    await runUploadGradedHomework([
      "--child=reina", `--pdf=${uploadFile}`, "--homework=hw-selected", "--yes",
    ], {
      rootDir,
      logger: { log: () => undefined },
      interpret: async (cycle) => ({
        status: "supported", reason: "Matched", nextAction: "Preserve and test transfer",
        evidenceIds: cycle.observations.map((item) => item.observationId),
        predictionEvaluationIds: cycle.predictionEvaluations.map((item) => item.evaluationId),
        preserve: ["equal groups"], change: [], testNext: ["transfer"], nextEvidenceRequired: ["delayed item"],
      }),
    });

    const cycle = getLearningCycle("reina", "hw-selected", { rootDir });
    expect(cycle?.evidenceSources).toHaveLength(1);
    expect(cycle?.decisionHistory.filter((decision) => decision.eventType === "theory_decided")).toHaveLength(1);
  });
});
