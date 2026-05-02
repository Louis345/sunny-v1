import crypto from "crypto";

export interface WordAttempt {
  word: string;
  correct: boolean;
  attempts: number;
}

export interface CycleDelta {
  word: string;
  inSystemAccuracy: number; // 0-1
  isolatedAccuracy: number; // 0-1 (from scan)
  accuracyDelta: number; // isolated - inSystem
  isolatedImprovedOverSystem: boolean;
  sm2EasinessFactorBefore: number;
  sm2EasinessFactorAfter: number;
  sm2Growth: number;
}

export interface ScanResult {
  scannedAt: string;
  wordAccuracy: WordAttempt[];
  overallScore: number; // 0-1
  rawExtraction: string; // what Haiku extracted
}

export interface LearningTheory {
  theoryId: string;
  stage: "pre_quest" | "boss";
  createdAt: string;
  hypothesis: string;
  predictedPattern: string;
  predictedRiskWords: string[];
  intervention: string;
  successCriteria: {
    minAccuracy: number;
    minImprovement: number;
  };
  evidence: string[];
  status: "pending" | "supported" | "falsified" | "inconclusive";
  markdown: string;
}

export interface HomeworkContentProfile {
  practiceDomain: string;
  contentDomain: string;
  topic: string;
  primarySkill: string;
  assignmentFormat: string;
  concepts: string[];
  sourceEvidence: string[];
}

export interface CapturedHomeworkContentRecord {
  title: string;
  type: string;
  rawText: string;
  words: string[];
  questions: unknown[];
  sourceDocuments: Array<{
    filename: string;
    mediaType?: string;
  }>;
  contentProfile: HomeworkContentProfile;
}

export type CalibrationStatus = "unverified" | "supported" | "falsified" | "inconclusive";

export interface HomeworkCalibrationEntry {
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
  status: Exclude<CalibrationStatus, "unverified">;
  teacherNotes?: string;
  nextAdjustment: string;
}

export interface InterventionMeasurement {
  nodeId: string;
  nodeType: string;
  measuredAt: string;
  baselineAccuracy: number;
  interventionAccuracy: number;
  improvement: number;
  predictionMet: boolean;
  status: "supported" | "falsified" | "inconclusive";
}

export interface HomeworkCycle {
  homeworkId: string; // deterministic from content
  subject: string;
  wordList: string[];
  contentProfile?: HomeworkContentProfile | null;
  capturedContent?: CapturedHomeworkContentRecord | null;
  contentFingerprint?: string;
  calibrationStatus?: CalibrationStatus;
  calibrationJournal?: HomeworkCalibrationEntry[];
  ingestedAt: string; // ISO date
  testDate: string | null;

  // Written by Psychologist BEFORE session cycle
  assumptions: string | null; // markdown — what the system predicted

  /** Structured version of `assumptions`, used by quest/boss generation. */
  theory?: LearningTheory | null;

  /** Quest evidence against the theory. Boss unlock/generation decisions read this. */
  questMeasurement?: InterventionMeasurement | null;

  /** Second-chance theory when quest evidence falsifies the first theory. */
  bossTheory?: LearningTheory | null;

  /** Every baseline/quest/boss node result recorded for this homework cycle. */
  interventionHistory?: InterventionMeasurement[];

  // Written by Psychologist AFTER scan-back
  postAnalysis: string | null; // markdown — what was wrong, what to adjust

  // Populated when scan arrives
  scanResult: ScanResult | null;

  // Computed after scan-back
  delta: CycleDelta[] | null;
  metrics: {
    accuracyDelta: number; // average across all words
    sm2Growth: number; // average easiness factor change
    independenceRate: number; // % correct in isolation, not drilled
  } | null;
}

export function generateHomeworkId(subject: string, wordList: string[]): string {
  const sorted = [...wordList].map((w) => w.toLowerCase()).sort();
  const hash = crypto.createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 8);
  return `hw-${subject}-${hash}`;
}

function normalizeForFingerprint(value: unknown): string {
  return JSON.stringify(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function generateContentFingerprint(input: {
  childId: string;
  title: string;
  rawText?: string | null;
  words?: string[];
  questions?: unknown[];
  testDate?: string | null;
  sourceDocuments?: Array<{ filename: string }>;
}): string {
  const payload = {
    childId: input.childId.trim().toLowerCase(),
    title: input.title.trim().toLowerCase(),
    rawText: String(input.rawText ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
    words: [...(input.words ?? [])].map((w) => w.trim().toLowerCase()).sort(),
    questions: input.questions ?? [],
    testDate: input.testDate ?? null,
    sourceDocuments: [...(input.sourceDocuments ?? [])]
      .map((doc) => doc.filename.trim().toLowerCase())
      .sort(),
  };
  return crypto.createHash("sha256").update(normalizeForFingerprint(payload)).digest("hex").slice(0, 16);
}

export function matchScanToHomework(
  scanWords: string[],
  cycles: HomeworkCycle[],
  threshold = 0.8,
): HomeworkCycle | null {
  const scanSet = new Set(scanWords.map((w) => w.toLowerCase()));
  let best: { cycle: HomeworkCycle; overlap: number } | null = null;
  for (const cycle of cycles) {
    const cycleSet = new Set(cycle.wordList.map((w) => w.toLowerCase()));
    const intersection = [...scanSet].filter((w) => cycleSet.has(w)).length;
    const overlap = intersection / Math.max(cycleSet.size, scanSet.size);
    if (overlap >= threshold && (!best || overlap > best.overlap)) {
      best = { cycle, overlap };
    }
  }
  return best?.cycle ?? null;
}

/** Simple per-word delta from single in-system and isolated attempts. */
export function computeCycleDelta(
  inSystem: Array<{ word: string; correct: boolean }>,
  isolated: Array<{ word: string; correct: boolean }>,
): CycleDelta[] {
  const isolatedMap = new Map(isolated.map((a) => [a.word.toLowerCase(), a.correct]));
  return inSystem.map((a) => {
    const inSystemAccuracy = a.correct ? 1 : 0;
    const isolatedCorrect = isolatedMap.get(a.word.toLowerCase()) ?? false;
    const isolatedAccuracy = isolatedCorrect ? 1 : 0;
    return {
      word: a.word,
      inSystemAccuracy,
      isolatedAccuracy,
      accuracyDelta: isolatedAccuracy - inSystemAccuracy,
      isolatedImprovedOverSystem: isolatedAccuracy > inSystemAccuracy,
      // SM-2 fields — populated by ingestScanResult when it has word bank data
      sm2EasinessFactorBefore: 2.5,
      sm2EasinessFactorAfter: 2.5,
      sm2Growth: 0,
    };
  });
}

/**
 * Fraction of isolated-attempt words that were NOT drilled this week and were answered correctly.
 * Returns null when there are no non-drilled words in the isolated set.
 */
export function computeIndependenceRate(
  isolated: Array<{ word: string; correct: boolean }>,
  drilledThisWeek: string[],
): number | null {
  const drilled = new Set(drilledThisWeek.map((w) => w.toLowerCase()));
  const independent = isolated.filter((a) => !drilled.has(a.word.toLowerCase()));
  if (independent.length === 0) return null;
  const correct = independent.filter((a) => a.correct).length;
  return correct / independent.length;
}
