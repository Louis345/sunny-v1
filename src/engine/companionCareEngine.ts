import type {
  CompanionCareAnimationIntent,
  CompanionCareItem,
  CompanionCarePlan,
  CompanionCareState,
  CompanionCareView,
  CompanionFeedResult,
  CompanionReadiness,
} from "../shared/companionCareTypes";
import type { TamagotchiState } from "../shared/vrrTypes";

type CareEffect = Partial<
  Pick<
    CompanionCareState,
    "hunger" | "mood" | "bond" | "energy" | "usefulness" | "thoughtClarity"
  >
>;

type StarterFood = CompanionCareItem & { effect: CareEffect };

const STARTER_FOOD: StarterFood[] = [
  {
    id: "apple_bite",
    label: "Apple Bite",
    description: "A crisp snack for quick hunger repair.",
    quantity: 3,
    rarity: "common",
    effect: { hunger: 0.2, mood: 0.05 },
  },
  {
    id: "brain_berry",
    label: "Brain Berry",
    description: "Helps the companion think clearly.",
    quantity: 2,
    rarity: "uncommon",
    effect: { hunger: 0.1, thoughtClarity: 0.2, usefulness: 0.1 },
  },
  {
    id: "cozy_soup",
    label: "Cozy Soup",
    description: "Restores energy after hard work.",
    quantity: 1,
    rarity: "uncommon",
    effect: { hunger: 0.1, mood: 0.12, energy: 0.3 },
  },
  {
    id: "star_candy",
    label: "Star Candy",
    description: "A small celebration treat.",
    quantity: 1,
    rarity: "uncommon",
    effect: { mood: 0.2, bond: 0.05 },
  },
  {
    id: "mystery_snack",
    label: "Mystery Snack",
    description: "A rare earned reward.",
    quantity: 1,
    rarity: "rare",
    effect: {
      hunger: 0.25,
      mood: 0.25,
      bond: 0.08,
      energy: 0.2,
      usefulness: 0.15,
      thoughtClarity: 0.15,
    },
  },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sanitizeQuantity(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function publicFood(item: StarterFood): CompanionCareItem {
  const { effect: _effect, ...rest } = item;
  return { ...rest };
}

function effectForItem(itemId: string): CareEffect {
  return STARTER_FOOD.find((item) => item.id === itemId)?.effect ?? {};
}

function applyEffect(state: CompanionCareState, effect: CareEffect): CompanionCareState {
  return {
    ...state,
    hunger: clamp01(state.hunger + (effect.hunger ?? 0)),
    mood: clamp01(state.mood + (effect.mood ?? 0)),
    bond: clamp01(state.bond + (effect.bond ?? 0)),
    energy: clamp01(state.energy + (effect.energy ?? 0)),
    usefulness: clamp01(state.usefulness + (effect.usefulness ?? 0)),
    thoughtClarity: clamp01(state.thoughtClarity + (effect.thoughtClarity ?? 0)),
  };
}

export function createStarterCompanionCarePlan(opts: {
  childId: string;
  companionId: string;
  nowIso?: string;
  seed?: Partial<TamagotchiState> | null;
  coinBalance?: number;
}): CompanionCarePlan {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const seed = opts.seed ?? {};
  return {
    version: 1,
    childId: normalizeId(opts.childId),
    companionId: normalizeId(opts.companionId),
    state: {
      hunger: clamp01(seed.hunger ?? 0.8),
      mood: clamp01(seed.happiness ?? 0.8),
      bond: clamp01(seed.bond ?? 0.3),
      energy: 0.8,
      usefulness: 0.8,
      thoughtClarity: clamp01(seed.intellect ?? 0.5),
      lastSeenAt: seed.lastSeenAt ?? nowIso,
    },
    memory: {
      firstMetAt: nowIso,
    },
    inventory: {
      food: STARTER_FOOD.map(publicFood),
      careItems: [],
    },
    economy: {
      coins: Math.max(0, Math.floor(Number(opts.coinBalance ?? 0) || 0)),
      storeUnlocks: [],
    },
    updatedAt: nowIso,
  };
}

export function companionCareToTamagotchi(plan: CompanionCarePlan): TamagotchiState {
  return {
    hunger: clamp01(plan.state.hunger),
    happiness: clamp01(plan.state.mood),
    bond: clamp01(plan.state.bond),
    intellect: clamp01(plan.state.thoughtClarity),
    lastSeenAt: plan.state.lastSeenAt,
  };
}

export function getCompanionReadiness(plan: CompanionCarePlan): CompanionReadiness {
  const hungry = plan.state.hunger < 0.3;
  const lowEnergy = plan.state.energy < 0.35;
  const lowBond = plan.state.bond < 0.25;
  const lowThoughtClarity = plan.state.thoughtClarity < 0.35;
  const highEnergyReluctance = hungry || lowEnergy || lowBond;
  const suggestedRepair = hungry
    ? "feed"
    : lowEnergy
      ? "warmup"
      : lowThoughtClarity
        ? "feed"
        : lowBond
          ? "warmup"
          : "continue";
  return {
    hungry,
    lowEnergy,
    lowBond,
    lowThoughtClarity,
    highEnergyReluctance,
    canContinueTired: true,
    suggestedRepair,
  };
}

export function applyCompanionAbsenceDecay(
  plan: CompanionCarePlan,
  nowIso: string,
): {
  plan: CompanionCarePlan;
  reunion: { daysAway: number; previousSeenAt: string | null };
} {
  const previousSeenAt = plan.state.lastSeenAt;
  const previousMs = new Date(previousSeenAt).getTime();
  const nowMs = new Date(nowIso).getTime();
  const daysFloat =
    Number.isFinite(previousMs) && Number.isFinite(nowMs)
      ? Math.max(0, (nowMs - previousMs) / 86_400_000)
      : 0;
  const daysAway = Math.floor(daysFloat);
  const nextState: CompanionCareState = {
    ...plan.state,
    hunger: clamp01(plan.state.hunger - 0.08 * daysFloat),
    mood: clamp01(plan.state.mood - 0.04 * daysFloat),
    energy: clamp01(plan.state.energy - 0.06 * daysFloat),
    usefulness: clamp01(plan.state.usefulness - 0.05 * daysFloat),
    bond:
      daysFloat > 2
        ? clamp01(plan.state.bond - 0.03 * daysFloat)
        : clamp01(plan.state.bond),
    lastSeenAt: nowIso,
  };
  return {
    plan: {
      ...plan,
      state: nextState,
      memory: {
        ...plan.memory,
        ...(daysAway >= 1 ? { previousSeenAt } : {}),
      },
      updatedAt: nowIso,
    },
    reunion: {
      daysAway,
      previousSeenAt: daysAway >= 1 ? previousSeenAt : null,
    },
  };
}

export function applyCompanionFeedItem(
  plan: CompanionCarePlan,
  itemIdRaw: string,
  nowIso: string,
): CompanionFeedResult {
  const itemId = normalizeId(itemIdRaw);
  const found = plan.inventory.food.find((item) => item.id === itemId);
  if (!found) {
    return { ok: false, reason: "missing", plan };
  }
  if (sanitizeQuantity(found.quantity) <= 0) {
    return { ok: false, reason: "depleted", plan };
  }
  const nextFood = plan.inventory.food.map((item) =>
    item.id === itemId
      ? { ...item, quantity: sanitizeQuantity(item.quantity) - 1 }
      : item,
  );
  const nextPlan: CompanionCarePlan = {
    ...plan,
    state: {
      ...applyEffect(plan.state, effectForItem(itemId)),
      lastSeenAt: nowIso,
      lastFedAt: nowIso,
    },
    inventory: {
      ...plan.inventory,
      food: nextFood,
    },
    updatedAt: nowIso,
  };
  const animation: CompanionCareAnimationIntent =
    found.rarity === "rare"
      ? { kind: "rare-reward", reference: "animation-b", itemId }
      : { kind: "normal-feed", reference: "animation-a", itemId };
  return {
    ok: true,
    plan: nextPlan,
    animation,
    tamagotchi: companionCareToTamagotchi(nextPlan),
  };
}

function lastSeenLabel(lastSeenAt: string): string {
  const ms = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ms)) return "recently";
  const days = Math.floor(Math.max(0, (Date.now() - ms) / 86_400_000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function moodLabel(plan: CompanionCarePlan): CompanionCareView["moodLabel"] {
  if (plan.state.hunger < 0.3) return "hungry";
  if (plan.state.energy < 0.35) return "tired";
  if (plan.state.bond < 0.25) return "quiet";
  if (plan.state.mood < 0.35) return "moody";
  if (plan.state.mood >= 0.75) return "bright";
  return "happy";
}

export function companionCareToView(
  plan: CompanionCarePlan,
  displayName: string,
): CompanionCareView {
  return {
    childId: plan.childId,
    companionId: plan.companionId,
    displayName,
    vitals: { ...plan.state },
    economy: {
      coins: plan.economy.coins,
      storeUnlocks: [...plan.economy.storeUnlocks],
    },
    inventory: {
      food: plan.inventory.food.map((item) => ({ ...item })),
      careItems: plan.inventory.careItems.map((item) => ({ ...item })),
    },
    readiness: getCompanionReadiness(plan),
    moodLabel: moodLabel(plan),
    lastSeenLabel: lastSeenLabel(plan.state.lastSeenAt),
  };
}
