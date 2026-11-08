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
import { resolveSensoryProfile, type SensoryProfile } from "../../../src/shared/sensoryProfile";
import {
  playSparkOrbSfx,
  startSparkOrbPullTone,
  type SparkOrbPullTone,
  type SparkOrbSfxOptions,
} from "../utils/sparkOrbSfx";
import { CompanionLayer } from "./CompanionLayer";
import "./CreatureEncounter.css";
import {
  CREATURE_IDLE_FIDGETS,
  CREATURE_MAX_IDLE_FIDGETS,
  useCreatureIdleLife,
  type CreatureIdleFidget,
} from "../hooks/useCreatureIdleLife";
import {
  SPARK_ORB_MAX_WEATHER_PARTICLES,
  resolveSparkOrbScene,
  type SparkOrbSceneInput,
  type SparkOrbWeather,
} from "./sparkOrbScenes";
import type { SparkOrbEncounterPhase } from "./SparkOrbEncounterPost";
import {
  LUMIPUFF_MONSTER,
  type CapturedMonsterConfig,
  type CapturedMonsterCapturePersonality,
} from "../../../src/shared/capturedMonsterCatalog";
import {
  buildCapturedCreatureReward,
  buildOrbCaptureCompletedEvent,
  type OrbCaptureCompletedEvent,
} from "./capturedMonsterReward";

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
  capturePersonality: CapturedMonsterCapturePersonality;
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
  /** Answers charged so far when the encounter sets its own goal; otherwise read from the phase. */
  chargeCount?: number;
  domain: string;
  currentTarget: string;
  lastMoment?: OrbLearningLastMoment;
  allowedRole?: OrbCompanionAllowedRole;
  creatureName?: string;
  statLabel?: string;
  statValue?: number;
  orbCount?: number;
  capturedCreature?: CapturedMonsterConfig;
  captureProgress?: number;
  sfx?: SparkOrbSfxOptions;
  /** The child's sensory sheet from the chart (volume, brightness, motion). Neutral when absent. */
  sensory?: Partial<SensoryProfile>;
  /** Where the encounter happens: board theme picture, time of day, season. Park + real clock when absent. */
  scene?: SparkOrbSceneInput;
  onCompanionAnchor?: (context: OrbCompanionAnchorContext) => void;
  onEncounterEvent?: (event: SparkOrbLearningEncounterEvent) => void;
  onCaptureCompleted?: (event: OrbCaptureCompletedEvent) => void;
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
  /** 0-100 charge built only by holding the orb; steadies sideways aim. */
  holdCharge?: number;
  /** Finger speed at release in px/ms, right-positive. */
  releaseVelocityX?: number;
  /** Finger speed at release in px/ms, up-positive. */
  releaseVelocityY?: number;
  /** Measured px from the orb up to the creature on this screen; defaults to the design layout. */
  targetDepth?: number;
}

