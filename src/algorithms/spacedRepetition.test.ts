import { describe, it, expect } from "vitest";
import {
  computeSM2,
  getWordsDueForReview,
  getNewWordsForSession,
  computeQualityFromAttempt,
} from "./spacedRepetition";
import type { SM2Track, SM2Params, WordEntry, AttemptInput } from "./types";

const DEFAULT_PARAMS: SM2Params = {
  defaultEasinessFactor: 2.5,
  minEasinessFactor: 1.3,
  intervalModifier: 1.0,
  maxNewWordsPerSession: 5,
  maxReviewWordsPerSession: 12,
};

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

function makeWord(word: string, overrides?: Partial<WordEntry>): WordEntry {
  return {
    word,
    addedAt: "2026-03-01",
    source: "wilson_step_1",
    tracks: {},
    ...overrides,
  };
}

describe("computeSM2", () => {
  it("resets repetition and interval on quality < 3", () => {
    const track = freshTrack({ repetition: 3, interval: 10 });
    const result = computeSM2(track, 2, DEFAULT_PARAMS);
    expect(result.repetition).toBe(0);
    expect(result.interval).toBe(1);
  });

  it("sets interval=1 on first successful review (repetition 0→1)", () => {
    const track = freshTrack({ repetition: 0, interval: 0 });
    const result = computeSM2(track, 4, DEFAULT_PARAMS);
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(1);
  });

  it("sets interval=4 on second successful review (child-adapted, not 6)", () => {
    const track = freshTrack({ repetition: 1, interval: 1 });
    const result = computeSM2(track, 4, DEFAULT_PARAMS);
    expect(result.interval).toBe(4);
    expect(result.repetition).toBe(2);
  });

  it("calculates interval with EF * intervalModifier on rep >= 2", () => {
    const track = freshTrack({ repetition: 2, interval: 4, easinessFactor: 2.5 });
    const result = computeSM2(track, 4, DEFAULT_PARAMS);
    expect(result.interval).toBe(Math.round(4 * 2.5 * 1.0));
  });

  it("applies intervalModifier from params", () => {
    const track = freshTrack({ repetition: 2, interval: 4, easinessFactor: 2.5 });
    const params = { ...DEFAULT_PARAMS, intervalModifier: 0.8 };
    const result = computeSM2(track, 4, params);
    expect(result.interval).toBe(Math.round(4 * 2.5 * 0.8));
  });

  it("caps interval at 60 days", () => {
    const track = freshTrack({ repetition: 5, interval: 30, easinessFactor: 2.5 });
    const result = computeSM2(track, 5, DEFAULT_PARAMS);
    expect(result.interval).toBeLessThanOrEqual(60);
  });

  it("never lets EF drop below minEasinessFactor", () => {
    const track = freshTrack({ easinessFactor: 1.4 });
    const result = computeSM2(track, 0, DEFAULT_PARAMS);
    expect(result.easinessFactor).toBeGreaterThanOrEqual(DEFAULT_PARAMS.minEasinessFactor);
  });

  it("updates EF using SM-2 formula for quality >= 3", () => {
    const track = freshTrack({ easinessFactor: 2.5 });
    const result = computeSM2(track, 4, DEFAULT_PARAMS);
    const expectedEF = 2.5 + (0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02));
    expect(result.easinessFactor).toBeCloseTo(expectedEF, 5);
  });

  it("marks mastered when interval exceeds 21 days", () => {
    const track = freshTrack({ repetition: 4, interval: 10, easinessFactor: 2.5 });
    const result = computeSM2(track, 5, DEFAULT_PARAMS);
    if (result.interval > 21) {
      expect(result.mastered).toBe(true);
      expect(result.masteredDate).toBeDefined();
    }
  });

  it("handles regression: mastered word fails → interval=max(1, prev/4)", () => {
    const track = freshTrack({
      mastered: true,
      masteredDate: "2026-03-01",
      interval: 28,
      repetition: 5,
      regressionCount: 0,
    });
    const result = computeSM2(track, 1, DEFAULT_PARAMS);
    expect(result.interval).toBe(Math.max(1, Math.floor(28 / 4)));
    expect(result.mastered).toBe(false);
    expect(result.regressionCount).toBe(1);
  });

  it("regression never resets interval to 1 for large intervals", () => {
    const track = freshTrack({
      mastered: true,
      interval: 40,
      regressionCount: 0,
    });
    const result = computeSM2(track, 0, DEFAULT_PARAMS);
    expect(result.interval).toBe(10);
    expect(result.interval).toBeGreaterThan(1);
  });

  it("stores quality on returned track", () => {
    const result = computeSM2(freshTrack(), 3, DEFAULT_PARAMS);
    expect(result.quality).toBe(3);
  });
});

