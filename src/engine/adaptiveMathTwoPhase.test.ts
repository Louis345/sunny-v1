import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildAdaptiveBoardPlannerContext,
  buildMathOpeningEvaluationPrompt,
  compareAdaptiveMathEvidence,
  createMathEvaluationFindings,
  createMathInterventionDecision,
  createMathOpeningEvaluation,
  createMathBoardWorkerJob,
  mathEvaluationFindingsHash,
  mathQuestionFingerprint,
  adaptiveMathSnapshotHash,
  adaptiveMathDraftBindingKey,
  runMathBoardWorker,
  type MathEvaluationAttempt,
} from "./adaptiveMathTwoPhase";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-adaptive-math-"));
}

const assignment = {
  homeworkId: "hw-fixture-equal-groups",
  cycleId: "cycle-fixture-equal-groups",
  sourceHash: "source-hash-1",
  extractionHash: "extraction-hash-1",
  fullText: "A school page asks students to interpret equal groups and multiplication factors.",
  academicContractHash: "academic-hash-1",
  sourceEvidenceIds: ["assignment:page-1", "assignment:item-2"],
  contextEvidenceIds: ["history:evaluation-7"],
  sourceQuestionTexts: ["School asks: explain what 8 and 5 count."],
  sourceQuestionFingerprints: [mathQuestionFingerprint("School asks: explain what 8 and 5 count.")],
};

const evaluationInput = {
  version: 1 as const,
  evaluationId: "evaluation:opening:equal-groups",
  artifactId: "artifact:opening-evaluation",
  evaluationHash: "computed-by-validator",
  homeworkId: assignment.homeworkId,
  cycleId: assignment.cycleId,
  academicContractHash: "academic-hash-1",
  title: "Power the Lantern Dock",
  openingPromise: "Show what you already know to light the dock.",
  firstAction: "Move one wagon under the matching group.",
  assumptions: [{
    assumptionId: "assumption:factor-meaning",
    claim: "The child may multiply but may not explain what each factor counts.",
    evidenceIds: ["history:evaluation-7"],
    confidence: 0.68,
    uncertainty: "No delayed independent evidence exists.",
    falsifyingEvidence: ["Fresh independent factor interpretation succeeds."],
  }],
  predictions: [{
    predictionId: "prediction:opening-factor-meaning",
    constructId: "math.multiplication.factor_meaning",
    claim: "The child will identify groups more reliably than group size.",
    evidenceIds: ["history:evaluation-7"],
    confidence: 0.68,
    uncertainty: "The prior task used a different representation.",
    falsifyingEvidence: ["Fresh independent responses identify both factor meanings."],
    measurementKeys: ["independent.correct", "error.factor_role_reversal"],
  }],
  items: [{
    itemId: "opening-item-1",
    constructId: "math.multiplication.factor_meaning",
    prerequisiteConstructIds: ["math.multiplication.equal_groups"],
    prompt: "There are 8 wagons with 5 lanterns on each wagon. What does each number count?",
    sourceEvidenceIds: ["assignment:item-2"],
    sourceQuestionFingerprint: "fresh-item-hash-1",
    exposureIdentity: "unseen:opening-item-1",
    difficultyBoundary: {
      allowedConcepts: ["equal groups", "factor meaning"],
      allowedRepresentations: ["wagons and lanterns"],
      excludedExtensions: ["division", "multi-step word problems"],
    },
    response: {
      mode: "construction" as const,
      expectedState: { groups: 8, perGroup: 5 },
      successDescription: "Eight groups with five in each group.",
    },
  }],
};

function attempts(): MathEvaluationAttempt[] {
  return [{
    attemptId: "attempt:opening-item-1",
    itemId: "opening-item-1",
    constructId: "math.multiplication.factor_meaning",
    result: "incorrect",
    attemptedValue: { groups: 5, perGroup: 8 },
    observedErrorType: "factor_role_reversal",
    assistance: "none",
    exposure: "unseen",
    responseMode: "construction",
    device: { kind: "desktop", inputMethods: ["pointer"] },
    artifactId: "artifact:opening-evaluation",
    occurredAt: "2026-08-16T14:00:00.000Z",
  }];
}

