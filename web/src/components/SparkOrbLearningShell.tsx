import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { CompanionConfig } from "../../../src/shared/companionTypes";
import type { CompanionBehavior } from "../context/companionCareBehavior";
import { playSparkOrbSfx, type SparkOrbSfxOptions } from "../utils/sparkOrbSfx";
import { CompanionLayer } from "./CompanionLayer";
import type { SparkOrbEncounterPhase } from "./SparkOrbEncounterPost";

export type OrbLearningLastMoment =
  | "watching"
  | "spark_earned"
  | "missed_try"
  | "recovered"
  | "orb_ready"
  | "launched"
  | "collected";

export type OrbCompanionAllowedRole =
  | "emote_only"
  | "emote_and_tiny_reaction"
  | "hint_only";

export interface OrbCompanionAnchorContext {
  source: "orb_learning_shell";
  role: "travel_buddy";
  childId: string;
  childName: string;
  companion: string;
  companionName: string;
  phase: SparkOrbEncounterPhase;
  chargeCount: number;
  chargeGoal: number;
  domain: string;
  currentTarget: string;
  lastMoment: OrbLearningLastMoment;
  allowedRole: OrbCompanionAllowedRole;
  disallowedRole: "tutor_scoring_or_mastery_claims";
}

export type SparkOrbLearningEncounterEventType =
  | "hold_start"
  | "release_success"
  | "release_miss"
  | "orb_spent"
  | "recharge_needed"
  | "capture_effect"
  | "capture_pull"
  | "capture_shrink"
  | "capture_lock"
  | "collectible_revealed"
  | "collection_settled"
  | "collection_reverse_started"
  | "collection_reverse_complete";

export type SparkOrbLaunchResult = "success" | "miss-early" | "miss-late";
export type SparkOrbHitQuality = "direct" | "near" | "wide";

export interface SparkOrbLearningEncounterEvent {
  type: SparkOrbLearningEncounterEventType;
  phase: SparkOrbEncounterPhase;
  chargeCount: number;
  chargeGoal: number;
  orbCount: number;
  result?: SparkOrbLaunchResult;
  hitDistance?: number;
  hitQuality?: SparkOrbHitQuality;
  holdPower?: number;
  currentTarget: string;
}

export interface SparkOrbLearningShellProps {
  children: ReactNode;
  childId: string;
  childName: string;
  companion: CompanionConfig;
  companionName?: string;
  phase: SparkOrbEncounterPhase;
  chargeGoal?: number;
  domain: string;
  currentTarget: string;
  lastMoment?: OrbLearningLastMoment;
  allowedRole?: OrbCompanionAllowedRole;
  creatureName?: string;
  statLabel?: string;
  statValue?: number;
  orbCount?: number;
  captureProgress?: number;
  sfx?: SparkOrbSfxOptions;
  onCompanionAnchor?: (context: OrbCompanionAnchorContext) => void;
  onEncounterEvent?: (event: SparkOrbLearningEncounterEvent) => void;
}

const assetBase = "/encounters/spark-orb";
const visualTreatment = { filter: "none", opacity: 1 };
const sparkZoneStart = 48;
const sparkZoneEnd = 70;
const creatureCaptureRadius = 82;

type LaunchSkillState = "waiting" | "holding" | "success" | "spent";
type LaunchAimState = "idle" | "aiming" | "clean" | "weak" | "wide";
type LaunchFlightState = "idle" | "traveling" | "impact" | "reward" | "settled" | "fizzle";
type CaptureEffectState = "inactive" | "charging" | "active";
type CaptureStage = "free" | "incoming" | "pulling" | "shrinking" | "locked" | "collection-added";
type CreatureCaptureMotion = "free" | "pulling" | "shrinking" | "hidden";

interface LaunchAimVector {
  startX: number;
  startY: number;
  pullX: number;
  pullY: number;
}

export interface SparkOrbLaunchPhysicsInput {
  pullX: number;
  pullY: number;
  holdPower?: number;
}

export interface SparkOrbLaunchPhysics {
  result: SparkOrbLaunchResult;
  hitQuality: SparkOrbHitQuality;
  hitDistance: number;
  hitScore: number;
  power: number;
  flightX: number;
  flightY: number;
  peakX: number;
  peakY: number;
  impactX: number;
  impactY: number;
  rotation: number;
  launchScale: number;
  peakScale: number;
  flightScale: number;
  impactScale: number;
}

