import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { LanguageModelUsage } from "ai";
import { z } from "zod";
import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  LearningRoutePrescription,
  PlanTheory,
  PlannedMeasurement,
} from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";
import type { NodeType } from "../shared/adventureTypes";
import type { ChildChart } from "../profiles/childChart";
import {
  listActivityToolContracts,
  type ActivityCapabilityMode,
  type LearningDomain,
  type ActivityPlannerVisibility,
} from "./activityToolCatalog";
import {
  plannerEvidenceFieldsForActivity,
  type ActivityEvidenceRole,
  type ActivityProofStrength,
  type PlannerEvidenceModeNote,
} from "./activityEvidenceContract";
import {
  buildCapturedHomeworkContent,
  normalizeContentProfile,
  type AssignmentInterpretation,
  type CapturedHomeworkContent,
  type ContentProfile,
  type HomeworkTargetPurpose,
  type HomeworkType,
} from "../scripts/contentAwareHomeworkPlanner";
import {
  type AssignmentSourceExtraction,
} from "./assignmentSourceExtraction";
import { certifySpellingAdaptation } from "./spellingCertification";

export type { AssignmentSourceExtraction } from "./assignmentSourceExtraction";

export type AssignmentActivityCard = {
  activityId: string;
  nodeType?: string;
  label: string;
  sentToPlanner: true;
  launchable: boolean;
  domains: string[];
  purposes: string[];
  skillTargets: string[];
  evidenceType: string;
  evidenceRole: ActivityEvidenceRole;
  proofStrength: ActivityProofStrength;
  inputModes: string[];
  measures: string[];
  configSource: string;
  requiredConfig: string;
  evidencePolicy: string;
  bestFor: string[];
  contaminationRisks: string[];
  modeEvidenceNotes: PlannerEvidenceModeNote[];
  capabilityModes: PlannerActivityCapabilityMode[];
  plannerVisibility: ActivityPlannerVisibility;
  status: "ok" | "unavailable" | "missing_config_metadata";
};

export type PlannerActivityCapabilityMode = Pick<
  ActivityCapabilityMode,
  "id" | "label" | "difficulty" | "purpose" | "evidenceType" | "masteryEligible" | "config"
>;

export type AssignmentPlannerDialogueTurn = {
  role: "parent" | "sunny";
  message: string;
  createdAt: string;
};

export type AssignmentPlannerReferenceDoc = {
  id: string;
  title: string;
  path: string;
  configOwner: string;
  plannerUse: string;
  appliesWhen: string[];
  checklist: string[];
};

export type AssignmentPlanningChildChartSummary = {
  childId: string;
  displayName: string;
  grade?: number | string;
  selectedCompanionId?: string | null;
  selectedCompanionName?: string | null;
  adventureMapProfile?: ChildChart["adventureMapProfile"];
  activeHomeworkSummary?: string | null;
  carePlanSummary?: string | null;
  recentEvidence: string[];
  learningSignals?: AssignmentPlanningChildLearningSignals;
};

export type AssignmentPlanningChildLearningSignals = {
  activityAffinities: Array<{
    activityId: string;
    plays: number;
    completions: number;
    completionRate: number;
    averageAccuracy: number;
    averageTimePerTarget_ms?: number;
    engagementScore: number;
    frustrationScore: number;
    likedCount?: number;
    dislikedCount?: number;
    lastRating?: "like" | "dislike" | "implicit";
    domains: Record<string, number>;
    missedWords: string[];
  }>;
  traitSignals: Array<{
    dimension: string;
    positiveWeight: number;
    negativeWeight: number;
    mixedWeight: number;
    evidenceCount: number;
    confidence: number;
    activityCounts: Record<string, number>;
  }>;
  notes: string[];
};

export type AssignmentMasteryContext = {
  nowIso: string;
  localDate: string;
  timeZone: string;
  testDate: string | null;
  testDateSource: "cli" | "extracted" | "human_confirmed" | "inferred_next_friday" | "unknown";
  testDateConfirmed: boolean;
  daysUntilTest: number | null;
  goal: string;
  requiredAbilities: string[];
  expectedSessionsRemaining: number | null;
  sessionIntensity: "low" | "build" | "urgent" | "final_check";
  readinessProof?: AssignmentReadinessProofContext;
};

export type AssignmentReadinessProofContext = {
  centralQuestion: string;
  proofStandard: string;
  supportEvidence: string[];
  notEnoughEvidence: string[];
};

export type AssignmentPlanningPacket = {
  packetVersion: 1;
  childId: string;
  masteryContext: AssignmentMasteryContext;
  sourceDocument: Pick<
    AssignmentSourceExtraction,
    | "filename"
    | "sourcePath"
    | "sourceKind"
    | "mediaType"
    | "fileHash"
    | "extractionMethod"
    | "warnings"
    | "pages"
    | "fullText"
  >;
  capturedHomework: AssignmentPlanningCapturedHomework;
  childChart: AssignmentPlanningChildChartSummary;
  activityCatalog: AssignmentActivityCard[];
  plannerReferences?: AssignmentPlannerReferenceDoc[];
  parentDialogue?: AssignmentPlannerDialogueTurn[];
  plannerInstruction: string;
  priorPlannerOutput?: AssignmentPlannerOutput;
};

export type AssignmentPlanningCapturedHomework = Pick<
  CapturedHomeworkContent,
  "title" | "type" | "words" | "questions" | "wordGroups" | "sourceDocuments" | "contentProfile"
>;

export type AssignmentPlannerHomeworkWord = {
  text: string;
  sourceGroupId: string;
  purpose: HomeworkTargetPurpose;
};

export type AssignmentPlannerOutput = {
  capturedContent: CapturedHomeworkContent;
  assignmentInterpretation: AssignmentInterpretation;
  homeworkWords: AssignmentPlannerHomeworkWord[];
  activeSessionPlan: ActiveSessionPlan;
  plannedMeasurements: PlannedMeasurement[];
  planTheory: PlanTheory;
  reviewQuestions: string[];
  generatedExperienceBriefs?: GeneratedExperienceBrief[];
};

export type AssignmentPlanValidationIssue = {
  code:
    | "missing_source_document"
    | "missing_word_groups"
    | "word_missing_source_group"
    | "missing_word_radar_config"
    | "missing_node_measurement"
    | "target_lane_mismatch"
    | "unknown_activity_id";
  severity: "error" | "warning";
  message: string;
};

export type AssignmentPlanningOptions = {
  model?: string;
  callPlannerModel?: AssignmentPlannerModelCaller;
};

export type AssignmentPlannerTelemetry = {
  model: string;
  usage?: LanguageModelUsage;
  latencyMs: number;
};

export type AssignmentPlannerModelCaller = (
  packet: AssignmentPlanningPacket,
  model: string,
) => Promise<{ draft: AssignmentPlannerResponseObject; usage?: LanguageModelUsage }>;

export type PlannerReadinessAuditRow = {
  activity: string;
  sentToPlanner: boolean;
  launchable: boolean;
  domains: string;
  purposes: string;
  configSource: string;
  modes: string;
  requiredConfig: string;
  evidencePolicy: string;
  status: AssignmentActivityCard["status"];
};

export type PlannerReadinessAudit = {
  rows: PlannerReadinessAuditRow[];
  markdown: string;
  issues: Array<{ code: string; activity: string; message: string }>;
};

export function buildPlannerReadinessAudit(cards: AssignmentActivityCard[]): PlannerReadinessAudit {
  const rows = cards.map((card): PlannerReadinessAuditRow => ({
    activity: card.activityId,
    sentToPlanner: card.sentToPlanner,
    launchable: card.launchable,
    domains: card.domains.join(", "),
    purposes: card.purposes.join(", "),
    configSource: card.configSource,
    modes: card.capabilityModes.map((mode) => mode.id).join(", ") || "(none)",
    requiredConfig: card.requiredConfig,
    evidencePolicy: card.evidencePolicy,
    status: card.status,
  }));
  const issues = cards
    .filter((card) =>
      card.launchable &&
      (card.configSource === "unspecified" ||
        (card.requiredConfig !== "none" && card.capabilityModes.length === 0)),
    )
    .map((card) => ({
      code: "launchable_activity_missing_planner_config",
      activity: card.activityId,
      message: `${card.activityId} is launchable but missing planner-readable config metadata.`,
    }));
  const markdown = [
    "| activity | sent_to_planner | launchable | domains | purposes | config_source | modes | required_config | evidence_policy | status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      `| ${row.activity} | ${row.sentToPlanner} | ${row.launchable} | ${row.domains} | ${row.purposes} | ${row.configSource} | ${row.modes} | ${row.requiredConfig} | ${row.evidencePolicy} | ${row.status} |`,
    ),
  ].join("\n");
  return { rows, markdown, issues };
}

const homeworkPurposeSchema = z.enum([
  "spell_from_memory",
  "recognize",
  "read_fluently",
  "pronounce",
  "define",
  "unknown",
]);

const wordGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  purpose: homeworkPurposeSchema,
  words: z.array(z.string().min(1)).min(1),
  confidence: z.number(),
  evidence: z.array(z.string().min(1)),
  scheduleAfter: z.literal("spelling_measured").optional(),
});

const contentProfileSchema: z.ZodType<ContentProfile> = z.object({
  practiceDomain: z.enum(["spelling", "reading", "math", "writing", "generic"]),
  contentDomain: z.enum(["science", "social_studies", "language_arts", "math", "generic"]),
  topic: z.string().min(1),
  primarySkill: z.string().min(1),
  assignmentFormat: z.string().min(1),
  concepts: z.array(z.string().min(1)),
  sourceEvidence: z.array(z.string().min(1)).default([]),
});

const PLANNER_DESTINATION_ACTIVITY_IDS = new Set(["mystery", "quest", "boss"]);
const PLANNER_NODE_ACTIVITY_IDS = plannerNodeActivityIds();
const NODE_TYPES = new Set<NodeType>(PLANNER_NODE_ACTIVITY_IDS as unknown as NodeType[]);
const INSTRUMENT_RENDERERS: Record<string, NodeType> = {
  "spelling-recall": "letter-rush",
};

function plannerNodeActivityIds(): [string, ...string[]] {
  const ids = [
    ...listActivityToolContracts()
      .filter((contract) => contract.plannerVisibility === "map_node" || (
        !contract.plannerVisibility && contract.nodeType
      ))
      .map((contract) => contract.id),
    ...PLANNER_DESTINATION_ACTIVITY_IDS,
  ];
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    throw new Error("assignment_planner_activity_catalog_empty");
  }
  return unique as [string, ...string[]];
}

function isPlannerDestinationActivity(activityId: string): boolean {
  return PLANNER_DESTINATION_ACTIVITY_IDS.has(activityId);
}

export const ASSIGNMENT_PLANNER_PERSONA = [
  "You are Sunny's assignment planner.",
  "Treat homework as the reality anchor.",
  "Use the child chart and activity catalog to choose a concise evidence-based learning plan.",
].join(" ");
const ASSIGNMENT_PLANNER_MAX_TOKENS = 6_000;

export const ASSIGNMENT_PLANNER_REFERENCE_DOCS: AssignmentPlannerReferenceDoc[] = [
  {
    id: "activity-tool-protocol",
    title: "Activity Tool Protocol",
    path: "docs/activity-tool-protocol.md",
    configOwner: "src/engine/activityToolCatalog.ts",
    plannerUse:
      "Use this to decide whether a proposed class activity should enter Sunny as a cataloged activity instrument or remain a prototype.",
    appliesWhen: [
      "A new class activity, game wrapper, reward shell, or generated tool is proposed.",
      "The planner needs to decide if an activity has enough mechanic truth and evidence safety.",
      "A prototype needs to graduate from Storybook or lab mode into the adaptive path.",
    ],
    checklist: [
      "No orphan activities: every active-path activity needs an Activity Tool Contract.",
      "Declare purposes, domains, strengths, weak spots, good-fit conditions, and bad-fit conditions.",
      "Name the mechanic truth: what the child actually clicks, says, types, sorts, or recalls.",
      "Declare scaffolds that can contaminate mastery evidence.",
      "Only mastery-eligible activities with captured per-target results may write mastery evidence.",
      "Use src/engine/activityToolCatalog.ts as the machine-readable source of truth.",
    ],
  },
  {
    id: "spark-orb-learning-contract",
    title: "Spark Orb Learning Contract",
    path: "docs/spark-orb-learning-contract.md",
    configOwner: "src/engine/activityToolCatalog.ts",
    plannerUse:
      "Use this when Spark Orb is available as an optional reward wrapper around real learning evidence.",
    appliesWhen: [
      "A child needs a short exciting reward bridge after valid domain work.",
      "A domain activity can preserve target-level evidence while Spark Orb handles charge, launch, and reward feel.",
      "The planner is deciding whether to use or decline Spark Orb organically.",
    ],
    checklist: [
      "Spark Orb is not standalone mastery evidence.",
      "The embedded spelling, reading, math, or history payload owns academic correctness.",
      "Use rewardWrapper.activityId spark-orb-charge instead of a map node.",
      "Use domain_payload_wrapper only on unlocked evidence-generating domain nodes.",
      "Skip Spark Orb when the session needs a clean baseline, calm practice, or reduced arcade reward.",
    ],
  },
];

export const ASSIGNMENT_PLANNER_TOOL_NAME = "write_adventure_session_plan";

function normalizeNodeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeAssignmentNodeType(rawType: string, activityId: string): NodeType {
  const candidates = [
    normalizeNodeSlug(rawType),
    normalizeNodeSlug(activityId),
  ];
  for (const candidate of candidates) {
    if (NODE_TYPES.has(candidate as NodeType)) return candidate as NodeType;
    const renderer = INSTRUMENT_RENDERERS[candidate];
    if (renderer) return renderer;
  }
  throw new Error(`assignment_plan_unknown_node_type:${rawType}:${activityId}`);
}

const planTheorySchema: z.ZodType<PlanTheory> = z.object({
  hypothesis: z.string().min(1),
  evidenceSummary: z.array(z.string().min(1)).min(1),
  intervention: z.string().min(1),
  supportCriteria: z.array(z.string().min(1)).min(1),
  reviseCriteria: z.array(z.string().min(1)).min(1),
  falsifyCriteria: z.array(z.string().min(1)).min(1),
});

const plannedMeasurementSchema: z.ZodType<PlannedMeasurement> = z.object({
  id: z.string().min(1),
  activityId: z.string().min(1),
  target: z.string().min(1),
  evidenceType: z.string().min(1),
  supportCriteria: z.string().min(1),
  reviseCriteria: z.string().min(1),
  falsifyCriteria: z.string().min(1),
});

const WORD_RADAR_CONFIG_DEFAULTS = {
  visible_read: {
    recallMode: "visible_read",
    inputMode: "whole-word",
    speakStyle: "option-a",
    showTimer: false,
    hideWordDuringResponse: false,
    requiresCapturedResponse: true,
  },
  partial_visual_recall: {
    recallMode: "partial_visual_recall",
    inputMode: "letter-by-letter",
    speakStyle: "option-a",
    showTimer: false,
    hideWordDuringResponse: true,
    requiresCapturedResponse: true,
  },
  hidden_word_recall: {
    recallMode: "hidden_word_recall",
    inputMode: "whole-word",
    speakStyle: "option-b",
    showTimer: true,
    timerSeconds: 8,
    hideWordDuringResponse: true,
    requiresCapturedResponse: true,
  },
} as const;

function normalizeToolToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeWordRadarRecallMode(value: unknown): keyof typeof WORD_RADAR_CONFIG_DEFAULTS | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return normalizeWordRadarRecallMode(
      record.recallMode ??
      record.recall_mode ??
      record.mode ??
      record.modeId ??
      record.id ??
      record.value,
    );
  }
  const token = normalizeToolToken(value);
  if (!token) return null;
  if (token === "visible_read" || token === "recognize" || token === "recognition" || token === "read_fluently") {
    return "visible_read";
  }
  if (token === "partial_visual_recall" || token === "letter_fill" || token === "letter_by_letter" || token === "baseline") {
    return "partial_visual_recall";
  }
  if (token === "audio_cued_letter_recall" || token === "audio_cued") {
    return "partial_visual_recall";
  }
  if (token === "hidden_word_recall" || token === "hidden_recall" || token === "independent_retrieval") {
    return "hidden_word_recall";
  }
  if (token.includes("visible") && token.includes("read")) return "visible_read";
  if (token.includes("partial") || token.includes("letter") || token.includes("visual") || token.includes("spell")) {
    return "partial_visual_recall";
  }
  if (token.includes("hidden") || token.includes("independent")) return "hidden_word_recall";
  return null;
}

function normalizeWordRadarInputMode(value: unknown): "whole-word" | "letter-by-letter" | "keyboard" | null {
  const token = normalizeToolToken(value);
  if (!token) return null;
  if (token === "whole_word" || token === "whole") return "whole-word";
  if (token === "letter_by_letter" || token === "letters" || token === "letter") return "letter-by-letter";
  if (token === "keyboard" || token === "typing") return "keyboard";
  return null;
}

function normalizeWordRadarSpeakStyle(value: unknown): "option-a" | "option-b" | null {
  const token = normalizeToolToken(value);
  if (!token) return null;
  if (token === "a" || token === "option_a" || token === "optiona") return "option-a";
  if (token === "b" || token === "option_b" || token === "optionb") return "option-b";
  return null;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const token = normalizeToolToken(value);
  if (token === "true" || token === "yes") return true;
  if (token === "false" || token === "no") return false;
  return undefined;
}

