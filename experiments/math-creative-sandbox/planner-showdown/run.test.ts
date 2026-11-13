import { describe, expect, it } from "vitest";
import {
  buildPlannerPrompt,
  inspectPlannerOutput,
  type PlannerEvidencePacket,
  type PlannerProgram,
} from "./run";

const packet: PlannerEvidencePacket = {
  scenarioId: "limited-history",
  assignment: {
    sourceId: "assignment:pashley-multiplication",
    text: "Represent multiplication using equal groups, arrays, and skip-counting.",
    constructs: ["math.multiplication.equal_groups", "math.multiplication.arrays"],
  },
  childChart: {
    childId: "reina",
    age: 9,
    factualProfileEvidence: [],
  },
  historicalEvidence: [],
};

const validProgram: PlannerProgram = {
  programId: "program-1",
  assignmentAnalysis: {
    constructs: ["math.multiplication.equal_groups"],
    prerequisites: ["counting equal sets"],
    difficultyBoundaries: {
      included: ["factors through 10"],
      excluded: ["multi-digit multiplication"],
    },
  },
  assumptions: [
    {
      assumptionId: "assumption-1",
      claim: "Independent array interpretation is not yet established.",
      evidenceIds: [],
      confidence: 0.2,
      uncertainty: "No relevant independent math evidence is available.",
      falsifyingEvidence: "An unseen independent array probe completed accurately.",
    },
  ],
  academicPredictions: [
    {
      predictionId: "prediction-1",
      construct: "math.multiplication.equal_groups",
      expectedOutcome: "Reina will represent small equal groups with initial support.",
      expectedRange: { metric: "independent_accuracy", minimum: 0.4, maximum: 0.7 },
      predictedErrorPatterns: ["reverses groups and items per group"],
      confidence: 0.35,
      evidenceIds: [],
      horizon: "baseline",
      maximumClaim: "practice evidence only",
    },
  ],
  learningSequence: [
    {
      nodeId: "node-1",
      responsibility: "teach",
      constructs: ["math.multiplication.equal_groups"],
      startingSupport: "visual grouping",
      expectedIndependence: "construct a fresh equal-groups representation",
      evidenceRequired: ["attempt accuracy", "assistance used"],
      nextDecisionEnabled: "whether an independent probe is justified",
    },
  ],
  evidenceSeparation: {
    practiceClaims: ["supported practice performance"],
    independentClaims: ["provisional independent performance"],
    calibrationRequirements: ["returned graded or delayed work"],
  },
  nextEvidenceRequired: ["unseen independent equal-groups response"],
  planningRationale: "Begin with the unresolved representation construct.",
};

describe("planner showdown experiment", () => {
  it("builds byte-identical model-facing prompts for the same packet", () => {
    expect(buildPlannerPrompt(packet)).toBe(buildPlannerPrompt(packet));
    expect(buildPlannerPrompt(packet)).not.toContain("Opus");
    expect(buildPlannerPrompt(packet)).not.toContain("GPT");
  });

  it("accepts a grounded program and reports no hard failures", () => {
    expect(inspectPlannerOutput(validProgram, packet).hardFailures).toEqual([]);
  });

  it("accepts assignment provenance and high confidence that evidence is absent", () => {
    const program: PlannerProgram = {
      ...validProgram,
      assumptions: [{
        ...validProgram.assumptions[0],
        claim: "Independent mastery is unknown because no academic evidence is available.",
        evidenceIds: [],
        confidence: 0.99,
      }],
      academicPredictions: [{
        ...validProgram.academicPredictions[0],
        evidenceIds: [packet.assignment.sourceId],
      }],
    };

    expect(inspectPlannerOutput(program, packet).hardFailures).toEqual([]);
  });

  it("flags fabricated evidence and practice-as-mastery claims", () => {
    const invalid: PlannerProgram = {
      ...validProgram,
      assumptions: [{
        ...validProgram.assumptions[0],
        evidenceIds: ["evidence:does-not-exist"],
      }],
      academicPredictions: [{
        ...validProgram.academicPredictions[0],
        maximumClaim: "mastery established from guided practice",
      }],
    };

    const result = inspectPlannerOutput(invalid, packet);
    expect(result.hardFailures).toContain("fabricated_evidence_reference:evidence:does-not-exist");
    expect(result.hardFailures).toContain("practice_claims_mastery");
  });
});
