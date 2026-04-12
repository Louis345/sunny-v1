import type { VRM } from "@pixiv/three-vrm";
import {
  COMPANION_DEFAULTS,
  type CompanionConfig,
  type CompanionEventPayload,
  type CompanionTrigger,
} from "../../../src/shared/companionTypes";

/** Face expression id, or `thinking` for head-tilt pose (not a blend shape). */
export type CompanionExpressionId = "happy" | "sad" | "surprised" | "thinking";

export const TRIGGER_EXPRESSION_MAP: Record<CompanionTrigger, CompanionExpressionId> = {
  correct_answer: "happy",
  wrong_answer: "sad",
  mastery_unlock: "surprised",
  session_start: "happy",
  session_end: "happy",
  idle_too_long: "thinking",
};

/** Per-trigger reaction length (COMPANION_DESIGN + COMPANION-003). */
export const TRIGGER_REACTION_DURATION_MS: Record<CompanionTrigger, number> = {
  session_start: 3000,
  correct_answer: 2000,
  wrong_answer: 1500,
  mastery_unlock: 3000,
  session_end: 2000,
  idle_too_long: 2000,
};

/** Max head tilt (radians) for `thinking` pose. */
export const THINKING_HEAD_TILT_RAD = (15 * Math.PI) / 180;

export function shouldApplyCompanionReaction(
  trigger: CompanionTrigger,
  sensitivity: CompanionConfig["sensitivity"],
  random: () => number,
): boolean {
  let threshold = sensitivity[trigger];
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    threshold = COMPANION_DEFAULTS.sensitivity[trigger];
  }
  return random() < threshold;
}

export interface ExpressionDecayState {
  faceExpression: "happy" | "sad" | "surprised" | null;
  faceWeight: number;
  faceElapsedMs: number;
  faceDurationMs: number;
  thinkingActive: boolean;
  thinkingElapsedMs: number;
  thinkingDurationMs: number;
}

export function createNeutralExpressionState(): ExpressionDecayState {
  return {
    faceExpression: null,
    faceWeight: 0,
    faceElapsedMs: 0,
    faceDurationMs: 0,
    thinkingActive: false,
    thinkingElapsedMs: 0,
    thinkingDurationMs: 0,
  };
}

export function applyAcceptedTrigger(
  state: ExpressionDecayState,
  trigger: CompanionTrigger,
): void {
  const target = TRIGGER_EXPRESSION_MAP[trigger];
  const duration = TRIGGER_REACTION_DURATION_MS[trigger];
  if (target === "thinking") {
    state.faceExpression = null;
    state.faceWeight = 0;
    state.faceElapsedMs = 0;
    state.faceDurationMs = 0;
    state.thinkingActive = true;
    state.thinkingElapsedMs = 0;
    state.thinkingDurationMs = duration;
    return;
  }
  state.faceExpression = target;
  state.faceWeight = 1;
  state.faceElapsedMs = 0;
  state.faceDurationMs = duration;
  state.thinkingActive = false;
  state.thinkingElapsedMs = 0;
  state.thinkingDurationMs = 0;
}

/**
 * Linear decay: weight 1 → 0 over `faceDurationMs`. When complete, all face weights should be 0.
 */
export function tickExpressionDecay(state: ExpressionDecayState, deltaMs: number): void {
  if (state.thinkingActive) {
    state.thinkingElapsedMs += deltaMs;
    if (state.thinkingElapsedMs >= state.thinkingDurationMs) {
      state.thinkingActive = false;
      state.thinkingElapsedMs = 0;
      state.thinkingDurationMs = 0;
    }
    return;
  }
  if (state.faceExpression && state.faceDurationMs > 0) {
    state.faceElapsedMs += deltaMs;
    const t = Math.min(1, state.faceElapsedMs / state.faceDurationMs);
    state.faceWeight = 1 - t;
    if (t >= 1) {
      state.faceExpression = null;
      state.faceWeight = 0;
      state.faceElapsedMs = 0;
      state.faceDurationMs = 0;
    }
  }
}

/** Eased tilt 0→1→0 over thinking duration (sine hump). */
export function getThinkingHeadTiltFactor(state: ExpressionDecayState): number {
  if (!state.thinkingActive || state.thinkingDurationMs <= 0) return 0;
  const t = Math.min(1, state.thinkingElapsedMs / state.thinkingDurationMs);
  return Math.sin(t * Math.PI);
}

/** Raw head bone tilt for `thinking` (re-apply after `vrm.update()` — humanoid can overwrite it). */
export function applyThinkingHeadTiltToVrm(vrm: VRM, state: ExpressionDecayState): void {
  const head = vrm.humanoid.getRawBoneNode("head");
  if (head) {
    head.rotation.z = getThinkingHeadTiltFactor(state) * THINKING_HEAD_TILT_RAD;
  }
}

export class CompanionEventDeduper {
  private readonly seen = new Set<number>();

  tryConsume(e: CompanionEventPayload): boolean {
    const ts = e.timestamp;
    if (this.seen.has(ts)) return false;
    this.seen.add(ts);
    if (this.seen.size > 256) {
      const sorted = [...this.seen].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 128; i++) {
        this.seen.delete(sorted[i]!);
      }
    }
    return true;
  }
}

export function pickTriggersToApply(
  events: CompanionEventPayload[],
  companion: CompanionConfig,
  random: () => number,
  deduper: CompanionEventDeduper,
  opts?: { forChildId?: string | null },
): CompanionTrigger[] {
  const want = opts?.forChildId?.trim().toLowerCase() ?? "";
  const out: CompanionTrigger[] = [];
  for (const p of events) {
    if (want && p.childId.trim().toLowerCase() !== want) continue;
    const trigger = p.trigger;
    if (!shouldApplyCompanionReaction(trigger, companion.sensitivity, random)) {
      continue;
    }
    if (!deduper.tryConsume(p)) continue;
    out.push(trigger);
  }
  return out;
}

/** Push decay state onto the VRM (face blend shapes + thinking head tilt). */
export function applyExpressionStateToVrm(vrm: VRM, state: ExpressionDecayState): void {
  const em = vrm.expressionManager;
  if (em) {
    for (const id of ["happy", "sad", "surprised"] as const) {
      em.setValue(id, state.faceExpression === id ? state.faceWeight : 0);
    }
  }
  applyThinkingHeadTiltToVrm(vrm, state);
}
