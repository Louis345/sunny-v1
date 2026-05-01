import type { ChildQuality } from "../algorithms/types";
import { recordLearningAttempt } from "./learningAttemptEvents";

export type SpellCheckMapResultsInput = {
  childId: string;
  wordsCorrect: string[];
  wordsStruggled: string[];
  sessionId?: string;
  previewMode?: string | boolean;
};

export function applySpellCheckMapResults(
  input: SpellCheckMapResultsInput,
): { ok: true; recorded: number; skipped?: boolean } {
  const pm = String(input.previewMode ?? "").toLowerCase();
  if (pm === "true" || pm === "free" || pm === "go-live") {
    return { ok: true, recorded: 0, skipped: true };
  }

  let recorded = 0;
  for (const raw of input.wordsCorrect) {
    const word = raw.toLowerCase().trim();
    if (!word) continue;
    recordLearningAttempt({
      childId: input.childId,
      target: word,
      domain: "spelling",
      correct: true,
      quality: 5 as ChildQuality,
      scaffoldLevel: 0,
      sessionId: input.sessionId,
    });
    recorded++;
  }
  for (const raw of input.wordsStruggled) {
    const word = raw.toLowerCase().trim();
    if (!word) continue;
    recordLearningAttempt({
      childId: input.childId,
      target: word,
      domain: "spelling",
      correct: false,
      quality: 0 as ChildQuality,
      scaffoldLevel: 0,
      sessionId: input.sessionId,
    });
    recorded++;
  }
  return { ok: true, recorded };
}
