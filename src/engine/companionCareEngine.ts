import type {
  BossDrop,
  BossDropTier,
  CoinOffer,
  CoinPurchase,
  NodeChest,
  NodeChestKind,
  CompanionCareAnimationIntent,
  CompanionCareItem,
  CompanionCarePlan,
  CompanionCareState,
  CompanionCareView,
  CompanionFeedResult,
  CompanionPurchaseResult,
  CompanionReadiness,
} from "../shared/companionCareTypes";
import type { TamagotchiState } from "../shared/vrrTypes";
import { REWARD_GAMES } from "../shared/gameRegistry.generated";
import { ARCADE_RULES, CALL_RULES, CHEST_RARITY_ODDS, COMPANION_STORE_ITEMS, CHEST_TABLE, ITEM_SHARE, PRICE_LIST, REWARD_CATALOG, eligibleDrops } from "../shared/rewardCatalog";

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

export { COMPANION_STORE_ITEMS };

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
      purchaseReceipts: [],
      videoCallTickets: [],
      bonusRewardReceipts: [],
    },
    updatedAt: nowIso,
  };
}

export function purchaseCompanionStoreItem(
  plan: CompanionCarePlan,
  itemIdRaw: string,
  requestIdRaw: string,
  nowIso: string,
): CompanionPurchaseResult {
  const itemId = normalizeId(itemIdRaw);
  const requestId = requestIdRaw.trim().slice(0, 160);
  if (!requestId) return { ok: false, reason: "invalid_request", plan };
  const item = COMPANION_STORE_ITEMS.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, reason: "unknown_item", plan };
  const receipts = plan.economy.purchaseReceipts ?? [];
  if (receipts.includes(requestId)) {
    return {
      ok: true,
      plan,
      item,
      balance: Math.max(0, Math.floor(plan.economy.coins)),
      duplicate: true,
    };
  }
  const balance = Math.max(0, Math.floor(Number(plan.economy.coins) || 0));
  if (balance < item.cost) {
    return { ok: false, reason: "insufficient_funds", plan };
  }
  const existing = plan.inventory.food.find((entry) => entry.id === item.id);
  const catalogItem = STARTER_FOOD.find((entry) => entry.id === item.id);
  if (!catalogItem) return { ok: false, reason: "unknown_item", plan };
  const nextFood = existing
    ? plan.inventory.food.map((entry) =>
        entry.id === item.id
          ? { ...entry, quantity: sanitizeQuantity(entry.quantity) + 1 }
          : entry,
      )
    : [...plan.inventory.food, { ...publicFood(catalogItem), quantity: 1 }];
  const nextPlan: CompanionCarePlan = {
    ...plan,
    inventory: { ...plan.inventory, food: nextFood },
    economy: {
      ...plan.economy,
      coins: balance - item.cost,
      purchaseReceipts: [...receipts, requestId].slice(-200),
    },
    updatedAt: nowIso,
  };
  return {
    ok: true,
    plan: nextPlan,
    item,
    balance: nextPlan.economy.coins,
    duplicate: false,
  };
}

export function grantVideoCallTicket(
  plan: CompanionCarePlan,
  homeworkIdRaw: string,
  nowIso: string,
  bonusUrl?: string,
  boardId?: string,
): { plan: CompanionCarePlan; granted: boolean } {
  const homeworkId = homeworkIdRaw.trim();
  if (!homeworkId) return { plan, granted: false };
  const tickets = plan.economy.videoCallTickets ?? [];
  // One ticket per completed board; legacy tickets without a board stay one per list.
  const duplicate = boardId
    ? tickets.some((ticket) => ticket.boardId === boardId)
    : tickets.some((ticket) => ticket.homeworkId === homeworkId);
  if (duplicate) return { plan, granted: false };
  return {
    granted: true,
    plan: {
      ...plan,
      economy: {
        ...plan.economy,
        videoCallTickets: [...tickets, {
          homeworkId,
          ...(boardId ? { boardId } : {}),
          earnedAt: nowIso,
          ...(bonusUrl ? { bonusUrl } : {}),
        }],
      },
      updatedAt: nowIso,
    },
  };
}