/** One frame of the simulated throw in screen-space translate px from the orb's rest spot. */
export interface SparkOrbFlightSample {
  t: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export const SPARK_ORB_MAX_SIM_STEPS = 240;

/** Lumipuff's idle moves come from the one creature idle-life clock. */
export const SPARK_ORB_IDLE_FIDGETS = CREATURE_IDLE_FIDGETS;
export type SparkOrbIdleFidget = CreatureIdleFidget;
export const SPARK_ORB_MAX_IDLE_FIDGETS = CREATURE_MAX_IDLE_FIDGETS;

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
  /** Flight time until the orb lands on the creature, in ms. */
  flightMs: number;
  /** Measured px from the orb up to the creature. */
  targetDepth: number;
  path: SparkOrbFlightSample[];
  landingIndex: number;
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

/** Finger speed over the last ~90ms before release, px/ms (x right, y up). */
function releaseVelocityFromSamples(samples: Array<{ t: number; x: number; y: number }>): {
  x: number;
  y: number;
} {
  const last = samples[samples.length - 1];
  if (!last) return { x: 0, y: 0 };
  const first = samples.find((sample) => last.t - sample.t <= 90) ?? last;
  const elapsed = last.t - first.t;
  if (elapsed < 8) return { x: 0, y: 0 };
  return {
    x: Number(((last.x - first.x) / elapsed).toFixed(2)),
    y: Number(((first.y - last.y) / elapsed).toFixed(2)),
  };
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

function captureShrinkProgressForProgress(progress: number): number {
  if (progress < 42) return 0;
  if (progress > 76) return 1;
  return Math.max(0, Math.min(1, (progress - 42) / 34));
}

function formatMotionNumber(value: number): string {
  return value.toFixed(2);
}

function personalityReactionForCaptureStage(
  capturePersonality: CapturedMonsterCapturePersonality,
  captureStage: CaptureStage,
): string {
  if (captureStage === "incoming") {
    if (capturePersonality === "playful") return "peek";
    if (capturePersonality === "shy") return "flinch";
    if (capturePersonality === "brave") return "brace";
    return "drowsy";
  }
  if (captureStage === "pulling") {
    if (capturePersonality === "playful") return "dodge";
    if (capturePersonality === "shy") return "flinch";
    if (capturePersonality === "brave") return "resist";
    return "drowsy";
  }
  if (captureStage === "shrinking") {
    if (capturePersonality === "playful") return "peek";
    if (capturePersonality === "shy") return "curl";
    if (capturePersonality === "brave") return "resist";
    return "float";
  }
  if (captureStage === "locked" || captureStage === "collection-added") {
    if (capturePersonality === "playful") return "smile";
    if (capturePersonality === "shy") return "relax";
    if (capturePersonality === "brave") return "proud";
    return "confused";
  }
  return "watching";
}

// Throw model ("don't make me think"): the learning is the challenge, the throw is the reward.
// Any tap, flick, or pull-back launches the orb on a real gravity arc that homes in on the
// creature and catches it. A quick, centered flick only changes the feel (faster, higher arc)
// and earns a "Perfect!" bonus; nothing about the throw can fail.
const SPARK_ORB_TARGET_DEPTH = 316;
const SPARK_ORB_SWEET_PULL = 178;
const SPARK_ORB_PERFECT_FLIGHT_S = 0.56;
const SPARK_ORB_PERFECT_PEAK_PX = 110;
const SPARK_ORB_SIM_DT_S = 1 / 60;
const SPARK_ORB_HEIGHT_GAIN = 1.6;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function projectOrbSample(
  target: number,
  t: number,
  side: number,
  depth: number,
  height: number,
  rotation: number,
): SparkOrbFlightSample {
  const scale = Math.max(0.3, 1 - (0.6 * Math.min(depth, target)) / target);
  return {
    t: Math.round(t * 1000),
    x: Math.round(side),
    y: Math.round(-(depth + Math.max(0, height) * SPARK_ORB_HEIGHT_GAIN)),
    scale: Number(scale.toFixed(3)),
    rotation: Math.round(rotation),
  };
}

export function computeSparkOrbLaunchPhysics({
  pullX,
  pullY,
  holdPower = 0,
  holdCharge = 0,
  releaseVelocityX = 0,
  releaseVelocityY = 0,
  targetDepth: measuredTargetDepth,
}: SparkOrbLaunchPhysicsInput): SparkOrbLaunchPhysics {
  const target =
    typeof measuredTargetDepth === "number" && measuredTargetDepth >= 120 && measuredTargetDepth <= 640
      ? Math.round(measuredTargetDepth)
      : SPARK_ORB_TARGET_DEPTH;
  // Up-flicks and slingshot pull-backs both count as throw strength.
  const pullStrength = Math.min(320, Math.abs(pullY));
  const horizontalPull = clampNumber(pullX, -170, 170);
  const flickSpeed = clampNumber(Math.abs(releaseVelocityY), 0, 3);
  const flickSide = clampNumber(releaseVelocityX, -3, 3);
  const steadiness = 1 - 0.25 * (clampNumber(holdCharge, 0, 100) / 100);
  const power = Math.round(Math.max(holdPower, clampPercent((pullStrength / 220) * 100)));

  const effectivePull = pullStrength + flickSpeed * 40;
  const strength = clampNumber(effectivePull / SPARK_ORB_SWEET_PULL, 0, 1.4);
  // Stronger throws fly faster and arc higher; weak taps make a soft lob.
  const flightS = SPARK_ORB_PERFECT_FLIGHT_S * (1.25 - 0.25 * strength);
  const peakHeight = SPARK_ORB_PERFECT_PEAK_PX * (0.65 + 0.35 * strength);
  const sideAim = (horizontalPull + flickSide * 24) * steadiness;
  // A sideways throw swings out, then homes back onto the creature.
  const sideSwing = clampNumber(sideAim * 0.6, -90, 90);

  const weakness = Math.max(0, 120 - effectivePull) * 0.5;
  const hitDistance = Math.round(Math.min(creatureCaptureRadius, Math.hypot(sideAim * 0.5, weakness)));
  const hitQuality: SparkOrbHitQuality = hitDistance <= 34 ? "direct" : "near";
  const result: SparkOrbLaunchResult = "success";
  const rotation = Math.round(clampNumber(18 + horizontalPull * 0.16 + flickSide * 6, -34, 34));

  // Sample the flight; the loop is bounded by SPARK_ORB_MAX_SIM_STEPS (Law 2).
  const gravity = (8 * peakHeight) / (flightS * flightS);
  const verticalSpeed = (gravity * flightS) / 2;
  const path: SparkOrbFlightSample[] = [projectOrbSample(target, 0, 0, 0, 0, 0)];
  let step = 1;
  for (; step < SPARK_ORB_MAX_SIM_STEPS; step += 1) {
    const t = step * SPARK_ORB_SIM_DT_S;
    if (t >= flightS) break;
    const progress = t / flightS;
    const height = verticalSpeed * t - 0.5 * gravity * t * t;
    path.push(
      projectOrbSample(
        target,
        t,
        sideSwing * Math.sin(Math.PI * progress),
        target * progress,
        height,
        rotation * progress,
      ),
    );
  }
  if (step >= SPARK_ORB_MAX_SIM_STEPS) {
    console.warn(" 🎮 [spark-orb-learning-shell] [throw-sim] [step-guard-hit]", { step });
  }
  path.push(projectOrbSample(target, flightS, 0, target, 0, rotation));
  const landingIndex = path.length - 1;

  const peak = path.reduce((best, sample) => (sample.y < best.y ? sample : best), path[0]);
  const lateFlight = path[Math.round(landingIndex * 0.76)];
  const landing = path[landingIndex];

  return {
    result,
    hitQuality,
    hitDistance,
    hitScore: Math.max(0, Math.round(100 - hitDistance)),
    power,
    flightX: lateFlight.x,
    flightY: lateFlight.y,
    peakX: peak.x,
    peakY: peak.y,
    impactX: landing.x,
    impactY: landing.y,
    rotation,
    launchScale: 1,
    peakScale: peak.scale,
    flightScale: lateFlight.scale,
    impactScale: landing.scale,
    flightMs: landing.t,
    targetDepth: target,
    path,
    landingIndex,
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

const WEATHER_PARTICLE_COUNT: Record<Exclude<SparkOrbWeather, "none">, number> = {
  snow: SPARK_ORB_MAX_WEATHER_PARTICLES,
  leaves: 12,
  petals: 12,
  fireflies: 14,
};
const LEAF_COLORS = ["#e07b2a", "#c9481f", "#f2b33d", "#9a4a1c"];

/** Seasonal particles; positions come from the index so renders stay stable (no randomness in render). */
function SparkOrbWeatherLayer({ weather }: { weather: SparkOrbWeather }) {
  if (weather === "none") return null;
  const count = Math.min(SPARK_ORB_MAX_WEATHER_PARTICLES, WEATHER_PARTICLE_COUNT[weather]);
  return (
    <div className="spark-orb-learning-shell__weather" data-testid="spark-orb-weather" data-weather={weather} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const spread = (index * 37) % 100;
        const style = {
          "--x": `${(spread + 3) % 98}%`,
          "--y": `${45 + ((index * 23) % 45)}%`,
          "--size": `${4 + ((index * 7) % 6)}px`,
          "--fall-s": `${6 + ((index * 13) % 7)}s`,
          "--delay-s": `${-((index * 1.7) % 9).toFixed(1)}s`,
          "--sway": `${index % 2 === 0 ? 24 : -24}px`,
          "--leaf": LEAF_COLORS[index % LEAF_COLORS.length],
        } as CSSProperties;
        return <span key={index} data-testid="spark-orb-weather-particle" style={style} />;
      })}
    </div>
  );
}

export function SparkOrbLearningShell({
  children,
  childId,
  childName,
  companion,
  companionName = companion.companionId,
  phase,
  chargeGoal = 3,
  chargeCount: chargeCountProp,
  domain,
  currentTarget,
  lastMoment = "watching",
  allowedRole = "emote_and_tiny_reaction",
  creatureName,
  statLabel,
  statValue,
  orbCount = 7,
  capturedCreature = LUMIPUFF_MONSTER,
  captureProgress,
  sfx,
  sensory,
  scene,
  onCompanionAnchor,
  onEncounterEvent,
  onCaptureCompleted,
}: SparkOrbLearningShellProps) {
  const [remainingOrbCount, setRemainingOrbCount] = useState(orbCount);
  const [chargeOverride, setChargeOverride] = useState<number | null>(null);
  const resolvedSensory = useMemo(() => resolveSensoryProfile(sensory), [sensory]);
  const resolvedScene = useMemo(() => resolveSparkOrbScene(scene), [scene]);
  const showWeather = resolvedScene.weather !== "none" && resolvedSensory.motion !== "calm";
  const sfxOptions = useMemo<SparkOrbSfxOptions>(
    () => ({ ...sfx, sensory: resolvedSensory }),
    [sfx, resolvedSensory],
  );
  const sfxOptionsRef = useRef(sfxOptions);
  sfxOptionsRef.current = sfxOptions;
  const pullToneRef = useRef<SparkOrbPullTone | null>(null);
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
  const pointerSamplesRef = useRef<Array<{ t: number; x: number; y: number }>>([]);
  const orbRef = useRef<HTMLImageElement | null>(null);
  const creatureRef = useRef<HTMLImageElement | null>(null);
  const payoffTimerRefs = useRef<number[]>([]);
  const displayCreatureName = creatureName ?? capturedCreature.speciesName;
  const displayStatLabel = statLabel ?? capturedCreature.statLabel;
  const displayStatValue = statValue ?? capturedCreature.statValue;
  // A ready orb is full whatever the goal; before that, an explicit count wins over the phase's.
  const phaseChargeCount =
    phase === "ready" || phase === "launching" || phase === "collected"
      ? chargeGoal
      : Math.min(chargeGoal, chargeCountProp ?? chargeCountForPhase(phase));
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
  const scrubbedCaptureShrinkProgress =
    scrubbedCaptureProgress === null
      ? null
      : captureShrinkProgressForProgress(scrubbedCaptureProgress);
  const scrubbedCaptureScale =
    scrubbedCaptureShrinkProgress === null
      ? null
      : 0.92 - scrubbedCaptureShrinkProgress * 0.86;
  const scrubbedCaptureY =
    scrubbedCaptureShrinkProgress === null
      ? null
      : -34 + scrubbedCaptureShrinkProgress * 110;
  const scrubbedCaptureRotation =
    scrubbedCaptureShrinkProgress === null
      ? null
      : -2 + scrubbedCaptureShrinkProgress * 20;
  const scrubbedCaptureOpacity =
    scrubbedCaptureShrinkProgress === null
      ? null
      : 1 - scrubbedCaptureShrinkProgress * 0.9;
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
  const idleMotion = resolvedSensory.motion;
  const idleLifeActive =
    idleMotion !== "calm" &&
    ready &&
    !launching &&
    displayFlightState === "idle" &&
    creatureCaptureMotion === "free";
  const personalityReaction = personalityReactionForCaptureStage(
    capturedCreature.capturePersonality,
    visualCaptureStage,
  );
  const captureDirection = reverseReplayActive ? "reverse" : "capture";
  const creatureCaptureStyle =
    scrubbedCaptureScale === null ||
    scrubbedCaptureY === null ||
    scrubbedCaptureRotation === null ||
    scrubbedCaptureOpacity === null
      ? undefined
      : ({
          "--capture-scrub-scale": formatMotionNumber(scrubbedCaptureScale),
          "--capture-scrub-y": `${formatMotionNumber(scrubbedCaptureY)}%`,
          "--capture-scrub-rotation": `${formatMotionNumber(scrubbedCaptureRotation)}deg`,
          "--capture-scrub-opacity": formatMotionNumber(scrubbedCaptureOpacity),
        } as CSSProperties);
  const companionBehavior = companionBehaviorForMoment(phase, lastMoment);
  const speechBubbleText = rewardFocused ? null : companionLineForMoment(childName, phase, lastMoment);
  const canHoldToLaunch =
    ready && chargeCount > 0 && launchSkill !== "success" && launchSkill !== "spent";
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
    "--orb-flight-ms": `${displayLaunchPhysics.flightMs}ms`,
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

  const idleFidget = useCreatureIdleLife({
    active: idleLifeActive,
    motion: idleMotion,
    label: "spark-orb-learning-shell",
    onFidget: (_fidget, sound) => {
      if (sound.chirp) playSparkOrbSfx("chirp", sfxOptionsRef.current);
    },
  });

  // Each answer that charges the orb gets a chime; reaching the goal gets the "ready" song.
  const previousChargeRef = useRef(chargeCount);
  useEffect(() => {
    const previous = previousChargeRef.current;
    previousChargeRef.current = chargeCount;
    if (chargeCount <= previous) return;
    playSparkOrbSfx(chargeCount >= chargeGoal ? "ready" : "charge", sfxOptionsRef.current);
  }, [chargeCount, chargeGoal]);

  useEffect(
    () => () => {
      pullToneRef.current?.stop();
      pullToneRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const orb = orbRef.current;
    const flying = displayFlightState === "traveling" || displayFlightState === "fizzle";
    if (!flying || !launchPhysics || !orb || typeof orb.animate !== "function") return;
    const samples =
      displayFlightState === "traveling"
        ? launchPhysics.path.slice(0, launchPhysics.landingIndex + 1)
        : launchPhysics.path;
    const durationMs = Math.max(1, samples[samples.length - 1].t);
    const animation = orb.animate(
      samples.map((sample) => ({
        offset: sample.t / durationMs,
        transform: `translateX(-50%) translate(${sample.x}px, ${sample.y}px) rotate(${sample.rotation}deg) scale(${sample.scale})`,
      })),
      { duration: durationMs, easing: "linear", fill: "forwards" },
    );
    return () => animation.cancel();
  }, [displayFlightState, launchPhysics]);

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
    event: Omit<
      SparkOrbLearningEncounterEvent,
      "phase" | "chargeGoal" | "currentTarget" | "capturePersonality"
    >,
  ): void {
    const payload: SparkOrbLearningEncounterEvent = {
      ...event,
      phase,
      chargeGoal,
      capturePersonality: capturedCreature.capturePersonality,
      currentTarget,
    };
    console.info(" 🎮 [spark-orb-learning-shell] [launch-skill] [reported]", payload);
    onEncounterEvent?.(payload);
  }