function normalizeWordRadarConfig(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const rawMode =
    record.recallMode ??
    record.recall_mode ??
    record.mode ??
    record.modeId ??
    record.capabilityMode ??
    record.capabilityModeId;
  const recallMode = normalizeWordRadarRecallMode(rawMode);
  if (!recallMode) return undefined;
  const defaults = WORD_RADAR_CONFIG_DEFAULTS[recallMode];
  const audioCued = normalizeToolToken(rawMode).includes("audio");
  const normalized = {
    ...defaults,
    inputMode: normalizeWordRadarInputMode(record.inputMode ?? record.input_mode) ?? defaults.inputMode,
    speakStyle: normalizeWordRadarSpeakStyle(record.speakStyle ?? record.speak_style) ?? (audioCued ? "option-b" : defaults.speakStyle),
    showTimer: normalizeOptionalBoolean(record.showTimer ?? record.show_timer) ?? defaults.showTimer,
    hideWordDuringResponse:
      normalizeOptionalBoolean(record.hideWordDuringResponse ?? record.hide_word_during_response) ??
      defaults.hideWordDuringResponse,
    requiresCapturedResponse:
      normalizeOptionalBoolean(record.requiresCapturedResponse ?? record.requires_captured_response) ??
      defaults.requiresCapturedResponse,
  };
  const defaultTimerSeconds = "timerSeconds" in defaults ? defaults.timerSeconds : undefined;
  const timerSeconds = Number(record.timerSeconds ?? record.timer_seconds ?? defaultTimerSeconds);
  return Number.isFinite(timerSeconds) ? { ...normalized, timerSeconds } : normalized;
}

const wordRadarNodeConfigSchema = z.preprocess(normalizeWordRadarConfig, z.object({
  recallMode: z.enum(["visible_read", "partial_visual_recall", "hidden_word_recall"]),
  inputMode: z.enum(["whole-word", "letter-by-letter", "keyboard"]),
  speakStyle: z.enum(["option-a", "option-b"]),
  showTimer: z.boolean(),
  timerSeconds: z.number().optional(),
  hideWordDuringResponse: z.boolean(),
  requiresCapturedResponse: z.boolean(),
}));

const compactTargetsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value
    .split(/[\n,;]+/g)
    .map((target) => target.trim())
    .filter(Boolean);
}, z.array(z.string().min(1)));

const compactNodePlanSchema = z.object({
  id: z.string().min(1),
  type: z.enum(PLANNER_NODE_ACTIVITY_IDS),
  activityId: z.enum(PLANNER_NODE_ACTIVITY_IDS),
  targets: compactTargetsSchema,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  targetLane: z.preprocess((value) => value === null ? undefined : value, z.string().optional()),
  choiceMode: z.enum(["choice_lab", "surprise_drop"]).optional(),
  locked: z.boolean().optional(),
  masteryUnlockState: z.enum(["teased_locked", "preparing", "pending_ceremony", "unlocked", "completed"]).optional(),
  wordRadarConfig: z.preprocess(
    (value) => value === null ? undefined : value,
    wordRadarNodeConfigSchema.optional(),
  ),
});

const learningRouteSchema: z.ZodType<LearningRoutePrescription> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  rationale: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1),
});

const compactActiveSessionPlanSchema = z.object({
  planId: z.string().min(1).optional(),
  nodePlan: z.array(compactNodePlanSchema).min(1).max(9),
  learningRoutes: z.array(learningRouteSchema).min(2).max(3).default([]),
  evidenceUsed: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
  })).optional(),
  openQuestions: z.array(z.string()).optional(),
  plannerConfidence: z.number().optional(),
});

const capturedContentDraftSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["spelling_test", "reading", "math", "coins", "clocks", "generic"]),
  rawText: z.string(),
  words: z.array(z.string().min(1)),
  questions: z.array(z.unknown()),
  wordGroups: z.array(wordGroupSchema).min(1),
  contentProfile: contentProfileSchema,
  sourceDocuments: z.array(z.object({
    filename: z.string().min(1),
    mediaType: z.string().optional(),
  })).min(1),
});

export const assignmentPlannerDraftSchema = z.object({
  activeSessionPlan: compactActiveSessionPlanSchema,
  plannedMeasurements: z.array(plannedMeasurementSchema).max(12),
  planTheory: planTheorySchema,
  reviewQuestions: z.array(z.string().min(1)).max(8),
  generatedExperienceBriefs: z.array(z.object({
    kind: z.enum(["quest", "boss", "visual-explainer"]),
    title: z.string().min(1),
    learningGoal: z.string().min(1),
    targetWords: z.array(z.string().min(1)),
    evidenceUsed: z.array(z.string().min(1)),
  })).max(3).optional(),
}).passthrough();

function realChildAllowedActivityIds(childId: string): Set<string> | null {
  try {
    return new Set(
      certifySpellingAdaptation({ rootDir: process.cwd(), childId }).games
        .filter((game) => game.allowedInRealChildSession)
        .map((game) => game.gameId),
    );
  } catch {
    return null;
  }
}

function inferPlannerCatalogDomain(extraction?: AssignmentSourceExtraction): LearningDomain {
  const text = [
    extraction?.filename,
    extraction?.sourcePath,
    extraction?.fullText,
    ...(extraction?.pages ?? []).map((page) => page.text),
  ].filter(Boolean).join("\n").toLowerCase();
  if (/(^|[^a-z])(spelling|spell|word list|silent letters?|high-frequency)([^a-z]|$)/.test(text)) return "spelling";
  if (/(^|[^a-z])(clock|coin|math|add|subtract|multiply|divide|fraction)([^a-z]|$)/.test(text)) return "math";
  if (/(^|[^a-z])(read|reading|fluency|passage|comprehension)([^a-z]|$)/.test(text)) return "reading";
  return "reading";
}

function activityCatalog(
  childId = "demo_adaptive",
  extraction?: AssignmentSourceExtraction,
): AssignmentActivityCard[] {
  const allowed = realChildAllowedActivityIds(childId);
  const domain = inferPlannerCatalogDomain(extraction);
  return listActivityToolContracts()
    .filter((contract) =>
      contract.domains.includes(domain) &&
      (
        contract.plannerVisibility === "wrapper" ||
        contract.plannerVisibility === "map_node" ||
        (
          !contract.plannerVisibility &&
          contract.nodeType
        )
      ))
    .map((contract) => {
      const evidenceFields = plannerEvidenceFieldsForActivity(contract.id);
      const plannerVisibility = contract.plannerVisibility;
      return {
        activityId: contract.id,
        nodeType: contract.nodeType,
        label: contract.label,
        sentToPlanner: true as const,
        launchable: Boolean(
          contract.plannerVisibility !== "wrapper" &&
          NODE_TYPES.has(contract.id as NodeType) &&
          (!allowed || allowed.has(contract.id) || PLANNER_DESTINATION_ACTIVITY_IDS.has(contract.id)),
        ),
        plannerVisibility,
        domains: [...contract.domains],
        purposes: [...contract.purposes],
        skillTargets: [...contract.traits.skillTargets],
        evidenceType: contract.traits.evidenceType,
        evidenceRole: evidenceFields.evidenceRole,
        proofStrength: evidenceFields.proofStrength,
        inputModes: [...contract.traits.inputModes],
        measures: [...contract.measures],
        configSource: contract.configSource,
        requiredConfig: contract.capabilityModes.length > 0 ? "capabilityModes" : "none",
        evidencePolicy: contract.evidence.writesMasteryEvidence
          ? "mastery-eligible-with-captured-evidence"
          : contract.evidence.writesPracticeEvidence
            ? "practice-or-diagnostic-evidence"
            : contract.traits.evidenceType === "reward"
              ? "preference-evidence-only"
              : "no-mastery-evidence",
        bestFor: evidenceFields.bestFor,
        contaminationRisks: evidenceFields.contaminationRisks,
        modeEvidenceNotes: evidenceFields.modeEvidenceNotes,
        capabilityModes: contract.capabilityModes.map((mode) => ({
          id: mode.id,
          label: mode.label,
          difficulty: mode.difficulty,
          purpose: mode.purpose,
          evidenceType: mode.evidenceType,
          masteryEligible: mode.masteryEligible,
          config: { ...mode.config },
        })),
        status: (
          contract.plannerVisibility === "wrapper" ||
          (
            NODE_TYPES.has(contract.id as NodeType) &&
            contract.configSource !== "unspecified" &&
            (contract.capabilityModes.length > 0 || contract.configSource === "registry-default" || contract.configSource === "reward-game")
          )
        ) ? "ok" : "unavailable",
      };
    });
}

function summarizeCarePlan(chart: ChildChart): string | null {
  const current = chart.carePlan?.current as { signal?: unknown; summary?: unknown } | null | undefined;
  if (!current) return null;
  return String(current.signal ?? current.summary ?? "Care plan present.");
}

