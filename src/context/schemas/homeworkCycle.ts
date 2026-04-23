import crypto from "crypto";

export interface WordAttempt {
  word: string;
  correct: boolean;
  attempts: number;
}

export interface CycleDelta {
  word: string;
  inSystemAccuracy: number; // 0-1
  isolatedAccuracy: number; // 0-1 (from scan)
  accuracyDelta: number; // isolated - inSystem
  isolatedImprovedOverSystem: boolean;
  sm2EasinessFactorBefore: number;
  sm2EasinessFactorAfter: number;
  sm2Growth: number;
}

export interface ScanResult {
  scannedAt: string;
  wordAccuracy: WordAttempt[];
  overallScore: number; // 0-1
  rawExtraction: string; // what Haiku extracted
}

export interface HomeworkCycle {
  homeworkId: string; // deterministic from content
  subject: string;
  wordList: string[];
  ingestedAt: string; // ISO date
  testDate: string | null;

  // Written by Psychologist BEFORE session cycle
  assumptions: string | null; // markdown — what the system predicted

  // Written by Psychologist AFTER scan-back
  postAnalysis: string | null; // markdown — what was wrong, what to adjust

  // Populated when scan arrives
  scanResult: ScanResult | null;

  // Computed after scan-back
  delta: CycleDelta[] | null;
  metrics: {
    accuracyDelta: number; // average across all words
    sm2Growth: number; // average easiness factor change
    independenceRate: number; // % correct in isolation, not drilled
  } | null;
}

export function generateHomeworkId(subject: string, wordList: string[]): string {
  const sorted = [...wordList].map((w) => w.toLowerCase()).sort();
  const hash = crypto.createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 8);
  return `hw-${subject}-${hash}`;
}

export function matchScanToHomework(
  scanWords: string[],
  cycles: HomeworkCycle[],
  threshold = 0.8,
): HomeworkCycle | null {
  const scanSet = new Set(scanWords.map((w) => w.toLowerCase()));
  let best: { cycle: HomeworkCycle; overlap: number } | null = null;
  for (const cycle of cycles) {
    const cycleSet = new Set(cycle.wordList.map((w) => w.toLowerCase()));
    const intersection = [...scanSet].filter((w) => cycleSet.has(w)).length;
    const overlap = intersection / Math.max(cycleSet.size, scanSet.size);
    if (overlap >= threshold && (!best || overlap > best.overlap)) {
      best = { cycle, overlap };
    }
  }
  return best?.cycle ?? null;
}

/** Simple per-word delta from single in-system and isolated attempts. */
export function computeCycleDelta(
  inSystem: Array<{ word: string; correct: boolean }>,
  isolated: Array<{ word: string; correct: boolean }>,
): CycleDelta[] {
  const isolatedMap = new Map(isolated.map((a) => [a.word.toLowerCase(), a.correct]));
  return inSystem.map((a) => {
    const inSystemAccuracy = a.correct ? 1 : 0;
    const isolatedCorrect = isolatedMap.get(a.word.toLowerCase()) ?? false;
    const isolatedAccuracy = isolatedCorrect ? 1 : 0;
    return {
      word: a.word,
      inSystemAccuracy,
      isolatedAccuracy,
      accuracyDelta: isolatedAccuracy - inSystemAccuracy,
      isolatedImprovedOverSystem: isolatedAccuracy > inSystemAccuracy,
      // SM-2 fields — populated by ingestScanResult when it has word bank data
      sm2EasinessFactorBefore: 2.5,
      sm2EasinessFactorAfter: 2.5,
      sm2Growth: 0,
    };
  });
}

/**
 * Fraction of isolated-attempt words that were NOT drilled this week and were answered correctly.
 * Returns null when there are no non-drilled words in the isolated set.
 */
export function computeIndependenceRate(
  isolated: Array<{ word: string; correct: boolean }>,
  drilledThisWeek: string[],
): number | null {
  const drilled = new Set(drilledThisWeek.map((w) => w.toLowerCase()));
  const independent = isolated.filter((a) => !drilled.has(a.word.toLowerCase()));
  if (independent.length === 0) return null;
  const correct = independent.filter((a) => a.correct).length;
  return correct / independent.length;
}
