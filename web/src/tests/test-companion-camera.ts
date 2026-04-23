import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  resolveCameraFraming,
  type CameraFitBaseline,
} from "../utils/companionCamera";

const makeBaseline = (overrides?: Partial<CameraFitBaseline>): CameraFitBaseline => ({
  center: new THREE.Vector3(0, 0.9, 0),
  floorY: 0,
  height: 1.6,
  baseDistance: 3,
  baseFov: 22,
  ...overrides,
});

describe("companionCamera", () => {
  it("resolveCameraFraming look-at Y is anchored from floorY, not center", () => {
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    resolveCameraFraming(makeBaseline({ floorY: 0, height: 1.6 }), "mid-shot", pos, look);
    // lookAtYFrac = 0.56, mid-shot delta = 0 → look.y = 0 + 1.6*0.56 = 0.896
    expect(look.y).toBeCloseTo(0.896);
  });

  it("resolveCameraFraming look-at Y scales correctly with a taller character", () => {
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    resolveCameraFraming(makeBaseline({ floorY: 0, height: 2.0 }), "mid-shot", pos, look);
    // 0 + 2.0*0.56 = 1.12
    expect(look.y).toBeCloseTo(1.12);
  });

  it("resolveCameraFraming camera position Z equals baseDistance (no additional offset)", () => {
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    resolveCameraFraming(makeBaseline({ baseDistance: 3 }), "mid-shot", pos, look);
    // mid-shot distanceScale = 1; center.z = 0 → camera at z = 3
    expect(pos.z).toBeCloseTo(3);
  });

  it("resolveCameraFraming floorY offset propagates to both look-at and camera Y", () => {
    const posA = new THREE.Vector3();
    const lookA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    const lookB = new THREE.Vector3();
    resolveCameraFraming(makeBaseline({ floorY: 0 }), "mid-shot", posA, lookA);
    resolveCameraFraming(makeBaseline({ floorY: 1.0 }), "mid-shot", posB, lookB);
    expect(lookB.y - lookA.y).toBeCloseTo(1.0);
    expect(posB.y - posA.y).toBeCloseTo(1.0);
  });
});
