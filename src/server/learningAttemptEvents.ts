import type {
  AttemptInput,
  ChildQuality,
  Domain,
  ScaffoldLevel,
} from "../algorithms/types";
import { recordAttempt } from "../engine/learningEngine";
import { recordFactAttempt } from "../engine/factBankRecorder";
import { appendAttemptLine } from "../utils/attempts";
import { getChildChart } from "../profiles/childChart";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { resolveSunnyRuntimeConfig } from "../shared/runtimeConfig";
import { shouldPersistSessionData } from "../utils/runtimeMode";

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
  targetId?: unknown;
  word?: unknown;
  attemptedValue?: unknown;
  correct?: unknown;
  quality?: unknown;
  scaffoldLevel?: unknown;
  responseTimeMs?: unknown;
  sessionId?: unknown;
  nodeId?: unknown;
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
  const childId = String(fallbackChildId ?? raw.childId ?? "").trim().toLowerCase();
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

  return { childId, attemptId, sessionId, attempt, skipped: false };
}

export function recordLearningAttempt(
  raw: RawLearningAttemptEvent,
  fallbackChildId?: string,
  opts?: { rootDir?: string },
): RecordedLearningAttempt {
  const runtime = resolveSunnyRuntimeConfig(process.env);
  const recorded = normalizeLearningAttemptEvent(raw, fallbackChildId ?? runtime.childId ?? undefined);
  if (!shouldPersistSessionData()) {
    console.log(` 🎮 [attempt_event] [preview-skipped] target=${recorded.attempt.word}`);
    return { ...recorded, skipped: true };
  }
  const chart = getChildChart(recorded.childId, opts);
  const mathHomeworkId = chart.homework?.activeByDomain?.math?.homeworkId;
  const cycle = chart.learningCycle?.domain === "math" ? chart.learningCycle
    : mathHomeworkId ? getLearningCycle(recorded.childId, mathHomeworkId, opts) : null;
  const spellingHomeworkId = chart.homework?.activeByDomain?.spelling?.homeworkId;
  const spelling = chart.learningCycle?.domain === "spelling" ? chart.learningCycle
    : spellingHomeworkId ? getLearningCycle(recorded.childId, spellingHomeworkId, opts) : null;
  const ownsItem = [cycle, spelling].some(candidate => candidate?.nodes.some(node => node.nodeId === raw.nodeId ||
    Object.keys(node.evidenceContract.itemContracts ?? node.evidenceContract.spellingItems ?? node.evidenceContract.itemRoles ?? {}).some(id => id.toLowerCase() === recorded.attempt.word)));
  const mathSession = runtime.subject === "homework" && runtime.homeworkDomain === "math" &&
    (!runtime.childId || runtime.childId === recorded.childId);
  const spellingSession = runtime.subject === "homework" && runtime.homeworkDomain === "spelling" &&
    (!runtime.childId || runtime.childId === recorded.childId) && spelling?.nodes.some(node => node.evidenceContract.spellingItems);
  if (mathSession || spellingSession || ownsItem) {
    console.log(` 🎮 [attempt_event] [canonical-scoring-deferred] target=${recorded.attempt.word}`);
    return { ...recorded, skipped: true };
  }
  if (recorded.attemptId && !rememberAttemptId(recorded.attemptId)) {
    console.log(
      `  🎮 [attempt_event] duplicate skipped ${recorded.attempt.domain}:${recorded.attempt.word}`,
    );
    return { ...recorded, skipped: true };
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
  });
  console.log(
    `  🎮 [attempt_event] recorded ${recorded.attempt.domain}:${recorded.attempt.word} ` +
      `${recorded.attempt.correct ? "correct" : "incorrect"}`,
  );
  return recorded;
}
