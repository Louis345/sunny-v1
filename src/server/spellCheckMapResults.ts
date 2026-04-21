import type { ChildQuality } from "../algorithms/types";
import { recordAttempt } from "../engine/learningEngine";

export type SpellCheckMapResultsInput = {
  childId: string;
  wordsCorrect: string[];
  wordsStruggled: string[];
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
    recordAttempt(input.childId, {
      word,
      domain: "spelling",
      correct: true,
      quality: 5 as ChildQuality,
      scaffoldLevel: 0,
    });
    recorded++;
  }
  for (const raw of input.wordsStruggled) {
    const word = raw.toLowerCase().trim();
    if (!word) continue;
    recordAttempt(input.childId, {
      word,
      domain: "spelling",
      correct: false,
      quality: 0 as ChildQuality,
      scaffoldLevel: 0,
    });
    recorded++;
  }
  return { ok: true, recorded };
}
