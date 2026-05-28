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

  it("frames humanoid bones instead of far mesh outliers", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 1.6, 0.28),
      new THREE.MeshBasicMaterial(),
    );
    body.position.y = 0.8;
    root.add(body);
    const outlier = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshBasicMaterial(),
    );
    outlier.position.set(0, 60, 0);
    root.add(outlier);
    const head = new THREE.Bone();
    head.position.set(0, 1.6, 0);
    const leftFoot = new THREE.Bone();
    leftFoot.position.set(-0.12, 0, 0);
    const rightFoot = new THREE.Bone();
    rightFoot.position.set(0.12, 0, 0);
    root.add(head, leftFoot, rightFoot);
    const bones: Record<string, THREE.Object3D> = { head, leftFoot, rightFoot };
    const vrm = {
      scene: root,
      humanoid: {
        getRawBoneNode: vi.fn((name: string) => bones[name] ?? null),
      },
      expressionManager: {
        setValue: vi.fn(),
        getExpression: vi.fn(() => ({})),
      },
      update: vi.fn(),
    } as unknown as VRM;

    motor.attachVrm(vrm, scene, 320, 480);

    expect(camera.position.z).toBeLessThan(10);
    expect(camera.position.y).toBeLessThan(2);
  });

  it("uses companion displayScale as a camera framing multiplier", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 1.6, 0.28),
      new THREE.MeshBasicMaterial(),
    );
    body.position.y = 0.8;
    root.add(body);
    const vrm = {
      scene: root,
      humanoid: { getRawBoneNode: vi.fn(() => null) },
      expressionManager: {
        setValue: vi.fn(),
        getExpression: vi.fn(() => ({})),
      },
      update: vi.fn(),
    } as unknown as VRM;

    motor.attachVrm(vrm, scene, 320, 480, {
      companionId: "princess",
      vrmUrl: "/companions/princess.vrm",
      expressions: {},
      faceCamera: { position: [0, 1.4, 0.8], target: [0, 1.4, 0] },
      displayScale: 2,
      dopamineGames: [],
      sensitivity: {
        session_start: 0,
        correct_answer: 0,
        wrong_answer: 0,
        mastery_unlock: 0,
        session_complete: 0,
        session_end: 0,
        idle_too_long: 0,
      },
      idleFrequency_ms: 8000,
      randomMomentProbability: 0,
      toggledOff: false,
    });

    expect(vrm.scene.scale.x).toBeCloseTo(2);
  });

  it("does not expose a showroom-only normalized pose writer", () => {
    expect("setShowroomIdle" in motor).toBe(false);
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

  it("reproduces showroom flicker by not replaying the same loop animation with fresh timestamps", async () => {
    const thinkClip = new THREE.AnimationClip("think", 1, []);
    const thinkAction = mockAnimationAction();
    const clipAction = vi.fn(() => thinkAction);

    (motor as any).vrm = { scene: new THREE.Group() } as VRM;
    (motor as any).animationMixer = {
      stopAllAction: vi.fn(),
      clipAction,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as THREE.AnimationMixer;
    (motor as any).clipCache.set("think", thinkClip);

    const command = (timestamp: number): CompanionCommand => ({
      apiVersion: "1.0",
      type: "animate",
      payload: { animation: "think", loop: true },
      childId: "ila",
      timestamp,
      source: "diag",
    });

    motor.processCompanionCommands([command(1000)], "ila");
    await Promise.resolve();
    motor.processCompanionCommands([command(1001)], "ila");
    await Promise.resolve();

    expect(clipAction).toHaveBeenCalledTimes(1);
    expect(thinkAction.reset).toHaveBeenCalledTimes(1);
    expect(thinkAction.play).toHaveBeenCalledTimes(1);
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
