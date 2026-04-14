/**
 * Maps companionAct **animate** / **move** payloads to values the web VRM layer can apply * without a full animation graph (COMPANION-API-009).
 */

import type { CompanionEmote } from "../companionEmotes";
import { COMPANION_ANIMATION_IDS } from "./registry/animate.capability";

export type CompanionAnimationId = (typeof COMPANION_ANIMATION_IDS)[number];

const ANIMATION_SET = new Set<string>(COMPANION_ANIMATION_IDS);

export function isCompanionAnimationId(v: unknown): v is CompanionAnimationId {
  return typeof v === "string" && ANIMATION_SET.has(v);
}

/**
 * Maps registry animation ids to face/body cue emotes already supported by CompanionLayer.
 */
export function mapAnimationToEmote(animation: string): CompanionEmote | null {
  if (!isCompanionAnimationId(animation)) return null;
  switch (animation) {
    case "idle":
    case "walk":
    case "sit":
      return "neutral";
    case "dance_victory":
      return "celebrating";
    case "think":
      return "thinking";
    case "jump":
      return "surprised";
    case "wave":
      return "happy";
    default:
      return null;
  }
}

/** Symbolic targets → small offsets in companion root space (meters). */
export const COMPANION_MOVE_OFFSETS: Record<string, { x: number; z: number }> = {
  center: { x: 0, z: 0 },
  castle: { x: 0.35, z: 0.12 },
  node_1: { x: -0.28, z: 0.18 },
};

/** Per-frame lerp factor toward move target (60fps-ish RAF; dt-capped in layer). */
export function moveSpeedToLerpPerFrame(speed: string | undefined): number {
  switch (speed) {
    case "slow":
      return 0.035;
    case "fast":
      return 0.12;
    default:
      return 0.065;
  }
}
