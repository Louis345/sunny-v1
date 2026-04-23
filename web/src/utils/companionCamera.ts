import * as THREE from "three";
import {
  CAMERA_ANGLES,
  CAMERA_PRESETS,
  COMPANION_CAMERA_FIT_REF,
  type CameraAngle,
} from "../../../src/shared/companions/companionContract";

export interface CameraFitBaseline {
  center: THREE.Vector3;
  height: number;
  baseDistance: number;
  baseFov: number;
}

export interface CameraFramingEndpoints {
  startPos: THREE.Vector3;
  startLookAt: THREE.Vector3;
  endPos: THREE.Vector3;
  endLookAt: THREE.Vector3;
  startFov: number;
  endFov: number;
}

export interface CameraAnimState {
  startMs: number;
  durationMs: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startFov: number;
  endFov: number;
  startLookAt: THREE.Vector3;
  endLookAt: THREE.Vector3;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function normalizeAngle(angle: CameraAngle | string): CameraAngle {
  return typeof angle === "string" &&
    (CAMERA_ANGLES as readonly string[]).includes(angle)
    ? (angle as CameraAngle)
    : "mid-shot";
}

/** Extra downward look-at shift (world Y) for full-mode framing so feet sit near the container bottom. */
export function fullModeLookAtGroundingOffsetY(characterHeight: number): number {
  const h = Math.max(1e-4, characterHeight);
  return -Math.min(0.78, Math.max(0.52, h * 0.38));
}

export interface ResolveCameraFramingOptions {
  /** Added to computed look-at Y (negative = aim lower / ground the figure). */
  lookAtYWorldOffset?: number;
}

/**
 * Resolve camera position, look-at, and FOV from bbox-fit baseline + preset offsets.
 */
export function resolveCameraFraming(
  baseline: CameraFitBaseline,
  angle: CameraAngle | string,
  outPosition: THREE.Vector3,
  outLookAt: THREE.Vector3,
  options?: ResolveCameraFramingOptions,
): number {
  const preset = CAMERA_PRESETS[normalizeAngle(angle)];
  const ref = COMPANION_CAMERA_FIT_REF;
  const lookY =
    baseline.center.y +
    baseline.height *
      (ref.lookAtYFrac + preset.lookAtYDeltaFrac) +
    (options?.lookAtYWorldOffset ?? 0);
  const camY =
    baseline.center.y +
    baseline.height *
      (ref.cameraYFrac + preset.cameraYDeltaFrac);
  const d = baseline.baseDistance * preset.distanceScale;
  // VRM 1.0 forward is -Z: place camera on +Z so view direction matches the face.
  outPosition.set(baseline.center.x, camY, baseline.center.z + d);
  outLookAt.set(baseline.center.x, lookY, baseline.center.z);
  return baseline.baseFov * preset.fovScale;
}

export function startCameraTransition(
  camera: THREE.PerspectiveCamera,
  endpoints: CameraFramingEndpoints,
  transitionMs: number | undefined,
  animRef: { current: CameraAnimState | null },
): void {
  const durationMs = transitionMs ?? 400;
  if (durationMs <= 0) {
    camera.position.copy(endpoints.endPos);
    camera.fov = endpoints.endFov;
    camera.updateProjectionMatrix();
    camera.lookAt(endpoints.endLookAt);
    animRef.current = null;
    return;
  }
  animRef.current = {
    startMs: performance.now(),
    durationMs,
    startPos: endpoints.startPos.clone(),
    endPos: endpoints.endPos.clone(),
    startFov: endpoints.startFov,
    endFov: endpoints.endFov,
    startLookAt: endpoints.startLookAt.clone(),
    endLookAt: endpoints.endLookAt.clone(),
  };
}

export function tickCameraTransition(
  camera: THREE.PerspectiveCamera,
  animRef: { current: CameraAnimState | null },
  outLookScratch: THREE.Vector3,
): void {
  const a = animRef.current;
  if (!a) return;
  const t = Math.min(1, (performance.now() - a.startMs) / a.durationMs);
  const e = easeOutQuad(t);
  camera.position.lerpVectors(a.startPos, a.endPos, e);
  camera.fov = a.startFov + (a.endFov - a.startFov) * e;
  camera.updateProjectionMatrix();
  outLookScratch.lerpVectors(a.startLookAt, a.endLookAt, e);
  camera.lookAt(outLookScratch);
  if (t >= 1) animRef.current = null;
}
