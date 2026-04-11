import type { NodeRating } from "../shared/adventureTypes";

const DEFAULT_ATTENTION_MS = 300_000;

/** Theme ids unlocked by adventure level (TASK-004). */
export function computeUnlockedThemes(level: number): string[] {
  const lv = Math.max(1, Math.floor(level));
  const themes = ["default"];
  if (lv >= 5) themes.push("beach");
  if (lv >= 10) themes.push("space");
  return themes;
}

/**
 * Attention window from median completion time of non-abandoned ratings.
 * Empty → default 5 minutes.
 */
export function computeAttentionWindow(ratings: NodeRating[]): number {
  const usable = ratings.filter((r) => !r.abandonedEarly);
  if (usable.length === 0) return DEFAULT_ATTENTION_MS;
  const times = usable.map((r) => r.completionTime_ms).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  if (times.length % 2 === 1) return times[mid];
  return Math.round((times[mid - 1] + times[mid]) / 2);
}
