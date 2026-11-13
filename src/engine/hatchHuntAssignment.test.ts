import { describe, expect, it } from "vitest";
import { parseHatchHuntAssignmentConfig } from "../shared/hatchHuntAssignment";

describe("Hatch Hunt assignment validation", () => {
  it("requires assignment provenance and permanently caps the node at practice-only", () => {
    const config = {
      schemaVersion: 1,
      activityId: "hatch-hunt",
      mode: "baseline_assignment",
      encounterId: "encounter:reina:fractions:1",
      childId: "reina",
      homeworkId: "hw-math-fractions",
      domain: "math",
      creatureId: "mossback",
      source: {
        fingerprint: "sha256:worksheet-fractions",
        documentIds: ["upload:fractions-page-1"],
      },
      baselineItems: [{
        id: "baseline:equal-parts",
        targetId: "math.fractions.equal_parts",
        sourceEvidenceIds: ["upload:fractions-page-1:item-1"],
        exposure: "unseen",
        prompt: "How many fourths make one whole?",
        response: { mode: "numeric", correctValue: 4 },
        timerSeconds: null,
      }, {
        id: "baseline:equal-parts-transfer",
        targetId: "math.fractions.equal_parts",
        sourceEvidenceIds: ["upload:fractions-page-1:item-1"],
        exposure: "unseen",
        prompt: "How many halves make one whole?",
        response: { mode: "numeric", correctValue: 2 },
        timerSeconds: null,
      }],
      verificationItems: [{
        id: "verify:equal-shares",
        targetId: "math.fractions.equal_parts",
        sourceEvidenceIds: ["upload:fractions-page-1:item-2"],
        exposure: "unseen",
        prompt: "Why must the pieces be equal?",
        response: { mode: "text", acceptedAnswers: ["they are equal shares"] },
        timerSeconds: null,
      }],
      recoveryByTarget: {
        "math.fractions.equal_parts": [{ id: "recover:equal-parts", prompt: "Use equal shares.", workedExplanation: "Equal pieces make equal shares." }],
      },
      evidencePolicy: {
        purpose: "baseline",
        firstAttemptIndependent: true,
        maximumClaim: "practice_only",
        captureIsAcademicEvidence: false,
      },
    };

    expect(parseHatchHuntAssignmentConfig(config)).toMatchObject({
      homeworkId: "hw-math-fractions",
      evidencePolicy: { maximumClaim: "practice_only" },
    });

    expect(() => parseHatchHuntAssignmentConfig({
      ...config,
      baselineItems: [{ ...config.baselineItems[0], sourceEvidenceIds: [] }],
    })).toThrow(/sourceEvidenceIds/i);
    expect(() => parseHatchHuntAssignmentConfig({
      ...config,
      evidencePolicy: { ...config.evidencePolicy, maximumClaim: "mastery" },
    })).toThrow(/practice_only/i);
    expect(() => parseHatchHuntAssignmentConfig({
      ...config,
      creatureId: "lumipuff",
    })).toThrow(/mossback/i);
    expect(() => parseHatchHuntAssignmentConfig({
      ...config,
      recoveryByTarget: {},
    })).toThrow(/recovery/i);
  });
});
