import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { generateText, type LanguageModelUsage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  PlanTheory,
  PlannedMeasurement,
} from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import { ALL_NODE_TYPES, type NodeType } from "../shared/adventureTypes";
import type { ChildChart } from "../profiles/childChart";
import {
  listActivityToolContracts,
  type ActivityCapabilityMode,
} from "./activityToolCatalog";
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
import { validateAdventureBoardJson } from "../shared/adventureBoardValidation";

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
  inputModes: string[];
  measures: string[];
  configSource: string;
  requiredConfig: string;
  evidencePolicy: string;
  strengths: string[];
  weakFor: string[];
  goodFitWhen: string[];
  badFitWhen: string[];
  capabilityModes: ActivityCapabilityMode[];
  status: "ok" | "unavailable" | "missing_config_metadata";
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
};

export type AssignmentPlanningPacket = {
  packetVersion: 1;
  childId: string;
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
  childChart: AssignmentPlanningChildChartSummary;
  activityCatalog: AssignmentActivityCard[];
  boardPlanning: AssignmentBoardPlanningContext;
  plannerInstruction: string;
};

export type AlgorithmContract = {
  id: "choicePolicy" | "spacedRepetition" | "questReadiness" | "masteryGate";
  purpose: string;
  needs: string[];
  outputs: string[];
  guardrails: string[];
};

export type AssignmentBoardPlanningContext = {
  childChart: AssignmentPlanningChildChartSummary;
  assignment: {
    filename: string;
    sourceKind: string;
    extractionMethod: string;
    warnings: string[];
    fullText: string;
  };
  recentEvidence: string[];
  algorithmContracts: {
    choicePolicy: AlgorithmContract;
    spacedRepetition: AlgorithmContract;
    questReadiness: AlgorithmContract;
    masteryGate: AlgorithmContract;
  };
  choicePolicyContext: {
    purpose: string;
    evidenceSignals: string[];
    signalQualityNotes: string[];
    plannerDecision: string;
  };
  boardTemplate: {
    preset: "horizontal-adventure-spine";
    visualSkin: "grok-full-experience";
    companionSlot: "right";
    routeChoiceBehavior: "exclusive";
    routeChoicePlacement: "after-required-baseline";
    requiredBaselineCountBeforeRouteChoice: 2;
    capabilities: {
      supportsChoiceGates: true;
      supportsModalChoiceSets: true;
      supportsQuestBossLocks: true;
      supportsCompanionSlot: true;
    };
    slots: {
      "1": "start";
      "2": "baseline";
      "3": "baseline";
      "4": "choice-gate";
      "5a.1": "upper-route";
      "5a.2": "upper-route";
      "5b.1": "lower-route";
      "5b.2": "lower-route";
      "5c.1": "middle-route";
      "5c.2": "middle-route";
      "6": "mystery";
      "7": "quest";
      "8": "boss";
    };
    art: {
      backgroundUrl: string;
      nodeThumbnails: Record<string, string>;
      choiceThumbnails: Record<string, string>;
    };
    palette: AdventureBoardJson["theme"]["palette"];
    displayRules: {
      requireImageBackground: true;
      requireCompanion: true;
      requireNodeThumbnails: true;
      requireShortLabels: true;
      requireLayoutRoles: true;
      maxDisplayLabelLength: 18;
    };
  };
  runtimeConstraints: {
    rendererOnly: true;
    noRuntimePlanning: true;
    outputMustBeSerializableJson: true;
  };
  criticPolicy: {
    semanticAudit: "always";
    visualCritic: "risk_gated";
    riskSignals: string[];
    retryLimit: 1;
  };
};

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
    | "missing_mystery_choice"
    | "missing_quest_destination"
    | "missing_boss_destination"
    | "target_lane_mismatch"
    | "unknown_activity_id"
    | "board_missing_edge_endpoint"
    | "board_choice_option_missing_node"
    | "board_choice_gate_missing_choice_set"
    | "board_fake_agency"
    | "choice_gate_missing_baseline_incoming_edge"
    | "board_baseline_choice_route_missing"
    | "board_baseline_choice_route_too_few_options"
    | "baseline_choice_route_disconnected"
    | "board_choice_gate_missing_outgoing_edge"
    | "board_baseline_choice_missing_node"
    | "board_learning_node_missing_node_plan_reference"
    | "board_unknown_activity_id"
    | "board_preference_claims_mastery"
    | "board_choice_signal_missing"
    | "board_choice_signal_claims_mastery"
    | "board_background_not_image"
    | "board_companion_missing"
    | "board_node_thumbnail_missing"
    | "board_node_slot_missing"
    | "board_node_layout_missing"
    | "board_label_too_long"
    | "board_choice_art_missing"
    | "board_route_layout_order_gap"
    | "board_baseline_layout_order_gap"
    | "board_palette_not_approved";
  severity: "error" | "warning";
  message: string;
};

export type AssignmentPlanningOptions = {
  model?: string;
};

export type AssignmentPlannerTelemetry = {
  model: string;
  usage?: LanguageModelUsage;
  latencyMs: number;
};

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

const NODE_TYPES = new Set<NodeType>(ALL_NODE_TYPES);
const PLANNER_DESTINATION_ACTIVITY_IDS = new Set(["mystery", "quest", "boss"]);
const INSTRUMENT_RENDERERS: Record<string, NodeType> = {
  "spelling-recall": "letter-rush",
};
export const ASSIGNMENT_PLANNER_PERSONA =
  "You are Sunny's assignment planner: a pediatric learning psychologist and adaptive game director. You decide today's learning route from the child chart, source homework, evidence, stamina, motivation, and activity instruments; code renders your plan.";

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

const wordRadarNodeConfigSchema = z.object({
  recallMode: z.enum(["visible_read", "partial_visual_recall", "hidden_word_recall"]),
  inputMode: z.enum(["whole-word", "letter-by-letter", "keyboard"]),
  speakStyle: z.enum(["option-a", "option-b"]),
  showTimer: z.boolean(),
  timerSeconds: z.number().optional(),
  hideWordDuringResponse: z.boolean(),
  requiresCapturedResponse: z.boolean(),
});

const compactTargetsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value
    .split(/[\n,;]+/g)
    .map((target) => target.trim())
    .filter(Boolean);
}, z.array(z.string().min(1)));

const compactNodePlanSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  activityId: z.string().min(1),
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

function optionalFromNull<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => value === null ? undefined : value, schema.optional());
}

