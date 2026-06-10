export type MonsterExpressionState = "idle" | "alert" | "happy" | "sleepy";
export type BlinkPhase = "open" | "half" | "closed";
export type BlinkSequence = "full" | "soft";

export interface CapturedMonsterBlinkFrames {
  open: string;
  half?: string;
  closed?: string;
}

export interface CapturedMonsterBlinkTiming {
  durationMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  doubleBlinkChance: number;
}

const MAX_BLINK_LOOPS = 10;

export function getMaxBlinkLoops(): number {
  return MAX_BLINK_LOOPS;
}

export function hasBlinkFrames(frames: CapturedMonsterBlinkFrames): boolean {
  return Boolean(frames.half?.trim() && frames.closed?.trim());
}

export function pickBlinkIntervalMs(
  expressionState: MonsterExpressionState,
  timing: CapturedMonsterBlinkTiming,
  random: () => number = Math.random,
): number {
  const span = timing.maxIntervalMs - timing.minIntervalMs;
  const base = timing.minIntervalMs + random() * span;
  if (expressionState === "alert") return Math.round(base * 0.6);
  if (expressionState === "happy") return Math.round(base * 0.85);
  if (expressionState === "sleepy") return Math.round(base * 1.1);
  return Math.round(base);
}

export function advanceBlinkPhase(
  current: BlinkPhase,
  sequence: BlinkSequence,
  options?: { reopening?: boolean },
): BlinkPhase {
  if (sequence === "soft") {
    return current === "open" ? "half" : "open";
  }
  if (current === "open") return "half";
  if (current === "half") return options?.reopening ? "open" : "closed";
  return "half";
}

export function pickBlinkSequence(
  expressionState: MonsterExpressionState,
  random: () => number = Math.random,
): BlinkSequence {
  if (expressionState === "happy" && random() < 0.4) return "soft";
  return "full";
}

export function getBlinkSequenceSteps(sequence: BlinkSequence): BlinkPhase[] {
  if (sequence === "soft") return ["half", "open"];
  return ["half", "closed", "half", "open"];
}

export function getBlinkPhaseDurationMs(
  phase: BlinkPhase,
  expressionState: MonsterExpressionState,
  timing: CapturedMonsterBlinkTiming,
  sequence: BlinkSequence,
): number {
  const stepCount = sequence === "soft" ? 2 : 4;
  const base = Math.max(20, Math.round(timing.durationMs / stepCount));
  if (expressionState === "sleepy" && phase === "closed") {
    return Math.round(base * 2.5);
  }
  return base;
}

export function shouldDoubleBlink(
  timing: CapturedMonsterBlinkTiming,
  random: () => number = Math.random,
): boolean {
  return random() < timing.doubleBlinkChance;
}

export function assertBlinkLoopGuard(loopCount: number): void {
  if (loopCount > MAX_BLINK_LOOPS) {
    throw new Error("Monster blink loop exceeded guard");
  }
}
