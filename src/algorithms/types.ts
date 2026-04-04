export type ChildQuality = 0 | 1 | 2 | 3 | 4 | 5;

export type Domain = "spelling" | "reading" | "segmentation" | "math" | "clocks";

export type ScaffoldLevel = 0 | 1 | 2 | 3 | 4;

export interface AttemptInput {
  word: string;
  domain: Domain;
  correct: boolean;
  quality: ChildQuality;
  scaffoldLevel: ScaffoldLevel;
  responseTimeMs?: number;
  confidenceSignal?: "high" | "medium" | "low";
  sessionMood?: "energetic" | "neutral" | "fatigued";
}

export interface AttemptSnapshot {
  date: string;
  quality: ChildQuality;
  scaffoldLevel: ScaffoldLevel;
  correct: boolean;
  responseTimeMs?: number;
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
