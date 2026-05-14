import { describe, it, expect, afterEach, vi } from "vitest";
import type { WordEntry } from "../algorithms/types";
import type { SessionPlan } from "../engine/learningEngine";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { WordBankFile } from "../context/schemas/wordBank";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import { recordAttempt } from "../engine/learningEngine";
import { selectHomeworkSessionWords, daysUntilHomeworkTest } from "../shared/homeworkWordSelection";
import { buildHomeworkNodes } from "../scripts/ingestHomework";
import * as learningEngine from "../engine/learningEngine";
import * as learningProfileIO from "../utils/learningProfileIO";
import * as runtimeMode from "../utils/runtimeMode";
import * as wordBankIO from "../utils/wordBankIO";

function track(
  word: string,
  opts: { ease?: number; interval?: number; repetition?: number },
): WordEntry {
  const today = "2026-04-29";
  return {
    word,
    addedAt: today,
    source: "test",
    tracks: {
      spelling: {
        quality: 4,
        easinessFactor: opts.ease ?? 2.5,
        interval: opts.interval ?? 1,
        repetition: opts.repetition ?? 0,
        nextReviewDate: today,
        lastReviewDate: today,
        scaffoldLevel: 2,
        history: [],
        mastered: false,
        regressionCount: 0,
      },
    },
  };
}

function mkPlan(p: {
  dueWords: string[];
  newWords?: string[];
  reviewWords?: string[];
}): SessionPlan {
  return {
    childId: "test",
    mode: "spelling",
    activities: [],
    newWords: p.newWords ?? [],
    reviewWords: p.reviewWords ?? [],
    focusWords: [...p.dueWords],
    totalWordCount: p.dueWords.length,
    estimatedMinutes: 10,
    bondContext: "",
    difficultyParams: {
      targetAccuracy: 0.7,
      easyThreshold: 0.85,
      hardThreshold: 0.5,
      breakThreshold: 0.4,
      windowSize: 8,
    },
    moodAdjustment: false,
    wilsonStep: 1,
    dueWords: [...p.dueWords],
  };
}

