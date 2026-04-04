import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import {
  getReadingCanvasPreferences as mergeReadingCanvasPreferences,
} from "../shared/readingCanvasPreferences";

function resolveProfilePath(childId: string): string {
  return path.resolve(process.cwd(), "src", "context", childId, "learning_profile.json");
}

export function readLearningProfile(childId: string): LearningProfile | null {
  const filePath = resolveProfilePath(childId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as LearningProfile;
  } catch {
    return null;
  }
}

/** Resolved reading/karaoke UI prefs for session_context and context injection. */
export function getReadingCanvasPreferencesForChild(
  childId: string,
): ReturnType<typeof mergeReadingCanvasPreferences> {
  const profile = readLearningProfile(childId);
  return mergeReadingCanvasPreferences(profile?.readingProfile);
}

export function writeLearningProfile(childId: string, profile: LearningProfile): void {
  const filePath = resolveProfilePath(childId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  profile.lastUpdated = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), "utf-8");
}

export function initializeLearningProfile(intake: {
  childId: string;
  age: number;
  grade: number;
  diagnoses: string[];
  learningGoals: string[];
}): LearningProfile {
  const hasLearningDifference = intake.diagnoses.length > 0;
  const now = new Date().toISOString();

  return {
    childId: intake.childId,
    version: 1,
    createdAt: now,
    lastUpdated: now,

    demographics: {
      age: intake.age,
      grade: intake.grade,
      diagnoses: intake.diagnoses,
      learningStyle: "mixed",
      attentionSpan: hasLearningDifference ? "short" : "moderate",
      iepActive: hasLearningDifference,
    },

    algorithmParams: {
      sm2: {
        defaultEasinessFactor: hasLearningDifference ? 2.3 : 2.5,
        minEasinessFactor: 1.3,
        intervalModifier: hasLearningDifference ? 0.8 : 1.0,
        maxNewWordsPerSession: hasLearningDifference ? 3 : 5,
        maxReviewWordsPerSession: hasLearningDifference ? 8 : 12,
      },
      difficulty: {
        targetAccuracy: 0.70,
        easyThreshold: 0.85,
        hardThreshold: 0.50,
        breakThreshold: 0.40,
        windowSize: 8,
      },
      mastery: {
        gateAccuracy: 0.80,
        gateSessions: 3,
        regressionThreshold: 0.60,
        regressionSessions: 2,
      },
      interleaving: {
        weakestWeight: 0.50,
        secondWeight: 0.30,
        randomWeight: 0.20,
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
      fontSize: 36,
      lineHeight: 2.0,
      fontFamily: "Lexend",
      background: "#FFF8F0",
      wordsPerLine: 8,
      highlightColor: "#1a56db",
      highlightBackground: "#dbeafe",
      dyslexiaMode: true,
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
