import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ComparisonBudget,
  buildStagePrompt,
  buildEngineerRequest,
  copyHistoricalBenchmark,
  evaluateComparison,
  renderComparisonReport,
  structuredToolForStage,
  validateCurriculumPacket,
  validateDecisionEvidence,
  validateExperienceIsolation,
  validateUpstreamHash,
  type ComparisonArm,
  type DecisionRecord,
  type SharedComparisonInput,
} from "./runPlannerPersonaComparison";

const sharedInput: SharedComparisonInput = {
  assignmentId: "LAB-MATH-C",
  assignmentText: "Arrange equal groups and reason about missing factors.",
  childContext: {
    age: 9,
    grade: 3,
    observations: [
      { evidenceId: "profile:age-grade", fact: "The learner is nine years old and in Grade 3." },
    ],
  },
  historicalEvidence: [
    { evidenceId: "observation:transfer-1", fact: "Solved one unseen equal-groups item independently." },
  ],
  academicTarget: "Use equal groups, arrays, and missing factors to represent multiplication.",
  viewport: { width: 1365, height: 768 },
};

function prompt(stage: "academic_lead" | "curriculum_writer" | "experience_architect" | "experience_engineer", arm: ComparisonArm) {
  return buildStagePrompt({
    stage,
    arm,
    sharedInput,
    upstream: { immutableHash: "upstream-hash", content: { contract: "frozen" } },
  });
}