describe("getWordsDueForReview", () => {
  it("returns words whose nextReviewDate is today or earlier", () => {
    const bank: WordEntry[] = [
      makeWord("hat", { tracks: { spelling: freshTrack({ nextReviewDate: "2026-04-01" }) } }),
      makeWord("cat", { tracks: { spelling: freshTrack({ nextReviewDate: "2026-04-05" }) } }),
      makeWord("mat", { tracks: { spelling: freshTrack({ nextReviewDate: "2026-03-30" }) } }),
    ];
    const due = getWordsDueForReview(bank, "spelling", "2026-04-02");
    const words = due.map((w) => w.word);
    expect(words).toContain("hat");
    expect(words).toContain("mat");
    expect(words).not.toContain("cat");
  });

  it("excludes short-interval words when mood is fatigued", () => {
    const bank: WordEntry[] = [
      makeWord("hard", { tracks: { spelling: freshTrack({ nextReviewDate: "2026-04-01", interval: 1 }) } }),
      makeWord("easy", { tracks: { spelling: freshTrack({ nextReviewDate: "2026-04-01", interval: 7 }) } }),
    ];
    const due = getWordsDueForReview(bank, "spelling", "2026-04-02", "fatigued");
    const words = due.map((w) => w.word);
    expect(words).not.toContain("hard");
    expect(words).toContain("easy");
  });

  it("returns empty array when no words are due", () => {
    const bank: WordEntry[] = [
      makeWord("far", { tracks: { spelling: freshTrack({ nextReviewDate: "2026-12-01" }) } }),
    ];
    expect(getWordsDueForReview(bank, "spelling", "2026-04-02")).toHaveLength(0);
  });

  it("only returns words for the requested domain", () => {
    const bank: WordEntry[] = [
      makeWord("hat", { tracks: { reading: freshTrack({ nextReviewDate: "2026-04-01" }) } }),
    ];
    expect(getWordsDueForReview(bank, "spelling", "2026-04-02")).toHaveLength(0);
    expect(getWordsDueForReview(bank, "reading", "2026-04-02")).toHaveLength(1);
  });
});

describe("getNewWordsForSession", () => {
  it("returns words that have no track for the given domain", () => {
    const bank: WordEntry[] = [
      makeWord("hat", { wilsonStep: 1, tracks: {} }),
      makeWord("cat", { wilsonStep: 1, tracks: { spelling: freshTrack() } }),
      makeWord("mat", { wilsonStep: 1, tracks: {} }),
    ];
    const newWords = getNewWordsForSession(bank, "spelling", 1, 5);
    const words = newWords.map((w) => w.word);
    expect(words).toContain("hat");
    expect(words).toContain("mat");
    expect(words).not.toContain("cat");
  });

  it("respects maxNew limit", () => {
    const bank: WordEntry[] = Array.from({ length: 10 }, (_, i) =>
      makeWord(`word${i}`, { wilsonStep: 1, tracks: {} }),
    );
    const result = getNewWordsForSession(bank, "spelling", 1, 3);
    expect(result).toHaveLength(3);
  });

  it("filters by Wilson step", () => {
    const bank: WordEntry[] = [
      makeWord("hat", { wilsonStep: 1, tracks: {} }),
      makeWord("ship", { wilsonStep: 2, tracks: {} }),
    ];
    const result = getNewWordsForSession(bank, "spelling", 1, 5);
    expect(result.map((w) => w.word)).toContain("hat");
    expect(result.map((w) => w.word)).not.toContain("ship");
  });
});

describe("computeQualityFromAttempt", () => {
  it("returns 5 for correct with scaffold level 0", () => {
    const attempt: AttemptInput = {
      word: "hat",
      domain: "spelling",
      correct: true,
      quality: 5,
      scaffoldLevel: 0,
    };
    expect(computeQualityFromAttempt(attempt)).toBe(5);
  });

  it("returns 4 for correct with scaffold level 1", () => {
    const attempt: AttemptInput = {
      word: "hat",
      domain: "spelling",
      correct: true,
      quality: 4,
      scaffoldLevel: 1,
    };
    expect(computeQualityFromAttempt(attempt)).toBe(4);
  });

  it("returns 3 for correct with scaffold level 2-4", () => {
    for (const level of [2, 3, 4] as const) {
      const attempt: AttemptInput = {
        word: "hat",
        domain: "spelling",
        correct: true,
        quality: 3,
        scaffoldLevel: level,
      };
      expect(computeQualityFromAttempt(attempt)).toBe(3);
    }
  });

  it("returns 2 for incorrect with partial knowledge (scaffold > 0)", () => {
    const attempt: AttemptInput = {
      word: "hat",
      domain: "spelling",
      correct: false,
      quality: 2,
      scaffoldLevel: 1,
    };
    expect(computeQualityFromAttempt(attempt)).toBe(2);
  });

  it("returns 0 for incorrect with no knowledge (scaffold 0, no effort)", () => {
    const attempt: AttemptInput = {
      word: "hat",
      domain: "spelling",
      correct: false,
      quality: 0,
      scaffoldLevel: 0,
    };
    expect(computeQualityFromAttempt(attempt)).toBe(0);
  });
});
