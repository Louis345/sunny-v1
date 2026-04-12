/**
 * Shared companion pipeline types (COMPANION-001).
 * Transport-agnostic; server and web both import from here.
 */

export type CompanionTrigger =
  | "session_start"
  | "correct_answer"
  | "wrong_answer"
  | "mastery_unlock"
  | "session_end"
  | "idle_too_long";

export type CompanionSensitivity = Record<CompanionTrigger, number>;

export interface CompanionConfig {
  vrmUrl: string;
  sensitivity: CompanionSensitivity;
  idleFrequency_ms: number;
  randomMomentProbability: number;
  toggledOff: boolean;
}

export interface CompanionEventPayload {
  trigger: CompanionTrigger;
  timestamp: number;
  childId: string;
  metadata?: Record<string, unknown>;
}

export interface CompanionEvent {
  type: "companion_event";
  payload: CompanionEventPayload;
}

/** Phase 0.5 defaults; assembled in `buildProfile` (single source of truth). */
export const COMPANION_DEFAULTS: CompanionConfig = {
  vrmUrl: "/companions/sample.vrm",
  sensitivity: {
    session_start: 0.8,
    correct_answer: 0.9,
    wrong_answer: 0.6,
    mastery_unlock: 1.0,
    session_end: 0.7,
    idle_too_long: 0.5,
  },
  idleFrequency_ms: 8000,
  randomMomentProbability: 0.3,
  toggledOff: false,
};

export function cloneCompanionDefaults(): CompanionConfig {
  return {
    ...COMPANION_DEFAULTS,
    sensitivity: { ...COMPANION_DEFAULTS.sensitivity },
  };
}

/** Deep-merge API/partial companion objects so missing `sensitivity` keys never break reactions. */
export function mergeCompanionConfigWithDefaults(
  partial: Partial<CompanionConfig> | null | undefined,
): CompanionConfig {
  const d = cloneCompanionDefaults();
  if (!partial) return d;
  return {
    ...d,
    ...partial,
    sensitivity: { ...d.sensitivity, ...(partial.sensitivity ?? {}) },
  };
}
