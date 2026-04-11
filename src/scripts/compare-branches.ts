/**
 * TASK-001 stub — replaced in green commit with real parsers and CLI.
 * Red phase: wrong exports so tests fail.
 */
export type SessionComparisonMetrics = {
  stale_replay_count: number;
  turn_latency_p50_ms: number;
  karaoke_completion_pct: number;
  barge_in_latency_ms: number;
};

export type CompositeMetricScores = {
  completion: number;
  hesitationAccuracy: number;
  latency: number;
  suppression: number;
  completeOnce: number;
};

export function compareSession(_logContent: string): SessionComparisonMetrics {
  return {
    stale_replay_count: -1,
    turn_latency_p50_ms: -1,
    karaoke_completion_pct: -1,
    barge_in_latency_ms: -1,
  };
}

export function compositeScore(_metrics: CompositeMetricScores): number {
  return -1;
}
