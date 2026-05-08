import type { WordEntry } from "../algorithms/types";
import type { SessionPlan } from "../engine/learningEngine";

const SEED_DENY = new Set(["seed", "demo"]);

/** Days from `todayIso` until `testDate` (YYYY-MM-DD); 999 when no test. */
export function daysUntilHomeworkTest(testDate: string | null | undefined, todayIso: string): number {
  if (!testDate) return 999;
  const target = new Date(`${testDate}T12:00:00Z`);
  const today = new Date(`${todayIso}T12:00:00Z`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function norm(w: string): string {
  return String(w).trim().toLowerCase();
}

function inWhitelist(w: string, wordList: string[]): boolean {
  const n = norm(w);
  return wordList.some((x) => norm(x) === n);
}

function cleanWordList(ws: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ws) {
    const t = String(raw).trim();
    if (!t || SEED_DENY.has(norm(t))) continue;
    const k = norm(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function entryFor(bank: WordEntry[], w: string): WordEntry | undefined {
  const k = norm(w);
  return bank.find((e) => norm(e.word) === k);
}

function easiness(bank: WordEntry[], w: string): number {
  return entryFor(bank, w)?.tracks?.spelling?.easinessFactor ?? 2.5;
}

function interval(bank: WordEntry[], w: string): number {
  return entryFor(bank, w)?.tracks?.spelling?.interval ?? 0;
}

function repetition(bank: WordEntry[], w: string): number {
  return entryFor(bank, w)?.tracks?.spelling?.repetition ?? 0;
}

function deprioritized(bank: WordEntry[], w: string): boolean {
  return interval(bank, w) > 14 && repetition(bank, w) >= 3;
}

/** SM-2 session queue from plan (spelling / homework spelling path). */
function planDueWords(sm2Plan: SessionPlan): string[] {
  if (sm2Plan.dueWords && sm2Plan.dueWords.length > 0) {
    return [...sm2Plan.dueWords];
  }
  return [...(sm2Plan.newWords ?? []), ...(sm2Plan.reviewWords ?? [])];
}

function uniquePush(out: string[], w: string): void {
  const k = norm(w);
  if (out.some((x) => norm(x) === k)) return;
  out.push(w);
}

/**
 * Ordered homework words for map / ingest nodes. Uses `planSession(..., "spelling")` output only.
 *
 * Priority: missed → plan due queue (whitelist) → reviewWords by easiness ASC → whitelist fallback.
 * Even when `testImminent`, return a short playable burst; the full whitelist
 * stays in pending homework / word bank for later adaptive sessions.
 */
export function selectHomeworkSessionWords(opts: {
  wordList: string[];
  sm2Plan: SessionPlan;
  missedWords: string[];
  testDate: string | null | undefined;
  maxWords: number;
  testImminent: boolean;
  wordBankWords: WordEntry[];
  todayIso: string;
}): string[] {
  void opts.testDate;
  void opts.todayIso;
  const wl = cleanWordList(opts.wordList);
  if (wl.length === 0) return [];

  const bank = opts.wordBankWords;
  const maxNeed = Math.max(1, opts.maxWords);

  const missed = cleanWordList(opts.missedWords).filter((w) => inWhitelist(w, wl));
  const dueFromPlan = cleanWordList(planDueWords(opts.sm2Plan)).filter((w) => inWhitelist(w, wl));
  const reviewSrc = cleanWordList(opts.sm2Plan.reviewWords ?? []).filter((w) => inWhitelist(w, wl));
  const reviewSorted = [...reviewSrc].sort(
    (a, b) => easiness(bank, a) - easiness(bank, b),
  );

  const sm2Pool: string[] = [];
  for (const w of missed) uniquePush(sm2Pool, w);
  for (const w of dueFromPlan) {
    if (!missed.some((m) => norm(m) === norm(w))) uniquePush(sm2Pool, w);
  }
  for (const w of reviewSorted) {
    if (sm2Pool.some((x) => norm(x) === norm(w))) continue;
    uniquePush(sm2Pool, w);
  }

  const sm2Set = new Set(
    [...dueFromPlan, ...(opts.sm2Plan.newWords ?? []), ...reviewSrc].map(norm),
  );
  const notInSm2Session = wl.filter((w) => !sm2Set.has(norm(w)));

  if (opts.testImminent) {
    const primary = [...sm2Pool];
    const rest = wl.filter((w) => !primary.some((x) => norm(x) === norm(w)));
    const byEase = [...rest].sort((a, b) => easiness(bank, a) - easiness(bank, b));
    const low = byEase.filter((w) => !deprioritized(bank, w));
    const tail = byEase.filter((w) => deprioritized(bank, w));
    return [...primary, ...low, ...tail].slice(0, maxNeed);
  }

  if (sm2Pool.length >= maxNeed) {
    const out: string[] = [];
    for (const w of sm2Pool) {
      uniquePush(out, w);
      if (out.length >= maxNeed) break;
    }
    return out;
  }

  const ordered = [...sm2Pool];
  const filler = [...notInSm2Session].sort((a, b) => easiness(bank, a) - easiness(bank, b));
  for (const w of filler) {
    uniquePush(ordered, w);
    if (ordered.length >= maxNeed) break;
  }
  if (ordered.length < maxNeed) {
    for (const w of wl) {
      uniquePush(ordered, w);
      if (ordered.length >= maxNeed) break;
    }
  }
  return ordered.slice(0, maxNeed);
}
