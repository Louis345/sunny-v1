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

/**
 * Win/loss history for one activity. Counted by code, never by a model — a
 * companion claiming a record the child did not earn is the exact error that
 * breaks the illusion of a friend who remembers.
 */
export interface CompanionGameRecordEntry {
  played: number;
  childWins: number;
  companionWins: number;
  draws: number;
  lastPlayedAt: string;
  /** Positive = child win streak, negative = companion win streak. */
  currentStreak: number;
}

export interface CompanionCareMemory {
  firstMetAt: string;
  previousSeenAt?: string;
  lastSessionSummary?: string;
  lastThingTheyWorkedOn?: string;
  lastEmotionalMoment?: string;
  reunionLineSeed?: string;
  relationshipFacts?: string[];
  favoriteMoments?: string[];
  emotionalTone?: string;
  /** Keyed by activityId. Deterministic; the model may read but never write it. */
  gameRecord?: Record<string, CompanionGameRecordEntry>;
  /** Model-authored narrative about the rivalry, constrained by gameRecord. */
  rivalryNote?: string;
  /** Up to 3 short traits the companion has earned through real interaction. */
  companionSelfNotes?: string[];
  lastCompanionInteractionCompactedAt?: string;
  lastCompanionInteractionId?: string;
  interactionSummaryRevision?: number;
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
