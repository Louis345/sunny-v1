import { classifyKaraokeWordMatch } from "./karaokeMatchWord";

export const PRONUNCIATION_LATENCY_HEAT_THRESHOLD = 3;
export const PRONUNCIATION_LATENCY_COMBO_THRESHOLD = 8;

export type PronunciationFlowTier = "normal" | "heat" | "flow" | "combo";

export type PronunciationLatencyOutcome = "hit" | "miss";

export type PronunciationLatencySpan = {
  type: "pronunciation_latency_span";
  game: "pronunciation";
  target: string;
  wordIndex: number;
  attempt: number;
  outcome: PronunciationLatencyOutcome;
  flowTier: PronunciationFlowTier;
  flowRound: number;
  heatMode: boolean;
  tempoMultiplier: number;
  windowMs: number;
  wordVisibleAt: number;
  firstInterimAt: number | null;
  outcomeAt: number;
  firstInterimMs: number | null;
  scoreLoopMs: number;
  marginMs: number;
  staleTailMs: number;
  lastHeard: string;
};

export type PronunciationLatencyTierAggregate = {
  flowTier: PronunciationFlowTier;
  count: number;
  p50ScoreLoopMs: number;
  p95ScoreLoopMs: number;
  p50MarginMs: number;
  p95MarginMs: number;
  negativeMarginCount: number;
};

export type PronunciationFlowStateGateFailure = {
  code: string;
  flowTier: PronunciationFlowTier;
  message: string;
  evidence: string;
};

export type PronunciationFlowStateGateResult = {
  pass: boolean;
  aggregates: PronunciationLatencyTierAggregate[];
  failures: PronunciationFlowStateGateFailure[];
};

const DEFAULT_MIN_P95_MARGIN_MS: Record<PronunciationFlowTier, number> = {
  normal: 800,
  heat: 350,
  flow: 150,
  combo: 0,
};

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function tokenMatchesTarget(heard: string, target: string): boolean {
  return classifyKaraokeWordMatch(heard, target, { mode: "pronunciation" }) === "match";
}

export function resolvePronunciationFlowTier(input: {
  hitStreak: number;
  flowRound: number;
}): PronunciationFlowTier {
  if (input.hitStreak >= PRONUNCIATION_LATENCY_COMBO_THRESHOLD) return "combo";
  if (input.flowRound > 0) return "flow";
  if (input.hitStreak >= PRONUNCIATION_LATENCY_HEAT_THRESHOLD) return "heat";
  return "normal";
}

export class PronunciationLatencyAttemptTracker {
  private attemptStartedAt = 0;
  private firstInterimAt: number | null = null;
  private staleTailAccumMs = 0;
  private lastSampleAt = 0;
  private active = false;

  beginWordAttempt(at = performance.now()): void {
    this.attemptStartedAt = at;
    this.firstInterimAt = null;
    this.staleTailAccumMs = 0;
    this.lastSampleAt = at;
    this.active = true;
  }

  noteInterim(
    transcript: string,
    expectedTarget: string,
    at = performance.now(),
  ): void {
    if (!this.active) return;
    const trimmed = transcript.trim();
    if (trimmed && this.firstInterimAt === null) {
      this.firstInterimAt = at;
    }
    if (this.lastSampleAt > 0) {
      const delta = Math.max(0, at - this.lastSampleAt);
      const tail = trimmed.split(/\s+/).filter(Boolean).at(-1) ?? "";
      if (tail && expectedTarget && !tokenMatchesTarget(tail, expectedTarget)) {
        this.staleTailAccumMs += delta;
      }
    }
    this.lastSampleAt = at;
  }

