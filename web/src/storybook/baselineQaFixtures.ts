import type {
  PronunciationNodeConfig,
  WordRadarNodeConfig,
} from "../../../src/shared/adventureTypes";

export const fixtureStates = ["easy", "medium", "hard", "support", "complete"] as const;
export type BaselineFixtureState = (typeof fixtureStates)[number];

export const baselineActivities = [
  "word-radar",
  "pronunciation",
  "story-karaoke",
  "letter-rush",
  "spell-check",
  "monster-stampede",
] as const;
export type BaselineActivityId = (typeof baselineActivities)[number];
export type IframeBaselineActivityId =
  | "letter-rush"
  | "spell-check"
  | "monster-stampede";

export interface BaselineQaFixture {
  activityId: BaselineActivityId;
  state: BaselineFixtureState;
  title: string;
  purpose: string;
  words: string[];
  currentWord: string;
  wrongTranscript: string;
  supportTranscript: string;
  completionTranscript: string;
  wordRadarConfig?: WordRadarNodeConfig;
  pronunciationConfig?: PronunciationNodeConfig;
  story?: {
    title: string;
    text: string;
  };
  iframeConfig?: {
    difficulty?: number;
    config?: string;
    knownWords?: string[];
    weakWords?: string[];
    livesCount?: number;
  };
}

const spellingEasy = ["able", "common", "behind", "easy", "whole"];
const spellingMedium = ["shiny", "slowly", "lucky", "neatly", "sunny"];
const spellingHard = [
  "carefully",
  "remember",
  "friendly",
  "quickly",
  "vowel",
  "whole",
  "behind",
  "common",
];
const readingWords = [
  "Ila",
  "spotted",
  "the",
  "shiny",
  "key",
  "behind",
  "the",
  "common",
  "gate",
  "and",
  "read",
  "every",
  "clue",
  "carefully",
];

const wordRadarConfigs: Record<BaselineFixtureState, WordRadarNodeConfig> = {
  easy: {
    recallMode: "visible_read",
    inputMode: "whole-word",
    speakStyle: "option-b",
    showTimer: false,
    hideWordDuringResponse: false,
    requiresCapturedResponse: true,
  },
  medium: {
    recallMode: "partial_visual_recall",
    inputMode: "whole-word",
    speakStyle: "option-b",
    showTimer: true,
    timerSeconds: 12,
    hideWordDuringResponse: true,
    requiresCapturedResponse: true,
  },
  hard: {
    recallMode: "hidden_word_recall",
    inputMode: "keyboard",
    speakStyle: "option-b",
    showTimer: true,
    timerSeconds: 8,
    hideWordDuringResponse: true,
    requiresCapturedResponse: true,
  },
  support: {
    recallMode: "partial_visual_recall",
    inputMode: "letter-by-letter",
    speakStyle: "option-a",
    showTimer: false,
    hideWordDuringResponse: false,
    requiresCapturedResponse: true,
  },
  complete: {
    recallMode: "hidden_word_recall",
    inputMode: "whole-word",
    speakStyle: "option-b",
    showTimer: true,
    timerSeconds: 10,
    hideWordDuringResponse: true,
    requiresCapturedResponse: true,
  },
};

