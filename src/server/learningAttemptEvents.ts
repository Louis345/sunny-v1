import type {
  AttemptInput,
  ChildQuality,
  Domain,
  ScaffoldLevel,
} from "../algorithms/types";
import { recordAttempt } from "../engine/learningEngine";
import { appendAttemptLine } from "../utils/attempts";

const DOMAINS: ReadonlySet<string> = new Set([
  "spelling",
  "reading",
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
  word?: unknown;
  attemptedValue?: unknown;
  correct?: unknown;
  quality?: unknown;
  scaffoldLevel?: unknown;
  responseTimeMs?: unknown;
  sessionId?: unknown;
};

export type RecordedLearningAttempt = {
  childId: string;
  attemptId?: string;
  sessionId?: string;
  attempt: AttemptInput;
  skipped: boolean;
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

export function normalizeLearningAttemptEvent(
  raw: RawLearningAttemptEvent,
  fallbackChildId?: string,
): RecordedLearningAttempt {
  const childId = String(raw.childId ?? fallbackChildId ?? "").trim().toLowerCase();
  if (!childId) throw new Error("Missing attempt childId");

  const word = String(raw.target ?? raw.word ?? "").trim().toLowerCase();
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

  return { childId, attemptId, sessionId, attempt, skipped: false };
}

export function recordLearningAttempt(
  raw: RawLearningAttemptEvent,
  fallbackChildId?: string,
): RecordedLearningAttempt {
  const recorded = normalizeLearningAttemptEvent(raw, fallbackChildId);
  if (recorded.attemptId && !rememberAttemptId(recorded.attemptId)) {
    console.log(
      `  🎮 [attempt_event] duplicate skipped ${recorded.attempt.domain}:${recorded.attempt.word}`,
    );
    return { ...recorded, skipped: true };
  }
  recordAttempt(recorded.childId, recorded.attempt);
  appendAttemptLine(recorded.childId, {
    word: recorded.attempt.word,
    domain: recorded.attempt.domain,
    correct: recorded.attempt.correct,
    sessionId: recorded.sessionId,
    attemptedValue: recorded.attempt.attemptedValue,
    errorSignal: recorded.attempt.errorSignal,
  });
  console.log(
    `  🎮 [attempt_event] recorded ${recorded.attempt.domain}:${recorded.attempt.word} ` +
      `${recorded.attempt.correct ? "correct" : "incorrect"}`,
  );
  return recorded;
}
