/**
 * Contract: Extraction values must pass domain-specific sanity checks.
 * Coin worksheets: amounts > 100¢ are flagged (100¢ = $1.00 allowed).
 */
import { describe, it, expect } from "vitest";
import {
  validateExtractionAmounts,
  detectWorksheetDomain,
  COIN_WORKSHEET_MAX_CENTS,
} from "../server/worksheet-truth";

describe("extraction sanity — coin worksheet amounts", () => {
  it("COIN_WORKSHEET_MAX_CENTS is 100", () => {
    expect(COIN_WORKSHEET_MAX_CENTS).toBe(100);
  });

  it("accepts amounts up to and including 100 cents on coin worksheets", () => {
    const result = validateExtractionAmounts({
      worksheetDomain: "coin_counting",
      amounts: [18, 35, 51, 75, 100],
    });
    expect(result.allValid).toBe(true);
    expect(result.flagged).toEqual([]);
  });

  it("flags amounts > 100 cents on coin worksheets as OCR errors", () => {
    const result = validateExtractionAmounts({
      worksheetDomain: "coin_counting",
      amounts: [118, 155, 51, 75, 100],
    });
    expect(result.allValid).toBe(false);
    expect(result.flagged).toContain(118);
    expect(result.flagged).toContain(155);
    expect(result.valid.sort((a, b) => a - b)).toEqual([51, 75, 100]);
  });

  it("suggests candidate corrections for common OCR dollar-sign misreads", () => {
    const result = validateExtractionAmounts({
      worksheetDomain: "coin_counting",
      amounts: [118, 155],
    });
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ original: 118, suggested: 18 }),
        expect.objectContaining({ original: 155, suggested: 55 }),
      ]),
    );
  });

  it("allows amounts > 100 for non-coin worksheets", () => {
    const result = validateExtractionAmounts({
      worksheetDomain: "general_math",
      amounts: [150, 275],
    });
    expect(result.allValid).toBe(true);
  });

  it("detects coin worksheet domain from subject string (best-effort)", () => {
    expect(detectWorksheetDomain("money comparison and counting")).toBe(
      "coin_counting",
    );
    expect(detectWorksheetDomain("coin counting")).toBe("coin_counting");
    expect(detectWorksheetDomain("addition and subtraction")).toBe(
      "general_math",
    );
  });
});
