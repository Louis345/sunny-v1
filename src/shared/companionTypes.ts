/**
 * Shared companion pipeline types (COMPANION-001).
 * Transport-agnostic; server and web both import from here.
 */

import type { CompanionEmote } from "./companionEmotes";

export type { CompanionEmote } from "./companionEmotes";

export type CompanionTrigger =
  | "session_start"
  | "correct_answer"
  | "wrong_answer"
  | "mastery_unlock"
  | "session_end"
  | "idle_too_long";

export type CompanionSensitivity = Record<CompanionTrigger, number>;

export interface CompanionFaceCamera {
  position: [number, number, number];
  target: [number, number, number];
}

export interface CompanionConfig {
  /** Preset key from children.config.json (elli | matilda | creator | …). */
  companionId: string;
  vrmUrl: string;
  /** Semantic expression id → VRM blend shape name (see children.config.json). */
  expressions: Record<string, string>;
  faceCamera: CompanionFaceCamera;
  dopamineGames: string[];
  sensitivity: CompanionSensitivity;
  idleFrequency_ms: number;
  randomMomentProbability: number;
  toggledOff: boolean;
}

export interface CompanionEventPayload {
  /** Map / game / sensitivity path */
  trigger?: CompanionTrigger;
  /** Claude `expressCompanion` path */
  emote?: CompanionEmote;
  /** 0–1; default 0.8 when omitted on wire */
  intensity?: number;
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
  companionId: "",
  vrmUrl: "/companions/sample.vrm",
  expressions: {
    idle: "neutral",
    happy: "happy",
    thinking: "lookDown",
    celebrating: "happy",
    concerned: "sad",
    winking: "blinkLeft",
    surprised: "surprised",
    angry: "angry",
    blink: "blink",
  },
  faceCamera: {
    position: [0, 1.4, 0.8],
    target: [0, 1.4, 0],
  },
  dopamineGames: ["space-invaders", "asteroid", "space-frogger"],
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
    expressions: { ...COMPANION_DEFAULTS.expressions },
    faceCamera: {
      position: [...COMPANION_DEFAULTS.faceCamera.position],
      target: [...COMPANION_DEFAULTS.faceCamera.target],
    },
    dopamineGames: [...COMPANION_DEFAULTS.dopamineGames],
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
    companionId: partial.companionId ?? d.companionId,
    vrmUrl: partial.vrmUrl ?? d.vrmUrl,
    sensitivity: { ...d.sensitivity, ...(partial.sensitivity ?? {}) },
    expressions: { ...d.expressions, ...(partial.expressions ?? {}) },
    faceCamera: partial.faceCamera
      ? {
          position: [...partial.faceCamera.position] as [number, number, number],
          target: [...partial.faceCamera.target] as [number, number, number],
        }
      : {
          position: [...d.faceCamera.position] as [number, number, number],
          target: [...d.faceCamera.target] as [number, number, number],
        },
    dopamineGames:
      partial.dopamineGames && partial.dopamineGames.length > 0
        ? [...partial.dopamineGames]
        : [...d.dopamineGames],
  };
}

/**
 * Merge learning-profile companion overrides onto a **preset** from children.config.json.
 * Identity fields (vrmUrl, expressions, faceCamera, dopamineGames) always come from the preset;
 * learning_profile may only tune reactions (sensitivity, timers, toggledOff).
 */
export function mergeCompanionPresetWithLearningProfile(
  preset: CompanionConfig,
  partial: Partial<CompanionConfig> | null | undefined,
): CompanionConfig {
  if (!partial) {
    return {
      ...preset,
      sensitivity: { ...preset.sensitivity },
      expressions: { ...preset.expressions },
      faceCamera: {
        position: [...preset.faceCamera.position],
        target: [...preset.faceCamera.target],
      },
      dopamineGames: [...preset.dopamineGames],
    };
  }
  return {
    ...preset,
    companionId: partial.companionId ?? preset.companionId,
    vrmUrl: preset.vrmUrl,
    expressions: { ...preset.expressions },
    faceCamera: {
      position: [...preset.faceCamera.position],
      target: [...preset.faceCamera.target],
    },
    dopamineGames: [...preset.dopamineGames],
    sensitivity: { ...preset.sensitivity, ...(partial.sensitivity ?? {}) },
    idleFrequency_ms: partial.idleFrequency_ms ?? preset.idleFrequency_ms,
    randomMomentProbability:
      partial.randomMomentProbability ?? preset.randomMomentProbability,
    toggledOff: partial.toggledOff ?? preset.toggledOff,
  };
}
