export type KaraokeWordClass = "match" | "partial" | "mismatch";

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
  const h = heard.toLowerCase().replace(/[^a-z]/g, "");
  const e = expected.toLowerCase().replace(/[^a-z]/g, "");
  if (h === e) return "match";
  if (e.length <= 4) return "mismatch";
  if (e.startsWith(h) && h.length >= 2) return "partial";
  if (levenshtein1OrLess(h, e)) return "match";
  return "mismatch";
}

/**
 * Karaoke word match: strict for short expected tokens (avoids "Matt" → mat),
 * at most one Levenshtein edit for longer words (STT / kid pronunciation slack).
 */
export function matchKaraokeWord(heard: string, expected: string): boolean {
  return classifyKaraokeWordMatch(heard, expected) === "match";
}
