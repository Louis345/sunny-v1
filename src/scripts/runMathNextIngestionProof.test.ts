import { describe, expect, it } from "vitest";

import {
  analyzeCalibrationPrompt,
  aggregatePlannerUsage,
  buildIncompleteNextIngestionSummary,
  compareLearningPrograms,
  evaluateNextIngestionProof,
} from "./runMathNextIngestionProof";

const decision = {
  decisionId: "decision:b",
  predictionEvaluationIds: ["evaluation:1"],
  preserve: ["Preserve visual arrays"],
  change: ["Teach unknown-position mapping"],
  testNext: ["Test a missing factor"],
  nextEvidenceRequired: ["Five unassisted items"],
};

const program = (overrides: Record<string, unknown> = {}) => ({
  concept: { conceptId: "math.multiplication.missing_factor" },
  academicTheory: "Teach equal groups broadly.",
  assumptions: [{ claim: "Broad multiplication support is needed.", evidenceIds: ["assignment:new"] }],
  profileEvidence: ["assignment:new"],
  learningResponsibilities: [{ id: "r1", description: "Represent equal groups" }],
  activities: [{ id: "n1", academicTarget: "equal groups", difficultyBoundary: { startingSupport: "worked example", expectedIndependence: "independent" } }],
  ...overrides,
});

describe("math next-ingestion proof", () => {
  it("reports malformed and accepted control calls together instead of hiding rejected spend", () => {
    expect(aggregatePlannerUsage([
      { usage: { input_tokens: 100_000, output_tokens: 10_000 } },
      { usage: { input_tokens: 20_000, output_tokens: 5_000 } },
    ])).toMatchObject({ calls: 2, inputTokens: 120_000, outputTokens: 15_000, costUsd: 0.975 });
  });

  it("reports provider-contract failure as incomplete instead of pass", () => {
    const summary = buildIncompleteNextIngestionSummary("math_learning_program_missing_concept", [
      { usage: { input_tokens: 100_000, output_tokens: 10_000 } },
      { usage: { input_tokens: 20_000, output_tokens: 5_000 } },
    ], {
      promptCoverage: { complete: true, missing: [] },
      calibrationDecisionId: "decision:b",
      assignmentHash: "assignment-hash",
      historicalOutput: "historical-proof",
    });
    expect(summary).toMatchObject({
      status: "INCOMPLETE",
      providerFailure: "math_learning_program_missing_concept",
      promptCoverage: { complete: true, missing: [] },
      calibrationDecisionId: "decision:b",
      usage: { calls: 2, costUsd: 0.975 },
    });
  });

  it("requires the prior decision, evaluations, and explicit change contract in the Planner prompt", () => {
    const prompt = JSON.stringify(decision);
    expect(analyzeCalibrationPrompt(prompt, decision)).toEqual({
      complete: true,
      missing: [],
    });
    expect(analyzeCalibrationPrompt("assignment only", decision).complete).toBe(false);
  });

  it("separates calibrated changes from deliberately preserved scope", () => {
    const comparison = compareLearningPrograms(
      program({
        academicTheory: "The gap is unknown-position mapping, not computation.",
        assumptions: [{ claim: "Unknown position is the scoped gap.", evidenceIds: ["decision:b", "evaluation:1"] }],
        activities: [{ id: "n1", academicTarget: "missing factor", difficultyBoundary: { startingSupport: "name the empty slot", expectedIndependence: "independent after one example" } }],
      }),
      program(),
    );
    expect(comparison.preserved).toContain("concept identity");
    expect(comparison.changed).toEqual(expect.arrayContaining(["academic theory", "assumptions", "activity responsibilities or difficulty"]));
  });

  it("passes only when calibration is visible, changes the program, and reingestion preserves history", () => {
    expect(evaluateNextIngestionProof({
      sameAssignmentHash: true,
      promptCoverageComplete: true,
      calibratedProgramCitesHistory: true,
      cleanControlContainsHistory: false,
      materialChangeCount: 3,
      sameAssignmentPreserved: true,
      realChildDataChanged: false,
    }).status).toBe("PASS");
    expect(evaluateNextIngestionProof({
      sameAssignmentHash: true,
      promptCoverageComplete: true,
      calibratedProgramCitesHistory: false,
      cleanControlContainsHistory: false,
      materialChangeCount: 3,
      sameAssignmentPreserved: true,
      realChildDataChanged: false,
    }).status).toBe("FAIL");
  });
});
