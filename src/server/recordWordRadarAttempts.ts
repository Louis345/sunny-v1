import type { WordRadarWireResultRow } from "../utils/wordRadarProfile";
import { recordLearningAttempt } from "./learningAttemptEvents";

/**
 * Record one learning attempt per word-radar result row.
 * Called after word_radar_complete merges word_bank, so the attempt log
 * also gets entries (and the error classifier has data to work with).
 */
export function recordWordRadarAttempts(
  childId: string,
  rows: WordRadarWireResultRow[],
  sessionId?: string,
): void {
  for (const row of rows) {
    const word = row.item.display.toLowerCase().trim();
    if (!word) continue;
    try {
      recordLearningAttempt({
        childId,
        target: word,
        domain: "spelling",
        correct: row.correct,
        quality: row.correct ? 5 : 1,
        scaffoldLevel: 0,
        responseTimeMs: row.responseTime_ms > 0 ? row.responseTime_ms : undefined,
        sessionId,
      });
    } catch (err) {
      console.error(`  🔴 [word_radar] recordAttempt failed for "${word}":`, err);
    }
  }
}
