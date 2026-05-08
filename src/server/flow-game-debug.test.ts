import { describe, expect, it } from "vitest";
import {
  buildFlowGameEventFields,
  buildPronunciationCompleteFields,
  buildReadingProgressFields,
} from "./flow-game-debug";

describe("flow-game debug payloads", () => {
  it("keeps karaoke reading logs compact but diagnostic", () => {
    expect(
      buildReadingProgressFields({
        event: "complete",
        wordIndex: 12,
        totalWords: 20,
        accuracy: 0.75,
        hesitations: 3,
        flaggedWords: ["slow"],
        skippedWords: ["newest"],
        spelledWords: ["faster", "coldest"],
      }),
    ).toEqual({
      game: "karaoke-reading",
      event: "complete",
      wordIndex: 12,
      totalWords: 20,
      accuracyPct: 75,
      hesitations: 3,
      flaggedCount: 1,
      skippedCount: 1,
      spelledCount: 2,
      flaggedWords: ["slow"],
      skippedWords: ["newest"],
      spelledWords: ["faster", "coldest"],
    });
  });

  it("keeps pronunciation completion logs focused on performance signals", () => {
    expect(
      buildPronunciationCompleteFields({
        totalWords: 10,
        correctCount: 8,
        accuracy: 0.8,
        wordsAttempted: 11,
        wordsHit: 8,
        xpEarned: 120,
        bestStreak: 5,
      }),
    ).toEqual({
      game: "pronunciation",
      totalWords: 10,
      correctCount: 8,
      accuracyPct: 80,
      wordsAttempted: 11,
      wordsHit: 8,
      xpEarned: 120,
      bestStreak: 5,
    });
  });

  it("normalizes iframe game events without storing noisy blobs", () => {
    expect(
      buildFlowGameEventFields({
        type: "combo_breaker",
        game: "pronunciation",
        streak: 12,
        bonusWord: "fastest",
        bonusMultiplier: 2,
        difficulty: "super_hard",
      }),
    ).toEqual({
      game: "pronunciation",
      type: "combo_breaker",
      streak: 12,
      bonusWord: "fastest",
      bonusMultiplier: 2,
      difficulty: "super_hard",
    });
  });
});
