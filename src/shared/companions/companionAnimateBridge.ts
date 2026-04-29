/**
 * Maps companionAct **animate** / **move** payloads to values the web VRM layer can apply * without a full animation graph (COMPANION-API-009).
 */

import type { CompanionEmote } from "../companionEmotes";
import {
  BONE_TARGETS,
  COMPANION_ANIMATION_IDS,
  type BoneTarget,
} from "./companionContract";

export type CompanionAnimationId = (typeof COMPANION_ANIMATION_IDS)[number];

const ANIMATION_SET = new Set<string>(COMPANION_ANIMATION_IDS);

export function isCompanionAnimationId(v: unknown): v is CompanionAnimationId {
  return typeof v === "string" && ANIMATION_SET.has(v);
}

// ingest:animations — INGEST_ANIMATION_EMOTES_BEGIN (do not edit this marker)

const INGEST_INFERRED_ANIMATION_EMOTES: Partial<
  Record<CompanionAnimationId, CompanionEmote>
> = {
  "blow_a_kiss": "happy",
  "defeated": "sad",
  "hip_hop_dancing": "celebrating",
  "hip_hop_dancing_2": "celebrating",
  "idle_stand": "neutral",
  "ponder_moment": "thinking",
  "quick_formal_bow": "happy",
  "salsa_dancing": "celebrating",
  "silly_dancing": "happy",
  "silly_laugh": "happy",
  "sitting": "neutral",
  "surprise_jump": "surprised",
  "talking": "neutral",
  "thinking_2": "thinking",
};

// ingest:animations — INGEST_ANIMATION_EMOTES_END (do not edit this marker)

/**
 * Maps registry animation ids to face/body cue emotes already supported by CompanionLayer.
 */
export function mapAnimationToEmote(animation: string): CompanionEmote | null {
  if (!isCompanionAnimationId(animation)) return null;
  switch (animation) {
    case "idle":
      return "neutral";
    case "dance_victory":
      return "happy";
    case "think":
      return "thinking";
    case "wave":
      return "happy";
    case "shrug":
      return "neutral";
    default:
      return (
        INGEST_INFERRED_ANIMATION_EMOTES[animation as CompanionAnimationId] ??
        null
      );
  }
}

export function parseBoneTarget(raw: unknown): BoneTarget {
  if (typeof raw !== "string") return "center";
  return BONE_TARGETS.includes(raw as BoneTarget)
    ? (raw as BoneTarget)
    : "center";
}

/** Symbolic targets → small offsets in companion root space (meters). */
export const COMPANION_MOVE_OFFSETS: Record<
  BoneTarget,
  { x: number; z: number }
> = {
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