const adventureBoardPaletteSchema = z.object({
  path: z.string().min(1),
  completed: z.string().min(1),
  available: z.string().min(1),
  locked: z.string().min(1),
  current: z.string().min(1),
  preview: z.string().min(1),
  text: z.string().min(1),
  panel: z.string().min(1),
}).strict();

const adventureBoardThemeSchema = z.object({
  background: z.discriminatedUnion("type", [
    z.object({ type: z.literal("image"), value: z.string().min(1) }).strict(),
    z.object({ type: z.literal("gradient"), value: z.string().min(1) }).strict(),
    z.object({ type: z.literal("solid"), value: z.string().min(1) }).strict(),
  ]),
  palette: adventureBoardPaletteSchema,
}).strict();

const adventureBoardSlotSchema = z.enum([
  "1",
  "2",
  "3",
  "4",
  "5a.1",
  "5a.2",
  "5b.1",
  "5b.2",
  "5c.1",
  "5c.2",
  "6",
  "7",
  "8",
]);

const adventureBoardLayoutSchema = z.object({
  preset: z.literal("horizontal-adventure-spine"),
  companionSlot: optionalFromNull(z.enum(["right", "left", "none"])),
  routeChoiceBehavior: optionalFromNull(z.enum(["exclusive", "parallel"])),
}).strict();

const adventureBoardNodeLayoutSchema = z.object({
  role: optionalFromNull(z.enum(["start", "baseline", "mystery", "evidence-route", "choice-gate", "quest", "boss"])),
  lane: optionalFromNull(z.enum(["main", "upper", "middle", "lower"])),
  order: optionalFromNull(z.number()),
  routeGroupId: optionalFromNull(z.string().min(1)),
  selected: optionalFromNull(z.boolean()),
}).strict();

const adventureBoardTargetSchema = z.preprocess((value) => {
  if (value === null || typeof value !== "object") return value === null ? undefined : value;
  const record = value as Record<string, unknown>;
  if (record.laneId == null || record.skill == null) return undefined;
  return value;
}, z.object({
  laneId: z.string().min(1),
  skill: z.string().min(1),
  words: optionalFromNull(z.array(z.string().min(1))),
}).strict().optional());

const adventureBoardNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["start", "activity", "choice-gate", "mystery", "quest", "boss", "reward"]),
  activityId: optionalFromNull(z.string().min(1)),
  label: z.string().min(1),
  shortLabel: optionalFromNull(z.string().min(1)),
  icon: optionalFromNull(z.string().min(1)),
  thumbnailUrl: optionalFromNull(z.string().min(1)),
  slot: optionalFromNull(adventureBoardSlotSchema),
  position: optionalFromNull(z.object({ x: z.number(), y: z.number() }).strict()),
  layout: optionalFromNull(adventureBoardNodeLayoutSchema),
  state: z.enum(["current", "available", "completed", "locked", "preview", "hidden"]),
  evidenceRole: optionalFromNull(z.enum(["baseline", "preference", "support", "transfer", "mastery"])),
  target: adventureBoardTargetSchema,
  wordRadarConfig: optionalFromNull(z.record(z.string(), z.unknown())),
  lock: optionalFromNull(z.object({
    reason: z.string().min(1),
    label: z.string().min(1),
    progressLabel: optionalFromNull(z.string().min(1)),
  }).strict()),
  choiceSetId: optionalFromNull(z.string().min(1)),
  action: optionalFromNull(z.object({
    type: z.enum(["launch-activity", "open-choice-set", "show-locked-reason"]),
    payloadId: z.string().min(1),
  }).strict()),
}).strict();

const adventureBoardEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  state: z.enum(["completed", "available", "locked", "preview"]),
  style: z.enum(["solid", "dashed", "glow"]).optional(),
}).strict();

const adventureBoardChoiceOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: optionalFromNull(z.string()),
  icon: optionalFromNull(z.string().min(1)),
  thumbnailUrl: optionalFromNull(z.string().min(1)),
  state: z.enum(["available", "locked", "completed"]),
  nodeId: optionalFromNull(z.string().min(1)),
  tags: optionalFromNull(z.array(z.string().min(1))),
  choiceSignal: optionalFromNull(z.object({
    algorithmFeed: z.literal("choicePolicy"),
    traits: z.array(z.string().min(1)).min(1),
    expectedEvidence: z.string().min(1),
    preferenceNotMastery: z.literal(true),
  }).strict()),
  lock: optionalFromNull(z.object({
    reason: z.string().min(1),
    label: z.string().min(1),
  }).strict()),
}).strict();

const adventureBoardChoiceSetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["baseline-route", "mystery", "quest-wrapper", "boss-wrapper"]),
  title: z.string().min(1),
  options: z.array(adventureBoardChoiceOptionSchema).min(1),
}).strict();

const adventureBoardJsonSchema = z.object({
  schemaVersion: z.literal(1),
  boardId: z.string().min(1),
  planId: z.string().min(1),
  childId: z.string().min(1),
  domain: z.enum(["spelling", "reading", "math", "science", "generic"]),
  title: optionalFromNull(z.string()),
  theme: adventureBoardThemeSchema,
  layout: optionalFromNull(adventureBoardLayoutSchema),
  plannerRationale: optionalFromNull(z.object({
    agencyDesign: z.string().min(1),
    evidenceDesign: z.string().min(1),
    layoutChoice: z.string().min(1),
  }).strict()),
  nodes: z.array(adventureBoardNodeSchema).min(1),
  edges: z.array(adventureBoardEdgeSchema),
  choiceSets: optionalFromNull(z.array(adventureBoardChoiceSetSchema)),
  companion: optionalFromNull(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }).strict()),
  progress: optionalFromNull(z.object({
    currentNodeId: optionalFromNull(z.string().min(1)),
    completedNodeIds: z.array(z.string().min(1)),
    activeChoiceSetId: optionalFromNull(z.string().min(1)),
  }).strict()),
}).strict().transform((board) => board as AdventureBoardJson);

const compactActiveSessionPlanSchema = z.object({
  planId: z.string().min(1).optional(),
  nodePlan: z.array(compactNodePlanSchema).min(1),
  adventureBoard: adventureBoardJsonSchema.optional(),
  evidenceUsed: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
  })).optional(),
  openQuestions: z.array(z.string()).optional(),
  plannerConfidence: z.number().optional(),
});

