import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createLearningCycle, getLearningCycle } from "./learningCycleRepository";
import {
  buildLongitudinalLearningHistory,
  evaluateAcademicPredictions,
  interpretReturnedWorkBatch,
  recordConfirmedReturnedWork,
  type ConfirmedReturnedWork,
} from "./longitudinalLearning";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-longitudinal-"));
}

function cycleInput(homeworkId: string) {
  return {
    childId: "reina",
    homeworkId,
    domain: "math",
    assignment: {
      title: "Equal groups",
      contentFingerprint: `fingerprint:${homeworkId}`,
      capturedEvidenceIds: [`assignment:${homeworkId}`],
      targets: ["math.multiplication.equal_groups"],
    },
    academicTheory: {
      theoryId: `${homeworkId}:theory`,
      revision: 1,
      hypothesis: "Reina can construct equal groups but may confuse the operation in words.",
      supportCriteria: ["External equal-groups accuracy is at least 70%."],
      reviseCriteria: ["Accuracy is mixed across representations."],
      falsifyCriteria: ["External work shows repeated operation-selection errors."],
    },
    engagementTheory: null,
    nodes: [{
      nodeId: `${homeworkId}:practice`,
      role: "baseline" as const,
      title: "Array Lab",
      state: "ready" as const,
      academicTarget: { domain: "math", skill: "equal groups", targets: ["5 groups of 4"] },
      algorithmOwner: "ai_tutor",
      theoryId: `${homeworkId}:theory`,
      experimentId: `${homeworkId}:experiment`,
      mechanic: "visual construction",
      theme: "generated",
      openingScreen: { title: "Array Lab", purpose: "Build equal groups." },
      generationPrompt: null,
      prediction: {
        claim: "Reina will solve 70–90% of unassisted equal-groups items within seven days.",
        createdAt: "2026-07-18T12:00:00.000Z",
        evidenceLimit: "practice_only" as const,
      },
      artifactBinding: null,
      artwork: { status: "placeholder" as const, localPath: null, prompt: null },
      sfxContract: [],
      companionContract: { events: [] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true },
      evidenceIds: [],
    }],
    academicPredictions: [{
      predictionId: `${homeworkId}:prediction:equal-groups`,
      theoryId: `${homeworkId}:theory`,
      constructId: "math.multiplication.equal_groups",
      context: "Unassisted returned schoolwork",
      horizon: "within_7_days",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
      predictedErrorPatterns: ["operation_selection"],
      confidence: 0.65,
      evidenceIds: [`assignment:${homeworkId}`],
      intervention: "Visual equal-groups construction followed by notation matching.",
      evidenceLimit: "calibrated_mastery" as const,
      createdAt: "2026-07-18T12:00:00.000Z",
      lockedAt: "2026-07-18T12:00:00.000Z",
    }],
  };
}

function returnedWork(homeworkId: string): ConfirmedReturnedWork {
  return {
    childId: "reina",
    homeworkId,
    source: {
      sourceId: "source:return:1",
      type: "graded_work",
      fileFingerprint: "returned-file-fingerprint",
      sourceFile: "returned-equal-groups.pdf",
      provenance: "caregiver",
      capturedAt: "2026-07-24T12:00:00.000Z",
      assignmentLink: { homeworkId, method: "explicit_selection", confidence: 1, confirmedBy: "caregiver" },
      status: "confirmed",
    },
    score: { earned: 2, possible: 3 },
    items: [
      {
        itemId: "returned:item:1",
        prompt: "4 boxes with 5 pencils each",
        childResponse: "20",
        correct: true,
        extractionConfidence: 0.99,
        constructLinks: [
          { constructId: "math.multiplication.equal_groups", role: "primary", confidence: 0.98 },
          { constructId: "math.word_problems.operation_selection", role: "secondary", confidence: 0.82 },
        ],
      },
      {
        itemId: "returned:item:2",
        prompt: "3 rows of 10",
        childResponse: "13",
        correct: false,
        teacherNote: "Added instead of multiplied",
        observedErrorType: "operation_selection",
        extractionConfidence: 0.97,
        constructLinks: [
          { constructId: "math.multiplication.equal_groups", role: "primary", confidence: 0.97 },
        ],
      },
    ],
  };
}

