import type { AnimationName } from "../../../src/shared/companions/companionContract";
import type {
  CompanionCareAnimationIntent,
  CompanionCareView,
} from "../../../src/shared/companionCareTypes";
import type { CompanionEmote } from "../../../src/shared/companionEmotes";
import { deriveCompanionDemeanor } from "../../../src/shared/companionDemeanor";

export type CompanionPresentationState =
  | "steady"
  | "hungry"
  | "tired"
  | "restored"
  | "feeding"
  | "bright"
  | "needs-care"
  | "celebrating";

export interface CompanionBehavior {
  mood: CompanionCareView["moodLabel"];
  presentationState: CompanionPresentationState;
  low: boolean;
  emote: CompanionEmote;
  intensity: number;
  movementIntensity: number;
  visualTreatment: {
    filter: string;
    opacity: number;
  };
  /** Persistent animation to return to after any one-shot care reaction. */
  baseAnimation?: AnimationName;
  baseAnimationLoop?: boolean;
  /** Animation time scale. Kept separate from semantic care state for visual tuning. */
  playbackRate?: number;
  animation?: AnimationName;
  /** Time scale for a one-shot reaction; independent from the persistent idle. */
  animationPlaybackRate?: number;
  animationEventId?: string;
  feedAnimation?: CompanionCareAnimationIntent;
}

export function deriveCompanionBehavior(
  care: CompanionCareView | null | undefined,
  feedAnimation?: CompanionCareAnimationIntent | null,
  animationEventId?: string | null,
): CompanionBehavior {
  if (feedAnimation?.reference === "animation-b") {
    return {
      mood: care?.moodLabel ?? "bright",
      presentationState: "feeding",
      low: false,
      emote: "celebrating",
      intensity: 0.85,
      movementIntensity: 1,
      visualTreatment: { filter: "none", opacity: 1 },
      baseAnimation: "happy_idle",
      baseAnimationLoop: true,
      playbackRate: 1.12,
      animation: "dance_victory",
      animationEventId: animationEventId ?? undefined,
      feedAnimation,
    };
  }

  if (feedAnimation?.reference === "animation-a") {
    return {
      mood: care?.moodLabel ?? "happy",
      presentationState: "feeding",
      low: false,
      emote: "happy",
      intensity: 0.66,
      movementIntensity: 1,
      visualTreatment: { filter: "none", opacity: 1 },
      baseAnimation: "happy_idle",
      baseAnimationLoop: true,
      playbackRate: 1.12,
      animation: "silly_laugh",
      animationEventId: animationEventId ?? undefined,
      feedAnimation,
    };
  }

  const mood = care?.moodLabel ?? "happy";
  const demeanor = deriveCompanionDemeanor(care);
  const readiness = care?.readiness;
  const low =
    readiness?.hungry === true ||
    readiness?.lowEnergy === true ||
    readiness?.lowBond === true ||
    readiness?.lowThoughtClarity === true ||
    readiness?.highEnergyReluctance === true ||
    mood === "hungry" ||
    mood === "tired" ||
    mood === "moody" ||
    mood === "quiet";

  if (demeanor.state === "tired") {
    return {
      mood,
      presentationState: "tired",
      low,
      emote: "thinking",
      intensity: 0.42,
      movementIntensity: 0.35,
      visualTreatment: { filter: "none", opacity: 1 },
      baseAnimation: "sitting",
      baseAnimationLoop: true,
      playbackRate: 0.58,
      animation: "yawn",
      animationPlaybackRate: 2,
    };
  }

  if (demeanor.state === "hungry") {
    return {
      mood,
      presentationState: "hungry",
      low,
      emote: "sad",
      intensity: 0.5,
      movementIntensity: 0.5,
      visualTreatment: { filter: "none", opacity: 1 },
      baseAnimation: "rejected",
      baseAnimationLoop: true,
      playbackRate: 1,
    };
  }

  const restored = demeanor.state === "restored";
  return {
    mood,
    presentationState: restored ? "restored" : "steady",
    low,
    emote: restored ? "excited" : "happy",
    intensity: restored ? 0.5 : 0.32,
    movementIntensity: restored ? 1 : 0.72,
    visualTreatment: { filter: "none", opacity: 1 },
    baseAnimation: restored ? "happy_idle" : "idle",
    baseAnimationLoop: true,
    playbackRate: restored ? 1.12 : 1,
  };
}
