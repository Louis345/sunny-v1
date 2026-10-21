export interface SparkOrbDifficultyParams {
  level: number;
  captureRadius: number;
  driftAmpScale: number;
}

export const SPARK_ORB_MAX_DIFFICULTY_LEVEL = 4;
const BASE_CAPTURE_RADIUS = 82;
const RADIUS_STEP = 7;
const BASE_DRIFT_SCALE = 0.6;
const DRIFT_SCALE_STEP = 0.25;

export function sparkOrbDifficultyParams(level: number): SparkOrbDifficultyParams {
  const clamped = Math.max(0, Math.min(SPARK_ORB_MAX_DIFFICULTY_LEVEL, Math.round(level)));
  return {
    level: clamped,
    captureRadius: BASE_CAPTURE_RADIUS - clamped * RADIUS_STEP,
    driftAmpScale: BASE_DRIFT_SCALE + clamped * DRIFT_SCALE_STEP,
  };
}

/**
 * Ladder controller aimed at ~70-80% success: three straight successes step
 * harder, two straight misses step easier. Never punishes a single miss.
 */
export function nextSparkOrbDifficultyLevel(
  level: number,
  recentResults: boolean[],
): number {
  const lastThree = recentResults.slice(-3);
  const lastTwo = recentResults.slice(-2);
  if (lastThree.length === 3 && lastThree.every(Boolean)) {
    return Math.min(SPARK_ORB_MAX_DIFFICULTY_LEVEL, level + 1);
  }
  if (lastTwo.length === 2 && lastTwo.every((result) => !result)) {
    return Math.max(0, level - 1);
  }
  return level;
}

/**
 * Deterministic lateral drift shared by visuals (CSS keyframe) and physics:
 * starts centered, sweeps to +amp at quarter period, -amp at three quarters
 * (sine). Starting at zero keeps a fresh encounter aim-neutral.
 */
export function sparkOrbDriftOffsetX(
  nowMs: number,
  startMs: number,
  ampPx: number,
  periodMs: number,
): number {
  if (periodMs <= 0 || ampPx === 0) return 0;
  const elapsed = Math.max(0, nowMs - startMs);
  return ampPx * Math.sin((2 * Math.PI * elapsed) / periodMs);
}
