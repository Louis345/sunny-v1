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
  }
  return { ok: true, balance: next };
}
