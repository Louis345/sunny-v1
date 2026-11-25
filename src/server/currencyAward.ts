import { getChildChart } from "../profiles/childChart";
import { callSecondsOf, purchaseWithCoins, spendPaidMinute, type PaidMinuteKind } from "../engine/companionCareEngine";
import { ARCADE_RULES, CALL_RULES, PRICE_LIST, REWARD_CATALOG } from "../shared/rewardCatalog";
import type { CoinOffer, CompanionWearing } from "../shared/companionCareTypes";
import {
  loadCompanionCarePlanForChart,
  mirrorCompanionCareToLearningProfile,
  saveCompanionCarePlan,
} from "../profiles/companionCarePlan";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";

export type ReconcileCompanionCurrencyResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "invalid_amount" | "no_profile" };

/**
 * Apply a game-reported currency delta to the child's learning profile.
 * Positive amount = earn, negative = spend. Balance is floored at 0.
 * When dryRun is true, computes the next balance but does not persist.
 */
export function reconcileCompanionCurrencyAward(opts: {
  childId: string;
  amount: unknown;
  dryRun: boolean;
  reason?: string;
}): ReconcileCompanionCurrencyResult {
  const raw = opts.amount;
  const amt = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amt)) {
    return { ok: false, reason: "invalid_amount" };
  }
  const lp = readLearningProfile(opts.childId);
  if (!lp) {
    return { ok: false, reason: "no_profile" };
  }
  const currentRaw = lp.companionCurrency ?? 0;
  const current = Math.max(0, Math.floor(Number(currentRaw) || 0));
  const next = Math.max(0, Math.floor(current + amt));
  if (!opts.dryRun) {
    const nextLp: LearningProfile = { ...lp, companionCurrency: next };
    writeLearningProfile(opts.childId, nextLp);
    if (process.env.VITEST !== "true") {
      syncCarePlanBalanceFromLegacy(opts.childId, next, opts.reason ?? "award");
    }
  }
  return { ok: true, balance: next };
}

function syncCarePlanBalanceFromLegacy(
  childId: string,
  balance: number,
  reason: string,
): void {
  try {
    const chart = getChildChart(childId);
    const loaded = loadCompanionCarePlanForChart(chart);
    const nextPlan = {
      ...loaded.plan,
      economy: {
        ...loaded.plan.economy,
        coins: balance,
      },
      updatedAt: new Date().toISOString(),
    };
    saveCompanionCarePlan(chart, nextPlan);
    console.log(
      `  🎮 [companion-care] currency_mirror balance=${balance} reason=${reason}`,
    );
  } catch {
    // Legacy profile currency remains the compatibility source for older callers.
  }
}

export function reconcileCompanionCareCurrencyAward(opts: {
  childId: string;
  amount: unknown;
  dryRun: boolean;
  rootDir?: string;
  reason?: string;
}): ReconcileCompanionCurrencyResult {
  const raw = opts.amount;
  const amt = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amt)) {
    return { ok: false, reason: "invalid_amount" };
  }
  let chart: ReturnType<typeof getChildChart>;
  try {
    chart = getChildChart(opts.childId, { rootDir: opts.rootDir });
  } catch {
    return { ok: false, reason: "no_profile" };
  }
  const loaded = loadCompanionCarePlanForChart(chart);
  const current = Math.max(0, Math.floor(Number(loaded.plan.economy.coins) || 0));
  const next = Math.max(0, Math.floor(current + amt));
  if (!opts.dryRun) {
    const nextPlan = {
      ...loaded.plan,
      economy: {
        ...loaded.plan.economy,
        coins: next,
      },
      updatedAt: new Date().toISOString(),
    };
    saveCompanionCarePlan(chart, nextPlan);
    mirrorCompanionCareToLearningProfile(chart, nextPlan);
    console.log(
      `  🎮 [companion-care] currency ${current} -> ${next} reason=${opts.reason ?? "award"}`,
    );
  }
  return { ok: true, balance: next };
}

export type PurchaseForChildResult =
  | { ok: true; balance: number; price: number; duplicate: boolean; callMinutes: number; callSeconds: number; arcadeMinutes: number }
  | { ok: false; reason: string; price?: number; balance?: number };

