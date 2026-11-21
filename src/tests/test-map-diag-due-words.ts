import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  // I2: this test used to write the tracked src/context/creator files (care plan,
  // catalog, homework, active plan). It now runs against a temp context root.
  let contextRoot = "";

  beforeEach(() => {
    contextRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-diag-due-words-"));
    vi.stubEnv("SUNNY_CONTEXT_ROOT", contextRoot);
  });

  afterEach(() => {
    __resetAdventureMapSessionsForTests();
    vi.unstubAllEnvs();
    fs.rmSync(contextRoot, { recursive: true, force: true });
  });

  it("word-builder and boss get dueWords; coin-counter empty", () => {
    writeLearningProfile("creator", minimalCreatorProfile());
    const bank = readWordBank("creator");
    const today = new Date().toISOString().slice(0, 10);
    bank.words.push({
      word: "diag-sm2-audit",
      addedAt: new Date().toISOString(),
      source: "test",
      homeworkPriority: true,
      testDate: "2099-01-01",
      tracks: { spelling: createFreshSM2Track(today) },
    });
    writeWordBank("creator", bank);
    vi.stubEnv("SUNNY_SUBJECT", "diag");
    const { mapState } = buildDiagMapSession();
    expect(mapState.nodes.find((n) => n.id === "n-wb")?.words).toContain("diag-sm2-audit");
    expect(mapState.nodes.find((n) => n.id === "n-coins")?.words).toEqual([]);
    expect(mapState.nodes.find((n) => n.id === "n-castle")?.words).toContain("diag-sm2-audit");
    expect(fs.existsSync(path.join(contextRoot, "creator", "word_bank.json"))).toBe(true);
  });
});