const pronunciationConfigs: Record<BaselineFixtureState, PronunciationNodeConfig> = {
  easy: {
    baseWordCount: 5,
    targetFlowWordCount: 8,
    maxWordCount: 10,
    expansionPolicy: "on_mastery_or_child_replay",
    masteryGate: { accuracyAtLeast: 0.85, minStreak: 4, noFrustrationSignal: true },
    supportPolicy: "slow_on_help_or_repeated_miss",
  },
  medium: {
    baseWordCount: 8,
    targetFlowWordCount: 10,
    maxWordCount: 12,
    expansionPolicy: "on_mastery_or_child_replay",
    masteryGate: { accuracyAtLeast: 0.88, minStreak: 5, noFrustrationSignal: true },
    supportPolicy: "slow_on_help_or_repeated_miss",
  },
  hard: {
    baseWordCount: 10,
    targetFlowWordCount: 14,
    maxWordCount: 16,
    expansionPolicy: "on_mastery_or_child_replay",
    masteryGate: { accuracyAtLeast: 0.9, minStreak: 7, noFrustrationSignal: true },
    supportPolicy: "slow_on_help_or_repeated_miss",
  },
  support: {
    baseWordCount: 5,
    targetFlowWordCount: 6,
    maxWordCount: 8,
    expansionPolicy: "on_mastery_or_child_replay",
    masteryGate: { accuracyAtLeast: 0.8, minStreak: 3, noFrustrationSignal: false },
    supportPolicy: "slow_on_help_or_repeated_miss",
  },
  complete: {
    baseWordCount: 6,
    targetFlowWordCount: 10,
    maxWordCount: 12,
    expansionPolicy: "on_mastery_or_child_replay",
    masteryGate: { accuracyAtLeast: 0.9, minStreak: 5, noFrustrationSignal: true },
    supportPolicy: "slow_on_help_or_repeated_miss",
  },
};

function wordsForState(state: BaselineFixtureState): string[] {
  if (state === "easy") return spellingEasy;
  if (state === "medium") return spellingMedium;
  if (state === "support") return ["able", "common", "behind", "carefully", "whole"];
  if (state === "complete") return ["able", "common", "behind", "easy", "whole", "carefully"];
  return spellingHard;
}

function fixture(
  activityId: BaselineActivityId,
  state: BaselineFixtureState,
  title: string,
  purpose: string,
): BaselineQaFixture {
  const words = activityId === "story-karaoke" ? readingWords : wordsForState(state);
  const currentWord = words[0] ?? "able";
  return {
    activityId,
    state,
    title,
    purpose,
    words,
    currentWord,
    wrongTranscript: currentWord === "able" ? "apple" : "not yet",
    supportTranscript: `Can you help me with ${currentWord}?`,
    completionTranscript: words.join(" "),
    wordRadarConfig: activityId === "word-radar" ? wordRadarConfigs[state] : undefined,
    pronunciationConfig:
      activityId === "pronunciation" ? pronunciationConfigs[state] : undefined,
    story:
      activityId === "story-karaoke"
        ? {
            title: `${state[0].toUpperCase()}${state.slice(1)} Reading Mission`,
            text: readingWords.join(" ") + ".",
          }
        : undefined,
    iframeConfig:
      activityId === "letter-rush"
        ? {
            difficulty: state === "hard" ? 3 : state === "easy" ? 1 : 2,
            config:
              state === "easy"
                ? "sample-read"
                : state === "hard" || state === "complete"
                  ? "sample-mastery"
                  : state === "support"
                    ? "sample-type"
                    : "sample",
          }
        : activityId === "spell-check"
          ? {
              difficulty: state === "hard" ? 3 : state === "easy" ? 1 : 2,
              weakWords: state === "support" ? [currentWord] : [],
              knownWords: state === "complete" ? words.slice(0, 2) : [],
            }
          : activityId === "monster-stampede"
            ? {
                difficulty: state === "hard" ? 3 : state === "easy" ? 1 : 2,
                livesCount: state === "support" ? 5 : 3,
              }
            : undefined,
  };
}

export const baselineQaFixtures: Record<
  BaselineActivityId,
  Record<BaselineFixtureState, BaselineQaFixture>
