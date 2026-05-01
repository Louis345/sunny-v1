import { describe, expect, it } from "vitest";
import { evaluateQuestThreshold } from "./questThreshold";
import type { ErrorSignal } from "../../algorithms/types";

describe("quest threshold", () => {
  it("unlocks after 3+ sessions and a high-confidence repeated pattern", () => {
    const result = evaluateQuestThreshold({
      totalSessions: 3,
      patterns: [signal({ confidence: 0.74, sessionCount: 2 })],
    });

    expect(result.unlocked).toBe(true);
    expect(result.reason).toBe("pattern_ready");
  });

  it("stays locked below three completed sessions", () => {
    const result = evaluateQuestThreshold({
      totalSessions: 2,
      patterns: [signal({ confidence: 0.9, sessionCount: 3 })],
    });

    expect(result.unlocked).toBe(false);
    expect(result.reason).toBe("needs_more_sessions");
  });

  it("stays locked when pattern confidence is below threshold", () => {
    const result = evaluateQuestThreshold({
      totalSessions: 3,
      patterns: [signal({ confidence: 0.69, sessionCount: 3 })],
    });

    expect(result.unlocked).toBe(false);
    expect(result.reason).toBe("needs_confirmed_pattern");
  });

  it("stays locked when the pattern appears in only one session", () => {
    const result = evaluateQuestThreshold({
      totalSessions: 4,
      patterns: [signal({ confidence: 0.95, sessionCount: 1 })],
    });

    expect(result.unlocked).toBe(false);
    expect(result.reason).toBe("needs_confirmed_pattern");
  });
});

function signal(overrides: Partial<ErrorSignal>): ErrorSignal {
  return {
    errorType: "spelling:vowel_omission",
    frequency: 3,
    consistency: 0.9,
    confidence: 0.9,
    sessionCount: 3,
    lastSeen: "2026-04-29T10:00:00.000Z",
    exampleTargets: ["blister", "cluster", "monster"],
    positions: [2, 1],
    domain: "spelling",
    ...overrides,
  };
}
