import { normalizeNumberWord } from "./numberWords";

export type KaraokeWordClass = "match" | "partial" | "mismatch";

/** Dyslexia-friendly confusions — paired letters fold to one canonical form. */
export const CONFUSION_PAIRS: [string, string][] = [
  ["m", "n"],
  ["b", "d"],
  ["p", "q"],
  ["f", "v"],
  ["s", "z"],
  ["w", "v"],
];

/** Normalize confusable letters to canonical form (m→n, b→d, …). */
export function applyConfusionPairs(word: string): string {
  return word
    .replace(/m/g, "n")
    .replace(/b/g, "d")
    .replace(/p/g, "q")
    .replace(/f/g, "v")
    .replace(/s/g, "z")
    .replace(/w/g, "v");
}

function levenshtein1OrLess(a: string, b: string): boolean {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return false;
  if (m === 0 || n === 0) return m + n <= 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    if (Math.min(...cur) > 1) return false;
    prev = cur;
  }
  return prev[n] <= 1;
}

/**
 * Tri-state karaoke match for STT streaming:
 * - match: advance karaoke index
 * - partial: expected still being spoken (prefix), do not penalize
 * - mismatch: genuine wrong token; hesitation may apply on phrase restart
 */
export function classifyKaraokeWordMatch(
  heard: string,
  expected: string,
): KaraokeWordClass {
  // Step 1: clean
  const cleanH = heard.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanE = expected.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Step 2: normalize numbers (word → digit)
  const normH = normalizeNumberWord(cleanH);
  const normE = normalizeNumberWord(cleanE);

  // Step 3: exact match after normalization
  if (normH === normE) return "match";

  // Step 4: confusion pairs (dyslexia — only for pure alpha words)
  if (/^[a-z]+$/.test(normH) && /^[a-z]+$/.test(normE)) {
    if (applyConfusionPairs(normH) === applyConfusionPairs(normE)) {
      return "match";
    }
  }

  // Streaming prefix: letter-only tokens still forming the expected word (e.g. tw → twelve).
  // Runs before short-token cutoff so partial is not blocked when normE is a short digit string.
  if (
    /^[a-z]+$/.test(cleanH) &&
    /^[a-z]+$/.test(cleanE) &&
    cleanH !== cleanE &&
    cleanE.length > 4 &&
    cleanE.startsWith(cleanH) &&
    cleanH.length >= 2
  ) {
    return "partial";
  }

  // Step 5: short expected token — no fuzzy/prefix beyond steps above
  if (normE.length <= 4) return "mismatch";

  // Step 6: at most one edit for longer tokens (STT / pronunciation slack)
  if (levenshtein1OrLess(normH, normE)) return "match";

  return "mismatch";
}

/**
 * Karaoke word match: strict for short expected tokens (avoids "Matt" → mat),
 * at most one Levenshtein edit for longer words (STT / kid pronunciation slack).
 */
export function matchKaraokeWord(heard: string, expected: string): boolean {
  return classifyKaraokeWordMatch(heard, expected) === "match";
}