describe("longitudinal learning evidence", () => {
  it("maps one returned item to multiple constructs and several items to one prediction", () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });

    const updated = recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });

    expect(updated.observations).toHaveLength(2);
    expect(updated.observations?.[0]?.constructLinks).toHaveLength(2);
    expect(updated.predictionEvaluations).toHaveLength(1);
    expect(updated.predictionEvaluations?.[0]).toMatchObject({
      predictionId: "hw-math-one:prediction:equal-groups",
      observedMetric: 0.5,
      sufficiency: "sufficient",
    });
  });

  it("evaluates factual prediction error without making a theory decision", () => {
    const prediction = cycleInput("hw-math-one").academicPredictions[0]!;
    const observations = recordConfirmedReturnedWork;
    expect(typeof observations).toBe("function");
    const evaluations = evaluateAcademicPredictions([prediction], [{
      observationId: "obs:1",
      sourceId: "source:1",
      itemId: "item:1",
      constructLinks: [{ constructId: prediction.constructId, role: "primary", confidence: 1 }],
      result: { correct: true, score: 1 },
      assistance: { status: "unassisted", scaffolds: [] },
      exposure: "unseen",
      provenance: "graded_work",
      observedAt: "2026-07-24T12:00:00.000Z",
      confounds: [],
    }]);
    expect(evaluations[0]).toMatchObject({ observedMetric: 1, predictionError: 0.1 });
    expect(evaluations[0]).not.toHaveProperty("theoryStatus");
  });

  it("derives cross-cycle history from canonical cycles without writing another factsheet", () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    createLearningCycle(cycleInput("hw-math-two"), { rootDir });

    const before = fs.readdirSync(path.join(rootDir, "src/context/reina/homework/cycles"));
    const history = buildLongitudinalLearningHistory("reina", { rootDir });
    const after = fs.readdirSync(path.join(rootDir, "src/context/reina/homework/cycles"));

    expect(history.constructs["math.multiplication.equal_groups"]?.observations).toHaveLength(2);
    expect(history.constructs["math.multiplication.equal_groups"]?.predictions).toHaveLength(2);
    expect(after).toEqual(before);
    expect(fs.existsSync(path.join(rootDir, "src/context/reina/learning_history.json"))).toBe(false);
    expect(getLearningCycle("reina", "hw-math-one", { rootDir })?.homeworkId).toBe("hw-math-one");
  });

  it("records duplicate returned files once and writes exactly one separate theory decision", async () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const first = recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    const duplicate = recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    expect(duplicate.revision).toBe(first.revision);
    const evidenceIds = first.observations.map((observation) => observation.observationId);
    const evaluationIds = first.predictionEvaluations.map((evaluation) => evaluation.evaluationId);

    const interpreted = await interpretReturnedWorkBatch({
      childId: "reina",
      homeworkId: "hw-math-one",
      sourceId: "source:return:1",
      rootDir,
      interpret: async () => ({
        status: "revised",
        reason: "The returned work showed an operation-selection error despite correct construction.",
        nextAction: "Preserve visual grouping and test operation selection with unseen wording.",
        evidenceIds,
        predictionEvaluationIds: evaluationIds,
        preserve: ["visual equal groups"],
        change: ["word-problem operation selection support"],
        testNext: ["unseen equal-groups story problem"],
        nextEvidenceRequired: ["delayed unassisted word problem"],
        revisedHypothesis: "Reina understands equal groups visually but transfer to operation selection remains uncertain.",
      }),
    });
    const repeated = await interpretReturnedWorkBatch({
      childId: "reina",
      homeworkId: "hw-math-one",
      sourceId: "source:return:1",
      rootDir,
      interpret: async () => { throw new Error("must not run"); },
    });

    expect(interpreted.applied).toBe(true);
    expect(interpreted.cycle.decisionHistory.filter((decision) => decision.eventType === "theory_decided")).toHaveLength(1);
    expect(repeated).toMatchObject({ applied: false, reason: "already_interpreted" });
  });

  it("keeps confirmed evidence pending when the Planner interpretation provider fails", async () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    await expect(interpretReturnedWorkBatch({
      childId: "reina",
      homeworkId: "hw-math-one",
      sourceId: "source:return:1",
      rootDir,
      interpret: async () => { throw new Error("provider_overloaded"); },
    })).rejects.toThrow("provider_overloaded");
    const history = buildLongitudinalLearningHistory("reina", { rootDir });
    expect(history.pendingInterpretation).toEqual([{
      homeworkId: "hw-math-one",
      sourceId: "source:return:1",
      evaluationIds: expect.any(Array),
    }]);
    expect(getLearningCycle("reina", "hw-math-one", { rootDir })?.lifecycle).toBe("baseline_ready");
  });

  it("records a supported theory decision without silently completing or changing the board", async () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const factual = recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    const interpreted = await interpretReturnedWorkBatch({
      childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:1", rootDir,
      interpret: async () => ({
        status: "supported", reason: "The result matched the prediction.", nextAction: "Preserve and test later.",
        evidenceIds: factual.observations.map((item) => item.observationId),
        predictionEvaluationIds: factual.predictionEvaluations.map((item) => item.evaluationId),
        preserve: ["equal groups"], change: [], testNext: ["delayed transfer"], nextEvidenceRequired: ["delayed work"],
      }),
    });
    expect(interpreted.cycle.lifecycle).toBe("baseline_ready");
    expect(interpreted.cycle.nodes).toEqual(factual.nodes);
  });

  it("does not let one unreadable historical cycle block the current child chart", () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    fs.writeFileSync(
      path.join(rootDir, "src/context/reina/homework/cycles/hw-corrupt.json"),
      JSON.stringify({ schemaVersion: 2, childId: "reina", homeworkId: "hw-corrupt" }),
      "utf8",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const history = buildLongitudinalLearningHistory("reina", { rootDir });
    expect(history.constructs["math.multiplication.equal_groups"]?.predictions).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[longitudinal-history] [cycle-skip]"));
    warn.mockRestore();
  });
});
