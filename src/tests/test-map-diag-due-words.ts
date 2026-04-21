import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetAdventureMapSessionsForTests,
  buildDiagMapSession,
} from "../server/map-coordinator";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import { writeLearningProfile } from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";

function minimalCreatorProfile(): LearningProfile {
  return {
    childId: "creator",
    version: 1,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    demographics: {
      age: 10,
      grade: 4,
      diagnoses: [],
      learningStyle: "mixed",
      attentionSpan: "moderate",
      iepActive: false,
    },
    algorithmParams: {
      sm2: {
        defaultEasinessFactor: 2.5,
        minEasinessFactor: 1.3,
        intervalModifier: 1,
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
      mastery: {
        gateAccuracy: 0.8,
        gateSessions: 3,
        regressionThreshold: 0.6,
        regressionSessions: 2,
      },
      interleaving: {
        weakestWeight: 0.5,
        secondWeight: 0.3,
        randomWeight: 0.2,
        minTypeExposure: 0.15,
      },
    },
    bondPatterns: {
      topics: [],
      bondStyle: "unknown",
      averageBondTurns: 3,
      lastBondQuality: "moderate",
      topicFrequency: {},
    },
    moodHistory: [],
    moodTrend: "stable",
    moodAdjustment: false,
    iepTargets: [],
    readingProfile: {
      currentReadingLevel: "CVC",
      averageReadingAccuracy: 0,
      comprehensionAccuracy: 0,
      flaggedPatterns: [],
      storiesCompleted: 0,
    },
    sessionStats: {
      totalSessions: 0,
      averageAccuracy: 0,
      averageDurationMinutes: 0,
      currentWilsonStep: 1,
      streakRecord: 0,
      totalWordsMastered: 0,
      perfectSessions: 0,
      lastSessionDate: "",
    },
    rewardPreferences: {
      favoriteGames: [],
      celebrationStyle: "mixed",
      bonusRoundHistory: { triggered: 0, correct: 0 },
    },
  };
}

describe("buildDiagMapSession SM-2 due words (Audit 2)", () => {
  const creatorDir = path.join(process.cwd(), "src", "context", "creator");
  const creatorBankPath = path.join(creatorDir, "word_bank.json");
  const creatorLpPath = path.join(creatorDir, "learning_profile.json");
  let bankHadFile = false;
  let bankPrevious: string | null = null;
  let lpHadFile = false;
  let lpPrevious: string | null = null;

  afterEach(() => {
    __resetAdventureMapSessionsForTests();
    vi.unstubAllEnvs();
    if (bankHadFile && bankPrevious !== null) {
      fs.mkdirSync(path.dirname(creatorBankPath), { recursive: true });
      fs.writeFileSync(creatorBankPath, bankPrevious, "utf8");
    } else if (fs.existsSync(creatorBankPath)) {
      const b = readWordBank("creator");
      b.words = b.words.filter((w) => w.word !== "diag-sm2-audit");
      if (b.words.length === 0) {
        fs.rmSync(creatorBankPath, { force: true });
      } else {
        writeWordBank("creator", b);
      }
    }
    if (lpHadFile && lpPrevious !== null) {
      fs.mkdirSync(path.dirname(creatorLpPath), { recursive: true });
      fs.writeFileSync(creatorLpPath, lpPrevious, "utf8");
    } else if (fs.existsSync(creatorLpPath)) {
      fs.rmSync(creatorLpPath, { force: true });
    }
    bankHadFile = false;
    bankPrevious = null;
    lpHadFile = false;
    lpPrevious = null;
  });

  it("word-builder and boss get dueWords; coin-counter empty", () => {
    bankHadFile = fs.existsSync(creatorBankPath);
    bankPrevious = bankHadFile ? fs.readFileSync(creatorBankPath, "utf8") : null;
    lpHadFile = fs.existsSync(creatorLpPath);
    lpPrevious = lpHadFile ? fs.readFileSync(creatorLpPath, "utf8") : null;
    writeLearningProfile("creator", minimalCreatorProfile());
    const bank = readWordBank("creator");
    const today = new Date().toISOString().slice(0, 10);
    if (!bank.words.some((w) => w.word === "diag-sm2-audit")) {
      bank.words.push({
        word: "diag-sm2-audit",
        addedAt: new Date().toISOString(),
        source: "test",
        homeworkPriority: true,
        testDate: "2099-01-01",
        tracks: { spelling: createFreshSM2Track(today) },
      });
    }
    writeWordBank("creator", bank);
    vi.stubEnv("SUNNY_SUBJECT", "diag");
    const { mapState } = buildDiagMapSession();
    expect(mapState.nodes.find((n) => n.id === "n-wb")?.words).toContain("diag-sm2-audit");
    expect(mapState.nodes.find((n) => n.id === "n-coins")?.words).toEqual([]);
    expect(mapState.nodes.find((n) => n.id === "n-castle")?.words).toContain("diag-sm2-audit");
  });
});
