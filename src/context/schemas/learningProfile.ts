import type {
  SM2Params,
  DifficultyParams,
  MasteryParams,
  InterleavingParams,
  StepSessionRecord,
} from "../../algorithms/types";
import type { CompanionConfig } from "../../shared/companionTypes";

export interface MoodEntry {
  date: string;
  startMood: "energetic" | "neutral" | "fatigued" | "upset";
  endMood: "energetic" | "neutral" | "fatigued" | "upset";
  bondQuality: "strong" | "moderate" | "weak";
  sessionAccuracy: number;
  notableSignals: string[];
}

export interface IEPTarget {
  area: string;
  baseline: string;
  currentLevel: "emerging" | "developing" | "approaching" | "meeting";
  lastProbeDate: string;
  nextProbeDue: string;
  probeFrequency: "weekly" | "biweekly" | "monthly";
  overdueDays?: number;
}

export interface ReadingProfile {
  currentReadingLevel: string;
  wordsPerMinute?: number;
  averageReadingAccuracy: number;
  comprehensionAccuracy: number;
  flaggedPatterns: string[];
  storiesCompleted: number;
  lastStoryDate?: string;
  /** Karaoke / reading canvas — optional; merged with defaults on client/server */
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
  background?: string;
  wordsPerLine?: number;
  highlightColor?: string;
  highlightBackground?: string;
  dyslexiaMode?: boolean;
}

export interface BondPatterns {
  topics: string[];
  bondStyle: string;
  averageBondTurns: number;
  lastBondQuality: "strong" | "moderate" | "weak";
  topicFrequency: Record<string, number>;
}

export interface LearningProfile {
  childId: string;
  version: number;
  createdAt: string;
  lastUpdated: string;

  demographics: {
    age: number;
    grade: number;
    diagnoses: string[];
    learningStyle: "visual_kinesthetic" | "auditory" | "mixed";
    attentionSpan: "short" | "moderate" | "long";
    iepActive: boolean;
  };

  algorithmParams: {
    sm2: SM2Params;
    difficulty: DifficultyParams;
    mastery: MasteryParams;
    interleaving: InterleavingParams;
  };

  bondPatterns: BondPatterns;

  moodHistory: MoodEntry[];
  moodTrend: "improving" | "stable" | "declining";
  moodAdjustment: boolean;

  iepTargets: IEPTarget[];

  readingProfile: ReadingProfile;

  sessionStats: {
    totalSessions: number;
    averageAccuracy: number;
    averageDurationMinutes: number;
    currentWilsonStep: number;
    streakRecord: number;
    totalWordsMastered: number;
    perfectSessions: number;
    lastSessionDate: string;
  };

  /** Clock mini-game mastery — optional; added by clockTracker when first used. */
  clockMastery?: {
    currentStep: number;
    stepSessionHistory: StepSessionRecord[];
  };

  rewardPreferences: {
    favoriteGames: string[];
    celebrationStyle: "loud" | "quiet" | "mixed";
    bonusRoundHistory: {
      triggered: number;
      correct: number;
      lastTriggered?: string;
    };
  };

  /** Epsilon-greedy bandit per child (TASK-005); counts/values align with ALL_NODE_TYPES order. */
  banditState?: {
    counts: number[];
    values: number[];
  };

  /**
   * VRM + reaction dials for the web companion (merged with defaults in `buildProfile`).
   * Change `vrmUrl` to `/companions/your-model.vrm` after dropping a file in `web/public/companions/`.
   */
  companion?: Partial<CompanionConfig>;
}