/** Buy with coins (PR #59, 4.4): charged to the companion plan, mirrored to the profile, a receipt per tap. */
export function purchaseForChild(
  childId: string,
  input: { receiptId: string; offer: CoinOffer },
  opts: { rootDir?: string; nowIso?: string } = {},
): PurchaseForChildResult {
  const chart = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {});
  const result = purchaseWithCoins(chart.companionCare.plan, { ...input, nowIso: opts.nowIso ?? new Date().toISOString() });
  if (!result.ok) {
    console.log(` 🎮 [rewards] [purchase] [refused] child=${childId} offer=${input.offer.kind} reason=${result.reason} price=${result.price ?? "n/a"} balance=${result.balance ?? "n/a"}`);
    return result;
  }
  if (!result.duplicate) {
    saveCompanionCarePlan(chart, result.plan);
    mirrorCompanionCareToLearningProfile(chart, result.plan);
  }
  console.log(` 🎮 [rewards] [purchase] [${result.duplicate ? "repeated" : "paid"}] child=${childId} offer=${input.offer.kind} price=${result.price} balance=${result.plan.economy.coins}`);
  return { ok: true, balance: result.plan.economy.coins, price: result.price, duplicate: result.duplicate, callMinutes: Math.floor(callSecondsOf(result.plan.economy) / 60), callSeconds: callSecondsOf(result.plan.economy), arcadeMinutes: result.plan.economy.arcadeMinutes ?? 0 };
}

/** The outfit shop's wallet: her saved coins, the rewards she owns, and what each companion is wearing. */
export function walletForChild(childId: string, opts: { rootDir?: string } = {}): { coins: number; ownedRewardIds: string[]; wearing: Record<string, CompanionWearing> } {
  const plan = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {}).companionCare.plan;
  return { coins: plan.economy.coins, ownedRewardIds: [...(plan.inventory.rewards ?? [])], wearing: { ...(plan.inventory.wearing ?? {}) } };
}

/**
 * Saves what she put on one companion (owner, 2026-11-25: her clothes follow her companion everywhere). Her chart is
 * the one source every room reads; only the closet calls this. No item ids means her own clothes, saved on purpose.
 */
export function setWearingForChild(
  childId: string,
  input: { companionId: string; outfitItemId?: string; accessoryItemId?: string },
  opts: { rootDir?: string; nowIso?: string } = {},
): { ok: true } | { ok: false; reason: "not_owned" } {
  const chart = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {});
  const plan = chart.companionCare.plan;
  const ownedRewards = plan.inventory.rewards ?? [];
  const owns = (itemId: string) => REWARD_CATALOG.some(item => item.wardrobeItemId === itemId && ownedRewards.includes(item.id));
  const items = [input.outfitItemId, input.accessoryItemId].filter((id): id is string => Boolean(id));
  const missing = items.find(id => !owns(id));
  if (missing) {
    console.warn(` 🎮 [wardrobe] [wearing] [refused] child=${childId} companion=${input.companionId} item=${missing} reason=not_owned`);
    return { ok: false, reason: "not_owned" };
  }
  const entry: CompanionWearing = {
    ...(input.outfitItemId ? { outfitItemId: input.outfitItemId } : {}),
    ...(input.accessoryItemId ? { accessoryItemId: input.accessoryItemId } : {}),
    changedAt: opts.nowIso ?? new Date().toISOString(),
  };
  saveCompanionCarePlan(chart, { ...plan, inventory: { ...plan.inventory, wearing: { ...(plan.inventory.wearing ?? {}), [input.companionId]: entry } } });
  console.log(` 🎮 [wardrobe] [wearing] [saved] child=${childId} companion=${input.companionId} outfit=${entry.outfitItemId ?? "own"} accessory=${entry.accessoryItemId ?? "none"}`);
  return { ok: true };
}

/** When the child last chose this companion's look, so the companion can say so from fact (S10); undefined if never. */
export function lookChosenAt(childId: string, companionId: string, opts: { rootDir?: string } = {}): string | undefined {
  try {
    return walletForChild(childId, opts).wearing[companionId]?.changedAt;
  } catch (error: unknown) {
    console.warn(` 🎮 [wardrobe] [wearing] [chosen-at-unavailable] child=${childId} companion=${companionId}`, error);
    return undefined;
  }
}

