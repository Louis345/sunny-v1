/**
 * Contract: Extraction values from OCR must pass domain sanity checks
 * before being surfaced as "facts" in tool responses.
 * Coin worksheets: amounts must be <= 100 cents.
 * Values > 100 are flagged and excluded from facts/game pools.
 */
import { describe, it, expect } from "vitest";
import {
  validateExtractionAmounts,
  buildSanitizedGamePool,
  detectWorksheetDomain,
} from "../server/worksheet-tools";

describe("extraction sanity — coin worksheet amounts", () => {
  it("accepts amounts <= 100¢ for coin worksheets", () => {
    const result = validateExtractionAmounts({
      domain: "coin_counting",
      amounts: [18, 35, 51, 75, 100],
    });
    expect(result.allValid).toBe(true);
    expect(result.flagged).toEqual([]);
  });

  it("flags amounts > 100¢ on coin worksheets as OCR errors", () => {
    const result = validateExtractionAmounts({
      domain: "coin_counting",
      amounts: [118, 155, 51, 75],
    });
    expect(result.allValid).toBe(false);
    expect(result.flagged).toContain(118);
    expect(result.flagged).toContain(155);
    expect(result.valid).toEqual([51, 75]);
  });

  it("suggests candidate corrections for common OCR misreads", () => {
    const result = validateExtractionAmounts({
      domain: "coin_counting",
      amounts: [118, 155],
    });
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ original: 118, candidate: 18 }),
        expect.objectContaining({ original: 155, candidate: 55 }),
      ]),
    );
  });

  it("allows amounts > 100¢ for non-coin worksheets", () => {
    const result = validateExtractionAmounts({
      domain: "general_math",
      amounts: [150, 275],
    });
    expect(result.allValid).toBe(true);
  });

  it("detects coin worksheet domain from subject string", () => {
    expect(detectWorksheetDomain("money comparison and counting")).toBe(
      "coin_counting",
    );
    expect(detectWorksheetDomain("coin counting")).toBe("coin_counting");
    expect(detectWorksheetDomain("counting pennies and quarters")).toBe(
      "coin_counting",
    );
    expect(detectWorksheetDomain("addition and subtraction")).toBe(
      "general_math",
    );
  });
});

describe("sanitized game pool", () => {
  it("includes only trusted amounts", () => {
    const pool = buildSanitizedGamePool({
      domain: "coin_counting",
      amounts: [18, 35, 51, 75, 118, 155],
    });
    const prices = pool.map((item) => item.price);
    expect(prices).toContain(18);
    expect(prices).toContain(75);
    expect(prices).not.toContain(118);
    expect(prices).not.toContain(155);
  });

  it("returns empty array when all amounts are suspect", () => {
    const pool = buildSanitizedGamePool({
      domain: "coin_counting",
      amounts: [118, 155, 200],
    });
    expect(pool).toEqual([]);
  });

  it("deduplicates identical amounts", () => {
    const pool = buildSanitizedGamePool({
      domain: "coin_counting",
      amounts: [25, 25, 50, 50],
    });
    expect(pool).toHaveLength(2);
    expect(pool.map((i) => i.price)).toEqual([25, 50]);
  });

  it("each pool item has emoji, name, and price", () => {
    const pool = buildSanitizedGamePool({
      domain: "coin_counting",
      amounts: [25],
    });
    expect(pool[0]).toHaveProperty("emoji");
    expect(pool[0]).toHaveProperty("name");
    expect(pool[0]).toHaveProperty("price", 25);
  });
});
