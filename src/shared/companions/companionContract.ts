/**
 * Companion capability API contract (COMPANION-API-001).
 * Single source for command shape and capability metadata shared by server, web, and prompts.
 */

import type { z } from "zod";

export type CompanionCapabilityPhase = 0.5 | 1 | 2 | 3;

export type CompanionApiVersion = "1.0";

/** Runtime companion API version; must match `CompanionApiVersion`. */
export const COMPANION_API_VERSION: CompanionApiVersion = "1.0";

// --- Claude-facing enums (companionAct payloads; single source of truth) ---

/** Named companion animations (`companionAct` type `animate`). */
export const COMPANION_ANIMATION_IDS = [
  "idle",
  "walk",
  "dance_victory",
  "think",
  "sit",
  "jump",
  "wave",
  "shrug",
] as const;
export type AnimationName = (typeof COMPANION_ANIMATION_IDS)[number];

/** Camera framing presets (`companionAct` type `camera`). */
export const CAMERA_ANGLES = [
  "close-up",
  "mid-shot",
  "full-body",
  "wide",
] as const;
export type CameraAngle = (typeof CAMERA_ANGLES)[number];

/** Vertical FOV (degrees) used for bbox fitting and preset FOV scaling. */
export const COMPANION_CAMERA_BASE_FOV = 22;

/**
 * Extra margin on the computed fit distance so the character stays inside the frame (ratio ≥ 1).
 */
export const COMPANION_CAMERA_FIT_MARGIN = 1.12;

/**
 * Reference framing for bbox-fit baseline (dimensionless fractions of character height above bbox min Y).
 * Presets apply deltas on top of these.
 */
export const COMPANION_CAMERA_FIT_REF = {
  lookAtYFrac: 0.5,
  cameraYFrac: 0.48,
} as const;

/**
 * Framing presets as offsets from the bbox-fit baseline (not absolute world coordinates).
 */
export const CAMERA_PRESETS: Record<
  CameraAngle,
  {
    distanceScale: number;
    lookAtYDeltaFrac: number;
    cameraYDeltaFrac: number;
    fovScale: number;
  }
> = {
  "close-up": {
    distanceScale: 0.52,
    lookAtYDeltaFrac: 0.14,
    cameraYDeltaFrac: 0.12,
    fovScale: 1.12,
  },
  "mid-shot": {
    distanceScale: 1,
    lookAtYDeltaFrac: 0,
    cameraYDeltaFrac: 0,
    fovScale: 1,
  },
  "full-body": {
    distanceScale: 1.38,
    lookAtYDeltaFrac: -0.08,
    cameraYDeltaFrac: -0.06,
    fovScale: 1,
  },
  wide: {
    distanceScale: 1.75,
    lookAtYDeltaFrac: -0.12,
    cameraYDeltaFrac: -0.1,
    fovScale: 1.22,
  },
};

/** Symbolic move anchors (`companionAct` type `move`). */
export const BONE_TARGETS = ["center", "castle", "node_1"] as const;
export type BoneTarget = (typeof BONE_TARGETS)[number];

export type DiagControl =
  | {
      kind: "dropdown";
      key: string;
      label: string;
      options: string[];
    }
  | {
      kind: "slider";
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
    }
  | { kind: "toggle"; key: string; label: string; default: boolean };

/**
 * One registered companion capability (emote, camera, …).
 * Each *.capability.ts file exports one of these; the registry barrel collects them.
 */
export interface CapabilityDefinition {
  type: string;
  version: string;
  phase: CompanionCapabilityPhase;
  description: string;
  whenToUse: string[];
  payloadSchema: z.ZodType<Record<string, unknown>>;
  defaultPayload: Record<string, unknown>;
  diagLabel: string;
  diagControls: DiagControl[];
}

/** Validated command broadcast to the client after server checks. */
export interface CompanionCommand {
  apiVersion: CompanionApiVersion;
  type: string;
  payload: Record<string, unknown>;
  childId: string;
  timestamp: number;
  source: "claude" | "diag";
}

export type CapabilityRegistry = Map<string, CapabilityDefinition>;
