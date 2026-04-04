import { describe, it, expect } from "vitest";
import { assessDifficulty } from "./desirableDifficulty";
import type { DifficultyParams } from "./types";

const DEFAULT_PARAMS: DifficultyParams = {
  targetAccuracy: 0.70,
  easyThreshold: 0.85,
  hardThreshold: 0.50,
  breakThreshold: 0.40,
  windowSize: 8,
};

function makeAttempts(
  results: boolean[],
  baseTime = "2026-04-01T10:00:00Z",
): { correct: boolean; timestamp: string }[] {
  return results.map((correct, i) => ({
    correct,
    timestamp: new Date(new Date(baseTime).getTime() + i * 60_000).toISOString(),
  }));
}

describe("assessDifficulty", () => {
  it("signals too_easy when accuracy > 85% over windowSize", () => {
    const attempts = makeAttempts([true, true, true, true, true, true, true, true]);
    const result = assessDifficulty({ recentAttempts: attempts, params: DEFAULT_PARAMS });
    expect(result.zone).toBe("too_easy");
    expect(result.recommendation).toBe("increase_difficulty");
  });

  it("signals optimal when accuracy is 50-85%", () => {
    const attempts = makeAttempts([true, true, true, false, true, false, true, true]);
    const result = assessDifficulty({ recentAttempts: attempts, params: DEFAULT_PARAMS });
    expect(result.zone).toBe("optimal");
    expect(result.recommendation).toBe("maintain");
  });

  it("signals too_hard when accuracy < 50% but >= 40% over last 5", () => {
    const attempts = makeAttempts([true, false, true, false, false]);
    const result = assessDifficulty({ recentAttempts: attempts, params: DEFAULT_PARAMS });
    expect(result.zone).toBe("too_hard");
    expect(result.recommendation).toBe("decrease_difficulty");
  });

  it("signals break_needed when accuracy < 40% over last 5", () => {
    const attempts = makeAttempts([false, false, false, false, true]);
    const result = assessDifficulty({ recentAttempts: attempts, params: DEFAULT_PARAMS });
    expect(result.zone).toBe("break_needed");
    expect(result.recommendation).toBe("take_break");
  });

  it("signals break_needed on 3 consecutive wrong", () => {
    const attempts = makeAttempts([true, true, false, false, false]);
    const result = assessDifficulty({ recentAttempts: attempts, params: DEFAULT_PARAMS });
    expect(result.zone).toBe("break_needed");
    expect(result.recommendation).toBe("take_break");
  });

  it("returns currentAccuracy reflecting the window", () => {
    const attempts = makeAttempts([true, false, true, false, true, false, true, false]);
    const result = assessDifficulty({ recentAttempts: attempts, params: DEFAULT_PARAMS });
    expect(result.currentAccuracy).toBeCloseTo(0.5, 1);
  });

  it("handles empty attempts gracefully", () => {
    const result = assessDifficulty({ recentAttempts: [], params: DEFAULT_PARAMS });
    expect(result.zone).toBe("optimal");
    expect(result.confidence).toBe(0);
  });

  it("confidence scales with sample size relative to windowSize", () => {
    const few = makeAttempts([true, true]);
    const full = makeAttempts([true, true, true, true, true, true, true, true]);
    const fewResult = assessDifficulty({ recentAttempts: few, params: DEFAULT_PARAMS });
    const fullResult = assessDifficulty({ recentAttempts: full, params: DEFAULT_PARAMS });
    expect(fullResult.confidence).toBeGreaterThan(fewResult.confidence);
  });
});