  finishAttempt(input: {
    target: string;
    wordIndex: number;
    attempt: number;
    outcome: PronunciationLatencyOutcome;
    flowTier: PronunciationFlowTier;
    flowRound: number;
    heatMode: boolean;
    tempoMultiplier: number;
    windowMs: number;
    lastHeard: string;
    at?: number;
  }): PronunciationLatencySpan {
    const outcomeAt = input.at ?? performance.now();
    if (this.active && this.lastSampleAt > 0) {
      this.noteInterim(input.lastHeard, input.target, outcomeAt);
    }
    const scoreLoopMs = Math.max(0, Math.round(outcomeAt - this.attemptStartedAt));
    const firstInterimMs =
      this.firstInterimAt === null
        ? null
        : Math.max(0, Math.round(this.firstInterimAt - this.attemptStartedAt));
    const span: PronunciationLatencySpan = {
      type: "pronunciation_latency_span",
      game: "pronunciation",
      target: input.target,
      wordIndex: input.wordIndex,
      attempt: input.attempt,
      outcome: input.outcome,
      flowTier: input.flowTier,
      flowRound: input.flowRound,
      heatMode: input.heatMode,
      tempoMultiplier: input.tempoMultiplier,
      windowMs: input.windowMs,
      wordVisibleAt: this.attemptStartedAt,
      firstInterimAt: this.firstInterimAt,
      outcomeAt,
      firstInterimMs,
      scoreLoopMs,
      marginMs: Math.round(input.windowMs - scoreLoopMs),
      staleTailMs: Math.round(this.staleTailAccumMs),
      lastHeard: input.lastHeard,
    };
    this.active = false;
    return span;
  }
}

export function aggregatePronunciationLatencySpans(
  spans: PronunciationLatencySpan[],
): PronunciationLatencyTierAggregate[] {
  const tiers: PronunciationFlowTier[] = ["normal", "heat", "flow", "combo"];
  return tiers
    .map((flowTier) => {
      const rows = spans.filter((span) => span.flowTier === flowTier);
      if (rows.length === 0) return null;
      const scoreLoops = rows.map((row) => row.scoreLoopMs);
      const margins = rows.map((row) => row.marginMs);
      return {
        flowTier,
        count: rows.length,
        p50ScoreLoopMs: percentile(scoreLoops, 50),
        p95ScoreLoopMs: percentile(scoreLoops, 95),
        p50MarginMs: percentile(margins, 50),
        p95MarginMs: percentile(margins, 95),
        negativeMarginCount: rows.filter((row) => row.marginMs < 0).length,
      };
    })
    .filter((row): row is PronunciationLatencyTierAggregate => row !== null);
}

export function evaluatePronunciationFlowStateGates(
  spans: PronunciationLatencySpan[],
  minP95MarginMs: Record<PronunciationFlowTier, number> = DEFAULT_MIN_P95_MARGIN_MS,
): PronunciationFlowStateGateResult {
  const aggregates = aggregatePronunciationLatencySpans(spans);
  const failures: PronunciationFlowStateGateFailure[] = [];

  for (const aggregate of aggregates) {
    const minMargin = minP95MarginMs[aggregate.flowTier];
    if (aggregate.p95MarginMs < minMargin) {
      failures.push({
        code: "pronunciation_flow_latency_margin",
        flowTier: aggregate.flowTier,
        message: `Pronunciation ${aggregate.flowTier} tier p95 margin fell below the Guitar Hero window.`,
        evidence: `tier=${aggregate.flowTier} p95MarginMs=${aggregate.p95MarginMs} min=${minMargin} p95ScoreLoopMs=${aggregate.p95ScoreLoopMs} count=${aggregate.count}`,
      });
    }
    if (aggregate.negativeMarginCount > 0 && aggregate.flowTier !== "normal") {
      failures.push({
        code: "pronunciation_flow_timeout_under_tempo",
        flowTier: aggregate.flowTier,
        message: "Pronunciation timed out before STT could score under flow tempo.",
        evidence: `tier=${aggregate.flowTier} negativeMarginCount=${aggregate.negativeMarginCount}`,
      });
    }
  }

  const flowSpans = spans.filter((span) => span.flowTier === "flow" || span.flowTier === "heat");
  const recoverySpans = flowSpans.filter(
    (span) => span.outcome === "hit" && span.attempt > 1 && span.staleTailMs > 0,
  );
  for (const span of recoverySpans) {
    if (span.marginMs < 0) {
      failures.push({
        code: "pronunciation_recovery_failed_under_latency",
        flowTier: span.flowTier,
        message: "Recovered pronunciation hit still missed the tempo window after stale STT tail.",
        evidence: `target=${span.target} attempt=${span.attempt} staleTailMs=${span.staleTailMs} marginMs=${span.marginMs}`,
      });
    }
  }

  return {
    pass: failures.length === 0,
    aggregates,
    failures,
  };
}

export function isPronunciationLatencySpan(value: unknown): value is PronunciationLatencySpan {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PronunciationLatencySpan>;
  return row.type === "pronunciation_latency_span" && typeof row.target === "string";
}
