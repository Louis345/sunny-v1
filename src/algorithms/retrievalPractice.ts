import type {
  ScaffoldInput,
  ScaffoldRecommendation,
  ScaffoldLevel,
  ChildQuality,
} from "./types";

const SCAFFOLD_TYPES = ["cold", "phonemic_hint", "sound_box", "word_builder", "full_model"] as const;
const CANVAS_MODES = ["none", "none", "sound_box", "spelling", "text"] as const;

export function determineScaffoldLevel(input: ScaffoldInput): ScaffoldRecommendation {
  const { track, isNewWord, previousAttemptThisSession } = input;

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
