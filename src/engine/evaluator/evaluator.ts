import fs from "fs";
import path from "path";
import type {
  AttemptLogRecord,
  AttemptSnapshot,
  Domain,
  SM2Track,
  WordEntry,
} from "../../algorithms/types";
import type { HomeworkCycle } from "../../context/schemas/homeworkCycle";
import type { LearningProfile } from "../../context/schemas/learningProfile";
import type { WordBankFile } from "../../context/schemas/wordBank";

export type EvaluatorStatus = "ready" | "provisional" | "missing";

export type EvaluatorBucket =
  | "mastered_now"
  | "known_but_slow"
  | "fragile"
  | "unknown";

export type EvaluatorTargetEvidence = {
  target: string;
  domain: string;
  bucket: EvaluatorBucket;
  confidence: number;
  attempts: {
    total: number;
    correct: number;
    incorrect: number;
    bestResponseTime_ms?: number;
  };
  evidenceIds: string[];
  reasons: string[];
};

export type AdaptiveEvaluatorSummary = {
  status: EvaluatorStatus;
  confidence: number;
  summary: string;
  evidenceIds: string[];
  buckets: Record<EvaluatorBucket, string[]>;
  items: EvaluatorTargetEvidence[];
};

export type EvaluatorNodeTargetResult = {
  target: string;
  correct: boolean;
  attempts?: number;
  attemptedValue?: string;
  responseTime_ms?: number;
};

export type EvaluateNodeCompletionInput = {
  childId: string;
  homeworkId?: string | null;
  nodeId: string;
  nodeType: string;
  domain?: string;
  targets: string[];
  targetResults?: EvaluatorNodeTargetResult[];
};

type AttemptLogEvidence = AttemptLogRecord & {
  responseTimeMs?: number;
  quality?: number;
  scaffoldLevel?: number;
  evidenceId: string;
  timestampMs: number;
};

type EvaluatorProfileInput = Pick<LearningProfile, "pendingHomework">;

function emptyBuckets(): AdaptiveEvaluatorSummary["buckets"] {
  return {
    mastered_now: [],
    known_but_slow: [],
    fragile: [],
    unknown: [],
  };
}

export function normalizeEvaluatorTarget(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9'\s-]/g, "").replace(/\s+/g, " ").trim();
}

function contextDir(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId);
}

