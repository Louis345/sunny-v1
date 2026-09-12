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
import { knownThumbnailUrlForActivity } from "../shared/activityPresentation";
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
  assignmentPlannerContent,
} from "./assignmentSourceExtraction";
import { certifySpellingAdaptation } from "./spellingCertification";
import { buildDiscoveryEvidenceSummary, hashDiscoveryContract, runMathProviderStage, type DiscoveryEvidenceSummary } from "./adaptiveMathDiscovery";
import type { LearningObservation, SpellingDiagnosticInstrument, SpellingDiagnosticSelection } from "./learningCycleRepository";
import {
  buildPlannerContentCandidateCards,
} from "./learningDecisionContext";

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
  candidateCard?: {
    contentId: string;
    runtimeStatus: "verified" | "registered_unverified" | "unavailable" | "failed";
    evidenceCount: number;
    averageAccuracy?: number;
    completionRate?: number;
    frustrationScore?: number;
    lastRating?: "like" | "dislike" | "implicit";
    reuseEligible: boolean;
    estimatedCalls: { reuse: number; revise: number; generateNew: number };
    uncertainty: string;
  };
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
  spellingDiagnostics?: { version: 1; instruments: SpellingDiagnosticInstrument[]; evidenceIds: string[]; observations: Omit<LearningObservation, "childResponse" | "prompt">[]; device: { status: "unknown" } };
  discoveryEvidence?: { summary: DiscoveryEvidenceSummary; observations: Omit<LearningObservation, "childResponse" | "prompt">[]; history: ChildChart["learningHistory"]; diagnosticSelection?: SpellingDiagnosticSelection };
};

export function attachSpellingDiscoveryEvidence(packet: AssignmentPlanningPacket, chart: ChildChart): AssignmentPlanningPacket {
  const cycle = chart.learningCycle;
  if (!cycle || cycle.domain !== "spelling" || ["evaluation_ready", "evaluation_active"].includes(cycle.lifecycle)) throw new Error("spelling_evidence_not_committed");
  const clean = ({ childResponse: _response, prompt: _prompt, ...facts }: LearningObservation): Omit<LearningObservation, "childResponse" | "prompt"> => facts;
  // Replace pre-Discovery board prescriptions; current evidence, not the old
  // ingestion spine, determines this program's topology and teaching emphasis.
  packet = { ...packet, plannerInstruction: "Use the captured school words and cited child-chart evidence as assignment truth." };
  packet = { ...packet, plannerInstruction: `${packet.plannerInstruction}\nNative activityConfig contracts: both engines require schemaVersion:1, activityId, domain:spelling, topic, learningGoal, gradeBand:early_elementary, evidencePolicy:{writesPracticeEvidence:true,writesMasteryEvidence:false,requiresPerTargetResult:true,allowedEvidence:[practice]}. Letter Rush also needs mode (type-and-spell, hear-and-spell, read-and-race, trap-the-imposter, mastery-run), scaffolds:{showWord,letterBank,allowRetryBeforeScore,companionHints} booleans, and words:[{id,text}]. Concept Check needs engine:{id,mode}, targets:[{id,label,type:word}], and rounds:[{id,mechanic:choose,targetId,prompt,options:[{id,label,correct}],scaffoldLevel}], with one correct option and one round per target. These are runtime capabilities, not a prescription to select those games.` };
  const history = chart.learningHistory ? { ...chart.learningHistory, constructs: Object.fromEntries(Object.entries(chart.learningHistory.constructs).map(([id, entry]) => [id, { ...entry, observations: entry.observations.map(clean) }])) } : { childId: cycle.childId, constructs: {}, recentDecisions: [], pendingInterpretation: [] };
  return { ...packet, capturedHomework: { ...packet.capturedHomework, title: cycle.assignment.title, type: "spelling_test", words: cycle.assignment.targets, questions: [], wordGroups: [{ id: "assigned", label: "Assigned school words", purpose: "spell_from_memory", words: cycle.assignment.targets, confidence: 1, evidence: cycle.assignment.capturedEvidenceIds }], contentProfile: { ...packet.capturedHomework.contentProfile, practiceDomain: "spelling", contentDomain: "language_arts", topic: cycle.assignment.title, primarySkill: "Spell assigned words from recall" } },
    discoveryEvidence: { summary: buildDiscoveryEvidenceSummary(cycle), observations: cycle.observations.map(clean), history, diagnosticSelection: cycle.nodes.find(node => node.role === "evaluation")?.evidenceContract.diagnosticSelection },
    plannerInstruction: `${packet.plannerInstruction}\nThis is targeted spelling planning after committed Discovery. Treat unknown, assisted, and instrument-ambiguous responses separately from spelling errors. Previous outcomes below are evidence, not permanent learning-style or preference instructions. You own practice emphasis, games, sequence, and predictions. Please concentrate practice on clean independent misses; do not spend equal practice time on words the child already demonstrated independently. If you offer child-choice practice routes, every selectable route must address every clean independent miss, either through required shared practice or within that route, so agency cannot bypass the demonstrated gap. Preserve the available spelling games and earning rules. For every node add plannedMeasurements.spelling: role (instruction, practice, fresh_checkpoint), evidenceIds, interventionNodeIds, reason, uncertainty, expectedAccuracy {min,max}, confidence, maxDelayDays, finalCheck. Cite actual observation IDs. A checkpoint follows and cites the intervention it measures. The final hidden recall check is a shared convergence after practice—not a child-choice route—and covers all assigned words, including initially secure words. Word Radar hidden_word_recall is the available capture instrument. Hearing a word is stimulus; seeing letters or help is assistance. Previously practiced words are never unseen. Predict immediate unassisted recall only, not retention, mastery, or causation. Use generationRequests only for a missing catalog capability; reuse available implementations otherwise. For letter-rush or concept-check provide the catalog's complete engine payload in node.activityConfig, with domain spelling and writesMasteryEvidence false. Its targets must exactly cover the node's assigned words; code binds their frozen identities. Concept-check selection measures recognition practice, not independent spelling recall. Academic conclusions stay in spelling; cross-domain interaction facts may inform tentative design hypotheses.`,
  };
}

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
    | "missing_node_title"
    | "target_lane_mismatch"
    | "activity_renderer_mismatch"
    | "unknown_activity_id";
  severity: "error" | "warning";
  message: string;
};

