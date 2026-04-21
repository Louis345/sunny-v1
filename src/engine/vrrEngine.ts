import type {
  RewardItem,
  TamagotchiState,
  VRREvent,
  VRRTriggerReason,
  VRRTier,
} from "../shared/vrrTypes";

export interface VRRSessionResult {
  easinessDelta?: number;
  masteryGateCrossed?: boolean;
}

export interface ProfileWithTamagotchi {
  tamagotchi?: TamagotchiState | null;
}

export type EvaluateVRRDeps = {
  /** Override Math.random for deterministic tests */
  random?: () => number;
};

// REWARD POOL — one per tier
const REWARD_POOL: Record<VRRTier, RewardItem[]> = {
  1: [
    {
      id: "hat_wizard",
      name: "Wizard Hat",
      description: "Your companion is now a wizard!",
      icon: "🧙",
      tier: 1,
      type: "cosmetic",
    },
    {
      id: "hat_crown",
      name: "Golden Crown",
      description: "A crown fit for a champion!",
      icon: "👑",
      tier: 1,
      type: "cosmetic",
    },
    {
      id: "sparkle_halo",
      name: "Sparkle Halo",
      description: "Your companion glows!",
      icon: "✨",
      tier: 1,
      type: "cosmetic",
    },
  ],
  2: [
    {
      id: "double_xp",
      name: "Double XP",
      description: "Double XP for your next 3 sessions!",
      icon: "⚡",
      tier: 2,
      type: "capability",
    },
    {
      id: "new_dopamine_game",
      name: "New Game Unlocked",
      description: "A new game is waiting for you!",
      icon: "🎮",
      tier: 2,
      type: "capability",
    },
  ],
  3: [
    {
      id: "saori_mode",
      name: "Saori Mode",
      description: "Your companion speaks Japanese today!",
      icon: "🌸",
      tier: 3,
      type: "legendary",
    },
    {
      id: "secret_chapter",
      name: "Secret Chapter",
      description: "A hidden story has been unlocked!",
      icon: "📖",
      tier: 3,
      type: "legendary",
    },
  ],
};

function pickReward(tier: VRRTier, random: () => number): RewardItem {
  const pool = REWARD_POOL[tier];
  return pool[Math.floor(random() * pool.length)]!;
}

/**
 * Pure function: no I/O. At most one reward per session when `seenThisSession` is false.
 */
export function evaluateVRR(
  sessionResult: VRRSessionResult,
  profile: ProfileWithTamagotchi,
  seenThisSession: boolean,
  deps?: EvaluateVRRDeps,
): VRREvent | null {
  if (seenThisSession) return null;

  const rand = deps?.random ?? Math.random;
  const candidates: Array<{ tier: VRRTier; reason: VRRTriggerReason }> = [];

  const roll = rand();
  if (roll < 0.002) candidates.push({ tier: 3, reason: "random" });
  else if (roll < 0.01) candidates.push({ tier: 2, reason: "random" });
  else if (roll < 0.05) candidates.push({ tier: 1, reason: "random" });

  const delta = sessionResult.easinessDelta ?? 0;
  if (delta > 0.3) {
    const r2 = rand();
    if (r2 < 0.15) candidates.push({ tier: 3, reason: "sm2_jump" });
    else if (r2 < 0.4) candidates.push({ tier: 2, reason: "sm2_jump" });
    else candidates.push({ tier: 1, reason: "sm2_jump" });
  }

  if (sessionResult.masteryGateCrossed) {
    candidates.push({ tier: 1, reason: "mastery" });
  }

  if ((profile.tamagotchi?.intellect ?? 0) >= 1.0) {
    candidates.push({ tier: 3, reason: "intellect_full" });
  }

  if ((profile.tamagotchi?.bond ?? 0) >= 1.0) {
    candidates.push({ tier: 2, reason: "bond_streak" });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.tier - a.tier);
  const winner = candidates[0]!;

  return {
    tier: winner.tier,
    triggerReason: winner.reason,
    reward: pickReward(winner.tier, rand),
  };
}

/** Optional `nowMs` for tests; defaults to `Date.now()`. */
export function applyPassiveDepletion(
  state: TamagotchiState,
  nowMs: number = Date.now(),
): TamagotchiState {
  const daysSince =
    (nowMs - new Date(state.lastSeenAt).getTime()) / 86400000;

  return {
    ...state,
    hunger: Math.max(0, state.hunger - 0.08 * daysSince),
    happiness: Math.max(0, state.happiness - 0.05 * daysSince),
    bond:
      daysSince > 2
        ? Math.max(0, state.bond - 0.3)
        : state.bond,
    lastSeenAt: new Date(nowMs).toISOString(),
  };
}

export type TamagotchiFillEvent =
  | "node_complete"
  | "correct_answer"
  | "session_started"
  | "sm2_quality_4"
  | "sm2_quality_5";

export function fillTamagotchiFromEvent(
  state: TamagotchiState,
  event: TamagotchiFillEvent,
): TamagotchiState {
  const fills: Record<TamagotchiFillEvent, Partial<TamagotchiState>> = {
    node_complete: { hunger: state.hunger + 0.06 },
    correct_answer: { happiness: state.happiness + 0.02 },
    session_started: { bond: state.bond + 0.05 },
    sm2_quality_4: { intellect: state.intellect + 0.03 },
    sm2_quality_5: { intellect: state.intellect + 0.08 },
  };
  const delta = fills[event];
  return {
    ...state,
    hunger: Math.min(1, delta.hunger ?? state.hunger),
    happiness: Math.min(1, delta.happiness ?? state.happiness),
    bond: Math.min(1, delta.bond ?? state.bond),
    intellect: Math.min(1, delta.intellect ?? state.intellect),
  };
}

/** Internal: VRR claim boost (separate from game-event fills). */
export type TamagotchiInternalFillKind = TamagotchiFillEvent | "vrr_reward_claim";

export function applyTamagotchiFill(
  state: TamagotchiState,
  kind: TamagotchiInternalFillKind,
): TamagotchiState {
  if (kind === "vrr_reward_claim") {
    const next = { ...state };
    next.happiness = Math.min(1, next.happiness + 0.12);
    next.bond = Math.min(1, next.bond + 0.04);
    return next;
  }
  return fillTamagotchiFromEvent(state, kind);
}
