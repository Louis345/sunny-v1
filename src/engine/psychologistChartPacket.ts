import fs from "fs";
import path from "path";
import type { ExperiencePlannerInput } from "./experiencePlanner";
import {
  readLatestPronunciationScienceSummary,
  type PronunciationScienceSummary,
} from "./pronunciationScience";

export type PsychologistEvidenceSourceKind =
  | "learningProfile"
  | "wordBank"
  | "todayPlan"
  | "currentCarePlan"
  | "currentHomework"
  | "currentSessionPlan"
  | "contentCatalog"
  | "decisionTraces"
  | "attempts"
  | "ratings"
  | "vitals"
  | "sessionNotes"
  | "companionCare"
  | "activityResults"
  | "pronunciationScience";

export type PsychologistChartPacket = {
  packetVersion: 1;
  childId: string;
  child: {
    displayName: string;
    grade: number;
    companion: string;
    motivators: string[];
    attention: {
      label: string;
      source: string;
      confidence: number;
    };
  };
  homework: {
    homeworkId: string | null;
    title: string | null;
    topic: string | null;
    type: string | null;
    testDate: string | null;
    daysUntilDue: number | null;
    urgency: string | null;
    contentFingerprint?: string;
    calibrationStatus?: string;
    targetWords: string[];
    targetConcepts: string[];
    primarySkill: string | null;
  };
  currentCarePlan: {
    sourcePlanId?: string;
    theory?: {
      hypothesis: string;
      evidenceSummary: string[];
      intervention: string;
      supportCriteria: string[];
      reviseCriteria: string[];
      falsifyCriteria: string[];
    };
    plannedMeasurementCount: number;
    learningExperimentCount: number;
    updatedAt?: string;
  } | null;
  activeSessionPlan: {
    planId: string;
    source: string;
    domain: string;
    approvalStatus: string | null;
    plannerConfidence: number | null;
    nodeCount: number;
    nodeSequence: Array<{
      id: string;
      type: string;
      activityId: string;
      targetCount: number;
      locked?: boolean;
      recallMode?: string;
    }>;
    evidenceUsed: string[];
  } | null;
  previousSession: {
    todayPlanExisted: boolean;
    todayPlanActivityCount: number;
    todayPlanStopAfter?: string;
    todayPlanRewardPolicy?: string;
  };
  companionCare: {
    status: "ready" | "created" | "empty";
    filePath: string;
    moodLabel?: string;
    suggestedRepair?: string;
    vitals?: {
      hunger: number;
      mood: number;
      energy: number;
      bond: number;
      thoughtClarity: number;
    };
  };
  baselineActivityAudit: {
    engagementSummary: string[];
    traitSignals: {
      preferredDimensions: string[];
      avoidedDimensions: string[];
      contradictions: string[];
    };
    activityCards: Array<{
      activityId: string;
      domains: string[];
      skillTargets: string[];
      evidenceQuality: string;
      engagementHooks: string[];
      validConfigOptions: string[];
      psychologistGuidance: string[];
    }>;
  };
  wordBank: {
    totalWords: number;
    dueWordCount: number;
    dueWords: string[];
  };
  diagnostics: {
    strongPatterns: Array<{
      id?: string;
      type?: string;
      summary?: string;
      confidence?: number;
    }>;
    questThreshold: {
      unlocked: boolean;
      reason: string;
    };
    calibrationSummary: string[];
    algorithmFeeds: Array<{
      id: string;
      status: string;
      summary: string;
    }>;
  };
  attentionVitals: {
    latest: unknown | null;
  };
  contentCatalog: {
    total: number;
    reusable: number;
    needsRevision: number;
    retired: number;
    candidates: number;
    candidateSummaries: Array<{
      contentId: string;
      type: string;
      title: string;
      algorithmTargets: string[];
      reuseStatus: string;
    }>;
  };
  latestActivityResult: {
    filePath: string;
    summary: string;
    evidenceTier: string | null;
    targetResults: Array<{
      target: string;
      correct: boolean;
      attempts?: number;
      attemptedValue?: string;
      scaffoldLevel?: number;
      mode?: string;
      masteryEligible?: boolean;
      struggleSignals?: string[];
    }>;
  } | null;
  pronunciationScience: PronunciationScienceSummary;
  decisionTrace: {
    traceId: string;
    eventType: string;
    changeSummary: string;
    reason: string;
    evidenceRead: string[];
    writesTo: string[];
  } | null;
  learningExperiments: Array<{
    experimentId: string;
    status: string;
    hypothesis: string;
    intervention: string;
  }>;
  evidenceSources: Array<{
    kind: PsychologistEvidenceSourceKind;
    path: string;
    status: "read" | "linked" | "missing";
  }>;
  exclusions: string[];
};

