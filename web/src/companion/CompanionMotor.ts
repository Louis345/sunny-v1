/**
 * Single facade for companion VRM + viewport camera (COMPANION-MOTOR).
 * All `vrm.*` and companion root transforms go through this class.
 */

import * as THREE from "three";
import type { VRM, VRMPose } from "@pixiv/three-vrm";
import type { CompanionCommand } from "../../../src/shared/companions/companionContract";
import type {
  CompanionConfig,
  CompanionEventPayload,
} from "../../../src/shared/companionTypes";
import { isCompanionEmote } from "../../../src/shared/companionEmotes";
import {
  applyAcceptedEmote,
  applyAcceptedTrigger,
  applyExpressionPulseState,
  applyExpressionStateToVrm,
  isExpressionPulseActive,
  resolveExpressionKeyBlend,
  // applyThinkingHeadTiltToVrm,
  CompanionEventDeduper,
  createNeutralExpressionState,
  pickEmotesToApply,
  pickTriggersToApply,
  tickExpressionDecay,
  type ExpressionDecayState,
} from "../utils/companionExpressions";
import {
  // applyIdleMotionToVrm,
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
  COMPANION_ANIMATE_TO_EXPRESSION_KEY,
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
import {
  retargetMixamoClipToVrm,
  loadMixamoFbxRoot,
} from "../utils/mixamoRetarget";
import { resolveVrmExpressionName } from "../utils/vrmRequirements";

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

type ShowroomIdleMode = "center" | "flank" | null;
type HumanoidWithPoseApi = VRM["humanoid"] & {
  setNormalizedPose?: (pose: VRMPose) => void;
};

export class CompanionMotor {
  private vrm: VRM | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  /** Latest companion config for resolving `expressions` (tick + WS commands). */
  private expressionCompanionHint: CompanionConfig | null = null;

  private expressionState: ExpressionDecayState =
    createNeutralExpressionState();
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
  private blinkState = {
    nextBlinkAt: this.scheduleNextBlinkAt(),
    blinkingUntil: 0,
  };

  private animationMixer: THREE.AnimationMixer | null = null;
  private readonly clipCache = new Map<AnimationName, THREE.AnimationClip>();
  private readonly clipInflight = new Map<
    AnimationName,
    Promise<THREE.AnimationClip | null>
  >();
  private animationRequestId = 0;
  private currentAnimationAction: THREE.AnimationAction | null = null;
  private currentAnimationName: AnimationName | null = null;
  private currentAnimationLoop: boolean | null = null;
  private vrmMetaVersion = "";
  private showroomIdleMode: ShowroomIdleMode = null;
  private showroomIdleSeed = 0;
  private showroomIdleElapsedMs = 0;

  /** Reset dedupe + camera/move when rebuilding the Three scene. */
  resetSessionState(): void {
    this.processedCommandKeys.clear();
    this.expressionCompanionHint = null;
    this.cameraAnim.current = null;
    this.cameraFit = null;
    this.currentCameraAngle = "mid-shot";
    this.moveTarget = null;
    this.expressionState = createNeutralExpressionState();
    this.eventDeduper = new CompanionEventDeduper();
    this.idleState = createInitialIdleState();
    this.currentAnimationName = null;
    this.currentAnimationLoop = null;
    this.showroomIdleElapsedMs = 0;
    this.blinkState = {
      nextBlinkAt: this.scheduleNextBlinkAt(),
      blinkingUntil: 0,
    };
  }

  setCamera(camera: THREE.PerspectiveCamera | null): void {
    this.camera = camera;
  }

  setShowroomIdle(mode: ShowroomIdleMode, seed = 0): void {
    this.showroomIdleMode = mode;
    this.showroomIdleSeed = seed;
    this.showroomIdleElapsedMs = 0;
    if (mode && this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.currentAnimationAction = null;
      this.currentAnimationName = null;
      this.currentAnimationLoop = null;
    }
    if (mode) {
      this.applyShowroomIdlePose(0);
    }
  }

  setCameraAngle(angle: CameraAngle, transitionMs = 520): void {
    this.currentCameraAngle = angle;
    this.applyCameraFraming(angle, { transitionMs });
  }

  /**
   * Mount VRM into the scene, wire lookAt, initial placement.
   * `mountW` / `mountH` size the perspective projection for bbox fitting (CSS pixels).
   *
   * The VRM scene is floor-snapped: its lowest mesh point is translated to world Y=0
   * so feet always touch the ground regardless of the model's intrinsic height.
   */
  attachVrm(
    vrm: VRM,
    scene: THREE.Scene,
    mountW: number,
    mountH: number,
    companion: CompanionConfig | null = null,
  ): void {
    this.detachVrmFromScene();
    this.vrm = vrm;
    this.expressionCompanionHint = companion;
    // const lookTarget = new THREE.Object3D();
    // Place look target in front of the camera so the character looks
    // straight ahead on the first frame (before tick() repositions it).
    // lookTarget.position.set(0, 1.4, -5);
    // scene.add(lookTarget);
    // this.lookTarget = lookTarget;
    // if (vrm.lookAt) {
    //   vrm.lookAt.target = lookTarget;
    // }
    scene.add(vrm.scene);
    const metaVersion = String(
      (vrm as { meta?: { metaVersion?: string } }).meta?.metaVersion ?? "",
    );
    this.vrmMetaVersion = metaVersion;
    vrm.scene.rotation.y = metaVersion.startsWith("0") ? Math.PI : 0;
    // Reset position before measuring so we get a clean bbox.
    vrm.scene.position.set(0, 0, 0);
    vrm.scene.scale.setScalar(1);
    // Pre-simulate spring bones so hair settles at rest instead of launching on first render.
    if (vrm.springBoneManager) {
      vrm.springBoneManager.reset();
      for (let i = 0; i < 120; i++) {
        vrm.springBoneManager.update(1 / 60);
      }
    }
    // Floor-snap: shift the scene so its lowest point sits at world Y=0.
    // Works for any VRM height — no magic number needed.
    try {
      const snapBox = this.resolveUsefulVrmBounds(vrm);
      if (!snapBox.isEmpty() && snapBox.min.y !== 0) {
        vrm.scene.position.y -= snapBox.min.y;
      }
      const centerBox = this.resolveUsefulVrmBounds(vrm);
      if (!centerBox.isEmpty()) {
        const center = new THREE.Vector3();
        centerBox.getCenter(center);
        vrm.scene.position.x -= center.x;
        vrm.scene.position.z -= center.z;
      }
    } catch {
      // Degenerate / test mesh — leave at Y=0.
    }

    this.clipCache.clear();
    this.clipInflight.clear();
    this.animationRequestId += 1;
    this.currentAnimationAction = null;
    this.currentAnimationName = null;
    this.currentAnimationLoop = null;
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
    }
    this.animationMixer = new THREE.AnimationMixer(vrm.scene);
    this.fitCameraToVrm(vrm, mountW, mountH);
    if (this.showroomIdleMode) {
      this.applyShowroomIdlePose(0);
    } else {
      this.playAnimation("idle", { loop: true });
    }
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

    const displayScale = this.getDisplayScale();
    vrm.scene.scale.setScalar(1);
    vrm.scene.updateMatrixWorld(true);
    const aspect = Math.max(1e-6, mountW) / Math.max(1e-6, mountH);
    camera.aspect = aspect;
    camera.fov = COMPANION_CAMERA_BASE_FOV;
    camera.updateProjectionMatrix();

    const vFovRad = (COMPANION_CAMERA_BASE_FOV * Math.PI) / 180;
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);

    const box = this.resolveUsefulVrmBounds(vrm);
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
    const floorY = box.min.y;
    const height = Math.max(size.y, 1e-4);
    const horiz = Math.max(size.x, size.z, 1e-4);
    const margin = COMPANION_CAMERA_FIT_MARGIN;

    const distV = (height * margin) / (2 * Math.tan(vFovRad / 2));
    const distH = (horiz * margin) / (2 * Math.tan(hFovRad / 2));

    this.cameraFit = {
      center: center.clone(),
      floorY,
      height,
      baseDistance: Math.max(distV, distH),
      baseFov: COMPANION_CAMERA_BASE_FOV,
    };

    this.applyCameraFraming(this.currentCameraAngle, { instant: true });
    vrm.scene.scale.setScalar(displayScale);
    vrm.scene.updateMatrixWorld(true);
  }

  private getDisplayScale(): number {
    return typeof this.expressionCompanionHint?.displayScale === "number" &&
      Number.isFinite(this.expressionCompanionHint.displayScale)
      ? Math.max(0.1, this.expressionCompanionHint.displayScale)
      : 1;
  }

  private resolveUsefulVrmBounds(vrm: VRM): THREE.Box3 {
    const meshBox = new THREE.Box3();
    try {
      meshBox.setFromObject(vrm.scene);
    } catch {
      // Minimal / degenerate meshes can throw inside SkinnedMesh bbox.
    }

    const humanoidBox = this.resolveHumanoidBounds(vrm);
    if (humanoidBox.isEmpty()) return meshBox;
    if (meshBox.isEmpty()) return humanoidBox;

    const meshSize = new THREE.Vector3();
    const humanoidSize = new THREE.Vector3();
    meshBox.getSize(meshSize);
    humanoidBox.getSize(humanoidSize);
    const humanoidHeight = Math.max(humanoidSize.y, 1e-4);
    const meshHeight = Math.max(meshSize.y, 1e-4);

    return meshHeight > humanoidHeight * 2.5 ? humanoidBox : meshBox;
  }

  private resolveHumanoidBounds(vrm: VRM): THREE.Box3 {
    const humanoid = vrm.humanoid as
      | { getRawBoneNode?: (name: string) => THREE.Object3D | null }
      | { getNormalizedBoneNode?: (name: string) => THREE.Object3D | null }
      | null
      | undefined;
    const getBoneNode =
      "getRawBoneNode" in (humanoid ?? {})
        ? (humanoid as { getRawBoneNode?: (name: string) => THREE.Object3D | null })
            .getRawBoneNode
        : (humanoid as
            | { getNormalizedBoneNode?: (name: string) => THREE.Object3D | null }
            | null
            | undefined)?.getNormalizedBoneNode;
    if (!getBoneNode) return new THREE.Box3();

    const points: THREE.Vector3[] = [];
    const addBone = (name: string) => {
      const bone = getBoneNode.call(humanoid, name);
      if (!bone) return;
      const point = new THREE.Vector3();
      bone.getWorldPosition(point);
      points.push(point);
    };
    for (const name of [
      "head",
      "neck",
      "chest",
      "spine",
      "hips",
      "leftUpperArm",
      "rightUpperArm",
      "leftHand",
      "rightHand",
      "leftUpperLeg",
      "rightUpperLeg",
      "leftFoot",
      "rightFoot",
    ]) {
      addBone(name);
    }
    if (points.length < 2) return new THREE.Box3();

    const box = new THREE.Box3().setFromPoints(points);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = Math.max(size.y, 1e-4);
    const padX = Math.max(height * 0.18, 0.18);
    const padZ = Math.max(height * 0.12, 0.12);
    box.min.x -= padX;
    box.max.x += padX;
    box.min.z -= padZ;
    box.max.z += padZ;
    return box;
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
    if (this.showroomIdleMode && animation === "idle") {
      this.animationMixer?.stopAllAction();
      this.currentAnimationAction = null;
      this.currentAnimationName = null;
      this.currentAnimationLoop = null;
      this.applyShowroomIdlePose(0);
      return;
    }
    this.applyAnimateCommand(animation, opts ?? {});
  }

  private detachVrmFromScene(): void {
    const v = this.vrm;
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.animationMixer = null;
    }
    this.currentAnimationAction = null;
    this.currentAnimationName = null;
    this.currentAnimationLoop = null;
    this.clipCache.clear();
    this.clipInflight.clear();
    this.animationRequestId += 1;
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
    this.vrmMetaVersion = "";
    this.cameraFit = null;
  }

  dispose(): void {
    this.detachVrmFromScene();
    this.camera = null;
    this.cameraAnim.current = null;
    this.moveTarget = null;
    this.processedCommandKeys.clear();
    this.expressionCompanionHint = null;
  }

  processCompanionCommands(
    commands: CompanionCommand[],
    childId: string | null,
    companion: CompanionConfig | null = null,
  ): void {
    this.expressionCompanionHint = companion ?? this.expressionCompanionHint;
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
          applyAcceptedEmote(this.expressionState, em, intensity, companion);
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
        console.log("[VRM] animate command:", anim);
        const loopRaw = cmd.payload.loop;
        const loop = typeof loopRaw === "boolean" ? loopRaw : undefined;
        const pulseKey = isCompanionAnimationId(anim)
          ? COMPANION_ANIMATE_TO_EXPRESSION_KEY[anim as AnimationName]
          : undefined;
        if (pulseKey != null) {
          const blend = resolveExpressionKeyBlend(pulseKey, companion);
          console.log("[VRM] attempting animation pulse:", anim, "→", blend);
          applyExpressionPulseState(this.expressionState, blend, 1, 1500);
        } else {
          console.log("[VRM] attempting animation (mixer path):", anim);
          if (!isCompanionAnimationId(anim)) {
            console.warn(
              "[VRM] unknown animation:",
              anim,
              "— not in COMPANION_ANIMATION_IDS; no expression pulse",
            );
          }
        }
        this.applyAnimateCommand(anim, { loop });
      } else if (cmd.type === "move") {
        const target = parseBoneTarget(cmd.payload.target);
        const off = COMPANION_MOVE_OFFSETS[target];
        this.moveTarget = { x: off.x, z: off.z };
        const spd =
          typeof cmd.payload.speed === "string" ? cmd.payload.speed : undefined;
        this.moveLerp = moveSpeedToLerpPerFrame(spd);
      }
    }
  }

  tick(ctx: CompanionMotorTickContext): void {
    const vrm = this.vrm;
    const camera = this.camera;
    if (!vrm || !camera) return;

    const comp = ctx.companion;
    if (comp) {
      this.expressionCompanionHint = comp;
    }
    const ex = this.expressionState;

    // Emotes don't need companion config — apply regardless of comp.
    const emotes = pickEmotesToApply(ctx.companionEvents, this.eventDeduper, {
      forChildId: ctx.childId,
    });
    for (const { emote, intensity } of emotes) {
      applyAcceptedEmote(ex, emote, intensity, comp ?? this.expressionCompanionHint);
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
    }

    tickExpressionDecay(ex, ctx.dtMs);
    applyExpressionStateToVrm(vrm, ex, comp ?? this.expressionCompanionHint);

    const mouthW = updateMouthSync(ctx.analyser, ctx.dt);
    const em = vrm.expressionManager;
    if (em) {
      const mouthExpression = resolveVrmExpressionName(em, "aa");
      if (mouthExpression) {
        em.setValue(mouthExpression, mouthW);
      }
    }

    if (comp) {
      const busy = expressionBlocksIdle(
        ex.faceExpression,
        ex.faceWeight,
        ex.thinkingActive,
        isExpressionPulseActive(ex),
      );
      tickCompanionIdle(
        this.idleState,
        ctx.dtMs,
        comp,
        ctx.toggledOff,
        busy,
        () => Math.random(),
      );
      if (em) {
        const now = performance.now();
        if (!ctx.toggledOff && now >= this.blinkState.nextBlinkAt) {
          this.blinkState.blinkingUntil = now + 150 + Math.random() * 50;
          this.blinkState.nextBlinkAt = this.scheduleNextBlinkAt(now);
        }
        const isBlinking = now < this.blinkState.blinkingUntil;
        const blinkExpression = resolveVrmExpressionName(em, "blink");
        if (blinkExpression) {
          em.setValue(blinkExpression, isBlinking ? 1 : 0);
        }
      }
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

    tickCameraTransition(camera, this.cameraAnim, this.cameraAnimLookScratch);
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
    this.applyShowroomIdlePose(ctx.dtMs);
    vrm.update(ctx.dt);
    // Keep procedural bone writers disabled here. They conflict with the
    // AnimationMixer on some VRMs and previously caused bent/back-facing poses.
    // applyThinkingHeadTiltToVrm(vrm, this.expressionState);
  }

  hasVrm(): boolean {
    return this.vrm !== null;
  }

  private applyAnimateEmoteFallback(animation: string): void {
    const em = mapAnimationToEmote(animation);
    if (em && isCompanionEmote(em)) {
      applyAcceptedEmote(
        this.expressionState,
        em,
        undefined,
        this.expressionCompanionHint,
      );
    }
  }

  private scheduleNextBlinkAt(baseNow = performance.now()): number {
    return baseNow + 1000 + Math.random() * 4000;
  }

  private applyShowroomIdlePose(dtMs: number): void {
    const mode = this.showroomIdleMode;
    const vrm = this.vrm;
    if (!mode || !vrm) return;

    this.showroomIdleElapsedMs += dtMs;
    const t = this.showroomIdleElapsedMs / 1000 + this.showroomIdleSeed * 10;
    const breathe = Math.sin(t * 1.75) * (mode === "center" ? 0.022 : 0.012);
    const sway = Math.sin(t * 0.72) * (mode === "center" ? 0.045 : 0.022);
    const glance = Math.sin(t * 0.47) * (mode === "center" ? 0.09 : 0.045);
    const humanoid = vrm.humanoid as HumanoidWithPoseApi;
    const setPose = humanoid.setNormalizedPose?.bind(humanoid);
    if (!setPose) return;

    const q = (x = 0, y = 0, z = 0): [number, number, number, number] => {
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(x, y, z, "XYZ"),
      );
      return [quat.x, quat.y, quat.z, quat.w];
    };

    const upperArmDrop = mode === "center" ? 1.18 : 1.1;
    const elbowEase = mode === "center" ? 0.16 : 0.1;
    const armSign = this.vrmMetaVersion.startsWith("0") ? 1 : -1;
    const pose: VRMPose = {
      hips: {
        position: [0, breathe * 0.035, 0],
        rotation: q(0, 0, sway * 0.09),
      },
      spine: { rotation: q(breathe * 0.08, 0, sway * 0.12) },
      chest: { rotation: q(breathe * 0.07, 0, sway * 0.08) },
      neck: { rotation: q(0, glance * 0.28, -sway * 0.1) },
      head: { rotation: q(0, glance, -sway * 0.16) },
      leftUpperArm: { rotation: q(0, 0, armSign * upperArmDrop) },
      rightUpperArm: { rotation: q(0, 0, -armSign * upperArmDrop) },
      leftLowerArm: { rotation: q(0, 0, armSign * elbowEase) },
      rightLowerArm: { rotation: q(0, 0, -armSign * elbowEase) },
      leftHand: { rotation: q(breathe * 0.08, 0, 0) },
      rightHand: { rotation: q(breathe * 0.08, 0, 0) },
    };

    setPose(pose);
  }

  private applyAnimateCommand(
    animation: string,
    opts: { loop?: boolean },
  ): void {
    if (!isCompanionAnimationId(animation)) {
      console.warn(
        `🎮 [CompanionMotor] [animate] [skip] not a contract animation id: ${JSON.stringify(animation)}`,
      );
      return;
    }
    const name = animation as AnimationName;
    const entry = getAnimationEntry(name);
    const loop = opts.loop ?? entry?.defaultLoop ?? false;
    if (!entry?.path) {
      console.warn(
        `🎮 [CompanionMotor] [animate] [emote-fallback] no FBX path in registry for "${name}" — emote only`,
      );
      this.applyAnimateEmoteFallback(animation);
      return;
    }
    if (this.currentAnimationName === name && this.currentAnimationLoop === loop) {
      console.log(
        `🎮 [CompanionMotor] [animate] [skip] already playing "${name}" loop=${loop}`,
      );
      return;
    }
    this.currentAnimationName = name;
    this.currentAnimationLoop = loop;
    const requestId = ++this.animationRequestId;
    void this.loadAndPlayClip(name, entry, loop, requestId);
  }

  private async loadAndPlayClip(
    name: AnimationName,
    entry: AnimationRegistryEntry,
    loop: boolean,
    requestId = ++this.animationRequestId,
  ): Promise<void> {
    const vrm = this.vrm;
    const mixer = this.animationMixer;
    if (!vrm || !mixer) {
      console.warn(
        `🎮 [CompanionMotor] [animate] [emote-fallback] "${name}" — missing vrm=${Boolean(vrm)} mixer=${Boolean(mixer)}`,
      );
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
    if (requestId !== this.animationRequestId) {
      console.log(
        `🎮 [CompanionMotor] [animate] [stale] skip "${name}" request=${requestId} latest=${this.animationRequestId}`,
      );
      return;
    }
    if (!clip || !this.animationMixer || !this.vrm) {
      if (!clip) {
        console.warn(
          `🎮 [CompanionMotor] [animate] [emote-fallback] "${name}" — FBX load/retarget produced no clip (see prior [animation-fetch] logs)`,
        );
      } else {
        console.warn(
          `🎮 [CompanionMotor] [animate] [emote-fallback] "${name}" — vrm/mixer became null after async load`,
        );
      }
      if (this.currentAnimationName === name && this.currentAnimationLoop === loop) {
        this.currentAnimationName = null;
        this.currentAnimationLoop = null;
      }
      this.applyAnimateEmoteFallback(name);
      return;
    }
    console.log(
      `🎮 [CompanionMotor] [animate] [play] "${name}" tracks=${clip.tracks.length} loop=${loop}`,
    );
    const previousAction = this.currentAnimationAction;
    const action = this.animationMixer.clipAction(clip);
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    action.clampWhenFinished = !loop;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.reset();
    if (previousAction && previousAction !== action) {
      action.crossFadeFrom(previousAction, 0.22, false).play();
    } else {
      action.play();
    }
    this.currentAnimationAction = action;

    if (!loop) {
      const onFinished = (event?: { action?: THREE.AnimationAction }) => {
        if (event?.action && event.action !== action) {
          return;
        }
        this.animationMixer?.removeEventListener("finished", onFinished);
        this.playAnimation("idle", { loop: true });
      };
      this.animationMixer.addEventListener("finished", onFinished);
    }
  }

  private async fetchRetargetedClip(
    name: AnimationName,
    entry: AnimationRegistryEntry,
    vrm: VRM,
  ): Promise<THREE.AnimationClip | null> {
    const path = entry.path;
    const url =
      typeof window !== "undefined" &&
      path.startsWith("/") &&
      !path.startsWith("//")
        ? `${window.location.origin}${path}`
        : path;
    console.log(
      `🎮 [CompanionMotor] [animation-fetch] [start] name="${name}" url=${url}`,
    );
    try {
      const root = await loadMixamoFbxRoot(url);
      // Pick the first animation clip that actually contains tracks.
      // Some Mixamo FBX exports put the clip at index > 0 or embed a
      // zero-track placeholder at index 0.
      const raw = root.animations.find((c) => c.tracks.length > 0);
      if (!raw) {
        const clipSummaries = root.animations.map(
          (c, i) => `#${i} tracks=${c.tracks.length} duration=${c.duration}`,
        );
        console.warn(
          `🎮 [CompanionMotor] [animation-fetch] [no-tracks] name="${name}" url=${url} clips=${root.animations.length} ${clipSummaries.join(" | ") || "(none)"}`,
        );
        return null;
      }
      const retargeted = retargetMixamoClipToVrm(raw, root, vrm);
      if (!retargeted) {
        console.warn(
          `🎮 [CompanionMotor] [animation-fetch] [retarget-empty] name="${name}" url=${url} rawTracks=${raw.tracks.length} → zero VRM tracks after retarget`,
        );
        return null;
      }
      console.log(
        `🎮 [CompanionMotor] [animation-fetch] [ok] name="${name}" retargetedTracks=${retargeted.tracks.length}`,
      );
      return retargeted;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `🎮 [CompanionMotor] [animation-fetch] [error] name="${name}" url=${url} ${msg}`,
      );
      return null;
    }
  }
}
