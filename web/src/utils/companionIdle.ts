import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { CompanionConfig } from "../../../src/shared/companionTypes";

export const IDLE_BEHAVIORS = ["wave", "lookAround", "headTilt", "surprised"] as const;
export type IdleBehaviorId = (typeof IDLE_BEHAVIORS)[number];

export interface CompanionIdleState {
  idleAccMs: number;
  behavior: IdleBehaviorId | null;
  behaviorElapsedMs: number;
  behaviorDurationMs: number;
}

export function createInitialIdleState(): CompanionIdleState {
  return {
    idleAccMs: 0,
    behavior: null,
    behaviorElapsedMs: 0,
    behaviorDurationMs: 0,
  };
}

export function expressionBlocksIdle(
  faceExpression: string | null,
  faceWeight: number,
  thinkingActive: boolean,
): boolean {
  return thinkingActive || (faceExpression != null && faceWeight > 0.02);
}

/**
 * Advance idle timer / random moments. Pauses when `toggledOff` or `expressionBusy`.
 * While a random idle behavior plays, the idle accumulator does not advance (no overlap).
 */
export function tickCompanionIdle(
  state: CompanionIdleState,
  deltaMs: number,
  companion: CompanionConfig,
  toggledOff: boolean,
  expressionBusy: boolean,
  random: () => number,
): void {
  if (toggledOff) {
    return;
  }
  if (state.behavior) {
    state.behaviorElapsedMs += deltaMs;
    if (state.behaviorElapsedMs >= state.behaviorDurationMs) {
      state.behavior = null;
      state.behaviorElapsedMs = 0;
      state.behaviorDurationMs = 0;
    }
    return;
  }
  if (expressionBusy) {
    return;
  }
  state.idleAccMs += deltaMs;
  if (state.idleAccMs < companion.idleFrequency_ms) {
    return;
  }
  state.idleAccMs = 0;
  if (random() >= companion.randomMomentProbability) {
    return;
  }
  const idx = Math.min(
    IDLE_BEHAVIORS.length - 1,
    Math.floor(random() * IDLE_BEHAVIORS.length),
  );
  state.behavior = IDLE_BEHAVIORS[idx] ?? IDLE_BEHAVIORS[0];
  state.behaviorElapsedMs = 0;
  state.behaviorDurationMs = 500 + Math.floor(random() * 1001);
}

export function getIdleBehaviorProgress(state: CompanionIdleState): number {
  if (!state.behavior || state.behaviorDurationMs <= 0) {
    return 0;
  }
  return Math.min(1, state.behaviorElapsedMs / state.behaviorDurationMs);
}

/**
 * Map screen pixel (viewport) to a world-space point in front of the camera for LookAt.
 */
export function screenPixelToLookTargetWorld(
  clientX: number,
  clientY: number,
  camera: InstanceType<typeof THREE.PerspectiveCamera>,
  out: THREE.Vector3,
): THREE.Vector3 {
  const w = typeof window !== "undefined" ? window.innerWidth : 1;
  const h = typeof window !== "undefined" ? window.innerHeight : 1;
  const ndcX = (clientX / w) * 2 - 1;
  const ndcY = -(clientY / h) * 2 + 1;
  const v = out.set(ndcX, ndcY, 0.5);
  v.unproject(camera);
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  v.sub(camPos).normalize();
  const dist = 2.8;
  return out.copy(camPos).add(v.multiplyScalar(dist));
}

/** Subtle bone offsets for random idle moments (non-face). */
export function applyIdleMotionToVrm(vrm: VRM, state: CompanionIdleState): void {
  const h = vrm.humanoid;
  const lh = h.getRawBoneNode("leftHand");
  const rh = h.getRawBoneNode("rightHand");
  const sp = h.getRawBoneNode("spine");
  const w = Math.sin(getIdleBehaviorProgress(state) * Math.PI);
  if (lh) {
    lh.rotation.z = 0;
    lh.rotation.x = 0;
  }
  if (rh) {
    rh.rotation.z = 0;
    rh.rotation.x = 0;
  }
  if (sp) {
    sp.rotation.y = 0;
    sp.rotation.z = 0;
  }
  if (!state.behavior) return;
  switch (state.behavior) {
    case "wave":
      if (lh) lh.rotation.z = w * 0.45;
      break;
    case "lookAround":
      if (sp) sp.rotation.y = w * 0.14;
      break;
    case "headTilt":
      if (sp) sp.rotation.z = w * 0.1;
      break;
    case "surprised":
      if (rh) rh.rotation.x = -w * 0.25;
      break;
    default:
      break;
  }
}
