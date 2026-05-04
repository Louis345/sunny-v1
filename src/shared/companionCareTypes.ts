import type { TamagotchiState } from "./vrrTypes";

export type CompanionCareRarity = "common" | "uncommon" | "rare";

export type CompanionCareSuggestedRepair = "feed" | "warmup" | "rest" | "continue";

export interface CompanionCareItem {
  id: string;
  label: string;
  description: string;
  quantity: number;
  rarity: CompanionCareRarity;
}

export interface CompanionCareState {
  hunger: number;
  mood: number;
  bond: number;
  energy: number;
  usefulness: number;
  thoughtClarity: number;
  lastSeenAt: string;
  lastFedAt?: string;
}

export interface CompanionCareMemory {
  firstMetAt: string;
  previousSeenAt?: string;
  lastSessionSummary?: string;
  lastThingTheyWorkedOn?: string;
  lastEmotionalMoment?: string;
  reunionLineSeed?: string;
}

export interface CompanionCarePlan {
  version: 1;
  childId: string;
  companionId: string;
  state: CompanionCareState;
  memory: CompanionCareMemory;
  inventory: {
    food: CompanionCareItem[];
    careItems: CompanionCareItem[];
  };
  economy: {
    coins: number;
    storeUnlocks: string[];
  };
  updatedAt: string;
}

export interface CompanionReadiness {
  hungry: boolean;
  lowEnergy: boolean;
  lowBond: boolean;
  lowThoughtClarity: boolean;
  highEnergyReluctance: boolean;
  canContinueTired: boolean;
  suggestedRepair: CompanionCareSuggestedRepair;
}

export interface CompanionCareView {
  childId: string;
  companionId: string;
  displayName: string;
  vitals: CompanionCareState;
  economy: CompanionCarePlan["economy"];
  inventory: CompanionCarePlan["inventory"];
  readiness: CompanionReadiness;
  moodLabel: "bright" | "happy" | "hungry" | "tired" | "moody" | "quiet";
  lastSeenLabel: string;
}

export interface CompanionCareAnimationIntent {
  kind: "normal-feed" | "rare-reward";
  reference: "animation-a" | "animation-b";
  itemId: string;
}

export type CompanionFeedResult =
  | {
      ok: true;
      plan: CompanionCarePlan;
      animation: CompanionCareAnimationIntent;
      tamagotchi: TamagotchiState;
    }
  | {
      ok: false;
      reason: "missing" | "depleted";
      plan: CompanionCarePlan;
    };