export type AssignmentPlanningOptions = {
  model?: string;
  callPlannerModel?: AssignmentPlannerModelCaller;
  providerReceipt?: { draftDir: string; stage: string };
};

const spellingIntakeUncertaintySchema = z.object({
  kind: z.enum(["unreadable_word", "ambiguous_word", "assignment_scope"]),
  pageNumber: z.number().int().positive(),
  detail: z.string().trim().min(1),
}).strict();
const spellingDiagnosticReasonSchema = z.object({
  reason: z.string().trim().min(1), evidenceIds: z.array(z.string().min(1)).min(1),
  uncertainty: z.array(z.string().trim().min(1)).min(1), nextEvidenceNeeded: z.array(z.string().trim().min(1)).min(1),
});
const spellingDiagnosticDecisionSchema = z.discriminatedUnion("action", [
  spellingDiagnosticReasonSchema.extend({ action: z.literal("select"), activityId: z.string().min(1), modeId: z.string().min(1) }).strict(),
  spellingDiagnosticReasonSchema.extend({ action: z.literal("needs_instrument") }).strict(),
]);
const spellingIntakeSchema = z.object({
  title: z.string().trim().min(1),
  words: z.array(z.object({ word: z.string().trim().min(1), pageNumber: z.number().int().positive() }).strict()).min(1),
  uncertainty: z.array(z.union([spellingIntakeUncertaintySchema, z.string().trim().min(1)])),
  sourceNotes: z.array(z.string()).optional(),
  diagnostic: spellingDiagnosticDecisionSchema.optional(), // Historical captures did not have Planner selection.
}).strict();
export type SpellingIntake = z.infer<typeof spellingIntakeSchema>;

export function prepareSpellingDiagnosticPacket(packet: AssignmentPlanningPacket, chart?: ChildChart): AssignmentPlanningPacket {
  if (packet.spellingDiagnostics) return packet; // Frozen requests are not recomputed on resume.
  const available = new Set(packet.activityCatalog.filter(card => card.launchable && card.domains.includes("spelling")).map(card => card.activityId));
  const instruments = listActivityToolContracts().filter(tool => available.has(tool.id)).flatMap(tool => tool.capabilityModes.flatMap(mode =>
    mode.independentDiscovery?.domain === "spelling" ? [{ activityId: tool.id, modeId: mode.id, protocol: mode.independentDiscovery.protocol, config: structuredClone(mode.config), measurementRisks: [...mode.measurementRisks] }] : []));
  const observations = Object.values(chart?.learningHistory.constructs ?? {}).flatMap(entry => entry.observations)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, 40)
    .map(({ childResponse: _response, prompt: _prompt, ...facts }) => facts);
  return { ...packet, spellingDiagnostics: { version: 1, instruments, observations,
    evidenceIds: [...new Set([`assignment:${packet.sourceDocument.fileHash}`, ...observations.map(row => row.observationId)])],
    device: { status: "unknown" } } };
}