function targetWords(
  cycle: HomeworkCycle | null,
  profile: EvaluatorProfileInput,
): string[] {
  const raw = cycle
    ? [
        ...(cycle.capturedContent?.words ?? []),
        ...(cycle.wordList ?? []),
      ]
    : [
        ...(profile.pendingHomework?.capturedContent?.words ?? []),
        ...(profile.pendingHomework?.wordList ?? []),
      ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const normalized = normalizeEvaluatorTarget(String(value));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

const VALID_DOMAINS: ReadonlySet<string> = new Set([
  "spelling",
  "reading",
  "segmentation",
  "math",
  "clocks",
  "history",
]);

function normalizeDomain(value: string | null | undefined): Domain | null {
  const raw = String(value ?? "").toLowerCase();
  const domain =
    raw.includes("spell")
      ? "spelling"
      : raw.includes("read") || raw.includes("science")
        ? "reading"
        : raw.includes("clock")
          ? "clocks"
          : raw.includes("math")
            ? "math"
            : raw.includes("history")
              ? "history"
              : raw.includes("segment")
                ? "segmentation"
                : raw;
  return VALID_DOMAINS.has(domain) ? domain as Domain : null;
}

function preferredDomain(cycle: HomeworkCycle | null, profile: EvaluatorProfileInput): Domain {
  return (
    normalizeDomain(cycle?.subject) ??
    normalizeDomain(cycle?.contentProfile?.practiceDomain) ??
    normalizeDomain(profile.pendingHomework?.contentProfile?.practiceDomain) ??
    "spelling"
  );
}

function readAttemptEvidence(
  rootDir: string,
  childId: string,
): AttemptLogEvidence[] {
  const dir = path.join(contextDir(rootDir, childId), "attempts");
  if (!fs.existsSync(dir)) return [];
  const records: AttemptLogEvidence[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson")).sort()) {
    const full = path.join(dir, file);
    let lines: string[] = [];
    try {
      lines = fs.readFileSync(full, "utf8").split(/\n+/).filter((line) => line.trim());
    } catch {
      continue;
    }
    lines.forEach((line, index) => {
      try {
        const parsed = JSON.parse(line) as AttemptLogRecord & {
          responseTimeMs?: number;
          quality?: number;
          scaffoldLevel?: number;
        };
        const word = normalizeEvaluatorTarget(String(parsed.word ?? ""));
        if (!word || typeof parsed.correct !== "boolean") return;
        records.push({
          ...parsed,
          word,
          evidenceId: `attempt:${file}:${index + 1}`,
          timestampMs: Date.parse(parsed.timestamp),
        });
      } catch {
        // Ignore malformed attempt lines; evaluator inspection should remain available.
      }
    });
  }
  return records.sort((a, b) => a.timestampMs - b.timestampMs);
}

function findWordEntry(wordBank: WordBankFile, target: string): WordEntry | null {
  return wordBank.words.find((entry) => normalizeEvaluatorTarget(entry.word) === target) ?? null;
}

function trackForTarget(
  entry: WordEntry | null,
  domain: Domain,
): { domain: Domain; track: SM2Track } | null {
  if (!entry) return null;
  const preferred = entry.tracks?.[domain];
  if (preferred) return { domain, track: preferred };
  const fallback = (Object.entries(entry.tracks ?? {}) as Array<[Domain, SM2Track | undefined]>)
    .find(([, track]) => track != null);
  return fallback?.[1] ? { domain: fallback[0], track: fallback[1] } : null;
}

function historyStats(history: AttemptSnapshot[]): {
  correct: number;
  incorrect: number;
  latestCorrect: boolean | null;
  latestQuality: number | null;
  latestScaffoldLevel: number | null;
} {
  const correct = history.filter((attempt) => attempt.correct).length;
  const incorrect = history.filter((attempt) => !attempt.correct).length;
  const latest = history[history.length - 1];
  return {
    correct,
    incorrect,
    latestCorrect: latest ? latest.correct : null,
    latestQuality: latest ? latest.quality : null,
    latestScaffoldLevel: latest ? latest.scaffoldLevel : null,
  };
}

function classifyEvaluatorTarget(input: {
  target: string;
  domain: Domain;
  attemptRows: AttemptLogEvidence[];
  entry: WordEntry | null;
  trackInfo: { domain: Domain; track: SM2Track } | null;
}): EvaluatorTargetEvidence {
  const history = input.trackInfo?.track.history ?? [];
  const historySummary = historyStats(history);
  const attemptCorrect = input.attemptRows.filter((attempt) => attempt.correct).length;
  const attemptIncorrect = input.attemptRows.filter((attempt) => !attempt.correct).length;
  const totalCorrect = attemptCorrect + historySummary.correct;
  const totalIncorrect = attemptIncorrect + historySummary.incorrect;
  const total = totalCorrect + totalIncorrect;
  const latestAttempt = input.attemptRows[input.attemptRows.length - 1];
  const latestCorrect = latestAttempt?.correct ?? historySummary.latestCorrect;
  const bestResponseTime_ms = input.entry?.wordRadarBestTime_ms;
  const slowBest = typeof bestResponseTime_ms === "number" && bestResponseTime_ms > 3000;
  const mastered = input.trackInfo?.track.mastered === true;
  const highQualityCorrect =
    latestCorrect === true &&
    historySummary.latestQuality != null &&
    historySummary.latestQuality >= 5 &&
    (historySummary.latestScaffoldLevel ?? 0) === 0 &&
    totalIncorrect === 0 &&
    !slowBest;
  const hasAttemptLog = input.attemptRows.length > 0;
  const hasWordBank = input.trackInfo != null;
  const evidenceIds = [
    ...(hasAttemptLog ? [`evaluator:${input.target}:attempt_log`] : []),
    ...(hasWordBank ? [`evaluator:${input.target}:word_bank`] : []),
  ];
  const reasons: string[] = [];

  let bucket: EvaluatorBucket;
  let confidence: number;
  if (total === 0) {
    bucket = "unknown";
    confidence = 0.25;
    reasons.push("no_evaluator_evidence_yet");
  } else if (totalCorrect === 0) {
    bucket = "unknown";
    confidence = 0.68;
    reasons.push("all_attempts_incorrect");
  } else if (totalIncorrect > 0) {
    bucket = "fragile";
    confidence = 0.72;
    reasons.push("mixed_correct_and_incorrect");
  } else if (mastered || highQualityCorrect || totalCorrect >= 2) {
    bucket = "mastered_now";
    confidence = mastered ? 0.92 : 0.82;
    reasons.push(mastered ? "word_bank_mastered" : "high_quality_correct");
  } else {
    bucket = "known_but_slow";
    confidence = slowBest ? 0.72 : 0.62;
    reasons.push(slowBest ? "slow_word_radar_best_time" : "correct_but_not_mastered");
  }

  return {
    target: input.target,
    domain: input.trackInfo?.domain ?? input.domain,
    bucket,
    confidence,
    attempts: {
      total,
      correct: totalCorrect,
      incorrect: totalIncorrect,
      ...(typeof bestResponseTime_ms === "number" ? { bestResponseTime_ms } : {}),
    },
    evidenceIds,
    reasons,
  };
}

function classifyNodeTarget(input: {
  target: string;
  domain: Domain;
  nodeId: string;
  rows: EvaluatorNodeTargetResult[];
}): EvaluatorTargetEvidence {
  const correct = input.rows.filter((row) => row.correct).length;
  const incorrect = input.rows.filter((row) => !row.correct).length;
  const total = correct + incorrect;
  const latest = input.rows[input.rows.length - 1];
  const slowOrRetried =
    input.rows.some((row) => (row.attempts ?? 1) > 1) ||
    input.rows.some((row) => Number(row.responseTime_ms ?? 0) > 3000);
  const evidenceIds = total > 0 ? [`evaluator:${input.target}:node:${input.nodeId}`] : [];
  const reasons: string[] = [];

  let bucket: EvaluatorBucket;
  let confidence: number;
  if (total === 0) {
    bucket = "unknown";
    confidence = 0.25;
    reasons.push("no_evaluator_evidence_yet");
  } else if (correct > 0 && incorrect > 0) {
    bucket = "fragile";
    confidence = 0.72;
    reasons.push("mixed_correct_and_incorrect");
  } else if (correct > 0 && slowOrRetried) {
    bucket = "known_but_slow";
    confidence = 0.72;
    reasons.push("multiple_attempts_or_slow_response");
  } else if (correct > 0) {
    bucket = "mastered_now";
    confidence = 0.82;
    reasons.push("fast_independent_correct");
  } else if (latest?.attemptedValue) {
    bucket = "fragile";
    confidence = 0.62;
    reasons.push("incorrect_attempt_with_production");
  } else {
    bucket = "unknown";
    confidence = 0.68;
    reasons.push("all_attempts_incorrect");
  }

  return {
    target: input.target,
    domain: input.domain,
    bucket,
    confidence,
    attempts: {
      total,
      correct,
      incorrect,
      ...(typeof latest?.responseTime_ms === "number" ? { bestResponseTime_ms: latest.responseTime_ms } : {}),
    },
    evidenceIds,
    reasons,
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function summaryFromItems(items: EvaluatorTargetEvidence[]): AdaptiveEvaluatorSummary {
  const buckets = emptyBuckets();
  for (const item of items) {
    buckets[item.bucket].push(item.target);
  }
  const evidenceIds = [...new Set(items.flatMap((item) => item.evidenceIds))];
  const status: EvaluatorStatus =
    items.length === 0 ? "missing" : evidenceIds.length ? "ready" : "provisional";
  const confidence =
    status === "missing" ? 0 : status === "ready" ? average(items.map((item) => item.confidence)) : 0.25;
  return {
    status,
    confidence,
    summary:
      items.length === 0
        ? "No current homework targets are available for evaluator aggregation."
        : `${items.length} target(s): ` +
          `mastered_now=${buckets.mastered_now.length}, ` +
          `known_but_slow=${buckets.known_but_slow.length}, ` +
          `fragile=${buckets.fragile.length}, ` +
          `unknown=${buckets.unknown.length}.`,
    evidenceIds,
    buckets,
    items,
  };
}

export function evaluateNodeCompletion(input: EvaluateNodeCompletionInput): AdaptiveEvaluatorSummary {
  const domain = normalizeDomain(input.domain) ?? normalizeDomain(input.nodeType) ?? "spelling";
  const targetResults = input.targetResults ?? [];
  const targets = [...new Set(input.targets.map(normalizeEvaluatorTarget).filter(Boolean))];
  const items = targets.map((target) =>
    classifyNodeTarget({
      target,
      domain,
      nodeId: input.nodeId,
      rows: targetResults.filter((row) => normalizeEvaluatorTarget(row.target) === target),
    }),
  );
  return summaryFromItems(items);
}

export function buildEvaluatorSummary(input: {
  rootDir: string;
  childId: string;
  cycle: HomeworkCycle | null;
  profile: EvaluatorProfileInput;
  wordBank: WordBankFile;
}): AdaptiveEvaluatorSummary {
  const targets = targetWords(input.cycle, input.profile);
  const domain = preferredDomain(input.cycle, input.profile);
  if (!targets.length) {
    return summaryFromItems([]);
  }

  const attemptRows = readAttemptEvidence(input.rootDir, input.childId);
  const items = targets.map((target) => {
    const rows = attemptRows.filter((attempt) => normalizeEvaluatorTarget(attempt.word) === target);
    const entry = findWordEntry(input.wordBank, target);
    return classifyEvaluatorTarget({
      target,
      domain: normalizeDomain(rows[rows.length - 1]?.domain) ?? domain,
      attemptRows: rows,
      entry,
      trackInfo: trackForTarget(entry, domain),
    });
  });
  return summaryFromItems(items);
}
