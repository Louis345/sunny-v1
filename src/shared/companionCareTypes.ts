import type { DenCreature } from "./creatureDenRules";
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

export type BossDropTier = "common" | "rare" | "epic" | "legendary";
export interface BossDrop {
  homeworkId: string;
  bossNodeId: string;
  tier: BossDropTier;
  coins: number;
  droppedAt: string;
}

/** The chest after a finished node (owner, 2026-11-06): its colour is its rarity; a mystery chest rolls one. */
export type NodeChestKind = BossDropTier | "mystery";
export interface NodeChest {
  homeworkId: string;
  nodeId: string;
  kind: NodeChestKind;
  rarity: BossDropTier;
  coins: number;
  /** The chance this chest held a bonus, including the pity counter; shown on the chest before it opens. */
  bonusChance: number;
  /** A legacy chest's bonus may be call minutes; new chests drop only items as a bonus. */
  bonus?: { kind: "call_minutes"; minutes: number } | { kind: "item"; itemId: string };
  /** Call time rolled from CALL_TIME_LOOT (2026-11-10); absent on chests saved before. */
  callSeconds?: number;
  droppedAt: string;
}

/** Something bought with coins; a receipt id makes a double tap pay once. */
export type CoinOffer =
  | { kind: "call_minutes"; minutes: 5 }
  | { kind: "game_play"; itemId: string; trial?: boolean }
  | { kind: "outfit"; itemId: string };
export interface CoinPurchase { receiptId: string; offer: CoinOffer; price: number; purchasedAt: string }

/** A creature encounter the server rolled for a Planner-placed stop, waiting for her catch or let-go. */
export interface PendingCreatureEncounter {
  encounterId: string;
  boardId: string;
  stopId: string;
  creatureId: string;
  charges: number;
  isNew: boolean;
  reason: string;
  rolledAt: string;
}

/**
 * Her creatures (owner, 2026-11-08): the den (who she caught, bond, sidekick), what she has seen, how many
 * boards count toward milestones, and the try lockouts. Rewards follow the learning; nothing here is evidence.
 */
export interface CreaturePlanState {
  den: { creatures: DenCreature[]; sidekickId: string | null; lastVisitAt?: string; ranAwayId?: string | null };
  seenIds: string[];
  boardsCompleted: number;
  /** Boards already counted toward milestones (receipts, newest last). */
  countedBoardIds: string[];
  /** Boards that already had their one encounter. */
  encounterBoardIds: string[];
  /** When each drop or seasonal creature was last tried for. */
  lastTryAt: Record<string, string>;
  pending: PendingCreatureEncounter[];
  /** Encounters already caught or let go (receipts, newest last). */
  resolvedEncounterIds: string[];
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
    /** Reward catalog ids she has found in chests (games, outfits). */
    rewards?: string[];
  };
  economy: {
    coins: number;
    storeUnlocks: string[];
    purchaseReceipts?: string[];
    videoCallTickets?: Array<{
      homeworkId: string;
      /** The board this call was earned on; every completed board earns one (owner, 2026-11-07). */
      boardId?: string;
      earnedAt: string;
      openedAt?: string;
      bonusUrl?: string;
    }>;
    bonusRewardReceipts?: Array<{
      homeworkId: string;
      amount: number;
      awardedAt: string;
    }>;
    /** One loot drop per beaten Boss: rolled once, saved, shown again on replay. */
    bossDrops?: BossDrop[];
    /** One chest per finished node: rolled once, saved, never rolled again. */
    nodeChests?: NodeChest[];
    /** Call time in seconds, won from chests (CALL_TIME_LOOT) or bought, spent on calls. */
    callSeconds?: number;
    /** Legacy whole call minutes; read as seconds (callSecondsOf) and migrated to callSeconds on save. */
    callMinutes?: number;
    /** Receipts of call minutes already spent, so a retried tick is charged once. */
    callMinuteReceipts?: string[];
    /** Reward-game minutes bought with game plays, spent one paid minute at a time like the call. */
    arcadeMinutes?: number;
    /** Receipts of arcade minutes already spent, so a retried tick is charged once. */
    arcadeMinuteReceipts?: string[];
    /** Chests opened since the last bonus; each one raises the next bonus chance. */
    chestsSinceBonus?: number;
    /** Everything bought with coins, newest last. */
    coinPurchases?: CoinPurchase[];
  };
  /** Her creatures; absent until her first encounter. */
  creatures?: CreaturePlanState;
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

export interface CompanionStoreItem {
  id: "apple_bite" | "star_candy" | "mystery_snack";
  label: string;
  cost: number;
  rarity: CompanionCareRarity;
}

export type CompanionPurchaseResult =
  | {
      ok: true;
      plan: CompanionCarePlan;
      item: CompanionStoreItem;
      balance: number;
      duplicate: boolean;
    }
  | {
      ok: false;
      reason: "unknown_item" | "insufficient_funds" | "invalid_request";
      plan: CompanionCarePlan;
    };