function roundPlannerSignal(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function childLearningSignalsForPacket(chart: ChildChart): AssignmentPlanningChildLearningSignals | undefined {
  const learningProfile = chart.learningProfile as ChildChart["learningProfile"] | undefined;
  const activityAffinities = Object.values(learningProfile?.activityModel ?? {})
    .filter((entry) => entry && entry.plays > 0)
    .sort((a, b) => {
      const bScore = b.plays * Math.max(0, b.engagementScore - b.frustrationScore);
      const aScore = a.plays * Math.max(0, a.engagementScore - a.frustrationScore);
      return bScore - aScore;
    })
    .slice(0, 10)
    .map((entry) => ({
      activityId: entry.activityId,
      plays: entry.plays,
      completions: entry.completions,
      completionRate: roundPlannerSignal(entry.completionRate),
      averageAccuracy: roundPlannerSignal(entry.averageAccuracy),
      ...(typeof entry.averageTimePerTarget_ms === "number"
        ? { averageTimePerTarget_ms: roundPlannerSignal(entry.averageTimePerTarget_ms) }
        : {}),
      engagementScore: roundPlannerSignal(entry.engagementScore),
      frustrationScore: roundPlannerSignal(entry.frustrationScore),
      ...(typeof entry.likedCount === "number" ? { likedCount: entry.likedCount } : {}),
      ...(typeof entry.dislikedCount === "number" ? { dislikedCount: entry.dislikedCount } : {}),
      ...(entry.lastRating ? { lastRating: entry.lastRating } : {}),
      domains: { ...entry.domains },
      missedWords: [...(entry.missedWords ?? [])].slice(0, 8),
    }));

  const traitSignals = Object.values(learningProfile?.activityTraitModel ?? {})
    .filter((entry) => entry && entry.evidenceCount > 0)
    .sort((a, b) => {
      const bScore = b.confidence * (Math.abs(b.positiveWeight) + Math.abs(b.negativeWeight) + Math.abs(b.mixedWeight));
      const aScore = a.confidence * (Math.abs(a.positiveWeight) + Math.abs(a.negativeWeight) + Math.abs(a.mixedWeight));
      return bScore - aScore;
    })
    .slice(0, 12)
    .map((entry) => ({
      dimension: entry.dimension,
      positiveWeight: roundPlannerSignal(entry.positiveWeight),
      negativeWeight: roundPlannerSignal(entry.negativeWeight),
      mixedWeight: roundPlannerSignal(entry.mixedWeight),
      evidenceCount: entry.evidenceCount,
      confidence: roundPlannerSignal(entry.confidence),
      activityCounts: { ...entry.activityCounts },
    }));

  if (activityAffinities.length === 0 && traitSignals.length === 0) return undefined;
  return {
    activityAffinities,
    traitSignals,
    notes: [
      "Activity affinity and trait signals describe engagement/preference evidence, not mastery proof.",
      "Use target-level attempts, baseline evidence, Quest, Boss, and graded calibration for mastery claims.",
    ],
  };
}

function childChartSummaryForPacket(
  chart: ChildChart,
  recentEvidence: string[],
): AssignmentPlanningChildChartSummary {
  return {
    childId: chart.childId,
    displayName: chart.identity.displayName,
    grade: chart.demographics?.grade,
    selectedCompanionId: chart.companion?.presetId ?? null,
    selectedCompanionName: chart.companion?.displayName ?? null,
    adventureMapProfile: chart.adventureMapProfile,
    activeHomeworkSummary: chart.homework.pending
      ? `${chart.homework.pending.homeworkId}:${chart.homework.pending.capturedContent?.title ?? chart.homework.pending.contentProfile?.topic ?? "active homework"}`
      : null,
    carePlanSummary: summarizeCarePlan(chart),
    recentEvidence,
    learningSignals: childLearningSignalsForPacket(chart),
  };
}

function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function localDateFor(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateOnlyUtcMs(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day);
}

function daysUntilDate(testDate: string | null, localDate: string): number | null {
  if (!testDate) return null;
  const target = dateOnlyUtcMs(testDate);
  const today = dateOnlyUtcMs(localDate);
  if (!Number.isFinite(target) || !Number.isFinite(today)) return null;
  return Math.ceil((target - today) / 86_400_000);
}

function sessionIntensityForDays(daysUntilTest: number | null): AssignmentMasteryContext["sessionIntensity"] {
  if (daysUntilTest === null) return "build";
  if (daysUntilTest <= 0) return "final_check";
  if (daysUntilTest <= 2) return "urgent";
  if (daysUntilTest <= 5) return "build";
  return "low";
}

function sessionsRemainingForDays(daysUntilTest: number | null): number | null {
  if (daysUntilTest === null) return null;
  return Math.max(1, Math.min(daysUntilTest + 1, 5));
}

export function buildAssignmentMasteryContext(args: {
  now?: Date;
  timeZone?: string;
  testDate?: string | null;
  testDateSource?: AssignmentMasteryContext["testDateSource"];
  testDateConfirmed?: boolean;
  requiredAbilities?: string[];
} = {}): AssignmentMasteryContext {
  const now = args.now ?? new Date();
  const timeZone = args.timeZone ?? systemTimeZone();
  const localDate = localDateFor(now, timeZone);
  const testDate = args.testDate ?? null;
  const daysUntilTest = daysUntilDate(testDate, localDate);
  return {
    nowIso: now.toISOString(),
    localDate,
    timeZone,
    testDate,
    testDateSource: args.testDateSource ?? "unknown",
    testDateConfirmed: args.testDateConfirmed ?? false,
    daysUntilTest,
    goal: "Demonstrate mastery of the captured homework by the test date.",
    requiredAbilities: args.requiredAbilities ?? [
      "Infer every required ability from the captured homework evidence and source groups.",
      "Make each source group visible in the board plan or explicitly justify deferring it.",
      "Use baseline activities to teach and measure, Quest to prove transfer, and Boss to gate mastery.",
    ],
    expectedSessionsRemaining: sessionsRemainingForDays(daysUntilTest),
    sessionIntensity: sessionIntensityForDays(daysUntilTest),
    readinessProof: {
      centralQuestion: "What would prove the child can do the captured homework without Sunny over-helping?",
      proofStandard: "Use the homework domain to identify the decisive proof; support activities can prepare the child, but readiness needs evidence that matches the real assignment demand.",
      supportEvidence: ["practice accuracy", "retry recovery", "help or hint use", "latency and pacing"],
      notEnoughEvidence: ["completion alone", "preference alone", "reward choice alone"],
    },
  };
}

function isSpellingTestExtraction(extraction: AssignmentSourceExtraction): boolean {
  const text = `${extraction.filename}\n${extraction.fullText}`.toLowerCase();
  return /\bspelling\b/.test(text) || /\bword list\b/.test(text) || /\bsilent letters?\b/.test(text);
}

function readinessProofForExtraction(
  extraction: AssignmentSourceExtraction,
  fallback: AssignmentReadinessProofContext,
): AssignmentReadinessProofContext {
  if (!isSpellingTestExtraction(extraction)) return fallback;
  return {
    centralQuestion: "Can the child spell the test words from memory without seeing the word?",
    proofStandard: "Fresh unaided spelling production or clean recall evidence is the readiness proof for spelling-test targets.",
    supportEvidence: [
      "scaffolded spelling practice",
      "letter construction support",
      "recognition fluency",
      "pronunciation or read-aloud fluency",
    ],
    notEnoughEvidence: [
      "visible-word recognition alone",
      "pronunciation alone",
      "preference choice alone",
      "completion alone",
    ],
  };
}

function slugForSourceHeading(value: string, fallback: string): string {
  const slug = normalizeNodeSlug(value);
  return slug || fallback;
}

function spellingGroupsFromSourceText(extraction: AssignmentSourceExtraction): Array<{
  id: string;
  label: string;
  purpose: HomeworkTargetPurpose;
  words: string[];
  confidence: number;
  evidence: string[];
}> {
  const text = extraction.fullText || extraction.pages.map((page) => page.text).join("\n");
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const headingIndex = lines.findIndex((line) => /silent letters?/i.test(line) && /high[- ]frequency/i.test(line));
  if (headingIndex < 0) return [];

  const leftWords: string[] = [];
  const rightWords: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    const tokens = [...line.matchAll(/[A-Za-z][A-Za-z'-]*/g)]
      .map((match) => match[0].toLowerCase().replace(/[^a-z'-]/g, ""))
      .filter((token) => token.length >= 3 && !/^o+$/.test(token));
    if (tokens.length !== 2) continue;
    leftWords.push(tokens[0]!);
    rightWords.push(tokens[1]!);
  }
  if (leftWords.length === 0 || rightWords.length === 0) return [];
  return [
    {
      id: slugForSourceHeading("Silent Letters", "silent-letters").replace(/-/g, "_"),
      label: "Silent Letters",
      purpose: "spell_from_memory",
      words: leftWords,
      confidence: 0.9,
      evidence: ["Source heading pairs Silent Letters under Benchmark Advance Spelling."],
    },
    {
      id: slugForSourceHeading("High-Frequency Words", "high-frequency-words").replace(/-/g, "_"),
      label: "High-Frequency Words",
      purpose: "spell_from_memory",
      words: rightWords,
      confidence: 0.86,
      evidence: ["Source is a spelling test word list; high-frequency words are part of the test words."],
    },
  ];
}

function capturedHomeworkFromSource(extraction: AssignmentSourceExtraction): AssignmentPlanningCapturedHomework {
  const spellingGroups = isSpellingTestExtraction(extraction)
    ? spellingGroupsFromSourceText(extraction)
    : [];
  const words = spellingGroups.flatMap((group) => group.words);
  const title = isSpellingTestExtraction(extraction)
    ? "Benchmark Advance Spelling Unit 9 Week 3"
    : extraction.filename;
  const captured = buildCapturedHomeworkContent({
    title,
    type: isSpellingTestExtraction(extraction) ? "spelling_test" : "generic",
    rawText: extraction.fullText,
    words,
    questions: [],
    wordGroups: spellingGroups,
    sourceDocuments: [{ filename: extraction.filename, mediaType: extraction.mediaType }],
    contentProfile: {
      practiceDomain: isSpellingTestExtraction(extraction) ? "spelling" : "generic",
      contentDomain: "language_arts",
      topic: isSpellingTestExtraction(extraction) ? "Silent letters and high-frequency words" : extraction.filename,
      primarySkill: isSpellingTestExtraction(extraction) ? "Spell words from memory" : "content_understanding",
      assignmentFormat: isSpellingTestExtraction(extraction)
        ? "Spelling test word list"
        : "worksheet",
      concepts: isSpellingTestExtraction(extraction)
        ? ["silent letter patterns", "high-frequency word spelling"]
        : [],
      sourceEvidence: [
        extraction.filename,
        ...extraction.warnings,
      ],
    },
  });
  return {
    title: captured.title,
    type: captured.type,
    words: captured.words,
    questions: captured.questions,
    wordGroups: captured.wordGroups,
    sourceDocuments: captured.sourceDocuments,
    contentProfile: captured.contentProfile,
  };
}

export function buildAssignmentPlanningPacket(args: {
  childId: string;
  extraction: AssignmentSourceExtraction;
  childChart: ChildChart;
  currentEvidenceSummary?: string[];
  masteryContext?: AssignmentMasteryContext;
  parentDialogue?: AssignmentPlannerDialogueTurn[];
  priorPlannerOutput?: AssignmentPlannerOutput;
}): AssignmentPlanningPacket {
  const recentEvidence = args.currentEvidenceSummary ?? [];
  const childChart = childChartSummaryForPacket(args.childChart, recentEvidence);
  const catalog = activityCatalog(args.childId, args.extraction);
  const capturedHomework = capturedHomeworkFromSource(args.extraction);
  const baseMasteryContext = args.masteryContext ?? buildAssignmentMasteryContext();
  const readinessProof = readinessProofForExtraction(
    args.extraction,
    baseMasteryContext.readinessProof ?? buildAssignmentMasteryContext().readinessProof!,
  );
  return {
    packetVersion: 1,
    childId: args.childId,
    masteryContext: {
      ...baseMasteryContext,
      readinessProof,
    },
    sourceDocument: {
      filename: args.extraction.filename,
      sourcePath: args.extraction.sourcePath,
      sourceKind: args.extraction.sourceKind,
      mediaType: args.extraction.mediaType,
      fileHash: args.extraction.fileHash,
      extractionMethod: args.extraction.extractionMethod,
      warnings: [...args.extraction.warnings],
      pages: args.extraction.pages.map((page) => ({ ...page })),
      fullText: args.extraction.fullText,
    },
    capturedHomework,
    childChart,
    activityCatalog: catalog,
    ...(args.parentDialogue?.length ? { parentDialogue: args.parentDialogue.map((turn) => ({ ...turn })) } : {}),
    plannerInstruction: [
      "Use capturedHomework as the assignment truth; do not echo captured content back.",
      "Activities are instruments. Choose nodes by target purpose, not by generic fun.",
      "Do not collapse teacher-labeled groups into one skill.",
      "Use recent canonical activity evidence as lesson-to-lesson labs: weak targets get support; mastered targets get smaller checks or transfer instead of full repeated baseline.",
      "When evidence conflicts, probe contradictory targets first and explain the uncertainty.",
      "High-frequency groups whose purpose is recognize or read_fluently should usually be measured by visible_read or pronunciation, not spelling production, unless source or evidence explicitly says spelling is the gap.",
      "If a child needs shorter cohorts, shorten target lists and vary instruments by purpose instead of repeating many same-activity nodes.",
      "Keep the returned plan compact.",
      "Design two named learning routes when the catalog has enough launchable instruments; each route should feel like a real child choice and test a distinct route hypothesis.",
      "Each learning route needs a child-specific rationale, target groups, nodeIds, and activities that measure the route hypothesis.",
      "Each activity must be chosen because its measured skills fit that declared purpose.",
      "Always include reviewQuestions with concise tutor-facing explanations for the activity choices and evidence checks.",
    ].join(" "),
    ...(args.priorPlannerOutput ? { priorPlannerOutput: args.priorPlannerOutput } : {}),
  };
}

export function validateAssignmentPlannerOutput(
  output: AssignmentPlannerOutput,
  args: {
    extraction: AssignmentSourceExtraction;
    activityIds?: string[];
    activityCatalog?: AssignmentActivityCard[];
  },
): AssignmentPlanValidationIssue[] {
  const issues: AssignmentPlanValidationIssue[] = [];
  const sourceFilename = output.capturedContent.sourceDocuments[0]?.filename;
  if (!sourceFilename) {
    issues.push({
      code: "missing_source_document",
      severity: "error",
      message: "Planner output must retain the source document link.",
    });
  }

  const groups = output.assignmentInterpretation.wordGroups.length
    ? output.assignmentInterpretation.wordGroups
    : output.capturedContent.wordGroups ?? [];
  if (groups.length === 0) {
    issues.push({
      code: "missing_word_groups",
      severity: "error",
      message: "Planner output must preserve source word groups.",
    });
  }

  const groupIds = new Set(groups.map((group) => group.id));
  for (const word of output.homeworkWords) {
    if (!groupIds.has(word.sourceGroupId)) {
      issues.push({
        code: "word_missing_source_group",
        severity: "error",
        message: `Word ${word.text} references unknown source group ${word.sourceGroupId}.`,
      });
    }
  }

  const catalog = args.activityCatalog ?? activityCatalog();
  const activityIds = new Set(
    args.activityIds ?? catalog
      .filter((card) => card.launchable)
      .map((card) => card.activityId),
  );
  const measurementIds = new Set(output.plannedMeasurements.map((measurement) => measurement.id));
  for (const node of output.activeSessionPlan.nodePlan) {
    if (!activityIds.has(node.activityId)) {
      issues.push({
        code: "unknown_activity_id",
        severity: "error",
        message: `Node ${node.id} references unknown activity ${node.activityId}.`,
      });
    }
    if (!isPlannerDestinationActivity(node.activityId) && !measurementIds.has(`measure-${node.id}`)) {
      issues.push({
        code: "missing_node_measurement",
        severity: "error",
        message: `Learning node ${node.id} must have planned measurement id measure-${node.id} with support, revise, and falsify criteria.`,
      });
    }
    const nodeTargetKeys = new Set(node.targets.map((target) => target.trim().toLowerCase()).filter(Boolean));
    const declaredLaneGroup = node.targetLane ? groups.find((group) => group.id === node.targetLane) : undefined;
    if (declaredLaneGroup) {
      const laneTargets = new Set(declaredLaneGroup.words.map((word) => word.trim().toLowerCase()).filter(Boolean));
      const outOfLaneTargets = [...nodeTargetKeys].filter((target) => !laneTargets.has(target));
      if (outOfLaneTargets.length > 0) {
        issues.push({
          code: "target_lane_mismatch",
          severity: "error",
          message: `Node ${node.id} targetLane ${declaredLaneGroup.id} includes out-of-lane targets: ${outOfLaneTargets.join(", ")}.`,
        });
      }
    }
    if (node.type === "word-radar" && !node.wordRadarConfig) {
      issues.push({
        code: "missing_word_radar_config",
        severity: "error",
        message: `Word Radar node ${node.id} must include planner-selected wordRadarConfig.`,
      });
    }
  }

  return issues;
}

export function summarizeAssignmentPlanForReview(output: AssignmentPlannerOutput): string {
  const lines: string[] = [];
  const reasoningLines = [
    output.planTheory.hypothesis,
    ...output.reviewQuestions,
  ]
    .map((line) => line.trim())
    .filter(Boolean);
  const seenReasoning = new Set<string>();
  lines.push("Assignment planning review");
  lines.push("");
  lines.push("Source groups:");
  for (const group of output.assignmentInterpretation.wordGroups) {
    lines.push(`- ${group.label} (${group.id}) purpose=${group.purpose}: ${group.words.join(", ")}`);
  }
  lines.push("");
  lines.push("Chosen nodes:");
  for (const node of output.activeSessionPlan.nodePlan) {
    lines.push(`- ${node.id}: ${node.activityId} target lane: ${node.targetLane ?? "unspecified"} targets=${node.targets.join(", ")}`);
  }
  lines.push("");
  lines.push("Reasoning:");
  for (const reasoning of reasoningLines) {
    const key = reasoning.toLowerCase();
    if (seenReasoning.has(key)) continue;
    seenReasoning.add(key);
    lines.push(`- ${reasoning}`);
  }
  return lines.join("\n");
}

export function resolveAssignmentPlannerModel(
  opts: AssignmentPlanningOptions = {},
  env: Partial<Pick<NodeJS.ProcessEnv, "SUNNY_EXPERIENCE_PLANNER_MODEL">> = process.env,
): string {
  return opts.model ?? env.SUNNY_EXPERIENCE_PLANNER_MODEL ?? "claude-sonnet-4-6";
}

function imageMediaType(filePath: string): "image/png" | "image/jpeg" | "image/webp" | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return null;
}

export function assignmentPlannerSourceImages(packet: AssignmentPlanningPacket): Array<{
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  data: string;
}> {
  return packet.sourceDocument.pages
    .map((page) => page.imagePath)
    .filter((imagePath): imagePath is string => Boolean(imagePath))
    .map((imagePath) => {
      const mediaType = imageMediaType(imagePath);
      if (!mediaType || !fs.existsSync(imagePath)) return null;
      return {
        mediaType,
        data: fs.readFileSync(imagePath).toString("base64"),
      };
    })
    .filter((image): image is { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string } => Boolean(image));
}

export function buildAssignmentPlannerPrompt(packet: AssignmentPlanningPacket): string {
  const revisionInstruction = packet.parentDialogue?.length || packet.priorPlannerOutput
    ? "\n- This is a human-in-the-loop revision. Use parentDialogue and priorPlannerOutput as context, then return one coherent revised plan from the same source."
    : "";
  return `${ASSIGNMENT_PLANNER_PERSONA}

Design today's learning journey for this child from the source-of-truth packet.

Call ${ASSIGNMENT_PLANNER_TOOL_NAME} exactly once. Do not answer with free-text JSON.

Output contract:
- Use packet.capturedHomework as the captured assignment truth. Do not return capturedContent or homeworkWords.
- Do not flatten capturedHomework.wordGroups.
- Use each source group's captured target purpose from packet.capturedHomework.assignmentInterpretation.
- Do not assume every group on a spelling handout has the same success target; teacher headings can distinguish spelling production from reading fluency, recognition, vocabulary, or review.
- Match each source group to activities whose cataloged skills can actually measure that purpose.
- For any node targeting one source word group, targetLane must exactly equal that source wordGroups[].id. Do not invent expanded lane names.
- Do not use an activity just because it is fun or nearby; use the activity catalog as the instrument list.
- If parentDialogue is present in the packet, this is human-in-the-loop context. Use it to revise the plan without overriding captured source evidence.
- Choose nodePlan directly. Do not merely explain a prebuilt board.
- Keep the tool output compact: no prose outside fields, no repeated rationales, no more nodes than the adventure spine needs.
- Create activeSessionPlan.learningRoutes with two named learning routes when the activity catalog has enough launchable instruments. Each route must include a route hypothesis, child-specific rationale, and nodeIds that refer to real nodePlan entries.
- Every activeSessionPlan.nodePlan entry must have exactly one corresponding plannedMeasurements entry with id "measure-\${node.id}". That measurement must state what would support, revise, or falsify the planner's theory for that exact node.
- Treat childChart.adventureMapProfile as delivery preference and layout intent. It is not today's board.
- Code owns board ids, edges, locks, choice gates, and payload ids. You own the learning journey, route names, route hypotheses, target groups, and why those routes fit the child.
- Use packet.activityCatalog as the instrument list. Unavailable activities are visible for context but must not appear as launchable academic board nodes.
- Use activityCatalog evidence fields as the instrument truth table; do not treat all modes of one activity as equivalent.
- Use packet.masteryContext as the clock, deadline, and proof plan. The goal is demonstrated homework mastery by testDate, not merely completing a cute board.
- If one node mixes targets from multiple source groups, omit targetLane or split the node. Never claim targetLane "silent_letters" for a node containing high-frequency targets.
- Every word-radar node must include wordRadarConfig from the activity catalog capability modes. recallMode allows only visible_read, partial_visual_recall, hidden_word_recall. Never emit audio_cued_letter_recall as recallMode; cite capability ids only in rationale. If you choose the catalog's audio_cued_letter_recall capability mode, emit recallMode partial_visual_recall with audio-cued config values. Use partial_visual_recall for new/weak spelling construction, hidden_word_recall only with prior recall evidence, and visible_read for recognition/fluency. Omit wordRadarConfig on non-word-radar nodes.
- Include the adventure spine in activeSessionPlan.nodePlan: baseline measurement nodes first, then route nodes referenced by learningRoutes, then exactly one mystery node for child choice/bandit preference evidence after evidence-generating work, then a locked quest destination for generated transfer, then a locked boss destination for the mastery finale after quest evidence.
- Use type/activityId "mystery", choiceMode "choice_lab", locked false, and targets from the relevant active homework targets.
- Quest and Boss are destinations, not playable baseline nodes. Use type/activityId "quest" and "boss", locked true, masteryUnlockState "preparing"; Quest should target one exact source group if the theory is about one group, otherwise omit targetLane. Boss may have empty targets until quest evidence exists. Never invent targetLane values such as "all_homework", "mixed", or "combined".
- Include parent-review language that explains why every group was routed to its activity.
- In planTheory or reviewQuestions, explain why the journey you chose fits this child today.
- Use the packet as the only source of assignment truth.${revisionInstruction}
- Return one valid tool-call JSON object directly; the tool schema enforces activeSessionPlan.nodePlan, activeSessionPlan.learningRoutes, plannedMeasurements, planTheory, and reviewQuestions.

Packet:
${JSON.stringify(packet)}`;
}

type AssignmentPlannerResponseObject = z.infer<typeof assignmentPlannerDraftSchema>;

type JsonSchemaObject = Record<string, unknown>;

function jsonObject(value: unknown): JsonSchemaObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonSchemaObject;
}

function schemaProperties(schema: JsonSchemaObject | undefined): Record<string, JsonSchemaObject> {
  return (jsonObject(schema?.properties) ?? {}) as Record<string, JsonSchemaObject>;
}

function setSchemaRequired(schema: JsonSchemaObject | undefined, fields: string[]): void {
  if (!schema) return;
  schema.required = fields;
}

function removeSchemaProperty(schema: JsonSchemaObject | undefined, propertyName: string): void {
  const properties = schemaProperties(schema);
  delete properties[propertyName];
  const required = Array.isArray(schema?.required) ? schema.required.filter((field) => field !== propertyName) : [];
  if (schema) schema.required = required;
}

function enforcePlannerToolContract(schema: JsonSchemaObject): JsonSchemaObject {
  const activeSessionPlan = schemaProperties(schema).activeSessionPlan;
  removeSchemaProperty(activeSessionPlan, "adventureBoard");
  setSchemaRequired(activeSessionPlan, ["nodePlan", "learningRoutes"]);

  return schema;
}

export function assignmentPlannerToolJsonSchema(): Record<string, unknown> {
  return enforcePlannerToolContract(
    z.toJSONSchema(assignmentPlannerDraftSchema, { io: "input" }) as JsonSchemaObject,
  );
}

export class AssignmentPlannerToolInvalidError extends Error {
  readonly toolInput: unknown;
  readonly issues: z.core.$ZodIssue[];
  readonly keys: string;

  constructor(toolInput: unknown, issues: z.core.$ZodIssue[]) {
    const keys = toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)
      ? Object.keys(toolInput).sort().join(",")
      : typeof toolInput;
    super(`assignment_planner_tool_invalid:keys=${keys}:issues=${JSON.stringify(issues)}`);
    this.name = "AssignmentPlannerToolInvalidError";
    this.toolInput = toolInput;
    this.issues = issues;
    this.keys = keys;
  }
}

function fallbackPlanTheoryForToolInput(input: Record<string, unknown>): PlanTheory {
  const activeSessionPlan = jsonObject(input.activeSessionPlan);
  const routes = Array.isArray(activeSessionPlan?.learningRoutes)
    ? activeSessionPlan.learningRoutes as Array<Record<string, unknown>>
    : [];
  const reviewQuestions = Array.isArray(input.reviewQuestions)
    ? input.reviewQuestions.map((item) => String(item)).filter(Boolean)
    : [];
  const routeSummary = routes
    .map((route) => `${route.label ?? route.id ?? "route"}: ${route.rationale ?? ""}`.trim())
    .filter(Boolean);
  const evidenceSummary = [
    ...routeSummary.slice(0, 2),
    ...reviewQuestions.slice(0, 2),
  ].filter(Boolean);
  return {
    hypothesis: reviewQuestions[0] ?? routeSummary[0] ?? "Planner returned a compact intervention plan from the captured homework packet.",
    evidenceSummary: evidenceSummary.length ? evidenceSummary : ["Captured homework packet and child chart informed the intervention plan."],
    intervention: routeSummary[0] ?? "Use the selected nodePlan and learningRoutes as the intervention hypothesis.",
    supportCriteria: ["Node-level planned measurements support the route hypothesis."],
    reviseCriteria: ["Node-level planned measurements show fragile targets, retries, or support needs."],
    falsifyCriteria: ["Measurements contradict the selected route hypothesis or miss the captured homework targets."],
  };
}

function normalizeAssignmentPlannerToolInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  if (!record.activeSessionPlan || !record.plannedMeasurements) return input;
  const planTheory = record.planTheory ?? fallbackPlanTheoryForToolInput(record);
  const normalized: Record<string, unknown> = {
    ...record,
    planTheory,
  };
  if (!record.reviewQuestions) {
    const theory = planTheory as PlanTheory;
    normalized.reviewQuestions = [
      theory.hypothesis,
      theory.intervention,
      ...theory.supportCriteria,
      ...theory.reviseCriteria,
    ].filter(Boolean).slice(0, 8);
  }
  return normalized;
}

export function parseAssignmentPlannerToolUseResponse(
  response: Pick<Anthropic.Messages.Message, "content">,
): AssignmentPlannerResponseObject {
  const toolUse = response.content.find((block) =>
    block.type === "tool_use" &&
    "name" in block &&
    block.name === ASSIGNMENT_PLANNER_TOOL_NAME,
  );
  if (!toolUse || !("input" in toolUse)) {
    throw new Error(`assignment_planner_tool_missing:${ASSIGNMENT_PLANNER_TOOL_NAME}`);
  }
  try {
    return assignmentPlannerDraftSchema.parse(normalizeAssignmentPlannerToolInput(toolUse.input));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AssignmentPlannerToolInvalidError(toolUse.input, error.issues);
    }
    throw error;
  }
}

function firstJsonObject(value: string): string {
  const start = value.indexOf("{");
  if (start < 0) return value;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return value;
}

export function parseAssignmentPlannerJson(value: string): AssignmentPlannerResponseObject {
  const trimmed = value.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(firstJsonObject(trimmed)) as unknown;
  return assignmentPlannerDraftSchema.parse(normalizeAssignmentPlannerToolInput(parsed));
}

async function callAssignmentPlannerModel(
  packet: AssignmentPlanningPacket,
  model: string,
): Promise<{ draft: AssignmentPlannerResponseObject; usage?: LanguageModelUsage }> {
  const prompt = buildAssignmentPlannerPrompt(packet);
  const images = assignmentPlannerSourceImages(packet);
  return callAssignmentPlannerTool({ prompt, model, images });
}

function usageFromAnthropic(response: Pick<Anthropic.Messages.Message, "usage">): LanguageModelUsage {
  return {
    inputTokens: response.usage.input_tokens,
    inputTokenDetails: {
      noCacheTokens: response.usage.input_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? undefined,
    },
    outputTokens: response.usage.output_tokens,
    outputTokenDetails: {
      textTokens: response.usage.output_tokens,
      reasoningTokens: undefined,
    },
    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
  };
}

async function callAssignmentPlannerTool(args: {
  prompt: string;
  model: string;
  images?: ReturnType<typeof assignmentPlannerSourceImages>;
}): Promise<{ draft: AssignmentPlannerResponseObject; usage?: LanguageModelUsage }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: args.model,
    max_tokens: ASSIGNMENT_PLANNER_MAX_TOKENS,
    system: ASSIGNMENT_PLANNER_PERSONA,
    tools: [{
      name: ASSIGNMENT_PLANNER_TOOL_NAME,
      description: "Write Sunny's captured homework interpretation, active intervention node plan, measurements, and mastery theory.",
      input_schema: assignmentPlannerToolJsonSchema() as Anthropic.Messages.Tool.InputSchema,
    }],
    tool_choice: { type: "tool", name: ASSIGNMENT_PLANNER_TOOL_NAME },
    messages: [{
      role: "user",
      content: [
        ...(args.images ?? []).map((image) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: image.mediaType,
            data: image.data,
          },
        })),
        { type: "text" as const, text: args.prompt },
      ],
    }],
  });
  return {
    draft: parseAssignmentPlannerToolUseResponse(response),
    usage: usageFromAnthropic(response),
  };
}

