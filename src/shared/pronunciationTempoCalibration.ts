import type { PronunciationFlowTier } from "./pronunciationLatencySpans";

export const PRONUNCIATION_TEMPO_ROLLING_WINDOW = 8;
export const PRONUNCIATION_FLOW_ESCALATION_MIN_SPANS = 3;
export const PRONUNCIATION_STALE_TAIL_P95_CAP_MS = 600;
export const PRONUNCIATION_DEESCALATION_NEGATIVE_MARGIN_STREAK = 2;
export const PRONUNCIATION_STALE_TAIL_RELIEF_STREAK = 2;
export const PRONUNCIATION_TEMPO_RELIEF_MULTIPLIER = 0.85;

export const PRONUNCIATION_MIN_MARGIN_MS: Record<PronunciationFlowTier, number> = {
  normal: 800,
  heat: 350,
  flow: 150,
  combo: 0,
};

export const HEAT_SPEED_MULTIPLIER = 1.45;
export const COMBO_BREAKER_SPEED_MULTIPLIER = 1.7;
export const HEAT_THRESHOLD = 3;
export const COMBO_BREAKER_STREAK = 8;

export type PronunciationTempoCalibrationSpan = {
  outcome: "hit" | "miss";
  scoreLoopMs: number;
  marginMs: number;
  staleTailMs: number;
  flowTier: PronunciationFlowTier;
};

export type TempoCalibrationInput = {
  baseTravelMs: number;
  baseZoneMs: number;
  tierSpeedIntent: number;
  rollingP95ScoreLoopMs: number;
  minMarginMs: number;
  staleTailPenaltyMs: number;
  tempoReliefSteps?: number;
};

export type TempoCalibrationResult = {
  travelMs: number;
  zoneMs: number;
  totalMs: number;
  effectiveMultiplier: number;
  intentMultiplier: number;
  reason: string;
};

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

export function pronunciationFlowSpeedIntent(flowRound: number): number {
  return 1 + Math.min(0.36, Math.max(0, flowRound) * 0.12);
}

export function pronunciationStreakSpeedIntent(hitStreak: number, comboBreaker: boolean): number {
  if (comboBreaker || hitStreak >= COMBO_BREAKER_STREAK) return COMBO_BREAKER_SPEED_MULTIPLIER;
  if (hitStreak >= HEAT_THRESHOLD) return HEAT_SPEED_MULTIPLIER;
  return 1;
}

export function resolveTierSpeedIntent(input: {
  hitStreak: number;
  flowRound: number;
  challengeHard?: boolean;
  supportSlow?: boolean;
  comboBreaker?: boolean;
}): number {
  let intent =
    pronunciationStreakSpeedIntent(input.hitStreak, input.comboBreaker === true) *
    pronunciationFlowSpeedIntent(input.flowRound);
  if (input.challengeHard) intent *= 1.25;
  if (input.supportSlow) intent *= 0.6;
  return intent;
}

export function resolvePronunciationWordWindowMs(
  input: TempoCalibrationInput,
): TempoCalibrationResult {
  const baseTotal = input.baseTravelMs + input.baseZoneMs;
  const intentMultiplier = Math.max(1, input.tierSpeedIntent);
  const reliefSteps = Math.max(0, Math.min(2, input.tempoReliefSteps ?? 0));
  const reliefFactor = Math.pow(PRONUNCIATION_TEMPO_RELIEF_MULTIPLIER, reliefSteps);

  const intentTotal = baseTotal / intentMultiplier;
  const minWindowMs = Math.round(
    input.rollingP95ScoreLoopMs + input.minMarginMs + input.staleTailPenaltyMs,
  );
  const relievedIntentTotal = intentTotal / reliefFactor;
  const targetTotal = Math.max(relievedIntentTotal, minWindowMs, baseTotal / intentMultiplier);

  let effectiveMultiplier = baseTotal / targetTotal;
  effectiveMultiplier = Math.min(intentMultiplier, Math.max(1, effectiveMultiplier));

  const finalTotal = Math.max(Math.round(baseTotal / effectiveMultiplier), minWindowMs);
  const travelMs = Math.round((input.baseTravelMs / baseTotal) * finalTotal);
  const zoneMs = Math.max(0, finalTotal - travelMs);

  let reason = "intent_matched";
  if (reliefSteps > 0) {
    reason = "tempo_relief";
  } else if (input.staleTailPenaltyMs >= 300) {
    reason = "stale_tail_hold";
  } else if (effectiveMultiplier < intentMultiplier * 0.98) {
    reason = "stt_lag_hold";
  } else if (effectiveMultiplier >= intentMultiplier * 0.98 && input.rollingP95ScoreLoopMs < 1200) {
    reason = "stt_fast_full_intent";
  }

  return {
    travelMs,
    zoneMs,
    totalMs: finalTotal,
    effectiveMultiplier: Math.round(effectiveMultiplier * 100) / 100,
    intentMultiplier,
    reason,
  };
}

