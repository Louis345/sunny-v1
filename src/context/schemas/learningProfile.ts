import type {
  SM2Params,
  DifficultyParams,
  MasteryParams,
  InterleavingParams,
  StepSessionRecord,
} from "../../algorithms/types";
import type { CompanionConfig } from "../../shared/companionTypes";
import type { TamagotchiState } from "../../shared/vrrTypes";

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

export interface ActivityModelEntry {
  activityId: string;
  plays: number;
  completions: number;
  completionRate: number;
  averageAccuracy: number;
  engagementScore: number;
  frustrationScore: number;
  lastPlayed: string;
  domains: Record<string, number>;
  missedWords: string[];
}

export interface AttentionModel {
  source: "onboarding_baseline" | "session_vitals" | "mixed" | "legacy_demographic";
  status: "provisional" | "measured" | "insufficient-data";
  currentWindow_ms: number;
  bestWindow_ms: number;
  trend: "improving" | "stable" | "declining" | "unknown";
  confidence: number;
  lastMeasuredAt?: string;
  evidence: string[];
}

export interface LearningCalibrationEntry {
  calibrationId: string;
  homeworkId: string;
  gradedAt: string;
  theoryId?: string;
  predictedPattern?: string;
  predictedRiskWords: string[];
  observedMisses: Array<{
    target: string;
    observedErrorType?: string;
    note?: string;
  }>;
  score: number | null;
  status: "supported" | "falsified" | "inconclusive";
  teacherNotes?: string;
  nextAdjustment: string;
}

export type LearningAlgorithmTarget =
  | "spaced-repetition"
  | "error-pattern-remediation"
  | "retrieval-practice"
  | "reading-comprehension"
  | "pronunciation"
  | "desirable-difficulty"
  | "mastery-gating"
  | "activity-affinity"
  | "variable-reward"
  | "attention-vitals";

export type ActivityPurpose =
  | "attention_screening"
  | "attention_intervention"
  | "learning_intervention"
  | "hybrid_learning_attention"
  | "dopamine_reward"
  | "mastery_gate"
  | "calibration_task";

export interface AIContentCatalogItem {
  contentId: string;
  homeworkId?: string;
  childId: string;
  type: "story" | "image" | "video" | "game" | "quiz" | "countdown" | "reading-mode";
  source: "generated" | "baseline" | "prototype" | "human";
  purpose?: ActivityPurpose;
  title: string;
  algorithmTargets: LearningAlgorithmTarget[];
  targetSkills: string[];
  targetConcepts: string[];
  targetWords: string[];
  engagementHooks: string[];
  inputEvidence: {
    contentFingerprint?: string;
    patternIds?: string[];
    activityEvidenceIds?: string[];
    calibrationIds?: string[];
  };
  reuseStatus: "candidate" | "reuse" | "revise" | "retire";
  reuseReason: string;
  performanceSummary?: {
    plays: number;
    completionRate: number;
    averageAccuracy: number;
    engagementScore: number;
    frustrationScore: number;
    transferSupported?: boolean;
  };
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

  /** Current activity-response model derived from node results. Raw attempts remain in attempts/*.ndjson. */
  activityModel?: Record<string, ActivityModelEntry>;

  /** Measured attention vital sign model. Demographic attentionSpan is legacy/intake only. */
  attentionModel?: AttentionModel;

  /** Human-graded reality checks against Sunny's theories; newest first, capped by writers. */
  learningCalibrationJournal?: LearningCalibrationEntry[];

  /** Reusable/revisable/retired learning content. Generated content must declare algorithmTargets. */
  aiContentCatalog?: AIContentCatalogItem[];

  pendingHomework?: {
    weekOf: string;
    testDate: string | null;
    wordList: string[];
    homeworkId?: string;
    contentProfile?: {
      practiceDomain: string;
      contentDomain: string;
      topic: string;
      primarySkill: string;
      assignmentFormat: string;
      concepts: string[];
      sourceEvidence: string[];
    } | null;
    capturedContent?: {
      title: string;
      type: string;
      rawText: string;
      words: string[];
      questions: unknown[];
      sourceDocuments: Array<{
        filename: string;
        mediaType?: string;
      }>;
      contentProfile: {
        practiceDomain: string;
        contentDomain: string;
        topic: string;
        primarySkill: string;
        assignmentFormat: string;
        concepts: string[];
        sourceEvidence: string[];
      };
    } | null;
    /** From last homework node misses — prioritized on next map load, then cleared. */
    reinforceWords?: string[];
    generatedAt: string;
    nodes: Array<{
      id: string;
      type: string;
      words: string[];
      difficulty: number;
      gameFile: string | null;
      storyFile: string | null;
      /** Karaoke passage text embedded at ingest (no fetch at click). */
      storyText?: string;
      storyTitle?: string;
      storyImagePrompt?: string;
      /** Word Radar drills when `type === "word-radar"` (ingest / map). */
      wordRadarItems?: Array<{
        display: string;
        acceptedResponses: string[];
        hint?: string;
        label?: string;
        subject?: string;
      }>;
      approved?: boolean;
      date?: string;
    }>;
    /** Adventure map node ids completed for this homework week (persisted across sessions). */
    completedAdventureNodeIds?: string[];
  };

  /**
   * Companion reaction overrides (merged onto preset from repo-root `children.config.json` in `buildProfile`).
   * Preset `vrmUrl` / expressions / face camera / dopamine games come from `children.config.json`; do not set `vrmUrl` here unless intentionally overriding the preset.
   */
  companion?: Partial<CompanionConfig>;

  /** Companion care meters (optional; merged with defaults in buildProfile). */
  tamagotchi?: TamagotchiState;

  /** Companion shop / HUD coin balance persisted with the learning profile. */
  companionCurrency?: number;

  /**
   * Slug of the last homework mystery iframe played (`monster-stampede` | `speed-catcher`).
   * Next map session picks the other game so children never repeat back-to-back.
   */
  lastMysteryGame?: string | null;
}

/** Optional homework-test metadata on `word_bank.json` rows (see `WordEntry` in algorithms/types). */
export type WordBankHomeworkPriorityFields = {
  homeworkPriority?: boolean;
  testDate?: string;
};
