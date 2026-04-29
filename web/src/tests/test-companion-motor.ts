import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { CompanionMotor } from "../companion/CompanionMotor";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import * as bridge from "../../../src/shared/companions/companionAnimateBridge";

describe("CompanionMotor (COMPANION-MOTOR)", () => {
  let motor: CompanionMotor;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    motor = new CompanionMotor();
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    motor.setCamera(camera);
  });

  afterEach(() => {
    motor.dispose();
  });

  it("processCompanionCommands animate uses emote fallback when registry has no FBX", () => {
    const toEmote = vi.spyOn(bridge, "mapAnimationToEmote");
    const cmd: CompanionCommand = {
      apiVersion: "1.0",
      type: "animate",
      payload: { animation: "wave", loop: false },
      childId: "ila",
      timestamp: 42,
      source: "diag",
    };
    motor.processCompanionCommands([cmd], "ila");
    expect(toEmote).toHaveBeenCalledWith("wave");
    toEmote.mockRestore();
  });

  it("processCompanionCommands move updates motor state (via tick)", () => {
    const boneA = new THREE.Bone();
    const boneB = new THREE.Bone();
    boneA.add(boneB);
    const skeleton = new THREE.Skeleton([boneA, boneB]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3),
    );
    const skin = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    skin.add(boneA);
    skin.bind(skeleton);
    const root = new THREE.Group();
    root.add(skin);
    const vrm = {
      scene: root,
      lookAt: { target: null as THREE.Object3D | null },
      humanoid: { getRawBoneNode: () => null },
      expressionManager: {
        setValue: vi.fn(),
        getExpression: vi.fn(() => ({})),
      },
      update: vi.fn(),
    } as unknown as VRM;

    const scene = new THREE.Scene();
    motor.attachVrm(vrm, scene, 320, 480);

    const moveCmd: CompanionCommand = {
      apiVersion: "1.0",
      type: "move",
      payload: { target: "castle", speed: "normal" },
      childId: "ila",
      timestamp: 43,
      source: "diag",
    };
    motor.processCompanionCommands([moveCmd], "ila");

    motor.tick({
      dt: 1 / 60,
      dtMs: 1000 / 60,
      companionEvents: [],
      companion: null,
      childId: "ila",
      toggledOff: false,
      activeNodeScreen: null,
      analyser: null,
    });

    expect(vrm.scene.position.x).not.toBe(0);
    expect(vrm.update).toHaveBeenCalled();
  });

  it("showroom idle applies one normalized posture for consistent arms", () => {
    const root = new THREE.Group();
    const setNormalizedPose = vi.fn();

    const vrm = {
      scene: root,
      lookAt: { target: null as THREE.Object3D | null },
      humanoid: {
        getRawBoneNode: () => null,
        getNormalizedBoneNode: () => null,
        setNormalizedPose,
      },
      expressionManager: {
        setValue: vi.fn(),
        getExpression: vi.fn(() => ({})),
      },
      update: vi.fn(),
    } as unknown as VRM;

    const scene = new THREE.Scene();
    motor.attachVrm(vrm, scene, 320, 480);
    motor.setShowroomIdle("center");
    motor.tick({
      dt: 1 / 60,
      dtMs: 1000 / 60,
      companionEvents: [],
      companion: null,
      childId: "ila",
      toggledOff: false,
      activeNodeScreen: null,
      analyser: null,
    });

    expect(setNormalizedPose).toHaveBeenCalled();
    const pose = setNormalizedPose.mock.lastCall?.[0];
    expect(pose.leftUpperArm.rotation[2]).toBeLessThan(0);
    expect(pose.rightUpperArm.rotation[2]).toBeGreaterThan(0);
    expect(pose.leftLowerArm.rotation[2]).toBeLessThan(0);
    expect(pose.rightLowerArm.rotation[2]).toBeGreaterThan(0);
  });

  it("returns through playAnimation idle path after a one-shot animation finishes", async () => {
    const removeEventListener = vi.fn();
    let finishedHandler: ((event?: unknown) => void) | undefined;
    const addEventListener = vi.fn((_event: string, cb: (event?: unknown) => void) => {
      finishedHandler = cb;
    });
    const clipAction = vi.fn(() => ({
      setLoop: vi.fn(),
      clampWhenFinished: false,
      reset() {
        return this;
      },
      play: vi.fn(),
    }));

    (motor as any).vrm = { scene: new THREE.Group() } as VRM;
    (motor as any).animationMixer = {
      stopAllAction: vi.fn(),
      clipAction,
      addEventListener,
      removeEventListener,
    } as unknown as THREE.AnimationMixer;
    (motor as any).clipCache.set(
      "wave",
      new THREE.AnimationClip("wave", 1, []),
    );

    const playSpy = vi.spyOn(motor, "playAnimation");

    await (motor as any).loadAndPlayClip(
      "wave",
      { name: "wave", path: "/animations/wave.fbx", defaultLoop: false, label: "Wave" },
      false,
    );

    expect(addEventListener).toHaveBeenCalledWith("finished", expect.any(Function));
    expect(finishedHandler).toBeDefined();
    finishedHandler?.({});
    expect(removeEventListener).toHaveBeenCalledWith("finished", finishedHandler);
    expect(playSpy).toHaveBeenCalledWith("idle", { loop: true });
  });

  it("does not stop an active entrance animation when showroom mode changes", () => {
    const stopAllAction = vi.fn();

    (motor as any).animationMixer = {
      stopAllAction,
    } as unknown as THREE.AnimationMixer;
    (motor as any).activeMixerAnimation = "quick_formal_bow";
    (motor as any).vrm = {
      scene: new THREE.Group(),
      humanoid: { setNormalizedPose: vi.fn() },
    } as unknown as VRM;

    motor.setShowroomIdle("flank");

    expect(stopAllAction).not.toHaveBeenCalled();
  });
});
