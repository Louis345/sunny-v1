import type {
  AttemptInput,
  ChildQuality,
  Domain,
  ScaffoldLevel,
} from "../algorithms/types";
import { recordAttempt } from "../engine/learningEngine";
import { recordFactAttempt } from "../engine/factBankRecorder";
import { appendAttemptLine } from "../utils/attempts";

const DOMAINS: ReadonlySet<string> = new Set([
  "spelling",
  "vocabulary",
  "reading",
  "science",
  "segmentation",
  "math",
  "clocks",
  "history",
]);

export type RawLearningAttemptEvent = {
  attemptId?: unknown;
  childId?: unknown;
  domain?: unknown;
  target?: unknown;
  targetId?: unknown;
  word?: unknown;
  attemptedValue?: unknown;
  correct?: unknown;
  quality?: unknown;
  scaffoldLevel?: unknown;
  responseTimeMs?: unknown;
  sessionId?: unknown;
  encounterId?: unknown;
  maximumClaim?: unknown;
  masteryClaimAllowed?: unknown;
  homeworkId?: unknown;
  questionId?: unknown;
  sourceFingerprint?: unknown;
  sourceDocumentIds?: unknown;
  sourceEvidenceIds?: unknown;
  exposure?: unknown;
  assistance?: unknown;
  confounds?: unknown;
};

export type RecordedLearningAttempt = {
  childId: string;
  attemptId?: string;
  sessionId?: string;
  attempt: AttemptInput;
  skipped: boolean;
  evidenceLimit?: "practice_only";
  observationContext: {
    homeworkId?: string;
    encounterId?: string;
    questionId?: string;
    sourceFingerprint?: string;
    sourceDocumentIds?: string[];
    sourceEvidenceIds?: string[];
    exposure?: string;
    assistance?: string;
    confounds?: string[];
  };
};

const seenAttemptIds: string[] = [];
const seenAttemptIdSet = new Set<string>();
const MAX_SEEN_ATTEMPT_IDS = 1000;

function rememberAttemptId(attemptId: string): boolean {
  if (seenAttemptIdSet.has(attemptId)) return false;
  seenAttemptIdSet.add(attemptId);
  seenAttemptIds.push(attemptId);
  if (seenAttemptIds.length > MAX_SEEN_ATTEMPT_IDS) {
    const oldest = seenAttemptIds.shift();
    if (oldest) seenAttemptIdSet.delete(oldest);
  }
  return true;
}

function normalizeQuality(value: unknown, correct: boolean): ChildQuality {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 5) return n as ChildQuality;
  return (correct ? 5 : 1) as ChildQuality;
}

function normalizeScaffoldLevel(value: unknown): ScaffoldLevel {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return n as ScaffoldLevel;
  return 0;
}

