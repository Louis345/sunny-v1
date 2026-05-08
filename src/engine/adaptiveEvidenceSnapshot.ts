import fs from "fs";
import path from "path";
import type { HomeworkCycle, InterventionMeasurement } from "../context/schemas/homeworkCycle";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { ResolvedAttentionModel } from "./attentionModel";
import type { AdaptiveEvaluatorSummary } from "./evaluator/evaluator";
import { buildEvaluatorSummary } from "./evaluator/evaluator";
import { getChildChart } from "../profiles/childChart";

export type EvidenceSourceStatus = "ready" | "provisional" | "missing";
export type QuestReadinessLevel = "blocked" | "low" | "medium" | "high";

export type AdaptiveEvidenceSource = {
  status: EvidenceSourceStatus;
  confidence: number;
  evidenceIds: string[];
  summary: string;
};

export type AdaptiveEvidenceSnapshot = {
  childId: string;
  homeworkId: string | null;
  createdAt: string;
  attention: ResolvedAttentionModel;
  sources: {
    capturedHomework: AdaptiveEvidenceSource;
    baselineActivities: AdaptiveEvidenceSource;
    attention: AdaptiveEvidenceSource;
    tutoringContext: AdaptiveEvidenceSource;
    companionSignals: AdaptiveEvidenceSource;
  };
  evidenceIds: string[];
  evaluator: AdaptiveEvaluatorSummary;
  questReadiness: {
    level: QuestReadinessLevel;
    confidence: number;
    blockers: string[];
    reason: string;
  };
  preQuestTheory: HomeworkCycle["theory"] | null;
};

export type QuestGateDecision = {
  canOpenQuest: boolean;
  needsHumanReview: boolean;
  reason: string;
  requiredMissingEvidence: string[];
};

export type AdaptiveEvidenceSnapshotOptions = {
  rootDir?: string;
  homeworkId?: string;
  now?: Date;
};