describe("three-way persona pipeline comparison", () => {
  it.each([
    "academic_lead",
    "curriculum_writer",
    "experience_architect",
    "experience_engineer",
  ] as const)("changes only the personality block for %s", (stage) => {
    const neutral = prompt(stage, "neutral");
    const personality = prompt(stage, "personality");

    expect(neutral.sharedContract).toBe(personality.sharedContract);
    expect(neutral.sharedContractHash).toBe(personality.sharedContractHash);
    expect(neutral.personalityBlock).not.toBe(personality.personalityBlock);
    expect(neutral.request.replace(neutral.personalityBlock, "<PERSONALITY>"))
      .toBe(personality.request.replace(personality.personalityBlock, "<PERSONALITY>"));
  });

  it("preserves the historical benchmark byte-for-byte", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-persona-history-"));
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "experience.html"), "<!doctype html><title>Shape-Shifting Crate</title>");
    fs.writeFileSync(path.join(source, "design-artifact.json"), "{\"artifactId\":\"shape-shifting-crate\"}\n");

    const copied = copyHistoricalBenchmark(source, destination);
    const hash = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

    expect(copied.htmlHash).toBe(hash(path.join(source, "experience.html")));
    expect(hash(path.join(destination, "experience.html"))).toBe(copied.htmlHash);
    expect(hash(path.join(destination, "design-artifact.json"))).toBe(copied.designArtifactHash);
  });

  it("rejects downstream content that changes the immutable upstream hash", () => {
    expect(validateUpstreamHash("expected", { upstreamHash: "expected" })).toEqual({ valid: true });
    expect(validateUpstreamHash("expected", { upstreamHash: "changed" })).toEqual({
      valid: false,
      reason: "upstream_hash_changed",
    });
  });

  it("requires every decision evidence id to resolve to the frozen packet", () => {
    const decisions: DecisionRecord[] = [{
      decisionId: "decision-1",
      decision: "Begin with one modeled equal-groups example.",
      evidenceIds: ["profile:age-grade", "observation:transfer-1"],
      confidence: 0.68,
      uncertainty: "No delayed independent evidence exists.",
      falsifyingEvidence: ["Independent transfer succeeds without the model."],
      measurementKeys: ["timeToFirstValidActionMs", "independentCorrect"],
    }];

    expect(validateDecisionEvidence(decisions, sharedInput)).toEqual({ valid: true, unresolvedEvidenceIds: [] });
    expect(validateDecisionEvidence([{ ...decisions[0], evidenceIds: ["invented:evidence"] }], sharedInput))
      .toEqual({ valid: false, unresolvedEvidenceIds: ["invented:evidence"] });
  });

  it("constrains provider tool output to the exact DecisionRecord contract", () => {
    const academic = structuredToolForStage("academic_lead", "academic-source-hash");
    const architect = structuredToolForStage("experience_architect", "curriculum-hash");
    const academicDecision = (academic.input_schema as any).properties.assumptions.items;
    const architectDecision = (architect.input_schema as any).properties.decisionRecords.items;

    for (const schema of [academicDecision, architectDecision]) {
      expect(schema.required).toEqual([
        "decisionId",
        "decision",
        "evidenceIds",
        "confidence",
        "uncertainty",
        "falsifyingEvidence",
        "measurementKeys",
      ]);
      expect(schema.properties.confidence).toMatchObject({ type: "number", minimum: 0, maximum: 1 });
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it("makes the immediate upstream hash unambiguous in both prompt and provider schema", () => {
    const built = buildStagePrompt({
      stage: "curriculum_writer",
      arm: "neutral",
      sharedInput,
      upstream: {
        immutableHash: "charter-hash",
        content: { upstreamHash: "assignment-hash", charterId: "charter-1" },
      },
    });
    const tool = structuredToolForStage("curriculum_writer", "charter-hash");

    expect(built.request).toContain("required output upstreamHash is exactly: charter-hash");
    expect(built.request).toContain("Do not copy an older upstreamHash nested inside the upstream content");
    expect((tool.input_schema as any).properties.upstreamHash.enum).toEqual(["charter-hash"]);
  });

  it("counts failed calls and refuses to start a call that could exceed six dollars", () => {
    const budget = new ComparisonBudget({ maxCalls: 8, maxCostUsd: 6 });
    budget.record({ arm: "neutral", stage: "academic_lead", status: "complete", costUsd: 1.25 });
    budget.record({ arm: "personality", stage: "academic_lead", status: "failed", costUsd: 0.4 });

    expect(budget.snapshot()).toMatchObject({ attempts: 2, spentUsd: 1.65, failedAttempts: 1 });
    expect(budget.canStart({ maximumPossibleCostUsd: 4.34 })).toEqual({ allowed: true });
    expect(budget.canStart({ maximumPossibleCostUsd: 4.36 })).toEqual({
      allowed: false,
      reason: "cost_ceiling_would_be_exceeded",
    });
  });

  it("marks only the malformed arm incomplete and stops its dependent stages", () => {
    const result = evaluateComparison({
      historical: { playable: true },
      neutral: { completedStages: ["academic_lead"], failure: "malformed_curriculum_packet" },
      personality: {
        completedStages: ["academic_lead", "curriculum_writer", "experience_architect", "experience_engineer"],
        playable: true,
      },
      totalNewCostUsd: 2.4,
    });

    expect(result.status).toBe("INCOMPLETE");
    expect(result.armStatus.neutral).toBe("INCOMPLETE");
    expect(result.armStatus.personality).toBe("COMPLETE");
    expect(result.dependentStagesToRun.neutral).toEqual([]);
  });

  it("rejects generated experiences that can write Sunny state", () => {
    expect(validateExperienceIsolation("<!doctype html><button>Play</button>")).toEqual({ valid: true, violations: [] });
    expect(validateExperienceIsolation("<script>fetch('/api/learning/reina')</script>")).toEqual({
      valid: false,
      violations: ["sunny_api_access"],
    });
    expect(validateExperienceIsolation("<script>localStorage.setItem('coins','10')</script>")).toEqual({
      valid: false,
      violations: ["persistent_browser_state"],
    });
  });

  it("accepts a valid multi-part answer contract", () => {
    expect(validateCurriculumPacket({
      items: [{
        itemId: "item-multi",
        prompt: "Classify a and b.",
        options: ["a: multiply", "a: find factor", "b: multiply", "b: find factor"],
        correctAnswer: { a: "multiply", b: "find factor" },
        responseContract: { type: "multi_part_classification" },
        sourceLineage: { evidenceIds: ["observation:transfer-1"] },
        exposure: "new",
        academicTarget: sharedInput.academicTarget,
      }, ...Array.from({ length: 4 }, (_, index) => ({
        itemId: `item-${index}`,
        prompt: "Choose.",
        options: ["yes", "no"],
        correctAnswer: "yes",
        responseContract: { type: "single_selection" },
        sourceLineage: { evidenceIds: ["observation:transfer-1"] },
        exposure: "new",
        academicTarget: sharedInput.academicTarget,
      }))],
    })).toBeNull();
  });

  it("reserves the engineer output budget for HTML instead of hidden reasoning", () => {
    const request = buildEngineerRequest("Implement this frozen design.");
    expect(request).not.toHaveProperty("thinking");
    expect(request.max_tokens).toBeGreaterThanOrEqual(26_000);
  });

  it("keeps provenance and cost hidden until the human reveals them", () => {
    const html = renderComparisonReport({
      candidateOrder: ["personality", "historical", "neutral"],
      candidates: {
        historical: { title: "Candidate B", experiencePath: "historical/experience.html" },
        neutral: { title: "Candidate C", experiencePath: "neutral/experience.html" },
        personality: { title: "Candidate A", experiencePath: "personality/experience.html" },
      },
      provenance: {
        historical: { label: "Historical", costUsd: 0.83113 },
        neutral: { label: "Neutral", costUsd: 1.1 },
        personality: { label: "Personality", costUsd: 1.2 },
      },
    });

    expect(html).toContain("Reveal provenance and cost");
    expect(html).toContain("data-provenance hidden");
    expect(html).not.toMatch(/Historical<\/th>|Neutral<\/th>|Personality<\/th>/);
    expect(html).toContain("JSON.parse(atob(");
  });
});
