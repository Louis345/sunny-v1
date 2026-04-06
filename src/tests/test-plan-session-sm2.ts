import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { planSession } from "../engine/learningEngine";
import { resolveWordBankPath } from "../utils/wordBankIO";
import { resolveCurriculumMarkdownPath } from "../utils/curriculumNextSessionWords";
import type { SM2Track } from "../algorithms/types";

const childId = "sm2planner";
const ctxDir = path.resolve(process.cwd(), "src", "context", childId);
const bankPath = resolveWordBankPath(childId);
const curriculumPath = resolveCurriculumMarkdownPath(childId);
function spellTrack(
  nextReviewDate: string,
  easinessFactor: number,
  overrides: Partial<SM2Track> = {},
): SM2Track {
  return {
    quality: 5,
    easinessFactor,
    interval: 4,
    repetition: 2,
    nextReviewDate,
    lastReviewDate: "2026-04-01",
    scaffoldLevel: 0,
    history: [],
    mastered: false,
    regressionCount: 0,
    ...overrides,
  };
}

function writeBank(words: Record<string, unknown>[]) {
  fs.mkdirSync(path.dirname(bankPath), { recursive: true });
  fs.writeFileSync(
    bankPath,
    JSON.stringify(
      {
        childId,
        version: 1,
        lastUpdated: "2026-04-04T12:00:00.000Z",
        words,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function rmIfExists(p: string) {
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
}

describe("planSession respects SM-2 schedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T15:00:00.000Z"));
    fs.rmSync(ctxDir, { recursive: true, force: true });
    rmIfExists(curriculumPath);
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(ctxDir, { recursive: true, force: true });
    rmIfExists(curriculumPath);
  });

  it("only returns words due today", () => {
    writeBank([
      {
        word: "add",
        addedAt: "2026-04-01",
        source: "test",
        tracks: { spelling: spellTrack("2026-04-04", 2.5) },
      },
      {
        word: "move",
        addedAt: "2026-04-01",
        source: "test",
        tracks: { spelling: spellTrack("2026-04-05", 2.5) },
      },
      {
        word: "work",
        addedAt: "2026-04-01",
        source: "test",
        tracks: { spelling: spellTrack("2026-04-07", 2.5) },
      },
    ]);

    const plan = planSession(childId, "spelling");
    expect(plan.reviewWords).toEqual(["add"]);
    expect(plan.focusWords).toContain("add");
    expect(plan.focusWords).not.toContain("move");
    expect(plan.focusWords).not.toContain("work");
  });

  it("returns empty reviewWords when nothing is due", () => {
    writeBank([
      {
        word: "idle1",
        addedAt: "2026-04-01",
        source: "test",
        tracks: { spelling: spellTrack("2026-04-10", 2.5) },
      },
    ]);

    const plan = planSession(childId, "spelling");
    expect(plan.reviewWords).toEqual([]);
    expect(plan.newWords).toEqual([]);
    expect(plan.focusWords).toEqual([]);
    expect(plan.sessionRecommendation).toBe("reading");
  });

  it("returns new words when word bank is empty", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const plan = planSession(childId, "spelling", {
      homeworkFallbackWords: ["alpha", "beta", "gamma"],
    });

    expect(plan.reviewWords).toEqual([]);
    expect(plan.newWords.length).toBeGreaterThan(0);
    expect(plan.newWords.length).toBeLessThanOrEqual(2);
    expect(plan.focusWords).toEqual(plan.newWords);
    expect(
      logSpy.mock.calls.some((c) =>
        String(c[0]).includes("[engine] no word bank — using fallback"),
      ),
    ).toBe(true);

    logSpy.mockRestore();
  });

  it("caps session at 5 words max; SM-2 priority lowest easeFactor first", () => {
    const words: Record<string, unknown>[] = [];
    for (let i = 0; i < 12; i++) {
      words.push({
        word: `w${i}`,
        addedAt: "2026-04-01",
        source: "test",
        tracks: {
          spelling: spellTrack("2026-04-04", 2.5 + i * 0.1),
        },
      });
    }
    writeBank(words);

    const plan = planSession(childId, "spelling");
    expect(plan.focusWords.length).toBeLessThanOrEqual(5);
    expect(plan.reviewWords.length).toBeLessThanOrEqual(3);
    expect(plan.reviewWords[0]).toBe("w0");
    expect(plan.reviewWords[1]).toBe("w1");
    expect(plan.reviewWords[2]).toBe("w2");
  });

  it("includes new words and due reviews — new words first", () => {
    writeBank([
      {
        word: "n1",
        addedAt: "2026-04-01",
        source: "test",
        tracks: {},
      },
      {
        word: "n2",
        addedAt: "2026-04-01",
        source: "test",
        tracks: {},
      },
      {
        word: "rhard",
        addedAt: "2026-04-01",
        source: "test",
        tracks: { spelling: spellTrack("2026-04-04", 1.4) },
      },
      {
        word: "rmed",
        addedAt: "2026-04-01",
        source: "test",
        tracks: { spelling: spellTrack("2026-04-04", 2.0) },
      },
      {
        word: "reasy",
        addedAt: "2026-04-01",
        source: "test",
        tracks: { spelling: spellTrack("2026-04-04", 2.9) },
      },
    ]);

    const plan = planSession(childId, "spelling");
    expect(plan.newWords).toEqual(["n1", "n2"]);
    expect(plan.reviewWords).toEqual(["rhard", "rmed", "reasy"]);
    expect(plan.focusWords).toEqual(["n1", "n2", "rhard", "rmed", "reasy"]);
  });
});
