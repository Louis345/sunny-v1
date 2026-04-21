/** Variable reward / tamagotchi — shared server + web. */

export type VRRTier = 1 | 2 | 3;

export type VRRTriggerReason =
  | "random"
  | "sm2_jump"
  | "mastery"
  | "intellect_full"
  | "bond_streak";

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: VRRTier;
  type: "cosmetic" | "capability" | "legendary";
}

/** Engine output — `triggerReason` is analytics-only; never show in child-facing UI. */
export interface VRREvent {
  tier: VRRTier;
  triggerReason: VRRTriggerReason;
  reward: RewardItem;
}

export interface TamagotchiState {
  hunger: number;
  happiness: number;
  bond: number;
  intellect: number;
  lastSeenAt: string;
}

export const DEFAULT_TAMAGOTCHI: TamagotchiState = {
  hunger: 0.8,
  happiness: 0.8,
  bond: 0,
  intellect: 0,
  lastSeenAt: new Date().toISOString(),
};

export type TamagotchiPersonalityState =
  | "overjoyed"
  | "happy"
  | "hungry"
  | "cranky"
  | "sad"
  | "tired"
  | "normal";

export function getTamagotchiPersonality(
  state: TamagotchiState,
  returnedAfterAbsence: boolean,
): TamagotchiPersonalityState {
  if (returnedAfterAbsence) return "sad";
  if (state.bond >= 0.9 && state.happiness >= 0.8) return "overjoyed";
  if (state.hunger < 0.1) return "tired";
  if (state.hunger < 0.2 && state.happiness < 0.4) return "cranky";
  if (state.hunger < 0.3) return "hungry";
  if (state.happiness >= 0.6) return "happy";
  return "normal";
}

export function getTamagotchiSpeechBubble(
  personality: TamagotchiPersonalityState,
): string {
  const bubbles: Record<TamagotchiPersonalityState, string> = {
    overjoyed: "Today feels magical ✨",
    happy: "Let's GO! I'm ready for anything!!",
    hungry: "I'm getting hungry… 🍎",
    cranky: "I need some cheering up.",
    sad: "You were gone so long… I missed you.",
    tired: "I'm so tired I can barely help…",
    normal: "Ready when you are!",
  };
  return bubbles[personality];
}