export function markVideoCallTicketOpened(
  plan: CompanionCarePlan,
  homeworkIdRaw: string,
  nowIso: string,
): { plan: CompanionCarePlan; ok: boolean; alreadyOpened: boolean } {
  const homeworkId = homeworkIdRaw.trim();
  const tickets = plan.economy.videoCallTickets ?? [];
  const forList = tickets.filter((entry) => entry.homeworkId === homeworkId);
  if (forList.length === 0) return { plan, ok: false, alreadyOpened: false };
  // The newest unopened ticket for this list; when every ticket is already open, this call was already counted.
  const ticket = [...forList].reverse().find((entry) => !entry.openedAt);
  if (!ticket) return { plan, ok: true, alreadyOpened: true };
  return {
    ok: true,
    alreadyOpened: false,
    plan: {
      ...plan,
      economy: {
        ...plan.economy,
        callMinutes: (plan.economy.callMinutes ?? 0) + CALL_RULES.freeMinutesPerBoard,
        videoCallTickets: tickets.map((entry) =>
          entry === ticket ? { ...entry, openedAt: nowIso } : entry,
        ),
      },
      updatedAt: nowIso,
    },
  };
}

export function awardHomeworkBonusCoins(
  plan: CompanionCarePlan,
  input: {
    homeworkId: string;
    completed: boolean;
    independentlyCorrectFreshItems: number;
    freshItemCount: number;
    nowIso: string;
  },
): { plan: CompanionCarePlan; awarded: boolean; amount: number } {
  const homeworkId = input.homeworkId.trim();
  const receipts = plan.economy.bonusRewardReceipts ?? [];
  const prior = receipts.find((entry) => entry.homeworkId === homeworkId);
  if (prior) return { plan, awarded: false, amount: prior.amount };
  if (!homeworkId || !input.completed) return { plan, awarded: false, amount: 0 };
  const total = Math.max(0, Math.floor(Number(input.freshItemCount) || 0));
  const independentlyCorrect = Math.min(
    total,
    Math.max(0, Math.floor(Number(input.independentlyCorrectFreshItems) || 0)),
  );
  const performance = total > 0 ? Math.floor(15 * (independentlyCorrect / total)) : 0;
  const amount = Math.min(25, 10 + performance);
  return {
    awarded: true,
    amount,
    plan: {
      ...plan,
      economy: {
        ...plan.economy,
        coins: Math.max(0, Math.floor(plan.economy.coins)) + amount,
        bonusRewardReceipts: [
          ...receipts,
          { homeworkId, amount, awardedAt: input.nowIso },
        ],
      },
      updatedAt: input.nowIso,
    },
  };
}

/** The approved unlock-ceremony odds (owner, 2026-11-03): 60/25/12/3. Coins are a placeholder until the
 * family economy is designed. A reward follows the learning; it never selects an educational step. */
const BOSS_DROP_TIERS: ReadonlyArray<{ tier: BossDrop["tier"]; below: number; coins: number }> = [
  { tier: "common", below: 0.6, coins: 15 },
  { tier: "rare", below: 0.85, coins: 30 },
  { tier: "epic", below: 0.97, coins: 60 },
  { tier: "legendary", below: Infinity, coins: 120 },
];

export function grantBossDrop(
  plan: CompanionCarePlan,
  input: { homeworkId: string; bossNodeId: string; nowIso: string; roll?: () => number },
): { plan: CompanionCarePlan; granted: boolean; drop: BossDrop } {
  const drops = plan.economy.bossDrops ?? [];
  const prior = drops.find((entry) => entry.bossNodeId === input.bossNodeId);
  if (prior) return { plan, granted: false, drop: { ...prior } };
  const value = (input.roll ?? Math.random)();
  const pick = BOSS_DROP_TIERS.find((row) => value < row.below)!;
  const drop: BossDrop = { homeworkId: input.homeworkId, bossNodeId: input.bossNodeId, tier: pick.tier, coins: pick.coins, droppedAt: input.nowIso };
  return {
    granted: true,
    drop,
    plan: {
      ...plan,
      economy: { ...plan.economy, coins: Math.max(0, Math.floor(plan.economy.coins)) + drop.coins, bossDrops: [...drops, drop] },
      updatedAt: input.nowIso,
    },
  };
}

/** Node chests (owner, 2026-11-06). Coins always; a bonus of call minutes by chance, and each chest without
 * one raises the next chance (pity). Placeholder amounts until the family economy is tuned. A reward
 * follows the learning; it never selects an educational step or touches learning evidence. */
