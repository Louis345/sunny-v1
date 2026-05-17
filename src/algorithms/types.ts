export type ChildQuality = 0 | 1 | 2 | 3 | 4 | 5;

export type Domain = "spelling" | "reading" | "segmentation" | "math" | "clocks" | "history";

export type ScaffoldLevel = 0 | 1 | 2 | 3 | 4;

export interface AttemptInput {
  word: string;
  domain: Domain;
  correct: boolean;
  quality: ChildQuality;
  scaffoldLevel: ScaffoldLevel;
  /** What the child actually produced; optional for old callers and non-text attempts. */
  attemptedValue?: string;
  /** Single-attempt error classification; optional until a domain classifier can produce it. */
  errorSignal?: ErrorSignal;
  responseTimeMs?: number;
  confidenceSignal?: "high" | "medium" | "low";
  sessionMood?: "energetic" | "neutral" | "fatigued";
}

export interface AttemptSnapshot {
  date: string;
  quality: ChildQuality;
  scaffoldLevel: ScaffoldLevel;
  correct: boolean;
  attemptedValue?: string;
  errorSignal?: ErrorSignal;
  responseTimeMs?: number;
}

export interface ErrorSignal {
  errorType: string;
  frequency: number;
  consistency: number;
  confidence: number;
  sessionCount: number;
  lastSeen: string;
  exampleTargets: string[];
  positions: number[];
  domain: string;
}

export interface SingleAttemptErrorSignal extends ErrorSignal {
  frequency: 1;
  consistency: 1;
  sessionCount: 1;
  target: string;
  attemptedValue: string;
}

export interface AttemptLogRecord {
  word: string;
  correct: boolean;
  domain?: Domain | string;
  timestamp: string;
  sessionId?: string;
  attemptedValue?: string;
  errorSignal?: ErrorSignal | SingleAttemptErrorSignal;
}

export interface PatternResult {
  childId?: string;
  patterns: ErrorSignal[];
  totalRecords: number;
  classifiedAttempts: number;
  skippedMissingAttemptedValue: number;
}

export interface QuestThreshold {
  unlocked: boolean;
  reason: "pattern_ready" | "needs_more_sessions" | "needs_confirmed_pattern";
  totalSessions: number;
  strongestPattern?: ErrorSignal;
}

export interface DomainClassifier {
  domain: Domain | string;
  classify: (target: string, attempt: string) => SingleAttemptErrorSignal | null;
}

export interface SM2Track {
  quality: ChildQuality;
  easinessFactor: number;
  interval: number;
  repetition: number;
  nextReviewDate: string;
  lastReviewDate: string;
  scaffoldLevel: ScaffoldLevel;
  history: AttemptSnapshot[];
  mastered: boolean;
  masteredDate?: string;
  regressionCount: number;
}

export interface WordEntry {
  word: string;
  addedAt: string;
  source: string;
  wilsonStep?: number;
  tags?: string[];
  tracks: Partial<Record<Domain, SM2Track>>;
  /** When true and testDate is still in the future, planSession prioritizes this word for homework-style maps. */
  homeworkPriority?: boolean;
  /** Spelling test date (YYYY-MM-DD); priority applies while today <= testDate. */
  testDate?: string;
  /** Source-derived homework target role; planners should not flatten all homework words into spelling. */
  homeworkTargetPurpose?: string;
  /** Source heading/group that produced this word for the current homework cycle. */
  homeworkSourceGroup?: string;
  /** Domain-scoped homework targets; legacy homeworkPriority/testDate mirror the selected lane. */
  homeworkTargets?: Partial<Record<
    "spelling" | "reading" | "math" | "science",
    {
      homeworkId: string;
      testDate: string | null;
      priority: boolean;
      purpose: string;
      sourceGroup?: string;
      updatedAt?: string;
    }
  >>;
  /** Best Word Radar response time (ms) for this word; optional. */
  wordRadarBestTime_ms?: number;
}

export interface SM2Params {
  defaultEasinessFactor: number;
  minEasinessFactor: number;
  intervalModifier: number;
  maxNewWordsPerSession: number;
  maxReviewWordsPerSession: number;
}

export interface DifficultyParams {
  targetAccuracy: number;
  easyThreshold: number;
  hardThreshold: number;
  breakThreshold: number;
  windowSize: number;
}

export interface DifficultySignal {
  zone: "too_easy" | "optimal" | "too_hard" | "break_needed";
  currentAccuracy: number;
  recommendation: "increase_difficulty" | "maintain" | "decrease_difficulty" | "take_break";
  confidence: number;
}

export type MathProblemType = "addition" | "subtraction" | "coins" | "clocks";

export interface InterleavingParams {
  weakestWeight: number;
  secondWeight: number;
  randomWeight: number;
  minTypeExposure: number;
}

export interface InterleavingInput {
  availableTypes: MathProblemType[];
  recentHistory: { type: MathProblemType; correct: boolean }[];
  performanceByType: Record<string, { correct: number; total: number }>;
  params: InterleavingParams;
}

export interface InterleavingResult {
  nextType: MathProblemType;
  reason: "weakest_type" | "variety" | "random";
  typeAccuracies: Record<string, number>;
}

export interface MasteryParams {
  gateAccuracy: number;
  gateSessions: number;
  regressionThreshold: number;
  regressionSessions: number;
}

export interface StepSessionRecord {
  sessionDate: string;
  wordsAttempted: number;
  wordsCorrect: number;
  accuracy: number;
}

export interface MasteryGateInput {
  currentStep: number;
  stepSessionHistory: StepSessionRecord[];
  params: MasteryParams;
}

export interface MasteryGateResult {
  gate: "locked" | "ready_to_advance" | "regressed";
  currentStep: number;
  sessionsAtThreshold: number;
  requiredSessions: number;
  regressionTarget?: number;
}

export interface StepStatus {
  status: "locked" | "active" | "mastered";
  firstAttemptDate?: string;
  masteredDate?: string;
  sessionsAtGate: number;
  totalSessions: number;
  averageAccuracy: number;
  regressionCount: number;
}

export interface MasteryMap {
  childId: string;
  currentStep: number;
  steps: Record<number, StepStatus>;
}

export interface ScaffoldInput {
  track: SM2Track;
  isNewWord: boolean;
  previousAttemptThisSession?: {
    correct: boolean;
    scaffoldLevel: ScaffoldLevel;
  };
}

export interface ScaffoldRecommendation {
  scaffoldLevel: ScaffoldLevel;
  scaffoldType: "cold" | "phonemic_hint" | "sound_box" | "word_builder" | "full_model";
  canvasMode: "none" | "sound_box" | "spelling" | "text";
  qualityIfCorrect: ChildQuality;
  qualityIfIncorrect: ChildQuality;
}
