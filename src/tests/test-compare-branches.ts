import { describe, it, expect } from "vitest";
import {
  compareSession,
  compositeScore,
  type CompositeMetricScores,
} from "../scripts/compare-branches";

const FIXTURE_LOG = `
  🎮 [audit] component=transcript action=accepted turnState=IDLE
  noise stale_replay_count=1
  🎮 [audit] component=turn action=barge_in
  stale_replay_count=4
  turn_latency_p50_ms=95
  karaoke_completion_pct=92.5
  barge_in_latency_ms=210
  trailing stale_replay_count=9
`;

describe("compareSession", () => {
  it("extracts stale_replay_count from fixture (last occurrence wins)", () => {
    expect(compareSession(FIXTURE_LOG).stale_replay_count).toBe(9);
  });

  it("extracts turn_latency_p50_ms correctly", () => {
    expect(compareSession(FIXTURE_LOG).turn_latency_p50_ms).toBe(95);
  });

  it("extracts karaoke_completion_pct correctly", () => {
    expect(compareSession(FIXTURE_LOG).karaoke_completion_pct).toBe(92.5);
  });

  it("extracts barge_in_latency_ms correctly", () => {
    expect(compareSession(FIXTURE_LOG).barge_in_latency_ms).toBe(210);
  });

  it("returns 0 for missing metrics", () => {
    const m = compareSession("no metrics in this log\nonly noise");
    expect(m.stale_replay_count).toBe(0);
    expect(m.turn_latency_p50_ms).toBe(0);
    expect(m.karaoke_completion_pct).toBe(0);
    expect(m.barge_in_latency_ms).toBe(0);
  });
});

describe("compositeScore", () => {
  const full: CompositeMetricScores = {
    completion: 100,
    hesitationAccuracy: 100,
    latency: 100,
    suppression: 100,
    completeOnce: 100,
  };

  it("returns 100 when all components are 100", () => {
    expect(compositeScore(full)).toBe(100);
  });

  it("returns 0 when all components are 0", () => {
    const z: CompositeMetricScores = {
      completion: 0,
      hesitationAccuracy: 0,
      latency: 0,
      suppression: 0,
      completeOnce: 0,
    };
    expect(compositeScore(z)).toBe(0);
  });

  it("applies weights: completion 30%, hesitation 20%, latency 20%, suppression 15%, complete-once 15%", () => {
    const onlyCompletion: CompositeMetricScores = {
      completion: 100,
      hesitationAccuracy: 0,
      latency: 0,
      suppression: 0,
      completeOnce: 0,
    };
    expect(compositeScore(onlyCompletion)).toBe(30);

    const mid: CompositeMetricScores = {
      completion: 100,
      hesitationAccuracy: 100,
      latency: 50,
      suppression: 50,
      completeOnce: 50,
    };
    // 30 + 20 + 10 + 7.5 + 7.5 = 75
    expect(compositeScore(mid)).toBe(75);
  });

  it("returns a number between 0 and 100 for mixed inputs", () => {
    const s = compositeScore({
      completion: 80,
      hesitationAccuracy: 70,
      latency: 60,
      suppression: 50,
      completeOnce: 40,
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBe(63.5);
  });
});