export type PsychologistPacketAudit = {
  childId: string;
  provider: "Anthropic";
  aiEnabled: boolean;
  model: string;
  packetBytes: number;
  filesRead: string[];
  fieldsSent: string[];
  fieldsExcluded: string[];
  activeHomeworkId: string | null;
  carePlanTheorySummary: string;
  latestEvidenceSummary: string;
  latestDecisionTraceSummary: string;
};

const MAX_DUE_WORDS = 12;
const MAX_ACTIVITY_CARDS = 12;
const MAX_CATALOG_SUMMARIES = 12;

export const PSYCHOLOGIST_PACKET_EXCLUSIONS = [
  "full word_bank.json",
  "full attempts history",
  "full raw content catalog",
  "unbounded session notes",
  "duplicated legacy profile mirrors",
  "raw pronunciation provider payloads",
  "raw child audio clips",
  "API keys and environment values",
] as const;

function fileStatus(filePath: string): "read" | "linked" | "missing" {
  return fs.existsSync(filePath) ? "read" : "missing";
}

function latestJsonLikeFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json") || file.endsWith(".ndjson"))
    .map((file) => path.join(dir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? null;
}

function readLatestJsonLike(dir: string): { filePath: string; value: unknown } | null {
  const file = latestJsonLikeFile(dir);
  if (!file) return null;
  try {
    if (file.endsWith(".json")) {
      return { filePath: file, value: JSON.parse(fs.readFileSync(file, "utf8")) as unknown };
    }
    const lines = fs.readFileSync(file, "utf8").trim().split(/\n+/).filter(Boolean);
    return lines.length ? { filePath: file, value: JSON.parse(lines[lines.length - 1]!) as unknown } : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown, max = 20): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, max)
    : [];
}

function summaryForActivityResult(value: unknown): string {
  const record = asRecord(value);
  const activityId = typeof record.activityId === "string" ? record.activityId : "activity";
  const completed = typeof record.completed === "boolean" ? ` completed=${record.completed}` : "";
  const accuracy = typeof record.accuracy === "number" ? ` accuracy=${Math.round(record.accuracy * 100)}%` : "";
  const tier = typeof record.evidenceTier === "string" ? ` tier=${record.evidenceTier}` : "";
  const targetCount = Array.isArray(record.targetResults) ? ` targets=${record.targetResults.length}` : "";
  return `${activityId}${completed}${accuracy}${tier}${targetCount}`.trim();
}

function normalizedActivityTargetResults(value: unknown): NonNullable<PsychologistChartPacket["latestActivityResult"]>["targetResults"] {
  const record = asRecord(value);
  const rows = Array.isArray(record.targetResults) ? record.targetResults : [];
  return rows
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const target = typeof row.target === "string" ? row.target : "";
      const correct = row.correct === true;
      return {
        target,
        correct,
        ...(typeof row.attempts === "number" ? { attempts: row.attempts } : {}),
        ...(typeof row.attemptedValue === "string" ? { attemptedValue: row.attemptedValue } : {}),
        ...(typeof row.scaffoldLevel === "number" ? { scaffoldLevel: row.scaffoldLevel } : {}),
        ...(typeof row.mode === "string" ? { mode: row.mode } : {}),
        ...(typeof row.masteryEligible === "boolean" ? { masteryEligible: row.masteryEligible } : {}),
        ...(Array.isArray(row.struggleSignals)
          ? { struggleSignals: row.struggleSignals.filter((item): item is string => typeof item === "string").slice(0, 6) }
          : {}),
      };
    })
    .filter((row) => row.target)
    .slice(0, 20);
}