function contextDir(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId);
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function listFiles(dir: string, predicate: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(predicate)
      .map((file) => path.join(dir, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch {
    return [];
  }
}

function resolveHomeworkId(
  profile: LearningProfile,
  explicitHomeworkId?: string,
): string | null {
  if (explicitHomeworkId?.trim()) return explicitHomeworkId.trim();
  const pending = profile.pendingHomework as
    | (LearningProfile["pendingHomework"] & { homeworkId?: string })
    | undefined;
  return pending?.homeworkId ?? null;
}

function readCycle(rootDir: string, childId: string, homeworkId: string | null): HomeworkCycle | null {
  if (!homeworkId) return null;
  return readJson<HomeworkCycle>(
    path.join(contextDir(rootDir, childId), "homework", "cycles", `${homeworkId}.json`),
  );
}

function compactText(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function confidenceAverage(sources: AdaptiveEvidenceSource[]): number {
  if (!sources.length) return 0;
  const total = sources.reduce((sum, source) => sum + source.confidence, 0);
  return Math.round((total / sources.length) * 100) / 100;
}

function capturedHomeworkSource(
  homeworkId: string | null,
  cycle: HomeworkCycle | null,
  profile: LearningProfile,
): AdaptiveEvidenceSource {
  const captured = cycle?.capturedContent ?? profile.pendingHomework?.capturedContent ?? null;
  if (!captured) {
    return {
      status: "missing",
      confidence: 0,
      evidenceIds: [],
      summary: "No captured homework content is available.",
    };
  }
  const questionCount = Array.isArray(captured.questions) ? captured.questions.length : 0;
  const wordCount = Array.isArray(captured.words) ? captured.words.length : 0;
  const docCount = Array.isArray(captured.sourceDocuments) ? captured.sourceDocuments.length : 0;
  return {
    status: "ready",
    confidence: questionCount > 0 || wordCount > 0 ? 0.9 : 0.7,
    evidenceIds: homeworkId ? [`homework:${homeworkId}`] : ["homework:pending"],
    summary: `${captured.title || "Captured homework"} with ${questionCount} question(s), ${wordCount} word(s), ${docCount} source document(s).`,
  };
}

function baselineMeasurements(cycle: HomeworkCycle | null): InterventionMeasurement[] {
  if (!cycle) return [];
  return [
    ...(cycle.interventionHistory ?? []),
    ...(cycle.questMeasurement ? [cycle.questMeasurement] : []),
  ].filter((measurement) => measurement.nodeType !== "quest" && measurement.nodeType !== "boss");
}

function baselineActivitiesSource(cycle: HomeworkCycle | null): AdaptiveEvidenceSource {
  const measurements = baselineMeasurements(cycle);
  if (measurements.length > 0) {
    const latest = measurements[measurements.length - 1]!;
    return {
      status: "ready",
      confidence: 0.78,
      evidenceIds: measurements.map((measurement) => `baseline:${measurement.nodeId}`),
      summary: `${measurements.length} baseline measurement(s); latest ${latest.nodeType} accuracy ${Math.round(latest.interventionAccuracy * 100)}%.`,
    };
  }
  if (cycle?.theory) {
    return {
      status: "provisional",
      confidence: 0.35,
      evidenceIds: [`theory:${cycle.theory.theoryId}`],
      summary: "A pre-quest theory exists, but no baseline node measurements have been recorded yet.",
    };
  }
  return {
    status: "missing",
    confidence: 0,
    evidenceIds: [],
    summary: "No baseline activity measurements have been recorded.",
  };
}

function attentionSource(attention: ResolvedAttentionModel): AdaptiveEvidenceSource {
  const ready = attention.status === "measured" && attention.confidence >= 0.55;
  return {
    status: ready ? "ready" : "provisional",
    confidence: ready ? attention.confidence : Math.max(0.1, Math.min(attention.confidence, 0.45)),
    evidenceIds: [`attention:${attention.source}`],
    summary: `${attention.label} attention window ${attention.currentWindow_ms}ms from ${attention.source} (${attention.status}).`,
  };
}

function textSourceFromDir(input: {
  dir: string;
  idPrefix: string;
  readySummary: string;
  missingSummary: string;
  extensions: string[];
}): AdaptiveEvidenceSource {
  const files = listFiles(input.dir, (file) =>
    input.extensions.some((ext) => file.toLowerCase().endsWith(ext)),
  );
  if (!files.length) {
    return {
      status: "missing",
      confidence: 0,
      evidenceIds: [],
      summary: input.missingSummary,
    };
  }
  const latest = files[0]!;
  let text = "";
  try {
    text = fs.readFileSync(latest, "utf8");
  } catch {
    text = "";
  }
  return {
    status: "ready",
    confidence: 0.68,
    evidenceIds: [`${input.idPrefix}:${path.basename(latest)}`],
    summary: `${input.readySummary}: ${compactText(text || path.basename(latest))}`,
  };
}

function tutoringSource(rootDir: string, childId: string): AdaptiveEvidenceSource {
  return textSourceFromDir({
    dir: path.join(contextDir(rootDir, childId), "tutoring", "processed"),
    idPrefix: "tutoring",
    readySummary: "Recent tutoring context found",
    missingSummary: "No processed tutoring context found.",
    extensions: [".md", ".txt", ".json"],
  });
}

function companionSignalsSource(rootDir: string, childId: string): AdaptiveEvidenceSource {
  return textSourceFromDir({
    dir: path.join(contextDir(rootDir, childId), "session_notes"),
    idPrefix: "companion",
    readySummary: "Recent companion/session signal found",
    missingSummary: "No companion or session signal summary found.",
    extensions: [".md", ".txt"],
  });
}

function questReadiness(
  sources: AdaptiveEvidenceSnapshot["sources"],
): AdaptiveEvidenceSnapshot["questReadiness"] {
  const blockers: string[] = [];
  if (sources.capturedHomework.status !== "ready") blockers.push("captured_homework_missing");
  if (sources.baselineActivities.status === "missing") blockers.push("baseline_measurements_missing");

  const allSources = Object.values(sources);
  const confidence = confidenceAverage(allSources);
  if (blockers.length > 0) {
    return {
      level: "blocked",
      confidence,
      blockers,
      reason: `Quest blocked: ${blockers.join(", ")}.`,
    };
  }

  const readyCount = allSources.filter((source) => source.status === "ready").length;
  const level: QuestReadinessLevel =
    readyCount >= 5 && confidence >= 0.65
      ? "high"
      : readyCount >= 2
        ? "medium"
        : "low";
  return {
    level,
    confidence,
    blockers,
    reason: `Quest ${level} confidence from captured homework, baseline activities, attention, tutoring, and companion evidence statuses.`,
  };
}

export function questGateFromSnapshot(snapshot: AdaptiveEvidenceSnapshot): QuestGateDecision {
  const requiredMissingEvidence: string[] = [];
  if (snapshot.sources.capturedHomework.status !== "ready") {
    requiredMissingEvidence.push("captured_homework");
  }
  if (snapshot.sources.baselineActivities.status !== "ready") {
    requiredMissingEvidence.push("baseline_measurements");
  }
  if (!snapshot.preQuestTheory) {
    requiredMissingEvidence.push("pre_quest_theory");
  }

  const canOpenQuest = requiredMissingEvidence.length === 0;
  if (!canOpenQuest) {
    return {
      canOpenQuest: false,
      needsHumanReview: true,
      reason: `Quest gate blocked: missing ${requiredMissingEvidence.join(", ")}.`,
      requiredMissingEvidence,
    };
  }

  const reviewReasons: string[] = [];
  if (snapshot.questReadiness.level !== "high") {
    reviewReasons.push(`readiness=${snapshot.questReadiness.level}`);
  }
  if (snapshot.sources.attention.status !== "ready") {
    reviewReasons.push("attention_not_measured");
  }
  if (snapshot.sources.tutoringContext.status !== "ready") {
    reviewReasons.push("tutoring_context_missing");
  }
  if (snapshot.sources.companionSignals.status !== "ready") {
    reviewReasons.push("companion_signals_missing");
  }

  return {
    canOpenQuest: true,
    needsHumanReview: reviewReasons.length > 0,
    reason: reviewReasons.length
      ? `Quest can open after human review: ${reviewReasons.join(", ")}.`
      : "Quest can open without additional human review.",
    requiredMissingEvidence,
  };
}

export function buildAdaptiveEvidenceSnapshot(
  childIdRaw: string,
  opts: AdaptiveEvidenceSnapshotOptions = {},
): AdaptiveEvidenceSnapshot {
  const rootDir = opts.rootDir ?? process.cwd();
  const chart = getChildChart(childIdRaw, { rootDir });
  const childId = chart.childId;
  const homeworkId = resolveHomeworkId(chart.learningProfile, opts.homeworkId);
  const cycle = readCycle(rootDir, childId, homeworkId);
  const sources: AdaptiveEvidenceSnapshot["sources"] = {
    capturedHomework: capturedHomeworkSource(homeworkId, cycle, chart.learningProfile),
    baselineActivities: baselineActivitiesSource(cycle),
    attention: attentionSource(chart.attention),
    tutoringContext: tutoringSource(rootDir, childId),
    companionSignals: companionSignalsSource(rootDir, childId),
  };
  const evaluator = buildEvaluatorSummary({
    rootDir,
    childId,
    cycle,
    profile: chart.learningProfile,
    wordBank: chart.wordBank,
  });
  const evidenceIds = [
    ...Object.values(sources).flatMap((source) => source.evidenceIds),
    ...evaluator.evidenceIds,
  ];
  return {
    childId,
    homeworkId,
    createdAt: (opts.now ?? new Date()).toISOString(),
    attention: chart.attention,
    sources,
    evidenceIds,
    evaluator,
    questReadiness: questReadiness(sources),
    preQuestTheory: cycle?.theory ?? null,
  };
}