export type CallClock = { minutesLeft: number; secondsLeft: number; coins: number; price: number; minutes: number; warnAtSecondsLeft: number };
type PaidTimeSpend = { ok: true; minutesLeft: number; secondsLeft: number; secondsGranted: number; coins: number } | { ok: false; reason: "no_minutes"; coins: number };

/** What the call screen needs: saved call time (in seconds), her coins, and what 5 more minutes cost. */
export function callClockForChild(childId: string, opts: { rootDir?: string } = {}): CallClock {
  const plan = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {}).companionCare.plan;
  const secondsLeft = callSecondsOf(plan.economy);
  return { minutesLeft: Math.floor(secondsLeft / 60), secondsLeft, coins: plan.economy.coins, price: PRICE_LIST.callMinutes5, minutes: 5, warnAtSecondsLeft: CALL_RULES.warnAtSecondsLeft };
}

/** Pay one call minute before it is used; a retried tick with the same receipt is charged once. */
export function spendCallMinuteForChild(
  childId: string,
  receiptId: string,
  opts: { rootDir?: string; nowIso?: string } = {},
): PaidTimeSpend {
  return spendPaidMinuteForChild("call", childId, receiptId, opts);
}

/** What a reward game's clock needs: saved arcade minutes, her coins, and what one more play costs. */
export function arcadeClockForChild(childId: string, opts: { rootDir?: string } = {}): CallClock {
  const plan = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {}).companionCare.plan;
  const minutesLeft = Math.max(0, Math.floor(plan.economy.arcadeMinutes ?? 0));
  return {
    minutesLeft,
    secondsLeft: minutesLeft * 60,
    coins: plan.economy.coins,
    price: PRICE_LIST.gamePlay,
    minutes: ARCADE_RULES.minutesPerPlay,
    warnAtSecondsLeft: ARCADE_RULES.warnAtSecondsLeft,
  };
}

function spendPaidMinuteForChild(
  kind: PaidMinuteKind,
  childId: string,
  receiptId: string,
  opts: { rootDir?: string; nowIso?: string },
): PaidTimeSpend {
  const chart = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {});
  const result = spendPaidMinute(chart.companionCare.plan, kind, { receiptId, nowIso: opts.nowIso ?? new Date().toISOString() });
  if (!result.ok) {
    console.log(` 🎮 [rewards] [${kind}-minute] [out] child=${childId} coins=${chart.companionCare.plan.economy.coins}`);
    return { ok: false, reason: result.reason, coins: chart.companionCare.plan.economy.coins };
  }
  if (!result.duplicate) {
    saveCompanionCarePlan(chart, result.plan);
    mirrorCompanionCareToLearningProfile(chart, result.plan);
  }
  console.log(` 🎮 [rewards] [${kind}-minute] [${result.duplicate ? "repeated" : "spent"}] child=${childId} granted=${result.secondsGranted}s left=${result.secondsLeft}s`);
  return { ok: true, minutesLeft: result.minutesLeft, secondsLeft: result.secondsLeft, secondsGranted: result.secondsGranted, coins: result.plan.economy.coins };
}

/** Pay one reward-game minute before it is used; a retried tick with the same receipt is charged once. */
export function spendArcadeMinuteForChild(
  childId: string,
  receiptId: string,
  opts: { rootDir?: string; nowIso?: string } = {},
): PaidTimeSpend {
  return spendPaidMinuteForChild("arcade", childId, receiptId, opts);
}

/** Clock facts for Elli's reaction, read from the saved plan, never from the screen. */
export function showroomCallClockFacts(
  childId: string,
  event: "minute_left" | "time_up" | "minutes_bought",
  opts: { rootDir?: string } = {},
): { event: typeof event; minutesLeft: number; secondsLeft: number; coins: number; price: number; minutes: number } | undefined {
  try {
    const clock = callClockForChild(childId, opts);
    return { event, minutesLeft: clock.minutesLeft, secondsLeft: clock.secondsLeft, coins: clock.coins, price: clock.price, minutes: clock.minutes };
  } catch (error) {
    console.error(` 🎮 [rewards] [call-clock-facts] [failed] child=${childId}`, error);
    return undefined;
  }
}
