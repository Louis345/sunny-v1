import type { ChildProfileGames } from "../shared/childProfile";

export const DEFAULT_GAME_CONFIGS: ChildProfileGames = {
  "word-radar": {
    unlocked: true,
    sessionCount: 0,
    lastAccuracy: null,
    inputMode: "whole-word",
    speakStyle: "option-a",
    keyboardStyle: "option-c",
    showTimer: true,
    personalBestMetric: "accuracy",
  },
  "spell-check": {
    unlocked: true,
    sessionCount: 0,
    lastAccuracy: null,
    difficulty: 2,
    knownMode: "skip",
    maxWords: 5,
  },
  "karaoke-reading": {
    unlocked: true,
    sessionCount: 0,
    lastAccuracy: null,
    wordsPerLine: 8,
    fontSize: 40,
    skipWordEnabled: true,
  },
  "clock-game": {
    unlocked: true,
    sessionCount: 0,
    lastAccuracy: null,
  },
  "coin-counter": {
    unlocked: false,
    sessionCount: 0,
    lastAccuracy: null,
  },
  boss: {
    unlocked: false,
    sessionCount: 0,
    lastAccuracy: null,
    sessionsRequired: 10,
    dataThresholdMet: false,
    generatedGamePath: null,
    generationModel: null,
  },
};
