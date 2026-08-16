import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createLearningCycle,
  getLearningCycle,
  markCanonicalCompanionSupportResumed,
  recordCanonicalCompanionSupport,
} from "./learningCycleRepository";
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
        assistanceStatus: "unassisted",
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
        assistanceStatus: "unassisted",
        extractionConfidence: 0.97,
        constructLinks: [
          { constructId: "math.multiplication.equal_groups", role: "primary", confidence: 0.97 },
        ],
      },
    ],
  };
}

describe("longitudinal learning evidence", () => {
  it.each([
    { readiness: "ready_independent", action: "complete", expectedLifecycle: "complete", expectedRole: undefined },
    { readiness: "not_yet_ready", action: "generate_support", expectedLifecycle: "baseline_generating", expectedRole: "support" },
    { readiness: "insufficient_evidence", action: "collect_more_evidence", expectedLifecycle: "baseline_generating", expectedRole: "reassessment" },
  ] as const)("continues one assignment with $action when readiness is $readiness", async ({ readiness, action, expectedLifecycle, expectedRole }) => {
    const rootDir = root();
    const created = createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const file = path.join(rootDir, "src/context/reina/homework/cycles/hw-math-one.json");
    fs.writeFileSync(file, JSON.stringify({ ...created, lifecycle: "awaiting_calibration" }), "utf8");
    const factual = recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    const evidenceIds = factual.observations.map((item) => item.observationId);
    const predictionEvaluationIds = factual.predictionEvaluations.map((item) => item.evaluationId);
    const interpreted = await interpretReturnedWorkBatch({
      childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:1", rootDir,
      interpret: async () => ({
        status: readiness === "ready_independent" ? "supported" : readiness === "not_yet_ready" ? "revised" : "inconclusive",
        reason: `Planner selected ${action} from returned work.`, nextAction: action,
        evidenceIds, predictionEvaluationIds, preserve: [], change: [], testNext: [], nextEvidenceRequired: [],
        continuationAction: action,
        readinessAssessment: {
          status: readiness,
          scope: { homeworkId: "hw-math-one", assignmentTitle: "Equal groups", constructIds: ["math.multiplication.equal_groups"] },
          reason: `Evidence supports ${readiness}.`, evidenceIds, predictionEvaluationIds,
          uncertainty: "Bounded to this assignment.", nextAction: action,
        },
        ...(action !== "complete" ? {
          nextInstrument: {
            nodeId: action === "generate_support" ? "support-equal-groups" : "reassess-equal-groups",
            title: action === "generate_support" ? "Equal Groups Workshop" : "Fresh Equal Groups Check",
            academicTarget: "math.multiplication.equal_groups",
            mechanic: "AI-selected interaction", theme: "AI-selected world",
            openingPurpose: "Address the cited returned-work evidence.", creatorPrompt: "Create the prescribed next chapter.",
          },
          nextPrediction: {
            claim: "The child will demonstrate stronger independent equal-groups reasoning on fresh material.",
            constructId: "math.multiplication.equal_groups", context: "next independent chapter", horizon: "next_session",
            expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 }, predictedErrorPatterns: ["operation_selection"],
            confidence: 0.55, evidenceLimit: "independent_performance",
          },
        } : {}),
      }),
    });

    expect(interpreted.cycle.homeworkId).toBe("hw-math-one");
    expect(interpreted.cycle.lifecycle).toBe(expectedLifecycle);
    if (expectedRole) {
      const chapter = interpreted.cycle.nodes.at(-1)!;
      expect(chapter.routeId).toBe(`adaptive-${expectedRole}`);
      expect(chapter.generationPrompt?.createdFromEvidenceIds).toEqual(evidenceIds);
      expect(chapter.predictionId).toBe(interpreted.cycle.academicPredictions.at(-1)?.predictionId);
      expect(interpreted.cycle.academicPredictions.at(-1)).toMatchObject({
        constructId: "math.multiplication.equal_groups",
        evidenceIds,
        lockedAt: expect.any(String),
      });
    }
  });

  it("interprets a second returned-work batch in the same cycle without duplicating the first decision", async () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const first = recordConfirmedReturnedWork(returnedWork("hw-math-one"), { rootDir });
    const decide = (cycle: typeof first, sourceId: string) => {
      const evidenceIds = cycle.observations.filter((item) => item.sourceId === sourceId).map((item) => item.observationId);
      const predictionEvaluationIds = cycle.predictionEvaluations.filter((item) => item.sourceId === sourceId).map((item) => item.evaluationId);
      return Promise.resolve({
        status: "inconclusive" as const, reason: "Collect another batch.", nextAction: "collect_more_evidence",
        evidenceIds, predictionEvaluationIds, preserve: [], change: [], testNext: [], nextEvidenceRequired: ["another batch"],
        continuationAction: "collect_more_evidence" as const,
        readinessAssessment: {
          status: "insufficient_evidence" as const,
          scope: { homeworkId: "hw-math-one", assignmentTitle: "Equal groups", constructIds: ["math.multiplication.equal_groups"] },
          reason: "One more batch is needed.", evidenceIds, predictionEvaluationIds,
          uncertainty: "The available batch is inconclusive.", nextAction: "Collect another batch.",
        },
        nextInstrument: { nodeId: `reassess-${sourceId.replace(/[^a-z0-9]/gi, "-")}`, title: `Fresh Check ${sourceId.at(-1)}`, academicTarget: "math.multiplication.equal_groups", mechanic: "AI-selected interaction", theme: "AI-selected world", openingPurpose: "Collect fresh evidence.", creatorPrompt: "Create a fresh reassessment." },
        nextPrediction: { claim: "Fresh evidence will resolve uncertainty.", constructId: "math.multiplication.equal_groups", context: "delayed independent reassessment", horizon: "next_session", expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 }, predictedErrorPatterns: [], confidence: 0.5, evidenceLimit: "independent_performance" as const },
      });
    };
    await interpretReturnedWorkBatch({ childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:1", rootDir, interpret: decide });
    const secondWork = returnedWork("hw-math-one");
    secondWork.source = { ...secondWork.source, sourceId: "source:return:2", fileFingerprint: "returned-file-fingerprint-2", capturedAt: "2026-07-31T12:00:00.000Z" };
    recordConfirmedReturnedWork(secondWork, { rootDir });
    const interpreted = await interpretReturnedWorkBatch({ childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:2", rootDir, interpret: decide });

    const decisions = interpreted.cycle.decisionHistory.filter((item) => item.eventType === "theory_decided");
    expect(decisions).toHaveLength(2);
    expect(new Set(decisions.flatMap((item) => item.evidenceIds)).size).toBe(4);
    expect(interpreted.cycle.evidenceSources).toHaveLength(2);
  });

  it("persists an evidence-citing independent-readiness conclusion from strong confirmed work", async () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const strong = returnedWork("hw-math-one");
    strong.items = strong.items.map((item) => ({ ...item, correct: true, observedErrorType: undefined }));
    strong.score = { earned: 2, possible: 2 };
    const factual = recordConfirmedReturnedWork(strong, { rootDir });
    const evidenceIds = factual.observations.map((item) => item.observationId);
    const predictionEvaluationIds = factual.predictionEvaluations.map((item) => item.evaluationId);

    const interpreted = await interpretReturnedWorkBatch({
      childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:1", rootDir,
      interpret: async () => ({
        status: "supported", reason: "Confirmed returned work independently demonstrated the assigned constructs.",
        nextAction: "Close this assignment and preserve the successful representation.",
        evidenceIds, predictionEvaluationIds, preserve: ["equal groups"], change: [], testNext: [], nextEvidenceRequired: [],
        readinessAssessment: {
          status: "ready_independent",
          scope: { homeworkId: "hw-math-one", assignmentTitle: "Equal groups", constructIds: ["math.multiplication.equal_groups"] },
          reason: "The confirmed work was correct on the assigned construct.",
          evidenceIds,
          predictionEvaluationIds,
          uncertainty: "This conclusion is limited to the returned assignment and cited constructs.",
          nextAction: "Complete the assignment independently.",
        },
      }),
    });

    expect(interpreted.cycle.decisionHistory.at(-1)?.readinessAssessment).toMatchObject({
      status: "ready_independent",
      scope: { homeworkId: "hw-math-one", constructIds: ["math.multiplication.equal_groups"] },
      evidenceIds,
      predictionEvaluationIds,
    });
  });

  it.each(["unknown", "assisted"] as const)("rejects ready_independent when returned-work assistance is %s", async (assistanceStatus) => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const work = returnedWork("hw-math-one");
    work.items = work.items.map((item) => ({ ...item, correct: true, assistanceStatus }));
    const factual = recordConfirmedReturnedWork(work, { rootDir });
    const evidenceIds = factual.observations.map((item) => item.observationId);
    const predictionEvaluationIds = factual.predictionEvaluations.map((item) => item.evaluationId);
    await expect(interpretReturnedWorkBatch({
      childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:1", rootDir,
      interpret: async () => ({
        status: "supported", reason: "Attempted independent-readiness claim.", nextAction: "complete",
        evidenceIds, predictionEvaluationIds, preserve: [], change: [], testNext: [], nextEvidenceRequired: [],
        readinessAssessment: {
          status: "ready_independent",
          scope: { homeworkId: "hw-math-one", assignmentTitle: "Equal groups", constructIds: ["math.multiplication.equal_groups"] },
          reason: "Claimed readiness.", evidenceIds, predictionEvaluationIds,
          uncertainty: "Assistance is not independently confirmed.", nextAction: "complete",
        },
        continuationAction: "complete",
      }),
    })).rejects.toThrow("assignment_readiness_independent_evidence_ineligible");
  });

  it.each([
    {
      label: "material assistance",
      status: "ready_with_support",
      mutate: (work: ConfirmedReturnedWork) => ({ ...work, items: work.items.map((item) => ({ ...item, teacherNote: "Completed with material adult assistance." })) }),
    },
    {
      label: "weak returned work",
      status: "not_yet_ready",
      mutate: (work: ConfirmedReturnedWork) => ({ ...work, items: work.items.map((item) => ({ ...item, correct: false })) }),
    },
    {
      label: "low-confidence extraction",
      status: "insufficient_evidence",
      mutate: (work: ConfirmedReturnedWork) => ({ ...work, items: work.items.map((item) => ({ ...item, extractionConfidence: 0.4 })) }),
    },
  ] as const)("preserves the Planner's $status conclusion for $label without inventing mastery", async ({ status, mutate }) => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const factual = recordConfirmedReturnedWork(mutate(returnedWork("hw-math-one")), { rootDir });
    const evidenceIds = factual.observations.map((item) => item.observationId);
    const predictionEvaluationIds = factual.predictionEvaluations.map((item) => item.evaluationId);
    const interpreted = await interpretReturnedWorkBatch({
      childId: "reina", homeworkId: "hw-math-one", sourceId: "source:return:1", rootDir,
      interpret: async () => ({
        status: "inconclusive", reason: "The returned evidence does not support an independent-readiness claim.",
        nextAction: "Follow the readiness assessment.", evidenceIds, predictionEvaluationIds,
        preserve: [], change: [], testNext: ["fresh independent work"], nextEvidenceRequired: ["fresh independent work"],
        readinessAssessment: {
          status,
          scope: { homeworkId: "hw-math-one", assignmentTitle: "Equal groups", constructIds: ["math.multiplication.equal_groups"] },
          reason: "The cited evidence determines the bounded conclusion.", evidenceIds, predictionEvaluationIds,
          uncertainty: "No claim extends beyond the cited assignment evidence.", nextAction: "Collect the next prescribed evidence.",
        },
      }),
    });
    expect(interpreted.cycle.decisionHistory.at(-1)?.readinessAssessment?.status).toBe(status);
  });

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

  it("projects recent companion support as factual longitudinal context without promoting it to academic mastery", () => {
    const rootDir = root();
    createLearningCycle(cycleInput("hw-math-one"), { rootDir });
    const supported = recordCanonicalCompanionSupport({
      childId: "reina",
      homeworkId: "hw-math-one",
      sessionId: "session-1",
      nodeId: "hw-math-one:practice",
      itemId: "item-1",
      supportType: "explain",
      requestSummary: "Child asked for a different explanation of equal groups.",
    }, { rootDir });
    const evidenceId = supported.evidence.companionObservations[0]!.evidenceId;
    markCanonicalCompanionSupportResumed({
      childId: "reina",
      homeworkId: "hw-math-one",
      evidenceId,
      resumedIndependently: true,
    }, { rootDir });

    const history = buildLongitudinalLearningHistory("reina", { rootDir });

    expect(history.recentSupportObservations).toEqual([
      expect.objectContaining({
        evidenceId,
        homeworkId: "hw-math-one",
        nodeId: "hw-math-one:practice",
        itemId: "item-1",
        supportType: "explain",
        masteryEligible: false,
        resumedIndependently: true,
      }),
    ]);
    expect(history.constructs["math.multiplication.equal_groups"]?.observations).toEqual([]);
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
          readinessAssessment: {
            status: "not_yet_ready",
            // Provider tool output occasionally serializes a nested object as a
            // JSON string. The boundary should normalize that losslessly rather
            // than discard an otherwise valid, evidence-citing decision.
            scope: JSON.stringify({ homeworkId: "hw-math-one", assignmentTitle: "Equal groups", constructIds: ["math.multiplication.equal_groups"] }),
            reason: "Confirmed work contains an unresolved operation-selection error.",
            evidenceIds: factual.observations.map((item) => item.observationId),
            predictionEvaluationIds: factual.predictionEvaluations.map((item) => item.evaluationId),
            uncertainty: "Limited to the returned assignment.",
            nextAction: "Provide support and collect fresh independent evidence.",
          },
          continuationAction: "generate_support",
          nextInstrument: {
            nodeId: "support-equal-groups", title: "Equal Groups Support", academicTarget: "math.multiplication.equal_groups",
            mechanic: "AI-selected interaction", theme: "AI-selected world", openingPurpose: "Address the returned-work error.", creatorPrompt: "Create support.",
          },
          nextPrediction: {
            claim: "Fresh support will improve independent operation selection.", constructId: "math.multiplication.equal_groups",
            context: "next support session", horizon: "next_session", expectedMetric: { key: "academic.accuracy", min: 0.7, max: 0.9 },
            predictedErrorPatterns: ["operation_selection"], confidence: 0.55, evidenceLimit: "independent_performance",
          },
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
    expect(request.tools[0].input_schema.required).toContain("readinessAssessment");
    expect(request.tools[0].input_schema.required).toContain("continuationAction");
    expect(request.tools[0].input_schema.properties.assumptionAssessments.items.required).toEqual([
      "assumptionId", "outcome", "reason", "observationIds",
    ]);
  });

  it("does not auto-complete awaiting calibration when a legacy decision omits readiness and continuation", async () => {
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
    expect(interpreted.cycle.lifecycle).toBe("awaiting_calibration");
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