export const assignmentPlannerDraftSchema = z.object({
  capturedContent: z.object({
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
  }),
  homeworkWords: z.array(z.object({
    text: z.string().min(1),
    sourceGroupId: z.string().min(1),
    purpose: homeworkPurposeSchema,
  })).min(1),
  activeSessionPlan: compactActiveSessionPlanSchema,
  plannedMeasurements: z.array(plannedMeasurementSchema),
  planTheory: planTheorySchema,
  reviewQuestions: z.array(z.string().min(1)),
  generatedExperienceBriefs: z.array(z.object({
    kind: z.enum(["quest", "boss", "visual-explainer"]),
    title: z.string().min(1),
    learningGoal: z.string().min(1),
    targetWords: z.array(z.string().min(1)),
    evidenceUsed: z.array(z.string().min(1)),
  })).optional(),
});

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

function activityCatalog(childId = "demo_adaptive"): AssignmentActivityCard[] {
  const allowed = realChildAllowedActivityIds(childId);
  return listActivityToolContracts()
    .map((contract) => ({
      activityId: contract.id,
      nodeType: contract.nodeType,
      label: contract.label,
      sentToPlanner: true as const,
      launchable: Boolean(
        NODE_TYPES.has(contract.id as NodeType) &&
        (!allowed || allowed.has(contract.id) || PLANNER_DESTINATION_ACTIVITY_IDS.has(contract.id)),
      ),
      domains: [...contract.domains],
      purposes: [...contract.purposes],
      skillTargets: [...contract.traits.skillTargets],
      evidenceType: contract.traits.evidenceType,
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
      strengths: [...contract.strengths],
      weakFor: [...contract.weakFor],
      goodFitWhen: [...contract.goodFitWhen],
      badFitWhen: [...contract.badFitWhen],
      capabilityModes: contract.capabilityModes.map((mode) => ({
        ...mode,
        skillTargets: [...mode.skillTargets],
        inputModes: [...mode.inputModes],
        scaffolds: [...mode.scaffolds],
        config: { ...mode.config },
        measurementRisks: [...mode.measurementRisks],
      })),
      status: (
        NODE_TYPES.has(contract.id as NodeType) &&
        contract.configSource !== "unspecified" &&
        (contract.capabilityModes.length > 0 || contract.configSource === "registry-default" || contract.configSource === "reward-game")
      ) ? "ok" : "unavailable",
    }));
}

function summarizeCarePlan(chart: ChildChart): string | null {
  const current = chart.carePlan?.current as { signal?: unknown; summary?: unknown } | null | undefined;
  if (!current) return null;
  return String(current.signal ?? current.summary ?? "Care plan present.");
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
  };
}

function buildBoardPlanningContext(args: {
  extraction: AssignmentSourceExtraction;
  childChart: AssignmentPlanningChildChartSummary;
}): AssignmentBoardPlanningContext {
  return {
    childChart: args.childChart,
    assignment: {
      filename: args.extraction.filename,
      sourceKind: args.extraction.sourceKind,
      extractionMethod: args.extraction.extractionMethod,
      warnings: [...args.extraction.warnings],
      fullText: args.extraction.fullText,
    },
    recentEvidence: [...args.childChart.recentEvidence],
    algorithmContracts: {
      choicePolicy: {
        id: "choicePolicy",
        purpose: "Rank valid child-facing choices by preference evidence, uncertainty, replay, completion, frustration, and outcomes.",
        needs: ["options_shown", "option_chosen", "skips", "replays", "completion", "frustration", "outcome"],
        outputs: ["shown_chosen_skipped_outcome", "preference_signal", "uncertainty_signal"],
        guardrails: ["preference_is_not_mastery", "shown_but_not_chosen_is_weak_neutral"],
      },
      spacedRepetition: {
        id: "spacedRepetition",
        purpose: "Keep weak or due targets supported while mastered targets receive lighter spaced checks.",
        needs: ["target_accuracy", "latency", "retries", "help", "last_seen", "due_state"],
        outputs: ["target_dosage", "support_level", "review_timing"],
        guardrails: ["preference_is_not_mastery", "do_not_expand_mastered_targets_over_weak_targets"],
      },
      questReadiness: {
        id: "questReadiness",
        purpose: "Require baseline evidence plus a named theory before generated transfer content unlocks.",
        needs: ["baseline_evidence", "target_theory", "contradictions", "support_revise_falsify_criteria"],
        outputs: ["quest_locked_or_ready", "transfer_theory"],
        guardrails: ["quest_is_not_random_loot", "missing_baseline_keeps_quest_locked"],
      },
      masteryGate: {
        id: "masteryGate",
        purpose: "Require quest or transfer evidence before boss/mastery finale unlocks.",
        needs: ["quest_evidence", "transfer_result", "per_target_results", "contradictions"],
        outputs: ["boss_locked_or_ready", "mastery_claim_evidence"],
        guardrails: ["boss_requires_quest_evidence", "in_app_success_is_not_final_transfer_proof"],
      },
    },
    choicePolicyContext: {
      purpose: "Choice points collect preference and engagement evidence that can improve future wrappers without claiming academic mastery.",
      evidenceSignals: [
        "shown_options",
        "chosen_option",
        "replayed_path",
        "completed_path",
        "skipped_path",
        "frustration_or_recovery",
        "learning_outcome_after_choice",
      ],
      signalQualityNotes: [
        "A small set of clear choices usually produces cleaner evidence than many noisy options.",
        "Extra choices can be useful when uncertainty is high or Sunny needs preference data.",
        "Shown-but-not-chosen is weak neutral evidence; explicit dislike or abandonment is stronger negative evidence.",
      ],
      plannerDecision: "The planner decides how many route, Mystery, Quest, or Boss choices are worth the child's attention from chart evidence, stamina, motivation, and uncertainty.",
    },
    boardTemplate: {
      preset: "horizontal-adventure-spine",
      visualSkin: "grok-full-experience",
      companionSlot: "right",
      routeChoiceBehavior: "exclusive",
      routeChoicePlacement: "after-required-baseline",
      requiredBaselineCountBeforeRouteChoice: 2,
      capabilities: {
        supportsChoiceGates: true,
        supportsModalChoiceSets: true,
        supportsQuestBossLocks: true,
        supportsCompanionSlot: true,
      },
      slots: {
        "1": "start",
        "2": "baseline",
        "3": "baseline",
        "4": "choice-gate",
        "5a.1": "upper-route",
        "5a.2": "upper-route",
        "5b.1": "lower-route",
        "5b.2": "lower-route",
        "5c.1": "middle-route",
        "5c.2": "middle-route",
        "6": "mystery",
        "7": "quest",
        "8": "boss",
      },
      art: {
        backgroundUrl: "/generated/adventure-board-demo/silent-letter-world.jpeg",
        nodeThumbnails: {
          start: "/thumbnails/activities/word-radar.svg",
          "word-radar": "/generated/adventure-board-demo/word-radar.jpeg",
          "spell-check": "/generated/adventure-board-demo/spell-check.jpeg",
          pronunciation: "/generated/adventure-board-demo/pronunciation.jpeg",
          mystery: "/generated/adventure-board-demo/mystery.jpeg",
          "choice-gate": "/thumbnails/mystery-fallback.svg",
          quest: "/generated/adventure-board-demo/quest.jpeg",
          boss: "/generated/adventure-board-demo/boss.jpeg",
        },
        choiceThumbnails: {
          story: "/thumbnails/activities/karaoke.svg",
          speed: "/thumbnails/activities/speed-catcher.svg",
          "word-radar": "/generated/adventure-board-demo/word-radar.jpeg",
          "spell-check": "/generated/adventure-board-demo/spell-check.jpeg",
          pronunciation: "/generated/adventure-board-demo/pronunciation.jpeg",
          "monster-stampede": "/thumbnails/activities/monster-stampede.svg",
          "wheel-of-fortune": "/thumbnails/activities/wheel-of-fortune.svg",
        },
      },
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
      displayRules: {
        requireImageBackground: true,
        requireCompanion: true,
        requireNodeThumbnails: true,
        requireShortLabels: true,
        requireLayoutRoles: true,
        maxDisplayLabelLength: 18,
      },
    },
    runtimeConstraints: {
      rendererOnly: true,
      noRuntimePlanning: true,
      outputMustBeSerializableJson: true,
    },
    criticPolicy: {
      semanticAudit: "always",
      visualCritic: "risk_gated",
      riskSignals: [
        "planner_confidence_low",
        "semantic_audit_failed",
        "complex_choice_graph",
        "forced_by_cli",
      ],
      retryLimit: 1,
    },
  };
}

