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

it("cannot call a prediction supported when returned work produces no eligible evaluation", async () => {
  const rootDir = root(), homeworkId = "unmatched-return";
  const input = cycleInput(homeworkId);
  input.academicPredictions = [];
  createLearningCycle(input, { rootDir });
  const work = returnedWork(homeworkId);
  const cycle = recordConfirmedReturnedWork(work, { rootDir });
  await expect(interpretReturnedWorkBatch({ childId: input.childId, homeworkId, sourceId: work.source.sourceId, rootDir, interpret: async () => ({ status: "supported", reason: "Good score", nextAction: "Finished", evidenceIds: cycle.observations.map(row => row.observationId), predictionEvaluationIds: [], preserve: [], change: [], testNext: [], nextEvidenceRequired: [] }) })).rejects.toThrow("longitudinal_prediction_evaluation_required");
  expect(getLearningCycle(input.childId, homeworkId, { rootDir })!.observations).toHaveLength(work.items.length);
});

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
      eligibility: {sources:["graded_work", "delayed_reassessment"] as Array<"graded_work" | "delayed_reassessment">,maxDelayDays:7},
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

  it("requires the Planner tool to assess every locked assumption", async () => {
    const rootDir = root();
    createLearningCycle({
      ...cycleInput("hw-math-one"),
      assumptions: [{
        assumptionId: "assumption:equal-groups",
        claim: "Equal-groups transfer is secure.",
        evidenceIds: ["assignment:hw-math-one"],
        confidence: 0.6,
        uncertainty: "No returned work yet.",
        createdAt: "2026-07-18T12:00:00.000Z",
        lockedAt: "2026-07-18T12:00:00.000Z",
      }],
    }, { rootDir });
    const factual = recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    const create = vi.fn(async () => ({
      content: [{
        type: "tool_use",
        name: "record_longitudinal_theory_decision",
        input: {
          status: "revised",
          reason: "Returned work contradicted secure transfer.",
          nextAction: "Provide support and retest.",
          evidenceIds: factual.observations.map((item) => item.observationId),
          predictionEvaluationIds: factual.predictionEvaluations.map((item) => item.evaluationId),
          preserve: [], change: ["transfer support"], testNext: ["unseen transfer"],
          nextEvidenceRequired: ["delayed work"],
          assumptionAssessments: [{
            assumptionId: "assumption:equal-groups",
            outcome: "rejected",
            reason: "The returned item showed an operation-selection error.",
            observationIds: factual.observations.map((item) => item.observationId),
          }],
        },
      }],
    }));

    await interpretReturnedWorkBatch({
      childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:1", rootDir,
      client: { messages: { create } } as never,
    });

    const request = (create.mock.calls as unknown as Array<[any]>)[0]?.[0];
    expect(request.max_tokens).toBeGreaterThanOrEqual(4000);
    expect(request.tools[0].input_schema.required).toContain("assumptionAssessments");
    expect(request.tools[0].input_schema.properties.assumptionAssessments.items.required).toEqual([
      "assumptionId", "outcome", "reason", "observationIds",
    ]);
  });

  it("closes an awaiting-calibration cycle after returned work receives one theory decision", async () => {
    const rootDir = root();
    const created = createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const cycleFile = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-one.json");
    fs.writeFileSync(cycleFile, JSON.stringify({ ...created, lifecycle: "awaiting_calibration" }), "utf8");
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
    expect(interpreted.cycle.lifecycle).toBe("complete");
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


describe("prediction measurement boundaries", () => {
  const prediction = cycleInput("temporal").academicPredictions[0]!;
  const observation = (id: string, sourceId: string, observedAt: string) => ({
    observationId: id, sourceId, itemId: id,
    constructLinks: [{ constructId: prediction.constructId, role: "primary" as const, confidence: 1 }],
    result: { correct: true }, assistance: { status: "unassisted" as const, scaffolds: [] },
    exposure: "unseen" as const, provenance: "independent_probe" as const, observedAt, confounds: [],
  });
  it("does not evaluate a later prediction using earlier Discovery", () => {
    expect(evaluateAcademicPredictions([prediction], [observation("before", "evaluation:discovery", "2026-07-18T11:00:00Z")])).toEqual([]);
  });
  it("keeps source batches separate instead of pooling interventions", () => {
    const rows = [observation("a", "activity:session:one", "2026-07-19T12:00:00Z"), observation("b", "activity:session:two", "2026-07-20T12:00:00Z")];
    const result = evaluateAcademicPredictions([{ ...prediction, evidenceLimit: "independent_performance", eligibility: { sources: ["independent_probe"], maxDelayDays: 7 } } as never], rows);
    expect(result.map(r => r.observationIds)).toEqual([["a"], ["b"]]);
  });
  it("excludes assisted, exposed, uncaptured and out-of-window observations", () => {
    const good = observation("good", "activity:session:one", "2026-07-19T12:00:00Z");
    const rows = [good, { ...good, observationId: "help", assistance: { status: "assisted" as const, scaffolds: ["hint"] } }, { ...good, observationId: "repeat", exposure: "previously_practiced" as const }, { ...good, observationId: "missing", result: { observedErrorType: "response_not_captured" } }, { ...good, observationId: "late", observedAt: "2026-08-19T12:00:00Z" }];
    const result = evaluateAcademicPredictions([{ ...prediction, eligibility: { sources: ["independent_probe"], maxDelayDays: 7 } } as never], rows);
    expect(result[0]?.observationIds).toEqual(["good"]);
  });
});

it("does not invent legacy source eligibility from a horizon label", () => {
  const {eligibility: _eligibility, ...prediction} = cycleInput("legacy").academicPredictions[0];
  const observation = {observationId:"later",sourceId:"graded",itemId:"one",constructLinks:[{constructId:prediction.constructId,role:"primary",confidence:1}],result:{correct:true},assistance:{status:"unknown",scaffolds:[]},exposure:"unknown",provenance:"graded_work",observedAt:"2026-07-19T12:00:00Z",confounds:[]} as const;
  expect(evaluateAcademicPredictions([prediction], [observation as never])[0]?.sufficiency).toBe("insufficient");
});