> = {
  "word-radar": {
    easy: fixture("word-radar", "easy", "Word Radar · Easy", "Visible read aloud."),
    medium: fixture("word-radar", "medium", "Word Radar · Medium", "Partial visual recall."),
    hard: fixture("word-radar", "hard", "Word Radar · Hard", "Hidden recall with captured answer."),
    support: fixture("word-radar", "support", "Word Radar · Support", "Letter-by-letter scaffold."),
    complete: fixture("word-radar", "complete", "Word Radar · Complete", "Completion QA flow."),
  },
  pronunciation: {
    easy: fixture("pronunciation", "easy", "Pronunciation · Easy", "Five-word read aloud flow."),
    medium: fixture("pronunciation", "medium", "Pronunciation · Medium", "Flow-state dosage."),
    hard: fixture("pronunciation", "hard", "Pronunciation · Hard", "Expanded harder replay."),
    support: fixture("pronunciation", "support", "Pronunciation · Support", "Chunk hint and slowdown."),
    complete: fixture("pronunciation", "complete", "Pronunciation · Complete", "Summary overlay QA."),
  },
  "story-karaoke": {
    easy: fixture("story-karaoke", "easy", "Story Karaoke · Easy", "Short guided reading."),
    medium: fixture("story-karaoke", "medium", "Story Karaoke · Medium", "Line tracking."),
    hard: fixture("story-karaoke", "hard", "Story Karaoke · Hard", "Longer phrase tracking."),
    support: fixture("story-karaoke", "support", "Story Karaoke · Support", "Frustration/support state."),
    complete: fixture("story-karaoke", "complete", "Story Karaoke · Complete", "Finish state."),
  },
  "letter-rush": {
    easy: fixture("letter-rush", "easy", "Letter Rush · Easy", "Visible read-and-race mode."),
    medium: fixture("letter-rush", "medium", "Letter Rush · Medium", "Hear-and-spell mode."),
    hard: fixture("letter-rush", "hard", "Letter Rush · Hard", "Mastery-run mode."),
    support: fixture("letter-rush", "support", "Letter Rush · Support", "Typed scaffold mode."),
    complete: fixture("letter-rush", "complete", "Letter Rush · Complete", "End-banner QA."),
  },
  "spell-check": {
    easy: fixture("spell-check", "easy", "Spell Check · Easy", "Short word construction."),
    medium: fixture("spell-check", "medium", "Spell Check · Medium", "Weekly list construction."),
    hard: fixture("spell-check", "hard", "Spell Check · Hard", "Longer hidden spelling."),
    support: fixture("spell-check", "support", "Spell Check · Support", "Weak-word scaffold."),
    complete: fixture("spell-check", "complete", "Spell Check · Complete", "Finish UI QA."),
  },
  "monster-stampede": {
    easy: fixture("monster-stampede", "easy", "Monster Stampede · Easy", "Low-pressure tile order."),
    medium: fixture("monster-stampede", "medium", "Monster Stampede · Medium", "Timed word defense."),
    hard: fixture("monster-stampede", "hard", "Monster Stampede · Hard", "Longer word pressure."),
    support: fixture("monster-stampede", "support", "Monster Stampede · Support", "Extra lives and hints."),
    complete: fixture("monster-stampede", "complete", "Monster Stampede · Complete", "Win summary QA."),
  },
};

export function isStorybookPreview(params: URLSearchParams): boolean {
  return params.get("preview") === "storybook";
}

export function makeIframeGameUrl(
  activityId: IframeBaselineActivityId,
  state: BaselineFixtureState,
): string {
  const fixtureForState = baselineQaFixtures[activityId][state];
  const params = new URLSearchParams({
    preview: "storybook",
    fixtureState: state,
    childId: "qa",
    childName: "QA",
    nodeId: `storybook-${activityId}-${state}`,
    words: fixtureForState.words.join(","),
    difficulty: String(fixtureForState.iframeConfig?.difficulty ?? 2),
  });
  const config = fixtureForState.iframeConfig?.config;
  if (config) params.set("config", config);
  const knownWords = fixtureForState.iframeConfig?.knownWords;
  if (knownWords?.length) params.set("knownWords", knownWords.join(","));
  const weakWords = fixtureForState.iframeConfig?.weakWords;
  if (weakWords?.length) params.set("weakWords", weakWords.join(","));
  const livesCount = fixtureForState.iframeConfig?.livesCount;
  if (livesCount) params.set("livesCount", String(livesCount));
  return `/games/${activityId}.html?${params.toString()}`;
}
