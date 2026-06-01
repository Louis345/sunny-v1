import { describe, expect, it } from "vitest";
import {
  PronunciationLatencyAttemptTracker,
  aggregatePronunciationLatencySpans,
  evaluatePronunciationFlowStateGates,
  resolvePronunciationFlowTier,
  type PronunciationLatencySpan,
} from "../shared/pronunciationLatencySpans";

function makeSpan(
  partial: Partial<PronunciationLatencySpan> & Pick<PronunciationLatencySpan, "flowTier" | "scoreLoopMs" | "windowMs">,
): PronunciationLatencySpan {
  const marginMs = Math.round(partial.windowMs - partial.scoreLoopMs);
  return {
    type: "pronunciation_latency_span",
    game: "pronunciation",
    target: partial.target ?? "scientist",
    wordIndex: partial.wordIndex ?? 0,
    attempt: partial.attempt ?? 1,
    outcome: partial.outcome ?? "hit",
    flowTier: partial.flowTier,
    flowRound: partial.flowRound ?? 0,
    heatMode: partial.heatMode ?? false,
    tempoMultiplier: partial.tempoMultiplier ?? 1,
    windowMs: partial.windowMs,
    wordVisibleAt: 0,
    firstInterimAt: partial.firstInterimAt ?? null,
    outcomeAt: partial.scoreLoopMs,
    firstInterimMs: partial.firstInterimMs ?? null,
    scoreLoopMs: partial.scoreLoopMs,
    marginMs: partial.marginMs ?? marginMs,
    staleTailMs: partial.staleTailMs ?? 0,
    lastHeard: partial.lastHeard ?? "scientist",
  };
}

describe("pronunciation latency spans", () => {
  it("resolves flow tiers from heat and flow round", () => {
    expect(resolvePronunciationFlowTier({ hitStreak: 1, flowRound: 0 })).toBe("normal");
    expect(resolvePronunciationFlowTier({ hitStreak: 3, flowRound: 0 })).toBe("heat");
    expect(resolvePronunciationFlowTier({ hitStreak: 3, flowRound: 1 })).toBe("flow");
    expect(resolvePronunciationFlowTier({ hitStreak: 8, flowRound: 1 })).toBe("combo");
  });

  it("tracks first interim lag, stale tail, and margin on finish", () => {
    const tracker = new PronunciationLatencyAttemptTracker();
    tracker.beginWordAttempt(1_000);
    tracker.noteInterim("quickly", "scientist", 1_500);
    tracker.noteInterim("sentence scientist", "scientist", 2_200);

    const span = tracker.finishAttempt({
      target: "scientist",
      wordIndex: 6,
      attempt: 2,
      outcome: "hit",
      flowTier: "flow",
      flowRound: 1,
      heatMode: false,
      tempoMultiplier: 1.4,
      windowMs: 3_500,
      lastHeard: "scientist",
      at: 2_400,
    });

    expect(span.firstInterimMs).toBe(500);
    expect(span.scoreLoopMs).toBe(1_400);
    expect(span.marginMs).toBe(2_100);
    expect(span.staleTailMs).toBeGreaterThan(0);
  });

  it("fails flow gates when p95 margin is below tempo budget", () => {
    const spans = [
      makeSpan({ flowTier: "heat", scoreLoopMs: 3_200, windowMs: 3_400 }),
      makeSpan({ flowTier: "heat", scoreLoopMs: 3_300, windowMs: 3_400 }),
      makeSpan({ flowTier: "heat", scoreLoopMs: 3_250, windowMs: 3_400 }),
    ];
    const result = evaluatePronunciationFlowStateGates(spans);
    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.code === "pronunciation_flow_latency_margin")).toBe(
      true,
    );
  });

  it("passes flow gates when score loop stays inside the Guitar Hero window", () => {
    const spans = [
      makeSpan({ flowTier: "heat", scoreLoopMs: 1_200, windowMs: 3_400 }),
      makeSpan({ flowTier: "flow", scoreLoopMs: 1_600, windowMs: 3_100, flowRound: 1 }),
      makeSpan({
        flowTier: "flow",
        scoreLoopMs: 2_000,
        windowMs: 3_100,
        flowRound: 1,
        attempt: 2,
        staleTailMs: 600,
      }),
    ];
    const result = evaluatePronunciationFlowStateGates(spans);
    expect(result.pass).toBe(true);
    expect(aggregatePronunciationLatencySpans(spans)).toHaveLength(2);
  });
});
