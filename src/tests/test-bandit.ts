import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { NodeType } from "../shared/adventureTypes";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";

const CHILD = "zq_bandit_qa";

const { banditStore } = vi.hoisted(() => ({
  banditStore: new Map<string, LearningProfile>(),
}));

vi.mock("../utils/learningProfileIO", () => ({
  readLearningProfile: (id: string) => banditStore.get(id) ?? null,
  writeLearningProfile: (id: string, p: LearningProfile) => {
    banditStore.set(id, p);
  },
}));

import {
  getBanditState,
  recordReward,
  resetBandit,
  selectNodeType,
} from "../engine/bandit";

const baseProfile = (): LearningProfile => ({
  childId: CHILD,
  version: 1,
  createdAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  demographics: {
    age: 8,
    grade: 2,
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
    lastSessionDate: new Date().toISOString(),
  },
  rewardPreferences: {
    favoriteGames: [],
    celebrationStyle: "mixed",
    bonusRoundHistory: { triggered: 0, correct: 0 },
  },
});

describe("bandit (TASK-005)", () => {
  beforeEach(() => {
    banditStore.clear();
    banditStore.set(CHILD, baseProfile());
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selectNodeType returns a member of availableTypes", async () => {
    const pick = ["karaoke", "riddle"] as NodeType[];
    const t = await selectNodeType(CHILD, pick);
    expect(pick).toContain(t);
  });

  it("recordReward with strong signal increases stored arm value", async () => {
    await recordReward(CHILD, "karaoke", true, true, 1);
    const st = getBanditState(CHILD);
    const idx = ALL_NODE_TYPES.indexOf("karaoke");
    expect(st.values[idx]).toBeGreaterThan(0);
  });

  it("recordReward with weak signal lowers value vs high reward", async () => {
    banditStore.set(CHILD, baseProfile());
    await recordReward(CHILD, "riddle", true, true, 1);
    const hi = getBanditState(CHILD).values[ALL_NODE_TYPES.indexOf("riddle")];
    banditStore.set(CHILD, baseProfile());
    await recordReward(CHILD, "riddle", false, false, 0);
    const lo = getBanditState(CHILD).values[ALL_NODE_TYPES.indexOf("riddle")];
    expect(lo).toBeLessThan(hi);
  });

  it("getBanditState returns persisted counts/values shape", async () => {
    await recordReward(CHILD, "boss", true, true, 0.5);
    const st = getBanditState(CHILD);
    expect(st.counts.length).toBe(ALL_NODE_TYPES.length);
    expect(st.values.length).toBe(ALL_NODE_TYPES.length);
  });

  it("resetBandit clears banditState", async () => {
    await recordReward(CHILD, "boss", true, true, 1);
    await resetBandit(CHILD);
    const lp = banditStore.get(CHILD);
    expect(lp?.banditState).toBeUndefined();
  });

  it("selectNodeType is deterministic with fixed Math.random sequence", async () => {
    const avail = ["karaoke", "riddle"] as NodeType[];
    const seq = [0.99, 0, 0.99, 0];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[i++]);
    const a = await selectNodeType(CHILD, avail);
    i = 0;
    const b = await selectNodeType(CHILD, avail);
    expect(a).toBe(b);
  });
});