describe("adaptive math two-phase contracts", () => {
  it("records the independent-probe and teaching-only bridge boundary in the learning contract", () => {
    const contract = fs.readFileSync(path.join(process.cwd(), "LEARNING_FEEDBACK_LOOP.md"), "utf8");
    expect(contract).toContain("Independent opening evaluation");
    expect(contract).toContain("teaching-only bridge");
    expect(contract).toContain("fresh independent evaluation");
    expect(contract).toContain("does not establish mastery");
  });

  it("creates a fresh, independent opening evaluation and rejects worksheet copying", () => {
    const prompt = buildMathOpeningEvaluationPrompt({
      assignment,
      childChart: { childId: "lab-child", age: 9, grade: 3, evidenceIds: ["history:evaluation-7"] },
    });
    expect(prompt).toContain("independent opening evaluation");
    expect(prompt).toContain("Do not teach, hint, demonstrate, or reveal");
    expect(prompt).toContain("history:evaluation-7");

    const evaluation = createMathOpeningEvaluation(evaluationInput, assignment);
    expect(evaluation.items[0].exposureIdentity).toMatch(/^unseen:/);
    expect(evaluation.items[0].prerequisiteConstructIds).toContain("math.multiplication.equal_groups");
    expect(evaluation.predictions[0].confidence).toBe(0.68);

    expect(() => createMathOpeningEvaluation({
      ...evaluationInput,
      items: [{
        ...evaluationInput.items[0],
        prompt: "School asks: explain what 8 and 5 count.",
        sourceQuestionFingerprint: "model-claimed-fresh-hash",
      }],
    }, assignment)).toThrow("opening_evaluation_copies_source_question");
    expect(() => createMathOpeningEvaluation({
      ...evaluationInput,
      items: [{ ...evaluationInput.items[0], sourceEvidenceIds: ["assignment:missing"] }],
    }, assignment)).toThrow("opening_evaluation_unknown_source_evidence");
    expect(() => createMathOpeningEvaluation({
      ...evaluationInput,
      academicContractHash: "different-academic-hash",
    }, assignment)).toThrow("opening_evaluation_academic_contract_mismatch");
    expect(() => createMathOpeningEvaluation({
      ...evaluationInput,
      assumptions: [{ ...evaluationInput.assumptions[0], evidenceIds: ["history:invented"] }],
    }, assignment)).toThrow("opening_evaluation_unknown_assumption_evidence");
    expect(() => createMathOpeningEvaluation({
      ...evaluationInput,
      items: [{ ...evaluationInput.items[0], prompt: "Explain what the numbers 8 and 5 each count for the school." }],
    }, assignment)).toThrow("opening_evaluation_lightly_rewrites_source_question");
    expect(() => createMathOpeningEvaluation({
      ...evaluationInput,
      items: [{
        ...evaluationInput.items[0],
        response: { mode: "construction", expectedState: {}, successDescription: "Nothing" },
      }],
    }, assignment)).toThrow("opening_evaluation_construction_contract_invalid");
    expect(() => createMathOpeningEvaluation({
      ...evaluationInput,
      items: [{
        ...evaluationInput.items[0],
        response: {
          mode: "selection",
          options: [
            { id: "same", label: "First", correct: true },
            { id: "same", label: "Second", correct: false },
          ],
        },
      }],
    }, assignment)).toThrow("opening_evaluation_selection_option_ids_invalid");
  });

  it("turns attempts into factual findings without inventing a learning style", () => {
    const evaluation = createMathOpeningEvaluation(evaluationInput, assignment);
    const packet = createMathEvaluationFindings({
      evaluation,
      attempts: [
        ...attempts(),
        {
          ...attempts()[0],
          attemptId: "attempt:ambiguous",
          itemId: "opening-item-1",
          result: "instrument_ambiguous",
          observedErrorType: "response_mode_ambiguity",
          assistance: "unknown",
        },
      ],
      completedAt: "2026-08-16T14:01:00.000Z",
    });

    expect(packet.demonstrated).toEqual([]);
    expect(packet.holes[0]).toMatchObject({
      constructId: "math.multiplication.factor_meaning",
      evidenceIds: ["attempt:opening-item-1"],
    });
    expect(packet.ambiguities[0].evidenceIds).toEqual(["attempt:ambiguous"]);
    expect(packet.provenance[0]).toMatchObject({
      responseMode: "construction",
      artifactId: "artifact:opening-evaluation",
    });
    expect(JSON.stringify(packet)).not.toMatch(/visual learner|dislikes typing/i);
    expect(mathEvaluationFindingsHash(packet)).toMatch(/^[a-f0-9]{64}$/);

    expect(() => createMathEvaluationFindings({
      evaluation,
      attempts: [{ ...attempts()[0], constructId: "math.unrelated.construct" }],
      completedAt: "2026-08-16T14:01:00.000Z",
    })).toThrow("evaluation_attempt_construct_mismatch");

    expect(() => createMathEvaluationFindings({
      evaluation,
      attempts: [{ ...attempts()[0], responseMode: "numeric" }],
      completedAt: "2026-08-16T14:01:00.000Z",
    })).toThrow("evaluation_attempt_response_mode_mismatch");

    expect(() => createMathEvaluationFindings({
      evaluation,
      attempts: [{ ...attempts()[0], result: "correct", attemptedValue: { groups: 5, perGroup: 8 } }],
      completedAt: "2026-08-16T14:01:00.000Z",
    })).toThrow("evaluation_attempt_correctness_mismatch");

    expect(() => createMathEvaluationFindings({
      evaluation,
      attempts: [{ ...attempts()[0], result: "incorrect", attemptedValue: { groups: 8, perGroup: 5 } }],
      completedAt: "2026-08-16T14:01:00.000Z",
    })).toThrow("evaluation_attempt_scoring_disagreement");
  });

  it("requires the Planner decision to cite findings evidence and keeps Visual Explainer optional", () => {
    const findings = createMathEvaluationFindings({
      evaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      attempts: attempts(),
      completedAt: "2026-08-16T14:01:00.000Z",
    });
    const decision = createMathInterventionDecision({
      version: 1,
      decisionId: "decision:factor-meaning-visual",
      findingsHash: mathEvaluationFindingsHash(findings),
      action: "visual_explainer",
      targetConstructIds: ["math.multiplication.factor_meaning"],
      evidenceIds: ["attempt:opening-item-1"],
      rationale: "A concrete group model can address the observed factor-role reversal.",
      confidence: 0.73,
      uncertainty: "One fresh response cannot distinguish a stable misconception from a momentary reversal.",
      falsifyingEvidence: ["Fresh post-intervention factor interpretation remains reversed."],
      measurementKeys: ["post.independent.factor_meaning"],
      nextEvidenceRequired: ["Fresh unassisted factor-meaning response."],
    }, findings);
    expect(decision.action).toBe("visual_explainer");

    expect(() => createMathInterventionDecision({
      ...decision,
      decisionId: "decision:unsupported",
      evidenceIds: ["missing:evidence"],
    }, findings)).toThrow("intervention_decision_unknown_evidence");

    expect(createMathInterventionDecision({
      ...decision,
      decisionId: "decision:catalog",
      action: "catalog_intervention",
    }, findings).action).toBe("catalog_intervention");

    expect(() => createMathInterventionDecision({
      ...decision,
      action: "invented_action",
    } as never, findings)).toThrow("intervention_decision_action_invalid");
    expect(() => createMathInterventionDecision({
      ...decision,
      rationale: "",
    }, findings)).toThrow("adaptive_math_missing_decision_rationale");
    expect(() => createMathInterventionDecision({
      ...decision,
      decisionId: "decision:unrelated-target",
      targetConstructIds: ["math.geometry.area"],
    }, findings)).toThrow("intervention_decision_target_not_supported");
  });

  it("keys production drafts to the complete frozen adaptive input", () => {
    const first = adaptiveMathDraftBindingKey({
      findingsHash: "findings-a", decisionId: "decision-a", decisionHash: "decision-hash-a",
      childChartSnapshotHash: "chart-a", frozenExtractionHash: "extract-a", academicContractHash: "academic-a",
    });
    const second = adaptiveMathDraftBindingKey({
      findingsHash: "findings-a", decisionId: "decision-b", decisionHash: "decision-hash-b",
      childChartSnapshotHash: "chart-a", frozenExtractionHash: "extract-a", academicContractHash: "academic-a",
    });
    expect(first).not.toBe(second);
  });

  it("hands frozen evidence to an idempotent resumable worker without rereading the PDF", async () => {
    const rootDir = tempRoot();
    const findings = createMathEvaluationFindings({
      evaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      attempts: attempts(),
      completedAt: "2026-08-16T14:01:00.000Z",
    });
    const decision = createMathInterventionDecision({
      version: 1,
      decisionId: "decision:factor-meaning-visual",
      findingsHash: mathEvaluationFindingsHash(findings),
      action: "visual_explainer",
      targetConstructIds: ["math.multiplication.factor_meaning"],
      evidenceIds: ["attempt:opening-item-1"],
      rationale: "Use a concrete model.",
      confidence: 0.73,
      uncertainty: "One response.",
      falsifyingEvidence: ["No improvement on fresh evidence."],
      measurementKeys: ["post.independent.factor_meaning"],
      nextEvidenceRequired: ["Fresh unassisted response."],
    }, findings);
    const job = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash,
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash-1",
      findings,
      decision,
      academicContractHash: "academic-hash-1",
      expectedArtifactIds: ["baseline-1", "checkpoint-1"],
    });
    expect(JSON.stringify(job)).not.toContain(".pdf");
    expect(() => createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: "wrong-homework",
      cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash,
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash-1",
      findings,
      decision,
      academicContractHash: assignment.academicContractHash,
      expectedArtifactIds: [],
    })).toThrow("adaptive_math_worker_evidence_identity_mismatch");

    const interruptedBuild = vi.fn(async (input: {
      reportArtifact: (artifactId: string, artifactHash: string) => void;
    }) => {
      input.reportArtifact("baseline-1", "hash-a");
      throw new Error("fixture_provider_pause");
    });
    await expect(runMathBoardWorker(job.jobFile, { build: interruptedBuild })).rejects
      .toThrow("fixture_provider_pause");
    const paused = JSON.parse(fs.readFileSync(job.jobFile, "utf8"));
    expect(paused).toMatchObject({
      state: "provider_paused",
      completedArtifactIds: ["baseline-1"],
      missingArtifactIds: ["checkpoint-1"],
      costUsd: null,
      costAccountingComplete: false,
    });

    const build = vi.fn(async (input: { findingsHash: string; completedArtifactIds: string[] }) => ({
      completedArtifactIds: ["checkpoint-1"],
      artifactHashes: { "checkpoint-1": "hash-b" },
      calls: 2,
      tokens: 1200,
      costUsd: 0.42,
      costAccountingComplete: true,
      inputFindingsHash: input.findingsHash,
    }));
    const ready = await runMathBoardWorker(job.jobFile, { build });
    expect(ready.state).toBe("ready");
    expect(ready.costUsd).toBeNull();
    expect(ready.costAccountingComplete).toBe(false);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0][0]).toMatchObject({
      findingsHash: mathEvaluationFindingsHash(findings),
      decisionId: decision.decisionId,
      frozenExtractionHash: assignment.extractionHash,
      completedArtifactIds: ["baseline-1"],
    });

    const repeated = await runMathBoardWorker(job.jobFile, { build });
    expect(repeated.state).toBe("ready");
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("cannot mark a worker ready when any completed artifact lacks a hash", async () => {
    const rootDir = tempRoot();
    const findings = createMathEvaluationFindings({
      evaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      attempts: attempts(),
      completedAt: "2026-08-16T14:01:00.000Z",
    });
    const decision = createMathInterventionDecision({
      version: 1,
      decisionId: "decision:hash-proof",
      findingsHash: mathEvaluationFindingsHash(findings),
      action: "catalog_intervention",
      targetConstructIds: ["math.multiplication.factor_meaning"],
      evidenceIds: ["attempt:opening-item-1"],
      rationale: "Use a targeted intervention.",
      confidence: 0.7,
      uncertainty: "One response.",
      falsifyingEvidence: ["Fresh evidence remains incorrect."],
      measurementKeys: ["fresh.factor_meaning"],
      nextEvidenceRequired: ["Fresh unassisted response."],
    }, findings);
    const job = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash,
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash",
      findings,
      decision,
      academicContractHash: assignment.academicContractHash,
      expectedArtifactIds: ["baseline"],
    });

    await expect(runMathBoardWorker(job.jobFile, {
      build: async ({ findingsHash }) => ({
        completedArtifactIds: ["baseline"],
        artifactHashes: {},
        calls: 1,
        tokens: 10,
        costUsd: 0,
        costAccountingComplete: true,
        inputFindingsHash: findingsHash,
      }),
    })).rejects.toThrow("adaptive_math_worker_missing_artifact_hashes:baseline");
    expect(JSON.parse(fs.readFileSync(job.jobFile, "utf8")).state).not.toBe("ready");
  });

  it("does not reuse a worker checkpoint from a different decision for the same homework", () => {
    const rootDir = tempRoot();
    const findings = createMathEvaluationFindings({
      evaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      attempts: attempts(),
      completedAt: "2026-08-16T14:01:00.000Z",
    });
    const decision = createMathInterventionDecision({
      version: 1,
      decisionId: "decision:first",
      findingsHash: mathEvaluationFindingsHash(findings),
      action: "visual_explainer",
      targetConstructIds: ["math.multiplication.factor_meaning"],
      evidenceIds: ["attempt:opening-item-1"],
      rationale: "Use a concrete model.",
      confidence: 0.73,
      uncertainty: "One response.",
      falsifyingEvidence: ["No improvement on fresh evidence."],
      measurementKeys: ["post.independent.factor_meaning"],
      nextEvidenceRequired: ["Fresh unassisted response."],
    }, findings);
    const first = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash,
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash-1",
      findings,
      decision,
      academicContractHash: "academic-hash-1",
      expectedArtifactIds: ["baseline-1", "checkpoint-1"],
    });
    const second = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash,
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash-1",
      findings,
      decision: { ...decision, decisionId: "decision:second" },
      academicContractHash: "academic-hash-1",
      expectedArtifactIds: ["baseline-1", "checkpoint-1"],
    });

    expect(second.jobFile).not.toBe(first.jobFile);
    expect(second.decision.decisionId).toBe("decision:second");

    const changedSource = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      assignmentSourceHash: "source-hash-2",
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash-1",
      findings,
      decision,
      academicContractHash: "academic-hash-1",
      expectedArtifactIds: ["baseline-1", "checkpoint-1"],
    });
    const changedArtifacts = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash,
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash-1",
      findings,
      decision,
      academicContractHash: "academic-hash-1",
      expectedArtifactIds: ["baseline-1", "checkpoint-2"],
    });
    expect(changedSource.jobFile).not.toBe(first.jobFile);
    expect(changedArtifacts.jobFile).not.toBe(first.jobFile);
    const changedDecisionBody = createMathBoardWorkerJob({
      rootDir, childId: "lab-child", homeworkId: assignment.homeworkId, cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash, frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash-1", findings,
      decision: { ...decision, action: "catalog_intervention" },
      academicContractHash: "academic-hash-1", expectedArtifactIds: ["baseline-1", "checkpoint-1"],
    });
    expect(changedDecisionBody.jobFile).not.toBe(first.jobFile);
  });

  it("rejects a corrupted ready worker checkpoint instead of trusting it", async () => {
    const rootDir = tempRoot();
    const findings = createMathEvaluationFindings({
      evaluation: createMathOpeningEvaluation(evaluationInput, assignment), attempts: attempts(),
      completedAt: "2026-08-16T14:01:00.000Z",
    });
    const decision = createMathInterventionDecision({
      version: 1, decisionId: "decision:corruption", findingsHash: mathEvaluationFindingsHash(findings),
      action: "catalog_intervention", targetConstructIds: ["math.multiplication.factor_meaning"],
      evidenceIds: ["attempt:opening-item-1"], rationale: "Target the observed error.", confidence: 0.7,
      uncertainty: "One response.", falsifyingEvidence: ["Fresh evidence succeeds."],
      measurementKeys: ["fresh.factor_meaning"], nextEvidenceRequired: ["Fresh response."],
    }, findings);
    const job = createMathBoardWorkerJob({
      rootDir, homeworkId: assignment.homeworkId, cycleId: assignment.cycleId,
      childId: "lab-child",
      assignmentSourceHash: assignment.sourceHash, frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash", findings, decision,
      academicContractHash: assignment.academicContractHash, expectedArtifactIds: ["baseline"],
    });
    fs.writeFileSync(job.jobFile, `${JSON.stringify({ ...job, state: "ready", completedArtifactIds: ["baseline"], missingArtifactIds: [], artifactHashes: {} })}\n`);
    await expect(runMathBoardWorker(job.jobFile, { build: vi.fn() as never }))
      .rejects.toThrow("adaptive_math_worker_checkpoint_invalid");

    fs.writeFileSync(job.jobFile, `${JSON.stringify({
      ...job,
      costUsd: null,
      costAccountingComplete: true,
    })}\n`);
    await expect(runMathBoardWorker(job.jobFile, { build: vi.fn() as never }))
      .rejects.toThrow("adaptive_math_worker_checkpoint_invalid:complete_cost_missing");
  });

  it("records local publication failures separately from resumable provider pauses", async () => {
    const rootDir = tempRoot();
    const findings = createMathEvaluationFindings({
      evaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      attempts: attempts(),
      completedAt: "2026-08-16T14:01:00.000Z",
    });
    const decision = createMathInterventionDecision({
      version: 1,
      decisionId: "decision:publication-proof",
      findingsHash: mathEvaluationFindingsHash(findings),
      action: "catalog_intervention",
      targetConstructIds: ["math.multiplication.factor_meaning"],
      evidenceIds: ["attempt:opening-item-1"],
      rationale: "Use a targeted intervention.",
      confidence: 0.7,
      uncertainty: "One response.",
      falsifyingEvidence: ["Fresh evidence remains incorrect."],
      measurementKeys: ["fresh.factor_meaning"],
      nextEvidenceRequired: ["Fresh unassisted response."],
    }, findings);
    const job = createMathBoardWorkerJob({
      rootDir,
      childId: "lab-child",
      homeworkId: assignment.homeworkId,
      cycleId: assignment.cycleId,
      assignmentSourceHash: assignment.sourceHash,
      frozenExtractionHash: assignment.extractionHash,
      childChartSnapshotHash: "chart-hash",
      findings,
      decision,
      academicContractHash: "academic-hash-1",
      expectedArtifactIds: ["baseline"],
    });
    await expect(runMathBoardWorker(job.jobFile, {
      build: async () => { throw new Error("fixture_publication_failed"); },
      failureState: () => "publication_failed",
    })).rejects.toThrow("fixture_publication_failed");
    expect(JSON.parse(fs.readFileSync(job.jobFile, "utf8")).state).toBe("publication_failed");
  });

  it("injects findings into Planner context and reports before/after without claiming causation", () => {
    const findings = createMathEvaluationFindings({
      evaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      attempts: attempts(),
      completedAt: "2026-08-16T14:01:00.000Z",
    });
    const plannerContext = buildAdaptiveBoardPlannerContext({
      findings,
      decision: createMathInterventionDecision({
        version: 1,
        decisionId: "decision:factor-meaning-visual",
        findingsHash: mathEvaluationFindingsHash(findings),
        action: "visual_explainer",
        targetConstructIds: ["math.multiplication.factor_meaning"],
        evidenceIds: ["attempt:opening-item-1"],
        rationale: "Use a concrete model.",
        confidence: 0.7,
        uncertainty: "One response.",
        falsifyingEvidence: ["Fresh evidence remains incorrect."],
        measurementKeys: ["fresh.factor_meaning"],
        nextEvidenceRequired: ["Fresh unassisted response."],
      }, findings),
      historicalEvidence: [{ evidenceId: "history:evaluation-7", summary: "Prior grouping was assisted." }],
    });
    expect(plannerContext.findingsHash).toBe(mathEvaluationFindingsHash(findings));
    expect(plannerContext.historicalEvidence).toHaveLength(1);

    const exitEvaluation = createMathOpeningEvaluation({
      ...evaluationInput,
      evaluationId: "evaluation:exit:equal-groups",
      artifactId: "artifact:exit-evaluation",
      items: [{
        ...evaluationInput.items[0],
        itemId: "exit-item-1",
        prompt: "Six racks hold four moonstones each. What does each number count?",
        sourceQuestionFingerprint: "fresh-exit-hash-1",
        exposureIdentity: "unseen:exit-item-1",
        response: {
          mode: "construction" as const,
          expectedState: { groups: 6, perGroup: 4 },
          successDescription: "Six groups with four in each group.",
        },
      }],
    }, assignment);
    const difficultyChangedExitEvaluation = createMathOpeningEvaluation({
      ...exitEvaluation,
      items: [{
        ...exitEvaluation.items[0]!,
        difficultyBoundary: {
          ...exitEvaluation.items[0]!.difficultyBoundary,
          allowedConcepts: ["multi-step division"],
        },
      }],
    }, assignment);
    const lightlyRewrittenExitEvaluation = createMathOpeningEvaluation({
      ...exitEvaluation,
      items: [{
        ...exitEvaluation.items[0]!,
        prompt: "Eight wagons each carry five bright lanterns. Say what both numbers count.",
      }],
    }, assignment);
    const comparison = compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings,
      decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      before: attempts(),
      intervention: {
        artifactId: "visual-explainer:factor-meaning",
        decisionId: plannerContext.decision.decisionId,
        decisionHash: adaptiveMathSnapshotHash(plannerContext.decision),
        targetConstructIds: plannerContext.decision.targetConstructIds,
        evidenceIds: ["support:visual-explainer-complete"],
        completed: true,
        completedAt: "2026-08-16T14:05:00.000Z",
      },
      interventionEvidence: [{
        evidenceId: "support:visual-explainer-complete",
        artifactId: "visual-explainer:factor-meaning",
        decisionId: plannerContext.decision.decisionId,
        decisionHash: adaptiveMathSnapshotHash(plannerContext.decision),
        targetConstructIds: plannerContext.decision.targetConstructIds,
        occurredAt: "2026-08-16T14:05:00.000Z",
      }],
      afterEvaluation: exitEvaluation,
      after: [{
        ...attempts()[0],
        attemptId: "attempt:exit-item-1",
        itemId: "exit-item-1",
        artifactId: "artifact:exit-evaluation",
        result: "correct",
        attemptedValue: { groups: 6, perGroup: 4 },
        exposure: "unseen",
        assistance: "none",
        occurredAt: "2026-08-16T14:10:00.000Z",
      }],
    });
    expect(comparison.outcome).toBe("improved");
    expect(comparison.claim).toContain("consistent with helping");
    expect(comparison.claim).not.toMatch(/caused|mastered/i);

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning", findings, decision: plannerContext.decision,
      beforeEvaluation: { ...createMathOpeningEvaluation(evaluationInput, assignment), title: "mutated after freeze" },
      before: attempts(), intervention: comparison.intervention,
      interventionEvidence: [{ evidenceId: "support:visual-explainer-complete", artifactId: "visual-explainer:factor-meaning", decisionId: comparison.intervention.decisionId, decisionHash: comparison.intervention.decisionHash, targetConstructIds: comparison.intervention.targetConstructIds, occurredAt: "2026-08-16T14:05:00.000Z" }],
      afterEvaluation: exitEvaluation,
      after: [{ ...attempts()[0], attemptId: "attempt:exit-item-1", itemId: "exit-item-1", artifactId: "artifact:exit-evaluation", result: "correct", attemptedValue: { groups: 6, perGroup: 4 }, occurredAt: "2026-08-16T14:10:00.000Z" }],
    })).toThrow("adaptive_math_comparison_evaluation_hash_mismatch");

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings, decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      before: attempts(),
      intervention: { ...comparison.intervention, completed: false },
      interventionEvidence: [{ evidenceId: "support:visual-explainer-complete", artifactId: "visual-explainer:factor-meaning", decisionId: comparison.intervention.decisionId, decisionHash: comparison.intervention.decisionHash, targetConstructIds: comparison.intervention.targetConstructIds, occurredAt: "2026-08-16T14:05:00.000Z" }],
      afterEvaluation: exitEvaluation,
      after: [{
        ...attempts()[0], attemptId: "attempt:exit-item-1", itemId: "exit-item-1",
        artifactId: "artifact:exit-evaluation",
        result: "correct", attemptedValue: { groups: 6, perGroup: 4 },
        occurredAt: "2026-08-16T14:10:00.000Z",
      }],
    })).toThrow("adaptive_math_comparison_intervention_incomplete");

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings, decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      before: attempts(),
      intervention: { ...comparison.intervention, completedAt: "2026-08-16T14:11:00.000Z" },
      interventionEvidence: [{ evidenceId: "support:visual-explainer-complete", artifactId: "visual-explainer:factor-meaning", decisionId: comparison.intervention.decisionId, decisionHash: comparison.intervention.decisionHash, targetConstructIds: comparison.intervention.targetConstructIds, occurredAt: "2026-08-16T14:11:00.000Z" }],
      afterEvaluation: exitEvaluation,
      after: [{
        ...attempts()[0], attemptId: "attempt:exit-item-1", itemId: "exit-item-1",
        artifactId: "artifact:exit-evaluation",
        result: "correct", attemptedValue: { groups: 6, perGroup: 4 },
        occurredAt: "2026-08-16T14:10:00.000Z",
      }],
    })).toThrow("adaptive_math_comparison_event_order_invalid");

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings, decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      before: attempts(),
      intervention: comparison.intervention,
      interventionEvidence: [{ evidenceId: "support:visual-explainer-complete", artifactId: "visual-explainer:factor-meaning", decisionId: comparison.intervention.decisionId, decisionHash: comparison.intervention.decisionHash, targetConstructIds: comparison.intervention.targetConstructIds, occurredAt: "2026-08-16T14:05:00.000Z" }],
      afterEvaluation: difficultyChangedExitEvaluation,
      after: [{
        ...attempts()[0],
        attemptId: "attempt:exit-item-1",
        itemId: "exit-item-1",
        artifactId: "artifact:exit-evaluation",
        result: "correct",
        attemptedValue: { groups: 6, perGroup: 4 },
        occurredAt: "2026-08-16T14:10:00.000Z",
      }],
    })).toThrow("adaptive_math_comparison_difficulty_mismatch");

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings, decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      before: attempts(),
      intervention: comparison.intervention,
      interventionEvidence: [],
      afterEvaluation: exitEvaluation,
      after: [{ ...attempts()[0], attemptId: "attempt:exit-item-1", itemId: "exit-item-1", artifactId: "artifact:exit-evaluation", result: "correct", attemptedValue: { groups: 6, perGroup: 4 }, occurredAt: "2026-08-16T14:10:00.000Z" }],
    })).toThrow("adaptive_math_comparison_intervention_evidence_missing");

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings, decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment),
      before: attempts(),
      intervention: comparison.intervention,
      interventionEvidence: [{ evidenceId: "support:visual-explainer-complete", artifactId: "visual-explainer:factor-meaning", decisionId: comparison.intervention.decisionId, decisionHash: comparison.intervention.decisionHash, targetConstructIds: comparison.intervention.targetConstructIds, occurredAt: "2026-08-16T14:05:00.000Z" }],
      afterEvaluation: { ...exitEvaluation, homeworkId: "different-homework" },
      after: [{ ...attempts()[0], attemptId: "attempt:exit-item-1", itemId: "exit-item-1", artifactId: "artifact:exit-evaluation", result: "correct", attemptedValue: { groups: 6, perGroup: 4 }, occurredAt: "2026-08-16T14:10:00.000Z" }],
    })).toThrow("adaptive_math_comparison_identity_mismatch");

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings, decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment), before: attempts(),
      intervention: { ...comparison.intervention, targetConstructIds: ["math.geometry.area"] },
      interventionEvidence: [{ evidenceId: "support:visual-explainer-complete", artifactId: "visual-explainer:factor-meaning", decisionId: comparison.intervention.decisionId, decisionHash: comparison.intervention.decisionHash, targetConstructIds: ["math.geometry.area"], occurredAt: "2026-08-16T14:05:00.000Z" }],
      afterEvaluation: exitEvaluation,
      after: [{ ...attempts()[0], attemptId: "attempt:exit-item-1", itemId: "exit-item-1", artifactId: "artifact:exit-evaluation", result: "correct", attemptedValue: { groups: 6, perGroup: 4 }, occurredAt: "2026-08-16T14:10:00.000Z" }],
    })).toThrow("adaptive_math_comparison_intervention_target_mismatch");

    expect(() => compareAdaptiveMathEvidence({
      constructId: "math.multiplication.factor_meaning",
      findings, decision: plannerContext.decision,
      beforeEvaluation: createMathOpeningEvaluation(evaluationInput, assignment), before: attempts(),
      intervention: comparison.intervention,
      interventionEvidence: [{ evidenceId: "support:visual-explainer-complete", artifactId: "visual-explainer:factor-meaning", decisionId: comparison.intervention.decisionId, decisionHash: comparison.intervention.decisionHash, targetConstructIds: comparison.intervention.targetConstructIds, occurredAt: "2026-08-16T14:05:00.000Z" }],
      afterEvaluation: lightlyRewrittenExitEvaluation,
      after: [{ ...attempts()[0], attemptId: "attempt:exit-item-1", itemId: "exit-item-1", artifactId: "artifact:exit-evaluation", result: "correct", attemptedValue: { groups: 6, perGroup: 4 }, occurredAt: "2026-08-16T14:10:00.000Z" }],
    })).toThrow("adaptive_math_comparison_question_lightly_rewritten");
  });
});
