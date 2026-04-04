import { describe, it, expect } from "vitest";
import { determineScaffoldLevel } from "./retrievalPractice";
import type { SM2Track, ScaffoldLevel } from "./types";

function freshTrack(overrides?: Partial<SM2Track>): SM2Track {
  return {
    quality: 0,
    easinessFactor: 2.5,
    interval: 0,
    repetition: 0,
    nextReviewDate: "2026-04-01",
    lastReviewDate: "2026-04-01",
    scaffoldLevel: 0,
    history: [],
    mastered: false,
    regressionCount: 0,
    ...overrides,
  };
}

describe("determineScaffoldLevel", () => {
  it("starts mastered words at level 0 (cold recall)", () => {
    const result = determineScaffoldLevel({
      track: freshTrack({ mastered: true, interval: 30 }),
      isNewWord: false,
    });
    expect(result.scaffoldLevel).toBe(0);
    expect(result.scaffoldType).toBe("cold");
  });

  it("starts new words at level 2 (visual support)", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: true,
    });
    expect(result.scaffoldLevel).toBe(2);
    expect(result.scaffoldType).toBe("sound_box");
    expect(result.canvasMode).toBe("sound_box");
  });

  it("starts review words at level 0 (cold recall)", () => {
    const result = determineScaffoldLevel({
      track: freshTrack({ repetition: 2, interval: 4 }),
      isNewWord: false,
    });
    expect(result.scaffoldLevel).toBe(0);
    expect(result.scaffoldType).toBe("cold");
  });

  it("moves up one level after failure at current level", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: false,
      previousAttemptThisSession: { correct: false, scaffoldLevel: 0 },
    });
    expect(result.scaffoldLevel).toBe(1);
    expect(result.scaffoldType).toBe("phonemic_hint");
  });

  it("escalates through all levels on repeated failure", () => {
    const levels: ScaffoldLevel[] = [0, 1, 2, 3];
    const expectedTypes = ["phonemic_hint", "sound_box", "word_builder", "full_model"];
    for (let i = 0; i < levels.length; i++) {
      const result = determineScaffoldLevel({
        track: freshTrack(),
        isNewWord: false,
        previousAttemptThisSession: { correct: false, scaffoldLevel: levels[i] },
      });
      expect(result.scaffoldLevel).toBe(Math.min(levels[i] + 1, 4) as ScaffoldLevel);
      expect(result.scaffoldType).toBe(expectedTypes[i]);
    }
  });

  it("caps at level 4 (full model)", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: false,
      previousAttemptThisSession: { correct: false, scaffoldLevel: 4 },
    });
    expect(result.scaffoldLevel).toBe(4);
    expect(result.scaffoldType).toBe("full_model");
  });

  it("returns qualityIfCorrect = 5 for level 0", () => {
    const result = determineScaffoldLevel({
      track: freshTrack({ mastered: true }),
      isNewWord: false,
    });
    expect(result.qualityIfCorrect).toBe(5);
  });

  it("returns qualityIfCorrect = 4 for level 1", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: false,
      previousAttemptThisSession: { correct: false, scaffoldLevel: 0 },
    });
    expect(result.qualityIfCorrect).toBe(4);
  });

  it("returns qualityIfCorrect = 3 for levels 2-4", () => {
    for (const prevLevel of [1, 2, 3] as ScaffoldLevel[]) {
      const result = determineScaffoldLevel({
        track: freshTrack(),
        isNewWord: false,
        previousAttemptThisSession: { correct: false, scaffoldLevel: prevLevel },
      });
      expect(result.qualityIfCorrect).toBe(3);
    }
  });

  it("maps level 2 to sound_box canvas mode", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: true,
    });
    expect(result.canvasMode).toBe("sound_box");
  });

  it("maps level 3 to spelling canvas mode (word builder)", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: false,
      previousAttemptThisSession: { correct: false, scaffoldLevel: 2 },
    });
    expect(result.canvasMode).toBe("spelling");
  });

  it("returns qualityIfIncorrect = 2 for scaffold level <= 2", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: false,
      previousAttemptThisSession: { correct: false, scaffoldLevel: 0 },
    });
    expect(result.qualityIfIncorrect).toBe(2);
  });

  it("returns qualityIfIncorrect = 1 for scaffold level > 2", () => {
    const result = determineScaffoldLevel({
      track: freshTrack(),
      isNewWord: false,
      previousAttemptThisSession: { correct: false, scaffoldLevel: 3 },
    });
    expect(result.qualityIfIncorrect).toBe(1);
  });
});
