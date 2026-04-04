import { describe, it, expect } from "vitest";
import { evaluateMasteryGate } from "./masteryGating";
import type { MasteryParams, StepSessionRecord } from "./types";

const DEFAULT_PARAMS: MasteryParams = {
  gateAccuracy: 0.80,
  gateSessions: 3,
  regressionThreshold: 0.60,
  regressionSessions: 2,
};

function makeSessions(accuracies: number[]): StepSessionRecord[] {
  return accuracies.map((accuracy, i) => ({
    sessionDate: `2026-04-0${i + 1}`,
    wordsAttempted: 10,
    wordsCorrect: Math.round(accuracy * 10),
    accuracy,
  }));
}

describe("evaluateMasteryGate", () => {
  it("returns locked when fewer than gateSessions at threshold", () => {
    const result = evaluateMasteryGate({
      currentStep: 1,
      stepSessionHistory: makeSessions([0.9, 0.85]),
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("locked");
    expect(result.sessionsAtThreshold).toBe(2);
    expect(result.requiredSessions).toBe(3);
  });

  it("returns ready_to_advance when 3 consecutive sessions >= 80%", () => {
    const result = evaluateMasteryGate({
      currentStep: 1,
      stepSessionHistory: makeSessions([0.85, 0.90, 0.80]),
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("ready_to_advance");
    expect(result.sessionsAtThreshold).toBe(3);
  });

  it("only counts consecutive sessions from the end", () => {
    const result = evaluateMasteryGate({
      currentStep: 1,
      stepSessionHistory: makeSessions([0.90, 0.50, 0.85, 0.90]),
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("locked");
    expect(result.sessionsAtThreshold).toBe(2);
  });

  it("returns regressed when 2 consecutive sessions < 60%", () => {
    const result = evaluateMasteryGate({
      currentStep: 3,
      stepSessionHistory: makeSessions([0.55, 0.50]),
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("regressed");
    expect(result.regressionTarget).toBe(2);
  });

  it("never regresses below step 1", () => {
    const result = evaluateMasteryGate({
      currentStep: 1,
      stepSessionHistory: makeSessions([0.30, 0.40]),
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("regressed");
    expect(result.regressionTarget).toBe(1);
  });

  it("never advances more than one step", () => {
    const result = evaluateMasteryGate({
      currentStep: 2,
      stepSessionHistory: makeSessions([1.0, 1.0, 1.0, 1.0, 1.0]),
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("ready_to_advance");
    expect(result.currentStep).toBe(2);
  });

  it("handles empty session history as locked", () => {
    const result = evaluateMasteryGate({
      currentStep: 1,
      stepSessionHistory: [],
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("locked");
    expect(result.sessionsAtThreshold).toBe(0);
  });

  it("handles mixed recent results correctly", () => {
    const result = evaluateMasteryGate({
      currentStep: 2,
      stepSessionHistory: makeSessions([0.80, 0.85, 0.70, 0.90, 0.82]),
      params: DEFAULT_PARAMS,
    });
    expect(result.gate).toBe("locked");
    expect(result.sessionsAtThreshold).toBe(2);
  });
});