export function resolveSpellingDiagnosticSelection(capture: SpellingIntake, packet: AssignmentPlanningPacket): SpellingDiagnosticSelection | undefined {
  const context = packet.spellingDiagnostics, decision = capture.diagnostic;
  if (!context) {
    if (decision) throw new Error("spelling_diagnostic_context_missing");
    return undefined; // Explicitly versioned legacy compatibility, never an AI claim.
  }
  if (!decision) throw new Error("spelling_diagnostic_decision_required");
  if (decision.evidenceIds.some(id => !context.evidenceIds.includes(id))) throw new Error("spelling_diagnostic_evidence_invalid");
  if (decision.action === "needs_instrument") return undefined;
  const instrument = context.instruments.find(row => row.activityId === decision.activityId && row.modeId === decision.modeId);
  if (!instrument) throw new Error("spelling_diagnostic_instrument_unavailable");
  return { decision: structuredClone(decision), instrument: structuredClone(instrument), snapshotHash: hashDiscoveryContract({ decision, instrument }) };
}

export function parseSpellingIntake(value: unknown, packet: AssignmentPlanningPacket): SpellingIntake {
  const result = spellingIntakeSchema.parse(value);
  const pages = new Set(packet.sourceDocument.pages.map(page => page.pageNumber));
  if (result.words.some(row => !pages.has(row.pageNumber))) throw new Error("spelling_intake_source_page_invalid");
  if (result.uncertainty.some(issue => typeof issue !== "string" && !pages.has(issue.pageNumber))) throw new Error("spelling_intake_uncertainty_page_invalid");
  const identities = result.words.map(row => row.word.normalize("NFC").toLocaleLowerCase("en-US"));
  if (new Set(identities).size !== identities.length) throw new Error("spelling_intake_word_duplicate");
  resolveSpellingDiagnosticSelection(result, packet);
  return result;
}

export function buildSpellingIntakePrompt(packet: AssignmentPlanningPacket): string {
  return `This is the assignment-capture and diagnostic-selection phase of Sunny's existing Planner. Capture every assigned spelling word from the complete school source, preserving punctuation and word identity. Reference the source page for each word. Do not add practice words or guess unreadable words. Put informational observations about headers, OCR, repeated practice pages, and clearly captured content in sourceNotes; these notes do not block ingestion. Reserve top-level uncertainty for unresolved assigned-word identity or assignment scope: [{kind: unreadable_word | ambiguous_word | assignment_scope, pageNumber, detail}]. Leave it empty when assigned words and scope are clear. Do not prescribe a teaching board, predictions, games, or mastered/weak labels before current Discovery evidence exists.\n${packet.spellingDiagnostics ? "You own the diagnostic choice. Choose an available validated instrument whose capture can establish the assigned words' independent starting point for this child. Compare its capabilities and measurement risks with the source, child chart, factual observations, and device uncertainty. Availability does not establish suitability or prove this is the best tool. Return diagnostic with action select, activityId, modeId, reason, evidenceIds, uncertainty, and nextEvidenceNeeded; cite only IDs supplied below. If none fits, use action needs_instrument with reason, evidenceIds, uncertainty, and nextEvidenceNeeded, omitting activityId and modeId. Do not substitute an unvalidated practice game or invent a device or permanent learning-style preference. The selected instrument must offer every assigned word without first exposing its spelling, allow Not sure, exit and resume, and preserve unknown/support/confound status. Hearing a whole word is stimulus; spelling or letter clues are assistance. Keep diagnostic uncertainty separate from source-extraction uncertainty." : "This is a saved legacy capture request; preserve its capture-only response contract."}\nReturn only title, words [{word,pageNumber}], sourceNotes, uncertainty${packet.spellingDiagnostics ? ", and diagnostic" : ""}.\nSOURCE:\n${JSON.stringify(packet.sourceDocument)}\nCHILD CHART:\n${JSON.stringify(packet.childChart)}\nVALIDATED DIAGNOSTICS AND FACTUAL EVIDENCE:\n${JSON.stringify(packet.spellingDiagnostics ?? null)}`;
}

