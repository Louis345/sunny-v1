import type { AnimationName } from "../../../src/shared/companions/companionContract";
import type {
  CompanionCareAnimationIntent,
  CompanionCareView,
} from "../../../src/shared/companionCareTypes";
import type { CompanionEmote } from "../../../src/shared/companionEmotes";

export type CompanionPresentationState =
  | "bright"
  | "steady"
  | "needs-care"
  | "feeding"
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
  animation?: AnimationName;
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
      presentationState: "celebrating",
      low: false,
      emote: "celebrating",
      intensity: 0.85,
      movementIntensity: 1,
      visualTreatment: { filter: "none", opacity: 1 },
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
      movementIntensity: 0.82,
      visualTreatment: { filter: "none", opacity: 1 },
      animation: "silly_laugh",
      animationEventId: animationEventId ?? undefined,
      feedAnimation,
    };
  }

  const mood = care?.moodLabel ?? "happy";
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

  if (mood === "tired") {
    return {
      mood,
      presentationState: "needs-care",
      low,
      emote: "sad",
      intensity: 0.48,
      movementIntensity: 0.45,
      visualTreatment: {
        filter: "saturate(0.78) brightness(0.9)",
        opacity: 0.84,
      },
      animation: "defeated",
    };
  }

  if (mood === "hungry" || mood === "moody" || mood === "quiet") {
    return {
      mood,
      presentationState: "needs-care",
      low,
      emote: "thinking",
      intensity: 0.5,
      movementIntensity: 0.55,
      visualTreatment: {
        filter: "saturate(0.72) brightness(0.92)",
        opacity: 0.88,
      },
      animation: "think",
    };
  }

  return {
    mood,
    presentationState: mood === "bright" ? "bright" : "steady",
    low,
    emote: mood === "bright" ? "excited" : "happy",
    intensity: mood === "bright" ? 0.5 : 0.32,
    movementIntensity: mood === "bright" ? 0.9 : 0.72,
    visualTreatment: { filter: "none", opacity: 1 },
  };
}
