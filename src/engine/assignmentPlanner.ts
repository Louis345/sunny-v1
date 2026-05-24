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
    | "unknown_activity_id";
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
const INSTRUMENT_RENDERERS: Record<string, NodeType> = {
  "spelling-recall": "letter-rush",
};

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
  targetLane: z.string().optional(),
  choiceMode: z.enum(["choice_lab", "surprise_drop"]).optional(),
  locked: z.boolean().optional(),
  masteryUnlockState: z.enum(["teased_locked", "preparing", "pending_ceremony", "unlocked", "completed"]).optional(),
  wordRadarConfig: z.preprocess(
    (value) => value === null ? undefined : value,
    wordRadarNodeConfigSchema.optional(),
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
    .filter((contract) => NODE_TYPES.has(contract.id as NodeType))
    .filter((contract) => !allowed || allowed.has(contract.id) || PLANNER_DESTINATION_ACTIVITY_IDS.has(contract.id))
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
}): AssignmentPlanningPacket {
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
  const activityIds = new Set(args.activityIds ?? catalog.map((card) => card.activityId));
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

function buildAssignmentPlannerPrompt(packet: AssignmentPlanningPacket): string {
  return `Create Sunny's homework interpretation and active board plan from this source-of-truth packet.

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
- Every word-radar node must include wordRadarConfig from the activity catalog capability modes. For spelling construction that is new/weak/fragile, use partial_visual_recall with letter-by-letter input, no timer, hidden during response, and captured response required. Use audio_cued_letter_recall when the child should fill slots from hearing the word instead of seeing the flash. Use hidden_word_recall only when prior evidence supports harder recall. Use visible_read for recognition/fluency/accessibility evidence, especially when the source purpose is recognize or read_fluently. Omit wordRadarConfig on non-word-radar nodes.
- If a child needs shorter cohorts, shorten the target list and vary instruments by purpose rather than creating many same-activity nodes. Do not split one lane into a long run of consecutive Word Radar nodes; more Word Radar nodes are not better evidence when one better-chosen Word Radar node plus another instrument would answer the care-plan question.
- Include the adventure spine in activeSessionPlan.nodePlan: baseline measurement nodes first, then exactly one mystery node for child choice/bandit preference evidence after evidence-generating work, then a locked quest destination for generated transfer, then a locked boss destination for the mastery finale after quest evidence.
- Mystery is choice/preference evidence, not mastery. Use type/activityId "mystery", choiceMode "choice_lab", locked false, and targets from the relevant active homework targets.
- Quest and Boss are destinations, not playable baseline nodes. Use type/activityId "quest" and "boss", locked true, masteryUnlockState "preparing"; Quest targets the current theory targets, Boss may have empty targets until quest evidence exists.
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
    "activeSessionPlan": {"nodePlan": [{"id": string, "type": string, "activityId": string, "targets": string[], "difficulty": 1 | 2 | 3, "targetLane": string, "choiceMode": "choice_lab | surprise_drop only for mystery", "locked": boolean, "masteryUnlockState": "preparing for locked quest/boss", "wordRadarConfig": "only for word-radar nodes: {\"recallMode\": \"visible_read\" | \"partial_visual_recall\" | \"hidden_word_recall\", \"inputMode\": \"whole-word\" | \"letter-by-letter\" | \"keyboard\", \"speakStyle\": \"option-a\" | \"option-b\", \"showTimer\": boolean, \"timerSeconds\": number, \"hideWordDuringResponse\": boolean, \"requiresCapturedResponse\": boolean}"}]},
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
      system: "You are Sunny's assignment planner. You interpret source homework and design a measurable adaptive board from activity instruments.",
      prompt,
    });
    return { text, usage };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: 12_000,
    system: "You are Sunny's assignment planner. You interpret the visible homework source first, then design a measurable adaptive board from activity instruments.",
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