function normalizeDomain(value: unknown): Domain {
  const domain = String(value ?? "").trim().toLowerCase();
  if (DOMAINS.has(domain)) return domain as Domain;
  throw new Error(`Invalid attempt domain: ${String(value)}`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export function normalizeLearningAttemptEvent(
  raw: RawLearningAttemptEvent,
  fallbackChildId?: string,
): RecordedLearningAttempt {
  const childId = String(raw.childId ?? fallbackChildId ?? "").trim().toLowerCase();
  if (!childId) throw new Error("Missing attempt childId");

  const word = String(raw.target ?? raw.targetId ?? raw.word ?? "").trim().toLowerCase();
  if (!word) throw new Error("Missing attempt target");

  if (typeof raw.correct !== "boolean") {
    throw new Error("Attempt correct must be boolean");
  }

  const attempt: AttemptInput = {
    word,
    domain: normalizeDomain(raw.domain),
    correct: raw.correct,
    quality: normalizeQuality(raw.quality, raw.correct),
    scaffoldLevel: normalizeScaffoldLevel(raw.scaffoldLevel),
  };

  if (typeof raw.attemptedValue === "string" && raw.attemptedValue.trim()) {
    attempt.attemptedValue = raw.attemptedValue.trim();
  }

  const responseTimeMs = Number(raw.responseTimeMs);
  if (Number.isFinite(responseTimeMs) && responseTimeMs >= 0) {
    attempt.responseTimeMs = responseTimeMs;
  }

  const sessionId =
    typeof raw.sessionId === "string" && raw.sessionId.trim()
      ? raw.sessionId.trim()
      : undefined;
  const attemptId =
    typeof raw.attemptId === "string" && raw.attemptId.trim()
      ? raw.attemptId.trim()
      : undefined;

  const practiceOnly = raw.maximumClaim === "practice_only" || raw.masteryClaimAllowed === false;
  return {
    childId,
    attemptId,
    sessionId,
    attempt,
    skipped: false,
    ...(practiceOnly ? { evidenceLimit: "practice_only" as const } : {}),
    observationContext: {
      homeworkId: optionalString(raw.homeworkId),
      encounterId: optionalString(raw.encounterId),
      questionId: optionalString(raw.questionId),
      sourceFingerprint: optionalString(raw.sourceFingerprint),
      sourceDocumentIds: stringArray(raw.sourceDocumentIds),
      sourceEvidenceIds: stringArray(raw.sourceEvidenceIds),
      exposure: optionalString(raw.exposure),
      assistance: optionalString(raw.assistance),
      confounds: stringArray(raw.confounds),
    },
  };
}

export function recordLearningAttempt(
  raw: RawLearningAttemptEvent,
  fallbackChildId?: string,
  opts?: { rootDir?: string },
): RecordedLearningAttempt {
  const recorded = normalizeLearningAttemptEvent(raw, fallbackChildId);
  if (recorded.attemptId && !rememberAttemptId(recorded.attemptId)) {
    console.log(
      `  🎮 [attempt_event] duplicate skipped ${recorded.attempt.domain}:${recorded.attempt.word}`,
    );
    return { ...recorded, skipped: true };
  }
  if (recorded.evidenceLimit === "practice_only") {
    appendAttemptLine(recorded.childId, {
      word: recorded.attempt.word,
      domain: recorded.attempt.domain,
      correct: recorded.attempt.correct,
      sessionId: recorded.sessionId,
      attemptId: recorded.attemptId,
      attemptedValue: recorded.attempt.attemptedValue,
      responseTimeMs: recorded.attempt.responseTimeMs,
      scaffoldLevel: recorded.attempt.scaffoldLevel,
      errorSignal: recorded.attempt.errorSignal,
      evidenceLimit: "practice_only",
      masteryClaimAllowed: false,
      ...recorded.observationContext,
    }, { rootDir: opts?.rootDir });
    console.log(
      `  🎮 [attempt_event] [practice-observation] [recorded] ` +
        `${recorded.attempt.domain}:${recorded.attempt.word}`,
    );
    return recorded;
  }
  if (recorded.attempt.domain === "math" || recorded.attempt.domain === "clocks") {
    recordFactAttempt(
      {
        childId: recorded.childId,
        prompt: recorded.attempt.word,
        answer: recorded.attempt.attemptedValue ?? recorded.attempt.word,
        correct: recorded.attempt.correct,
        quality: recorded.attempt.quality,
        domain: "math",
      },
      { rootDir: opts?.rootDir },
    );
  } else {
    recordAttempt(recorded.childId, recorded.attempt);
  }
  appendAttemptLine(recorded.childId, {
    word: recorded.attempt.word,
    domain: recorded.attempt.domain,
    correct: recorded.attempt.correct,
    sessionId: recorded.sessionId,
    attemptedValue: recorded.attempt.attemptedValue,
    errorSignal: recorded.attempt.errorSignal,
  }, { rootDir: opts?.rootDir });
  console.log(
    `  🎮 [attempt_event] recorded ${recorded.attempt.domain}:${recorded.attempt.word} ` +
      `${recorded.attempt.correct ? "correct" : "incorrect"}`,
  );
  return recorded;
}