describe("selectHomeworkSessionWords", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const today = "2026-04-29";

  it("excludes words SM-2 marks as not due when pool has enough", () => {
    const wordList = ["alpha", "beta", "faster", "gamma", "delta", "echo"];
    const bank: WordEntry[] = [
      track("alpha", { ease: 2.0 }),
      track("beta", { ease: 2.1 }),
      track("faster", { ease: 2.4, interval: 30, repetition: 5 }),
      track("gamma", { ease: 2.2 }),
      track("delta", { ease: 2.15 }),
      track("echo", { ease: 2.25 }),
    ];
    const sm2Plan = mkPlan({
      dueWords: ["alpha", "beta", "gamma", "delta", "echo"],
    });
    const out = selectHomeworkSessionWords({
      wordList,
      sm2Plan,
      missedWords: [],
      testDate: null,
      maxWords: 5,
      testImminent: false,
      wordBankWords: bank,
      todayIso: today,
    });
    expect(out).toHaveLength(5);
    expect(out.includes("faster")).toBe(false);
  });

  it("falls back to full wordList only when SM-2 pool is empty", () => {
    const wordList = ["only", "two"];
    const bank: WordEntry[] = [];
    const sm2Plan = mkPlan({ dueWords: [] });
    const out = selectHomeworkSessionWords({
      wordList,
      sm2Plan,
      missedWords: [],
      testDate: null,
      maxWords: 5,
      testImminent: false,
      wordBankWords: bank,
      todayIso: today,
    });
    expect(out).toEqual(["only", "two"]);
  });

  it("testDate urgency expands candidate pool but SM-2 still ranks within it", () => {
    const wordList = ["a", "b", "c"];
    const bank: WordEntry[] = [
      track("a", { ease: 2.8 }),
      track("b", { ease: 1.4 }),
      track("c", { ease: 2.0, interval: 20, repetition: 4 }),
    ];
    const sm2Plan = mkPlan({ dueWords: ["b"], reviewWords: ["a"] });
    const out = selectHomeworkSessionWords({
      wordList,
      sm2Plan,
      missedWords: [],
      testDate: "2026-05-01",
      maxWords: 5,
      testImminent: true,
      wordBankWords: bank,
      todayIso: "2026-04-29",
    });
    expect(out.length).toBe(3);
    expect(out[0]).toBe("b");
    expect(daysUntilHomeworkTest("2026-05-01", "2026-04-29")).toBeLessThanOrEqual(5);
    expect(out[out.length - 1]).toBe("c");
  });

  it("missedWords from previous node are prioritized over SM-2 due words", () => {
    const wordList = ["apple", "zoo", "banana"];
    const bank: WordEntry[] = [
      track("apple", { ease: 1.3 }),
      track("zoo", { ease: 2.5 }),
      track("banana", { ease: 1.4 }),
    ];
    const sm2Plan = mkPlan({ dueWords: ["apple", "banana"] });
    const out = selectHomeworkSessionWords({
      wordList,
      sm2Plan,
      missedWords: ["zoo"],
      testDate: null,
      maxWords: 5,
      testImminent: false,
      wordBankWords: bank,
      todayIso: today,
    });
    expect(out[0]).toBe("zoo");
    expect(out.includes("apple")).toBe(true);
  });

  it("word_bank SM-2 fields update even in preview mode", () => {
    vi.spyOn(runtimeMode, "sunnyPreviewBlocksPersistence").mockReturnValue(true);
    vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      algorithmParams: {
        sm2: {
          defaultEasinessFactor: 2.5,
          minEasinessFactor: 1.3,
          intervalModifier: 1.0,
          maxNewWordsPerSession: 5,
          maxReviewWordsPerSession: 12,
        },
        difficulty: {
          targetAccuracy: 0.7,
          easyThreshold: 0.85,
          hardThreshold: 0.5,
          breakThreshold: 0.4,
          windowSize: 8,
        },
      },
    } as LearningProfile);
    vi.spyOn(wordBankIO, "ensureWordInBank").mockImplementation(() => {});
    const sm0 = createFreshSM2Track("2026-04-29");
    const bank: WordBankFile = {
      childId: "preview_child",
      version: 1,
      lastUpdated: "2026-04-29T12:00:00.000Z",
      words: [
        {
          word: "alpha",
          addedAt: "2026-04-29T12:00:00.000Z",
          source: "test",
          tracks: { spelling: { ...sm0 } },
        },
      ],
    };
    vi.spyOn(wordBankIO, "readWordBank").mockReturnValue(bank);
    const writeSpy = vi.spyOn(wordBankIO, "writeWordBank").mockImplementation(() => {});
    recordAttempt("preview_child", {
      word: "alpha",
      domain: "spelling",
      correct: false,
      quality: 2,
      scaffoldLevel: 2,
    });
    expect(writeSpy).toHaveBeenCalled();
    const written = writeSpy.mock.calls.at(-1)?.[1] as WordBankFile;
    const next = written.words[0]?.tracks?.spelling;
    expect(next).toBeDefined();
    expect(next!.interval).not.toBe(sm0.interval);
  });

  it("seed and demo never appear in homework node word lists", () => {
    const wordList = ["seed", "real", "demo", "ok"];
    const bank: WordEntry[] = [track("real", {}), track("ok", {})];
    const sm2Plan = mkPlan({ dueWords: ["real", "ok"] });
    const out = selectHomeworkSessionWords({
      wordList,
      sm2Plan,
      missedWords: [],
      testDate: null,
      maxWords: 10,
      testImminent: false,
      wordBankWords: bank,
      todayIso: today,
    });
    expect(out.some((w) => w.toLowerCase() === "seed")).toBe(false);
    expect(out.some((w) => w.toLowerCase() === "demo")).toBe(false);
    expect(out).toContain("real");
    expect(out).toContain("ok");
  });
});

describe("buildHomeworkNodes + SM-2 selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildHomeworkNodes excludes words SM-2 marks as not due when pool has enough", () => {
    const words = ["alpha", "beta", "faster", "gamma", "delta", "echo"];
    vi.spyOn(learningEngine, "planSession").mockReturnValue(
      mkPlan({ dueWords: ["alpha", "beta", "gamma", "delta", "echo"] }),
    );
    vi.spyOn(wordBankIO, "readWordBank").mockReturnValue({
      childId: "qa_map",
      version: 1,
      lastUpdated: "2026-04-29T00:00:00.000Z",
      words: [
        track("alpha", { ease: 2.0 }),
        track("beta", { ease: 2.1 }),
        track("faster", { ease: 2.4, interval: 30, repetition: 5 }),
        track("gamma", { ease: 2.2 }),
        track("delta", { ease: 2.15 }),
        track("echo", { ease: 2.25 }),
      ],
    });
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words,
      homeworkId: "hw-sm2",
      childId: "qa_map",
      testDate: null,
    });
    const spellingNode = nodes.find((n) => n.type === "spell-check");
    expect(spellingNode?.words?.includes("faster")).toBe(false);
  });

  it("buildHomeworkNodes falls back to full wordList only when SM-2 pool is empty", () => {
    vi.spyOn(learningEngine, "planSession").mockReturnValue(mkPlan({ dueWords: [] }));
    vi.spyOn(wordBankIO, "readWordBank").mockReturnValue({
      childId: "qa_map",
      version: 1,
      lastUpdated: "2026-04-29T00:00:00.000Z",
      words: [],
    });
    const words = ["x", "y"];
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words,
      homeworkId: "hw-fb",
      childId: "qa_map",
    });
    expect(nodes[0]?.words).toEqual(["x", "y"]);
  });
});
