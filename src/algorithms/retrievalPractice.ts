import type {
  ScaffoldInput,
  ScaffoldRecommendation,
  ScaffoldLevel,
  ChildQuality,
} from "./types";

const SCAFFOLD_TYPES = ["cold", "phonemic_hint", "sound_box", "word_builder", "full_model"] as const;
const CANVAS_MODES = ["none", "none", "sound_box", "spelling", "text"] as const;

export function determineScaffoldLevel(input: ScaffoldInput): ScaffoldRecommendation {
  const { isNewWord, previousAttemptThisSession } = input;

  let level: ScaffoldLevel;

  if (previousAttemptThisSession && !previousAttemptThisSession.correct) {
    level = Math.min(previousAttemptThisSession.scaffoldLevel + 1, 4) as ScaffoldLevel;
  } else if (isNewWord) {
    level = 2;
  } else {
    level = 0;
  }

  const qualityIfCorrect: ChildQuality = level === 0 ? 5 : level === 1 ? 4 : 3;
  const qualityIfIncorrect: ChildQuality = level <= 2 ? 2 : 1;

  return {
    scaffoldLevel: level,
    scaffoldType: SCAFFOLD_TYPES[level],
    canvasMode: CANVAS_MODES[level],
    qualityIfCorrect,
    qualityIfIncorrect,
  };
}

type WordBankInput = {
  words?: Array<{
    word: string;
    tracks?: Record<string, { scaffoldLevel?: number; mastered?: boolean }>;
  }>;
};

/**
 * ChildProfile output field: `retrievalPractice`.
 */
export function retrievalPractice(
  wordBank: WordBankInput,
): { retrievalPractice: { nextScaffoldWords: string[] } } {
  const nextScaffoldWords = (wordBank.words ?? [])
    .filter((entry) =>
      Object.values(entry.tracks ?? {}).some(
        (track) => !track.mastered && (track.scaffoldLevel ?? 0) > 0,
      ),
    )
    .slice(0, 8)
    .map((entry) => entry.word);

  return { retrievalPractice: { nextScaffoldWords } };
}
