import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeProgression } from "./progression";
import {
  initializeLearningProfile,
  readLearningProfile,
  resolveProfilePath,
  writeLearningProfile,
} from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";

const childId = "progression-lab";

describe("progression system", () => {
  const previousContextRoot = process.env.SUNNY_CONTEXT_ROOT;
  let rootDir = "";
  let profilePath = "";
  let wordBankPath = "";

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-progression-"));
    process.env.SUNNY_CONTEXT_ROOT = rootDir;
    profilePath = resolveProfilePath(childId);
    wordBankPath = path.join(rootDir, childId, "word_bank.json");
    expect(profilePath).not.toContain(path.join("src", "context", "ila"));
    writeLearningProfile(childId, initializeLearningProfile({
      childId,
      age: 8,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
    }));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    if (previousContextRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
    else process.env.SUNNY_CONTEXT_ROOT = previousContextRoot;
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
