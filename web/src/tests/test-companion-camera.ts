import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  fullModeLookAtGroundingOffsetY,
  resolveCameraFraming,
  type CameraFitBaseline,
} from "../utils/companionCamera";

describe("companionCamera", () => {
  it("fullModeLookAtGroundingOffsetY is negative and within ~0.5–0.8 for human-scale height", () => {
    const y1 = fullModeLookAtGroundingOffsetY(1.65);
    expect(y1).toBeLessThan(-0.5);
    expect(y1).toBeGreaterThan(-0.8);
    const y2 = fullModeLookAtGroundingOffsetY(1.8);
    expect(y2).toBeLessThanOrEqual(-0.6);
  });

  it("resolveCameraFraming applies lookAtYWorldOffset to look-at Y only", () => {
    const baseline: CameraFitBaseline = {
      center: new THREE.Vector3(0, 0.9, 0),
      height: 1.6,
      baseDistance: 3,
      baseFov: 22,
    };
    const posA = new THREE.Vector3();
    const lookA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    const lookB = new THREE.Vector3();
    resolveCameraFraming(baseline, "mid-shot", posA, lookA);
    resolveCameraFraming(baseline, "mid-shot", posB, lookB, {
      lookAtYWorldOffset: -0.62,
    });
    expect(posA.x).toBeCloseTo(posB.x);
    expect(posA.y).toBeCloseTo(posB.y);
    expect(lookB.y - lookA.y).toBeCloseTo(-0.62);
  });

  it("resolveCameraFraming applies cameraZWorldOffset to position Z only", () => {
    const baseline: CameraFitBaseline = {
      center: new THREE.Vector3(0, 0.9, 0),
      height: 1.6,
      baseDistance: 3,
      baseFov: 22,
    };
    const posA = new THREE.Vector3();
    const lookA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    const lookB = new THREE.Vector3();
    resolveCameraFraming(baseline, "mid-shot", posA, lookA);
    resolveCameraFraming(baseline, "mid-shot", posB, lookB, {
      cameraZWorldOffset: 0.42,
    });
    expect(lookA.z).toBeCloseTo(lookB.z);
    expect(posB.z - posA.z).toBeCloseTo(0.42);
  });
});
