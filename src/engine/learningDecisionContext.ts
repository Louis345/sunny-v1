import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { ErrorSignal, QuestThreshold, WordEntry } from "../algorithms/types";
import type {
  AIContentCatalogItem,
  ActivityModelEntry,
  LearningCalibrationEntry,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type {
  CapturedHomeworkContentRecord,
  HomeworkCalibrationEntry,
  HomeworkCycle,
} from "../context/schemas/homeworkCycle";
import { evaluateQuestThreshold } from "./error-signals/questThreshold";
import { scanChildErrorPatterns } from "./error-signals/patternDetector";
import { resolveAttentionModel, type ResolvedAttentionModel } from "./attentionModel";
import { getChildChart, type ChildChart } from "../profiles/childChart";
import {
  appendDecisionTrace,
  hydrateLearningProfileFromWaterfall,
  slimLearningProfileForDoorway,
} from "../profiles/chartWaterfall";
import { resolveChildContextDir } from "../utils/contextRoot";

type RootOptions = {
  rootDir?: string;
  now?: Date;
};

export type ActivityEvidence = {
  activityId: string;
  domain: string;
  completed: boolean;
  accuracy: number;
  targetCount?: number;
  timeSpent_ms?: number;
  engagementScore?: number;
  frustrationScore?: number;
  liked?: boolean | null;
  missedWords?: string[];
  evidenceTier?: "practice" | "clean_recall" | "mastery_candidate" | "calibration_required";
  occurredAt?: string;
  contentId?: string;
};

export type GradedHomeworkCalibrationInput = {
  homeworkId: string;
  gradedAt?: string;
  score?: number | null;
  gradedItems: Array<{
    target: string;
    correct: boolean;
    observedErrorType?: string;
    note?: string;
  }>;
  teacherNotes?: string;
};

export type HomeworkCatalogNode = {
  id: string;
  type: string;
  words?: string[];
  rationale?: string;
  storyTitle?: string;
  storyImagePrompt?: string;
  gameFile?: string | null;
  adaptiveArtifact?: {
    artifactId: string;
    contentId: string;
    homeworkId: string;
    theoryId: string;
    generationStage: "quest" | "boss";
    targetGroupIds: string[];
    homeworkWordIds: string[];
    baselineEvidenceIds: string[];
    generatedPath?: string;
  };
};

export type HomeworkCatalogBaselineActivity = {
  id: "reading-mode" | "countdown-comprehension";
  sourcePrototype: string;
  reason: string;
};

export type LearningDecisionContext = {
  childId: string;
  chart: {
    childId: string;
    manifestSource: ChildChart["manifestSource"];
    links: ChildChart["links"];
    wordBankSummary: ChildChart["wordBankSummary"];
    economy: ChildChart["economy"];
    activeSessionPlan: ChildChart["activeSessionPlan"];
  };
  profile: {
    age: number;
    grade: number;
    /** @deprecated intake/static label. Prefer attention.legacyDemographicLabel. */
    attentionSpan: string;
    attention: ResolvedAttentionModel;
    activityModel: Record<string, ActivityModelEntry>;
  };
  homework: {
    homeworkId: string | null;
    title: string;
    topic: string;
    type: string;
    testDate: string | null;
    daysUntilDue: number | null;
    urgency: "low" | "medium" | "high";
    contentFingerprint?: string;
    calibrationStatus: string;
    capturedContent: LearningProfile["pendingHomework"] extends infer P
      ? P extends { capturedContent?: infer C }
        ? C
        : unknown
      : unknown;
  } | null;
  memory: {
    dueWords: string[];
  };
  diagnostics: {
    strongPatterns: ErrorSignal[];
    questThreshold: QuestThreshold;
    calibrationJournal: LearningCalibrationEntry[];
  };
  contentCatalog: {
    reusable: AIContentCatalogItem[];
    needsRevision: AIContentCatalogItem[];
    retired: AIContentCatalogItem[];
    candidates: AIContentCatalogItem[];
  };
  algorithmFeeds: Array<{
    id: string;
    status: "ready" | "empty";
    summary: string;
  }>;
};

function contextDir(rootDir: string, childId: string): string {
  return resolveChildContextDir(childId, { rootDir });
}

function profilePath(rootDir: string, childId: string): string {
  return path.join(contextDir(rootDir, childId), "learning_profile.json");
}

function wordBankPath(rootDir: string, childId: string): string {
  return path.join(contextDir(rootDir, childId), "word_bank.json");
}

function cyclePath(rootDir: string, childId: string, homeworkId: string): string {
  return path.join(contextDir(rootDir, childId), "homework", "cycles", `${homeworkId}.json`);
}

function cyclesDir(rootDir: string, childId: string): string {
  return path.join(contextDir(rootDir, childId), "homework", "cycles");
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readProfile(rootDir: string, childId: string): LearningProfile {
  const profile = readJson<LearningProfile>(profilePath(rootDir, childId));
  if (!profile) {
    throw new Error(`Learning profile not found for child: ${childId}`);
  }
  return hydrateLearningProfileFromWaterfall(childId, profile, { rootDir });
}

function readCycles(rootDir: string, childId: string): HomeworkCycle[] {
  const dir = cyclesDir(rootDir, childId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<HomeworkCycle>(path.join(dir, file)))
    .filter((cycle): cycle is HomeworkCycle => cycle != null);
}

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isoNow(opts?: RootOptions): string {
  return (opts?.now ?? new Date()).toISOString();
}

function today(opts?: RootOptions): string {
  return isoNow(opts).slice(0, 10);
}

function daysUntil(date: string | null | undefined, now: Date): number | null {
  if (!date) return null;
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  const current = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.ceil((parsed - current) / 86_400_000);
}

function urgencyFor(days: number | null): "low" | "medium" | "high" {
  if (days == null) return "low";
  if (days <= 5) return "high";
  if (days <= 14) return "medium";
  return "low";
}

function dueWords(rootDir: string, childId: string, todayIso: string): string[] {
  const bank = readJson<{ words?: WordEntry[] }>(wordBankPath(rootDir, childId));
  return [...new Set((bank?.words ?? [])
    .filter((entry) =>
      Object.values(entry.tracks ?? {}).some((track) => track && track.nextReviewDate <= todayIso))
    .map((entry) => entry.word))];
}

function contentCatalogBuckets(items: AIContentCatalogItem[] | undefined): LearningDecisionContext["contentCatalog"] {
  const all = items ?? [];
  return {
    reusable: all.filter((item) => item.reuseStatus === "reuse"),
    needsRevision: all.filter((item) => item.reuseStatus === "revise"),
    retired: all.filter((item) => item.reuseStatus === "retire"),
    candidates: all.filter((item) => item.reuseStatus === "candidate"),
  };
}

function contentItemTypeForNode(node: HomeworkCatalogNode): AIContentCatalogItem["type"] | null {
  if (node.type === "karaoke") return "story";
  if (node.type === "quest" || node.type === "boss" || node.type === "wheel-of-fortune") return "game";
  if (
    node.type === "word-radar" ||
    node.type === "spell-check" ||
    node.type === "word-builder" ||
    node.type === "letter-rush"
  ) return "quiz";
  return null;
}

function algorithmTargetsForNode(
  node: HomeworkCatalogNode,
  captured: CapturedHomeworkContentRecord,
): AIContentCatalogItem["algorithmTargets"] {
  if (node.type === "karaoke") {
    return ["reading-comprehension", "retrieval-practice", "activity-affinity"];
  }
  if (node.type === "quest") {
    return ["error-pattern-remediation", "retrieval-practice", "desirable-difficulty"];
  }
  if (node.type === "boss") {
    return ["mastery-gating", "retrieval-practice"];
  }
  if (
    node.type === "word-radar" ||
    node.type === "spell-check" ||
    node.type === "word-builder" ||
    node.type === "letter-rush"
  ) {
    return ["spaced-repetition", "retrieval-practice"];
  }
  if (node.type === "wheel-of-fortune") {
    return ["retrieval-practice", "activity-affinity", "variable-reward"];
  }
  return captured.contentProfile.practiceDomain === "reading"
    ? ["reading-comprehension", "retrieval-practice"]
    : ["retrieval-practice"];
}

function contentItemForBaselineActivity(
  args: {
    childId: string;
    homeworkId: string;
    captured: CapturedHomeworkContentRecord;
    contentFingerprint: string;
    activity: HomeworkCatalogBaselineActivity;
  },
): AIContentCatalogItem {
  const type: AIContentCatalogItem["type"] =
    args.activity.id === "reading-mode" ? "reading-mode" : "countdown";
  const algorithmTargets: AIContentCatalogItem["algorithmTargets"] =
    args.activity.id === "reading-mode"
      ? ["reading-comprehension", "pronunciation", "activity-affinity"]
      : ["retrieval-practice", "reading-comprehension", "desirable-difficulty"];
  return {
    contentId: `${args.homeworkId}:${args.activity.id}`,
    homeworkId: args.homeworkId,
    childId: args.childId,
    type,
    source: "prototype",
    title: `${args.captured.title} - ${args.activity.id}`,
    algorithmTargets,
    targetSkills: [args.captured.contentProfile.primarySkill],
    targetConcepts: [...args.captured.contentProfile.concepts],
    targetWords: [...args.captured.words],
    engagementHooks: [],
    inputEvidence: {
      contentFingerprint: args.contentFingerprint,
    },
    reuseStatus: "candidate",
    reuseReason: args.activity.reason,
  };
}

export function buildHomeworkContentCatalogItems(args: {
  childId: string;
  homeworkId: string;
  capturedContent: CapturedHomeworkContentRecord;
  contentFingerprint: string;
  nodes: HomeworkCatalogNode[];
  baselineActivities?: HomeworkCatalogBaselineActivity[];
}): AIContentCatalogItem[] {
  const items: AIContentCatalogItem[] = [];
  for (const node of args.nodes) {
    const type = contentItemTypeForNode(node);
    if (!type) continue;
    const isGenerated = Boolean(node.gameFile) || node.type === "karaoke" || node.type === "quest" || node.type === "boss";
    const item: AIContentCatalogItem = {
      contentId: `${args.homeworkId}:${node.id}`,
      homeworkId: args.homeworkId,
      childId: args.childId,
      type,
      source: isGenerated ? "generated" : "baseline",
      title: node.storyTitle ?? `${args.capturedContent.title} - ${node.type}`,
      algorithmTargets: algorithmTargetsForNode(node, args.capturedContent),
      targetSkills: [args.capturedContent.contentProfile.primarySkill],
      targetConcepts: [...args.capturedContent.contentProfile.concepts],
      targetWords: [...(node.words?.length ? node.words : args.capturedContent.words)],
      engagementHooks: [],
      inputEvidence: {
        contentFingerprint: args.contentFingerprint,
        ...(node.adaptiveArtifact
          ? {
              patternIds: [node.adaptiveArtifact.theoryId, ...node.adaptiveArtifact.targetGroupIds],
              activityEvidenceIds: node.adaptiveArtifact.baselineEvidenceIds,
            }
          : {}),
      },
      reuseStatus: "candidate",
      reuseReason: node.rationale ?? "Cataloged from the homework node plan.",
    };
    const validation = validateContentCatalogItem(item);
    if (!validation.ok) throw new Error(validation.error);
    items.push(item);
    if (node.type === "karaoke" && node.storyImagePrompt) {
      items.push({
        contentId: `${args.homeworkId}:${node.id}:image`,
        homeworkId: args.homeworkId,
        childId: args.childId,
        type: "image",
        source: "generated",
        title: `${item.title} illustration`,
        algorithmTargets: ["variable-reward", "reading-comprehension", "activity-affinity"],
        targetSkills: [args.capturedContent.contentProfile.primarySkill],
        targetConcepts: [...args.capturedContent.contentProfile.concepts],
        targetWords: [...args.capturedContent.words],
        engagementHooks: [],
        inputEvidence: {
          contentFingerprint: args.contentFingerprint,
        },
        reuseStatus: "candidate",
        reuseReason: "Story image finale generated as a visual reward tied to reading comprehension.",
      });
    }
  }
  for (const activity of args.baselineActivities ?? []) {
    const item = contentItemForBaselineActivity({
      childId: args.childId,
      homeworkId: args.homeworkId,
      captured: args.capturedContent,
      contentFingerprint: args.contentFingerprint,
      activity,
    });
    const validation = validateContentCatalogItem(item);
    if (!validation.ok) throw new Error(validation.error);
    items.push(item);
  }
  return items;
}

export function upsertProfileContentCatalog(
  profile: LearningProfile,
  items: AIContentCatalogItem[],
): LearningProfile {
  const validItems = items.map((item) => {
    const validation = validateContentCatalogItem(item);
    if (!validation.ok) throw new Error(validation.error);
    return item;
  });
  const nextIds = new Set(validItems.map((item) => item.contentId));
  return {
    ...profile,
    aiContentCatalog: [
      ...validItems,
      ...(profile.aiContentCatalog ?? []).filter((item) => !nextIds.has(item.contentId)),
    ].slice(0, 500),
  };
}

function currentCycle(profile: LearningProfile, cycles: HomeworkCycle[]): HomeworkCycle | null {
  const homeworkId = (profile.pendingHomework as (LearningProfile["pendingHomework"] & { homeworkId?: string }) | undefined)?.homeworkId;
  if (!homeworkId) return null;
  return cycles.find((cycle) => cycle.homeworkId === homeworkId) ?? null;
}

export function buildLearningDecisionContext(
  childId: string,
  opts: RootOptions = {},
): LearningDecisionContext {
  const rootDir = opts.rootDir ?? process.cwd();
  const now = opts.now ?? new Date();
  const chart = getChildChart(childId, { rootDir });
  const profile = chart.learningProfile;
  const cycles = readCycles(rootDir, childId);
  const cycle = currentCycle(profile, cycles);
  const pending = chart.homework.pending;
  const patternResult = scanChildErrorPatterns(childId, { rootDir, now });
  const questThreshold = evaluateQuestThreshold({
    totalSessions: profile.sessionStats.totalSessions,
    patterns: patternResult.patterns,
  });
  const due = daysUntil(pending?.testDate, now);
  const homework = pending
    ? {
        homeworkId: (pending as typeof pending & { homeworkId?: string }).homeworkId ?? null,
        title: pending.capturedContent?.title ?? pending.weekOf,
        topic: pending.contentProfile?.topic ?? pending.capturedContent?.contentProfile?.topic ?? "homework",
        type: pending.capturedContent?.type ?? "generic",
        testDate: pending.testDate,
        daysUntilDue: due,
        urgency: urgencyFor(due),
        contentFingerprint: cycle?.contentFingerprint,
        calibrationStatus: cycle?.calibrationStatus ?? "unverified",
        capturedContent: pending.capturedContent ?? null,
      }
    : null;
  const calibrationJournal = profile.learningCalibrationJournal ?? [];
  const attention = chart.attention ?? resolveAttentionModel(profile);
  return {
    childId,
    chart: {
      childId: chart.childId,
      manifestSource: chart.manifestSource,
      links: chart.links,
      wordBankSummary: chart.wordBankSummary,
      economy: chart.economy,
      activeSessionPlan: chart.activeSessionPlan,
    },
    profile: {
      age: profile.demographics.age,
      grade: profile.demographics.grade,
      attentionSpan: profile.demographics.attentionSpan,
      attention,
      activityModel: profile.activityModel ?? {},
    },
    homework,
    memory: {
      dueWords: dueWords(rootDir, childId, today(opts)),
    },
    diagnostics: {
      strongPatterns: patternResult.patterns,
      questThreshold,
      calibrationJournal,
    },
    contentCatalog: contentCatalogBuckets(chart.contentCatalog.items),
    algorithmFeeds: [
      { id: "spaced-repetition", status: "ready", summary: "Due words loaded from word_bank.json." },
      { id: "error-pattern-detector", status: patternResult.patterns.length ? "ready" : "empty", summary: `${patternResult.patterns.length} strong pattern(s).` },
      { id: "quest-threshold", status: questThreshold.unlocked ? "ready" : "empty", summary: questThreshold.reason },
      { id: "activity-affinity", status: Object.keys(profile.activityModel ?? {}).length ? "ready" : "empty", summary: "Child activity response model from profile." },
      { id: "attention-vitals", status: attention.status === "measured" ? "ready" : "empty", summary: `${attention.label} attention window from ${attention.source} (${Math.round(attention.confidence * 100)}% confidence).` },
      { id: "calibration-journal", status: calibrationJournal.length ? "ready" : "empty", summary: `${calibrationJournal.length} graded reality check(s).` },
    ],
  };
}

function normalizedDomain(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "general";
}

function updateAdaptiveLoadState(
  profile: LearningProfile,
  evidence: ActivityEvidence,
  opts: RootOptions,
): LearningProfile["adaptiveLoadState"] {
  const domain = normalizedDomain(evidence.domain);
  const priorAll = profile.adaptiveLoadState ?? {};
  const prior = priorAll[domain];
  const accuracy = clamp01(evidence.accuracy, 0);
  const targetCount = Math.max(0, Math.floor(evidence.targetCount ?? 0));
  const frustrationScore = clamp01(evidence.frustrationScore ?? 0, 0);
  const strongEvidence =
    evidence.completed &&
    accuracy >= 0.85 &&
    targetCount >= 3 &&
    frustrationScore < 0.5;
  const weakEvidence =
    !evidence.completed || accuracy < 0.65 || frustrationScore >= 0.65;
  const priorSize = Math.max(1, Math.floor(prior?.currentCohortSize ?? 5));
  let currentCohortSize = priorSize;
  let challengeRecommendation: NonNullable<
    LearningProfile["adaptiveLoadState"]
  >[string]["challengeRecommendation"] = "maintain";
  if (strongEvidence) {
    currentCohortSize = Math.min(10, Math.max(priorSize, targetCount >= 5 ? 10 : 5));
    challengeRecommendation =
      currentCohortSize > priorSize ? "expand_cohort" : "harder_valid_node";
  } else if (weakEvidence) {
    currentCohortSize = Math.min(5, priorSize);
    challengeRecommendation = "targeted_support";
  }
  return {
    ...priorAll,
    [domain]: {
      domain,
      currentCohortSize,
      maxRecentSuccessfulCohort: strongEvidence
        ? Math.max(
            prior?.maxRecentSuccessfulCohort ?? 0,
            currentCohortSize,
            targetCount,
          )
        : prior?.maxRecentSuccessfulCohort ?? 0,
      challengeRecommendation,
      lastLoadEvidence: {
        activityId: evidence.activityId,
        completed: evidence.completed,
        accuracy,
        targetCount,
        frustrationScore,
        strongEvidence,
        occurredAt: evidence.occurredAt ?? isoNow(opts),
      },
    },
  };
}

export function appendChildActivityEvidence(
  childId: string,
  evidence: ActivityEvidence,
  opts: RootOptions = {},
): LearningProfile {
  const rootDir = opts.rootDir ?? process.cwd();
  const profile = readProfile(rootDir, childId);
  const activityModel = { ...(profile.activityModel ?? {}) };
  const prior = activityModel[evidence.activityId];
  const plays = (prior?.plays ?? 0) + 1;
  const completions = (prior?.completions ?? 0) + (evidence.completed ? 1 : 0);
  const avg = (oldValue: number | undefined, nextValue: number | undefined, fallback: number) =>
    round((((oldValue ?? fallback) * (plays - 1)) + clamp01(nextValue ?? fallback, fallback)) / plays);
  const avgRaw = (oldValue: number | undefined, nextValue: number | undefined) => {
    if (nextValue == null || !Number.isFinite(nextValue)) return oldValue;
    return round((((oldValue ?? nextValue) * (plays - 1)) + nextValue) / plays);
  };
  const domains = { ...(prior?.domains ?? {}) };
  const domain = normalizedDomain(evidence.domain);
  domains[domain] = (domains[domain] ?? 0) + 1;
  const missedWords = [
    ...new Set([...(prior?.missedWords ?? []), ...(evidence.missedWords ?? [])]
      .map((word) => word.trim())
      .filter(Boolean)),
  ].slice(-20);
  const targetCount = Math.max(0, Math.floor(evidence.targetCount ?? 0));
  const timePerTarget =
    targetCount > 0 && evidence.timeSpent_ms != null
      ? Math.max(0, Math.round(evidence.timeSpent_ms / targetCount))
      : undefined;
  const averageTimePerTarget_ms = avgRaw(prior?.averageTimePerTarget_ms, timePerTarget);
  activityModel[evidence.activityId] = {
    activityId: evidence.activityId,
    plays,
    completions,
    completionRate: round(completions / plays),
    averageAccuracy: avg(prior?.averageAccuracy, evidence.accuracy, 0),
    ...(averageTimePerTarget_ms != null ? { averageTimePerTarget_ms } : {}),
    engagementScore: avg(prior?.engagementScore, evidence.engagementScore, 0.5),
    frustrationScore: avg(prior?.frustrationScore, evidence.frustrationScore, 0),
    likedCount: (prior?.likedCount ?? 0) + (evidence.liked === true ? 1 : 0),
    dislikedCount: (prior?.dislikedCount ?? 0) + (evidence.liked === false ? 1 : 0),
    lastRating:
      evidence.liked === true
        ? "like"
        : evidence.liked === false
          ? "dislike"
          : "implicit",
    lastPlayed: evidence.occurredAt ?? isoNow(opts),
    domains,
    missedWords,
  };
  const next: LearningProfile = {
    ...profile,
    activityModel,
    adaptiveLoadState: updateAdaptiveLoadState(profile, evidence, opts),
    lastUpdated: isoNow(opts),
  };
  writeJson(profilePath(rootDir, childId), slimLearningProfileForDoorway(next));
  appendDecisionTrace(childId, {
    traceId: `trace-activity-${normalizedDomain(evidence.domain)}-${evidence.activityId}-${Date.parse(evidence.occurredAt ?? isoNow(opts)) || Date.now()}`,
    eventType: "activity_evidence",
    evidenceRead: [
      `activity:${evidence.activityId}`,
      `domain:${normalizedDomain(evidence.domain)}`,
      ...(evidence.missedWords ?? []).map((word) => `missed:${word}`),
    ],
    changeSummary: `${evidence.activityId} updated activity model and adaptive load state.`,
    reason: evidence.completed
      ? `Completed with accuracy ${round(clamp01(evidence.accuracy, 0))}.`
      : `Incomplete or weak performance with accuracy ${round(clamp01(evidence.accuracy, 0))}.`,
    writesTo: [profilePath(rootDir, childId)],
    createdAt: evidence.occurredAt ?? isoNow(opts),
  }, opts);
  return next;
}

function calibrationId(homeworkId: string, gradedAt: string): string {
  return crypto.createHash("sha256").update(`${homeworkId}:${gradedAt}`).digest("hex").slice(0, 12);
}

function calibrationStatus(input: {
  predictedPattern?: string;
  observedMisses: Array<{ observedErrorType?: string }>;
  score: number | null;
}): HomeworkCalibrationEntry["status"] {
  if (input.observedMisses.length === 0) {
    return input.score != null && input.score >= 0.8 ? "supported" : "inconclusive";
  }
  if (!input.predictedPattern) return "inconclusive";
  return input.observedMisses.some((miss) => miss.observedErrorType === input.predictedPattern)
    ? "supported"
    : "falsified";
}

function nextAdjustment(status: HomeworkCalibrationEntry["status"]): string {
  if (status === "supported") return "Keep using this theory, but require delayed transfer evidence before mastery.";
  if (status === "falsified") return "Revise the theory before generating another quest for this homework pattern.";
  return "Collect clearer graded evidence before treating this strategy as proven.";
}

function toProfileCalibration(entry: HomeworkCalibrationEntry): LearningCalibrationEntry {
  return { ...entry };
}

function applyCalibrationToCatalog(
  items: AIContentCatalogItem[] | undefined,
  homeworkId: string,
  entry: HomeworkCalibrationEntry,
): AIContentCatalogItem[] | undefined {
  if (!items) return items;
  return items.map((item) => {
    if (item.homeworkId !== homeworkId) return item;
    if (entry.status === "supported") {
      return { ...item, reuseStatus: "reuse", reuseReason: "Teacher/graded evidence supported the linked learning theory." };
    }
    if (entry.status === "falsified") {
      return { ...item, reuseStatus: "revise", reuseReason: "Graded evidence falsified or contradicted the linked learning theory." };
    }
    return { ...item, reuseStatus: "revise", reuseReason: "Graded evidence was inconclusive; revise before relying on it." };
  });
}

export function recordGradedHomeworkCalibration(
  childId: string,
  input: GradedHomeworkCalibrationInput,
  opts: RootOptions = {},
): HomeworkCalibrationEntry {
  const rootDir = opts.rootDir ?? process.cwd();
  const profile = readProfile(rootDir, childId);
  const file = cyclePath(rootDir, childId, input.homeworkId);
  const cycle = readJson<HomeworkCycle>(file);
  if (!cycle) throw new Error(`Homework cycle not found: ${input.homeworkId}`);
  const observedMisses = input.gradedItems
    .filter((item) => !item.correct)
    .map((item) => ({
      target: item.target,
      ...(item.observedErrorType ? { observedErrorType: item.observedErrorType } : {}),
      ...(item.note ? { note: item.note } : {}),
    }));
  const gradedAt = input.gradedAt ?? isoNow(opts);
  const status = calibrationStatus({
    predictedPattern: cycle.theory?.predictedPattern,
    observedMisses,
    score: input.score ?? null,
  });
  const entry: HomeworkCalibrationEntry = {
    calibrationId: calibrationId(input.homeworkId, gradedAt),
    homeworkId: input.homeworkId,
    gradedAt,
    ...(cycle.theory?.theoryId ? { theoryId: cycle.theory.theoryId } : {}),
    ...(cycle.theory?.predictedPattern ? { predictedPattern: cycle.theory.predictedPattern } : {}),
    predictedRiskWords: cycle.theory?.predictedRiskWords ?? [],
    observedMisses,
    score: input.score ?? null,
    status,
    ...(input.teacherNotes ? { teacherNotes: input.teacherNotes } : {}),
    nextAdjustment: nextAdjustment(status),
  };
  const nextCycle: HomeworkCycle = {
    ...cycle,
    calibrationStatus: status,
    calibrationJournal: [entry, ...(cycle.calibrationJournal ?? [])].slice(0, 50),
  };
  writeJson(file, nextCycle);
  const nextProfile: LearningProfile = {
    ...profile,
    learningCalibrationJournal: [
      toProfileCalibration(entry),
      ...(profile.learningCalibrationJournal ?? []),
    ].slice(0, 100),
    aiContentCatalog: applyCalibrationToCatalog(profile.aiContentCatalog, input.homeworkId, entry),
    lastUpdated: isoNow(opts),
  };
  writeJson(profilePath(rootDir, childId), nextProfile);
  return entry;
}

export function validateContentCatalogItem(
  item: AIContentCatalogItem,
): { ok: true } | { ok: false; error: string } {
  if (!item.algorithmTargets.length) {
    return { ok: false, error: "content_missing_algorithm_targets" };
  }
  return { ok: true };
}

export function catalogContentItem(
  childId: string,
  item: AIContentCatalogItem,
  opts: RootOptions = {},
): AIContentCatalogItem {
  const validation = validateContentCatalogItem(item);
  if (!validation.ok) throw new Error(validation.error);
  const rootDir = opts.rootDir ?? process.cwd();
  const profile = readProfile(rootDir, childId);
  const withoutExisting = (profile.aiContentCatalog ?? []).filter((existing) => existing.contentId !== item.contentId);
  const nextProfile: LearningProfile = {
    ...profile,
    aiContentCatalog: [item, ...withoutExisting].slice(0, 500),
    lastUpdated: isoNow(opts),
  };
  writeJson(profilePath(rootDir, childId), nextProfile);
  return item;
}

export function updateContentCatalogFromActivityEvidence(
  childId: string,
  evidence: ActivityEvidence,
  opts: RootOptions = {},
): LearningProfile {
  const rootDir = opts.rootDir ?? process.cwd();
  const profile = readProfile(rootDir, childId);
  if (!evidence.contentId || !profile.aiContentCatalog?.length) return profile;
  const nextCatalog = profile.aiContentCatalog.map((item) => {
    if (item.contentId !== evidence.contentId) return item;
    const plays = (item.performanceSummary?.plays ?? 0) + 1;
    const completionCount = Math.round((item.performanceSummary?.completionRate ?? 0) * (plays - 1)) + (evidence.completed ? 1 : 0);
    const avg = (oldValue: number | undefined, nextValue: number | undefined, fallback: number) =>
      round((((oldValue ?? fallback) * (plays - 1)) + clamp01(nextValue ?? fallback, fallback)) / plays);
    const performanceSummary = {
      plays,
      completionRate: round(completionCount / plays),
      averageAccuracy: avg(item.performanceSummary?.averageAccuracy, evidence.accuracy, 0),
      engagementScore: avg(item.performanceSummary?.engagementScore, evidence.engagementScore, 0.5),
      frustrationScore: avg(item.performanceSummary?.frustrationScore, evidence.frustrationScore, 0),
      transferSupported: item.performanceSummary?.transferSupported,
    };
    let reuseStatus: AIContentCatalogItem["reuseStatus"] = item.reuseStatus;
    let reuseReason = item.reuseReason;
    if (!item.algorithmTargets.length || performanceSummary.completionRate < 0.4 || performanceSummary.frustrationScore >= 0.75) {
      reuseStatus = "retire";
      reuseReason = !item.algorithmTargets.length
        ? "Retired because content has no learning algorithm target."
        : "Retired because completion/frustration evidence was poor.";
    } else if (performanceSummary.engagementScore >= 0.65 && performanceSummary.averageAccuracy < 0.65) {
      reuseStatus = "revise";
      reuseReason = "Engaging content needs revision because accuracy stayed low.";
    } else if (performanceSummary.completionRate >= 0.7 && performanceSummary.averageAccuracy >= 0.7 && performanceSummary.frustrationScore < 0.5) {
      reuseStatus = "reuse";
      reuseReason = "Reuse: completion, accuracy, and frustration evidence are healthy.";
    }
    return { ...item, performanceSummary, reuseStatus, reuseReason };
  });
  const nextProfile = { ...profile, aiContentCatalog: nextCatalog, lastUpdated: isoNow(opts) };
  writeJson(profilePath(rootDir, childId), nextProfile);
  return nextProfile;
}
