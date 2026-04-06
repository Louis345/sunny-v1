import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeProgression } from "./progression";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";

const childId = "ila";
const profilePath = path.resolve(
  process.cwd(),
  "src",
  "context",
  childId,
  "learning_profile.json",
);
const wordBankPath = path.resolve(
  process.cwd(),
  "src",
  "context",
  childId,
  "word_bank.json",
);

describe("progression system", () => {
  let savedProfile: string | null = null;
  let savedBank: string | null = null;

  beforeEach(() => {
    savedProfile = fs.existsSync(profilePath)
      ? fs.readFileSync(profilePath, "utf-8")
      : null;
    savedBank = fs.existsSync(wordBankPath)
      ? fs.readFileSync(wordBankPath, "utf-8")
      : null;
  });

  afterEach(() => {
    if (savedProfile !== null)
      fs.writeFileSync(profilePath, savedProfile, "utf-8");
    if (savedBank !== null) fs.writeFileSync(wordBankPath, savedBank, "utf-8");
    else if (fs.existsSync(wordBankPath)) fs.unlinkSync(wordBankPath);
  });

  it("computes XP from word bank mastery", () => {
    const profile = readLearningProfile(childId);
    expect(profile).not.toBeNull();
    const p = JSON.parse(JSON.stringify(profile)) as LearningProfile;
    p.sessionStats.totalSessions = 0;
    writeLearningProfile(childId, p);
    if (fs.existsSync(wordBankPath)) fs.unlinkSync(wordBankPath);

    fs.mkdirSync(path.dirname(wordBankPath), { recursive: true });
    fs.writeFileSync(
      wordBankPath,
      JSON.stringify({
        childId,
        version: 1,
        lastUpdated: new Date().toISOString(),
        words: [
          {
            word: "xpword",
            addedAt: "2026-01-01",
            source: "test",
            tracks: {
              spelling: {
                quality: 5,
                easinessFactor: 2.5,
                interval: 1,
                repetition: 1,
                nextReviewDate: "2026-01-02",
                lastReviewDate: "2026-01-01",
                scaffoldLevel: 0,
                history: [{ date: "2026-01-01", quality: 5, scaffoldLevel: 0, correct: true }],
                mastered: true,
                regressionCount: 0,
              },
            },
          },
        ],
      }),
      "utf-8",
    );

    const snap = computeProgression(childId);
    expect(snap.totalXP).toBeGreaterThan(0);
    expect(snap.wordsMastered).toBeGreaterThanOrEqual(1);
  });

  it("level increases at 100 XP boundaries", () => {
    const profile = readLearningProfile(childId);
    expect(profile).not.toBeNull();
    const p = JSON.parse(JSON.stringify(profile)) as LearningProfile;
    p.sessionStats.totalSessions = 25;
    p.sessionStats.currentWilsonStep = 1;
    writeLearningProfile(childId, p);
    if (fs.existsSync(wordBankPath)) fs.unlinkSync(wordBankPath);
    fs.mkdirSync(path.dirname(wordBankPath), { recursive: true });
    fs.writeFileSync(
      wordBankPath,
      JSON.stringify({
        childId,
        version: 1,
        lastUpdated: new Date().toISOString(),
        words: [],
      }),
      "utf-8",
    );
    const snap = computeProgression(childId);
    expect(snap.level).toBeGreaterThanOrEqual(2);
  });

  it("handles empty data gracefully", () => {
    const snap = computeProgression("__ghost_child__");
    expect(snap.level).toBe(1);
    expect(snap.totalXP).toBe(0);
  });
});