function chargeCountForPhase(phase: SparkOrbEncounterPhase): number {
  switch (phase) {
    case "idle":
      return 0;
    case "charge-1":
      return 1;
    case "charge-2":
      return 2;
    case "ready":
    case "launching":
    case "collected":
      return 3;
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function captureStageForProgress(progress: number): CaptureStage {
  if (progress >= 92) return "collection-added";
  if (progress >= 76) return "locked";
  if (progress >= 42) return "shrinking";
  if (progress >= 18) return "pulling";
  if (progress >= 5) return "incoming";
  return "free";
}

function captureEffectForProgress(progress: number): CaptureEffectState {
  if (progress >= 98) return "inactive";
  if (progress >= 92) return "active";
  if (progress >= 18) return "active";
  if (progress >= 5) return "charging";
  return "inactive";
}

function flightStateForProgress(progress: number): LaunchFlightState {
  if (progress >= 98) return "settled";
  if (progress >= 92) return "reward";
  if (progress >= 18) return "impact";
  if (progress >= 5) return "traveling";
  return "idle";
}

export function computeSparkOrbLaunchPhysics({
  pullX,
  pullY,
  holdPower = 0,
}: SparkOrbLaunchPhysicsInput): SparkOrbLaunchPhysics {
  const verticalPull = Math.max(0, Math.min(320, pullY));
  const horizontalPull = Math.max(-170, Math.min(170, pullX));
  const power = Math.round(Math.max(holdPower, clampPercent((verticalPull / 220) * 100)));
  const underpowered = verticalPull < 112;
  const verticalSweetSpot = 178;
  const verticalPenalty = Math.abs(verticalPull - verticalSweetSpot) * 0.24;
  const hitDistance = Math.round(Math.hypot(horizontalPull * 0.82, verticalPenalty));
  const hitQuality: SparkOrbHitQuality =
    hitDistance <= 34 ? "direct" : hitDistance <= creatureCaptureRadius ? "near" : "wide";
  const insideCaptureRadius = hitDistance <= creatureCaptureRadius;
  const result: SparkOrbLaunchResult =
    insideCaptureRadius ? "success" : underpowered ? "miss-early" : "miss-late";
  const impactX = Math.round(horizontalPull * 0.72);
  const verticalDrift = Math.max(-44, Math.min(52, (verticalSweetSpot - verticalPull) * 0.48));
  const impactY = Math.round(-316 + verticalDrift);
  const peakX = Math.round(impactX * 0.42);
  const peakY = Math.round(-410 - Math.min(54, verticalPull * 0.12));
  const flightX = Math.round(impactX * 0.58);
  const flightY = Math.round((peakY + impactY) / 2);
  const depthScale =
    hitQuality === "direct"
      ? { peakScale: 0.72, flightScale: 0.54, impactScale: 0.4 }
      : hitQuality === "near"
        ? { peakScale: 0.76, flightScale: 0.6, impactScale: 0.48 }
        : { peakScale: 0.82, flightScale: 0.68, impactScale: 0.56 };

  return {
    result,
    hitQuality,
    hitDistance,
    hitScore: Math.max(0, Math.round(100 - hitDistance)),
    power,
    flightX,
    flightY,
    peakX,
    peakY,
    impactX,
    impactY,
    rotation: Math.round(Math.max(-34, Math.min(34, 18 + horizontalPull * 0.16))),
    launchScale: 1,
    ...depthScale,
  };
}

export function buildOrbCompanionAnchorContext(input: {
  childId: string;
  childName: string;
  companionId: string;
  companionName: string;
  phase: SparkOrbEncounterPhase;
  chargeCount: number;
  chargeGoal: number;
  domain: string;
  currentTarget: string;
  lastMoment: OrbLearningLastMoment;
  allowedRole: OrbCompanionAllowedRole;
}): OrbCompanionAnchorContext {
  return {
    source: "orb_learning_shell",
    role: "travel_buddy",
    childId: input.childId,
    childName: input.childName,
    companion: input.companionId,
    companionName: input.companionName,
    phase: input.phase,
    chargeCount: input.chargeCount,
    chargeGoal: input.chargeGoal,
    domain: input.domain,
    currentTarget: input.currentTarget,
    lastMoment: input.lastMoment,
    allowedRole: input.allowedRole,
    disallowedRole: "tutor_scoring_or_mastery_claims",
  };
}

function companionBehaviorForMoment(
  phase: SparkOrbEncounterPhase,
  lastMoment: OrbLearningLastMoment,
): CompanionBehavior {
  if (phase === "collected" || lastMoment === "collected") {
    return {
      mood: "bright",
      presentationState: "celebrating",
      low: false,
      emote: "celebrating",
      intensity: 0.82,
      movementIntensity: 1,
      visualTreatment,
      animation: "dance_victory",
    };
  }
  if (phase === "launching" || lastMoment === "launched") {
    return {
      mood: "bright",
      presentationState: "celebrating",
      low: false,
      emote: "excited",
      intensity: 0.78,
      movementIntensity: 0.95,
      visualTreatment,
      animation: "surprise_jump",
    };
  }
  if (phase === "ready" || lastMoment === "orb_ready") {
    return {
      mood: "bright",
      presentationState: "bright",
      low: false,
      emote: "surprised",
      intensity: 0.68,
      movementIntensity: 0.8,
      visualTreatment,
      animation: "wave",
    };
  }
  if (lastMoment === "missed_try") {
    return {
      mood: "happy",
      presentationState: "steady",
      low: false,
      emote: "thinking",
      intensity: 0.42,
      movementIntensity: 0.45,
      visualTreatment,
      animation: "think",
    };
  }
  return {
    mood: "happy",
    presentationState: "steady",
    low: false,
    emote: lastMoment === "spark_earned" || lastMoment === "recovered" ? "happy" : "neutral",
    intensity: lastMoment === "spark_earned" || lastMoment === "recovered" ? 0.62 : 0.32,
    movementIntensity: lastMoment === "spark_earned" || lastMoment === "recovered" ? 0.7 : 0.35,
    visualTreatment,
    animation: lastMoment === "spark_earned" || lastMoment === "recovered" ? "wave" : "idle",
  };
}

function companionLineForMoment(
  childName: string,
  phase: SparkOrbEncounterPhase,
  lastMoment: OrbLearningLastMoment,
): string | null {
  if (phase === "collected" || lastMoment === "collected") return "We found it.";
  if (phase === "launching" || lastMoment === "launched") return "There it goes.";
  if (phase === "ready" || lastMoment === "orb_ready") return "It's glowing.";
  if (lastMoment === "missed_try") return `I'm with you, ${childName}.`;
  if (lastMoment === "recovered") return "Nice comeback.";
  if (lastMoment === "spark_earned") return "Spark earned.";
  return null;
}

export function SparkOrbLearningShell({
  children,
  childId,
  childName,
  companion,
  companionName = companion.companionId,
  phase,
  chargeGoal = 3,
  domain,
  currentTarget,
  lastMoment = "watching",
  allowedRole = "emote_and_tiny_reaction",
  creatureName = "Lumipuff",
  statLabel = "SPARK",
  statValue = 214,
  orbCount = 7,
  captureProgress,
  sfx,
  onCompanionAnchor,
  onEncounterEvent,
}: SparkOrbLearningShellProps) {
  const [remainingOrbCount, setRemainingOrbCount] = useState(orbCount);
  const [chargeOverride, setChargeOverride] = useState<number | null>(null);
  const [launchSkill, setLaunchSkill] = useState<LaunchSkillState>("waiting");
  const [launchAim, setLaunchAim] = useState<LaunchAimState>("idle");
  const [flightState, setFlightState] = useState<LaunchFlightState>("idle");
  const [captureEffect, setCaptureEffect] = useState<CaptureEffectState>("inactive");
  const [captureStage, setCaptureStage] = useState<CaptureStage>("free");
  const [collectibleRevealed, setCollectibleRevealed] = useState(false);
  const [collectionCardVisible, setCollectionCardVisible] = useState(false);
  const [reverseReplayActive, setReverseReplayActive] = useState(false);
  const [reversePreviewOpen, setReversePreviewOpen] = useState(false);
  const [launchPower, setLaunchPower] = useState(0);
  const [launchPhysics, setLaunchPhysics] = useState<SparkOrbLaunchPhysics | null>(null);
  const [aimVector, setAimVector] = useState<LaunchAimVector>({
    startX: 0,
    startY: 0,
    pullX: 0,
    pullY: 0,
  });
  const launchPowerRef = useRef(0);
  const aimVectorRef = useRef<LaunchAimVector>({
    startX: 0,
    startY: 0,
    pullX: 0,
    pullY: 0,
  });
  const launchTimerRef = useRef<number | null>(null);
  const payoffTimerRefs = useRef<number[]>([]);
  const phaseChargeCount = Math.min(chargeGoal, chargeCountForPhase(phase));
  const chargeCount = chargeOverride ?? phaseChargeCount;
  const scrubbedCaptureProgress =
    typeof captureProgress === "number" ? clampPercent(captureProgress) : null;
  const displayCaptureStage =
    scrubbedCaptureProgress === null ? captureStage : captureStageForProgress(scrubbedCaptureProgress);
  const displayCaptureEffect =
    scrubbedCaptureProgress === null ? captureEffect : captureEffectForProgress(scrubbedCaptureProgress);
  const displayFlightState =
    scrubbedCaptureProgress === null ? flightState : flightStateForProgress(scrubbedCaptureProgress);
  const scrubbedCaptureActive = scrubbedCaptureProgress !== null && scrubbedCaptureProgress > 0;
  const reversePreviewing = reverseReplayActive || reversePreviewOpen;
  const collectionSettled = displayFlightState === "settled" && !reversePreviewing;
  const visualCaptureStage = collectionSettled ? "free" : displayCaptureStage;
  const visualLaunchAim = collectionSettled ? "idle" : launchAim;
  const ready = phase === "ready";
  const launchSucceeded = launchSkill === "success";
  const launching = phase === "launching" || launchSucceeded || scrubbedCaptureActive;
  const collected =
    phase === "collected" || collectibleRevealed || displayCaptureStage === "collection-added";
  const collectionState = reverseReplayActive
    ? "reversing"
    : reversePreviewOpen
      ? "preview-open"
      : collectionSettled
        ? "settled"
        : collected
          ? "collected"
          : "active";
  const rewardFocused = collected || reversePreviewing;
  const showCollectionCard =
    scrubbedCaptureProgress === null
      ? collectionCardVisible
      : scrubbedCaptureProgress >= 92 && scrubbedCaptureProgress < 98;
  const captureLocked =
    displayCaptureStage === "locked" ||
    (displayCaptureStage === "collection-added" && !collectionSettled);
  const canReverseCollection = collectionSettled && scrubbedCaptureProgress === null;
  const showCaptureEffects = !collectionSettled && !reversePreviewOpen;
  const charged = chargeCount >= chargeGoal && (ready || launching || collected || scrubbedCaptureActive);
  const creatureCaptureMotion: CreatureCaptureMotion =
    reversePreviewOpen
      ? "free"
      : collectionSettled
        ? "hidden"
      : displayCaptureStage === "pulling"
      ? "pulling"
      : displayCaptureStage === "shrinking"
        ? "shrinking"
        : displayCaptureStage === "locked" || displayCaptureStage === "collection-added"
          ? "hidden"
          : "free";
  const companionBehavior = companionBehaviorForMoment(phase, lastMoment);
  const speechBubbleText = rewardFocused ? null : companionLineForMoment(childName, phase, lastMoment);
  const canHoldToLaunch =
    ready && chargeCount >= chargeGoal && launchSkill !== "success" && launchSkill !== "spent";
  const aimGuideX = Math.max(-150, Math.min(150, aimVector.pullX));
  const aimGuideY = -Math.max(0, Math.min(300, aimVector.pullY));
  const aimGuideDistance = Math.min(270, Math.hypot(aimGuideX, aimGuideY));
  const rawAimGuideAngle = aimGuideDistance === 0 ? 0 : Math.atan2(aimGuideX, -aimGuideY) * (180 / Math.PI);
  const aimGuideAngle = Math.max(-18, Math.min(18, rawAimGuideAngle));
  const displayLaunchPhysics =
    launchPhysics ?? computeSparkOrbLaunchPhysics({ pullX: 0, pullY: 0, holdPower: 0 });
  const launchStyle = {
    "--launch-aim-x": `${aimGuideX}px`,
    "--launch-aim-y": `${aimGuideY}px`,
    "--launch-aim-distance": `${aimGuideDistance}px`,
    "--launch-aim-angle": `${aimGuideAngle}deg`,
    "--launch-power": `${launchPower}%`,
    "--orb-flight-x": `${displayLaunchPhysics.flightX}px`,
    "--orb-flight-y": `${displayLaunchPhysics.flightY}px`,
    "--orb-peak-x": `${displayLaunchPhysics.peakX}px`,
    "--orb-peak-y": `${displayLaunchPhysics.peakY}px`,
    "--orb-impact-x": `${displayLaunchPhysics.impactX}px`,
    "--orb-impact-y": `${displayLaunchPhysics.impactY}px`,
    "--orb-impact-rotation": `${displayLaunchPhysics.rotation}deg`,
    "--orb-launch-scale": `${displayLaunchPhysics.launchScale}`,
    "--orb-peak-scale": `${displayLaunchPhysics.peakScale}`,
    "--orb-flight-scale": `${displayLaunchPhysics.flightScale}`,
    "--orb-impact-scale": `${displayLaunchPhysics.impactScale}`,
  } as CSSProperties;
  const anchorContext = useMemo(
    () =>
      buildOrbCompanionAnchorContext({
        childId,
        childName,
        companionId: companion.companionId,
        companionName,
        phase,
        chargeCount,
        chargeGoal,
        domain,
        currentTarget,
        lastMoment,
        allowedRole,
      }),
    [
      allowedRole,
      chargeCount,
      chargeGoal,
      childId,
      childName,
      companion.companionId,
      companionName,
      currentTarget,
      domain,
      lastMoment,
      phase,
    ],
  );

  useEffect(() => {
    console.info(" 🎮 [spark-orb-learning-shell] [companion-anchor] [reported]", anchorContext);
    onCompanionAnchor?.(anchorContext);
  }, [anchorContext, onCompanionAnchor]);

  useEffect(() => {
    setRemainingOrbCount(orbCount);
  }, [orbCount]);

  useEffect(() => {
    if (phase !== "ready") {
      clearPayoffTimers();
      setLaunchSkill("waiting");
      setLaunchAim("idle");
      setFlightState("idle");
      setCaptureEffect("inactive");
      setCaptureStage("free");
      setCollectibleRevealed(false);
      setCollectionCardVisible(false);
      setReverseReplayActive(false);
      setReversePreviewOpen(false);
      setChargeOverride(null);
      setLaunchPower(0);
      setLaunchPhysics(null);
      launchPowerRef.current = 0;
      aimVectorRef.current = { startX: 0, startY: 0, pullX: 0, pullY: 0 };
      setAimVector(aimVectorRef.current);
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (launchTimerRef.current !== null) {
        window.clearInterval(launchTimerRef.current);
      }
      clearPayoffTimers();
    };
  }, []);

  function stopLaunchTimer(): void {
    if (launchTimerRef.current === null) return;
    window.clearInterval(launchTimerRef.current);
    launchTimerRef.current = null;
  }

  function clearPayoffTimers(): void {
    payoffTimerRefs.current.forEach((timer) => window.clearTimeout(timer));
    payoffTimerRefs.current = [];
  }

  function emitLaunchEvent(
    event: Omit<SparkOrbLearningEncounterEvent, "phase" | "chargeGoal" | "currentTarget">,
  ): void {
    const payload: SparkOrbLearningEncounterEvent = {
      ...event,
      phase,
      chargeGoal,
      currentTarget,
    };
    console.info(" 🎮 [spark-orb-learning-shell] [launch-skill] [reported]", payload);
    onEncounterEvent?.(payload);
  }

  function launchPullPower(vector: LaunchAimVector): number {
    return clampPercent((Math.max(0, vector.pullY) / 220) * 100);
  }

  function handleLaunchHoldStart(event: PointerEvent<HTMLButtonElement>): void {
    if (!canHoldToLaunch || launchTimerRef.current !== null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const nextAimVector = {
      startX: event.clientX,
      startY: event.clientY,
      pullX: 0,
      pullY: 0,
    };
    aimVectorRef.current = nextAimVector;
    setAimVector(nextAimVector);
    launchPowerRef.current = 0;
    setLaunchPower(0);
    setLaunchPhysics(null);
    setLaunchSkill("holding");
    setLaunchAim("aiming");
    emitLaunchEvent({
      type: "hold_start",
      chargeCount,
      orbCount: remainingOrbCount,
      holdPower: 0,
    });
    launchTimerRef.current = window.setInterval(() => {
      const nextPower = Math.min(100, launchPowerRef.current + 2);
      launchPowerRef.current = nextPower;
      setLaunchPower(Math.max(nextPower, launchPullPower(aimVectorRef.current)));
      if (nextPower >= 100) {
        stopLaunchTimer();
      }
    }, 40);
  }

  function handleLaunchAimMove(event: PointerEvent<HTMLButtonElement>): void {
    if (launchSkill !== "holding") return;
    const currentAim = aimVectorRef.current;
    const nextAimVector = {
      ...currentAim,
      pullX: event.clientX - currentAim.startX,
      pullY: currentAim.startY - event.clientY,
    };
    aimVectorRef.current = nextAimVector;
    setAimVector(nextAimVector);
    setLaunchPower(Math.max(launchPowerRef.current, launchPullPower(nextAimVector)));
  }

  function handleLaunchRelease(event: PointerEvent<HTMLButtonElement>): void {
    if (launchSkill !== "holding") return;
    handleLaunchAimMove(event);
    stopLaunchTimer();
    const finalAimVector = aimVectorRef.current;
    const pullPower = launchPullPower(finalAimVector);
    const holdPower = Math.round(Math.max(launchPowerRef.current, pullPower));
    const launchScore = computeSparkOrbLaunchPhysics({
      pullX: finalAimVector.pullX,
      pullY: finalAimVector.pullY,
      holdPower,
    });
    const result = launchScore.result;
    const aimResult: LaunchAimState =
      result === "success" ? "clean" : result === "miss-early" ? "weak" : "wide";
    setLaunchPower(launchScore.power);
    setLaunchPhysics(launchScore);
    setLaunchAim(aimResult);

    if (result === "success") {
      clearPayoffTimers();
      setLaunchSkill("success");
      setFlightState("traveling");
      setCaptureEffect("charging");
      setCaptureStage("incoming");
      setCollectibleRevealed(false);
      setCollectionCardVisible(false);
      setReverseReplayActive(false);
      setReversePreviewOpen(false);
      playSparkOrbSfx("launch", sfx);
      emitLaunchEvent({
        type: "release_success",
        chargeCount,
        orbCount: remainingOrbCount,
        result,
        hitDistance: launchScore.hitDistance,
        hitQuality: launchScore.hitQuality,
        holdPower: launchScore.power,
      });
      payoffTimerRefs.current = [
        window.setTimeout(() => {
          setFlightState("impact");
          setCaptureEffect("active");
          setCaptureStage("pulling");
          playSparkOrbSfx("capturePull", sfx);
          emitLaunchEvent({
            type: "capture_effect",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
          emitLaunchEvent({
            type: "capture_pull",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 650),
        window.setTimeout(() => {
          setCaptureStage("shrinking");
          playSparkOrbSfx("captureShrink", sfx);
          emitLaunchEvent({
            type: "capture_shrink",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 1250),
        window.setTimeout(() => {
          setCaptureStage("locked");
          playSparkOrbSfx("captureLock", sfx);
          emitLaunchEvent({
            type: "capture_lock",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 1800),
        window.setTimeout(() => {
          setFlightState("reward");
          setCaptureStage("collection-added");
          setCollectibleRevealed(true);
          setCollectionCardVisible(true);
          playSparkOrbSfx("collected", sfx);
          emitLaunchEvent({
            type: "collectible_revealed",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 2150),
        window.setTimeout(() => {
          setCollectionCardVisible(false);
          setFlightState("settled");
          setCaptureEffect("inactive");
          setCaptureStage("free");
          setLaunchAim("idle");
          aimVectorRef.current = { startX: 0, startY: 0, pullX: 0, pullY: 0 };
          setAimVector(aimVectorRef.current);
          emitLaunchEvent({
            type: "collection_settled",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 3650),
      ];
      return;
    }

    const nextOrbCount = Math.max(0, remainingOrbCount - 1);
    clearPayoffTimers();
    setLaunchSkill("spent");
    setFlightState("fizzle");
    setCaptureEffect("inactive");
    setCaptureStage("free");
    setCollectibleRevealed(false);
    setCollectionCardVisible(false);
    setReverseReplayActive(false);
    setReversePreviewOpen(false);
    setChargeOverride(0);
    setRemainingOrbCount(nextOrbCount);
    playSparkOrbSfx("miss", sfx);
    emitLaunchEvent({
      type: "release_miss",
      chargeCount,
      orbCount: nextOrbCount,
      result,
      hitDistance: launchScore.hitDistance,
      hitQuality: launchScore.hitQuality,
      holdPower: launchScore.power,
    });
    emitLaunchEvent({
      type: "orb_spent",
      chargeCount: 0,
      orbCount: nextOrbCount,
      result,
      hitDistance: launchScore.hitDistance,
      hitQuality: launchScore.hitQuality,
      holdPower: launchScore.power,
    });
    emitLaunchEvent({
      type: "recharge_needed",
      chargeCount: 0,
      orbCount: nextOrbCount,
      result,
      hitDistance: launchScore.hitDistance,
      hitQuality: launchScore.hitQuality,
      holdPower: launchScore.power,
    });
  }

  function handleReverseCollectionReplay(): void {
    if (!canReverseCollection) return;
    clearPayoffTimers();
    setReverseReplayActive(true);
    setReversePreviewOpen(false);
    setCollectionCardVisible(false);
    setCaptureEffect("active");
    setCaptureStage("collection-added");
    setFlightState("settled");
    setLaunchAim("idle");
    playSparkOrbSfx("capturePull", sfx);
    emitLaunchEvent({
      type: "collection_reverse_started",
      chargeCount,
      orbCount: remainingOrbCount,
      result: "success",
      hitDistance: launchPhysics?.hitDistance,
      hitQuality: launchPhysics?.hitQuality,
      holdPower: launchPhysics?.power,
    });

    payoffTimerRefs.current = [
      window.setTimeout(() => {
        setCaptureStage("locked");
        playSparkOrbSfx("captureLock", sfx);
      }, 250),
      window.setTimeout(() => {
        setCaptureStage("shrinking");
        playSparkOrbSfx("captureShrink", sfx);
      }, 650),
      window.setTimeout(() => {
        setCaptureStage("pulling");
        playSparkOrbSfx("capturePull", sfx);
      }, 1050),
      window.setTimeout(() => {
        setReverseReplayActive(false);
        setReversePreviewOpen(true);
        setCaptureEffect("inactive");
        setCaptureStage("free");
        setFlightState("settled");
        emitLaunchEvent({
          type: "collection_reverse_complete",
          chargeCount,
          orbCount: remainingOrbCount,
          result: "success",
          hitDistance: launchPhysics?.hitDistance,
          hitQuality: launchPhysics?.hitQuality,
          holdPower: launchPhysics?.power,
        });
      }, 1550),
    ];
  }

  return (
    <div className="spark-orb-learning-shell" data-phase={phase}>
      <section className="spark-orb-learning-shell__problem" aria-label="Learning problem panel">
        {children}
      </section>

      <section
        className="spark-orb-learning-shell__orb-stage"
        aria-label="Sunny Spark Orb encounter"
        data-testid="spark-orb-encounter"
        data-phase={phase}
        data-launch-skill={launchSkill}
        data-launch-aim={visualLaunchAim}
        data-flight={displayFlightState}
        data-hit-quality={launchPhysics?.hitQuality ?? "none"}
        data-capture-effect={displayCaptureEffect}
        data-capture-stage={visualCaptureStage}
        data-collection-state={collectionState}
        style={launchStyle}
      >
        <img
          className="spark-orb-learning-shell__backdrop"
          src={`${assetBase}/park-background.png`}
          alt=""
          aria-hidden="true"
        />
        <div className="spark-orb-learning-shell__wash" aria-hidden="true" />
        <div className="spark-orb-learning-shell__orb-hud">
          <div className="spark-orb-learning-shell__nameplate">
            <strong>{creatureName}</strong>
            <span>
              {statLabel} {statValue}
            </span>
          </div>
          <div className="spark-orb-learning-shell__orb-count" aria-label={`${remainingOrbCount} Sunny orbs left`}>
            <span>ORB</span>
            <strong>{remainingOrbCount}</strong>
          </div>
        </div>

        <div className="spark-orb-learning-shell__creature-shadow" aria-hidden="true" />
        <img
          className="spark-orb-learning-shell__creature"
          data-testid="spark-orb-creature"
          data-capture-motion={creatureCaptureMotion}
          src={`${assetBase}/lumipuff.png`}
          alt=""
          aria-hidden="true"
        />
        <div
          className="spark-orb-learning-shell__aura"
          data-active={charged && showCaptureEffects ? "true" : "false"}
          aria-hidden="true"
        />
        <div
          className="spark-orb-learning-shell__stream"
          data-active={launching && showCaptureEffects ? "true" : "false"}
          aria-hidden="true"
        />
        <div className="spark-orb-learning-shell__capture-vortex" aria-hidden="true" />
        <div className="spark-orb-learning-shell__energy-tether" aria-hidden="true" />
        <div className="spark-orb-learning-shell__spark-burst" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, index) => (
            <i key={index} />
          ))}
        </div>
        <img
          className="spark-orb-learning-shell__orb"
          data-testid="spark-orb"
          data-phase={phase}
          data-ready={ready ? "true" : "false"}
          data-launching={launching && !reversePreviewOpen ? "true" : "false"}
          data-collected={collected && !reversePreviewing ? "true" : "false"}
          data-capture-lock={captureLocked ? "true" : "false"}
          data-on-ground={collectionSettled || reversePreviewing ? "true" : "false"}
          src={`${assetBase}/spark-orb.png`}
          alt=""
          aria-hidden="true"
        />
        {canReverseCollection ? (
          <button
            type="button"
            aria-label="Replay collection animation in reverse"
            className="spark-orb-learning-shell__reverse-button"
            data-testid="spark-orb-reverse-control"
            onClick={handleReverseCollectionReplay}
          />
        ) : null}
        {ready && !rewardFocused ? (
          <div className="spark-orb-learning-shell__launch-skill" data-state={launchSkill}>
            {canHoldToLaunch ? (
              <button
                type="button"
                aria-label="Grab the orb to aim and launch"
                data-testid="spark-orb-launch-control"
                className="spark-orb-learning-shell__launch-button"
                onPointerDown={handleLaunchHoldStart}
                onPointerMove={handleLaunchAimMove}
                onPointerUp={handleLaunchRelease}
                onPointerCancel={handleLaunchRelease}
              />
            ) : null}
            <div className="spark-orb-learning-shell__aim-guide" aria-hidden="true">
              <span />
              <i />
              <i />
              <i />
              <i />
            </div>
            {launchSkill === "success" || launchSkill === "spent" ? (
              <strong>
                {launchSkill === "success" ? "Clean launch" : "Answer more to recharge."}
              </strong>
            ) : null}
          </div>
        ) : null}
        {!rewardFocused ? (
          <div className="spark-orb-learning-shell__charge">
            <span>
              Charge {chargeCount} / {chargeGoal}
            </span>
            <div aria-hidden="true">
              {Array.from({ length: chargeGoal }).map((_, index) => (
                <i key={index} data-filled={index < chargeCount ? "true" : "false"} />
              ))}
            </div>
          </div>
        ) : null}
        <div className="spark-orb-learning-shell__companion-anchor" aria-label="Companion portrait near orb">
          <CompanionLayer
            childId={childId}
            companion={companion}
            toggledOff={companion.toggledOff}
            mode="portrait"
            companionBehavior={companionBehavior}
            speechBubbleText={speechBubbleText}
          />
        </div>
        {showCollectionCard ? (
          <div className="spark-orb-learning-shell__collect-card" role="dialog" aria-label={`${creatureName} added to collection`}>
            <span>Added to collection</span>
            <strong>Spark Garden friend</strong>
          </div>
        ) : null}
      </section>

      <style>{`
        .spark-orb-learning-shell {
          align-items: stretch;
          background: #edf4f7;
          color: #10202d;
          display: grid;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          gap: 18px;
          grid-template-columns: minmax(290px, 0.64fr) minmax(520px, 1.36fr);
          min-height: 100vh;
          padding: 18px;
        }

        .spark-orb-learning-shell *,
        .spark-orb-learning-shell *::before,
        .spark-orb-learning-shell *::after {
          box-sizing: border-box;
        }

        .spark-orb-learning-shell__problem,
        .spark-orb-learning-shell__orb-stage {
          border: 1px solid rgba(16, 32, 45, 0.12);
          border-radius: 22px;
          box-shadow: 0 20px 46px rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }

        .spark-orb-learning-shell__problem {
          background: rgba(255, 255, 255, 0.9);
          padding: 22px;
        }

        .spark-orb-learning-shell__orb-stage {
          background: #84d5f3;
          min-height: 710px;
          position: relative;
        }

        .spark-orb-learning-shell__backdrop,
        .spark-orb-learning-shell__wash {
          inset: 0;
          position: absolute;
        }

        .spark-orb-learning-shell__backdrop {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }

        .spark-orb-learning-shell__wash {
          background:
            radial-gradient(circle at 50% 28%, rgba(255, 255, 255, 0.24), transparent 28%),
            linear-gradient(180deg, transparent 58%, rgba(0, 0, 0, 0.62));
          pointer-events: none;
          z-index: 2;
        }

        .spark-orb-learning-shell__orb-hud {
          align-items: start;
          display: grid;
          grid-template-columns: 1fr 62px;
          left: 22px;
          position: absolute;
          right: 22px;
          top: 22px;
          z-index: 8;
        }

        .spark-orb-learning-shell__nameplate {
          color: white;
          justify-self: center;
          text-align: center;
          text-shadow: 0 4px 12px rgba(15, 23, 42, 0.42);
        }

        .spark-orb-learning-shell__nameplate strong {
          display: block;
          font-size: clamp(34px, 4vw, 52px);
          font-weight: 950;
          line-height: 1;
        }

        .spark-orb-learning-shell__nameplate span {
          background: rgba(31, 46, 58, 0.86);
          border-radius: 999px;
          display: inline-flex;
          font-size: 15px;
          font-weight: 950;
          line-height: 1;
          margin-top: 10px;
          padding: 8px 16px;
        }

        .spark-orb-learning-shell__orb-count {
          align-items: center;
          background: rgba(31, 46, 58, 0.86);
          border-radius: 50%;
          color: white;
          display: flex;
          flex-direction: column;
          height: 58px;
          justify-content: center;
          justify-self: end;
          line-height: 1;
          width: 58px;
        }

        .spark-orb-learning-shell__orb-count span {
          font-size: 11px;
          font-weight: 900;
        }

        .spark-orb-learning-shell__orb-count strong {
          font-size: 24px;
          font-weight: 950;
        }

        .spark-orb-learning-shell__creature {
          filter: drop-shadow(0 18px 28px rgba(72, 58, 114, 0.28));
          left: 50%;
          position: absolute;
          top: 35%;
          transform: translate(-50%, -50%);
          transition:
            filter 260ms ease,
            opacity 260ms ease,
            transform 480ms cubic-bezier(0.19, 1, 0.22, 1);
          width: clamp(190px, 38%, 330px);
          z-index: 4;
        }

        .spark-orb-learning-shell[data-phase="ready"] .spark-orb-learning-shell__creature,
        .spark-orb-learning-shell[data-phase="collected"] .spark-orb-learning-shell__creature {
          animation: sparkLearningCreatureBounce 1.7s ease-in-out infinite;
        }

        .spark-orb-learning-shell__creature[data-capture-motion="pulling"] {
          animation: sparkLearningCreaturePull 0.92s ease-in-out infinite;
          filter:
            drop-shadow(0 18px 28px rgba(72, 58, 114, 0.28))
            drop-shadow(0 0 32px rgba(124, 255, 241, 0.66))
            saturate(1.08);
          z-index: 8;
        }

        .spark-orb-learning-shell__creature[data-capture-motion="shrinking"] {
          animation: sparkLearningCreatureShrinkIntoOrb 0.86s cubic-bezier(0.2, 0.8, 0.2, 1) both;
          filter:
            drop-shadow(0 0 34px rgba(124, 255, 241, 0.72))
            drop-shadow(0 0 22px rgba(255, 228, 107, 0.7))
            brightness(1.18);
          z-index: 8;
        }

        .spark-orb-learning-shell__orb-stage[data-collection-state="reversing"] .spark-orb-learning-shell__creature[data-capture-motion="shrinking"] {
          animation: sparkLearningCreatureShrinkIntoOrb 0.76s cubic-bezier(0.2, 0.8, 0.2, 1) reverse both;
        }

        .spark-orb-learning-shell__creature[data-capture-motion="hidden"] {
          opacity: 0;
          transform: translate(-50%, 72%) scale(0.04) rotate(10deg);
        }

        .spark-orb-learning-shell__creature-shadow {
          background: rgba(35, 67, 42, 0.24);
          border-radius: 999px;
          filter: blur(5px);
          height: 18px;
          left: 50%;
          position: absolute;
          top: 56%;
          transform: translateX(-50%);
          width: 140px;
          z-index: 3;
        }

        .spark-orb-learning-shell__aura {
          border: 2px solid rgba(124, 255, 241, 0.6);
          border-radius: 50%;
          bottom: 88px;
          box-shadow:
            0 0 44px rgba(124, 255, 241, 0.34),
            0 0 66px rgba(255, 228, 107, 0.28);
          height: clamp(160px, 24%, 230px);
          left: 50%;
          opacity: 0;
          position: absolute;
          transform: translateX(-50%) scale(0.84);
          transition: all 260ms ease;
          width: clamp(160px, 24%, 230px);
          z-index: 4;
        }

        .spark-orb-learning-shell__aura[data-active="true"] {
          animation: sparkLearningAuraPulse 1s ease-in-out infinite;
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }

        .spark-orb-learning-shell__stream {
          background:
            linear-gradient(0deg, transparent, rgba(255, 228, 107, 0.7), rgba(124, 255, 241, 0.64), transparent),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.46) 0 8px, transparent 8px 20px);
          border-radius: 999px;
          bottom: 120px;
          filter: blur(2px) drop-shadow(0 0 22px rgba(124, 255, 241, 0.46));
          height: 280px;
          left: 50%;
          opacity: 0;
          position: absolute;
          transform: translateX(-50%) scaleY(0.4);
          transform-origin: 50% 100%;
          transition: all 220ms ease;
          width: 88px;
          z-index: 5;
        }

        .spark-orb-learning-shell__stream[data-active="true"] {
          animation: sparkLearningStreamWobble 0.34s ease-in-out infinite;
          opacity: 0.9;
          transform: translateX(-50%) scaleY(1);
        }

        .spark-orb-learning-shell__orb-stage[data-capture-stage="collection-added"] .spark-orb-learning-shell__aura,
        .spark-orb-learning-shell__orb-stage[data-capture-stage="collection-added"] .spark-orb-learning-shell__stream,
        .spark-orb-learning-shell__orb-stage[data-capture-stage="collection-added"] .spark-orb-learning-shell__energy-tether {
          opacity: 0.22;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-stage="collection-added"] .spark-orb-learning-shell__capture-vortex {
          opacity: 0.38;
        }

        .spark-orb-learning-shell__orb-stage[data-collection-state="settled"] .spark-orb-learning-shell__aura,
        .spark-orb-learning-shell__orb-stage[data-collection-state="settled"] .spark-orb-learning-shell__stream,
        .spark-orb-learning-shell__orb-stage[data-collection-state="settled"] .spark-orb-learning-shell__energy-tether,
        .spark-orb-learning-shell__orb-stage[data-collection-state="settled"] .spark-orb-learning-shell__capture-vortex,
        .spark-orb-learning-shell__orb-stage[data-collection-state="settled"] .spark-orb-learning-shell__spark-burst {
          animation: none;
          opacity: 0;
        }

        .spark-orb-learning-shell__capture-vortex {
          border: 2px solid rgba(124, 255, 241, 0.7);
          border-radius: 50%;
          box-shadow:
            inset 0 0 34px rgba(255, 228, 107, 0.2),
            0 0 46px rgba(124, 255, 241, 0.32);
          height: clamp(230px, 34%, 360px);
          left: 50%;
          opacity: 0;
          position: absolute;
          top: 35%;
          transform: translate(-50%, -50%) scale(0.72) rotate(0deg);
          width: clamp(230px, 34%, 360px);
          z-index: 5;
        }

        .spark-orb-learning-shell__energy-tether {
          background:
            linear-gradient(90deg, transparent, rgba(124, 255, 241, 0.85), rgba(255, 228, 107, 0.9), transparent),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.28) 0 10px, transparent 10px 24px);
          border-radius: 999px;
          filter: blur(1px) drop-shadow(0 0 18px rgba(124, 255, 241, 0.62));
          height: 22px;
          left: 50%;
          opacity: 0;
          position: absolute;
          top: 48%;
          transform: translate(-50%, -50%) rotate(-86deg) scaleX(0.28);
          transform-origin: 50% 50%;
          width: clamp(220px, 38%, 390px);
          z-index: 5;
        }

        .spark-orb-learning-shell__spark-burst {
          height: 1px;
          left: 50%;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          top: 36%;
          width: 1px;
          z-index: 11;
        }

        .spark-orb-learning-shell__spark-burst i {
          background: #ffe46b;
          border-radius: 999px;
          box-shadow: 0 0 16px rgba(255, 228, 107, 0.82);
          display: block;
          height: 8px;
          left: 0;
          position: absolute;
          top: 0;
          transform: translate(-50%, -50%);
          width: 8px;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="charging"] .spark-orb-learning-shell__capture-vortex,
        .spark-orb-learning-shell__orb-stage[data-capture-effect="active"] .spark-orb-learning-shell__capture-vortex {
          opacity: 1;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="charging"] .spark-orb-learning-shell__capture-vortex {
          animation: sparkLearningVortexSpin 1.4s linear infinite;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="active"] .spark-orb-learning-shell__capture-vortex {
          animation: sparkLearningVortexLock 0.72s ease-in-out infinite;
          border-color: rgba(255, 228, 107, 0.9);
        }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="charging"] .spark-orb-learning-shell__energy-tether,
        .spark-orb-learning-shell__orb-stage[data-capture-effect="active"] .spark-orb-learning-shell__energy-tether {
          opacity: 1;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="charging"] .spark-orb-learning-shell__energy-tether {
          animation: sparkLearningTetherReach 0.42s ease-out both, sparkLearningStreamWobble 0.28s ease-in-out infinite;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="active"] .spark-orb-learning-shell__energy-tether {
          animation: sparkLearningTetherLock 0.45s ease-out both, sparkLearningStreamWobble 0.22s ease-in-out infinite;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="active"] .spark-orb-learning-shell__spark-burst {
          animation: sparkLearningBurstFlash 0.9s ease-out both;
          opacity: 1;
        }

        .spark-orb-learning-shell__spark-burst i:nth-child(1) { --spark-x: 0px; --spark-y: -130px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(2) { --spark-x: 58px; --spark-y: -112px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(3) { --spark-x: 108px; --spark-y: -70px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(4) { --spark-x: 132px; --spark-y: -12px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(5) { --spark-x: 116px; --spark-y: 54px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(6) { --spark-x: 64px; --spark-y: 104px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(7) { --spark-x: 0px; --spark-y: 128px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(8) { --spark-x: -64px; --spark-y: 104px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(9) { --spark-x: -116px; --spark-y: 54px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(10) { --spark-x: -132px; --spark-y: -12px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(11) { --spark-x: -108px; --spark-y: -70px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(12) { --spark-x: -58px; --spark-y: -112px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(13) { --spark-x: 92px; --spark-y: 92px; }
        .spark-orb-learning-shell__spark-burst i:nth-child(14) { --spark-x: -92px; --spark-y: 92px; }

        .spark-orb-learning-shell__orb-stage[data-capture-effect="active"] .spark-orb-learning-shell__spark-burst i {
          animation: sparkLearningBurstParticle 0.84s ease-out both;
        }

        .spark-orb-learning-shell__orb-stage[data-capture-stage="pulling"] .spark-orb-learning-shell__stream,
        .spark-orb-learning-shell__orb-stage[data-capture-stage="shrinking"] .spark-orb-learning-shell__stream {
          animation: sparkLearningCaptureColumn 0.28s ease-in-out infinite;
          opacity: 1;
          transform: translateX(-50%) scaleY(1.12);
        }

        .spark-orb-learning-shell__orb {
          bottom: 96px;
          filter:
            drop-shadow(0 20px 20px rgba(8, 51, 68, 0.22))
            drop-shadow(0 0 18px rgba(255, 220, 94, 0.28));
          left: 50%;
          position: absolute;
          transform: translateX(-50%);
          transition: all 420ms cubic-bezier(0.2, 0.7, 0.2, 1);
          width: clamp(110px, 20%, 170px);
          z-index: 6;
        }

        .spark-orb-learning-shell__orb[data-phase="idle"] {
          filter: grayscale(0.45) brightness(0.86) drop-shadow(0 13px 16px rgba(8, 51, 68, 0.16));
          opacity: 0.82;
        }

        .spark-orb-learning-shell__orb[data-ready="true"] {
          animation: sparkLearningReadyPulse 0.64s ease-in-out infinite;
        }

        .spark-orb-learning-shell__orb-stage[data-launch-aim="aiming"] .spark-orb-learning-shell__orb {
          animation: none;
          filter:
            drop-shadow(0 20px 20px rgba(8, 51, 68, 0.22))
            drop-shadow(0 0 28px rgba(124, 255, 241, 0.58))
            drop-shadow(0 0 22px rgba(255, 228, 107, 0.42));
          transform: translateX(-50%) scale(0.94);
        }

        .spark-orb-learning-shell__orb[data-launching="true"] {
          bottom: 40%;
          transform: translateX(-50%) rotate(18deg) scale(0.82);
        }

        .spark-orb-learning-shell__orb[data-collected="true"] {
          bottom: 40%;
          opacity: 0.1;
          transform: translateX(-50%) scale(1.3);
        }

        .spark-orb-learning-shell__orb-stage[data-launch-skill="success"] .spark-orb-learning-shell__orb {
          animation: none;
        }

        .spark-orb-learning-shell__orb-stage[data-flight="traveling"] .spark-orb-learning-shell__orb {
          animation: sparkLearningOrbProjectileFlight 0.66s cubic-bezier(0.18, 0.72, 0.2, 1) both;
          bottom: 96px;
          filter:
            drop-shadow(0 24px 22px rgba(8, 51, 68, 0.24))
            drop-shadow(0 0 34px rgba(124, 255, 241, 0.6))
            drop-shadow(0 0 30px rgba(255, 228, 107, 0.45));
          transition: none;
        }

        .spark-orb-learning-shell__orb-stage[data-flight="impact"] .spark-orb-learning-shell__orb {
          bottom: 96px;
          filter:
            drop-shadow(0 28px 24px rgba(8, 51, 68, 0.22))
            drop-shadow(0 0 46px rgba(255, 228, 107, 0.75));
          transform:
            translateX(-50%)
            translate(var(--orb-impact-x), var(--orb-impact-y))
            rotate(var(--orb-impact-rotation))
            scale(var(--orb-impact-scale));
        }

        .spark-orb-learning-shell__orb-stage[data-flight="reward"] .spark-orb-learning-shell__orb {
          bottom: 96px;
          opacity: 0.08;
          transform:
            translateX(-50%)
            translate(var(--orb-impact-x), var(--orb-impact-y))
            scale(1.75);
        }

        .spark-orb-learning-shell__orb-stage[data-flight="settled"] .spark-orb-learning-shell__orb {
          animation: sparkLearningOrbGroundDrop 0.62s cubic-bezier(0.18, 0.84, 0.2, 1) both;
          bottom: 74px;
          filter:
            drop-shadow(0 16px 16px rgba(8, 51, 68, 0.28))
            drop-shadow(0 0 18px rgba(255, 228, 107, 0.24));
          opacity: 1;
          transform: translateX(-50%) rotate(-7deg) scale(0.58);
          z-index: 7;
        }

        .spark-orb-learning-shell__orb-stage[data-collection-state="reversing"] .spark-orb-learning-shell__orb,
        .spark-orb-learning-shell__orb-stage[data-collection-state="preview-open"] .spark-orb-learning-shell__orb {
          bottom: 74px;
          opacity: 1;
          transform: translateX(-50%) rotate(-7deg) scale(0.58);
          z-index: 7;
        }

        .spark-orb-learning-shell__orb-stage[data-collection-state="reversing"] .spark-orb-learning-shell__orb {
          animation: sparkLearningOrbReversePulse 0.72s ease-in-out infinite;
        }

        .spark-orb-learning-shell__reverse-button {
          background: transparent;
          border: 0;
          border-radius: 50%;
          bottom: 74px;
          cursor: pointer;
          height: clamp(70px, 12vw, 108px);
          left: 50%;
          padding: 0;
          position: absolute;
          transform: translateX(-50%);
          width: clamp(70px, 12vw, 108px);
          z-index: 14;
        }

        .spark-orb-learning-shell__reverse-button:focus-visible {
          outline: 3px solid rgba(255, 228, 107, 0.9);
          outline-offset: 4px;
        }

        .spark-orb-learning-shell__orb[data-capture-lock="true"] {
          animation: sparkLearningOrbLockBoom 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
          filter:
            drop-shadow(0 28px 24px rgba(8, 51, 68, 0.24))
            drop-shadow(0 0 54px rgba(255, 228, 107, 0.88))
            drop-shadow(0 0 38px rgba(124, 255, 241, 0.72));
        }

        .spark-orb-learning-shell__orb-stage[data-flight="fizzle"] .spark-orb-learning-shell__orb {
          animation: sparkLearningOrbFizzle 0.82s ease-out both;
          filter: grayscale(0.38) brightness(0.86) drop-shadow(0 13px 16px rgba(8, 51, 68, 0.18));
        }

        .spark-orb-learning-shell__orb-stage[data-launch-skill="spent"] .spark-orb-learning-shell__orb {
          filter: grayscale(0.38) brightness(0.86) drop-shadow(0 13px 16px rgba(8, 51, 68, 0.18));
          opacity: 0.76;
          transform: translateX(-50%) rotate(-7deg) scale(0.92);
        }

        .spark-orb-learning-shell__launch-skill {
          align-items: center;
          bottom: 132px;
          display: grid;
          gap: 8px;
          justify-items: center;
          left: 50%;
          pointer-events: none;
          position: absolute;
          transform: translateX(-50%);
          width: 210px;
          z-index: 12;
        }

        .spark-orb-learning-shell__aim-guide {
          bottom: 70px;
          height: 1px;
          left: 50%;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          transform: translateX(-50%) rotate(var(--launch-aim-angle));
          transform-origin: 50% 100%;
          transition: opacity 120ms ease;
          width: 1px;
          z-index: -1;
        }

        .spark-orb-learning-shell__launch-skill[data-state="holding"] .spark-orb-learning-shell__aim-guide {
          opacity: 1;
        }

        .spark-orb-learning-shell__aim-guide span {
          background:
            linear-gradient(0deg, rgba(124, 255, 241, 0.08), rgba(124, 255, 241, 0.78), rgba(255, 228, 107, 0.74)),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.68) 0 9px, transparent 9px 22px);
          border-radius: 999px;
          bottom: 0;
          box-shadow:
            0 0 20px rgba(124, 255, 241, 0.52),
            0 0 34px rgba(255, 228, 107, 0.36);
          display: block;
          height: max(54px, var(--launch-aim-distance));
          left: 50%;
          position: absolute;
          transform: translateX(-50%);
          width: 18px;
        }

        .spark-orb-learning-shell__aim-guide i {
          background: #ffe46b;
          border-radius: 50%;
          box-shadow: 0 0 14px rgba(255, 228, 107, 0.78);
          display: block;
          height: 8px;
          left: 50%;
          opacity: 0.88;
          position: absolute;
          transform: translate(-50%, -50%);
          width: 8px;
        }

        .spark-orb-learning-shell__aim-guide i:nth-of-type(1) { bottom: 42px; }
        .spark-orb-learning-shell__aim-guide i:nth-of-type(2) { bottom: 78px; }
        .spark-orb-learning-shell__aim-guide i:nth-of-type(3) { bottom: 114px; }
        .spark-orb-learning-shell__aim-guide i:nth-of-type(4) { bottom: 150px; }

        .spark-orb-learning-shell__launch-button {
          align-items: center;
          aspect-ratio: 1;
          background: transparent;
          border: 0;
          border-radius: 50%;
          cursor: grab;
          display: grid;
          font: inherit;
          height: 158px;
          justify-items: center;
          letter-spacing: 0;
          padding: 0;
          pointer-events: auto;
          position: relative;
          touch-action: none;
          width: 158px;
        }

        .spark-orb-learning-shell__launch-button::before,
        .spark-orb-learning-shell__launch-button::after {
          border-radius: 50%;
          content: "";
          inset: 12px;
          pointer-events: none;
          position: absolute;
        }

        .spark-orb-learning-shell__launch-button::before {
          border: 2px solid rgba(255, 228, 107, 0.62);
          box-shadow:
            0 0 22px rgba(255, 228, 107, 0.22),
            inset 0 0 20px rgba(124, 255, 241, 0.12);
        }

        .spark-orb-learning-shell__launch-button::after {
          background:
            radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.22), transparent 38%),
            radial-gradient(circle, rgba(124, 255, 241, 0.1), transparent 62%);
          opacity: 0.75;
        }

        .spark-orb-learning-shell__launch-button:active {
          cursor: grabbing;
        }

        .spark-orb-learning-shell__launch-button:active::before,
        .spark-orb-learning-shell__launch-skill[data-state="holding"] .spark-orb-learning-shell__launch-button::before {
          border-color: rgba(255, 255, 255, 0.82);
          box-shadow:
            0 0 0 8px rgba(255, 228, 107, 0.2),
            0 0 28px rgba(255, 228, 107, 0.52);
        }

        .spark-orb-learning-shell__orb-stage[data-launch-aim="aiming"] .spark-orb-learning-shell__capture-vortex {
          border-color: rgba(255, 228, 107, 0.72);
          opacity: 0.56;
          transform: translate(-50%, -50%) scale(0.98);
        }

        .spark-orb-learning-shell__orb-stage[data-launch-aim="clean"] .spark-orb-learning-shell__capture-vortex {
          border-color: rgba(255, 228, 107, 0.9);
          opacity: 0.82;
        }

        .spark-orb-learning-shell__launch-meter {
          background: rgba(7, 18, 25, 0.74);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          height: 12px;
          overflow: hidden;
          position: relative;
          width: 170px;
        }

        .spark-orb-learning-shell__launch-meter i,
        .spark-orb-learning-shell__launch-zone {
          bottom: 0;
          display: block;
          left: 0;
          position: absolute;
          top: 0;
        }

        .spark-orb-learning-shell__launch-meter i {
          background: linear-gradient(90deg, #6de6ff, #ffe46b, #ff7d62);
          border-radius: inherit;
          transition: width 80ms linear;
          z-index: 2;
        }

        .spark-orb-learning-shell__launch-zone {
          background: rgba(255, 228, 107, 0.38);
          box-shadow: 0 0 18px rgba(255, 228, 107, 0.48);
          left: ${sparkZoneStart}%;
          right: ${100 - sparkZoneEnd}%;
          z-index: 1;
        }

        .spark-orb-learning-shell__launch-skill strong {
          background: rgba(7, 18, 25, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 950;
          line-height: 1;
          padding: 9px 12px;
          text-align: center;
          text-shadow: 0 2px 7px rgba(0, 0, 0, 0.38);
          white-space: nowrap;
        }

        .spark-orb-learning-shell__launch-skill[data-state="success"] strong {
          color: #ffe46b;
        }

        .spark-orb-learning-shell__launch-skill[data-state="spent"] strong {
          color: #ffd0c7;
        }

        .spark-orb-learning-shell__charge {
          align-items: center;
          background: rgba(7, 18, 25, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          bottom: 42px;
          color: white;
          display: inline-flex;
          gap: 12px;
          left: 50%;
          padding: 10px 16px;
          position: absolute;
          transform: translateX(-50%);
          z-index: 9;
        }

        .spark-orb-learning-shell__charge span {
          font-size: 15px;
          font-weight: 900;
          white-space: nowrap;
        }

        .spark-orb-learning-shell__charge div {
          display: inline-flex;
          gap: 7px;
        }

        .spark-orb-learning-shell__charge i {
          background: rgba(255, 255, 255, 0.28);
          border-radius: 50%;
          display: block;
          height: 11px;
          width: 11px;
        }

        .spark-orb-learning-shell__charge i[data-filled="true"] {
          background: #ffe46b;
          box-shadow: 0 0 14px rgba(255, 228, 107, 0.72);
        }

        .spark-orb-learning-shell__collect-card {
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 18px;
          box-shadow: 0 22px 54px rgba(16, 24, 40, 0.24);
          color: #10202d;
          left: 50%;
          padding: 18px 20px;
          position: absolute;
          text-align: center;
          top: 47%;
          transform: translate(-50%, -50%);
          width: min(78%, 320px);
          z-index: 12;
          animation: sparkLearningCollectionCardPop 0.58s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .spark-orb-learning-shell__collect-card span {
          color: #0e8f9f;
          display: block;
          font-size: 13px;
          font-weight: 950;
        }

        .spark-orb-learning-shell__collect-card strong {
          display: block;
          font-size: 24px;
          font-weight: 950;
          margin-top: 6px;
        }

        .spark-orb-learning-shell__companion-anchor {
          bottom: 102px;
          height: 180px;
          pointer-events: none;
          position: absolute;
          right: clamp(16px, 4vw, 44px);
          width: 150px;
          z-index: 10;
        }

        .spark-orb-learning-shell__companion-anchor [data-testid="companion-portrait-stack"] {
          align-items: center !important;
          bottom: 0 !important;
          position: absolute !important;
          right: 0 !important;
          transform: none;
          z-index: 2 !important;
        }

        .spark-orb-learning-shell__companion-anchor [data-testid="companion-speech-bubble"] {
          max-width: 150px !important;
          text-align: center;
        }

        .spark-orb-learning-shell__companion-anchor::after {
          background: rgba(16, 32, 45, 0.08);
          border-radius: 50%;
          bottom: 0;
          content: "";
          filter: blur(6px);
          height: 26px;
          left: 54%;
          position: absolute;
          transform: translateX(-50%);
          width: 112px;
          z-index: 1;
        }

        @keyframes sparkLearningReadyPulse {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.08); }
        }

        @keyframes sparkLearningCreatureBounce {
          0%, 100% { transform: translate(-50%, -50%); }
          50% { transform: translate(-50%, -53%); }
        }

        @keyframes sparkLearningCreaturePull {
          0%, 100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
          }
          50% {
            opacity: 0.92;
            transform: translate(-50%, -34%) scale(0.92) rotate(-2deg);
          }
        }

        @keyframes sparkLearningCreatureShrinkIntoOrb {
          0% {
            opacity: 1;
            transform: translate(-50%, -34%) scale(0.92) rotate(-2deg);
          }
          42% {
            opacity: 0.9;
            transform: translate(-50%, 4%) scale(0.62) rotate(5deg);
          }
          72% {
            opacity: 0.64;
            transform: translate(-50%, 42%) scale(0.28) rotate(12deg);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, 76%) scale(0.06) rotate(18deg);
          }
        }

        @keyframes sparkLearningAuraPulse {
          0%, 100% { filter: drop-shadow(0 0 10px rgba(94, 255, 241, 0.38)); }
          50% { filter: drop-shadow(0 0 28px rgba(255, 232, 104, 0.76)); }
        }

        @keyframes sparkLearningStreamWobble {
          0%, 100% { filter: blur(2px) drop-shadow(0 0 12px rgba(99, 255, 239, 0.42)); }
          50% { filter: blur(2px) drop-shadow(0 0 28px rgba(255, 232, 104, 0.7)); }
        }

        @keyframes sparkLearningCaptureColumn {
          0%, 100% {
            filter:
              blur(2px)
              drop-shadow(0 0 18px rgba(99, 255, 239, 0.62));
            width: 96px;
          }
          50% {
            filter:
              blur(3px)
              drop-shadow(0 0 34px rgba(255, 232, 104, 0.8));
            width: 124px;
          }
        }

        @keyframes sparkLearningVortexSpin {
          0% { transform: translate(-50%, -50%) scale(0.88) rotate(0deg); }
          100% { transform: translate(-50%, -50%) scale(1.02) rotate(360deg); }
        }

        @keyframes sparkLearningVortexLock {
          0%, 100% {
            box-shadow:
              inset 0 0 34px rgba(255, 228, 107, 0.2),
              0 0 46px rgba(124, 255, 241, 0.32);
            transform: translate(-50%, -50%) scale(1.02) rotate(0deg);
          }
          50% {
            box-shadow:
              inset 0 0 54px rgba(255, 228, 107, 0.42),
              0 0 78px rgba(255, 228, 107, 0.6);
            transform: translate(-50%, -50%) scale(1.1) rotate(10deg);
          }
        }

        @keyframes sparkLearningTetherReach {
          0% { transform: translate(-50%, -50%) rotate(-86deg) scaleX(0.24); }
          100% { transform: translate(-50%, -50%) rotate(-86deg) scaleX(1); }
        }

        @keyframes sparkLearningTetherLock {
          0% { transform: translate(-50%, -50%) rotate(-86deg) scaleX(0.9); }
          100% { transform: translate(-50%, -50%) rotate(-86deg) scaleX(1.08); }
        }

        @keyframes sparkLearningBurstFlash {
          0% { opacity: 0; transform: scale(0.42); }
          18% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.22); }
        }

        @keyframes sparkLearningBurstParticle {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--spark-x)), calc(-50% + var(--spark-y))) scale(0.55);
          }
        }

        @keyframes sparkLearningOrbProjectileFlight {
          0% {
            opacity: 1;
            transform: translateX(-50%) translate(0, 0) rotate(0deg) scale(var(--orb-launch-scale));
          }
          42% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-peak-x), var(--orb-peak-y))
              rotate(18deg)
              scale(var(--orb-peak-scale));
          }
          76% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-flight-x), var(--orb-flight-y))
              rotate(28deg)
              scale(var(--orb-flight-scale));
          }
          100% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-impact-x), var(--orb-impact-y))
              rotate(var(--orb-impact-rotation))
              scale(var(--orb-impact-scale));
          }
        }

        @keyframes sparkLearningOrbFizzle {
          0% { opacity: 1; transform: translateX(-50%) rotate(0deg) scale(1); }
          35% {
            opacity: 0.9;
            transform:
              translateX(-50%)
              translate(var(--orb-peak-x), var(--orb-flight-y))
              rotate(18deg)
              scale(var(--orb-peak-scale));
          }
          70% {
            opacity: 0.78;
            transform:
              translateX(-50%)
              translate(var(--orb-flight-x), -112px)
              rotate(-12deg)
              scale(var(--orb-flight-scale));
          }
          100% {
            opacity: 0.7;
            transform:
              translateX(-50%)
              translate(var(--orb-flight-x), -42px)
              rotate(-7deg)
              scale(var(--orb-impact-scale));
          }
        }

        @keyframes sparkLearningOrbLockBoom {
          0% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-impact-x), var(--orb-impact-y))
              rotate(-10deg)
              scale(1.18);
          }
          24% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-impact-x), var(--orb-impact-y))
              rotate(8deg)
              scale(1.38);
          }
          52% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-impact-x), var(--orb-impact-y))
              rotate(-5deg)
              scale(1.08);
          }
          100% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-impact-x), var(--orb-impact-y))
              rotate(0deg)
              scale(1.18);
          }
        }

        @keyframes sparkLearningOrbGroundDrop {
          0% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(var(--orb-impact-x), -178px)
              rotate(10deg)
              scale(0.76);
          }
          56% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(0, 18px)
              rotate(-12deg)
              scale(0.62);
          }
          78% {
            opacity: 1;
            transform:
              translateX(-50%)
              translate(0, -8px)
              rotate(-4deg)
              scale(0.59);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translate(0, 0) rotate(-7deg) scale(0.58);
          }
        }

        @keyframes sparkLearningOrbReversePulse {
          0%, 100% {
            filter:
              drop-shadow(0 16px 16px rgba(8, 51, 68, 0.28))
              drop-shadow(0 0 16px rgba(255, 228, 107, 0.26));
            transform: translateX(-50%) rotate(-7deg) scale(0.58);
          }
          50% {
            filter:
              drop-shadow(0 18px 18px rgba(8, 51, 68, 0.26))
              drop-shadow(0 0 34px rgba(124, 255, 241, 0.56))
              drop-shadow(0 0 28px rgba(255, 228, 107, 0.48));
            transform: translateX(-50%) rotate(-2deg) scale(0.66);
          }
        }

        @keyframes sparkLearningCollectionCardPop {
          0% { opacity: 0; transform: translate(-50%, -42%) scale(0.72); }
          64% { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @media (max-width: 1100px) {
          .spark-orb-learning-shell {
            grid-template-columns: 1fr;
          }

          .spark-orb-learning-shell__orb-stage {
            min-height: 620px;
          }

          .spark-orb-learning-shell__companion-anchor {
            bottom: 116px;
            right: 14px;
            transform: scale(0.86);
            transform-origin: bottom right;
          }
        }
      `}</style>
    </div>
  );
}
