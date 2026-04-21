import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyWordBank, createFreshSM2Track } from "../context/schemas/wordBank";
import { planSession, getHomeworkPriorityWords } from "../engine/learningEngine";
import { pendingHomeworkToNodeConfigs } from "../server/map-coordinator";
import { applySpellCheckMapResults } from "../server/spellCheckMapResults";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { sunnyPreviewBlocksPersistence } from "../utils/runtimeMode";

const minimalProfile = (childId: string) =>
  ({
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
  }) as import("../context/schemas/learningProfile").LearningProfile;

describe("Audit 2 — SM-2 homework words and map", () => {
  const childId = "audit2sm2";
  const ctxDir = path.join(process.cwd(), "src", "context", childId);

  afterEach(() => {
    fs.rmSync(ctxDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    fs.mkdirSync(ctxDir, { recursive: true });
    writeLearningProfile(childId, minimalProfile(childId));
  });

  it("homeworkPriority words have testDate and appear in getHomeworkPriorityWords", () => {
    const bank = createEmptyWordBank(childId);
    const today = "2026-04-21";
    bank.words.push({
      word: "alpha",
      addedAt: new Date().toISOString(),
      source: "homework",
      homeworkPriority: true,
      testDate: "2026-04-25",
      tracks: { spelling: createFreshSM2Track(today) },
    });
    writeWordBank(childId, bank);
    const hw = getHomeworkPriorityWords(childId, today);
    expect(hw).toContain("alpha");
  });

  it("planSession returns homework words when priority exists", () => {
    const bank = createEmptyWordBank(childId);
    bank.words.push({
      word: "beta",
      addedAt: new Date().toISOString(),
      source: "homework",
      homeworkPriority: true,
      testDate: "2026-05-01",
      tracks: { spelling: createFreshSM2Track("2026-04-21") },
    });
    writeWordBank(childId, bank);
    const plan = planSession(childId, "spelling");
    expect(plan.mode).toBe("homework");
    expect(plan.dueWords).toEqual(["beta"]);
  });

  it("after testDate passes words return to SM-2 spelling path", () => {
    const bank = createEmptyWordBank(childId);
    bank.words.push({
      word: "gone",
      addedAt: new Date().toISOString(),
      source: "homework",
      homeworkPriority: true,
      testDate: "2026-01-01",
      tracks: { spelling: createFreshSM2Track("2026-04-21") },
    });
    writeWordBank(childId, bank);
    const plan = planSession(childId, "spelling");
    expect(plan.mode).toBe("spelling");
  });

  it("POST spell-check-results writes word_bank via recordAttempt", () => {
    const out = applySpellCheckMapResults({
      childId,
      wordsCorrect: ["Zebra"],
      wordsStruggled: ["Yak"],
    });
    expect(out.recorded).toBe(2);
    const after = readWordBank(childId);
    const z = after.words.find((w) => w.word.toLowerCase() === "zebra");
    const y = after.words.find((w) => w.word.toLowerCase() === "yak");
    expect(z?.tracks.spelling?.history?.length).toBeGreaterThan(0);
    expect(y?.tracks.spelling?.history?.length).toBeGreaterThan(0);
  });

  it("free preview skips spell-check map results writes", () => {
    const before = readWordBank(childId).words.length;
    const out = applySpellCheckMapResults({
      childId,
      wordsCorrect: ["one"],
      wordsStruggled: [],
      previewMode: "free",
    });
    expect(out.skipped).toBe(true);
    const after = readWordBank(childId).words.length;
    expect(after).toBe(before);
  });

  it("go-live preview skips spell-check map results writes", () => {
    const out = applySpellCheckMapResults({
      childId,
      wordsCorrect: ["two"],
      wordsStruggled: [],
      previewMode: "go-live",
    });
    expect(out.skipped).toBe(true);
  });

  it("sunnyPreviewBlocksPersistence is true for go-live env", () => {
    expect(sunnyPreviewBlocksPersistence({ SUNNY_PREVIEW_MODE: "go-live" })).toBe(true);
    expect(sunnyPreviewBlocksPersistence({ SUNNY_PREVIEW_MODE: "free" })).toBe(true);
    expect(sunnyPreviewBlocksPersistence({ SUNNY_PREVIEW_MODE: "false" })).toBe(false);
  });

  it("homework priority fills node slots from plan dueWords", () => {
    const bank = createEmptyWordBank(childId);
    bank.words.push({
      word: "gamma",
      addedAt: new Date().toISOString(),
      source: "homework",
      homeworkPriority: true,
      testDate: "2026-06-01",
      tracks: { spelling: createFreshSM2Track("2026-04-21") },
    });
    writeWordBank(childId, bank);
    const prof = {
      ...minimalProfile(childId),
      pendingHomework: {
      weekOf: "2026-04-21",
      testDate: null,
      wordList: ["gamma"],
      generatedAt: new Date().toISOString(),
      nodes: [
        {
          id: "p1",
          type: "pronunciation",
          words: [],
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "s1",
          type: "spell-check",
          words: [],
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
      ],
    },
    };
    writeLearningProfile(childId, prof as import("../context/schemas/learningProfile").LearningProfile);
    const plan = planSession(childId, "homework");
    expect(plan.dueWords).toEqual(["gamma"]);
    const loaded = readLearningProfile(childId);
    const out = pendingHomeworkToNodeConfigs(loaded!.pendingHomework!, plan.dueWords!);
    expect(out[0]?.words).toEqual(["gamma"]);
    expect(out[1]?.words).toEqual(["gamma"]);
  });
});
