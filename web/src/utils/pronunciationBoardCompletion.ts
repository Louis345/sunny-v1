import type { PronunciationCompleteResult } from "../components/PronunciationGameCanvas";

/**
 * The board-stop completion for Echo Canyon (BUGS.md 2026-11-08). Each read word is bound to her item; the
 * game's right/wrong is sent as the game's own report (no attemptedValue), so the server records it as
 * practice with a game_reported confound and never scores it as recall.
 */
export function pronunciationBoardCompletion(
  result: Pick<PronunciationCompleteResult, "accuracy" | "wordsAttempted" | "targetResults">,
  bindings: ReadonlyArray<{ itemId: string; word: string }>,
): { completed: true; accuracy: number; wordsAttempted: number; targetResults: Array<{ target: string; correct: boolean; attempts: number; scaffoldLevel: number }> } {
  const itemFor = (word: string) => {
    const wanted = word.normalize("NFC").trim().toLowerCase();
    const matches = bindings.filter(row => row.word.normalize("NFC").trim().toLowerCase() === wanted);
    return matches.length === 1 ? matches[0]!.itemId : null;
  };
  return {
    completed: true,
    accuracy: result.accuracy > 1 ? result.accuracy / 100 : result.accuracy,
    wordsAttempted: result.wordsAttempted,
    targetResults: result.targetResults.flatMap(row => {
      const target = itemFor(row.target);
      return target ? [{ target, correct: row.correct, attempts: row.attempts, scaffoldLevel: row.scaffoldLevel }] : [];
    }),
  };
}
