/**
 * Single facade for companion VRM + viewport camera (COMPANION-MOTOR).
 * All `vrm.*` and companion root transforms go through this class.
 */

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import { isCompanionEmote } from "../../../src/shared/companionEmotes";
import {
  applyAcceptedEmote,
  applyAcceptedTrigger,
  applyExpressionStateToVrm,
  applyThinkingHeadTiltToVrm,
  CompanionEventDeduper,
  createNeutralExpressionState,
  pickEmotesToApply,
  pickTriggersToApply,
  tickExpressionDecay,
  type ExpressionDecayState,
} from "../utils/companionExpressions";
import {
  applyIdleMotionToVrm,
  createInitialIdleState,
  expressionBlocksIdle,
  screenPixelToLookTargetWorld,
  tickCompanionIdle,
  type CompanionIdleState,
} from "../utils/companionIdle";
import { updateMouthSync } from "../utils/audioAnalyser";
import {
  resolveCameraFraming,
  startCameraTransition,
  tickCameraTransition,
  type CameraAnimState,
  type CameraFitBaseline,
} from "../utils/companionCamera";
import {
  CAMERA_ANGLES,
  COMPANION_CAMERA_BASE_FOV,
  COMPANION_CAMERA_FIT_MARGIN,
  type CameraAngle,
} from "../../../src/shared/companions/companionContract";
import {
  COMPANION_MOVE_OFFSETS,
  isCompanionAnimationId,
  mapAnimationToEmote,
  moveSpeedToLerpPerFrame,
  parseBoneTarget,
} from "../../../src/shared/companions/companionAnimateBridge";
import type { AnimationName } from "../../../src/shared/companions/companionContract";
import {
  getAnimationEntry,
  type AnimationRegistryEntry,
} from "./animationRegistry";
import { loadMixamoFbxRoot, retargetMixamoClipToVrm } from "./mixamoRetarget";
export interface CompanionMotorTickContext {
  dt: number;
  dtMs: number;
  companionEvents: CompanionEventPayload[];
  companion: CompanionConfig | null;
  childId: string | null;
  toggledOff: boolean;
  activeNodeScreen: { x: number; y: number } | null;
  analyser: AnalyserNode | null;
}

export class CompanionMotor {
  private vrm: VRM | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private expressionState: ExpressionDecayState = createNeutralExpressionState();
  private eventDeduper = new CompanionEventDeduper();
  private idleState: CompanionIdleState = createInitialIdleState();
  private lookTarget: THREE.Object3D | null = null;
  private readonly scratchVec = new THREE.Vector3();

  private processedCommandKeys = new Set<string>();
  private cameraAnim: { current: CameraAnimState | null } = { current: null };
  private readonly cameraEndPos = new THREE.Vector3();
  private readonly cameraEndLook = new THREE.Vector3();
  private readonly cameraAnimLookScratch = new THREE.Vector3();
  private readonly lastCameraLookAt = new THREE.Vector3(0, 0.8, 0);
  private cameraFit: CameraFitBaseline | null = null;
  private currentCameraAngle: CameraAngle = "mid-shot";

  private moveTarget: { x: number; z: number } | null = null;
  private moveLerp = 0.065;

  private animationMixer: THREE.AnimationMixer | null = null;
  private readonly clipCache = new Map<AnimationName, THREE.AnimationClip>();
  private readonly clipInflight = new Map<
    AnimationName,
    Promise<THREE.AnimationClip | null>
  >();

  /** Reset dedupe + camera/move when rebuilding the Three scene. */
  resetSessionState(): void {
    this.processedCommandKeys.clear();
    this.cameraAnim.current = null;
    this.cameraFit = null;
    this.currentCameraAngle = "mid-shot";
    this.moveTarget = null;
    this.expressionState = createNeutralExpressionState();
    this.eventDeduper = new CompanionEventDeduper();
    this.idleState = createInitialIdleState();
  }

  setCamera(camera: THREE.PerspectiveCamera | null): void {
    this.camera = camera;
  }

