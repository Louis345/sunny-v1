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
import { ALL_NODE_TYPES, type NodeType } from "../shared/adventureTypes";
import type { RewardWrapperConfig } from "../shared/adventureTypes";
import type { ChildChart } from "../profiles/childChart";
import {
  listActivityToolContracts,
  type ActivityCapabilityMode,
  type ActivityPlannerVisibility,
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

export type { AssignmentSourceExtraction } from "./assignmentSourceExtraction";

export type AssignmentActivityCard = {
  activityId: string;
  label: string;
  domains: string[];
  skillTargets: string[];
  evidenceType: string;
  inputModes: string[];
  measures: string[];
  strengths: string[];
  weakFor: string[];
  goodFitWhen: string[];
  badFitWhen: string[];
  capabilityModes: ActivityCapabilityMode[];
  plannerVisibility?: ActivityPlannerVisibility;
};

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

export type AssignmentPlanningPacket = {
  packetVersion: 1;
  childId: string;
  sourceDocument: {
    filename: string;
    sourceKind: string;
    mediaType: string;
    fileHash: string;
    extractionMethod: string;
    warnings: string[];
    pages: Array<{ pageNumber: number; text: string; imagePath?: string }>;
    fullText: string;
  };
  childChart: {
    childId: string;
    displayName: string;
    grade?: number | string;
    selectedCompanionId?: string | null;
    selectedCompanionName?: string | null;
    activeHomeworkSummary?: string | null;
    carePlanSummary?: string | null;
    recentEvidence: string[];
  };
  activityCatalog: AssignmentActivityCard[];
  plannerReferences?: AssignmentPlannerReferenceDoc[];
  parentDialogue?: AssignmentPlannerDialogueTurn[];
  priorPlannerOutput?: AssignmentPlannerOutput;
  plannerInstruction: string;
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
    | "wrapper_activity_used_as_node"
    | "unknown_reward_wrapper_activity"
    | "reward_wrapper_activity_not_wrapper"
    | "unknown_reward_wrapper_mode"
    | "reward_wrapper_requires_domain_payload_node";
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
const ASSIGNMENT_PLANNER_EXCLUDED_ACTIVITY_IDS = new Set(["word-builder"]);
const INSTRUMENT_RENDERERS: Record<string, NodeType> = {
  "spelling-recall": "letter-rush",
};
export const ASSIGNMENT_PLANNER_PERSONA = [
  "You are Sunny's learning journey designer: part master tutor, part pediatric learning psychologist, part adaptive game director.",
  "You know the child through her chart and treat the homework as the reality anchor.",
  "You are planning a real tutoring session, not filling a board.",
  "You design each session like a thoughtful human tutor would: academically serious, emotionally aware, playful when it helps, and aimed to help the child master it by the due date.",
  "You have a strong sense of taste. A good session feels purposeful, varied, alive, and confidence-building.",
  "The board is not a worksheet; it is how the child experiences the care plan.",
  "Use the activity catalog the way a tutor uses a table full of materials: quick checks, teaching tools, practice games, recovery beats, and proof-of-mastery moments.",
  "Activities are instruments and experiences. You choose them because they reveal useful evidence, teach the right skill, and keep the child willing to keep going without making the child feel like this is a grind.",
  "The child experiences the activity, not your internal capability mode. If two academically different checks use the same game shell, choose a different material or explain why the repetition is the right tutor move.",
  "nodes exist to change the lived lesson, not to decorate the map.",
  "You notice boredom, avoidance, fatigue, pride, curiosity, and recovery as part of the learning picture.",
  "You are free to choose the path from the chart, assignment evidence, due date, and mastery goal.",
].join(" ");

export const ASSIGNMENT_PLANNER_REFERENCE_DOCS: AssignmentPlannerReferenceDoc[] = [
  {
    id: "activity-tool-protocol",
    title: "Activity Tool Protocol",
    path: "docs/activity-tool-protocol.md",
    configOwner: "src/engine/activityToolCatalog.ts",
    plannerUse:
      "Use this to assess whether a proposed class activity should enter Sunny as a cataloged activity instrument or remain a prototype.",
    appliesWhen: [
      "A new class activity, game wrapper, reward shell, or generated tool is proposed.",
      "The planner needs to decide if an activity has enough mechanic truth and evidence safety.",
      "A prototype needs to graduate from Storybook or lab mode into the adaptive path.",
    ],
    checklist: [
      "No orphan activities: every new activity needs an Activity Tool Contract before active-path use.",
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
      "Use this when deciding whether Spark Orb should wrap a domain-valid activity, stay as a reward bridge, or stay out of the plan.",
    appliesWhen: [
      "The planner considers Spark Orb, earned collectibles, orb charge, or reward wrappers.",
      "A child needs a motivating bridge after evidence-generating work.",
      "A domain payload could keep academic evidence while Spark Orb supplies engagement.",
    ],
    checklist: [
      "Spark Orb is optional and must never be forced.",
      "Capture and launch are engagement/reward evidence, not mastery.",
      "domain_payload_wrapper requires the embedded activity to own per-target learning evidence.",
      "Avoid Spark Orb for clean cold baseline or when a reward shell would contaminate the signal.",
    ],
  },
];

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

const rewardWrapperSchema: z.ZodType<RewardWrapperConfig> = z.object({
  activityId: z.string().min(1),
  mode: z.enum(["charge_bridge", "domain_payload_wrapper"]),
  reason: z.string().min(1),
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
  targetLane: z.string().optional(),
  choiceMode: z.enum(["choice_lab", "surprise_drop"]).optional(),
  locked: z.boolean().optional(),
  masteryUnlockState: z.enum(["teased_locked", "preparing", "pending_ceremony", "unlocked", "completed"]).optional(),
  wordRadarConfig: z.preprocess(
    (value) => value === null ? undefined : value,
    wordRadarNodeConfigSchema.optional(),
  ),
  rewardWrapper: z.preprocess(
    (value) => value === null ? undefined : value,
    rewardWrapperSchema.optional(),
  ),
});

const compactActiveSessionPlanSchema = z.object({
  planId: z.string().min(1).optional(),
  nodePlan: z.array(compactNodePlanSchema).min(1),
  evidenceUsed: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
  })).optional(),
  openQuestions: z.array(z.string()).optional(),
  plannerConfidence: z.number().optional(),
});