function derivedDecisionTrace(
  input: ExperiencePlannerInput,
): PsychologistChartPacket["decisionTrace"] {
  const plan = input.learningContext.chart.activeSessionPlan;
  if (!plan) return null;
  const childDir = path.dirname(input.chart.links.learningProfile);
  return {
    traceId: `derived-session-plan-${plan.planId}`,
    eventType: "session_plan_write",
    changeSummary: `Active session plan is ${plan.planId}.`,
    reason: `Plan source ${plan.source} selected ${plan.nodePlan.length} node(s).`,
    evidenceRead: plan.evidenceUsed.map((item) => item.id),
    writesTo: [
      input.chart.links.currentSessionPlan,
      path.join(childDir, "care_plan", "current.json"),
    ],
  };
}

function targetWords(input: ExperiencePlannerInput): string[] {
  const pending = input.chart.homework.pending as Record<string, unknown> | null;
  const captured = input.learningContext.homework?.capturedContent;
  const capturedWords = captured && typeof captured === "object"
    ? stringArray((captured as Record<string, unknown>).words, 40)
    : [];
  const homeworkWords = new Set([
    ...stringArray(pending?.wordList, 40),
    ...capturedWords,
    ...(input.learningContext.chart.activeSessionPlan?.wordPlan.words.map((word) => word.text) ?? []),
  ].map((word) => word.toLowerCase()));
  return input.learningContext.memory.dueWords
    .filter((word) => homeworkWords.size === 0 || homeworkWords.has(word.toLowerCase()))
    .slice(0, MAX_DUE_WORDS);
}

function sourceList(
  input: ExperiencePlannerInput,
  activityResult: { filePath: string; value: unknown } | null,
  activityResultsDir: string,
  pronunciationScience: PronunciationScienceSummary,
  pronunciationScienceDir: string,
): PsychologistChartPacket["evidenceSources"] {
  const links = input.chart.links;
  return [
    { kind: "learningProfile", path: links.learningProfile, status: fileStatus(links.learningProfile) },
    { kind: "wordBank", path: links.wordBank, status: fileStatus(links.wordBank) },
    { kind: "todayPlan", path: links.todayPlan, status: fileStatus(links.todayPlan) },
    { kind: "currentCarePlan", path: links.currentCarePlan, status: fileStatus(links.currentCarePlan) },
    { kind: "currentHomework", path: links.currentHomework, status: fileStatus(links.currentHomework) },
    { kind: "currentSessionPlan", path: links.currentSessionPlan, status: fileStatus(links.currentSessionPlan) },
    { kind: "contentCatalog", path: links.contentCatalog, status: fileStatus(links.contentCatalog) },
    { kind: "decisionTraces", path: links.decisionTraces, status: fs.existsSync(links.decisionTraces) ? "linked" : "missing" },
    { kind: "attempts", path: links.attempts, status: fs.existsSync(links.attempts) ? "linked" : "missing" },
    { kind: "ratings", path: links.ratings, status: fs.existsSync(links.ratings) ? "linked" : "missing" },
    { kind: "vitals", path: links.vitals, status: fs.existsSync(links.vitals) ? "linked" : "missing" },
    { kind: "sessionNotes", path: links.sessionNotes, status: fs.existsSync(links.sessionNotes) ? "linked" : "missing" },
    { kind: "companionCare", path: input.chart.companionCare.filePath, status: input.chart.companionCare.existed ? "read" : "missing" },
    {
      kind: "activityResults",
      path: activityResult?.filePath ?? activityResultsDir,
      status: activityResult ? "read" : "missing",
    },
    {
      kind: "pronunciationScience",
      path: pronunciationScience.latestFilePath ?? pronunciationScienceDir,
      status: pronunciationScience.latestFilePath ? "read" : "missing",
    },
  ];
}