export function hydrateAssignmentPlannerOutputFromDraft(
  draft: AssignmentPlannerResponseObject,
  packet: AssignmentPlanningPacket,
): AssignmentPlannerOutput {
  const legacyCapturedContent = capturedContentDraftSchema.safeParse((draft as Record<string, unknown>).capturedContent);
  const packetCapturedContent = buildCapturedHomeworkContent({
    title: packet.capturedHomework.title,
    type: packet.capturedHomework.type,
    rawText: packet.sourceDocument.fullText,
    words: packet.capturedHomework.words,
    wordGroups: packet.capturedHomework.wordGroups,
    questions: packet.capturedHomework.questions,
    sourceDocuments: packet.capturedHomework.sourceDocuments,
    contentProfile: packet.capturedHomework.contentProfile,
  });
  const capturedContent = packetCapturedContent.words.length > 0
    ? packetCapturedContent
    : legacyCapturedContent.success
      ? buildCapturedHomeworkContent({
          title: legacyCapturedContent.data.title,
          type: legacyCapturedContent.data.type as HomeworkType,
          rawText: packet.sourceDocument.fullText,
          words: legacyCapturedContent.data.words,
          wordGroups: legacyCapturedContent.data.wordGroups,
          questions: legacyCapturedContent.data.questions,
          sourceDocuments: legacyCapturedContent.data.sourceDocuments,
          contentProfile: normalizeContentProfile({
            title: legacyCapturedContent.data.title,
            type: legacyCapturedContent.data.type as HomeworkType,
            words: legacyCapturedContent.data.words,
            wordGroups: legacyCapturedContent.data.wordGroups,
            questions: legacyCapturedContent.data.questions,
            contentProfile: legacyCapturedContent.data.contentProfile,
          }),
        })
      : packetCapturedContent;
  const homeworkWords = capturedContent.homeworkWords?.map((word) => ({
    text: word.text,
    sourceGroupId: word.wordGroupId ?? "",
    purpose: word.purpose,
  })).filter((word) => word.sourceGroupId) ?? [];
  const legacyHomeworkWords = z.array(z.object({
    text: z.string().min(1),
    sourceGroupId: z.string().min(1),
    purpose: homeworkPurposeSchema,
  })).safeParse((draft as Record<string, unknown>).homeworkWords);
  const plannerHomeworkWords = homeworkWords.length > 0
    ? homeworkWords
    : legacyHomeworkWords.success ? legacyHomeworkWords.data : [];

  const generatedExperienceBriefs = hydrateGeneratedExperienceBriefs(draft.generatedExperienceBriefs, packet);
  const activeSessionPlan = hydrateActiveSessionPlanFromDraft({
    draft: draft.activeSessionPlan,
    packet,
    capturedContent,
    homeworkWords: plannerHomeworkWords,
    planTheory: draft.planTheory,
    plannedMeasurements: draft.plannedMeasurements,
    generatedExperienceBriefs,
  });

  return {
    capturedContent,
    assignmentInterpretation: capturedContent.assignmentInterpretation!,
    homeworkWords: plannerHomeworkWords,
    activeSessionPlan,
    plannedMeasurements: draft.plannedMeasurements,
    planTheory: draft.planTheory,
    reviewQuestions: draft.reviewQuestions,
    generatedExperienceBriefs,
  };
}

