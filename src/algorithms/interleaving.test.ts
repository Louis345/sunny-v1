import { describe, it, expect } from "vitest";
import { selectNextProblemType } from "./interleaving";
import type { InterleavingInput, InterleavingParams } from "./types";

const DEFAULT_PARAMS: InterleavingParams = {
  weakestWeight: 0.50,
  secondWeight: 0.30,
  randomWeight: 0.20,
  minTypeExposure: 0.15,
};

describe("selectNextProblemType", () => {
  it("never selects the same type as the most recent attempt", () => {
    const input: InterleavingInput = {
      availableTypes: ["addition", "subtraction"],
      recentHistory: [{ type: "addition", correct: true }],
      performanceByType: {
        addition: { correct: 10, total: 10 },
        subtraction: { correct: 0, total: 10 },
      },
      params: DEFAULT_PARAMS,
    };
    const result = selectNextProblemType(input);
    expect(result.nextType).toBe("subtraction");
  });

  it("weights toward the weakest type (lowest accuracy)", () => {
    const counts = { addition: 0, subtraction: 0, coins: 0 };
    for (let i = 0; i < 200; i++) {
      const input: InterleavingInput = {
        availableTypes: ["addition", "subtraction", "coins"],
        recentHistory: i === 0 ? [] : [{ type: "coins", correct: true }],
        performanceByType: {
          addition: { correct: 9, total: 10 },
          subtraction: { correct: 2, total: 10 },
          coins: { correct: 7, total: 10 },
        },
        params: DEFAULT_PARAMS,
      };
      const result = selectNextProblemType(input);
      counts[result.nextType as keyof typeof counts]++;
    }
    expect(counts.subtraction).toBeGreaterThan(counts.addition);
    expect(counts.subtraction).toBeGreaterThan(counts.coins);
  });

  it("returns a result with typeAccuracies for all available types", () => {
    const input: InterleavingInput = {
      availableTypes: ["addition", "subtraction"],
      recentHistory: [],
      performanceByType: {
        addition: { correct: 5, total: 10 },
        subtraction: { correct: 3, total: 10 },
      },
      params: DEFAULT_PARAMS,
    };
    const result = selectNextProblemType(input);
    expect(result.typeAccuracies).toHaveProperty("addition");
    expect(result.typeAccuracies).toHaveProperty("subtraction");
    expect(result.typeAccuracies.addition).toBeCloseTo(0.5, 2);
    expect(result.typeAccuracies.subtraction).toBeCloseTo(0.3, 2);
  });

  it("handles empty history gracefully", () => {
    const input: InterleavingInput = {
      availableTypes: ["addition", "subtraction", "coins"],
      recentHistory: [],
      performanceByType: {
        addition: { correct: 0, total: 0 },
        subtraction: { correct: 0, total: 0 },
        coins: { correct: 0, total: 0 },
      },
      params: DEFAULT_PARAMS,
    };
    const result = selectNextProblemType(input);
    expect(input.availableTypes).toContain(result.nextType);
  });

  it("handles single available type", () => {
    const input: InterleavingInput = {
      availableTypes: ["addition"],
      recentHistory: [],
      performanceByType: { addition: { correct: 5, total: 10 } },
      params: DEFAULT_PARAMS,
    };
    const result = selectNextProblemType(input);
    expect(result.nextType).toBe("addition");
  });

  it("provides a reason for the selection", () => {
    const input: InterleavingInput = {
      availableTypes: ["addition", "subtraction"],
      recentHistory: [{ type: "addition", correct: true }],
      performanceByType: {
        addition: { correct: 9, total: 10 },
        subtraction: { correct: 1, total: 10 },
      },
      params: DEFAULT_PARAMS,
    };
    const result = selectNextProblemType(input);
    expect(["weakest_type", "variety", "random"]).toContain(result.reason);
  });
});
