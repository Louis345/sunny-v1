import type { NodeRating, NodeType } from "../shared/adventureTypes";

const DEFAULT_ATTENTION_MS = 300_000;

/** Median completion time; if only abandoned rows exist, still use their times (TASK-016). */
export function computeAttentionWindow(ratings: NodeRating[]): number {
  if (ratings.length === 0) return DEFAULT_ATTENTION_MS;
  const nonAb = ratings.filter((r) => !r.abandonedEarly);
  const source = nonAb.length > 0 ? nonAb : ratings;
  const times = source.map((r) => r.completionTime_ms).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  if (times.length % 2 === 1) return times[mid];
  return Math.round((times[mid - 1] + times[mid]) / 2);
}

function difficultyBucketForType(t: NodeType): 1 | 2 | 3 {
  if (t === "riddle") return 1;
  if (t === "boss") return 3;
  return 2;
}

/**
 * Engagement in [0,1] from likes, completion, and mean accuracy (TASK-016).
 */
export function computeEngagementScore(
  ratings: NodeRating[],
  nodeType: NodeType,
): number {
  const scoped = ratings.filter((r) => r.nodeType === nodeType);
  const total = scoped.length;
  if (total === 0) return 0;
  const likes = scoped.filter((r) => r.rating === "like").length;
  const likeRatio = likes / total;
  const completedRatio =
    scoped.filter((r) => !r.abandonedEarly).length / total;
  const accMean =
    scoped.reduce((s, r) => s + Math.min(1, Math.max(0, r.accuracy)), 0) /
    total;
  const raw = likeRatio * completedRatio * accMean;
  return Math.min(1, Math.max(0, raw));
}

export function computeThemeAffinity(
  ratings: NodeRating[],
  theme: string,
): number {
  const scoped = ratings.filter((r) => r.theme === theme);
  if (scoped.length === 0) return 0;
  const scores = scoped.map((r) => (r.rating === "like" ? 1 : 0));
  const avg =
    scores.reduce<number>((sum, v) => sum + v, 0) / scores.length;
  return Math.min(1, Math.max(0, avg));
}

/** Picks difficulty bucket 1|2|3 with highest like-ratio (TASK-016). */
export function computeDifficultySweetSpot(
  ratings: NodeRating[],
): 1 | 2 | 3 {
  const groups: Record<1 | 2 | 3, NodeRating[]> = { 1: [], 2: [], 3: [] };
  for (const r of ratings) {
    groups[difficultyBucketForType(r.nodeType)].push(r);
  }
  let best: 1 | 2 | 3 = 2;
  let bestScore = -1;
  for (const d of [1, 2, 3] as const) {
    const g = groups[d];
    if (g.length === 0) continue;
    const score = g.filter((x) => x.rating === "like").length / g.length;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}