const ASSIGNMENT_BOARD_THEME: AdventureBoardJson["theme"] = {
  background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
  palette: {
    path: "#ffffff",
    completed: "#1f8f68",
    available: "#7c3aed",
    locked: "#aeb7c2",
    current: "#f59e0b",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(15, 23, 42, 0.84)",
  },
};

const ASSIGNMENT_BOARD_THUMBNAILS: Record<string, string> = {
  start: "/thumbnails/activities/word-radar.svg",
  "choice-gate": "/thumbnails/mystery-fallback.svg",
  "word-radar": "/generated/adventure-board-demo/word-radar.jpeg",
  "spell-check": "/generated/adventure-board-demo/spell-check.jpeg",
  pronunciation: "/generated/adventure-board-demo/pronunciation.jpeg",
  mystery: "/generated/adventure-board-demo/mystery.jpeg",
  quest: "/generated/adventure-board-demo/quest.jpeg",
  boss: "/generated/adventure-board-demo/boss.jpeg",
  "monster-stampede": "/thumbnails/activities/monster-stampede.svg",
  "wheel-of-fortune": "/thumbnails/activities/wheel-of-fortune.svg",
  karaoke: "/thumbnails/activities/karaoke.svg",
  "letter-rush": "/thumbnails/activities/speed-catcher.svg",
};