  function emitCaptureCompleted(launchScore: SparkOrbLaunchPhysics): void {
    const reward = buildCapturedCreatureReward({
      creature: capturedCreature,
      childId,
      domain,
      currentTarget,
      source: "spark_orb_learning_shell",
    });
    const payload = buildOrbCaptureCompletedEvent({
      reward,
      chargeGoal,
      orbCount: remainingOrbCount,
      hitDistance: launchScore.hitDistance,
      hitQuality: launchScore.hitQuality,
    });
    console.info(
      " 🎮 [spark-orb-learning-shell] [orb_capture_completed] [storybook_only]",
      payload,
    );
    onCaptureCompleted?.(payload);
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
    pointerSamplesRef.current = [{ t: event.timeStamp, x: event.clientX, y: event.clientY }];
    launchPowerRef.current = 0;
    setLaunchPower(0);
    setLaunchPhysics(null);
    setLaunchSkill("holding");
    setLaunchAim("aiming");
    playSparkOrbSfx("grab", sfxOptions);
    pullToneRef.current?.stop();
    pullToneRef.current = startSparkOrbPullTone(sfxOptions);
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
    pointerSamplesRef.current = [
      ...pointerSamplesRef.current.slice(-7),
      { t: event.timeStamp, x: event.clientX, y: event.clientY },
    ];
    aimVectorRef.current = nextAimVector;
    setAimVector(nextAimVector);
    const pullPower = launchPullPower(nextAimVector);
    pullToneRef.current?.update(pullPower / 100);
    setLaunchPower(Math.max(launchPowerRef.current, pullPower));
  }