  /**
   * Mount VRM into the scene, wire lookAt, initial placement.
   * `mountW` / `mountH` size the perspective projection for bbox fitting (CSS pixels).
   */
  attachVrm(
    vrm: VRM,
    scene: THREE.Scene,
    mountW: number,
    mountH: number,
  ): void {
    this.detachVrmFromScene();
    this.vrm = vrm;
    const lookTarget = new THREE.Object3D();
    // Place look target in front of the camera so the character looks
    // straight ahead on the first frame (before tick() repositions it).
    lookTarget.position.set(0, 1.4, -5);
    scene.add(lookTarget);
    this.lookTarget = lookTarget;
    if (vrm.lookAt) {
      vrm.lookAt.target = lookTarget;
    }
    scene.add(vrm.scene);
    vrm.scene.rotation.y = 0;
    vrm.scene.position.set(0, -0.8, 0);
    // Pre-simulate spring bones so hair settles at rest instead of launching on first render.
    if (vrm.springBoneManager) {
      vrm.springBoneManager.reset();
      for (let i = 0; i < 120; i++) {
        vrm.springBoneManager.update(1 / 60);
      }
    }

    this.clipCache.clear();
    this.clipInflight.clear();
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
    }
    this.animationMixer = new THREE.AnimationMixer(vrm.scene);
    this.fitCameraToVrm(vrm, mountW, mountH);
    this.playAnimation("idle", { loop: true });
  }

  /**
   * Resize path — refit using the attached VRM and latest mount dimensions.
   */
  syncCameraToMount(mountW: number, mountH: number): void {
    const vrm = this.vrm;
    if (!vrm) return;
    this.fitCameraToVrm(vrm, mountW, mountH);
  }

  /**
   * Fit camera distance to loaded VRM bounds and viewport aspect; applies current framing preset.
   */
  fitCameraToVrm(vrm: VRM, mountW: number, mountH: number): void {
    const camera = this.camera;
    if (!vrm || vrm !== this.vrm || !camera) return;

    const aspect =
      Math.max(1e-6, mountW) / Math.max(1e-6, mountH);
    camera.aspect = aspect;
    camera.fov = COMPANION_CAMERA_BASE_FOV;
    camera.updateProjectionMatrix();

    const vFovRad = (COMPANION_CAMERA_BASE_FOV * Math.PI) / 180;
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);

    const box = new THREE.Box3();
    try {
      box.setFromObject(vrm.scene);
    } catch {
      // Minimal / degenerate meshes (e.g. tests) can throw inside SkinnedMesh bbox — use human-scale fallback.
    }
    if (box.isEmpty()) {
      box.setFromCenterAndSize(
        new THREE.Vector3(0, 0.8, 0),
        new THREE.Vector3(0.6, 1.65, 0.45),
      );
    }
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const height = Math.max(size.y, 1e-4);
    const horiz = Math.max(size.x, size.z, 1e-4);
    const margin = COMPANION_CAMERA_FIT_MARGIN;

    const distV = (height * margin) / (2 * Math.tan(vFovRad / 2));
    const distH = (horiz * margin) / (2 * Math.tan(hFovRad / 2));

    this.cameraFit = {
      center: center.clone(),
      height,
      baseDistance: Math.max(distV, distH),
      baseFov: COMPANION_CAMERA_BASE_FOV,
    };

    this.applyCameraFraming(this.currentCameraAngle, { instant: true });
  }

  private applyCameraFraming(
    angle: CameraAngle,
    opts: { instant?: boolean; transitionMs?: number } = {},
  ): void {
    const cam = this.camera;
    const fit = this.cameraFit;
    if (!cam || !fit) return;

    const endFov = resolveCameraFraming(
      fit,
      angle,
      this.cameraEndPos,
      this.cameraEndLook,
    );

    const transitionMs = opts.transitionMs;
    const instant = opts.instant ?? transitionMs === 0;

    if (instant) {
      cam.position.copy(this.cameraEndPos);
      cam.fov = endFov;
      cam.updateProjectionMatrix();
      cam.lookAt(this.cameraEndLook);
      this.lastCameraLookAt.copy(this.cameraEndLook);
      this.cameraAnim.current = null;
      return;
    }

    startCameraTransition(
      cam,
      {
        startPos: cam.position.clone(),
        startLookAt: this.lastCameraLookAt.clone(),
        endPos: this.cameraEndPos.clone(),
        endLookAt: this.cameraEndLook.clone(),
        startFov: cam.fov,
        endFov,
      },
      transitionMs,
      this.cameraAnim,
    );
  }

  /**
   * Play a registered animation by id (used after VRM attach and for tooling).
   */
  playAnimation(animation: string, opts?: { loop?: boolean }): void {
    this.applyAnimateCommand(animation, opts ?? {});
  }

  private detachVrmFromScene(): void {
    const v = this.vrm;
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.animationMixer = null;
    }
    this.clipCache.clear();
    this.clipInflight.clear();
    if (v?.lookAt) {
      v.lookAt.target = null;
    }
    const lt = this.lookTarget;
    this.lookTarget = null;
    if (lt?.parent) {
      lt.parent.remove(lt);
    }
    if (v) {
      v.scene.removeFromParent();
    }
    this.vrm = null;
    this.cameraFit = null;
  }

  dispose(): void {
    this.detachVrmFromScene();
    this.camera = null;
    this.cameraAnim.current = null;
    this.moveTarget = null;
    this.processedCommandKeys.clear();
  }

  processCompanionCommands(
    commands: CompanionCommand[],
    childId: string | null,
  ): void {
    const want = childId?.trim().toLowerCase() ?? "";
    for (const cmd of commands) {
      if (want && cmd.childId.trim().toLowerCase() !== want) continue;
      const key = `${cmd.timestamp}|${cmd.type}|${cmd.childId}|${cmd.source}`;
      if (this.processedCommandKeys.has(key)) continue;
      this.processedCommandKeys.add(key);
      if (this.processedCommandKeys.size > 256) {
        const sorted = [...this.processedCommandKeys].sort();
        for (let i = 0; i < sorted.length - 128; i++) {
          this.processedCommandKeys.delete(sorted[i]!);
        }
      }
      const cam = this.camera;
      if (cmd.type === "emote") {
        const em = cmd.payload.emote;
        if (isCompanionEmote(em)) {
          const intRaw = cmd.payload.intensity;
          const intensity =
            typeof intRaw === "number" && Number.isFinite(intRaw)
              ? intRaw
              : undefined;
          applyAcceptedEmote(this.expressionState, em, intensity);
        }
      } else if (cmd.type === "camera" && cam) {
        const angleRaw = String(cmd.payload.angle ?? "mid-shot");
        const tr = cmd.payload.transition_ms;
        const transitionMs =
          typeof tr === "number" && Number.isFinite(tr) ? tr : undefined;
        const angle = (CAMERA_ANGLES as readonly string[]).includes(angleRaw)
          ? (angleRaw as CameraAngle)
          : "mid-shot";
        this.currentCameraAngle = angle;
        this.applyCameraFraming(angle, { transitionMs });
      } else if (cmd.type === "animate") {
        const anim =
          typeof cmd.payload.animation === "string"
            ? cmd.payload.animation
            : "idle";
        const loopRaw = cmd.payload.loop;
        const loop =
          typeof loopRaw === "boolean"
            ? loopRaw
            : undefined;
        this.applyAnimateCommand(anim, { loop });
      } else if (cmd.type === "move") {
        const target = parseBoneTarget(cmd.payload.target);
        const off = COMPANION_MOVE_OFFSETS[target];
        this.moveTarget = { x: off.x, z: off.z };
        const spd =
          typeof cmd.payload.speed === "string" ? cmd.payload.speed : undefined;
        this.moveLerp = moveSpeedToLerpPerFrame(spd);
        console.log("🎮 [CompanionMotor] companion_command move", {
          target,
          speed: spd ?? "normal",
        });
      }
    }
  }

  tick(ctx: CompanionMotorTickContext): void {
    const vrm = this.vrm;
    const camera = this.camera;
    if (!vrm || !camera) return;

    const comp = ctx.companion;
    const ex = this.expressionState;

    // Emotes don't need companion config — apply regardless of comp.
    const emotes = pickEmotesToApply(ctx.companionEvents, this.eventDeduper, {
      forChildId: ctx.childId,
    });
    for (const { emote, intensity } of emotes) {
      console.log("🎮 [CompanionMotor] applying emote from event:", { emote, intensity });
      applyAcceptedEmote(ex, emote, intensity);
    }

    if (comp) {
      const triggers = pickTriggersToApply(
        ctx.companionEvents,
        comp,
        () => Math.random(),
        this.eventDeduper,
        { forChildId: ctx.childId },
      );
      for (const t of triggers) {
        applyAcceptedTrigger(ex, t);
      }
    } else if (ctx.companionEvents.length > 0) {
      console.warn(
        "🎮 [CompanionMotor] companion config null — triggers skipped, events pending:",
        ctx.companionEvents.length,
      );
    }

    tickExpressionDecay(ex, ctx.dtMs);
    applyExpressionStateToVrm(vrm, ex);

    if (comp) {
      const busy = expressionBlocksIdle(
        ex.faceExpression,
        ex.faceWeight,
        ex.thinkingActive,
      );
      tickCompanionIdle(
        this.idleState,
        ctx.dtMs,
        comp,
        ctx.toggledOff,
        busy,
        () => Math.random(),
      );
      applyIdleMotionToVrm(vrm, this.idleState);
      const mouthW = updateMouthSync(ctx.analyser, ctx.dt);
      vrm.expressionManager?.setValue("aa", mouthW);
    }

    const look = vrm.lookAt;
    const lt = this.lookTarget;
    if (look && lt) {
      const scr = ctx.activeNodeScreen;
      const w = typeof window !== "undefined" ? window.innerWidth : 1;
      const h = typeof window !== "undefined" ? window.innerHeight : 1;
      const cx = scr?.x ?? w / 2;
      const cy = scr?.y ?? h / 2;
      screenPixelToLookTargetWorld(cx, cy, camera, this.scratchVec);
      lt.position.copy(this.scratchVec);
    }

    tickCameraTransition(
      camera,
      this.cameraAnim,
      this.cameraAnimLookScratch,
    );
    if (this.cameraAnim.current) {
      this.lastCameraLookAt.copy(this.cameraAnimLookScratch);
    }
    const mt = this.moveTarget;
    if (mt) {
      const p = vrm.scene.position;
      const a = this.moveLerp;
      p.x += (mt.x - p.x) * a;
      p.z += (mt.z - p.z) * a;
      if (Math.abs(p.x - mt.x) < 0.006 && Math.abs(p.z - mt.z) < 0.006) {
        p.x = mt.x;
        p.z = mt.z;
      }
    }
    if (this.animationMixer) {
      this.animationMixer.update(ctx.dt);
    }
    vrm.update(ctx.dt);
    applyThinkingHeadTiltToVrm(vrm, this.expressionState);
  }

  hasVrm(): boolean {
    return this.vrm !== null;
  }

  private applyAnimateEmoteFallback(animation: string): void {
    const em = mapAnimationToEmote(animation);
    if (em && isCompanionEmote(em)) {
      applyAcceptedEmote(this.expressionState, em);
      console.log(
        "🎮 [CompanionMotor] animate emote fallback",
        animation,
        "→",
        em,
      );
    }
  }

  private applyAnimateCommand(
    animation: string,
    opts: { loop?: boolean },
  ): void {
    console.log("🎮 [CompanionMotor] applying animate command:", { animation });
    if (!isCompanionAnimationId(animation)) {
      return;
    }
    const name = animation as AnimationName;
    const entry = getAnimationEntry(name);
    const loop =
      opts.loop ?? entry?.defaultLoop ?? false;
    if (!entry?.path) {
      this.applyAnimateEmoteFallback(animation);
      return;
    }
    void this.loadAndPlayClip(name, entry, loop);
  }

  private async loadAndPlayClip(
    name: AnimationName,
    entry: AnimationRegistryEntry,
    loop: boolean,
  ): Promise<void> {
    const vrm = this.vrm;
    const mixer = this.animationMixer;
    if (!vrm || !mixer) {
      this.applyAnimateEmoteFallback(name);
      return;
    }
    let clip = this.clipCache.get(name);
    if (!clip) {
      let inflight = this.clipInflight.get(name);
      if (!inflight) {
        inflight = this.fetchRetargetedClip(name, entry, vrm).finally(() => {
          this.clipInflight.delete(name);
        });
        this.clipInflight.set(name, inflight);
      }
      clip = (await inflight) ?? undefined;
      if (clip) {
        this.clipCache.set(name, clip);
      }
    }
    if (!clip || !this.animationMixer || !this.vrm) {
      this.applyAnimateEmoteFallback(name);
      return;
    }
    this.animationMixer.stopAllAction();
    const action = this.animationMixer.clipAction(clip);
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    action.clampWhenFinished = !loop;
    action.reset().play();
    console.log("🎮 [CompanionMotor] animate clip", name, { loop });

    if (!loop) {
      const onFinished = () => {
        this.animationMixer?.removeEventListener("finished", onFinished);
        this.applyAnimateCommand("idle", { loop: true });
      };
      this.animationMixer.addEventListener("finished", onFinished);
    }
  }

  private async fetchRetargetedClip(
    name: AnimationName,
    entry: AnimationRegistryEntry,
    vrm: VRM,
  ): Promise<THREE.AnimationClip | null> {
    try {
      const path = entry.path;
      const url =
        typeof window !== "undefined" &&
        path.startsWith("/") &&
        !path.startsWith("//")
          ? `${window.location.origin}${path}`
          : path;
      const root = await loadMixamoFbxRoot(url);
      // Pick the first animation clip that actually contains tracks.
      // Some Mixamo FBX exports put the clip at index > 0 or embed a
      // zero-track placeholder at index 0.
      const raw = root.animations.find((c) => c.tracks.length > 0);
      if (!raw) {
        console.warn(
          `🎮 [CompanionMotor] ${name}.fbx loaded but has no animation tracks (${root.animations.length} clips)`,
        );
        return null;
      }
      return retargetMixamoClipToVrm(raw, root, vrm);
    } catch (err) {
      console.warn("🎮 [CompanionMotor] FBX load/retarget failed:", name, err);
      return null;
    }
  }
}
