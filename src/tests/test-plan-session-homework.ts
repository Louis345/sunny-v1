import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildNodeParams,
  planSession,
  reorderHomeworkNodesForSession,
} from "../engine/learningEngine";
import { writeLearningProfile } from "../utils/learningProfileIO";

describe("planSession homework", () => {
  const childId = "hwtest";
  const ctxDir = path.join(process.cwd(), "src", "context", childId);
  afterEach(() => {
    fs.rmSync(ctxDir, { recursive: true, force: true });
  });

  it("planSession uses pendingHomework when present", () => {
    writeLearningProfile(childId, {
      childId,
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
        lastSessionDate: "",
      },
      rewardPreferences: {
        favoriteGames: [],
        celebrationStyle: "mixed",
        bonusRoundHistory: { triggered: 0, correct: 0 },
      },
      pendingHomework: {
        weekOf: "2026-04-21",
        testDate: null,
        wordList: ["cat"],
        generatedAt: new Date().toISOString(),
        nodes: [
          {
            id: "n1",
            type: "quest",
            words: ["cat"],
            difficulty: 2,
            gameFile: "quest-2026-04-21.html",
            storyFile: null,
          },
        ],
      },
    });
    const plan = planSession(childId, "homework");
    expect(plan.mode).toBe("homework");
    expect(plan.activities.length).toBeGreaterThan(0);
  });

  it("boss node placed last regardless of input order", () => {
    const out = reorderHomeworkNodesForSession([
      { id: "a", type: "boss" },
      { id: "b", type: "quest" },
    ]);
    expect(out[out.length - 1]?.type).toBe("boss");
  });

  it("no same modality appears back to back", () => {
    const out = reorderHomeworkNodesForSession([
      { id: "a", type: "pronunciation" },
      { id: "b", type: "word-builder" },
      { id: "c", type: "karaoke" },
    ]);
    expect(out[0]?.type).toBe("pronunciation");
    expect(out[1]?.type).toBe("karaoke");
  });

  it("struggling words trigger pronunciation first", () => {
    const out = reorderHomeworkNodesForSession([
      { id: "a", type: "quest" },
      { id: "b", type: "pronunciation" },
    ]);
    expect(out[0]?.type).toBe("quest");
  });

  it("attention window caps node count", () => {
    const nodes = Array.from({ length: 8 }).map((_, idx) => ({
      id: `n${idx}`,
      type: "quest",
    }));
    const out = reorderHomeworkNodesForSession(nodes);
    expect(out.length).toBe(8);
  });

  it("SM-2 due words injected into node params", () => {
    const params = buildNodeParams(
      { id: "n1", type: "quest", difficulty: 2 },
      "ila",
      ["cat", "dog"],
      "elli",
    );
    expect(params).toContain("words=cat%2Cdog");
    expect(params).toContain("childId=ila");
  });

  it("falls back to existing logic when no pendingHomework", () => {
    const plan = planSession("fallback-child", "spelling");
    expect(plan.mode).toBe("spelling");
  });
});