export function buildPsychologistChartPacket(input: ExperiencePlannerInput): PsychologistChartPacket {
  const childDir = path.dirname(input.chart.links.learningProfile);
  const activityResultsDir = path.join(childDir, "activity_results");
  const pronunciationScienceDir = path.join(childDir, "pronunciation_science");
  const activityResult = readLatestJsonLike(activityResultsDir);
  const pronunciationScience = readLatestPronunciationScienceSummary(input.childId, {
    rootDir: input.chart.rootDir,
  });
  const homework = input.homeworkGoal;
  const pending = input.chart.homework.pending;
  const profile = pending?.contentProfile ?? pending?.capturedContent?.contentProfile;
  const carePlan = input.chart.carePlan.current;
  const activePlan = input.learningContext.chart.activeSessionPlan;
  const companionView = input.chart.companionCare.view;
  const latestTrace = input.chart.decisionTrace.latest;
  const packet: PsychologistChartPacket = {
    packetVersion: 1,
    childId: input.childId,
    child: {
      displayName: input.chart.identity.displayName,
      grade: input.chart.demographics.grade,
      companion: input.chart.companion.displayName,
      motivators: input.traitSignalSummary.preferredDimensions.slice(0, 8),
      attention: {
        label: input.learningContext.profile.attention.label,
        source: input.learningContext.profile.attention.source,
        confidence: Math.round(input.learningContext.profile.attention.confidence * 100) / 100,
      },
    },
    homework: {
      homeworkId: homework?.homeworkId ?? null,
      title: homework?.title ?? null,
      topic: homework?.topic ?? null,
      type: homework?.type ?? null,
      testDate: homework?.testDate ?? null,
      daysUntilDue: homework?.daysUntilDue ?? null,
      urgency: homework?.urgency ?? null,
      contentFingerprint: homework?.contentFingerprint,
      calibrationStatus: homework?.calibrationStatus,
      targetWords: stringArray(pending?.wordList, 20),
      targetConcepts: profile?.concepts?.slice(0, 12) ?? [],
      primarySkill: profile?.primarySkill ?? null,
    },
    currentCarePlan: carePlan
      ? {
          sourcePlanId: carePlan.sourcePlanId,
          theory: carePlan.theory,
          plannedMeasurementCount: carePlan.plannedMeasurements.length,
          learningExperimentCount: carePlan.learningExperiments.length,
          updatedAt: carePlan.updatedAt,
        }
      : null,
    activeSessionPlan: activePlan
      ? {
          planId: activePlan.planId,
          source: activePlan.source,
          domain: activePlan.domain,
          approvalStatus: activePlan.approvalStatus ?? null,
          plannerConfidence: activePlan.plannerConfidence ?? null,
          nodeCount: activePlan.nodePlan.length,
          nodeSequence: activePlan.nodePlan.slice(0, 12).map((node) => ({
            id: node.id,
            type: node.type,
            activityId: node.activityId,
            targetCount: node.targets.length,
            locked: node.locked,
            recallMode: node.wordRadarConfig?.recallMode,
          })),
          evidenceUsed: activePlan.evidenceUsed.map((item) => `${item.id}:${item.summary}`).slice(0, 12),
        }
      : null,
    previousSession: {
      todayPlanExisted: input.chart.todayPlan.existed,
      todayPlanActivityCount: Array.isArray(asRecord(input.chart.todayPlan.data).todaysPlan)
        ? (asRecord(input.chart.todayPlan.data).todaysPlan as unknown[]).length
        : 0,
      todayPlanStopAfter: typeof asRecord(input.chart.todayPlan.data).stopAfter === "string"
        ? asRecord(input.chart.todayPlan.data).stopAfter as string
        : undefined,
      todayPlanRewardPolicy: typeof asRecord(input.chart.todayPlan.data).rewardPolicy === "string"
        ? asRecord(input.chart.todayPlan.data).rewardPolicy as string
        : undefined,
    },
    companionCare: {
      status: input.chart.companionCare.existed ? "ready" : "created",
      filePath: input.chart.companionCare.filePath,
      moodLabel: companionView.moodLabel,
      suggestedRepair: companionView.readiness.suggestedRepair,
      vitals: {
        hunger: companionView.vitals.hunger,
        mood: companionView.vitals.mood,
        energy: companionView.vitals.energy,
        bond: companionView.vitals.bond,
        thoughtClarity: companionView.vitals.thoughtClarity,
      },
    },
    baselineActivityAudit: {
      engagementSummary: input.engagementSummary.slice(0, 12),
      traitSignals: {
        preferredDimensions: input.traitSignalSummary.preferredDimensions.slice(0, 12),
        avoidedDimensions: input.traitSignalSummary.avoidedDimensions.slice(0, 12),
        contradictions: input.traitSignalSummary.contradictions.slice(0, 12),
      },
      activityCards: input.activityCards.slice(0, MAX_ACTIVITY_CARDS).map((card) => ({
        activityId: card.activityId,
        domains: card.domains,
        skillTargets: card.skillTargets,
        evidenceQuality: card.evidenceQuality,
        engagementHooks: card.engagementHooks,
        validConfigOptions: card.validConfigOptions,
        psychologistGuidance: card.psychologistGuidance,
      })),
    },
    wordBank: {
      totalWords: input.chart.wordBankSummary.totalWords,
      dueWordCount: input.chart.wordBankSummary.dueWords,
      dueWords: targetWords(input),
    },
    diagnostics: {
      strongPatterns: input.learningContext.diagnostics.strongPatterns.slice(0, 12).map((pattern) => ({
        id: "id" in pattern ? String(pattern.id) : undefined,
        type: "type" in pattern ? String(pattern.type) : undefined,
        summary: "summary" in pattern ? String(pattern.summary) : undefined,
        confidence: "confidence" in pattern && typeof pattern.confidence === "number" ? pattern.confidence : undefined,
      })),
      questThreshold: {
        unlocked: input.learningContext.diagnostics.questThreshold.unlocked,
        reason: input.learningContext.diagnostics.questThreshold.reason,
      },
      calibrationSummary: input.calibrationSummary,
      algorithmFeeds: input.learningContext.algorithmFeeds,
    },
    attentionVitals: {
      latest: input.chart.latestAttentionVitals,
    },
    contentCatalog: {
      ...input.chart.contentCatalog.summary,
      candidateSummaries: input.chart.contentCatalog.items.slice(0, MAX_CATALOG_SUMMARIES).map((item) => ({
        contentId: item.contentId,
        type: item.type,
        title: item.title,
        algorithmTargets: item.algorithmTargets,
        reuseStatus: item.reuseStatus,
      })),
    },
    latestActivityResult: activityResult
      ? {
          filePath: activityResult.filePath,
          summary: summaryForActivityResult(activityResult.value),
          evidenceTier: typeof asRecord(activityResult.value).evidenceTier === "string"
            ? String(asRecord(activityResult.value).evidenceTier)
            : null,
          targetResults: normalizedActivityTargetResults(activityResult.value),
        }
      : null,
    pronunciationScience,
    decisionTrace: latestTrace
      ? {
          traceId: latestTrace.traceId,
          eventType: latestTrace.eventType,
          changeSummary: latestTrace.changeSummary,
          reason: latestTrace.reason,
          evidenceRead: latestTrace.evidenceRead,
          writesTo: latestTrace.writesTo,
        }
      : derivedDecisionTrace(input),
    learningExperiments: (input.chart.learningExperiments ?? []).slice(0, 12).map((experiment) => ({
      experimentId: experiment.experimentId,
      status: experiment.status,
      hypothesis: experiment.hypothesis,
      intervention: experiment.intervention,
    })),
    evidenceSources: [],
    exclusions: [...PSYCHOLOGIST_PACKET_EXCLUSIONS],
  };
  packet.evidenceSources = sourceList(
    input,
    activityResult,
    activityResultsDir,
    pronunciationScience,
    pronunciationScienceDir,
  );
  const packetBytes = Buffer.byteLength(JSON.stringify(packet), "utf8");
  console.log(
    `  🎮 [psychologist-packet] [built] child=${input.childId} bytes=${packetBytes} sources=${packet.evidenceSources.length}`,
  );
  return packet;
}

export function buildPsychologistPacketAudit(
  input: ExperiencePlannerInput,
  opts: { aiEnabled: boolean; model: string },
): PsychologistPacketAudit {
  const packet = buildPsychologistChartPacket(input);
  return {
    childId: input.childId,
    provider: "Anthropic",
    aiEnabled: opts.aiEnabled,
    model: opts.model,
    packetBytes: Buffer.byteLength(JSON.stringify(packet), "utf8"),
    filesRead: packet.evidenceSources
      .filter((source) => source.status === "read")
      .map((source) => source.path),
    fieldsSent: Object.keys(packet).filter((key) => key !== "exclusions"),
    fieldsExcluded: [...PSYCHOLOGIST_PACKET_EXCLUSIONS],
    activeHomeworkId: packet.homework.homeworkId,
    carePlanTheorySummary: packet.currentCarePlan?.theory?.hypothesis ?? "(none)",
    latestEvidenceSummary:
      packet.pronunciationScience.summaries[0] ??
      packet.latestActivityResult?.summary ??
      packet.diagnostics.algorithmFeeds.map((feed) => feed.summary).join(" | "),
    latestDecisionTraceSummary: packet.decisionTrace?.changeSummary ?? "(none)",
  };
}
