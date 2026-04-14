import * as THREE from "three";

export const CAMERA_ANGLE_PRESETS: Record<
  string,
  { position: [number, number, number]; fov: number }
> = {
  "close-up": { position: [0, 0.9, 2.35], fov: 28 },
  "mid-shot": { position: [0, 0.8, 4.0], fov: 22 },
  "full-body": { position: [0, 0.55, 5.85], fov: 20 },
  wide: { position: [0, 0.85, 7.0], fov: 34 },
};

export interface CameraAnimState {
  startMs: number;
  durationMs: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startFov: number;
  endFov: number;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function startCameraTransition(
  camera: THREE.PerspectiveCamera,
  angle: string,
  transitionMs: number | undefined,
  animRef: { current: CameraAnimState | null },
  scratchEnd: THREE.Vector3,
): void {
  const preset = CAMERA_ANGLE_PRESETS[angle] ?? CAMERA_ANGLE_PRESETS["mid-shot"];
  const durationMs = transitionMs ?? 400;
  scratchEnd.set(...preset.position);
  if (durationMs <= 0) {
    camera.position.copy(scratchEnd);
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0.8, 0);
    animRef.current = null;
    return;
  }
  animRef.current = {
    startMs: performance.now(),
    durationMs,
    startPos: camera.position.clone(),
    endPos: scratchEnd.clone(),
    startFov: camera.fov,
    endFov: preset.fov,
  };
}

export function tickCameraTransition(
  camera: THREE.PerspectiveCamera,
  animRef: { current: CameraAnimState | null },
): void {
  const a = animRef.current;
  if (!a) return;
  const t = Math.min(1, (performance.now() - a.startMs) / a.durationMs);
  const e = easeOutQuad(t);
  camera.position.lerpVectors(a.startPos, a.endPos, e);
  camera.fov = a.startFov + (a.endFov - a.startFov) * e;
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0.8, 0);
  if (t >= 1) animRef.current = null;
}