export async function planSpellingIntakeFromSource(packet: AssignmentPlanningPacket, opts: {
  model?: string;
  callPlannerModel?: (packet: AssignmentPlanningPacket, model: string) => Promise<{ draft: unknown; usage?: LanguageModelUsage }>;
  providerReceipt?: { draftDir: string; stage: string };
} = {}): Promise<{ output: SpellingIntake; telemetry: AssignmentPlannerTelemetry }> {
  const model = resolveAssignmentPlannerModel({ model: opts.model });
  const started = Date.now();
  const parse = (value: unknown): SpellingIntake => {
    const result = parseSpellingIntake(value, packet);
    // Legacy saved warnings stay readable, but new captures must state an actionable issue.
    if (result.uncertainty.some(issue => typeof issue === "string")) throw new Error("spelling_intake_structured_uncertainty_required");
    return result;
  };
  const schema = spellingIntakeSchema.extend({ sourceNotes: z.array(z.string()), uncertainty: z.array(spellingIntakeUncertaintySchema), ...(packet.spellingDiagnostics ? { diagnostic: spellingDiagnosticDecisionSchema } : {}) });
  type Receipt = { message: Anthropic.Messages.Message; latencyMs: number } | { draft: unknown; usage?: LanguageModelUsage; latencyMs: number } | { output: SpellingIntake; telemetry: AssignmentPlannerTelemetry };
  const receive = async (): Promise<Receipt> => opts.callPlannerModel
    ? { ...await opts.callPlannerModel(packet, model), latencyMs: Date.now() - started }
    : { message: await requestAssignmentPlannerTool({ prompt: buildSpellingIntakePrompt(packet), model, source: packet.sourceDocument, schema: z.toJSONSchema(schema, { io: "input" }) }), latencyMs: Date.now() - started };
  // Persist the entire paid response BEFORE schema/eligibility validation. Old completed
  // capture receipts retain the same request hash and remain reusable without a call.
  const receipt = opts.providerReceipt ? await runMathProviderStage({ ...opts.providerReceipt, model, request: packet, execute: receive }) : await receive();
  if ("output" in receipt) return { ...receipt, output: parseSpellingIntake(receipt.output, packet) };
  const tool = "message" in receipt ? receipt.message.content.find(block => block.type === "tool_use" && block.name === ASSIGNMENT_PLANNER_TOOL_NAME) : undefined;
  const draft = "message" in receipt ? tool && "input" in tool ? tool.input : undefined : receipt.draft;
  const usage = "message" in receipt ? usageFromAnthropic(receipt.message) : receipt.usage;
  const output = parse(draft);
  console.log(` 🎮 [spelling-discovery] [diagnostic-decision] [${output.diagnostic?.action ?? "legacy-fixed-instrument"}]`);
  return { output, telemetry: { model, usage, latencyMs: receipt.latencyMs } };
}

export type AssignmentPlannerTelemetry = {
  model: string;
  usage?: LanguageModelUsage;
  latencyMs: number;
};

type AssignmentPlannerResult = { output: AssignmentPlannerOutput; telemetry: AssignmentPlannerTelemetry; receivedAt?: string };
type AssignmentPlannerReceipt =
  | { message: Anthropic.Messages.Message; model: string; latencyMs: number; createdAt: string }
  | { result: AssignmentPlannerResult; createdAt: string }; // Completed pre-raw receipts remain reusable.