function labelForAssignmentBoardNode(
  packet: AssignmentPlanningPacket,
  node: ActiveSessionPlan["nodePlan"][number],
): string | undefined {
  const catalogLabel = packet.activityCatalog.find((card) => card.activityId === node.activityId)?.label;
  const lanePrefix = compactLabelForTargetLane(node.targetLane);
  if (node.activityId === "quest") return "Quest";
  if (node.activityId === "boss") return "Boss";
  if (node.activityId === "mystery") return "Mystery";
  if (node.activityId === "spell-check" && lanePrefix) return `${lanePrefix} Spell`;
  if (node.activityId === "word-radar") {
    const wordRadarLabel = labelForWordRadarBoardNode(node);
    if (wordRadarLabel === "Hear & Spell" && lanePrefix) return `${lanePrefix} Build`;
    return wordRadarLabel ?? catalogLabel;
  }
  return catalogLabel;
}

function compactLabelForTargetLane(targetLane: string | undefined): string | undefined {
  if (!targetLane) return undefined;
  const normalized = targetLane.toLowerCase();
  if (normalized === "silent_letters") return "Silent";
  if (normalized === "high_frequency" || normalized === "high_frequency_words") return "Sight";
  return undefined;
}

function labelForWordRadarBoardNode(node: ActiveSessionPlan["nodePlan"][number]): string | undefined {
  const config = node.wordRadarConfig;
  if (!config) return undefined;
  if (config.recallMode === "visible_read") return "Quick Read";
  if (config.recallMode === "hidden_word_recall") return "Recall Run";
  if (config.recallMode === "partial_visual_recall" && config.speakStyle === "option-b") {
    return "Hear & Spell";
  }
  if (config.recallMode === "partial_visual_recall") return "Letter Recall";
  return undefined;
}

