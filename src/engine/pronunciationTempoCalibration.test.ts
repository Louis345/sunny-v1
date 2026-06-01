import { describe, expect, it } from "vitest";
import {
  PronunciationTempoCalibrationState,
  PRONUNCIATION_MIN_MARGIN_MS,
  resolvePronunciationWordWindowMs,
  resolveTierSpeedIntent,
  type PronunciationTempoCalibrationSpan,
} from "../shared/pronunciationTempoCalibration";

function span(
  partial: Partial<PronunciationTempoCalibrationSpan> &
    Pick<PronunciationTempoCalibrationSpan, "scoreLoopMs" | "marginMs">,
): PronunciationTempoCalibrationSpan {
  return {
    outcome: partial.outcome ?? "hit",
    scoreLoopMs: partial.scoreLoopMs,
    marginMs: partial.marginMs,
    staleTailMs: partial.staleTailMs ?? 0,
    flowTier: partial.flowTier ?? "normal",
  };
}

describe("resolvePronunciationWordWindowMs", () => {
  it("reaches heat intent when STT is fast", () => {
    const result = resolvePronunciationWordWindowMs({
      baseTravelMs: 3000,
      baseZoneMs: 2000,
      tierSpeedIntent: 1.45,
      rollingP95ScoreLoopMs: 900,
      minMarginMs: PRONUNCIATION_MIN_MARGIN_MS.heat,
      staleTailPenaltyMs: 0,
    });
    expect(result.effectiveMultiplier).toBeGreaterThanOrEqual(1.4);
    expect(result.totalMs).toBeLessThanOrEqual(3500);
  });

  it("holds below heat intent when STT is slow", () => {
    const result = resolvePronunciationWordWindowMs({
      baseTravelMs: 3000,
      baseZoneMs: 2000,
      tierSpeedIntent: 1.45,
      rollingP95ScoreLoopMs: 3200,
      minMarginMs: PRONUNCIATION_MIN_MARGIN_MS.heat,
      staleTailPenaltyMs: 0,
    });
    expect(result.effectiveMultiplier).toBeLessThan(1.45);
    expect(result.totalMs).toBeGreaterThanOrEqual(3200 + PRONUNCIATION_MIN_MARGIN_MS.heat);
  });

  it("widens window when stale tail penalty is high", () => {
    const withoutStale = resolvePronunciationWordWindowMs({
      baseTravelMs: 3000,
      baseZoneMs: 2000,
      tierSpeedIntent: 1.45,
      rollingP95ScoreLoopMs: 2800,
      minMarginMs: PRONUNCIATION_MIN_MARGIN_MS.heat,
      staleTailPenaltyMs: 0,
    });
    const withStale = resolvePronunciationWordWindowMs({
      baseTravelMs: 3000,
      baseZoneMs: 2000,
      tierSpeedIntent: 1.45,
      rollingP95ScoreLoopMs: 2800,
      minMarginMs: PRONUNCIATION_MIN_MARGIN_MS.heat,
      staleTailPenaltyMs: 700,
    });
    expect(withStale.totalMs).toBeGreaterThan(withoutStale.totalMs);
    expect(withStale.reason).toMatch(/stale_tail/);
  });
});

describe("resolveTierSpeedIntent", () => {
  it("combines heat, flow round, hard mode, and support slow", () => {
    expect(
      resolveTierSpeedIntent({
        hitStreak: 3,
        flowRound: 1,
        challengeHard: true,
        supportSlow: false,
        comboBreaker: false,
      }),
    ).toBeGreaterThan(1.45);
  });
});

describe("PronunciationTempoCalibrationState", () => {
  it("blocks heat escalation when recent margins are negative", () => {
    const state = new PronunciationTempoCalibrationState();
    state.recordSpan(span({ scoreLoopMs: 4000, marginMs: -200, flowTier: "heat", outcome: "miss" }));
    state.recordSpan(span({ scoreLoopMs: 3900, marginMs: -100, flowTier: "heat", outcome: "miss" }));
    state.recordSpan(span({ scoreLoopMs: 3800, marginMs: -80, flowTier: "heat", outcome: "miss" }));
    expect(state.canEscalateFlowTier("heat")).toBe(false);
    expect(state.shouldDeescalate().reliefSteps).toBeGreaterThan(0);
  });

  it("allows heat escalation when rolling margins are healthy", () => {
    const state = new PronunciationTempoCalibrationState();
    for (let i = 0; i < 3; i += 1) {
      state.recordSpan(span({ scoreLoopMs: 1200, marginMs: 800, flowTier: "normal", outcome: "hit" }));
    }
    expect(state.canEscalateFlowTier("heat")).toBe(true);
    expect(state.canStartAdaptiveFlow()).toBe(true);
  });

  it("requests de-escalation after consecutive timeout-under-tempo misses", () => {
    const state = new PronunciationTempoCalibrationState();
    state.recordSpan(span({ scoreLoopMs: 3600, marginMs: -50, outcome: "miss" }));
    state.recordSpan(span({ scoreLoopMs: 3500, marginMs: -120, outcome: "miss" }));
    const deesc = state.shouldDeescalate();
    expect(deesc.drop).toBe(true);
    expect(deesc.reason).toBe("negative_margin_streak");
  });
});