export type TempoDeescalationAdvice = {
  drop: boolean;
  reason: "negative_margin_streak" | "stale_tail_spike" | "none";
  reliefSteps: number;
};

export class PronunciationTempoCalibrationState {
  private spans: PronunciationTempoCalibrationSpan[] = [];

  recordSpan(span: PronunciationTempoCalibrationSpan): void {
    this.spans = [...this.spans, span].slice(-PRONUNCIATION_TEMPO_ROLLING_WINDOW);
  }

  get spanCount(): number {
    return this.spans.length;
  }

  get rollingP95ScoreLoopMs(): number {
    return percentile(
      this.spans.map((row) => row.scoreLoopMs),
      95,
    );
  }

  get rollingP95MarginMs(): number {
    return percentile(
      this.spans.map((row) => row.marginMs),
      95,
    );
  }

  get rollingP95StaleTailMs(): number {
    return percentile(
      this.spans.map((row) => row.staleTailMs),
      95,
    );
  }

  canEscalateFlowTier(tier: PronunciationFlowTier): boolean {
    if (this.spans.length < PRONUNCIATION_FLOW_ESCALATION_MIN_SPANS) {
      return tier === "normal";
    }
    const recent = this.spans.slice(-PRONUNCIATION_FLOW_ESCALATION_MIN_SPANS);
    const minMargin = PRONUNCIATION_MIN_MARGIN_MS[tier];
    const marginsHealthy = recent.every((row) => row.marginMs >= minMargin);
    const staleHealthy = this.rollingP95StaleTailMs <= PRONUNCIATION_STALE_TAIL_P95_CAP_MS;
    return marginsHealthy && staleHealthy;
  }

  canStartAdaptiveFlow(): boolean {
    return (
      this.canEscalateFlowTier("heat") &&
      this.spans.length >= PRONUNCIATION_FLOW_ESCALATION_MIN_SPANS
    );
  }

  shouldDeescalate(): TempoDeescalationAdvice {
    const recent = this.spans.slice(-PRONUNCIATION_DEESCALATION_NEGATIVE_MARGIN_STREAK);
    const negativeStreak =
      recent.length >= PRONUNCIATION_DEESCALATION_NEGATIVE_MARGIN_STREAK &&
      recent.every((row) => row.outcome === "miss" && row.marginMs < 0);

    if (negativeStreak) {
      return {
        drop: true,
        reason: "negative_margin_streak",
        reliefSteps: 1,
      };
    }

    const staleRecent = this.spans.slice(-PRONUNCIATION_STALE_TAIL_RELIEF_STREAK);
    const staleSpike =
      staleRecent.length >= PRONUNCIATION_STALE_TAIL_RELIEF_STREAK &&
      staleRecent.every((row) => row.staleTailMs >= 400);

    if (staleSpike) {
      return {
        drop: true,
        reason: "stale_tail_spike",
        reliefSteps: 1,
      };
    }

    return { drop: false, reason: "none", reliefSteps: 0 };
  }

  resolveTempoForTier(input: {
    baseTravelMs: number;
    baseZoneMs: number;
    tier: PronunciationFlowTier;
    tierSpeedIntent: number;
    tempoReliefSteps?: number;
  }): TempoCalibrationResult {
    const rollingScore = this.spanCount > 0 ? this.rollingP95ScoreLoopMs : 0;
    const stalePenalty =
      this.spanCount > 0 && this.rollingP95StaleTailMs > 200
        ? Math.round(this.rollingP95StaleTailMs * 0.5)
        : 0;

    return resolvePronunciationWordWindowMs({
      baseTravelMs: input.baseTravelMs,
      baseZoneMs: input.baseZoneMs,
      tierSpeedIntent: input.tierSpeedIntent,
      rollingP95ScoreLoopMs: rollingScore,
      minMarginMs: PRONUNCIATION_MIN_MARGIN_MS[input.tier],
      staleTailPenaltyMs: stalePenalty,
      tempoReliefSteps: input.tempoReliefSteps,
    });
  }
}

export function isRecoverablePronunciationTranscriptTail(window: {
  contaminated: boolean;
  scoringText: string;
  reasons: string[];
}): boolean {
  return Boolean(
    window.contaminated &&
      window.scoringText.trim() &&
      window.reasons.includes("transcript_tail"),
  );
}
