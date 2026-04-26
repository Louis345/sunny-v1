import { readWordBank, writeWordBank } from "./wordBankIO";

export interface WordRadarWireResultRow {
  item: { display: string };
  correct: boolean;
  responseTime_ms: number;
}

/**
 * Personal bests for Word Radar: `display` (word_bank `word`) → best response time (ms).
 */
export function buildWordRadarPersonalBests(childId: string): Record<string, number> {
  const bank = readWordBank(childId);
  const out: Record<string, number> = {};
  for (const w of bank.words) {
    if (typeof w.wordRadarBestTime_ms === "number" && w.wordRadarBestTime_ms > 0) {
      out[w.word] = w.wordRadarBestTime_ms;
    }
  }
  return out;
}

/** Merge Word Radar session results into `word_bank.json` (best times for correct items). */
export function applyWordRadarResultToWordBank(
  childId: string,
  rawResults: WordRadarWireResultRow[],
): void {
  const bank = readWordBank(childId);
  for (const row of rawResults) {
    if (!row.correct) continue;
    const key = row.item.display.trim().toLowerCase();
    if (!key) continue;
    const entry = bank.words.find(
      (w) => w.word.trim().toLowerCase() === key,
    );
    if (!entry) continue;
    const prev = entry.wordRadarBestTime_ms;
    const next =
      typeof prev === "number" && prev > 0
        ? Math.min(prev, row.responseTime_ms)
        : row.responseTime_ms;
    entry.wordRadarBestTime_ms = next;
  }
  writeWordBank(childId, bank);
}