export type AssignmentPlannerModelCaller = (
  packet: AssignmentPlanningPacket,
  model: string,
) => Promise<{ draft: AssignmentPlannerResponseObject; usage?: LanguageModelUsage; telemetry?: AssignmentPlannerTelemetry; receivedAt?: string }>;

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
  spelling: z.object({
    role: z.enum(["instruction", "practice", "fresh_checkpoint"]),
    evidenceIds: z.array(z.string().min(1)).min(1),
    interventionNodeIds: z.array(z.string().min(1)),
    reason: z.string().min(1), uncertainty: z.string().min(1),
    expectedAccuracy: z.object({ min: z.number().min(0).max(1), max: z.number().min(0).max(1) }).refine(range => range.min <= range.max),
    confidence: z.number().min(0).max(1), maxDelayDays: z.number().nonnegative(), finalCheck: z.boolean(),
  }).strict().optional(),
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
  title: z.string().trim().min(1).optional(),
  type: z.enum(PLANNER_NODE_ACTIVITY_IDS),
  activityId: z.enum(PLANNER_NODE_ACTIVITY_IDS),
  targets: compactTargetsSchema,
  activityConfig: z.record(z.string(), z.unknown()).optional(),
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
        modeEvidenceNotes: evidenceFields.modeEvidenceNotes.filter(note => !contract.capabilityModes.some(mode => mode.id === note.id && mode.independentDiscovery)),
        // Opening diagnostics have their own evidence-limited request context;
        // don't present assessment adapters as ordinary teaching-board modes.
        capabilityModes: contract.capabilityModes.filter(mode => !mode.independentDiscovery).map((mode) => ({
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
  const baseCatalog = activityCatalog(args.childId, args.extraction);
  const domain = inferPlannerCatalogDomain(args.extraction);
  const candidateByActivityId = new Map(
    buildPlannerContentCandidateCards({ chart: args.childChart, domain })
      .filter((card) => card.contentId.startsWith("instrument:"))
      .map((card) => [card.contentId.slice("instrument:".length), {
        contentId: card.contentId,
        runtimeStatus: card.runtime.status,
        evidenceCount: card.childEvidence.evidenceCount,
        ...(typeof card.childEvidence.averageAccuracy === "number" ? { averageAccuracy: card.childEvidence.averageAccuracy } : {}),
        ...(typeof card.childEvidence.completionRate === "number" ? { completionRate: card.childEvidence.completionRate } : {}),
        ...(typeof card.childEvidence.frustrationScore === "number" ? { frustrationScore: card.childEvidence.frustrationScore } : {}),
        ...(card.childEvidence.lastRating ? { lastRating: card.childEvidence.lastRating } : {}),
        reuseEligible: card.decisionCosts.reuse.eligible,
        estimatedCalls: {
          reuse: card.decisionCosts.reuse.estimatedModelCalls,
          revise: card.decisionCosts.revise.estimatedModelCalls,
          generateNew: card.decisionCosts.generateNew.estimatedModelCalls,
        },
        uncertainty: card.uncertainty.note,
      }]),
  );
  const catalog = baseCatalog.map((card) => ({
    ...card,
    ...(card.launchable && (candidateByActivityId.get(card.activityId)?.evidenceCount ?? 0) > 0
      ? { candidateCard: candidateByActivityId.get(card.activityId) }
      : {}),
  }));
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
    requireNodeTitles?: boolean;
    requireCatalogBinding?: boolean;
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
    const capability = catalog.find(card => card.launchable && card.activityId === node.activityId);
    if (args.requireCatalogBinding && capability
      && node.type !== (capability.nodeType ?? normalizeAssignmentNodeType(capability.activityId, capability.activityId))) {
      issues.push({ code: "activity_renderer_mismatch", severity: "error", message: `Node ${node.id} activity ${node.activityId} cannot launch renderer ${node.type}.` });
    }
    if (args.requireNodeTitles && !node.title?.trim()) {
      issues.push({ code: "missing_node_title", severity: "error", message: `Node ${node.id} is missing its Planner-authored title.` });
    }
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
  if (packet.discoveryEvidence) return `${ASSIGNMENT_PLANNER_PERSONA}\nDesign the targeted spelling journey from the committed facts and available instruments. Return the existing ${ASSIGNMENT_PLANNER_TOOL_NAME} tool object once. Every node needs its own measure-<nodeId> planned measurement and the spelling decision fields. Preserve source words exactly. You choose the number of activities, emphasis, mechanics, and routes; do not fabricate evidence. Existing Quest/Boss gates and earning rules remain unchanged. Do not introduce new reward systems.\n${packet.plannerInstruction}\nEvidence-first packet:\n${JSON.stringify(packet)}`;
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
- Return one tool-call object with nodePlan, learningRoutes, plannedMeasurements, planTheory, and reviewQuestions in their schema-defined locations.
- Treat candidateCard child outcomes as factual, uncertain evidence. Academic compatibility is a hard gate; predicted learning value is primary; engagement is secondary; runtime clarity and reliability support the decision; uncertainty may justify bounded exploration; model-call cost and latency are penalties. A rating never overrides learning evidence, and one choice never proves preference.
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

export function assignmentPlannerToolJsonSchema(
  spellingEvidence = false,
  catalog?: ReadonlyArray<Pick<AssignmentActivityCard, "activityId" | "launchable" | "nodeType">>,
): Record<string, unknown> {
  const schema = enforcePlannerToolContract(
    z.toJSONSchema(assignmentPlannerDraftSchema, { io: "input" }) as JsonSchemaObject,
  );
  if (!spellingEvidence) {
    removeSchemaProperty(schemaProperties(schema).plannedMeasurements?.items as JsonSchemaObject, "spelling");
    removeSchemaProperty(schemaProperties(schemaProperties(schema).activeSessionPlan).nodePlan.items as JsonSchemaObject, "title");
  }
  if (spellingEvidence) {
    const nodes = schemaProperties(schemaProperties(schema).activeSessionPlan).nodePlan.items as JsonSchemaObject;
    setSchemaRequired(nodes, [...(nodes.required as string[]), "title"]);
  }
  if (spellingEvidence && catalog) {
    const available = catalog.filter(card => card.launchable);
    const ids = [...new Set(available.map(card => card.activityId))];
    if (!ids.length) throw new Error("assignment_planner_launchable_catalog_empty");
    const nodes = schemaProperties(schemaProperties(schema).activeSessionPlan).nodePlan.items as JsonSchemaObject;
    schemaProperties(nodes).activityId.enum = ids;
    schemaProperties(nodes).type.enum = [...new Set(available.map(card => card.nodeType ?? card.activityId))];
    nodes.anyOf = available.map(card => ({ properties: {
      activityId: { const: card.activityId }, type: { const: card.nodeType ?? card.activityId },
    } }));
  }
  return schema;
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

type AssignmentPlannerRelationshipIssue =
  | {
    code: "planner_baseline_intervention_lineage_invalid" | "planner_checkpoint_intervention_not_prior";
    measurementId: string;
    interventionNodeIds: string[];
  }
  | {
    code: "planner_unknown_evidence_id";
    measurementId: string;
    evidenceIds: string[];
  };

function assignmentPlannerAllowedEvidenceIds(packet: AssignmentPlanningPacket): string[] {
  const ids = new Set<string>();
  (packet.capturedHomework.wordGroups ?? []).flatMap(group => group.evidence).forEach(id => ids.add(id));
  packet.discoveryEvidence?.observations.forEach(observation => ids.add(observation.observationId));
  packet.discoveryEvidence?.summary.constructs.flatMap(construct => construct.observationIds).forEach(id => ids.add(id));
  Object.values(packet.discoveryEvidence?.history.constructs ?? {}).forEach(entry => {
    entry.observations.forEach(observation => ids.add(observation.observationId));
    entry.evaluations.forEach(evaluation => ids.add(evaluation.evaluationId));
  });
  return [...ids].sort();
}

/**
 * Diagnose cross-field lineage before asking the Planner to correct an invalid
 * tool call. The canonical cycle builder remains the authority that accepts or
 * rejects the corrected plan; this only gives the same bounded correction call
 * enough factual detail to fix relationships that JSON Schema cannot express.
 */
function assignmentPlannerRelationshipIssues(toolInput: unknown, allowedEvidenceIds: ReadonlySet<string>): AssignmentPlannerRelationshipIssue[] {
  const input = jsonObject(toolInput);
  const activeSessionPlan = jsonObject(input?.activeSessionPlan);
  const rawNodes = Array.isArray(activeSessionPlan?.nodePlan) ? activeSessionPlan.nodePlan : [];
  const rawMeasurements = Array.isArray(input?.plannedMeasurements) ? input.plannedMeasurements : [];
  const nodeOrder = new Map<string, number>();
  const gatedNodeIds = new Set<string>();
  rawNodes.forEach((rawNode, index) => {
    const node = jsonObject(rawNode);
    const id = typeof node?.id === "string" ? node.id : undefined;
    if (!id) return;
    nodeOrder.set(id, index);
    if (node?.type === "quest" || node?.type === "boss") gatedNodeIds.add(id);
  });

  const issues: AssignmentPlannerRelationshipIssue[] = [];
  for (const rawMeasurement of rawMeasurements) {
    const measurement = jsonObject(rawMeasurement);
    const measurementId = typeof measurement?.id === "string" ? measurement.id : "unknown-measurement";
    const nodeId = measurementId.startsWith("measure-") ? measurementId.slice("measure-".length) : undefined;
    if (!nodeId || gatedNodeIds.has(nodeId)) continue;
    const spelling = jsonObject(measurement?.spelling);
    if (!spelling) continue;
    const evidenceIds = Array.isArray(spelling.evidenceIds)
      ? spelling.evidenceIds.filter((id): id is string => typeof id === "string")
      : [];
    const unknownEvidenceIds = evidenceIds.filter(id => !allowedEvidenceIds.has(id));
    if (unknownEvidenceIds.length) {
      issues.push({ code: "planner_unknown_evidence_id", measurementId, evidenceIds: unknownEvidenceIds });
    }
    const interventionNodeIds = Array.isArray(spelling.interventionNodeIds)
      ? spelling.interventionNodeIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!interventionNodeIds.length) continue;
    if (spelling.role !== "fresh_checkpoint") {
      issues.push({ code: "planner_baseline_intervention_lineage_invalid", measurementId, interventionNodeIds });
      continue;
    }
    const checkpointOrder = nodeOrder.get(nodeId);
    if (checkpointOrder === undefined || interventionNodeIds.some(id => {
      const interventionOrder = nodeOrder.get(id);
      return interventionOrder === undefined || interventionOrder >= checkpointOrder;
    })) {
      issues.push({ code: "planner_checkpoint_intervention_not_prior", measurementId, interventionNodeIds });
    }
  }
  return issues;
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
  providerReceipt?: AssignmentPlanningOptions["providerReceipt"],
): Promise<({ draft: AssignmentPlannerResponseObject; usage?: LanguageModelUsage; telemetry: AssignmentPlannerTelemetry; receivedAt: string }) | { result: AssignmentPlannerResult; createdAt: string }> {
  const prompt = buildAssignmentPlannerPrompt(packet);
  const images = assignmentPlannerSourceImages(packet);
  const receive = async (): Promise<AssignmentPlannerReceipt> => {
    const started = Date.now();
    const message = await requestAssignmentPlannerTool({ prompt, model, images, schema: assignmentPlannerToolJsonSchema(Boolean(packet.discoveryEvidence), packet.activityCatalog) });
    return { message, model, latencyMs: Date.now() - started, createdAt: new Date().toISOString() };
  };
  const received = providerReceipt ? await runMathProviderStage({ ...providerReceipt, model, request: packet, beforeRequest: () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
  }, execute: receive }) : await receive();
  if ("result" in received) return received;
  // The entire provider message, including usage and non-tool blocks, is durable
  // before any local parser, hydration, or semantic validation can reject it.
  console.log(` 🎮 [assignment-planner] [response] [received] id=${received.message.id}`);
  const originalUsage = usageFromAnthropic(received.message);
  try {
    return { draft: parseAssignmentPlannerToolUseResponse(received.message), usage: originalUsage,
      telemetry: { model: received.model, usage: originalUsage, latencyMs: received.latencyMs }, receivedAt: received.createdAt };
  } catch (error) {
    if (!(error instanceof AssignmentPlannerToolInvalidError) || !providerReceipt || !packet.discoveryEvidence) throw error;
    const allowedEvidenceIds = assignmentPlannerAllowedEvidenceIds(packet);
    const relationshipIssues = assignmentPlannerRelationshipIssues(error.toolInput, new Set(allowedEvidenceIds));
    const correctionRequest = {
      version: 3,
      purpose: "assignment_planner_tool_correction",
      originalRequestHash: hashDiscoveryContract(packet),
      invalidToolInput: error.toolInput,
      schemaIssues: error.issues,
      relationshipIssues,
      allowedEvidenceIds,
    };
    const correctionPrompt = `Your previous ${ASSIGNMENT_PLANNER_TOOL_NAME} input failed its declared tool contract. Reissue the complete tool input once. Preserve every valid academic, design, node, activity, target, prediction, and evidence choice. Correct only the listed schema and relationship violations. Every spelling.evidenceIds value must come from ALLOWED EVIDENCE IDS; remove unknown IDs and never invent evidence, child facts, or new activities. Practice or instruction measurements must use interventionNodeIds: []. A fresh_checkpoint may cite only prior targeted intervention nodes. A final fresh checkpoint must cover the assigned words and all prior pending interventions. If a future gated node needs evidenceIds, cite the current observations that motivated including that node.\nSCHEMA ISSUES:\n${JSON.stringify(error.issues)}\nRELATIONSHIP ISSUES:\n${JSON.stringify(relationshipIssues)}\nALLOWED EVIDENCE IDS:\n${JSON.stringify(allowedEvidenceIds)}\nPREVIOUS TOOL INPUT:\n${JSON.stringify(error.toolInput)}`;
    const correctionStarted = Date.now();
    const correction = await runMathProviderStage({
      draftDir: providerReceipt.draftDir,
      stage: `${providerReceipt.stage}-tool-correction-v3-1`,
      model,
      request: correctionRequest,
      beforeRequest: () => {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
      },
      execute: async () => ({
        message: await requestAssignmentPlannerTool({
          prompt: correctionPrompt,
          model,
          schema: assignmentPlannerToolJsonSchema(true, packet.activityCatalog),
        }),
        model,
        latencyMs: Date.now() - correctionStarted,
        createdAt: new Date().toISOString(),
      }),
    });
    console.log(` 🎮 [assignment-planner] [tool-correction] [received] id=${correction.message.id}`);
    const correctionUsage = usageFromAnthropic(correction.message);
    const combinedUsage = combinePlannerUsage(originalUsage, correctionUsage);
    return {
      draft: parseAssignmentPlannerToolUseResponse(correction.message),
      usage: combinedUsage,
      telemetry: {
        model: correction.model,
        usage: combinedUsage,
        latencyMs: received.latencyMs + correction.latencyMs,
      },
      receivedAt: correction.createdAt,
    };
  }
}

function combinePlannerUsage(first?: LanguageModelUsage, second?: LanguageModelUsage): LanguageModelUsage | undefined {
  if (!first && !second) return undefined;
  const inputTokens = (first?.inputTokens ?? 0) + (second?.inputTokens ?? 0);
  const outputTokens = (first?.outputTokens ?? 0) + (second?.outputTokens ?? 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenDetails: {
      noCacheTokens: (first?.inputTokenDetails?.noCacheTokens ?? 0) + (second?.inputTokenDetails?.noCacheTokens ?? 0),
      cacheReadTokens: (first?.inputTokenDetails?.cacheReadTokens ?? 0) + (second?.inputTokenDetails?.cacheReadTokens ?? 0),
      cacheWriteTokens: (first?.inputTokenDetails?.cacheWriteTokens ?? 0) + (second?.inputTokenDetails?.cacheWriteTokens ?? 0),
    },
    outputTokenDetails: {
      textTokens: (first?.outputTokenDetails?.textTokens ?? 0) + (second?.outputTokenDetails?.textTokens ?? 0),
      reasoningTokens: (first?.outputTokenDetails?.reasoningTokens ?? 0) + (second?.outputTokenDetails?.reasoningTokens ?? 0),
    },
  };
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

type AssignmentPlannerToolRequest = {
  prompt: string;
  model: string;
  images?: ReturnType<typeof assignmentPlannerSourceImages>;
  source?: AssignmentSourceExtraction;
  schema?: Record<string, unknown>;
};

async function requestAssignmentPlannerTool(args: AssignmentPlannerToolRequest): Promise<Anthropic.Messages.Message> {
  const client = new Anthropic({ maxRetries: 0 });
  const timeoutMs = Math.max(10_000, Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120_000));
  const signal = AbortSignal.timeout(timeoutMs);
  return client.messages.create({
    model: args.model,
    max_tokens: Math.max(8_000, Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? ASSIGNMENT_PLANNER_MAX_TOKENS)),
    system: ASSIGNMENT_PLANNER_PERSONA,
    tools: [{
      name: ASSIGNMENT_PLANNER_TOOL_NAME,
      description: "Write Sunny's captured homework interpretation, active intervention node plan, measurements, and mastery theory. Populate every tool field directly as its declared object or array type. Never serialize the plan or any tool field into a JSON string.",
      input_schema: (args.schema ?? assignmentPlannerToolJsonSchema()) as Anthropic.Messages.Tool.InputSchema,
    }],
    tool_choice: { type: "tool", name: ASSIGNMENT_PLANNER_TOOL_NAME },
    messages: [{
      role: "user",
      content: args.source ? assignmentPlannerContent(args.source, args.prompt) : [
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
}

export function hydrateAssignmentPlannerOutputFromDraft(
  draft: AssignmentPlannerResponseObject,
  packet: AssignmentPlanningPacket,
  createdAt?: string,
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
    createdAt,
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

function thumbnailForAssignmentBoardNode(node: {
  activityId?: string;
  type: string;
  thumbnailUrl?: string;
}): string | undefined {
  const known = (node.activityId ? knownThumbnailUrlForActivity(node.activityId) : undefined)
    ?? knownThumbnailUrlForActivity(node.type);
  if (known && (!node.thumbnailUrl || node.thumbnailUrl.startsWith("/thumbnails/activities/"))) return known;
  return node.thumbnailUrl ?? known;
}

async function planAssignmentFromSourceInternal(
  packet: AssignmentPlanningPacket,
  opts: AssignmentPlanningOptions = {},
): Promise<AssignmentPlannerResult> {
  if (!process.env.ANTHROPIC_API_KEY && !opts.callPlannerModel && !opts.providerReceipt) {
    throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
  }
  const model = resolveAssignmentPlannerModel(opts);
  const started = Date.now();
  const result = opts.callPlannerModel ? await opts.callPlannerModel(packet, model) : await callAssignmentPlannerModel(packet, model, opts.providerReceipt);
  if ("result" in result) return { ...result.result, receivedAt: result.createdAt };
  const receivedAt = result.receivedAt;
  const output = hydrateAssignmentPlannerOutputFromDraft(result.draft, packet, receivedAt);
  const validationIssues = validateAssignmentPlannerOutput(output, {
    extraction: packet.sourceDocument,
    activityCatalog: packet.activityCatalog,
    requireNodeTitles: Boolean(packet.discoveryEvidence),
    requireCatalogBinding: Boolean(packet.discoveryEvidence),
  });
  const blockingIssues = validationIssues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    throw new Error(`assignment_planner_validation_failed:${blockingIssues.map((issue) => issue.code).join(",")}: ${blockingIssues.map(issue => issue.message).join("; ")}`);
  }

  return {
    output,
    ...(receivedAt ? { receivedAt } : {}),
    telemetry: result.telemetry ?? {
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
  createdAt?: string;
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
    thumbnailUrl: thumbnailForAssignmentBoardNode(node),
    source: "chart_planner" as const,
  }));
  const normalizedRoutes = normalizeLearningRoutesForPlan<DraftLearningRoute>(
    args.draft.learningRoutes,
    nodePlan,
  );
  return {
    planId,
    childId: args.packet.childId,
    createdAt: args.createdAt ?? new Date().toISOString(),
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
        plannedMeasurements: args.plannedMeasurements,
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
): Promise<AssignmentPlannerResult> {
  return planAssignmentFromSourceInternal(packet, opts);
}
