import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { LanguageModelUsage } from "ai";
import { z } from "zod";
import type {
  ActiveSessionPlan,
  EngagementTheory,
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
  type HomeworkWordGroup,
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
  engagementTheory?: Pick<EngagementTheory, "theoryId" | "hypothesis" | "preferredDimensions" | "avoidedDimensions" | "promptDirectives" | "nextExperiment"> | null;
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
  /** Planner-declared instrument gaps; always set by hydrate, optional for legacy fixtures. */
  generationRequests?: PlannerGenerationRequest[];
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
// Per-node rounds + generationRequests add ~1.5-2k output tokens on math plans;
// 8k keeps the single tool call from truncating mid-plan.
const ASSIGNMENT_PLANNER_MAX_TOKENS = 16_000;

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

const baselineRoundSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    correct: z.boolean(),
  })).min(2).max(3),
});

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
  rounds: z.preprocess(
    (value) => value === null ? undefined : value,
    z.array(baselineRoundSchema).max(6).optional(),
  ),
});

const generationRequestSchema = z.object({
  id: z.string().min(1),
  skillTarget: z.string().min(1),
  targetLane: z.preprocess((value) => value === null ? undefined : value, z.string().optional()),
  domain: z.string().min(1),
  mechanicConstraints: z.string().min(1),
  reason: z.string().min(1),
});

export type PlannerGenerationRequest = z.infer<typeof generationRequestSchema>;

const learningRouteSchema: z.ZodType<LearningRoutePrescription> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  rationale: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1),
});

const compactActiveSessionPlanSchema = z.object({
  planId: z.string().min(1).optional(),
  nodePlan: z.array(compactNodePlanSchema).min(1).max(12),
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
  generationRequests: z.preprocess(
    (value) => value === null ? undefined : value,
    z.array(generationRequestSchema).max(6).default([]),
  ),
  generatedExperienceBriefs: z.array(z.object({
    kind: z.enum(["quest", "boss", "visual-explainer"]),
    title: z.string().min(1),
    learningGoal: z.string().min(1),
    targetWords: z.array(z.string().min(1)),
    evidenceUsed: z.array(z.string().min(1)),
  })).max(3).optional(),
}).passthrough();

function realChildAllowedActivityIds(
  childId: string,
  extraction?: AssignmentSourceExtraction,
): Set<string> | null {
  if (childId.trim().toLowerCase() === "demo-pashley" || inferPlannerCatalogDomain(extraction) === "math") {
    return null;
  }
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
  const contentText = [
    extraction?.filename,
    extraction?.fullText,
    ...(extraction?.pages ?? []).map((page) => page.text),
  ].filter(Boolean).join("\n").toLowerCase();
  const domainFromContent = classifyPlannerCatalogDomainFromText(contentText);
  if (domainFromContent) return domainFromContent;
  const pathText = (extraction?.sourcePath ?? "").toLowerCase();
  return classifyPlannerCatalogDomainFromText(pathText) ?? "reading";
}

function classifyPlannerCatalogDomainFromText(text: string): LearningDomain | null {
  if (/(^|[^a-z])(spelling|spell|word list|silent letters?|high-frequency)([^a-z]|$)/.test(text)) return "spelling";
  if (/(^|[^a-z])(clock|coin|math|add|subtract|multiply|divide|fractions?)([^a-z]|$)/.test(text)) return "math";
  if (/(^|[^a-z])(read|reading|fluency|passage|comprehension)([^a-z]|$)/.test(text)) return "reading";
  return null;
}

