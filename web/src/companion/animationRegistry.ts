/**
 * FBX clip registry (COMPANION-MOTOR): `AnimationName` → public URL under `/animations/`.
 * Derived from animations.generated.ts — do not add entries by hand.
 * To register a new clip: add the FBX + sidecar JSON, then run `npm run ingest:animations`.
 */

import {
  COMPANION_ANIMATION_IDS,
  type AnimationName,
} from "../../../src/shared/companions/companionContract";
import { ANIMATION_MANIFEST } from "../../../src/shared/companions/animations.generated";

export type AnimationRegistryEntry = {
  /** URL path served from `web/public` (e.g. `/animations/wave.fbx`). */
  path: string;
  /** Default loop when `companionAct` animate omits `loop`. */
  defaultLoop?: boolean;
};

const fbxByName = new Map<string, AnimationRegistryEntry>(
  ANIMATION_MANIFEST.map((e) => [e.name, { path: e.path, defaultLoop: e.defaultLoop }]),
);

/**
 * Every contract AnimationName has a row; `null` means no FBX on disk yet — client uses emote fallback.
 */
export const ANIMATION_REGISTRY: Record<AnimationName, AnimationRegistryEntry | null> =
  Object.fromEntries(
    COMPANION_ANIMATION_IDS.map((id) => [id, fbxByName.get(id) ?? null]),
  ) as Record<AnimationName, AnimationRegistryEntry | null>;

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
