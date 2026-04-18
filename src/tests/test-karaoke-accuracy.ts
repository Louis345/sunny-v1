import { describe, it, expect } from "vitest";
import { classifyKaraokeWordMatch } from "../shared/karaokeMatchWord";
import {
  karaokeProgressAccuracy,
  isInterimPhraseRestart,
  buildKaraokeReadingProgressPayload,
} from "../shared/karaokeReadingMetrics";

describe("karaoke accuracy formula", () => {
  it("accuracy = wordIndex / totalWords", () => {
    expect(karaokeProgressAccuracy(37, 37)).toBe(1);
    expect(karaokeProgressAccuracy(0, 37)).toBe(0);
    expect(karaokeProgressAccuracy(18, 37)).toBeCloseTo(18 / 37, 5);
  });

  it("empty totalWords yields 1 (no division hazard)", () => {
    expect(karaokeProgressAccuracy(0, 0)).toBe(1);
  });
});

describe("classifyKaraokeWordMatch", () => {
  it("partials are neutral not mishears", () => {
    expect(classifyKaraokeWordMatch("tw", "twelve")).toBe("partial");
    expect(classifyKaraokeWordMatch("twel", "twelve")).toBe("partial");
    expect(classifyKaraokeWordMatch("twelve", "twelve")).toBe("match");
  });

  it("short expected words require exact match (no fuzzy prefix slack)", () => {
    expect(classifyKaraokeWordMatch("ma", "mat")).toBe("mismatch");
    expect(classifyKaraokeWordMatch("mat", "mat")).toBe("match");
  });

  it("long words still allow one Levenshtein edit as match", () => {
    expect(classifyKaraokeWordMatch("monstor", "monster")).toBe("match");
  });
});

describe("phrase restart (interim length shrink)", () => {
  it("growing interim is not a restart", () => {
    expect(isInterimPhraseRestart(0, 3)).toBe(false);
    expect(isInterimPhraseRestart(3, 5)).toBe(false);
  });

  it("mishear counted when phrase restarts (length shrinks)", () => {
    let hesitations = 0;
    let prevLen = 0;
    const tick = (currLen: number) => {
      if (isInterimPhraseRestart(prevLen, currLen)) hesitations += 1;
      prevLen = currLen;
    };
    tick(1);
    tick(3);
    tick(5);
    expect(hesitations).toBe(0);
    tick(2);
    expect(hesitations).toBe(1);
  });
});

describe("reading_progress payload", () => {
  it("includes hesitations separate from accuracy", () => {
    const p = buildKaraokeReadingProgressPayload({
      wordIndex: 12,
      totalWords: 37,
      hesitations: 4,
      flaggedWords: [],
      skippedWords: [],
      spelledWords: [],
      event: "progress",
    });
    expect(p.accuracy).toBeCloseTo(12 / 37, 5);
    expect(p.hesitations).toBe(4);
    expect(p.wordIndex).toBe(12);
    expect(p.totalWords).toBe(37);
  });

  it("complete story yields accuracy 1.0", () => {
    const p = buildKaraokeReadingProgressPayload({
      wordIndex: 37,
      totalWords: 37,
      hesitations: 9,
      flaggedWords: [],
      skippedWords: [],
      spelledWords: Array.from({ length: 37 }, (_, i) => `w${i}`),
      event: "complete",
    });
    expect(p.accuracy).toBe(1);
    expect(p.hesitations).toBe(9);
  });
});