function thumbnailForAssignmentBoardNode(node: ActiveSessionPlan["nodePlan"][number]): string | undefined {
  return ASSIGNMENT_BOARD_THUMBNAILS[node.activityId] ?? ASSIGNMENT_BOARD_THUMBNAILS[node.type];
}

async function planAssignmentFromSourceInternal(
  packet: AssignmentPlanningPacket,
  opts: AssignmentPlanningOptions = {},
): Promise<{ output: AssignmentPlannerOutput; telemetry: AssignmentPlannerTelemetry }> {
  if (!process.env.ANTHROPIC_API_KEY && !opts.callPlannerModel) {
    throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
  }
  const model = resolveAssignmentPlannerModel(opts);
  const started = Date.now();
  const callPlannerModel = opts.callPlannerModel ?? callAssignmentPlannerModel;
  const result = await callPlannerModel(packet, model);
  const output = hydrateAssignmentPlannerOutputFromDraft(result.draft, packet);
  const validationIssues = validateAssignmentPlannerOutput(output, {
    extraction: packet.sourceDocument,
    activityCatalog: packet.activityCatalog,
  });
  const blockingIssues = validationIssues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    throw new Error(`assignment_planner_validation_failed:${blockingIssues.map((issue) => issue.code).join(",")}`);
  }

  return {
    output,
    telemetry: {
      model,
      usage: result.usage,
      latencyMs: Date.now() - started,
    },
  };
}

function hydrateActiveSessionPlanFromDraft(args: {
  draft: AssignmentPlannerResponseObject["activeSessionPlan"];
  packet: AssignmentPlanningPacket;
  capturedContent: CapturedHomeworkContent;
  homeworkWords: AssignmentPlannerHomeworkWord[];
  planTheory: PlanTheory;
  plannedMeasurements: PlannedMeasurement[];
  generatedExperienceBriefs?: GeneratedExperienceBrief[];
}): ActiveSessionPlan {
  const companionId = args.packet.childChart.selectedCompanionId ?? "elli";
  const planId = args.draft.planId ?? `assignment-plan-${args.packet.childId}-${args.packet.sourceDocument.fileHash.slice(0, 8)}`;
  const wordsByLane = new Map<string, Set<string>>();
  for (const word of args.homeworkWords) {
    wordsByLane.set(word.sourceGroupId, new Set([
      ...(wordsByLane.get(word.sourceGroupId) ?? []),
      word.text,
    ]));
  }
  const nodePlan = args.draft.nodePlan.map((node) => ({
    ...node,
    type: normalizeAssignmentNodeType(node.type, node.activityId),
    difficulty: node.difficulty ?? 1,
    targetLane: node.targetLane &&
      node.targets.length > 0 &&
      node.targets.every((target) => wordsByLane.get(node.targetLane!)?.has(target))
      ? node.targetLane
      : undefined,
    wordRadarConfig: node.activityId === "word-radar" ? node.wordRadarConfig : undefined,
    source: "chart_planner" as const,
  }));
  return {
    planId,
    childId: args.packet.childId,
    createdAt: new Date().toISOString(),
    source: "ingest_human_loop",
    domain: args.capturedContent.contentProfile.practiceDomain,
    testDate: null,
    nodePlan,
    learningRoutes: args.draft.learningRoutes,
    adventureBoard: buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId,
        childId: args.packet.childId,
        domain: args.capturedContent.contentProfile.practiceDomain,
        nodePlan,
        learningRoutes: args.draft.learningRoutes,
      },
      boardId: `assignment-board-${args.packet.childId}-${args.packet.sourceDocument.fileHash.slice(0, 8)}`,
      title: args.capturedContent.title,
      theme: ASSIGNMENT_BOARD_THEME,
      layout: {
        preset: "horizontal-adventure-spine",
        companionSlot: args.packet.childChart.adventureMapProfile?.companionSlot ?? "right",
      },
      plannerRationale: {
        agencyDesign: args.planTheory.intervention,
        evidenceDesign: args.planTheory.hypothesis,
        layoutChoice: "Sunny materialized the horizontal adventure board from the planner's validated intervention node plan.",
      },
      companion: {
        id: companionId,
        name: args.packet.childChart.selectedCompanionName ?? companionId,
      },
      labelForNode: (node) =>
        labelForAssignmentBoardNode(args.packet, node as ActiveSessionPlan["nodePlan"][number]),
      thumbnailForNode: (node) =>
        thumbnailForAssignmentBoardNode(node as ActiveSessionPlan["nodePlan"][number]),
    }),
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: args.packet.sourceDocument.fileHash.slice(0, 12),
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId,
      displayName: args.packet.childChart.selectedCompanionName ?? companionId,
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: args.draft.evidenceUsed?.length
      ? args.draft.evidenceUsed
      : [{ id: "assignment-source", type: "assignment_source", summary: "AI planner used the stored assignment source packet." }],
    openQuestions: args.draft.openQuestions ?? [],
    plannerConfidence: args.draft.plannerConfidence,
    approvalStatus: "pending",
    planTheory: args.planTheory,
    plannedMeasurements: args.plannedMeasurements,
    generatedExperienceBriefs: args.generatedExperienceBriefs,
  };
}

function hydrateGeneratedExperienceBriefs(
  briefs: AssignmentPlannerResponseObject["generatedExperienceBriefs"] | undefined,
  packet: AssignmentPlanningPacket,
): GeneratedExperienceBrief[] | undefined {
  if (!briefs?.length) return undefined;
  return briefs.map((brief, index) => ({
    briefId: `${packet.childId}-${brief.kind}-${index + 1}`,
    kind: brief.kind,
    title: brief.title,
    learningGoal: brief.learningGoal,
    targetSkills: [],
    targetConcepts: [],
    targetWords: brief.targetWords,
    engagementHooks: [],
    algorithmTargets: ["assignment_planner"],
    evidenceUsed: brief.evidenceUsed,
    artifactStatus: "brief_only",
    validationRequired: true,
  }));
}

export async function planAssignmentFromSource(
  packet: AssignmentPlanningPacket,
  opts: AssignmentPlanningOptions = {},
): Promise<AssignmentPlannerOutput> {
  return (await planAssignmentFromSourceInternal(packet, opts)).output;
}

export async function planAssignmentFromSourceWithTelemetry(
  packet: AssignmentPlanningPacket,
  opts: AssignmentPlanningOptions = {},
): Promise<{ output: AssignmentPlannerOutput; telemetry: AssignmentPlannerTelemetry }> {
  return planAssignmentFromSourceInternal(packet, opts);
}
