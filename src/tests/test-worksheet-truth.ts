/**
 * Contract: WorksheetProblemTruth is the single source for downstream consumers.
 */
import { describe, it, expect } from "vitest";
import { buildProblemTruth } from "../server/worksheet-truth";

describe("WorksheetProblemTruth", () => {
  it("marks extraction values as trusted when they pass domain sanity", () => {
    const truth = buildProblemTruth({
      problemId: "1",
      kind: "compare_amounts",
      extractedLeftCents: 51,
      extractedRightCents: 75,
      worksheetDomain: "coin_counting",
    });
    expect(truth.leftCents.value).toBe(51);
    expect(truth.leftCents.confidence).toBe("trusted");
    expect(truth.rightCents.value).toBe(75);
    expect(truth.rightCents.confidence).toBe("trusted");
    expect(truth.usableForReveal).toBe(true);
    expect(truth.usableForGamePool).toBe(true);
  });

  it("marks extraction values as suspect when they fail domain sanity", () => {
    const truth = buildProblemTruth({
      problemId: "2",
      kind: "compare_amounts",
      extractedLeftCents: 118,
      extractedRightCents: 155,
      worksheetDomain: "coin_counting",
    });
    expect(truth.leftCents.confidence).toBe("suspect");
    expect(truth.rightCents.confidence).toBe("suspect");
    expect(truth.leftCents.candidateCorrection).toBe(18);
    expect(truth.rightCents.candidateCorrection).toBe(55);
    expect(truth.usableForReveal).toBe(false);
    expect(truth.usableForGamePool).toBe(false);
  });

  it("provides context injection that includes confidence warnings", () => {
    const truth = buildProblemTruth({
      problemId: "2",
      kind: "compare_amounts",
      extractedLeftCents: 118,
      extractedRightCents: 155,
      worksheetDomain: "coin_counting",
    });
    const ctx = truth.toContextInjection();
    expect(ctx).toContain("OCR may have misread");
    expect(ctx).toMatch(/worksheet image|source of truth/i);
    expect(ctx).not.toContain("Let's slow down");
    expect(ctx).not.toContain("The bigger amount here is");
  });

  it("provides context injection for trusted values without warnings", () => {
    const truth = buildProblemTruth({
      problemId: "1",
      kind: "compare_amounts",
      extractedLeftCents: 51,
      extractedRightCents: 75,
      worksheetDomain: "coin_counting",
    });
    const ctx = truth.toContextInjection();
    expect(ctx).toContain("51");
    expect(ctx).toContain("75");
    expect(ctx).not.toContain("OCR may have misread");
  });

  it("formats reveal facts (not template reveal sentences) for the model", () => {
    const truth = buildProblemTruth({
      problemId: "1",
      kind: "compare_amounts",
      extractedLeftCents: 51,
      extractedRightCents: 75,
      worksheetDomain: "coin_counting",
    });
    const revealFacts = truth.getRevealFacts();
    expect(revealFacts).toEqual(
      expect.objectContaining({
        correctAnswer: expect.any(String),
        hint: expect.any(String),
      }),
    );
    expect(revealFacts?.correctAnswer).not.toMatch(/^Let's/);
    expect(revealFacts?.correctAnswer).not.toMatch(/Take another look/);
  });

  it("returns null reveal facts when values are suspect", () => {
    const truth = buildProblemTruth({
      problemId: "2",
      kind: "compare_amounts",
      extractedLeftCents: 118,
      extractedRightCents: 155,
      worksheetDomain: "coin_counting",
    });
    expect(truth.getRevealFacts()).toBeNull();
  });
});
