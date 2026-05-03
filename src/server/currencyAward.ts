import { getChildChart } from "../profiles/childChart";
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
