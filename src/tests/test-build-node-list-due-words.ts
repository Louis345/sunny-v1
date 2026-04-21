import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/bandit", () => ({
  selectNodeType: vi.fn(async (_cid: string, pool: readonly string[]) => pool[0]!),
  recordReward: vi.fn(async () => undefined),
}));

import { buildNodeList } from "../engine/nodeSelection";
import { createEmptyWordBank, createFreshSM2Track } from "../context/schemas/wordBank";
import { writeLearningProfile } from "../utils/learningProfileIO";
import { writeWordBank } from "../utils/wordBankIO";
import type { ChildProfile } from "../shared/childProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import type { SessionTheme } from "../shared/adventureTypes";

function minimalLp(childId: string) {
  return {
    childId,
    version: 1,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    demographics: {
      age: 8,
      grade: 2,
      diagnoses: [],
      learningStyle: "mixed" as const,
      attentionSpan: "moderate" as const,
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
      lastBondQuality: "moderate" as const,
      topicFrequency: {},
    },
    moodHistory: [],
    moodTrend: "stable" as const,
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
      celebrationStyle: "mixed" as const,
      bonusRoundHistory: { triggered: 0, correct: 0 },
    },
  } as import("../context/schemas/learningProfile").LearningProfile;
}

describe("buildNodeList dueWords (Audit 2)", () => {
  const childId = "audit2buildnodes";
  const ctxDir = path.join(process.cwd(), "src", "context", childId);

  afterEach(() => {
    fs.rmSync(ctxDir, { recursive: true, force: true });
  });

  it("assigns dueWords to word-builder; dopamine words empty", async () => {
    fs.mkdirSync(ctxDir, { recursive: true });
    writeLearningProfile(childId, minimalLp(childId));
    const bank = createEmptyWordBank(childId);
    const today = new Date().toISOString().slice(0, 10);
    bank.words.push({
      word: "mapslot",
      addedAt: new Date().toISOString(),
      source: "test",
      homeworkPriority: true,
      testDate: "2099-01-01",
      tracks: { spelling: createFreshSM2Track(today) },
    });
    writeWordBank(childId, bank);

    const profile: ChildProfile = {
      childId,
      ttsName: childId,
      level: 1,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
    };
    const theme: SessionTheme = {
      name: "t",
      palette: {
        sky: "#1",
        ground: "#2",
        accent: "#3",
        particle: "#4",
        glow: "#5",
      },
      ambient: { type: "dots", count: 1, speed: 1, color: "#fff" },
      nodeStyle: "rounded",
      pathStyle: "curve",
      castleVariant: "stone",
    };
    const nodes = await buildNodeList(profile, theme);
    const middle = nodes[1];
    const dop = nodes.find((n) => n.type === "space-invaders" || n.type === "asteroid");
    expect(middle?.words).toContain("mapslot");
    expect(dop?.words ?? []).toEqual([]);
  });
});