  function handleLaunchRelease(event: PointerEvent<HTMLButtonElement>): void {
    if (launchSkill !== "holding") return;
    handleLaunchAimMove(event);
    pullToneRef.current?.stop();
    pullToneRef.current = null;
    stopLaunchTimer();
    const finalAimVector = aimVectorRef.current;
    const pullPower = launchPullPower(finalAimVector);
    const holdPower = Math.round(Math.max(launchPowerRef.current, pullPower));
    const releaseVelocity = releaseVelocityFromSamples(pointerSamplesRef.current);
    const orbBox = orbRef.current?.getBoundingClientRect();
    const creatureBox = creatureRef.current?.getBoundingClientRect();
    const measuredTargetDepth =
      orbBox && creatureBox && orbBox.height > 0 && creatureBox.height > 0
        ? orbBox.top + orbBox.height / 2 - (creatureBox.top + creatureBox.height / 2)
        : undefined;
    const launchScore = computeSparkOrbLaunchPhysics({
      pullX: finalAimVector.pullX,
      pullY: finalAimVector.pullY,
      holdPower,
      holdCharge: launchPowerRef.current,
      releaseVelocityX: releaseVelocity.x,
      releaseVelocityY: releaseVelocity.y,
      targetDepth: measuredTargetDepth,
    });
    const result = launchScore.result;
    console.info(` 🎮 [spark-orb-learning-shell] [throw] [${result}]`, {
      hitQuality: launchScore.hitQuality,
      hitDistance: launchScore.hitDistance,
      targetDepth: launchScore.targetDepth,
      flightMs: launchScore.flightMs,
      releaseVelocity,
      holdCharge: launchPowerRef.current,
    });
    // Capture beats follow the moment the orb actually lands, not a fixed clock.
    const landingShiftMs = launchScore.flightMs - 650;
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
      playSparkOrbSfx("launch", sfxOptions);
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
          playSparkOrbSfx("impact", sfxOptions);
          if (launchScore.hitQuality === "direct") playSparkOrbSfx("perfect", sfxOptions);
          playSparkOrbSfx("capturePull", sfxOptions);
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
        }, 650 + landingShiftMs),
        window.setTimeout(() => {
          setCaptureStage("shrinking");
          playSparkOrbSfx("captureShrink", sfxOptions);
          emitLaunchEvent({
            type: "capture_shrink",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 1250 + landingShiftMs),
        window.setTimeout(() => {
          setCaptureStage("locked");
          playSparkOrbSfx("captureLock", sfxOptions);
          emitLaunchEvent({
            type: "capture_lock",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 1800 + landingShiftMs),
        window.setTimeout(() => {
          setFlightState("reward");
          setCaptureStage("collection-added");
          setCollectibleRevealed(true);
          setCollectionCardVisible(true);
          playSparkOrbSfx("collected", sfxOptions);
          emitLaunchEvent({
            type: "collectible_revealed",
            chargeCount,
            orbCount: remainingOrbCount,
            result,
            hitDistance: launchScore.hitDistance,
            hitQuality: launchScore.hitQuality,
            holdPower: launchScore.power,
          });
        }, 2150 + landingShiftMs),
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
          emitCaptureCompleted(launchScore);
        }, 3650 + landingShiftMs),
      ];
      return;
    }

    // Each charge is one try: a miss costs one charge, and only the last miss asks for more answers.
    const nextOrbCount = Math.max(0, remainingOrbCount - 1);
    const nextChargeCount = Math.max(0, chargeCount - 1);
    const outOfCharge = nextChargeCount === 0;
    clearPayoffTimers();
    setLaunchSkill(outOfCharge ? "spent" : "waiting");
    setFlightState("fizzle");
    setCaptureEffect("inactive");
    setCaptureStage("free");
    setCollectibleRevealed(false);
    setCollectionCardVisible(false);
    setReverseReplayActive(false);
    setReversePreviewOpen(false);
    setChargeOverride(nextChargeCount);
    setRemainingOrbCount(nextOrbCount);
    playSparkOrbSfx("miss", sfxOptions);
    console.info(" 🎮 [spark-orb-learning-shell] [charge] [spent-one]", {
      chargeCount: nextChargeCount,
      outOfCharge,
    });
    emitLaunchEvent({
      type: "release_miss",
      chargeCount: nextChargeCount,
      orbCount: nextOrbCount,
      result,
      hitDistance: launchScore.hitDistance,
      hitQuality: launchScore.hitQuality,
      holdPower: launchScore.power,
    });
    emitLaunchEvent({
      type: "orb_spent",
      chargeCount: nextChargeCount,
      orbCount: nextOrbCount,
      result,
      hitDistance: launchScore.hitDistance,
      hitQuality: launchScore.hitQuality,
      holdPower: launchScore.power,
    });
    if (!outOfCharge) return;
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
    playSparkOrbSfx("capturePull", sfxOptions);
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
        playSparkOrbSfx("captureLock", sfxOptions);
      }, 250),
      window.setTimeout(() => {
        setCaptureStage("shrinking");
        playSparkOrbSfx("captureShrink", sfxOptions);
      }, 650),
      window.setTimeout(() => {
        setCaptureStage("pulling");
        playSparkOrbSfx("capturePull", sfxOptions);
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
        data-time-of-day={resolvedScene.timeOfDay}
        data-season={resolvedScene.season}
        data-scene-source={resolvedScene.source}
        data-launch-skill={launchSkill}
        data-launch-aim={visualLaunchAim}
        data-flight={displayFlightState}
        data-hit-quality={launchPhysics?.hitQuality ?? "none"}
        data-capture-effect={displayCaptureEffect}
        data-capture-stage={visualCaptureStage}
        data-capture-direction={captureDirection}
        data-capture-personality={capturedCreature.capturePersonality}
        data-personality-reaction={personalityReaction}
        data-collection-state={collectionState}
        data-captured-creature-id={capturedCreature.id}
        style={launchStyle}
      >
        <img
          className="spark-orb-learning-shell__backdrop"
          src={resolvedScene.backgroundSrc}
          alt=""
          aria-hidden="true"
        />
        <div className="spark-orb-learning-shell__wash" aria-hidden="true" />
        <div className="spark-orb-learning-shell__light" aria-hidden="true" />
        {showWeather ? <SparkOrbWeatherLayer weather={resolvedScene.weather} /> : null}
        <div className="spark-orb-learning-shell__orb-hud">
          <div className="spark-orb-learning-shell__nameplate">
            <strong>{displayCreatureName}</strong>
            <span>
              {displayStatLabel} {displayStatValue}
            </span>
          </div>
        </div>

        <div
          className="spark-orb-learning-shell__creature-shadow"
          data-idle-life={idleLifeActive ? "breathing" : undefined}
          data-idle-fidget={idleLifeActive && idleFidget ? idleFidget : undefined}
          aria-hidden="true"
        />
        <img
          ref={creatureRef}
          className="spark-orb-learning-shell__creature"
          data-testid="spark-orb-creature"
          data-capture-motion={creatureCaptureMotion}
          data-capture-direction={captureDirection}
          data-capture-scrubbed={scrubbedCaptureProgress === null ? "false" : "true"}
          data-capture-shrink-progress={
            scrubbedCaptureShrinkProgress === null
              ? undefined
              : formatMotionNumber(scrubbedCaptureShrinkProgress)
          }
          data-capture-scale={
            scrubbedCaptureScale === null ? undefined : formatMotionNumber(scrubbedCaptureScale)
          }
          data-capture-personality={capturedCreature.capturePersonality}
          data-personality-reaction={personalityReaction}
          data-idle-life={idleLifeActive ? "breathing" : undefined}
          data-idle-fidget={idleLifeActive && idleFidget ? idleFidget : undefined}
          style={{
            ...creatureCaptureStyle,
            ...(capturedCreature.placeholderHue
              ? ({ "--creature-hue": `${capturedCreature.placeholderHue}deg` } as CSSProperties)
              : null),
          }}
          src={capturedCreature.imageSrc}
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
          ref={orbRef}
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
                {launchSkill === "success"
                  ? launchPhysics?.hitQuality === "direct"
                    ? "Perfect!"
                    : "Nice throw!"
                  : "Answer more to recharge."}
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
        <div
          className="spark-orb-learning-shell__companion-anchor"
          aria-label="Companion portrait near orb"
          data-testid="spark-orb-companion-frame"
          data-portrait-frame="framed"
        >
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
          <div className="spark-orb-learning-shell__collect-card" role="dialog" aria-label={`${displayCreatureName} added to collection`}>
            <span>Added to collection</span>
            <strong>{capturedCreature.collectionTitle}</strong>
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

        /* Time-of-day light over the scene picture. */
        .spark-orb-learning-shell__light {
          inset: 0;
          pointer-events: none;
          position: absolute;
          transition: background 600ms ease;
          z-index: 2;
        }

        .spark-orb-learning-shell__orb-stage[data-time-of-day="sunrise"] .spark-orb-learning-shell__light {
          background:
            radial-gradient(ellipse at 12% 8%, rgba(255, 214, 140, 0.45), transparent 55%),
            linear-gradient(180deg, rgba(255, 230, 190, 0.18), transparent 60%);
        }

        .spark-orb-learning-shell__orb-stage[data-time-of-day="twilight"] .spark-orb-learning-shell__light {
          background:
            radial-gradient(ellipse at 85% 22%, rgba(255, 170, 90, 0.5), transparent 50%),
            linear-gradient(180deg, rgba(255, 128, 72, 0.38) 0%, rgba(214, 96, 120, 0.3) 45%, rgba(70, 40, 110, 0.45) 100%);
        }

        .spark-orb-learning-shell__orb-stage[data-time-of-day="golden"] .spark-orb-learning-shell__light {
          background:
            radial-gradient(ellipse at 88% 30%, rgba(255, 196, 110, 0.45), transparent 55%),
            linear-gradient(180deg, rgba(255, 190, 120, 0.22), rgba(230, 140, 90, 0.2));
        }

        .spark-orb-learning-shell__orb-stage[data-time-of-day="night"] .spark-orb-learning-shell__light {
          background:
            radial-gradient(1.5px 1.5px at 12% 14%, white, transparent),
            radial-gradient(1.5px 1.5px at 28% 8%, white, transparent),
            radial-gradient(2px 2px at 46% 16%, white, transparent),
            radial-gradient(1.5px 1.5px at 64% 6%, white, transparent),
            radial-gradient(2px 2px at 82% 12%, white, transparent),
            radial-gradient(1.5px 1.5px at 92% 22%, white, transparent),
            linear-gradient(180deg, rgba(20, 24, 80, 0.62), rgba(30, 20, 70, 0.5));
        }

        .spark-orb-learning-shell__orb-stage[data-season="halloween"] .spark-orb-learning-shell__wash {
          box-shadow: inset 0 0 120px rgba(255, 120, 20, 0.35), inset 0 0 220px rgba(90, 30, 140, 0.35);
        }

        .spark-orb-learning-shell__orb-stage[data-season="holiday"] .spark-orb-learning-shell__wash {
          box-shadow: inset 0 0 140px rgba(255, 210, 150, 0.32);
        }

        .spark-orb-learning-shell__weather {
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          position: absolute;
          z-index: 5;
        }

        .spark-orb-learning-shell__weather span {
          animation: sparkLearningWeatherFall var(--fall-s) linear var(--delay-s) infinite;
          left: var(--x);
          position: absolute;
          top: -6%;
        }

        .spark-orb-learning-shell__weather[data-weather="snow"] span {
          background: white;
          border-radius: 50%;
          box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
          height: var(--size);
          opacity: 0.9;
          width: var(--size);
        }

        .spark-orb-learning-shell__weather[data-weather="leaves"] span {
          background: var(--leaf, #e07b2a);
          border-radius: 0 80% 0 80%;
          height: calc(var(--size) * 1.6);
          width: calc(var(--size) * 1.6);
        }

        .spark-orb-learning-shell__weather[data-weather="petals"] span {
          background: #ffc3d8;
          border-radius: 80% 0 80% 0;
          height: var(--size);
          opacity: 0.9;
          width: calc(var(--size) * 1.3);
        }

        .spark-orb-learning-shell__weather[data-weather="fireflies"] span {
          animation: sparkLearningFirefly var(--fall-s) ease-in-out var(--delay-s) infinite;
          background: #fff59a;
          border-radius: 50%;
          box-shadow: 0 0 10px 4px rgba(255, 240, 120, 0.7);
          height: 5px;
          top: var(--y);
          width: 5px;
        }

        @keyframes sparkLearningWeatherFall {
          0% { top: -6%; translate: 0 0; rotate: 0deg; }
          50% { translate: var(--sway) 0; rotate: 160deg; }
          100% { top: 106%; translate: 0 0; rotate: 320deg; }
        }

        @keyframes sparkLearningFirefly {
          0%, 100% { opacity: 0.1; translate: 0 0; }
          40% { opacity: 1; translate: var(--sway) -14px; }
          70% { opacity: 0.6; translate: calc(var(--sway) * -0.5) 8px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .spark-orb-learning-shell__weather {
            display: none;
          }
        }

        .spark-orb-learning-shell__orb-hud {
          align-items: start;
          display: grid;
          grid-template-columns: 1fr;
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

        .spark-orb-learning-shell__creature {
          filter: drop-shadow(0 18px 28px rgba(72, 58, 114, 0.28)) hue-rotate(var(--creature-hue, 0deg));
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

        .spark-orb-learning-shell .spark-orb-learning-shell__creature[data-idle-life="breathing"] {
          animation:
            sparkLearningCreatureBounce 1.7s ease-in-out infinite,
            creatureBreathe 1.7s ease-in-out infinite;
        }

        .spark-orb-learning-shell .spark-orb-learning-shell__creature[data-idle-life="breathing"][data-idle-fidget="hop"] {
          animation:
            sparkLearningCreatureBounce 1.7s ease-in-out infinite,
            creatureBreathe 1.7s ease-in-out infinite,
            creatureFidgetHop 0.9s cubic-bezier(0.3, 0.7, 0.4, 1);
        }

        .spark-orb-learning-shell .spark-orb-learning-shell__creature[data-idle-life="breathing"][data-idle-fidget="tilt"] {
          animation:
            sparkLearningCreatureBounce 1.7s ease-in-out infinite,
            creatureBreathe 1.7s ease-in-out infinite,
            creatureFidgetTilt 0.9s ease-in-out;
        }

        .spark-orb-learning-shell .spark-orb-learning-shell__creature[data-idle-life="breathing"][data-idle-fidget="wiggle"] {
          animation:
            sparkLearningCreatureBounce 1.7s ease-in-out infinite,
            creatureBreathe 1.7s ease-in-out infinite,
            creatureFidgetWiggle 0.9s ease-in-out;
        }

        .spark-orb-learning-shell .spark-orb-learning-shell__creature[data-idle-life="breathing"][data-idle-fidget="look"] {
          animation:
            sparkLearningCreatureBounce 1.7s ease-in-out infinite,
            creatureBreathe 1.7s ease-in-out infinite,
            creatureFidgetLook 0.9s ease-in-out;
        }

        .spark-orb-learning-shell__creature-shadow[data-idle-life="breathing"] {
          animation: sparkLearningShadowBreathe 1.7s ease-in-out infinite;
        }

        .spark-orb-learning-shell__creature-shadow[data-idle-life="breathing"][data-idle-fidget="hop"] {
          animation:
            sparkLearningShadowBreathe 1.7s ease-in-out infinite,
            sparkLearningShadowHop 0.9s cubic-bezier(0.3, 0.7, 0.4, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .spark-orb-learning-shell .spark-orb-learning-shell__creature[data-idle-life="breathing"],
          .spark-orb-learning-shell .spark-orb-learning-shell__creature[data-idle-life="breathing"][data-idle-fidget] {
            animation: sparkLearningCreatureBounce 1.7s ease-in-out infinite;
          }

          .spark-orb-learning-shell__creature-shadow[data-idle-life="breathing"],
          .spark-orb-learning-shell__creature-shadow[data-idle-life="breathing"][data-idle-fidget] {
            animation: none;
          }
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

        .spark-orb-learning-shell__creature[data-capture-scrubbed="true"][data-capture-motion="shrinking"] {
          animation: none;
          opacity: var(--capture-scrub-opacity);
          transform:
            translate(-50%, var(--capture-scrub-y))
            scale(var(--capture-scrub-scale))
            rotate(var(--capture-scrub-rotation));
        }

        .spark-orb-learning-shell__creature[data-capture-motion="pulling"][data-personality-reaction="dodge"] {
          animation: sparkLearningCreaturePlayfulDodge 0.72s ease-in-out infinite;
        }

        .spark-orb-learning-shell__creature[data-capture-motion="pulling"][data-personality-reaction="flinch"] {
          animation: sparkLearningCreatureShyFlinch 0.78s ease-in-out infinite;
          filter:
            drop-shadow(0 18px 28px rgba(72, 58, 114, 0.24))
            drop-shadow(0 0 26px rgba(179, 236, 255, 0.58))
            saturate(0.96);
        }

        .spark-orb-learning-shell__creature[data-capture-motion="pulling"][data-personality-reaction="resist"],
        .spark-orb-learning-shell__creature[data-capture-motion="shrinking"][data-personality-reaction="resist"] {
          animation: sparkLearningCreatureBraveResist 0.68s ease-in-out infinite;
          filter:
            drop-shadow(0 20px 28px rgba(72, 58, 114, 0.32))
            drop-shadow(0 0 30px rgba(255, 228, 107, 0.62))
            saturate(1.14);
        }

        .spark-orb-learning-shell__creature[data-capture-motion="pulling"][data-personality-reaction="drowsy"] {
          animation: sparkLearningCreatureSleepyDrowsy 1.22s ease-in-out infinite;
          filter:
            drop-shadow(0 18px 28px rgba(72, 58, 114, 0.22))
            drop-shadow(0 0 22px rgba(190, 244, 255, 0.46))
            saturate(0.92);
        }

        .spark-orb-learning-shell__creature[data-capture-motion="shrinking"][data-personality-reaction="peek"] {
          animation: sparkLearningCreaturePlayfulPeekShrink 0.84s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .spark-orb-learning-shell__creature[data-capture-motion="shrinking"][data-personality-reaction="curl"] {
          animation: sparkLearningCreatureShyCurlShrink 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
          filter:
            drop-shadow(0 0 28px rgba(179, 236, 255, 0.64))
            drop-shadow(0 0 18px rgba(255, 228, 107, 0.5))
            brightness(1.08);
        }

        .spark-orb-learning-shell__creature[data-capture-motion="shrinking"][data-personality-reaction="float"] {
          animation: sparkLearningCreatureSleepyFloatShrink 1.04s cubic-bezier(0.22, 0.72, 0.18, 1) both;
          filter:
            drop-shadow(0 0 28px rgba(190, 244, 255, 0.7))
            drop-shadow(0 0 14px rgba(255, 228, 107, 0.42))
            brightness(1.12);
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

        .spark-orb-learning-shell__orb-stage[data-hit-quality="direct"][data-capture-effect="active"] .spark-orb-learning-shell__spark-burst {
          filter: brightness(1.25) saturate(1.3);
          scale: 1.35;
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
          animation: sparkLearningOrbProjectileFlight var(--orb-flight-ms, 0.66s) linear both;
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

        /* The companion is a 3D model on a transparent canvas; give its circle a lit backdrop and rim
           so it reads like a co-op player portrait on any scene. */
        .spark-orb-learning-shell__companion-anchor[data-portrait-frame="framed"] [data-testid="companion-portrait"] {
          background: radial-gradient(circle at 50% 38%, #fffaf0 0%, #ffe9c2 48%, #ffc98a 100%);
          border: 4px solid rgba(255, 255, 255, 0.95);
          box-shadow:
            0 0 0 3px rgba(255, 179, 71, 0.85),
            0 12px 26px rgba(20, 24, 48, 0.4);
          box-sizing: border-box;
          overflow: hidden;
        }

        .spark-orb-learning-shell__orb-stage[data-time-of-day="twilight"] .spark-orb-learning-shell__companion-anchor[data-portrait-frame="framed"] [data-testid="companion-portrait"],
        .spark-orb-learning-shell__orb-stage[data-time-of-day="night"] .spark-orb-learning-shell__companion-anchor[data-portrait-frame="framed"] [data-testid="companion-portrait"] {
          background: radial-gradient(circle at 50% 38%, #eef1ff 0%, #b9c0f2 50%, #7466c8 100%);
          box-shadow:
            0 0 0 3px rgba(160, 170, 255, 0.85),
            0 12px 26px rgba(8, 10, 30, 0.55);
        }

        @keyframes sparkLearningReadyPulse {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.08); }
        }

        @keyframes sparkLearningCreatureBounce {
          0%, 100% { transform: translate(-50%, -50%); }
          50% { transform: translate(-50%, -53%); }
        }

        @keyframes sparkLearningShadowBreathe {
          0%, 100% { scale: 1; opacity: 1; }
          50% { scale: 0.88; opacity: 0.8; }
        }

        @keyframes sparkLearningShadowHop {
          0%, 100% { scale: 1; opacity: 1; }
          45% { scale: 0.62; opacity: 0.45; }
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

        @keyframes sparkLearningCreaturePlayfulDodge {
          0%, 100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
          }
          36% {
            opacity: 0.98;
            transform: translate(-63%, -42%) scale(0.96) rotate(-7deg);
          }
          72% {
            opacity: 0.94;
            transform: translate(-43%, -36%) scale(0.92) rotate(5deg);
          }
        }

        @keyframes sparkLearningCreatureShyFlinch {
          0%, 100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
          }
          48% {
            opacity: 0.9;
            transform: translate(-50%, -43%) scale(0.86, 0.94) rotate(3deg);
          }
        }

        @keyframes sparkLearningCreatureBraveResist {
          0%, 100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.02) rotate(0deg);
          }
          50% {
            opacity: 0.96;
            transform: translate(-50%, -47%) scale(1.04) rotate(-1deg);
          }
        }

        @keyframes sparkLearningCreatureSleepyDrowsy {
          0%, 100% {
            opacity: 0.96;
            transform: translate(-50%, -50%) scale(0.98) rotate(-2deg);
          }
          50% {
            opacity: 0.82;
            transform: translate(-50%, -40%) scale(0.92) rotate(4deg);
          }
        }

        @keyframes sparkLearningCreaturePlayfulPeekShrink {
          0% {
            opacity: 1;
            transform: translate(-48%, -34%) scale(0.94) rotate(-8deg);
          }
          42% {
            opacity: 0.9;
            transform: translate(-56%, 2%) scale(0.64) rotate(8deg);
          }
          72% {
            opacity: 0.62;
            transform: translate(-44%, 42%) scale(0.28) rotate(-10deg);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, 76%) scale(0.06) rotate(14deg);
          }
        }

        @keyframes sparkLearningCreatureShyCurlShrink {
          0% {
            opacity: 1;
            transform: translate(-50%, -32%) scale(0.86, 0.94) rotate(3deg);
          }
          46% {
            opacity: 0.84;
            transform: translate(-50%, 8%) scale(0.52, 0.6) rotate(12deg);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, 76%) scale(0.04) rotate(26deg);
          }
        }

        @keyframes sparkLearningCreatureSleepyFloatShrink {
          0% {
            opacity: 0.92;
            transform: translate(-50%, -34%) scale(0.92) rotate(-5deg);
          }
          45% {
            opacity: 0.78;
            transform: translate(-48%, 8%) scale(0.58) rotate(9deg);
          }
          72% {
            opacity: 0.52;
            transform: translate(-52%, 42%) scale(0.3) rotate(-7deg);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, 76%) scale(0.06) rotate(12deg);
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
