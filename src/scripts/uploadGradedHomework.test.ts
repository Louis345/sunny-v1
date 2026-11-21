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

  // Owner 2026-11-15: two references, never mixed. The school test is one; the other is whether she can do the work
  // at home with no one helping (Ila's Lesson 1.2 rounding reteach sheet). A parent records how much help she had.
  function mathCycle(rootDir: string) {
    createLearningCycle({
      childId: "ila", homeworkId: "hw-rounding", domain: "math",
      assignment: { title: "Chapter 1 Reteach", contentFingerprint: "original", capturedEvidenceIds: ["source:assignment"], targets: ["math.rounding"] },
      academicTheory: { theoryId: "theory:one", revision: 1, hypothesis: "Rounding is developing.", supportCriteria: ["external result"], reviseCriteria: ["mixed"], falsifyCriteria: ["contradiction"] },
      engagementTheory: null, nodes: [],
      academicPredictions: [{
        predictionId: "prediction:school", theoryId: "theory:one", constructId: "math.rounding",
        context: "school test", horizon: "one week", expectedMetric: { key: "academic.accuracy", min: 0.6, max: 0.9 },
        predictedErrorPatterns: [], confidence: 0.5, evidenceIds: ["source:assignment"], intervention: "rounding",
        evidenceLimit: "calibrated_mastery", createdAt: "2026-11-10T12:00:00.000Z", lockedAt: "2026-11-10T12:00:00.000Z",
        eligibility: { sources: ["graded_work"], maxDelayDays: 365 },
      }],
    }, { rootDir });
    const uploadFile = path.join(rootDir, "reteach.json");
    fs.writeFileSync(uploadFile, JSON.stringify({
      title: "Lesson 1.2 Reteach", testDate: "2026-11-15",
      gradedItems: [{ target: "Round 24 to the nearest ten", wrote: "20", correct: true }, { target: "Round 395 to the nearest hundred", wrote: "300", correct: false }],
    }), "utf8");
    return uploadFile;
  }
  const quiet = { log: () => undefined };
  const interpret = async () => { throw new Error("planner_not_called_in_test"); };

  it("saves a home check done alone as a later check, not a school test, with every item marked done on her own", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-home-check-"));
    const uploadFile = mathCycle(rootDir);
    await runUploadGradedHomework(["--child=ila", `--pdf=${uploadFile}`, "--homework=hw-rounding", "--yes", "--kind=home-check", "--help=alone"],
      { rootDir, logger: quiet, interpret });
    const cycle = getLearningCycle("ila", "hw-rounding", { rootDir })!;
    expect(cycle.evidenceSources.map((source) => source.type)).toEqual(["delayed_reassessment"]);
    expect(cycle.observations).toHaveLength(2);
    for (const row of cycle.observations) {
      expect(row.provenance).toBe("delayed_reassessment");
      expect(row.assistance).toEqual({ status: "unassisted", scaffolds: [] });
    }
    // The school-test prediction is not scored by a home check.
    expect(cycle.predictionEvaluations).toEqual([]);
  });

  // 2026-11-16: the Planner calls each concept's chance on paper; the parent tags each paper item with its concept so
  // code can score that call. An untagged item keeps exactly its old links.
  it("links each paper item to the concept the parent tagged, so the Planner's ready-on-paper calls can be scored", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-concept-"));
    const uploadFile = mathCycle(rootDir);
    const body = JSON.parse(fs.readFileSync(uploadFile, "utf8"));
    body.gradedItems[0].concept = "Rounding to tens";
    fs.writeFileSync(uploadFile, JSON.stringify(body), "utf8");
    await runUploadGradedHomework(["--child=ila", `--pdf=${uploadFile}`, "--homework=hw-rounding", "--yes", "--kind=home-check", "--help=alone"],
      { rootDir, logger: quiet, interpret });
    const [tagged, untagged] = getLearningCycle("ila", "hw-rounding", { rootDir })!.observations;
    expect(tagged.constructLinks).toContainEqual({ constructId: "concept:rounding to tens", role: "secondary", confidence: 1 });
    expect(untagged.constructLinks).toHaveLength(1);
  });

  it("records some or lots of help as help, never as on her own", async () => {
    for (const [help, scaffold] of [["some", "caregiver_help_some"], ["lots", "caregiver_help_lots"]] as const) {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-home-check-help-"));
      const uploadFile = mathCycle(rootDir);
      await runUploadGradedHomework(["--child=ila", `--pdf=${uploadFile}`, "--homework=hw-rounding", "--yes", "--kind=home-check", `--help=${help}`],
        { rootDir, logger: quiet, interpret });
      const cycle = getLearningCycle("ila", "hw-rounding", { rootDir })!;
      expect(cycle.observations.map((row) => row.assistance)).toEqual([
        { status: "assisted", scaffolds: [scaffold] }, { status: "assisted", scaffolds: [scaffold] }]);
    }
  });

  it("refuses a home check without the help answer, and saves nothing", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-home-check-missing-"));
    const uploadFile = mathCycle(rootDir);
    await expect(runUploadGradedHomework(["--child=ila", `--pdf=${uploadFile}`, "--homework=hw-rounding", "--yes", "--kind=home-check"],
      { rootDir, logger: quiet, interpret })).rejects.toThrow("home_check_needs_help:alone|some|lots");
    await expect(runUploadGradedHomework(["--child=ila", `--pdf=${uploadFile}`, "--homework=hw-rounding", "--yes", "--kind=quiz", "--help=alone"],
      { rootDir, logger: quiet, interpret })).rejects.toThrow("upload_kind_unknown:quiz");
    expect(getLearningCycle("ila", "hw-rounding", { rootDir })!.observations).toEqual([]);
  });

  it("keeps a school test upload exactly as before when no kind is given", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-upload-school-default-"));
    const uploadFile = mathCycle(rootDir);
    await runUploadGradedHomework(["--child=ila", `--pdf=${uploadFile}`, "--homework=hw-rounding", "--yes"], { rootDir, logger: quiet, interpret });
    const cycle = getLearningCycle("ila", "hw-rounding", { rootDir })!;
    expect(cycle.evidenceSources.map((source) => source.type)).toEqual(["graded_work"]);
    expect(cycle.observations.every((row) => row.provenance === "graded_work" && row.assistance.status === "unknown")).toBe(true);
  });
});