export function buildAssignmentPlanningPacket(args: {
  childId: string;
  extraction: AssignmentSourceExtraction;
  childChart: ChildChart;
  currentEvidenceSummary?: string[];
}): AssignmentPlanningPacket {
  const recentEvidence = args.currentEvidenceSummary ?? [];
  const childChart = childChartSummaryForPacket(args.childChart, recentEvidence);
  const catalog = activityCatalog(args.childId);
  return {
    packetVersion: 1,
    childId: args.childId,
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
    childChart,
    activityCatalog: catalog,
    boardPlanning: buildBoardPlanningContext({
      extraction: args.extraction,
      childChart,
    }),
    plannerInstruction: [
      "Interpret the assignment from the source text and source groups.",
      "Activities are instruments. Choose nodes by target purpose, not by generic fun.",
      "Each word group must declare its learning purpose from source evidence.",
      "Do not collapse teacher-labeled groups into one skill; infer whether each group asks for spelling production, recognition, fluency, pronunciation, meaning, or review.",
      "Use recent canonical activity evidence as lesson-to-lesson labs: weak targets get support; mastered targets get smaller spaced checks or transfer instead of full repeated baseline.",
      "When exact weak targets are named, give those weak targets strictly more academic support than mastered targets; light reinforcement must be smaller than support.",
      "When evidence conflicts, the first academic node should probe those exact contradictory targets; give them more academic placements than clean/mastered targets, and do not create a same-activity run just to replay clean words.",
      "Count target placements before returning and count consecutive activity runs; if clean/mastered targets outnumber weak or contradictory targets in academic nodes, or any same-activity run exceeds two nodes, revise the nodePlan.",
      "High-frequency groups whose purpose is recognize or read_fluently should usually be measured by visible_read or pronunciation, not spelling production, unless source or evidence explicitly says spelling is the gap.",
      "If a child needs shorter cohorts, shorten target lists and vary instruments by purpose instead of repeating many same-activity nodes or a long run of Word Radar.",
      "Each activity must be chosen because its measured skills fit that declared purpose.",
      "Return a board plan that cites why every activity fits the target purpose.",
      "Use adventureMapProfile as delivery preference and layout intent, not as today's board JSON.",
      "Use this packet as the single planner object: childChart, sourceDocument, activityCatalog, boardPlanning, runtimeConstraints, and criticPolicy.",
      "Decide agency and route density from chart evidence, stamina, motivation, and evidence needs.",
      "Explain why each visible route or modal choice is worth the child's attention today.",
    ].join(" "),
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
  const nodeTypes = new Set(output.activeSessionPlan.nodePlan.map((node) => node.type));
  if (!nodeTypes.has("mystery")) {
    issues.push({
      code: "missing_mystery_choice",
      severity: "error",
      message: "Planner output must include one Mystery/Bandit choice node after evidence-generating work.",
    });
  }
  if (!nodeTypes.has("quest")) {
    issues.push({
      code: "missing_quest_destination",
      severity: "error",
      message: "Planner output must include a locked Quest destination for generated transfer after baseline evidence.",
    });
  }
  if (!nodeTypes.has("boss")) {
    issues.push({
      code: "missing_boss_destination",
      severity: "error",
      message: "Planner output must include a locked Boss destination after Quest evidence.",
    });
  }
  const sourceGroupsByTargets = groups.map((group) => ({
    group,
    targetKeys: new Set(group.words.map((word) => word.trim().toLowerCase()).filter(Boolean)),
  }));
  for (const node of output.activeSessionPlan.nodePlan) {
    if (!activityIds.has(node.activityId)) {
      issues.push({
        code: "unknown_activity_id",
        severity: "error",
        message: `Node ${node.id} references unknown activity ${node.activityId}.`,
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
    const matchingGroup = sourceGroupsByTargets.find(({ targetKeys }) =>
      nodeTargetKeys.size > 0 &&
      [...nodeTargetKeys].every((target) => targetKeys.has(target)),
    )?.group;
    if (matchingGroup && node.targetLane !== matchingGroup.id) {
      issues.push({
        code: "target_lane_mismatch",
        severity: "error",
        message: `Node ${node.id} targetLane must be exact source group id ${matchingGroup.id}.`,
      });
    }
    if (node.type === "word-radar" && !node.wordRadarConfig) {
      issues.push({
        code: "missing_word_radar_config",
        severity: "error",
        message: `Word Radar node ${node.id} must include planner-authored wordRadarConfig.`,
      });
    }
  }

  if (output.activeSessionPlan.adventureBoard) {
    const planNodeIds = new Set(output.activeSessionPlan.nodePlan.map((node) => node.id));
    for (const boardNode of output.activeSessionPlan.adventureBoard.nodes) {
      if (
        ["activity", "mystery", "quest", "boss"].includes(boardNode.kind) &&
        !planNodeIds.has(boardNode.id) &&
        !planNodeIds.has(boardNode.action?.payloadId ?? "")
      ) {
        issues.push({
          code: "board_learning_node_missing_node_plan_reference",
          severity: "error",
          message: `Board learning node ${boardNode.id} must use a nodePlan id or action.payloadId reference.`,
        });
      }
    }
    const boardIssues = validateAdventureBoardJson(output.activeSessionPlan.adventureBoard, activityIds);
    for (const issue of boardIssues) {
      const code = issue.code === "missing_edge_endpoint"
        ? "board_missing_edge_endpoint"
        : issue.code === "choice_option_missing_node"
          ? "board_choice_option_missing_node"
          : issue.code === "choice_gate_missing_choice_set"
            ? "board_choice_gate_missing_choice_set"
            : issue.code === "choice_gate_missing_incoming_edge"
              ? "board_fake_agency"
              : issue.code === "choice_gate_missing_outgoing_edge"
                ? "board_choice_gate_missing_outgoing_edge"
                : issue.code === "baseline_choice_route_missing"
                  ? "board_baseline_choice_route_missing"
                  : issue.code === "baseline_choice_route_too_few_options"
                    ? "board_baseline_choice_route_too_few_options"
                : issue.code === "baseline_choice_missing_node"
                  ? "board_baseline_choice_missing_node"
                  : issue.code === "unknown_board_activity_id"
                    ? "board_unknown_activity_id"
                    : issue.code === "preference_claims_mastery"
                      ? "board_preference_claims_mastery"
                      : issue.code === "choice_signal_missing"
                        ? "board_choice_signal_missing"
                        : issue.code === "choice_signal_claims_mastery"
                          ? "board_choice_signal_claims_mastery"
                      : issue.code;
      issues.push({
        code,
        severity: issue.severity,
        message: issue.message,
      });
    }
  }

  return issues;
}

export function summarizeAssignmentPlanForReview(output: AssignmentPlannerOutput): string {
  const lines: string[] = [];
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
  lines.push(`- ${output.planTheory.hypothesis}`);
  for (const question of output.reviewQuestions) {
    lines.push(`- ${question}`);
  }
  return lines.join("\n");
}

export function resolveAssignmentPlannerModel(
  opts: AssignmentPlanningOptions = {},
  env: Partial<Pick<NodeJS.ProcessEnv, "SUNNY_EXPERIENCE_PLANNER_MODEL">> = process.env,
): string {
  return opts.model ?? env.SUNNY_EXPERIENCE_PLANNER_MODEL ?? "claude-sonnet-4-5";
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
  return `${ASSIGNMENT_PLANNER_PERSONA}

Create Sunny's homework interpretation and active board plan from this source-of-truth packet.

Call ${ASSIGNMENT_PLANNER_TOOL_NAME} exactly once. Do not answer with free-text JSON.

Rules:
- If source page images are provided, use the worksheet image/layout as the primary source of truth and OCR text only as support.
- Do not flatten source word groups.
- Infer each source group's target purpose from the assignment evidence.
- Do not assume every group on a spelling handout has the same success target; teacher headings can distinguish spelling production from reading fluency, recognition, vocabulary, or review.
- Use recent canonical activity evidence as lesson-to-lesson labs: misses/second attempts/help/skips increase support and dosage for those exact targets; fast first-try correct evidence reduces dosage and moves the target toward spaced checks or transfer.
- Mastery evidence should shrink redundant baseline work. Do not repeat a full scaffolded baseline for targets that were all correct first try with low latency and no support; use a small spaced reinforcement check, Mystery for preference data, and locked Quest for transfer readiness.
- Light spaced reinforcement means fewer mastered targets and fewer academic placements than the weak/fragile targets. If a prior lesson names exact missed targets, those weak targets should receive strictly more academic measurement/support than the mastered targets, unless your planTheory explicitly argues otherwise.
- When evidence conflicts, the first academic node should probe those exact contradictory targets; give them more academic placements than clean/mastered targets, and do not create a same-activity run just to replay clean words.
- Count target placements before returning and count consecutive activity runs; if clean/mastered targets outnumber weak or contradictory targets in academic nodes, or any same-activity run exceeds two nodes, revise the nodePlan.
- Match each source group to activities whose cataloged skills can actually measure that purpose.
- For source groups whose purpose is recognize, read_fluently, or pronounce, prefer pronunciation or visible_read-style recognition evidence. Do not turn high-frequency recognition words into spelling-production work unless the source explicitly says those words are spelling targets or prior evidence shows spelling production is the gap.
- For any node targeting one source word group, targetLane must exactly equal that source wordGroups[].id. Do not invent expanded lane names.
- Do not use an activity just because it is fun or nearby; use the activity catalog as the instrument list.
- Choose nodePlan directly. Do not merely explain a prebuilt board.
- Treat childChart.adventureMapProfile as delivery preference and layout intent. It is not today's board.
- Use packet.activityCatalog as the instrument list. Unavailable activities are visible for context but must not appear as launchable academic board nodes.
- Use packet.boardPlanning as the board contract. It contains childChart, assignment, recentEvidence, algorithmContracts, choicePolicyContext, boardTemplate, runtimeConstraints, and criticPolicy.
- Board template v1 expects a route choice after required baseline evidence, not at session start: complete at least boardTemplate.requiredBaselineCountBeforeRouteChoice baseline evidence node(s), then show a route gate only when the choices are worth the child's attention today.
- Use algorithmContracts.choicePolicy and choicePolicyContext for route/Mystery/Quest/Boss wrapper choice evidence; preference evidence, not mastery, is what these choices produce.
- The planner decides how many route, Mystery, Quest, or Boss choices to show from chart evidence, stamina, motivation, and uncertainty. Fewer clear choices usually produce cleaner signals; extra choices can be useful when Sunny needs more preference data.
- Use algorithmContracts.spacedRepetition for target dosage and support.
- Use algorithmContracts.questReadiness for locked Quest readiness.
- Use algorithmContracts.masteryGate for locked Boss readiness.
- Decide how much agency/route choice to show from chart evidence, stamina, motivation, and evidence needs.
- Explain why each visible route or modal choice is worth the child's attention today.
- Return activeSessionPlan.adventureBoard as the child-facing map. nodePlan is the lab/intervention list; adventureBoard is the board experience.
- adventureBoard may include board-only presentation nodes such as Start and Choose Path, but learning nodes must reference the nodePlan ids they represent and must not add hidden academic interventions.
- For layout.preset "horizontal-adventure-spine", use packet.boardPlanning.boardTemplate as the board-writing tool contract, not as a loose suggestion. This preset means the approved Grok full-experience pattern: image background, selected companion on the right, visible route paths, node thumbnails, short labels, explicit layout roles, baseline route choices, modal Mystery/Quest/Boss choices, and locked Quest/Boss destinations.
- Use boardTemplate.slots for every visible horizontal board node. You choose slot names such as "1", "2", "3", "4", "5a.1", "5b.1", "5c.1", "6", "7", and "8"; do not invent raw coordinates.
- Use packet.boardPlanning.boardTemplate.art URLs exactly for backgroundUrl, node thumbnailUrl, and choice thumbnailUrl when they fit the activity/kind. Do not invent gradients or omit art. If a needed art key is missing, use the closest approved fallback art from that object and explain it in plannerRationale.layoutChoice.
- Use packet.boardPlanning.boardTemplate.palette exactly for adventureBoard.theme.palette. Do not invent darker text or path colors.
- Include adventureBoard.companion from childChart.selectedCompanionId and childChart.selectedCompanionName when companionSlot is not "none".
- Every visible adventureBoard node must include thumbnailUrl, layout.role, and a child-facing display label of ${packet.boardPlanning.boardTemplate.displayRules.maxDisplayLabelLength} characters or fewer. If the semantic label is longer, put the short child-facing text in shortLabel.
- Every baseline-route and Mystery option must include icon or thumbnailUrl; prefer thumbnailUrl from boardTemplate.art.choiceThumbnails.
- Every adventureBoard activity/mystery/quest/boss node must either use the exact nodePlan[].id it represents or set action.payloadId to that nodePlan id. Prefer exact ids. Do not invent presentation-only ids for learning nodes.
- adventureBoard choiceSets are where Mystery, Quest, and Boss modal options live. Do not rely on nodePlan alone to express child agency.
- Every baseline-route choice option must include nodeId pointing to the board node it opens.
- Every child-facing route, Mystery, Quest wrapper, and Boss wrapper option must include choiceSignal with algorithmFeed "choicePolicy", traits, expectedEvidence, and preferenceNotMastery true.
- If you include a route gate, it must come after at least one baseline evidence activity. The approved pattern is Start -> required baseline evidence -> route gate -> available child-facing alternatives -> Mystery -> locked Quest -> locked Boss. Do not put Choose Path immediately after Start.
- Start must connect to the first baseline activity, never directly to a route gate.
- The choice gate's incoming edge must come from the last required baseline activity, and that baseline board node must have kind "activity", evidenceRole "baseline", and layout.role "baseline".
- Edges must flow from the prior required baseline node into the gate, then from the gate to the available child-facing alternatives. Explain those alternatives in plannerRationale.agencyDesign and keep each branch tied to a valid nodePlan learning purpose or reward/preference evidence purpose.
- For evidence-route nodes, layout.order must start at 1 inside each lane and be contiguous. If a lane has one route node, use order 1, not order 2 or 3. This keeps route choices visible instead of clustered near Mystery/Quest.
- Good horizontal spine skeleton:
  Start node layout.role=start order=1.
  First required baseline node layout.role=baseline lane=main order=1.
  Second required baseline/check node layout.role=baseline lane=main order=2.
  Choice gate layout.role=choice-gate order=1 and incoming edge from the second required baseline/check node.
  Optional route nodes layout.role=evidence-route with lane upper/main/lower and order values starting at 1 in each lane.
  Mystery node layout.role=mystery order=1 with incoming edges from each route option or directly from the gate if that is a valid option.
  Quest node layout.role=quest order=1 and locked/preparing.
  Boss node layout.role=boss order=1 and locked/preparing.
- Bad horizontal spine skeleton: Start -> Choose Path -> baseline routes. Reject that pattern yourself before returning JSON.
- If one node mixes targets from multiple source groups, omit targetLane or split the node. Never claim targetLane "silent_letters" for a node containing high-frequency targets.
- Every word-radar node must include wordRadarConfig from the activity catalog capability modes. For spelling construction that is new/weak/fragile, use partial_visual_recall with letter-by-letter input, no timer, hidden during response, and captured response required. Use audio_cued_letter_recall when the child should fill slots from hearing the word instead of seeing the flash. Use hidden_word_recall only when prior evidence supports harder recall. Use visible_read for recognition/fluency/accessibility evidence, especially when the source purpose is recognize or read_fluently. Omit wordRadarConfig on non-word-radar nodes.
- If a child needs shorter cohorts, shorten the target list and vary instruments by purpose rather than creating many same-activity nodes. Do not split one lane into a long run of consecutive Word Radar nodes; more Word Radar nodes are not better evidence when one better-chosen Word Radar node plus another instrument would answer the care-plan question.
- Include the adventure spine in activeSessionPlan.nodePlan: baseline measurement nodes first, then exactly one mystery node for child choice/bandit preference evidence after evidence-generating work, then a locked quest destination for generated transfer, then a locked boss destination for the mastery finale after quest evidence.
- Mystery is choice/preference evidence, not mastery. Use type/activityId "mystery", choiceMode "choice_lab", locked false, and targets from the relevant active homework targets.
- Quest and Boss are destinations, not playable baseline nodes. Use type/activityId "quest" and "boss", locked true, masteryUnlockState "preparing"; Quest should target one exact source group if the theory is about one group, otherwise omit targetLane. Boss may have empty targets until quest evidence exists. Never invent targetLane values such as "all_homework", "mixed", or "combined".
- Include parent-review language that explains why every group was routed to its activity.
- Return one valid JSON object directly. Do not include markdown fences.
- JSON shape:
  {
    "capturedContent": {
      "title": string,
      "type": "spelling_test" | "reading" | "math" | "coins" | "clocks" | "generic",
      "rawText": string,
      "words": string[],
      "questions": unknown[],
      "wordGroups": [{"id": string, "label": string, "purpose": "spell_from_memory" | "recognize" | "read_fluently" | "pronounce" | "define" | "unknown", "words": string[], "confidence": number, "evidence": string[]}],
      "contentProfile": {"practiceDomain": "spelling" | "reading" | "math" | "writing" | "generic", "contentDomain": "science" | "social_studies" | "language_arts" | "math" | "generic", "topic": string, "primarySkill": string, "assignmentFormat": string, "concepts": string[], "sourceEvidence": string[]},
      "sourceDocuments": [{"filename": string, "mediaType": string}]
    },
    "homeworkWords": [{"text": string, "sourceGroupId": string, "purpose": "spell_from_memory" | "recognize" | "read_fluently" | "pronounce" | "define" | "unknown"}],
    "activeSessionPlan": {
      "nodePlan": [{"id": string, "type": string, "activityId": string, "targets": string[], "difficulty": 1 | 2 | 3, "targetLane": string, "choiceMode": "choice_lab | surprise_drop only for mystery", "locked": boolean, "masteryUnlockState": "preparing for locked quest/boss", "wordRadarConfig": "only for word-radar nodes: {\"recallMode\": \"visible_read\" | \"partial_visual_recall\" | \"hidden_word_recall\", \"inputMode\": \"whole-word\" | \"letter-by-letter\" | \"keyboard\", \"speakStyle\": \"option-a\" | \"option-b\", \"showTimer\": boolean, \"timerSeconds\": number, \"hideWordDuringResponse\": boolean, \"requiresCapturedResponse\": boolean}"}],
      "adventureBoard": {
        "schemaVersion": 1,
        "boardId": string,
        "planId": string,
        "childId": string,
        "domain": "spelling" | "reading" | "math" | "science" | "generic",
        "layout": {"preset": "horizontal-adventure-spine", "companionSlot": "right" | "left" | "none", "routeChoiceBehavior": "exclusive" | "parallel"},
        "plannerRationale": {"agencyDesign": string, "evidenceDesign": string, "layoutChoice": string},
        "theme": {"background": {"type": "image", "value": "use boardTemplate.art.backgroundUrl"}, "palette": {"path": string, "completed": string, "available": string, "locked": string, "current": string, "preview": string, "text": string, "panel": string}},
        "companion": {"id": "selected companion id", "name": "selected companion name"},
        "nodes": [{"id": string, "kind": "start" | "activity" | "choice-gate" | "mystery" | "quest" | "boss" | "reward", "activityId": string, "label": string, "shortLabel": string, "thumbnailUrl": string, "slot": "1" | "2" | "3" | "4" | "5a.1" | "5a.2" | "5b.1" | "5b.2" | "5c.1" | "5c.2" | "6" | "7" | "8", "layout": {"role": "start" | "baseline" | "choice-gate" | "evidence-route" | "mystery" | "quest" | "boss", "lane": "main" | "upper" | "middle" | "lower", "order": number, "routeGroupId": string}, "state": "current" | "available" | "completed" | "locked" | "preview" | "hidden", "choiceSetId": string, "target": {"laneId": string, "skill": string, "words": string[]}}],
        "edges": [{"id": string, "from": string, "to": string, "state": "completed" | "available" | "locked" | "preview", "style": "solid" | "dashed" | "glow"}],
        "choiceSets": [{"id": string, "kind": "baseline-route" | "mystery" | "quest-wrapper" | "boss-wrapper", "title": string, "options": [{"id": string, "label": string, "description": string, "icon": string, "thumbnailUrl": string, "state": "available" | "locked" | "completed", "nodeId": string, "choiceSignal": {"algorithmFeed": "choicePolicy", "traits": string[], "expectedEvidence": string, "preferenceNotMastery": true}}]}]
      }
    },
    "plannedMeasurements": [{"id": string, "activityId": string, "target": string, "evidenceType": string, "supportCriteria": string, "reviseCriteria": string, "falsifyCriteria": string}],
    "planTheory": {"hypothesis": string, "evidenceSummary": string[], "intervention": string, "supportCriteria": string[], "reviseCriteria": string[], "falsifyCriteria": string[]},
    "reviewQuestions": string[]
  }

Packet:
${JSON.stringify(packet, null, 2)}`;
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

function schemaItems(schema: JsonSchemaObject | undefined): JsonSchemaObject | undefined {
  return jsonObject(schema?.items);
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

function enforceAdventureBoardToolContract(schema: JsonSchemaObject): JsonSchemaObject {
  const activeSessionPlan = schemaProperties(schema).activeSessionPlan;
  setSchemaRequired(activeSessionPlan, ["nodePlan", "adventureBoard"]);

  const adventureBoard = schemaProperties(activeSessionPlan).adventureBoard;
  const boardProperties = schemaProperties(adventureBoard);
  const nodeSchema = schemaItems(boardProperties.nodes);
  const nodeProperties = schemaProperties(nodeSchema);
  removeSchemaProperty(nodeSchema, "position");
  setSchemaRequired(nodeSchema, ["id", "kind", "label", "thumbnailUrl", "slot", "layout", "state"]);
  setSchemaRequired(nodeProperties.layout, ["role", "lane", "order"]);

  const choiceSetSchema = schemaItems(boardProperties.choiceSets);
  const choiceSetProperties = schemaProperties(choiceSetSchema);
  setSchemaRequired(choiceSetSchema, ["id", "kind", "title", "options"]);

  const choiceOptionSchema = schemaItems(choiceSetProperties.options);
  removeSchemaProperty(choiceOptionSchema, "choiceId");
  setSchemaRequired(choiceOptionSchema, ["id", "label", "description", "thumbnailUrl", "state", "choiceSignal"]);

  setSchemaRequired(boardProperties.progress, ["completedNodeIds"]);

  return schema;
}

export function assignmentPlannerToolJsonSchema(): Record<string, unknown> {
  return enforceAdventureBoardToolContract(
    z.toJSONSchema(assignmentPlannerDraftSchema, { io: "input" }) as JsonSchemaObject,
  );
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
  return assignmentPlannerDraftSchema.parse(toolUse.input);
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
  return assignmentPlannerDraftSchema.parse(parsed);
}

function summarizePlannerParseError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 30)
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("\n");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

async function parseOrRepairAssignmentPlannerJson(
  value: string,
  model: string,
): Promise<AssignmentPlannerResponseObject> {
  try {
    return parseAssignmentPlannerJson(value);
  } catch (error) {
    const { text } = await generateText({
      model: anthropic(model),
      system: [
        "Repair Sunny assignment planner JSON so it matches the required schema.",
        "Return only one valid JSON object.",
        "Do not add, remove, or reinterpret educational decisions.",
        "Do not put presentation-only nodes in activeSessionPlan.nodePlan.",
        "Board-only nodes such as Start and Choose Path belong only in activeSessionPlan.adventureBoard.nodes.",
        "activeSessionPlan.nodePlan contains only real interventions with activityId and targets.",
      ].join(" "),
      maxOutputTokens: 12_000,
      prompt: [
        "Parse/schema error:",
        summarizePlannerParseError(error),
        "JSON to repair:",
        firstJsonObject(value),
      ].join("\n\n"),
    });
    return parseAssignmentPlannerJson(text);
  }
}

async function callAssignmentPlannerModel(
  packet: AssignmentPlanningPacket,
  model: string,
): Promise<{ draft: AssignmentPlannerResponseObject; usage?: LanguageModelUsage }> {
  const prompt = buildAssignmentPlannerPrompt(packet);
  const images = assignmentPlannerSourceImages(packet);
  return callAssignmentPlannerTool({ prompt, model, images });
}

async function callAssignmentPlannerTool(args: {
  prompt: string;
  model: string;
  images?: ReturnType<typeof assignmentPlannerSourceImages>;
}): Promise<{ draft: AssignmentPlannerResponseObject; usage?: LanguageModelUsage }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: args.model,
    max_tokens: 12_000,
    system: ASSIGNMENT_PLANNER_PERSONA,
    tools: [{
      name: ASSIGNMENT_PLANNER_TOOL_NAME,
      description: "Write Sunny's captured homework interpretation, active intervention node plan, and child-facing adventure board JSON.",
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
    usage: {
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
    },
  };
}

function hydrateAssignmentPlannerOutputFromDraft(
  draft: AssignmentPlannerResponseObject,
  packet: AssignmentPlanningPacket,
): AssignmentPlannerOutput {
  const capturedContent = buildCapturedHomeworkContent({
    title: draft.capturedContent.title,
    type: draft.capturedContent.type as HomeworkType,
    rawText: packet.sourceDocument.fullText,
    words: draft.capturedContent.words,
    wordGroups: draft.capturedContent.wordGroups,
    questions: draft.capturedContent.questions,
    sourceDocuments: draft.capturedContent.sourceDocuments,
    contentProfile: normalizeContentProfile({
      title: draft.capturedContent.title,
      type: draft.capturedContent.type as HomeworkType,
      words: draft.capturedContent.words,
      wordGroups: draft.capturedContent.wordGroups,
      questions: draft.capturedContent.questions,
      contentProfile: draft.capturedContent.contentProfile,
    }),
  });

  const generatedExperienceBriefs = hydrateGeneratedExperienceBriefs(draft.generatedExperienceBriefs, packet);
  const activeSessionPlan = hydrateActiveSessionPlanFromDraft({
    draft: draft.activeSessionPlan,
    packet,
    capturedContent,
    homeworkWords: draft.homeworkWords,
    planTheory: draft.planTheory,
    plannedMeasurements: draft.plannedMeasurements,
    generatedExperienceBriefs,
  });

  return {
    capturedContent,
    assignmentInterpretation: capturedContent.assignmentInterpretation!,
    homeworkWords: draft.homeworkWords,
    activeSessionPlan,
    plannedMeasurements: draft.plannedMeasurements,
    planTheory: draft.planTheory,
    reviewQuestions: draft.reviewQuestions,
    generatedExperienceBriefs,
  };
}

async function repairRejectedAssignmentPlannerDraft(args: {
  draft: AssignmentPlannerResponseObject;
  packet: AssignmentPlanningPacket;
  issues: AssignmentPlanValidationIssue[];
  model: string;
}): Promise<AssignmentPlannerResponseObject> {
  const { draft } = await callAssignmentPlannerTool({
    model: args.model,
    prompt: [
      "Your previous assignment planner JSON failed Sunny's contract validation.",
      `Call ${ASSIGNMENT_PLANNER_TOOL_NAME} with one corrected full object.`,
      "Keep the assignment interpretation and academic plan as stable as possible, but fix any field that caused validation failure.",
      "The renderer will not repair your board. The JSON must satisfy the boardTemplate contract directly.",
      "If a choice gate appears before baseline evidence, move it after the required baseline activities.",
      "Start must connect to the first baseline activity, never directly to a route gate.",
      "The choice gate's incoming edge must come from the last required baseline activity, not from Start.",
      "Baseline board nodes before the gate must have kind \"activity\", evidenceRole \"baseline\", and layout.role \"baseline\".",
      "Use boardTemplate.palette exactly for adventureBoard.theme.palette so paths and labels remain readable.",
      "Validation issues:",
      JSON.stringify(args.issues.map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
      })), null, 2),
      "Board template contract:",
      JSON.stringify(args.packet.boardPlanning.boardTemplate, null, 2),
      "Previous JSON:",
      JSON.stringify(args.draft, null, 2),
    ].join("\n\n"),
  });
  return draft;
}

async function planAssignmentFromSourceInternal(
  packet: AssignmentPlanningPacket,
  opts: AssignmentPlanningOptions = {},
): Promise<{ output: AssignmentPlannerOutput; telemetry: AssignmentPlannerTelemetry }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
  }
  const model = resolveAssignmentPlannerModel(opts);
  const started = Date.now();
  const { draft: initialDraft, usage } = await callAssignmentPlannerModel(packet, model);
  let draft = initialDraft;
  let output = hydrateAssignmentPlannerOutputFromDraft(draft, packet);
  let validationIssues = validateAssignmentPlannerOutput(output, {
    extraction: packet.sourceDocument,
    activityCatalog: packet.activityCatalog,
  });
  for (let repairCount = 0; repairCount < 2; repairCount += 1) {
    const blockingIssues = validationIssues.filter((issue) => issue.severity === "error");
    if (blockingIssues.length === 0) break;
    draft = await repairRejectedAssignmentPlannerDraft({
      draft,
      packet,
      issues: blockingIssues,
      model,
    });
    output = hydrateAssignmentPlannerOutputFromDraft(draft, packet);
    validationIssues = validateAssignmentPlannerOutput(output, {
      extraction: packet.sourceDocument,
      activityCatalog: packet.activityCatalog,
    });
  }

  return {
    output,
    telemetry: {
      model,
      usage,
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
  return {
    planId: args.draft.planId ?? `assignment-plan-${args.packet.childId}-${args.packet.sourceDocument.fileHash.slice(0, 8)}`,
    childId: args.packet.childId,
    createdAt: new Date().toISOString(),
    source: "ingest_human_loop",
    domain: args.capturedContent.contentProfile.practiceDomain,
    testDate: null,
    nodePlan: args.draft.nodePlan.map((node) => ({
      ...node,
      type: normalizeAssignmentNodeType(node.type, node.activityId),
      difficulty: node.difficulty ?? 1,
      source: "chart_planner" as const,
    })),
    adventureBoard: args.draft.adventureBoard,
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