// The chest table lives with the reward catalog, so the roll and the odds she sees come from one place.
const NODE_CHESTS = CHEST_TABLE;
const RARITY_ORDER: readonly BossDropTier[] = ["common", "rare", "epic", "legendary"];
/** A stop's chest kind is a floor: the rolled rarity can only raise it. */
function higherRarity(floor: BossDropTier, rolled: BossDropTier): BossDropTier {
  return RARITY_ORDER.indexOf(rolled) > RARITY_ORDER.indexOf(floor) ? rolled : floor;
}
const PITY_STEP = 0.1;

export function nodeChestKind(node: { role: string }): NodeChestKind {
  if (node.role === "mystery") return "mystery";
  if (node.role === "boss") return "legendary";
  if (node.role === "quest") return "epic";
  if (node.role === "evaluation") return "rare";
  return "common";
}

export function grantNodeChest(
  plan: CompanionCarePlan,
  input: { homeworkId: string; nodeId: string; kind: NodeChestKind; nowIso: string; roll?: () => number },
): { plan: CompanionCarePlan; granted: boolean; chest: NodeChest } {
  const chests = plan.economy.nodeChests ?? [];
  const prior = chests.find((entry) => entry.homeworkId === input.homeworkId && entry.nodeId === input.nodeId);
  if (prior) return { plan, granted: false, chest: { ...prior } };
  const roll = input.roll ?? Math.random;
  const rarityRoll = roll();
  const rarity = input.kind === "mystery"
    ? BOSS_DROP_TIERS.find((row) => rarityRoll < row.below)!.tier
    : higherRarity(input.kind, CHEST_RARITY_ODDS.find((row) => rarityRoll < row.below)!.rarity);
  const table = NODE_CHESTS[rarity];
  const [minCoins, maxCoins] = table.coinRange;
  const coins = Math.min(maxCoins, minCoins + Math.floor(roll() * (maxCoins - minCoins + 1)));
  const misses = plan.economy.chestsSinceBonus ?? 0;
  const bonusChance = Math.min(1, table.bonusChance + PITY_STEP * misses);
  const lucky = roll() < bonusChance;
  // A bonus is a collection item she does not own yet (no rarer than the chest) or call minutes.
  const owned = plan.inventory.rewards ?? [];
  const pool = lucky ? eligibleDrops(rarity, owned) : [];
  const item = pool.length && roll() < ITEM_SHARE ? pool[Math.min(pool.length - 1, Math.floor(roll() * pool.length))] : undefined;
  const bonus: NodeChest["bonus"] = !lucky ? undefined : item ? { kind: "item", itemId: item.id } : { kind: "call_minutes", minutes: table.minutes };
  const chest: NodeChest = {
    homeworkId: input.homeworkId, nodeId: input.nodeId, kind: input.kind, rarity, coins, bonusChance,
    ...(bonus ? { bonus } : {}), droppedAt: input.nowIso,
  };
  return {
    granted: true,
    chest,
    plan: {
      ...plan,
      economy: {
        ...plan.economy,
        coins: Math.max(0, Math.floor(plan.economy.coins)) + chest.coins,
        callMinutes: (plan.economy.callMinutes ?? 0) + (bonus?.kind === "call_minutes" ? bonus.minutes : 0),
        chestsSinceBonus: lucky ? 0 : misses + 1,
        nodeChests: [...chests, chest],
      },
      inventory: { ...plan.inventory, ...(item ? { rewards: [...owned, item.id] } : {}) },
      updatedAt: input.nowIso,
    },
  };
}

/** Buying with coins (owner, 2026-11-07). The care plan's coins are her one balance: a purchase refuses when
 * she is short, never goes below zero, and a repeated receipt id pays once. A reward never touches evidence. */
export type CoinPurchaseResult =
  | { ok: true; plan: CompanionCarePlan; price: number; duplicate: boolean }
  | { ok: false; reason: "not_enough_coins" | "not_owned" | "already_owned" | "unknown_offer"; price?: number; balance?: number };

