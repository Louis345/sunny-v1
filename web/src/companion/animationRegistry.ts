/**
 * FBX clip registry (COMPANION-MOTOR): `AnimationName` → public URL under `/animations/`.
 * Add a Mixamo FBX to `web/public/animations/` and set the path here (one line per clip).
 */

import {
  COMPANION_ANIMATION_IDS,
  type AnimationName,
} from "../../../src/shared/companions/companionContract";

export type AnimationRegistryEntry = {
  /** URL path served from `web/public` (e.g. `/animations/wave.fbx`). */
  path: string;
  /** Default loop when `companionAct` animate omits `loop`. */
  defaultLoop?: boolean;
};

/**
 * `null` means no FBX yet — client uses emote fallback (`companionAnimateBridge`).
 */
export const ANIMATION_REGISTRY: Record<
  AnimationName,
  AnimationRegistryEntry | null
> = {
  idle: { path: "/animations/idle.fbx", defaultLoop: false },
  walk: null,
  dance_victory: {
    path: "/animations/dance_victory.fbx",
    defaultLoop: false,
  },
  think: { path: "/animations/think.fbx", defaultLoop: false },
  sit: null,
  jump: null,
  wave: { path: "/animations/wave.fbx", defaultLoop: false },
  shrug: { path: "/animations/shrug.fbx", defaultLoop: false },
  clap: null,
  nod: null,
  shake_head: null,
  idle_fidget: null,
  point_forward: null,
  arms_up: null,
};

/** Every contract id has a registry row (completeness check). */
export function assertAnimationRegistryComplete(): void {
  for (const id of COMPANION_ANIMATION_IDS) {
    if (!(id in ANIMATION_REGISTRY)) {
      throw new Error(`animationRegistry: missing AnimationName "${id}"`);
    }
  }
}

export function getAnimationEntry(
  name: AnimationName,
): AnimationRegistryEntry | null {
  return ANIMATION_REGISTRY[name] ?? null;
}
