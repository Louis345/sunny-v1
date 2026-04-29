import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { CompanionMotor } from "../companion/CompanionMotor";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import * as bridge from "../../../src/shared/companions/companionAnimateBridge";

describe("CompanionMotor (COMPANION-MOTOR)", () => {
  let motor: CompanionMotor;
  let camera: THREE.PerspectiveCamera;

  function mockAnimationAction(overrides: Partial<THREE.AnimationAction> = {}) {
    const action = {
      setLoop: vi.fn(),
      clampWhenFinished: false,
      enabled: false,
      setEffectiveWeight: vi.fn(),
      setEffectiveTimeScale: vi.fn(),
      reset: vi.fn(function () {
        return action;
      }),
      play: vi.fn(function () {
        return action;
      }),
      crossFadeFrom: vi.fn(function () {
        return action;
      }),
      ...overrides,
    } as unknown as THREE.AnimationAction;
    return action;
  }

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

  it("returns through playAnimation idle path after a one-shot animation finishes", async () => {
    const removeEventListener = vi.fn();
    let finishedHandler: ((event?: unknown) => void) | undefined;
    const addEventListener = vi.fn((_event: string, cb: (event?: unknown) => void) => {
      finishedHandler = cb;
    });
    const action = mockAnimationAction();
    const clipAction = vi.fn(() => action);

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
    finishedHandler?.({ action });
    expect(removeEventListener).toHaveBeenCalledWith("finished", finishedHandler);
    expect(playSpy).toHaveBeenCalledWith("idle", { loop: true });
  });

  it("does not let a slower previous animation override a newer idle request", async () => {
    let resolveWave:
      | ((clip: THREE.AnimationClip | null) => void)
      | undefined;
    const played: string[] = [];
    const clipAction = vi.fn((clip: THREE.AnimationClip) => {
      played.push(clip.name);
      return mockAnimationAction();
    });

    (motor as any).vrm = { scene: new THREE.Group() } as VRM;
    (motor as any).animationMixer = {
      stopAllAction: vi.fn(),
      clipAction,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as THREE.AnimationMixer;
    vi.spyOn(motor as any, "fetchRetargetedClip").mockImplementation(
      (name: unknown) => {
        if (name === "wave") {
          return new Promise<THREE.AnimationClip | null>((resolve) => {
            resolveWave = resolve;
          });
        }
        return Promise.resolve(new THREE.AnimationClip(String(name), 1, []));
      },
    );

    motor.playAnimation("wave", { loop: false });
    motor.playAnimation("idle", { loop: true });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(played).toEqual(["idle"]);

    resolveWave?.(new THREE.AnimationClip("wave", 1, []));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(played).toEqual(["idle"]);
  });

  it("crossfades between active FBX actions instead of hard-stopping the mixer", async () => {
    const idleClip = new THREE.AnimationClip("idle", 1, []);
    const waveClip = new THREE.AnimationClip("wave", 1, []);
    const idleAction = mockAnimationAction();
    const waveAction = mockAnimationAction();
    const stopAllAction = vi.fn();
    const clipAction = vi.fn((clip: THREE.AnimationClip) =>
      clip.name === "idle" ? idleAction : waveAction,
    );

    (motor as any).vrm = { scene: new THREE.Group() } as VRM;
    (motor as any).animationMixer = {
      stopAllAction,
      clipAction,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as THREE.AnimationMixer;
    (motor as any).clipCache.set("idle", idleClip);
    (motor as any).clipCache.set("wave", waveClip);

    await (motor as any).loadAndPlayClip(
      "idle",
      { name: "idle", path: "/animations/idle.fbx", defaultLoop: true, label: "Idle" },
      true,
    );
    await (motor as any).loadAndPlayClip(
      "wave",
      { name: "wave", path: "/animations/wave.fbx", defaultLoop: false, label: "Wave" },
      false,
    );

    expect(stopAllAction).not.toHaveBeenCalled();
    expect(waveAction.crossFadeFrom).toHaveBeenCalledWith(
      idleAction,
      0.22,
      false,
    );
    expect(waveAction.play).toHaveBeenCalled();
  });

});