const assignmentPlannerDraftSchema = z.object({
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
    .filter((contract) =>
      NODE_TYPES.has(contract.id as NodeType) || contract.plannerVisibility === "wrapper")
    .filter((contract) => !ASSIGNMENT_PLANNER_EXCLUDED_ACTIVITY_IDS.has(contract.id))
    .filter((contract) =>
      !allowed ||
      allowed.has(contract.id) ||
      PLANNER_DESTINATION_ACTIVITY_IDS.has(contract.id) ||
      contract.plannerVisibility === "wrapper")
    .map((contract) => ({
    activityId: contract.id,
    label: contract.label,
    domains: [...contract.domains],
    skillTargets: [...contract.traits.skillTargets],
    evidenceType: contract.traits.evidenceType,
    inputModes: [...contract.traits.inputModes],
    measures: [...contract.measures],
    strengths: [...contract.strengths],
    weakFor: [...contract.weakFor],
    goodFitWhen: [...contract.goodFitWhen],
    badFitWhen: [...contract.badFitWhen],
    plannerVisibility: contract.plannerVisibility,
    capabilityModes: contract.capabilityModes.map((mode) => ({
      ...mode,
      skillTargets: [...mode.skillTargets],
      inputModes: [...mode.inputModes],
      scaffolds: [...mode.scaffolds],
      config: { ...mode.config },
      measurementRisks: [...mode.measurementRisks],
    })),
  }));
}

function summarizeCarePlan(chart: ChildChart): string | null {
  const current = chart.carePlan?.current as { signal?: unknown; summary?: unknown } | null | undefined;
  if (!current) return null;
  return String(current.signal ?? current.summary ?? "Care plan present.");
}

export function buildAssignmentPlanningPacket(args: {
  childId: string;
  extraction: AssignmentSourceExtraction;
  childChart: ChildChart;
  currentEvidenceSummary?: string[];
  parentDialogue?: AssignmentPlannerDialogueTurn[];
  priorPlannerOutput?: AssignmentPlannerOutput;
}): AssignmentPlanningPacket {
  const plannerInstruction = [
    "Interpret the assignment from the source text and source groups.",
    "Think like the tutor sitting beside the child: what does the assignment require, what should you check first, what will teach or reveal the next thing, and when should you switch the emotional texture so the child stays with you?",
    "The child experiences the activity, not your internal capability mode; if two academically different checks use the same game shell, choose a different material or explain why the repetition is the right tutor move.",
    "nodes exist to change the lived lesson, not to decorate the map.",
    "Activities are instruments and materials. Choose nodes by target purpose, child state, and lived experience, not by generic fun.",
    "Each word group must declare its learning purpose from source evidence.",
    "Do not collapse teacher-labeled groups into one skill; infer whether each group asks for spelling production, recognition, fluency, pronunciation, meaning, or review.",
    "Before planning the next board, ask: What changed since the last session? What should this plan try differently because of that evidence?",
    "Use recent canonical activity evidence as lesson-to-lesson labs: weak targets get support; mastered targets get smaller spaced checks or transfer instead of full repeated baseline.",
    "When exact weak targets are named, give those weak targets strictly more academic support than mastered targets; light reinforcement must be smaller than support.",
    "When evidence conflicts, the first academic node should probe those exact contradictory targets; give them more academic placements than clean/mastered targets, and do not create a same-activity run just to replay clean words.",
    "High-frequency groups whose purpose is recognize or read_fluently should usually be measured by visible_read or pronunciation, not spelling production, unless source or evidence explicitly says spelling is the gap.",
    "When a recognition/read-fluency lane needs spoken fluency, include a pronunciation instrument; if visible_read alone is sufficient, explain that limitation in reviewQuestions.",
    "If parent dialogue is present, treat it as human-in-the-loop correction context and revise the prior planner output instead of ignoring subtle assignment nuance.",
    "If priorPlannerOutput is present, this is a revision. Preserve good prior decisions, update only what the parent dialogue or source evidence changes, and keep one coherent board.",
    "Use plannerReferences when evaluating whether a new class activity should enter Sunny; docs explain the product rule, while configOwner points to the machine-readable contract.",
    "Use the child-facing journey as part of professional judgment: the experience should feel purposeful and worth effort while preserving academic validity.",
    "Each activity must be chosen because its measured skills fit that declared purpose.",
    "Return a board plan that cites why every activity fits the target purpose.",
  ].join(" ");
  return {
    packetVersion: 1,
    childId: args.childId,
    sourceDocument: {
      filename: args.extraction.filename,
      sourceKind: args.extraction.sourceKind,
      mediaType: args.extraction.mediaType,
      fileHash: args.extraction.fileHash,
      extractionMethod: args.extraction.extractionMethod,
      warnings: [...args.extraction.warnings],
      pages: args.extraction.pages.map((page) => ({ ...page })),
      fullText: args.extraction.fullText,
    },
    childChart: {
      childId: args.childChart.childId,
      displayName: args.childChart.identity.displayName,
      grade: args.childChart.demographics?.grade,
      selectedCompanionId: args.childChart.companion?.presetId ?? null,
      selectedCompanionName: args.childChart.companion?.displayName ?? null,
      activeHomeworkSummary: args.childChart.homework.pending
        ? `${args.childChart.homework.pending.homeworkId}:${args.childChart.homework.pending.capturedContent?.title ?? args.childChart.homework.pending.contentProfile?.topic ?? "active homework"}`
        : null,
      carePlanSummary: summarizeCarePlan(args.childChart),
      recentEvidence: args.currentEvidenceSummary ?? [],
    },
    activityCatalog: activityCatalog(args.childId),
    plannerReferences: ASSIGNMENT_PLANNER_REFERENCE_DOCS.map((doc) => ({
      ...doc,
      appliesWhen: [...doc.appliesWhen],
      checklist: [...doc.checklist],
    })),
    ...(args.parentDialogue?.length ? { parentDialogue: args.parentDialogue.map((turn) => ({ ...turn })) } : {}),
    ...(args.priorPlannerOutput ? { priorPlannerOutput: args.priorPlannerOutput } : {}),
    plannerInstruction,
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
  const activityIds = new Set(args.activityIds ?? catalog.map((card) => card.activityId));
  const catalogByActivityId = new Map(catalog.map((card) => [card.activityId, card]));
  const wrapperActivityIds = new Set(
    catalog
      .filter((card) => card.plannerVisibility === "wrapper")
      .map((card) => card.activityId),
  );
  const wrapperModesByActivityId = new Map(
    catalog
      .filter((card) => card.plannerVisibility === "wrapper")
      .map((card) => [
        card.activityId,
        new Set(card.capabilityModes.map((mode) => mode.id)),
      ]),
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
    if (wrapperActivityIds.has(node.activityId)) {
      issues.push({
        code: "wrapper_activity_used_as_node",
        severity: "error",
        message: `Node ${node.id} uses wrapper activity ${node.activityId} as a standalone node; attach it as rewardWrapper on a domain-valid node instead.`,
      });
    }
    const rewardWrapper = "rewardWrapper" in node ? node.rewardWrapper : undefined;
    if (rewardWrapper) {
      const wrapperCard = catalogByActivityId.get(rewardWrapper.activityId);
      if (!wrapperCard) {
        issues.push({
          code: "unknown_reward_wrapper_activity",
          severity: "error",
          message: `Node ${node.id} references unknown reward wrapper ${rewardWrapper.activityId}.`,
        });
      } else if (wrapperCard.plannerVisibility !== "wrapper") {
        issues.push({
          code: "reward_wrapper_activity_not_wrapper",
          severity: "error",
          message: `Node ${node.id} references ${rewardWrapper.activityId} as a reward wrapper, but the catalog does not mark it as a wrapper.`,
        });
      } else if (!wrapperModesByActivityId.get(rewardWrapper.activityId)?.has(rewardWrapper.mode)) {
        issues.push({
          code: "unknown_reward_wrapper_mode",
          severity: "error",
          message: `Node ${node.id} references unsupported wrapper mode ${rewardWrapper.activityId}:${rewardWrapper.mode}.`,
        });
      }
      if (
        rewardWrapper.mode === "domain_payload_wrapper" &&
        (node.locked === true || node.type === "quest" || node.type === "boss" || node.type === "mystery")
      ) {
        issues.push({
          code: "reward_wrapper_requires_domain_payload_node",
          severity: "error",
          message: `Node ${node.id} uses domain_payload_wrapper on ${node.type}; attach it to an unlocked evidence-generating domain node instead.`,
        });
      }
    }
    const nodeTargetKeys = new Set(node.targets.map((target) => target.trim().toLowerCase()).filter(Boolean));
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
  return `${ASSIGNMENT_PLANNER_PERSONA}

Design today's learning journey for this child from the source-of-truth packet.

Output contract:
- If source page images are provided, use the worksheet image/layout as the primary source of truth and OCR text only as support.
- Do not flatten source word groups.
- Infer each source group's target purpose from the assignment evidence.
- Do not assume every group on a spelling handout has the same success target; teacher headings can distinguish spelling production from reading fluency, recognition, vocabulary, or review.
- Use recent canonical activity evidence as lesson-to-lesson labs: misses/second attempts/help/skips increase support and dosage for those exact targets; fast first-try correct evidence reduces dosage and moves the target toward spaced checks or transfer.
- Mastery evidence should shrink redundant baseline work. Do not repeat a full scaffolded baseline for targets that were all correct first try with low latency and no support; use a small spaced reinforcement check, Mystery for preference data, and locked Quest for transfer readiness.
- Light spaced reinforcement means fewer mastered targets and fewer academic placements than the weak/fragile targets. If a prior lesson names exact missed targets, those weak targets should receive strictly more academic measurement/support than the mastered targets, unless your planTheory explicitly argues otherwise.
- When evidence conflicts, the first academic node should probe those exact contradictory targets; give them more academic placements than clean/mastered targets, and do not create a same-activity run just to replay clean words.
- Match each source group to activities whose cataloged skills can actually measure that purpose.
- For source groups whose purpose is recognize, read_fluently, or pronounce, prefer pronunciation or visible_read-style recognition evidence. Do not turn high-frequency recognition words into spelling-production work unless the source explicitly says those words are spelling targets or prior evidence shows spelling production is the gap.
- If a recognition/read-fluency group needs spoken fluency, include a pronunciation node. If you choose visible_read without pronunciation, reviewQuestions must explain why visible-read recognition is sufficient for this assignment.
- If parent dialogue or priorPlannerOutput is present in the packet, this is a human-in-the-loop revision. Use the parent correction as context and return a revised complete plan from the same source of truth.
- For any node targeting one source word group, targetLane must exactly equal that source wordGroups[].id. Do not invent expanded lane names.
- Do not use an activity just because it is fun or nearby; use the activity catalog as the instrument list.
- Planner-visible wrapper activities are not map nodes. If a wrapper fits organically, attach it as rewardWrapper on a domain-valid node instead of replacing the academic activity.
- Spark Orb may be selected only as rewardWrapper when its catalog/docs fit the child and assignment. It is optional; choosing not to use it is valid when baseline evidence should stay clean.
- domain_payload_wrapper must attach to an unlocked evidence-generating activity node, not Mystery, Quest, Boss, or any locked destination.
- Choose nodePlan directly. Do not merely explain a prebuilt board.
- Every word-radar node must include wordRadarConfig from the activity catalog capability modes. wordRadarConfig.recallMode has exactly three allowed values: visible_read, partial_visual_recall, hidden_word_recall. Never emit audio_cued_letter_recall as recallMode. Capability mode ids may appear in rationale, not in wordRadarConfig.recallMode. For spelling construction that is new/weak/fragile, use partial_visual_recall with letter-by-letter input, no timer, hidden during response, and captured response required. If you choose the catalog's audio_cued_letter_recall capability mode, emit recallMode partial_visual_recall with the provided audio-cued config values; do not put capability-mode ids into recallMode. Use hidden_word_recall only when prior evidence supports harder recall. Use visible_read for recognition/fluency/accessibility evidence, especially when the source purpose is recognize or read_fluently. Omit wordRadarConfig on non-word-radar nodes.
- Treat the child-facing journey as part of your professional judgment: the experience should feel purposeful and worth effort while preserving academic validity.
- Include the adventure spine in activeSessionPlan.nodePlan: enough baseline evidence to know the gap, then teaching or practice that changes the lived lesson, then exactly one mystery node for child choice/bandit preference evidence after evidence-generating work, then a locked quest destination for generated transfer, then a locked boss destination for the mastery finale after quest evidence.
- Mystery is choice/preference evidence, not mastery. Use type/activityId "mystery", choiceMode "choice_lab", locked false, and targets from the relevant active homework targets.
- Quest and Boss are destinations, not playable baseline nodes. Use type/activityId "quest" and "boss", locked true, masteryUnlockState "preparing"; Quest targets the current theory targets, Boss may have empty targets until quest evidence exists.
- Set masteryUnlockState only on locked quest and boss nodes. For those nodes use exactly "masteryUnlockState": "preparing". Omit masteryUnlockState from every unlocked, non-destination, or choice node.
- Include parent-review language that explains why every group was routed to its activity.
- In planTheory or reviewQuestions, explain why the journey you chose fits this child today.
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
    "activeSessionPlan": {"nodePlan": [{"id": string, "type": string, "activityId": string, "targets": string[], "difficulty": 1 | 2 | 3, "targetLane": string, "choiceMode": "choice_lab | surprise_drop only for mystery", "locked": boolean, "masteryUnlockState": "only on locked quest/boss nodes, exactly \"preparing\"", "wordRadarConfig": "only for word-radar nodes: {\"recallMode\": \"visible_read\" | \"partial_visual_recall\" | \"hidden_word_recall\", \"inputMode\": \"whole-word\" | \"letter-by-letter\" | \"keyboard\", \"speakStyle\": \"option-a\" | \"option-b\", \"showTimer\": boolean, \"timerSeconds\": number, \"hideWordDuringResponse\": boolean, \"requiresCapturedResponse\": boolean}", "rewardWrapper": "optional wrapper only: {\"activityId\": \"spark-orb-charge\", \"mode\": \"charge_bridge\" | \"domain_payload_wrapper\", \"reason\": string}"}]},
    "plannedMeasurements": [{"id": string, "activityId": string, "target": string, "evidenceType": string, "supportCriteria": string, "reviseCriteria": string, "falsifyCriteria": string}],
    "planTheory": {"hypothesis": string, "evidenceSummary": string[], "intervention": string, "supportCriteria": string[], "reviseCriteria": string[], "falsifyCriteria": string[]},
    "reviewQuestions": string[]
  }

Packet:
${JSON.stringify(packet, null, 2)}`;
}

type AssignmentPlannerResponseObject = z.infer<typeof assignmentPlannerDraftSchema>;

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

async function parseOrRepairAssignmentPlannerJson(
  value: string,
  model: string,
): Promise<AssignmentPlannerResponseObject> {
  try {
    return parseAssignmentPlannerJson(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const { text } = await generateText({
      model: anthropic(model),
      system: "Repair malformed JSON. Return only one valid JSON object. Do not add, remove, or reinterpret educational content.",
      prompt: firstJsonObject(value),
    });
    return parseAssignmentPlannerJson(text);
  }
}

async function callAssignmentPlannerModel(
  packet: AssignmentPlanningPacket,
  model: string,
): Promise<{ text: string; usage?: LanguageModelUsage }> {
  const prompt = buildAssignmentPlannerPrompt(packet);
  const images = assignmentPlannerSourceImages(packet);
  if (images.length === 0) {
    const { text, usage } = await generateText({
      model: anthropic(model),
      system: ASSIGNMENT_PLANNER_PERSONA,
      prompt,
    });
    return { text, usage };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: 12_000,
    system: `${ASSIGNMENT_PLANNER_PERSONA} Use the visible homework source first, then OCR text as support.`,
    messages: [{
      role: "user",
      content: [
        ...images.map((image) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: image.mediaType,
            data: image.data,
          },
        })),
        { type: "text" as const, text: prompt },
      ],
    }],
  });
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("\n");
  return {
    text,
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

async function planAssignmentFromSourceInternal(
  packet: AssignmentPlanningPacket,
  opts: AssignmentPlanningOptions = {},
): Promise<{ output: AssignmentPlannerOutput; telemetry: AssignmentPlannerTelemetry }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
  }
  const model = resolveAssignmentPlannerModel(opts);
  const started = Date.now();
  const { text, usage } = await callAssignmentPlannerModel(packet, model);
  const draft = await parseOrRepairAssignmentPlannerJson(text, model);

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
    output: {
      capturedContent,
      assignmentInterpretation: capturedContent.assignmentInterpretation!,
      homeworkWords: draft.homeworkWords,
      activeSessionPlan,
      plannedMeasurements: draft.plannedMeasurements,
      planTheory: draft.planTheory,
      reviewQuestions: draft.reviewQuestions,
      generatedExperienceBriefs,
    },
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
