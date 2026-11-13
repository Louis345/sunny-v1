import type { CompanionCareView } from "./companionCareTypes";

export type CompanionDemeanorState = "steady" | "hungry" | "tired" | "restored";

export interface CompanionDemeanor {
  state: CompanionDemeanorState;
  mayMentionCare: boolean;
  initiative: "responsive_only";
}

export interface CompanionDemeanorVoiceSettings {
  stability: number;
  similarity_boost: number;
  speed: number;
  style: number;
}

const VOICE_SETTINGS: Record<CompanionDemeanorState, CompanionDemeanorVoiceSettings> = {
  steady: { stability: 0.5, similarity_boost: 0.75, speed: 1, style: 0.25 },
  hungry: { stability: 0.5, similarity_boost: 0.75, speed: 0.92, style: 0.1 },
  tired: { stability: 0.5, similarity_boost: 0.75, speed: 0.88, style: 0.05 },
  restored: { stability: 0.5, similarity_boost: 0.75, speed: 1.03, style: 0.35 },
};

export function deriveCompanionDemeanor(
  care: CompanionCareView | null | undefined,
): CompanionDemeanor {
  const state: CompanionDemeanorState =
    care?.readiness?.hungry === true || care?.moodLabel === "hungry"
      ? "hungry"
      : care?.readiness?.lowEnergy === true || care?.moodLabel === "tired"
        ? "tired"
        : care?.moodLabel === "bright"
          ? "restored"
          : "steady";
  return {
    state,
    mayMentionCare: state === "hungry" || state === "tired",
    initiative: "responsive_only",
  };
}

export function voiceSettingsForCompanionDemeanor(
  state: CompanionDemeanorState,
): CompanionDemeanorVoiceSettings {
  return { ...VOICE_SETTINGS[state] };
}
