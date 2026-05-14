import { describe, expect, it } from "vitest";
import { validateActivityPlan } from "./activityPlanValidator";

describe("activity plan validator", () => {
  it("blocks any generated node that has no activity contract", () => {
    const result = validateActivityPlan({
      learnerState: "unknown",
      domainEvidence: {
        practiceDomain: "reading",
        contentDomain: "science",
        primarySkill: "reading_comprehension",
        confidence: 0.92,
        source: "classifier",
      },
      nodes: [
        { id: "n1", toolId: "mystery-thing", purpose: "practice" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "missing_activity_contract",
      nodeId: "n1",
      toolId: "mystery-thing",
    }));
  });

  it("blocks practice-only tools from writing mastery evidence regardless of classifier confidence", () => {
    const result = validateActivityPlan({
      learnerState: "partial",
      domainEvidence: {
        practiceDomain: "spelling",
        contentDomain: "spelling",
        primarySkill: "spelling_recall",
        confidence: 0.2,
        source: "classifier",
      },
      nodes: [
        {
          id: "n1",
          toolId: "word-radar",
          purpose: "practice",
          writesMasteryEvidence: true,
          emitsPerTargetResults: true,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "practice_only_tool_cannot_write_mastery",
      nodeId: "n1",
      toolId: "word-radar",
    }));
  });

  it("blocks mastery-eligible nodes that do not emit per-target results", () => {
    const result = validateActivityPlan({
      learnerState: "partial",
      domainEvidence: {
        practiceDomain: "spelling",
        contentDomain: "spelling",
        primarySkill: "spelling_recall",
        confidence: 0.91,
        source: "classifier",
      },
      nodes: [
        {
          id: "n1",
          toolId: "spell-check",
          purpose: "evaluate",
          writesMasteryEvidence: true,
          emitsPerTargetResults: false,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "mastery_requires_per_target_results",
      nodeId: "n1",
      toolId: "spell-check",
    }));
  });

  it("blocks high-confidence science comprehension from starting with scaffolded practice", () => {
    const result = validateActivityPlan({
      learnerState: "unknown",
      domainEvidence: {
        practiceDomain: "reading",
        contentDomain: "science",
        primarySkill: "reading_comprehension",
        confidence: 0.9,
        source: "classifier",
      },
      nodes: [
        { id: "n1", toolId: "word-radar", purpose: "practice", emitsPerTargetResults: true },
        { id: "n2", toolId: "karaoke", purpose: "guided-practice" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "high_confidence_science_starts_with_scaffolded_practice",
      nodeId: "n1",
      toolId: "word-radar",
    }));
  });

  it("warns instead of blocking when low-confidence domain routing starts with scaffolded practice", () => {
    const result = validateActivityPlan({
      learnerState: "unknown",
      domainEvidence: {
        practiceDomain: "reading",
        contentDomain: "science",
        primarySkill: "reading_comprehension",
        confidence: 0.45,
        source: "classifier",
      },
      nodes: [
        { id: "n1", toolId: "word-radar", purpose: "practice", emitsPerTargetResults: true },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "low_confidence_domain_starts_with_scaffolded_practice",
      nodeId: "n1",
      toolId: "word-radar",
      recommendation: "start-with-general-diagnostic",
    }));
  });

  it("blocks high-confidence spelling from starting with scaffolded practice", () => {
    const result = validateActivityPlan({
      learnerState: "unknown",
      domainEvidence: {
        practiceDomain: "spelling",
        contentDomain: "spelling",
        primarySkill: "spelling_recall",
        confidence: 0.88,
        source: "classifier",
      },
      nodes: [
        { id: "n1", toolId: "word-radar", purpose: "practice", emitsPerTargetResults: true },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "high_confidence_spelling_requires_independent_recall",
      nodeId: "n1",
      toolId: "word-radar",
    }));
  });

  it("allows a high-confidence spelling cohort to warm up when independent recall follows immediately", () => {
    const result = validateActivityPlan({
      learnerState: "unknown",
      domainEvidence: {
        practiceDomain: "spelling",
        contentDomain: "spelling",
        primarySkill: "spelling_recall",
        confidence: 0.88,
        source: "classifier",
      },
      nodes: [
        { id: "n1", toolId: "word-radar", purpose: "practice", emitsPerTargetResults: true },
        { id: "n2", toolId: "spell-check", purpose: "evaluate", emitsPerTargetResults: true },
        { id: "n3", toolId: "monster-stampede", purpose: "practice" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("allows high-confidence science to start with an evaluator before Word Radar practice", () => {
    const result = validateActivityPlan({
      learnerState: "unknown",
      domainEvidence: {
        practiceDomain: "reading",
        contentDomain: "science",
        primarySkill: "reading_comprehension",
        confidence: 0.92,
        source: "classifier",
      },
      nodes: [
        {
          id: "n1",
          toolId: "concept-check",
          purpose: "evaluate",
          writesMasteryEvidence: true,
          emitsPerTargetResults: true,
        },
        { id: "n2", toolId: "word-radar", purpose: "practice", emitsPerTargetResults: true },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("warns when classifier domain signals disagree instead of pretending certainty", () => {
    const result = validateActivityPlan({
      learnerState: "unknown",
      domainEvidence: {
        practiceDomain: "spelling",
        contentDomain: "science",
        primarySkill: "spelling_recall",
        confidence: 0.72,
        source: "classifier",
      },
      nodes: [
        {
          id: "n1",
          toolId: "spelling-recall",
          purpose: "evaluate",
          writesMasteryEvidence: true,
          emitsPerTargetResults: true,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "domain_evidence_conflict",
      recommendation: "confirm-domain-or-start-with-diagnostic",
    }));
  });
});
