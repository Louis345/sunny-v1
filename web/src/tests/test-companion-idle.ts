import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  IDLE_BEHAVIORS,
  applyIdleMotionToVrm,
  createInitialIdleState,
  expressionBlocksIdle,
  getIdleBehaviorProgress,
  screenPixelToLookTargetWorld,
  tickCompanionIdle,
} from "../utils/companionIdle";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";

describe("companionIdle (COMPANION-004)", () => {
  it("idle timer increments with deltaTime and resets at idleFrequency_ms", () => {
    const c = cloneCompanionDefaults();
    c.idleFrequency_ms = 1000;
    c.randomMomentProbability = 0;
    const s = createInitialIdleState();
    tickCompanionIdle(s, 500, c, false, false, () => 0);
    expect(s.idleAccMs).toBe(500);
    tickCompanionIdle(s, 500, c, false, false, () => 0);
    expect(s.idleAccMs).toBe(0);
  });

  it("random moment fires when random < randomMomentProbability", () => {
    const c = cloneCompanionDefaults();
    c.idleFrequency_ms = 0;
    c.randomMomentProbability = 0.5;
    const s = createInitialIdleState();
    tickCompanionIdle(s, 1, c, false, false, () => 0.2);
    expect(s.behavior).not.toBeNull();
  });

  it("random moment does NOT fire when random >= randomMomentProbability", () => {
    const c = cloneCompanionDefaults();
    c.idleFrequency_ms = 0;
    c.randomMomentProbability = 0.3;
    const s = createInitialIdleState();
    tickCompanionIdle(s, 1, c, false, false, () => 0.99);
    expect(s.behavior).toBeNull();
  });

  it("random moment selects from IDLE_BEHAVIORS", () => {
    const c = cloneCompanionDefaults();
    c.idleFrequency_ms = 0;
    c.randomMomentProbability = 1;
    let idx = 0;
    const rnd = () => {
      idx += 1;
      return idx === 1 ? 0 : 0.25;
    };
    const s = createInitialIdleState();
    tickCompanionIdle(s, 1, c, false, false, rnd);
    expect(IDLE_BEHAVIORS).toContain(s.behavior);
  });

  it("idle timing reads from profile companion", () => {
    const c = cloneCompanionDefaults();
    c.idleFrequency_ms = 2000;
    c.randomMomentProbability = 0;
    const s = createInitialIdleState();
    tickCompanionIdle(s, 1500, c, false, false, () => 0);
    expect(s.idleAccMs).toBe(1500);
  });

  it("LookAt target helper returns a finite vector for center-ish pixel", () => {
    const cam = new THREE.PerspectiveCamera(22, 1, 0.05, 50);
    cam.position.set(0, 1.35, 1.45);
    cam.lookAt(0, 1.15, 0);
    cam.updateMatrixWorld(true);
    const out = new THREE.Vector3();
    screenPixelToLookTargetWorld(400, 300, cam, out);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
  });

  it("idle timer pauses when toggledOff", () => {
    const c = cloneCompanionDefaults();
    c.randomMomentProbability = 0;
    const s = createInitialIdleState();
    tickCompanionIdle(s, 400, c, true, false, () => 0);
    expect(s.idleAccMs).toBe(0);
  });

  it("idle behaviors complete within 1500ms", () => {
    const c = cloneCompanionDefaults();
    c.idleFrequency_ms = 0;
    c.randomMomentProbability = 1;
    const s = createInitialIdleState();
    tickCompanionIdle(s, 1, c, false, false, () => 0.0001);
    expect(s.behaviorDurationMs).toBeLessThanOrEqual(1500);
    const dur = s.behaviorDurationMs;
    tickCompanionIdle(s, dur + 10, c, false, false, () => 0);
    expect(s.behavior).toBeNull();
  });

  it("expression busy pauses idle accumulator", () => {
    const c = cloneCompanionDefaults();
    c.randomMomentProbability = 0;
    const s = createInitialIdleState();
    tickCompanionIdle(s, 200, c, false, true, () => 0);
    expect(s.idleAccMs).toBe(0);
  });

  it("expressionBlocksIdle respects face and thinking", () => {
    expect(expressionBlocksIdle("happy", 1, false, false)).toBe(true);
    expect(expressionBlocksIdle(null, 0, true, false)).toBe(true);
    expect(expressionBlocksIdle(null, 0, false, false)).toBe(false);
    expect(expressionBlocksIdle(null, 0, false, true)).toBe(true);
  });

  it("getIdleBehaviorProgress peaks mid-behavior", () => {
    const s = createInitialIdleState();
    s.behavior = "wave";
    s.behaviorDurationMs = 1000;
    s.behaviorElapsedMs = 500;
    expect(getIdleBehaviorProgress(s)).toBe(0.5);
  });

  it("applyIdleMotionToVrm does not throw", () => {
    const lh = new THREE.Object3D();
    const rh = new THREE.Object3D();
    const sp = new THREE.Object3D();
    const vrm = {
      humanoid: {
        getRawBoneNode: (name: string) => {
          if (name === "leftHand") return lh;
          if (name === "rightHand") return rh;
          if (name === "spine") return sp;
          return null;
        },
      },
    };
    const s = createInitialIdleState();
    s.behavior = "wave";
    s.behaviorDurationMs = 800;
    s.behaviorElapsedMs = 400;
    expect(() => applyIdleMotionToVrm(vrm as never, s)).not.toThrow();
  });
});
