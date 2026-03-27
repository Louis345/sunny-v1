/**
 * Contract: Store pool uses only domain-valid amounts; empty pool = caller uses game defaults.
 */
import { describe, it, expect } from "vitest";
import { buildSanitizedStorePool } from "../server/worksheet-truth";

describe("store game pool sanitization", () => {
  it("includes only trusted amounts (≤100¢ on coin worksheets)", () => {
    const pool = buildSanitizedStorePool({
      worksheetDomain: "coin_counting",
      amounts: [18, 35, 51, 75, 118, 155],
    });
    const prices = pool.map((item) => item.price);
    expect(prices).toContain(18);
    expect(prices).toContain(35);
    expect(prices).toContain(51);
    expect(prices).toContain(75);
    expect(prices).not.toContain(118);
    expect(prices).not.toContain(155);
  });

  it("returns empty array when all amounts are suspect", () => {
    const pool = buildSanitizedStorePool({
      worksheetDomain: "coin_counting",
      amounts: [118, 155, 200],
    });
    expect(pool).toEqual([]);
  });

  it("assigns stable emoji/name to each price", () => {
    const pool = buildSanitizedStorePool({
      worksheetDomain: "coin_counting",
      amounts: [18, 35],
    });
    expect(pool.length).toBe(2);
    expect(pool[0]).toHaveProperty("emoji");
    expect(pool[0]).toHaveProperty("name");
    expect(pool[0]).toHaveProperty("price");
  });

  it("deduplicates identical amounts", () => {
    const pool = buildSanitizedStorePool({
      worksheetDomain: "coin_counting",
      amounts: [25, 25, 50, 50],
    });
    const prices = pool.map((item) => item.price);
    expect(prices).toEqual([25, 50]);
  });
});