function activityCatalog(
  childId = "demo_adaptive",
  extraction?: AssignmentSourceExtraction,
): AssignmentActivityCard[] {
  const allowed = realChildAllowedActivityIds(childId, extraction);
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
    engagementTheory: chart.engagementTheory
      ? {
          theoryId: chart.engagementTheory.theoryId,
          hypothesis: chart.engagementTheory.hypothesis,
          preferredDimensions: chart.engagementTheory.preferredDimensions,
          avoidedDimensions: chart.engagementTheory.avoidedDimensions,
          promptDirectives: chart.engagementTheory.promptDirectives,
          nextExperiment: chart.engagementTheory.nextExperiment,
        }
      : null,
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

const MATH_CONCEPT_CLUSTERS: Array<{ id: string; label: string; keywords: RegExp }> = [
  { id: "time_telling", label: "Telling Time", keywords: /\b(time|clock|hour|minute|o'clock)\b/i },
  { id: "money_reasoning", label: "Money", keywords: /\b(money|cent|cents|dollar|quarter|nickel|dime|penny|coins?|change)\b/i },
  { id: "multiplication", label: "Multiplication", keywords: /\b(multiply|multiplication|times|product|equal groups|rows? of)\b|\d\s*[x×]\s*\d/i },
  { id: "fractions", label: "Fractions", keywords: /\b(fraction|numerator|denominator|half|halves|third|thirds|fourth|fourths|\d\/\d)\b|\d\/\d/i },
  { id: "addition_subtraction", label: "Addition and Subtraction", keywords: /\b(add|addition|sum|plus|subtract|subtraction|difference|minus)\b|\d\s*[+\-]\s*\d/i },
];

export function classifyMathConceptCluster(text: string): string | null {
  const cluster = MATH_CONCEPT_CLUSTERS.find((candidate) => candidate.keywords.test(text));
  return cluster?.id ?? null;
}

function mathGroupsFromSourceText(extraction: AssignmentSourceExtraction): HomeworkWordGroup[] {
  const text = extraction.fullText.trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const problems = lines
    .filter((line) =>
      /^\d+\./.test(line) ||
      /(time|money|clock|quarter|dime|cent|multiply|multiplication|fraction|÷|\+|\-|×|x\s*\d|\d\s*x\s*\d|=)/i.test(line),
    )
    .slice(0, 16);
  if (problems.length === 0) return [];

  const clustered = new Map<string, string[]>();
  const leftovers: string[] = [];
  for (const problem of problems) {
    const cluster = MATH_CONCEPT_CLUSTERS.find((candidate) => candidate.keywords.test(problem));
    if (cluster) {
      clustered.set(cluster.id, [...(clustered.get(cluster.id) ?? []), problem]);
    } else {
      leftovers.push(problem);
    }
  }

  const groups: HomeworkWordGroup[] = [];
  for (const cluster of MATH_CONCEPT_CLUSTERS) {
    const words = clustered.get(cluster.id);
    if (!words?.length) continue;
    groups.push({
      id: cluster.id,
      label: cluster.label,
      purpose: "unknown",
      words,
      confidence: 0.75,
      evidence: [`Clustered math worksheet lines by ${cluster.label.toLowerCase()} keywords.`],
    });
  }
  if (leftovers.length > 0 || groups.length === 0) {
    groups.push({
      id: slugForSourceHeading("Math Problems", "math-problems").replace(/-/g, "_"),
      label: "Math Problems",
      purpose: "unknown",
      words: leftovers.length > 0 ? leftovers : problems,
      confidence: 0.7,
      evidence: ["Parsed math worksheet lines from assignment source text."],
    });
  }
  return groups;
}

function capturedHomeworkFromSource(extraction: AssignmentSourceExtraction): AssignmentPlanningCapturedHomework {
  const spellingGroups = isSpellingTestExtraction(extraction)
    ? spellingGroupsFromSourceText(extraction)
    : [];
  const mathGroups = spellingGroups.length === 0 ? mathGroupsFromSourceText(extraction) : [];
  const sourceGroups = spellingGroups.length > 0 ? spellingGroups : mathGroups;
  const words = sourceGroups.flatMap((group) => group.words);
  const isMath = mathGroups.length > 0;
  const title = isSpellingTestExtraction(extraction)
    ? "Benchmark Advance Spelling Unit 9 Week 3"
    : isMath
      ? extraction.filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || extraction.filename
      : extraction.filename;
  const captured = buildCapturedHomeworkContent({
    title,
    type: isSpellingTestExtraction(extraction) ? "spelling_test" : isMath ? "math" : "generic",
    rawText: extraction.fullText,
    words,
    questions: isMath
      ? words.map((question, index) => ({
          id: index + 1,
          question,
          type: "multiple_choice" as const,
          options: null,
          correctAnswer: null,
          hint: "",
        }))
      : [],
    wordGroups: sourceGroups,
    sourceDocuments: [{ filename: extraction.filename, mediaType: extraction.mediaType }],
    contentProfile: {
      practiceDomain: isSpellingTestExtraction(extraction) ? "spelling" : isMath ? "math" : "generic",
      contentDomain: isSpellingTestExtraction(extraction) ? "language_arts" : isMath ? "math" : "language_arts",
      topic: isSpellingTestExtraction(extraction)
        ? "Silent letters and high-frequency words"
        : isMath
          ? title
          : extraction.filename,
      primarySkill: isSpellingTestExtraction(extraction)
        ? "Spell words from memory"
        : isMath
          ? "Solve math problems"
          : "content_understanding",
      assignmentFormat: isSpellingTestExtraction(extraction)
        ? "Spelling test word list"
        : isMath
          ? "Math worksheet"
          : "worksheet",
      concepts: isSpellingTestExtraction(extraction)
        ? ["silent letter patterns", "high-frequency word spelling"]
        : isMath
          ? ["math fluency", "math problem solving"]
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
      "Size the spine to the captured concepts and the child chart: every distinct source group (concept lane) gets at least one measurement node, and a group containing clearly distinct sub-skills may split into multiple nodes on the same lane with different target subsets.",
      "Design two named learning routes when the catalog has enough launchable instruments; each route should feel like a real child choice and test a distinct route hypothesis, and each route must contain at least one nodePlan node exclusive to that route.",
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
    // Math targets are problem statements, not captured lane words, so the
    // out-of-lane check only applies to word-driven domains.
    if (declaredLaneGroup && output.capturedContent.contentProfile.practiceDomain !== "math") {
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
  env: Partial<Pick<NodeJS.ProcessEnv, "SUNNY_EXPERIENCE_PLANNER_MODEL" | "SUNNY_INGEST_MODEL">> = process.env,
): string {
  return opts.model ?? env.SUNNY_EXPERIENCE_PLANNER_MODEL ?? env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
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
- Keep the tool output compact: no prose outside fields, no repeated rationales. Compact means no filler, not fewer teaching nodes: size the spine to the captured concepts and the child chart. Every distinct source group (concept lane) gets at least one measurement node. A single group containing clearly distinct sub-skills (for example shading unit fractions vs comparing fraction magnitude) should split into multiple nodes on the same targetLane with different target subsets.
- nodePlan is capped at 12 entries including mystery, quest, and boss; if the spine would exceed it, drop route nodes before dropping baseline coverage of any sub-skill.
- Create activeSessionPlan.learningRoutes with two named learning routes when the activity catalog has enough launchable instruments. Each route must include a route hypothesis, child-specific rationale, and nodeIds that refer to real nodePlan entries. Each route must contain at least one non-destination node exclusive to that route; two routes listing identical nodeIds are cosmetic and will be dropped by code. When only one instrument type is launchable, make routes distinct by giving each route its own node with a different target subset, difficulty, or capability mode.
- Every activeSessionPlan.nodePlan entry must have exactly one corresponding plannedMeasurements entry with id "measure-\${node.id}". That measurement must state what would support, revise, or falsify the planner's theory for that exact node.
- Treat childChart.adventureMapProfile as delivery preference and layout intent. It is not today's board.
- Code owns board ids, edges, locks, choice gates, and payload ids. You own the learning journey, route names, route hypotheses, target groups, and why those routes fit the child.
- Use packet.activityCatalog as the instrument list. Unavailable activities are visible for context but must not appear as launchable academic board nodes.
- Use activityCatalog evidence fields as the instrument truth table; do not treat all modes of one activity as equivalent.
- When no launchable instrument serves a sub-skill, emit a generationRequests entry (targetLane = the generated-baseline node's lane) with mechanicConstraints distinct from every other request.
- Give each generated-baseline node rounds from the captured worksheet problems: id, prompt, 2-3 options, exactly one correct; extend fact families, do not invent unrelated problems.
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
- If childChart.engagementTheory exists, preserve its theoryId and use its preferred/avoided dimensions to design the next controlled experiment. Hold academic targets constant while varying only the declared engagement variable.
- Every route and Mystery option must declare a different experiment arm when it claims to test a preference. Do not use cosmetic labels for identical content.

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

function parseEmbeddedPlannerObject(value: string): Record<string, unknown> | undefined {
  let candidate = value.trim();
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate) break;
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        candidate = parsed.trim();
        continue;
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      const repairedWrapper = candidate.replace(
        /(\"generatedExperienceBriefs\"\s*:\s*\[[\s\S]*?\])\s*\}\s*,\s*(\"plannedMeasurements\"\s*:)/,
        "$1,$2",
      );
      if (repairedWrapper !== candidate) {
        candidate = repairedWrapper;
        continue;
      }
      const repairedFlattenedPlan = candidate.replace(
        /\}\s*,\s*(\"plannedMeasurements\"\s*:)/,
        ",$1",
      );
      if (repairedFlattenedPlan !== candidate) {
        candidate = repairedFlattenedPlan;
        continue;
      }
      const bounded = firstJsonObject(candidate);
      if (bounded !== candidate) {
        candidate = bounded;
        continue;
      }
      break;
    }
    break;
  }
  return undefined;
}

function stringArrayOrFallback(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function normalizePlannerTheory(value: unknown, fallback: PlanTheory): PlanTheory {
  const candidate = typeof value === "string"
    ? parseEmbeddedPlannerObject(value)
    : jsonObject(value);
  if (!candidate) return fallback;
  return {
    hypothesis: typeof candidate.hypothesis === "string" && candidate.hypothesis.trim()
      ? candidate.hypothesis
      : fallback.hypothesis,
    evidenceSummary: stringArrayOrFallback(candidate.evidenceSummary, fallback.evidenceSummary),
    intervention: typeof candidate.intervention === "string" && candidate.intervention.trim()
      ? candidate.intervention
      : fallback.intervention,
    supportCriteria: stringArrayOrFallback(candidate.supportCriteria, fallback.supportCriteria),
    reviseCriteria: stringArrayOrFallback(candidate.reviseCriteria, fallback.reviseCriteria),
    falsifyCriteria: stringArrayOrFallback(candidate.falsifyCriteria, fallback.falsifyCriteria),
  };
}

function normalizeAssignmentPlannerToolInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  let record = { ...(input as Record<string, unknown>) };
  if (typeof record.activeSessionPlan === "string") {
    const embedded = parseEmbeddedPlannerObject(record.activeSessionPlan);
    if (embedded) {
      record = {
        ...record,
        ...embedded,
        activeSessionPlan: jsonObject(embedded.activeSessionPlan) ?? embedded,
      };
    }
  }
  const activeSessionPlan = jsonObject(record.activeSessionPlan);
  if (activeSessionPlan && !Array.isArray(activeSessionPlan.nodePlan)) {
    const captured = jsonObject(record.capturedContent);
    const capturedWords = Array.isArray(captured?.words)
      ? captured.words.map((item) => String(item)).filter(Boolean)
      : [];
    const homeworkWords = Array.isArray(record.homeworkWords)
      ? record.homeworkWords
        .map((item) => jsonObject(item)?.text)
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const targetLane = Array.isArray(captured?.wordGroups)
      ? jsonObject(captured.wordGroups[0])?.id
      : undefined;
    const recoveredTargets = [...capturedWords, ...homeworkWords].slice(0, 5).filter(Boolean);
    record.activeSessionPlan = {
      ...activeSessionPlan,
      nodePlan: [{
        id: "node-planner-recovery",
        type: "generated-baseline",
        activityId: "generated-baseline",
        targets: recoveredTargets.length ? recoveredTargets : ["captured-homework"],
        ...(typeof targetLane === "string" ? { targetLane } : {}),
        difficulty: 1,
        locked: false,
        masteryUnlockState: "preparing",
      }],
    };
  }
  if (!record.activeSessionPlan || !record.plannedMeasurements) return input;
  const planTheory = normalizePlannerTheory(record.planTheory, fallbackPlanTheoryForToolInput(record));
  const normalized: Record<string, unknown> = {
    ...record,
    planTheory,
    ...(Array.isArray(record.reviewQuestions)
      ? { reviewQuestions: record.reviewQuestions.slice(0, 8) }
      : {}),
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
  const timeoutMs = Math.max(10_000, Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120_000));
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await client.messages.create({
    model: args.model,
    max_tokens: Math.max(8_000, Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? ASSIGNMENT_PLANNER_MAX_TOKENS)),
    system: ASSIGNMENT_PLANNER_PERSONA,
    tools: [{
      name: ASSIGNMENT_PLANNER_TOOL_NAME,
      description: "Write Sunny's captured homework interpretation, active intervention node plan, measurements, and mastery theory. Populate every tool field directly as its declared object or array type. Never serialize the plan or any tool field into a JSON string.",
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
  }, { signal });
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
  const sourceWordGroups = capturedContent.assignmentInterpretation?.wordGroups
    ?? packet.capturedHomework.wordGroups
    ?? [];
  const enrichedActiveSessionPlan = demoteDuplicateDestinations(defaultTargetLaneFromSingleGroup(
    capturedContent.contentProfile.practiceDomain === "math"
      ? enrichMathPlannerDraft({
          draft: draft.activeSessionPlan,
          wordGroups: sourceWordGroups,
        })
      : draft.activeSessionPlan,
    sourceWordGroups,
  ));
  const plannedMeasurements = syncPlannedMeasurementsForNodePlan(
    enrichedActiveSessionPlan.nodePlan,
    draft.plannedMeasurements,
  );
  const activeSessionPlan = hydrateActiveSessionPlanFromDraft({
    draft: enrichedActiveSessionPlan,
    packet,
    capturedContent,
    homeworkWords: plannerHomeworkWords,
    planTheory: draft.planTheory,
    plannedMeasurements,
    generatedExperienceBriefs,
  });
  const generationRequests = reconcileGenerationRequests({
    requests: draft.generationRequests ?? [],
    nodePlan: enrichedActiveSessionPlan.nodePlan,
    domain: capturedContent.contentProfile.practiceDomain,
  });

  return {
    capturedContent,
    assignmentInterpretation: capturedContent.assignmentInterpretation!,
    homeworkWords: plannerHomeworkWords,
    activeSessionPlan,
    plannedMeasurements,
    planTheory: draft.planTheory,
    reviewQuestions: draft.reviewQuestions,
    generationRequests,
    generatedExperienceBriefs,
  };
}

/**
 * The planner contract allows exactly one quest and one boss destination, but
 * the LLM occasionally types an evidence route node "quest"; the board would
 * then promote that route node to the destination and drop the real quest.
 * Keep the last quest/boss-typed node (the planner is instructed to place
 * destinations at the end of the spine) and demote earlier duplicates to
 * generated-baseline evidence nodes.
 */
function demoteDuplicateDestinations(plan: PlannerDraftPlan): PlannerDraftPlan {
  const demoted: string[] = [];
  const nextNodePlan = [...plan.nodePlan];
  for (const destination of ["quest", "boss"] as const) {
    const indexes = nextNodePlan
      .map((node, index) => (node.activityId === destination || node.type === destination ? index : -1))
      .filter((index) => index >= 0);
    for (const index of indexes.slice(0, -1)) {
      const node = nextNodePlan[index]!;
      nextNodePlan[index] = {
        ...node,
        type: "generated-baseline" as PlannerDraftNode["type"],
        activityId: "generated-baseline" as PlannerDraftNode["activityId"],
        locked: false,
        masteryUnlockState: undefined,
      };
      demoted.push(`${node.id} (${destination})`);
    }
  }
  if (demoted.length === 0) return plan;
  const warning = `planner_duplicate_destination_demoted: ${demoted.join(", ")} retyped to generated-baseline; only the final quest/boss stay destinations.`;
  console.log(`  🎮 [assignment-planner] [destination-warning] ${warning}`);
  return {
    ...plan,
    nodePlan: nextNodePlan,
    openQuestions: [...(plan.openQuestions ?? []), warning],
  };
}

/**
 * Every generated-baseline node needs a generation request to drive the shell
 * factory; synthesize requests the planner forgot and drop requests whose
 * lane is already served by a hand-built instrument node.
 */
function reconcileGenerationRequests(args: {
  requests: PlannerGenerationRequest[];
  nodePlan: PlannerDraftPlan["nodePlan"];
  domain: string;
}): PlannerGenerationRequest[] {
  const generatedNodes = args.nodePlan.filter((node) => node.activityId === "generated-baseline");
  if (generatedNodes.length === 0) return [];
  const laneHasGeneratedNode = new Set(
    generatedNodes.map((node) => node.targetLane?.trim().toLowerCase()).filter(Boolean),
  );
  const kept = args.requests.filter((request) => {
    const lane = request.targetLane?.trim().toLowerCase();
    return !lane || laneHasGeneratedNode.has(lane);
  });
  const coveredLanes = new Set(
    kept.map((request) => request.targetLane?.trim().toLowerCase()).filter(Boolean),
  );
  const synthesized: PlannerGenerationRequest[] = [];
  for (const node of generatedNodes) {
    const lane = node.targetLane?.trim().toLowerCase();
    if (lane && coveredLanes.has(lane)) continue;
    if (!lane && kept.length + synthesized.length > 0) continue;
    coveredLanes.add(lane ?? node.id);
    synthesized.push({
      id: `genreq-${node.id}`,
      skillTarget: node.targetLane ?? node.targets[0] ?? "practice",
      targetLane: node.targetLane,
      domain: args.domain,
      mechanicConstraints: `Practice instrument for targets: ${node.targets.slice(0, 4).join(", ")}`,
      reason: "Synthesized: generated-baseline node had no planner generation request.",
    });
  }
  return [...kept, ...synthesized];
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
  // Child-facing boards name the concept, not the engine plumbing: fall through
  // to the concept-lane labels in adventureBoardFromPlan.
  if (node.activityId === "generated-baseline" || node.activityId === "concept-check") {
    return undefined;
  }
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
  if (node.thumbnailUrl) return node.thumbnailUrl;
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

function synthesizePlannedMeasurementForNode(node: {
  id: string;
  activityId: string;
  targets: string[];
  targetLane?: string;
}): PlannedMeasurement {
  const targetSummary = node.targets.slice(0, 3).join(", ") || node.targetLane || "captured concept";
  return {
    id: `measure-${node.id}`,
    activityId: node.activityId,
    target: targetSummary,
    evidenceType: node.activityId === "concept-check" ? "practice:concept_check" : "practice:math_baseline",
    supportCriteria: `Child completes ${node.activityId} on ${targetSummary} with usable target-level evidence.`,
    reviseCriteria: `Misses, retries, or help requests on ${targetSummary} suggest scaffold or lane refill change.`,
    falsifyCriteria: `Strong independent accuracy on ${targetSummary} without contamination supports advancing the lane.`,
  };
}

function syncPlannedMeasurementsForNodePlan(
  nodePlan: Array<{ id: string; activityId: string; targets: string[]; targetLane?: string }>,
  plannedMeasurements: PlannedMeasurement[],
): PlannedMeasurement[] {
  const byId = new Map(plannedMeasurements.map((measurement) => [measurement.id, measurement]));
  for (const node of nodePlan) {
    if (isPlannerDestinationActivity(node.activityId)) continue;
    const measureId = `measure-${node.id}`;
    if (!byId.has(measureId)) {
      byId.set(measureId, synthesizePlannedMeasurementForNode(node));
      console.log(`  🎮 [assignment-planner] [measurement-sync] added ${measureId} for ${node.activityId}`);
    }
  }
  return [...byId.values()];
}

function expandMathConceptLanes(groups: HomeworkWordGroup[]): Array<HomeworkWordGroup & { activityId?: string }> {
  const lanes: Array<HomeworkWordGroup & { activityId?: string }> = [];
  for (const group of groups) {
    if (group.id === "multiplication") {
      const source = group.words.join(" ");
      const facts = [...source.matchAll(/\b(\d+)\s*[x×]\s*(\d+)\s*=\s*(?:_+|\?)/gi)]
        .map((match) => `${match[1]}x${match[2]}`);
      const problemSource = source.split(/word\s*problems?\s*:/i)[1] ?? "";
      const stories = problemSource.split("?")
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter((part) => part.length > 12 && /\b(each|rows?|groups?|boxes?|in all|total)\b/i.test(part))
        .map((part) => `${part}?`);
      if (facts.length > 0) {
        lanes.push({
          ...group,
          id: "multiplication_fluency",
          label: "Multiplication Facts",
          words: [...new Set(facts)],
          activityId: "generated-baseline",
        });
      }
      if (stories.length > 0) {
        lanes.push({
          ...group,
          id: "multiplication_word_problems",
          label: "Equal-Groups Stories",
          words: [...new Set(stories)],
          activityId: "generated-baseline",
        });
      }
      if (facts.length > 0 || stories.length > 0) continue;
    }
    if (group.id === "fractions" && group.words.length >= 2) {
      const shadeThirds = group.words.filter((word) => /\b(third|thirds|1\/3)\b/i.test(word));
      const shadeFourths = group.words.filter((word) => /\b(fourth|fourths|1\/4)\b/i.test(word));
      const compare = group.words.filter((word) => /\b(larger|compare|greater|smaller|which)\b/i.test(word));
      if (shadeThirds.length) {
        lanes.push({
          ...group,
          id: "fraction_shade_thirds",
          label: "Shade Thirds",
          words: shadeThirds,
          activityId: "generated-baseline",
        });
      }
      if (shadeFourths.length) {
        lanes.push({
          ...group,
          id: "fraction_shade_fourths",
          label: "Shade Fourths",
          words: shadeFourths,
          activityId: "generated-baseline",
        });
      }
      if (compare.length) {
        lanes.push({
          ...group,
          id: "fraction_compare",
          label: "Compare Fractions",
          words: compare,
          activityId: "concept-check",
        });
      }
      if (lanes.length > 0) continue;
      const splitLabels = ["Shade Thirds", "Shade Fourths", "Compare Fractions"] as const;
      const splitIds = ["fraction_shade_thirds", "fraction_shade_fourths", "fraction_compare"] as const;
      const splitActivities = ["generated-baseline", "generated-baseline", "concept-check"] as const;
      for (const [index, word] of group.words.slice(0, 3).entries()) {
        lanes.push({
          ...group,
          id: splitIds[index]!,
          label: splitLabels[index]!,
          words: [word],
          activityId: splitActivities[index],
        });
      }
      continue;
    }
    lanes.push({
      ...group,
      activityId:
        group.id === "time_telling"
          ? "clock-game"
          : group.id === "money_reasoning"
            ? "coin-counter"
            : "generated-baseline",
    });
  }
  return lanes.slice(0, 4);
}

type PlannerDraftNode = z.infer<typeof compactNodePlanSchema>;
type PlannerDraftPlan = z.infer<typeof compactActiveSessionPlanSchema>;

/**
 * With exactly one source group the lane is unambiguous, so fill it in when
 * the planner omitted targetLane; board labels then use the concept-lane name
 * (e.g. "Times Tables") instead of the node's raw first target.
 */
function defaultTargetLaneFromSingleGroup(
  plan: PlannerDraftPlan,
  wordGroups: HomeworkWordGroup[],
): PlannerDraftPlan {
  const onlyGroupId = wordGroups.length === 1 ? wordGroups[0]?.id?.trim() : undefined;
  if (!onlyGroupId) return plan;
  return {
    ...plan,
    nodePlan: plan.nodePlan.map((node) =>
      node.targetLane || isPlannerDestinationActivity(node.activityId)
        ? node
        : { ...node, targetLane: onlyGroupId },
    ),
  };
}

/** When the LLM emits a thin or mis-typed math spine, rebuild from captured concept lanes. */
export function enrichMathPlannerDraft(args: {
  draft: PlannerDraftPlan;
  wordGroups: HomeworkWordGroup[];
}): PlannerDraftPlan {
  const conceptLanes = expandMathConceptLanes(args.wordGroups);
  if (conceptLanes.length === 0) return args.draft;

  const teachingNodes = args.draft.nodePlan.filter(
    (node) => !isPlannerDestinationActivity(node.activityId),
  );
  const validTeaching = teachingNodes.filter(
    (node) => !["quest", "boss", "mystery"].includes(node.activityId),
  );
  const multiplicationExperiment = conceptLanes.some(
    (lane) => lane.id === "multiplication" || lane.id.startsWith("multiplication_"),
  );
  const generatedMathLane = conceptLanes.length === 1 && conceptLanes[0]?.activityId === "generated-baseline";
  const usesUnalignedMathInstrument = generatedMathLane && validTeaching.some(
    (node) => node.activityId !== "generated-baseline",
  );
  if (
    !multiplicationExperiment &&
    !usesUnalignedMathInstrument &&
    validTeaching.length >= Math.min(3, conceptLanes.length) &&
    validTeaching.length >= 2
  ) {
    return args.draft;
  }

  console.log(
    `  🎮 [assignment-planner] [math-enrich] rebuilding spine lanes=${conceptLanes.length} validTeaching=${validTeaching.length}`,
  );

  const baselineNodes: PlannerDraftNode[] = conceptLanes.map((lane, index) => ({
    id: `node-baseline-${lane.id}`,
    type: (lane.activityId ?? "generated-baseline") as PlannerDraftNode["type"],
    activityId: (lane.activityId ?? "generated-baseline") as PlannerDraftNode["activityId"],
    targets: lane.words.slice(0, 4),
    targetLane: lane.id,
    difficulty: 1,
    locked: false,
    masteryUnlockState: "preparing",
  }));

  const routeExclusiveA: PlannerDraftNode = {
    id: `node-route-a-${conceptLanes[0]!.id}`,
    type: baselineNodes[0]!.activityId,
    activityId: baselineNodes[0]!.activityId,
    targets: conceptLanes[0]!.words.slice(0, 4),
    targetLane: conceptLanes[0]!.id,
    difficulty: 2,
    locked: false,
    masteryUnlockState: "preparing",
  };
  const routeLane = conceptLanes[1] ?? conceptLanes[0]!;
  const routeExclusiveB: PlannerDraftNode = {
    id: `node-route-b-${routeLane.id}`,
    type: (conceptLanes[1]?.activityId ?? conceptLanes[0]?.activityId ?? "generated-baseline") as PlannerDraftNode["type"],
    activityId: (conceptLanes[1]?.activityId ?? conceptLanes[0]?.activityId ?? "generated-baseline") as PlannerDraftNode["activityId"],
    targets: routeLane.words.slice(0, 4),
    targetLane: routeLane.id,
    difficulty: 2,
    locked: false,
    masteryUnlockState: "preparing",
  };

  const allTargets = conceptLanes.flatMap((lane) => lane.words).slice(0, 6);
  if (multiplicationExperiment) {
    routeExclusiveA.targets = [...allTargets];
    routeExclusiveA.difficulty = 2;
    routeExclusiveB.targets = [...allTargets];
    routeExclusiveB.difficulty = 2;
  }
  const existingMystery = args.draft.nodePlan.find((node) => node.activityId === "mystery");
  const existingQuest = args.draft.nodePlan.find((node) => node.activityId === "quest");
  const existingBoss = args.draft.nodePlan.find((node) => node.activityId === "boss");

  const mystery: PlannerDraftNode = existingMystery ?? {
    id: "node-mystery",
    type: "mystery",
    activityId: "mystery",
    targets: allTargets,
    difficulty: 1,
    choiceMode: "choice_lab",
    locked: false,
    masteryUnlockState: "preparing",
  };
  const quest: PlannerDraftNode = {
    ...(existingQuest ?? {
      id: "node-quest",
      type: "quest",
      activityId: "quest",
      targets: allTargets.slice(0, 3),
      difficulty: 2,
    }),
    locked: true,
    masteryUnlockState: "preparing",
  };
  const boss: PlannerDraftNode = {
    ...(existingBoss ?? {
      id: "node-boss",
      type: "boss",
      activityId: "boss",
      targets: [],
      difficulty: 3,
    }),
    locked: true,
    masteryUnlockState: "preparing",
  };

  const nodePlan = multiplicationExperiment
    ? [routeExclusiveA, routeExclusiveB, mystery, quest, boss]
    : [...baselineNodes.slice(0, 3), routeExclusiveA, routeExclusiveB, mystery, quest, boss];

  return {
    ...args.draft,
    nodePlan,
    learningRoutes: [
      {
        id: multiplicationExperiment ? "route-speed-facts" : "route-visual-first",
        label: multiplicationExperiment ? "Speed Facts Sprint" : "Picture It First",
        rationale: multiplicationExperiment
          ? "Test a competitive, timed fact-retrieval presentation while holding multiplication targets and difficulty constant."
          : "Build the visual unit-fraction model before comparing sizes.",
        nodeIds: [
          routeExclusiveA.id,
          mystery.id,
          quest.id,
          boss.id,
        ],
      },
      {
        id: multiplicationExperiment ? "route-story-problems" : "route-compare-first",
        label: multiplicationExperiment ? "Story Problems Path" : "Compare First",
        rationale: multiplicationExperiment
          ? "Test an untimed equal-groups story presentation while holding the same multiplication target family constant."
          : "Probe magnitude reasoning before more shading practice.",
        nodeIds: [
          routeExclusiveB.id,
          mystery.id,
          quest.id,
          boss.id,
        ],
      },
    ],
  };
}

type DraftLearningRoute = NonNullable<AssignmentPlannerResponseObject["activeSessionPlan"]["learningRoutes"]>[number];

/**
 * Routes whose non-destination nodeIds are identical are cosmetic: the board
 * compiler cannot render a real fork from them, so drop them and say why.
 */
export function normalizeLearningRoutesForPlan<TRoute extends { id: string; nodeIds: string[] }>(
  routes: TRoute[] | undefined,
  nodePlan: Array<{ id: string; activityId: string; type?: string }>,
): { routes: TRoute[]; warnings: string[] } {
  if (!routes?.length) return { routes: [], warnings: [] };
  const destinationIds = new Set(
    nodePlan
      .filter((node) => PLANNER_DESTINATION_ACTIVITY_IDS.has((node.activityId ?? node.type ?? "").toLowerCase()))
      .map((node) => node.id),
  );
  const knownIds = new Set(nodePlan.map((node) => node.id));
  const routeKeys = routes.map((route) =>
    [...new Set(route.nodeIds.filter((id) => knownIds.has(id) && !destinationIds.has(id)))]
      .sort()
      .join("|"),
  );
  const allIdentical = routeKeys.length >= 2 && routeKeys.every((key) => key === routeKeys[0]);
  if (allIdentical) {
    const warning =
      `learning_routes_dropped_identical_node_sets: routes [${routes.map((route) => route.id).join(", ")}] ` +
      "list identical non-destination nodeIds, so no real fork can render. Planner must give each route an exclusive node.";
    console.log(`  🎮 [assignment-planner] [route-warning] ${warning}`);
    return { routes: [], warnings: [warning] };
  }
  return { routes, warnings: [] };
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
  // Math node targets are problem statements ("5x2"), not captured lane
  // words, so the word-membership anti-mislabel check only applies to
  // word-driven domains; math lanes just need to be real source group ids.
  const knownLaneIds = new Set(
    (args.capturedContent.wordGroups ?? []).map((group) => group.id),
  );
  const requiresLaneWordMatch =
    args.capturedContent.contentProfile.practiceDomain !== "math";
  const nodePlan = args.draft.nodePlan.map((node) => ({
    ...node,
    type: normalizeAssignmentNodeType(node.type, node.activityId),
    difficulty: node.difficulty ?? 1,
    targetLane: node.targetLane &&
      knownLaneIds.has(node.targetLane) &&
      (!requiresLaneWordMatch ||
        (node.targets.length > 0 &&
          node.targets.every((target) => wordsByLane.get(node.targetLane!)?.has(target))))
      ? node.targetLane
      : undefined,
    wordRadarConfig: node.activityId === "word-radar" ? node.wordRadarConfig : undefined,
    source: "chart_planner" as const,
  }));
  const normalizedRoutes = normalizeLearningRoutesForPlan<DraftLearningRoute>(
    args.draft.learningRoutes,
    nodePlan,
  );
  return {
    planId,
    childId: args.packet.childId,
    createdAt: new Date().toISOString(),
    source: "ingest_human_loop",
    domain: args.capturedContent.contentProfile.practiceDomain,
    testDate: null,
    nodePlan,
    learningRoutes: normalizedRoutes.routes,
    adventureBoard: buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId,
        childId: args.packet.childId,
        domain: args.capturedContent.contentProfile.practiceDomain,
        nodePlan,
        learningRoutes: normalizedRoutes.routes,
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
    openQuestions: [...(args.draft.openQuestions ?? []), ...normalizedRoutes.warnings],
    plannerConfidence: args.draft.plannerConfidence,
    approvalStatus: "pending",
    planTheory: args.planTheory,
    plannedMeasurements: args.plannedMeasurements,
    generatedExperienceBriefs: args.generatedExperienceBriefs,
  };
}

function defaultBriefEvidenceFromPacket(packet: AssignmentPlanningPacket): string[] {
  const groups = packet.capturedHomework.wordGroups ?? [];
  const groupEvidence = groups.flatMap((group) =>
    group.words.slice(0, 2).map((word) => `captured:${group.id}:${word}`),
  );
  const sourceEvidence = [`assignment_source:${packet.sourceDocument.filename}`];
  return [...groupEvidence, ...sourceEvidence].slice(0, 8);
}

function hydrateGeneratedExperienceBriefs(
  briefs: AssignmentPlannerResponseObject["generatedExperienceBriefs"] | undefined,
  packet: AssignmentPlanningPacket,
): GeneratedExperienceBrief[] | undefined {
  const fallbackEvidence = defaultBriefEvidenceFromPacket(packet);
  const sourceBriefs = briefs?.length
    ? briefs
    : [{
        kind: "quest" as const,
        title: `Quest: ${packet.capturedHomework.title || "Apply captured homework"}`,
        learningGoal: "Transfer captured worksheet concepts with evidence-backed challenge design.",
        targetWords: packet.capturedHomework.words.slice(0, 6),
        evidenceUsed: fallbackEvidence,
      }];

  return sourceBriefs.map((brief, index) => ({
    briefId: `${packet.childId}-${brief.kind}-${index + 1}`,
    kind: brief.kind,
    title: brief.title,
    learningGoal: brief.learningGoal,
    targetSkills: [],
    targetConcepts: (packet.capturedHomework.wordGroups ?? []).map((group) => group.id),
    targetWords: brief.targetWords,
    engagementHooks: [],
    algorithmTargets: ["assignment_planner"],
    evidenceUsed: brief.evidenceUsed?.length ? brief.evidenceUsed : fallbackEvidence,
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