export function purchaseWithCoins(
  plan: CompanionCarePlan,
  input: { receiptId: string; offer: CoinOffer; nowIso: string },
): CoinPurchaseResult {
  const purchases = plan.economy.coinPurchases ?? [];
  const prior = purchases.find((row) => row.receiptId === input.receiptId);
  if (prior) return { ok: true, plan, price: prior.price, duplicate: true };
  const owned = plan.inventory.rewards ?? [];
  const offer = input.offer;
  const item = offer.kind === "call_minutes" ? undefined : REWARD_CATALOG.find((row) => row.id === offer.itemId);
  let price: number;
  if (offer.kind === "call_minutes") price = PRICE_LIST.callMinutes5;
  else if (offer.kind === "game_play") {
    // The game registry says what a reward game is; the collection only says whether she owns it.
    const gameId = offer.itemId.replace(/^game:/, "");
    if (!Object.prototype.hasOwnProperty.call(REWARD_GAMES, gameId) && item?.kind !== "game") return { ok: false, reason: "unknown_offer" };
    if (!offer.trial && !owned.includes(offer.itemId)) return { ok: false, reason: "not_owned" };
    price = PRICE_LIST.gamePlay;
  } else {
    if (item?.kind !== "outfit" || item.price === undefined) return { ok: false, reason: "unknown_offer" };
    if (owned.includes(item.id)) return { ok: false, reason: "already_owned" };
    price = item.price;
  }
  const balance = Math.max(0, Math.floor(plan.economy.coins));
  if (balance < price) return { ok: false, reason: "not_enough_coins", price, balance };
  const receipt: CoinPurchase = { receiptId: input.receiptId, offer, price, purchasedAt: input.nowIso };
  return {
    ok: true,
    price,
    duplicate: false,
    plan: {
      ...plan,
      economy: {
        ...plan.economy,
        coins: balance - price,
        ...(offer.kind === "call_minutes" ? { callMinutes: (plan.economy.callMinutes ?? 0) + offer.minutes } : {}),
        ...(offer.kind === "game_play"
          ? { arcadeMinutes: Math.max(0, Math.floor(plan.economy.arcadeMinutes ?? 0)) + ARCADE_RULES.minutesPerPlay }
          : {}),
        coinPurchases: [...purchases, receipt],
      },
      inventory: { ...plan.inventory, ...(offer.kind === "outfit" ? { rewards: [...owned, offer.itemId] } : {}) },
      updatedAt: input.nowIso,
    },
  };
}

const CALL_MINUTE_RECEIPTS_KEPT = 200;

/** What a paid minute is spent on: the earned call or a reward game. Both use one meter. */
export type PaidMinuteKind = "call" | "arcade";
type PaidMinuteResult =
  | { ok: true; plan: CompanionCarePlan; minutesLeft: number; duplicate: boolean }
  | { ok: false; reason: "no_minutes" };

const PAID_MINUTE_FIELDS = {
  call: { minutes: "callMinutes", receipts: "callMinuteReceipts" },
  arcade: { minutes: "arcadeMinutes", receipts: "arcadeMinuteReceipts" },
} as const;

/** The paid-minute meter (owner, 2026-11-07, games added 2026-11-08). The server owns the clock: each minute is
 * paid before it is used, a retried tick (same receipt) is charged once, and with no minutes left she must
 * stop or buy more. */
export function spendPaidMinute(
  plan: CompanionCarePlan,
  kind: PaidMinuteKind,
  input: { receiptId: string; nowIso: string },
): PaidMinuteResult {
  const fields = PAID_MINUTE_FIELDS[kind];
  const minutes = Math.max(0, Math.floor(plan.economy[fields.minutes] ?? 0));
  const receipts = plan.economy[fields.receipts] ?? [];
  if (receipts.includes(input.receiptId)) return { ok: true, plan, minutesLeft: minutes, duplicate: true };
  if (minutes < 1) return { ok: false, reason: "no_minutes" };
  return {
    ok: true,
    duplicate: false,
    minutesLeft: minutes - 1,
    plan: {
      ...plan,
      economy: {
        ...plan.economy,
        [fields.minutes]: minutes - 1,
        [fields.receipts]: [...receipts, input.receiptId].slice(-CALL_MINUTE_RECEIPTS_KEPT),
      },
      updatedAt: input.nowIso,
    },
  };
}

/** One minute of the earned call. */
export function spendCallMinute(plan: CompanionCarePlan, input: { receiptId: string; nowIso: string }): PaidMinuteResult {
  return spendPaidMinute(plan, "call", input);
}

/** One minute of a reward game. */
export function spendArcadeMinute(plan: CompanionCarePlan, input: { receiptId: string; nowIso: string }): PaidMinuteResult {
  return spendPaidMinute(plan, "arcade", input);
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
      purchaseReceipts: [...(plan.economy.purchaseReceipts ?? [])],
      videoCallTickets: (plan.economy.videoCallTickets ?? []).map((ticket) => ({ ...ticket })),
      bonusRewardReceipts: (plan.economy.bonusRewardReceipts ?? []).map((receipt) => ({ ...receipt })),
      bossDrops: (plan.economy.bossDrops ?? []).map((drop) => ({ ...drop })),
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
