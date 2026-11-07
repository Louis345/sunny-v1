import { getChildChart } from "../profiles/childChart";
import { purchaseWithCoins, spendCallMinute } from "../engine/companionCareEngine";
import { CALL_RULES, PRICE_LIST } from "../shared/rewardCatalog";
import type { CoinOffer } from "../shared/companionCareTypes";
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
  | { ok: true; balance: number; price: number; duplicate: boolean; callMinutes: number }
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
  return { ok: true, balance: result.plan.economy.coins, price: result.price, duplicate: result.duplicate, callMinutes: result.plan.economy.callMinutes ?? 0 };
}

/** The outfit shop's wallet: her saved coins and the rewards she owns (chest drops and purchases). */
export function walletForChild(childId: string, opts: { rootDir?: string } = {}): { coins: number; ownedRewardIds: string[] } {
  const plan = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {}).companionCare.plan;
  return { coins: plan.economy.coins, ownedRewardIds: [...(plan.inventory.rewards ?? [])] };
}

export type CallClock = { minutesLeft: number; coins: number; price: number; minutes: number; warnAtSecondsLeft: number };

/** What the call screen needs: saved minutes, her coins, and what 5 more minutes cost. */
export function callClockForChild(childId: string, opts: { rootDir?: string } = {}): CallClock {
  const plan = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {}).companionCare.plan;
  return { minutesLeft: Math.max(0, Math.floor(plan.economy.callMinutes ?? 0)), coins: plan.economy.coins, price: PRICE_LIST.callMinutes5, minutes: 5, warnAtSecondsLeft: CALL_RULES.warnAtSecondsLeft };
}

/** Pay one call minute before it is used; a retried tick with the same receipt is charged once. */
export function spendCallMinuteForChild(
  childId: string,
  receiptId: string,
  opts: { rootDir?: string; nowIso?: string } = {},
): { ok: true; minutesLeft: number; coins: number } | { ok: false; reason: "no_minutes"; coins: number } {
  const chart = getChildChart(childId, opts.rootDir ? { rootDir: opts.rootDir } : {});
  const result = spendCallMinute(chart.companionCare.plan, { receiptId, nowIso: opts.nowIso ?? new Date().toISOString() });
  if (!result.ok) {
    console.log(` 🎮 [rewards] [call-minute] [out] child=${childId} coins=${chart.companionCare.plan.economy.coins}`);
    return { ok: false, reason: result.reason, coins: chart.companionCare.plan.economy.coins };
  }
  if (!result.duplicate) {
    saveCompanionCarePlan(chart, result.plan);
    mirrorCompanionCareToLearningProfile(chart, result.plan);
  }
  console.log(` 🎮 [rewards] [call-minute] [${result.duplicate ? "repeated" : "spent"}] child=${childId} left=${result.minutesLeft}`);
  return { ok: true, minutesLeft: result.minutesLeft, coins: result.plan.economy.coins };
}

/** Clock facts for Elli's reaction, read from the saved plan, never from the screen. */
export function showroomCallClockFacts(
  childId: string,
  event: "minute_left" | "time_up" | "minutes_bought",
  opts: { rootDir?: string } = {},
): { event: typeof event; minutesLeft: number; coins: number; price: number; minutes: number } | undefined {
  try {
    const clock = callClockForChild(childId, opts);
    return { event, minutesLeft: clock.minutesLeft, coins: clock.coins, price: clock.price, minutes: clock.minutes };
  } catch (error) {
    console.error(` 🎮 [rewards] [call-clock-facts] [failed] child=${childId}`, error);
    return undefined;
  }
}
