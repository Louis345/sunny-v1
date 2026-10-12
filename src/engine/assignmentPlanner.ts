import {spellingImplementationType,SPELLING_MYSTERY_INSTRUMENT_IDS} from "./activityEngineConfig";
import {verifyAuthoredBoardCanvas} from './adventureBoardCanvas';
import { adventureBoardDefinitionSchema, BOARD_AUTHORING_INSTRUCTION, BOARD_CANVAS_AUTHORING_CONSTRAINTS, renderBoardDefinition, validateBoardDefinition, journeyExecutions, type BoardDefinitionIssue, type AdventureBoardDefinition } from '../shared/adventureBoardDefinition';
import { spellingCheckpointLineageIssues, checkpointInterventionsArePrior } from "./spellingCheckpointLineage";
import {requestPlannerMessage, assertPlannerResponseComplete} from "./plannerTransport";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {isDeepStrictEqual} from "node:util";
import type { LanguageModelUsage } from "ai";
import { z } from "zod";
import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  PlanTheory,
  PlannedMeasurement,
} from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
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
import { buildDiscoveryEvidenceSummary, hashDiscoveryContract, hasReceivedMathProviderStage, runMathProviderStage, recordProviderRequestDetails, type DiscoveryEvidenceSummary } from "./adaptiveMathDiscovery";
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
  discoveryEvidence?: { summary: DiscoveryEvidenceSummary; observations: Omit<LearningObservation, "prompt">[]; history: ChildChart["learningHistory"]; diagnosticSelection?: SpellingDiagnosticSelection };
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
    // A tutor needs the actual attempt ("nite" for night) to see what to teach.
    discoveryEvidence: { summary: buildDiscoveryEvidenceSummary(cycle), observations: cycle.observations.map(row => ({ ...clean(row), ...(row.childResponse ? { childResponse: row.childResponse.slice(0, 64) } : {}) })), history, diagnosticSelection: cycle.nodes.find(node => node.role === "evaluation")?.evidenceContract.diagnosticSelection },
    plannerInstruction: `${packet.plannerInstruction}\nThis is targeted spelling planning after committed Discovery. Separate unknown, assisted, and instrument-ambiguous responses from spelling errors. Prior outcomes are evidence, not permanent traits. You own emphasis, games, sequence, and predictions. Focus practice on clean independent misses; child-choice routes must all cover every such miss. For an opening spelling-construction node after Discovery, first teach the missed pattern when needed; if you choose Word Radar practice, use its partial_visual_recall with letter-by-letter input so each recognized letter fills a tile as the child speaks. visible_read is whole-word reading, not spoken letter construction, and Word Radar does not render node rounds or teachingFocus choices. Reserve full hidden-word recall for the later evidence-cited checkpoint. Preserve available games and earning rules. Each academic node needs plannedMeasurements.spelling:{role,evidenceIds,interventionNodeIds,reason,uncertainty,expectedAccuracy:{min,max},confidence,maxDelayDays,finalCheck}; cite observations, and make checkpoints cite their intervention. The final shared hidden-recall check covers every assigned word, including initially secure words. Word Radar hidden_word_recall captures it. Hearing the word is stimulus; letters or help are assistance; practiced words are not unseen. Predict immediate unassisted recall, not retention, mastery, or causation. Reuse catalog instruments; use generationRequests only for a missing capability. Letter Rush or Concept Check needs its complete catalog activityConfig, exact node targets, domain spelling, and writesMasteryEvidence false; Concept Check is recognition practice. Visual Explainer teaches: it shows each word in chunks with a tip and a quick check; its answers count as assisted practice, not independent evidence. If selected, provide activityConfig:{schemaVersion:1,activityId:visual-explainer,domain:spelling,topic,learningGoal,misconception,strategy:{title,steps:[2-4 short steps]},words:[{id,text,chunks:[2-6 exact pieces reconstructing text],spokenChunks:[one TTS-friendly spoken sound cue per chunk in the same order],focusChunk,tip}],check:{id,targetWord,prompt,options:[{id,label,correct}],correctOptionId},evidencePolicy:{writesPracticeEvidence:true,writesMasteryEvidence:false,requiresPerTargetResult:false,allowedEvidence:[practice,companion]}}. Choose spokenChunks that model each chunk sound in this word, not just its letter names; avoid a cue if the sound is uncertain. Cover exactly the node targets, then add a fresh hidden-recall checkpoint citing the explainer. A plain Mystery Reward has targets:[] and an engagement/reward measurement without spelling claims. The existing Mystery reward implementation is a non-academic Space Invaders break. For academic content inside Mystery, bind a supported concept-check, letter-rush, or visual-explainer activityConfig; the reward shell cannot measure spelling. Academic conclusions stay in spelling; cross-domain interaction facts are tentative design evidence.`,
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
    | "board_canvas_invalid"
    | "missing_source_document"
    | "missing_word_groups"
    | "word_missing_source_group"
    | "missing_word_radar_config"
    | "word_radar_capability_mismatch"
    | "word_radar_unrendered_teaching"
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
  boardDefinition: adventureBoardDefinitionSchema.optional(),
  diagnostic: spellingDiagnosticDecisionSchema.optional(), // Historical captures did not have Planner selection.
}).strict();
// Intake's declared instrument inventory has one canonical node; activity types are separate identities.
const intakePortal = adventureBoardDefinitionSchema.shape.portals.element;
const intakeBoardSchema = adventureBoardDefinitionSchema.extend({portals:z.array(z.union([
  intakePortal.extend({kind:z.literal('activity'),activityNodeId:z.enum(['diagnostic'])}),
  intakePortal.extend({kind:z.literal('endpoint'),activityNodeId:z.enum(['diagnostic']).optional()}),
  intakePortal.omit({activityNodeId:true}).extend({kind:z.enum(['start','choice'])}),
])).min(1).max(128)});
/** Authoring and execution share conditional requirements; historical captures keep their read-only parser. */
export function spellingIntakeAuthoringSchema(diagnostics: boolean) {
  const capture = spellingIntakeSchema.omit({diagnostic:true,boardDefinition:true}).extend({
    uncertainty:z.array(spellingIntakeUncertaintySchema),
  });
  if (!diagnostics) return capture;
  return z.union([
    capture.extend({diagnostic:spellingDiagnosticDecisionSchema.options[0],boardDefinition:intakeBoardSchema}),
    capture.extend({diagnostic:spellingDiagnosticDecisionSchema.options[1],boardDefinition:intakeBoardSchema.optional()}),
  ]);
}
export function spellingIntakeToolJsonSchema(schema:z.ZodType): Record<string,unknown> {
  return z.toJSONSchema(z.object({plan:schema}).strict(), {io:"input",reused:"ref",override:({jsonSchema})=>{
    // Provider grammar supports identity/required fields but not these bounds. Runtime keeps all bounds.
    const constraints:Record<string,unknown>={};
    for(const key of ['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','maxItems','pattern']) {
      if(key in jsonSchema) { constraints[key]=jsonSchema[key]; delete jsonSchema[key]; }
    }
    if(typeof jsonSchema.minItems==='number' && jsonSchema.minItems>1) {constraints.minItems=jsonSchema.minItems;delete jsonSchema.minItems;}
    if(Object.keys(constraints).length) jsonSchema.description=`${jsonSchema.description??''} Runtime constraints: ${JSON.stringify(constraints)}`.trim();
  }});
}
const spellingIntakeCorrectionSchema = z.union([
  z.object({diagnostic:spellingDiagnosticDecisionSchema.options[0],boardDefinition:intakeBoardSchema}).strict(),
  z.object({diagnostic:spellingDiagnosticDecisionSchema.options[1],boardDefinition:intakeBoardSchema.optional()}).strict(),
]);

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
  if (packet.spellingDiagnostics && result.diagnostic?.action === 'select') {
    if (!result.boardDefinition) throw new Error('board_definition_missing:diagnostic');
    const issues = validateBoardDefinition(result.boardDefinition, ['diagnostic']);
    if (issues.length) throw new Error(`board_definition_invalid:${JSON.stringify(issues)}`);
  }
  return result;
}

export function buildSpellingIntakePrompt(packet: AssignmentPlanningPacket): string {
  return `This is the assignment-capture and diagnostic-selection phase of Sunny's existing Planner. Capture every assigned spelling word from the complete school source, preserving punctuation and word identity. Reference the source page for each word. Do not add practice words or guess unreadable words. Put informational observations about headers, OCR, repeated practice pages, and clearly captured content in sourceNotes; these notes do not block ingestion. Reserve top-level uncertainty for unresolved assigned-word identity or assignment scope: [{kind: unreadable_word | ambiguous_word | assignment_scope, pageNumber, detail}]. Leave it empty when assigned words and scope are clear. Do not prescribe a teaching board, predictions, games, or mastered/weak labels before current Discovery evidence exists. For action select, author boardDefinition for the opening evaluation only, binding its activity portal to the local instrument ID diagnostic. Include start and endpoint, explicit edges and both landscape and portrait positions. Explain in singlePathReason why this diagnostic is one path. Do not invent teaching activities.\n${packet.spellingDiagnostics ? "You own the diagnostic choice. Choose an available validated instrument whose capture can establish the assigned words' independent starting point for this child. Compare its capabilities and measurement risks with the source, child chart, factual observations, and device uncertainty. Availability does not establish suitability or prove this is the best tool. Return diagnostic with action select, activityId, modeId, reason, evidenceIds, uncertainty, and nextEvidenceNeeded; cite only IDs supplied below. If none fits, use action needs_instrument with reason, evidenceIds, uncertainty, and nextEvidenceNeeded, omitting activityId and modeId. Do not substitute an unvalidated practice game or invent a device or permanent learning-style preference. The selected instrument must offer every assigned word without first exposing its spelling, allow Not sure, exit and resume, and preserve unknown/support/confound status. Hearing a whole word is stimulus; spelling or letter clues are assistance. Keep diagnostic uncertainty separate from source-extraction uncertainty." : "This is a saved legacy capture request; preserve its capture-only response contract."}\nReturn only title, words [{word,pageNumber}], sourceNotes, uncertainty${packet.spellingDiagnostics ? ", diagnostic, and boardDefinition" : ""}.\nSOURCE:\n${JSON.stringify(packet.sourceDocument)}\nCHILD CHART:\n${JSON.stringify(packet.childChart)}\nVALIDATED DIAGNOSTICS AND FACTUAL EVIDENCE:\n${JSON.stringify(packet.spellingDiagnostics ?? null)}`;
}

export async function planSpellingIntakeFromSource(packet: AssignmentPlanningPacket, opts: {
  model?: string;
  callPlannerModel?: (packet: AssignmentPlanningPacket, model: string) => Promise<{ draft: unknown; usage?: LanguageModelUsage }>;
  providerReceipt?: { draftDir: string; stage: string };
} = {}): Promise<{ output: SpellingIntake; telemetry: AssignmentPlannerTelemetry }> {
  const model = resolveAssignmentPlannerModel({ model: opts.model });
  const started = Date.now();
  const parse = async (value: unknown): Promise<SpellingIntake> => {
    const result = parseSpellingIntake(spellingIntakeAuthoringSchema(Boolean(packet.spellingDiagnostics)).parse(value), packet);
    // Legacy saved warnings stay readable, but new captures must state an actionable issue.
    if (result.uncertainty.some(issue => typeof issue === "string")) throw new Error("spelling_intake_structured_uncertainty_required");
    if(result.diagnostic?.action==='select' && result.boardDefinition && opts.providerReceipt) await verifyAuthoredBoardCanvas({definition:result.boardDefinition,rootDir:process.cwd(),directory:path.join(opts.providerReceipt.draftDir,'intake-canvas-verification')});
    return result;
  };
  const schema = spellingIntakeAuthoringSchema(Boolean(packet.spellingDiagnostics));
  type Receipt = { message: Anthropic.Messages.Message; latencyMs: number } | { draft: unknown; usage?: LanguageModelUsage; latencyMs: number } | { output: SpellingIntake; telemetry: AssignmentPlannerTelemetry };
  const receive = async (prompt = buildSpellingIntakePrompt(packet), requestStarted = started, responseSchema: z.ZodType = schema): Promise<Receipt> => opts.callPlannerModel
    ? { ...await opts.callPlannerModel(packet, model), latencyMs: Date.now() - requestStarted }
    : { message: await requestAssignmentPlannerTool({ prompt: `${prompt}\nPopulate the tool input plan field with that object.`, model, source: packet.sourceDocument, schema: spellingIntakeToolJsonSchema(responseSchema) }), latencyMs: Date.now() - requestStarted };
  const unpack = (value: Receipt): { draft: unknown; usage?: LanguageModelUsage; latencyMs: number } => {
    if ("output" in value) return { draft: value.output, usage: value.telemetry.usage, latencyMs: value.telemetry.latencyMs };
    if ("message" in value) assertPlannerResponseComplete(value.message);
    const tool = "message" in value ? value.message.content.find(block => block.type === "tool_use" && block.name === ASSIGNMENT_PLANNER_TOOL_NAME) : undefined;
    const providerDraft = "message" in value ? tool && "input" in tool ? tool.input : undefined : value.draft;
    const providerFields = providerDraft && typeof providerDraft === "object" && !Array.isArray(providerDraft)
      ? Object.keys(providerDraft as Record<string, unknown>)
      : [];
    const wrappedPlan = providerFields.length === 1 && providerFields[0] === "plan"
      ? (providerDraft as { plan?: unknown }).plan
      : undefined;
    if (wrappedPlan && typeof wrappedPlan === "object" && !Array.isArray(wrappedPlan)) {
      console.log(" 🎮 [spelling-discovery] [provider-envelope] [unwrapped] field=plan");
    }
    return {
      draft: wrappedPlan && typeof wrappedPlan === "object" && !Array.isArray(wrappedPlan) ? wrappedPlan : providerDraft,
      usage: "message" in value ? usageFromAnthropic(value.message) : value.usage,
      latencyMs: value.latencyMs,
    };
  };
  // Persist the entire paid response BEFORE schema/eligibility validation. Old completed
  // capture receipts retain the same request hash and remain reusable without a call.
  const receipt = opts.providerReceipt ? await runMathProviderStage({ ...opts.providerReceipt, model, request: packet, execute: receive }) : await receive();
  if ("output" in receipt) return { ...receipt, output: parseSpellingIntake(receipt.output, packet) };
  const original = unpack(receipt);
  let output: SpellingIntake;
  let usage = original.usage;
  let latencyMs = original.latencyMs;
  try {
    output = await parse(original.draft);
  } catch (error) {
    const { diagnostic: _invalidDiagnostic, boardDefinition: _invalidBoard, ...captureFields } = original.draft && typeof original.draft === "object"
      ? original.draft as Record<string, unknown>
      : {};
    const captured = spellingIntakeSchema.omit({ diagnostic: true, boardDefinition:true }).safeParse(captureFields);
    const baseResult = spellingIntakeSchema.extend({boardDefinition:intakeBoardSchema.optional()}).safeParse(original.draft);
    const issues = !baseResult.success ? baseResult.error.issues : error instanceof z.ZodError ? error.issues : [];
    const journeyError=Boolean((original.draft as SpellingIntake)?.diagnostic?.action === 'select' && !(original.draft as SpellingIntake)?.boardDefinition) || error instanceof Error && (error.message.startsWith('board_definition_')||error.message.startsWith('board_canvas_invalid')) || issues.some(issue=>issue.path[0]==='boardDefinition');
    if (!captured.success || (!journeyError && (issues.length === 0 || issues.some(issue => issue.path[0] !== "diagnostic")))) throw error;
    let acceptedDiagnostic: SpellingIntake["diagnostic"];
    const diagnostic = spellingDiagnosticDecisionSchema.safeParse(_invalidDiagnostic);
    if (packet.spellingDiagnostics && diagnostic.success) {
      try {
        resolveSpellingDiagnosticSelection({...captured.data, diagnostic:diagnostic.data},packet);
        acceptedDiagnostic=diagnostic.data;
      } catch (diagnosticError) {
        console.log(` 🎮 [spelling-discovery] [diagnostic-correction] [required] ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
      }
    }
    const correctionSchema=acceptedDiagnostic ? z.object({boardDefinition:intakeBoardSchema}).strict() : spellingIntakeCorrectionSchema;
    const repairedFields=(fields:Record<string,unknown>)=>{
      if (acceptedDiagnostic) {
        if (fields.diagnostic!==undefined) {
          const supplied=spellingDiagnosticDecisionSchema.safeParse(fields.diagnostic);
          if (!supplied.success || !isDeepStrictEqual(supplied.data,acceptedDiagnostic)) throw new Error('spelling_intake_correction_changed_diagnostic');
        }
        return {diagnostic:acceptedDiagnostic,boardDefinition:intakeBoardSchema.parse(fields.boardDefinition)};
      }
      return spellingIntakeCorrectionSchema.parse({diagnostic:fields.diagnostic,...(fields.boardDefinition ? {boardDefinition:fields.boardDefinition}:{})});
    };
    const correctionRequest = {
      version: acceptedDiagnostic ? 5 : 4,
      toolSchemaHash:hashDiscoveryContract(spellingIntakeToolJsonSchema(correctionSchema)),
      purpose: "spelling_intake_authoring_correction",
      originalRequestHash: hashDiscoveryContract(packet),
      invalidDiagnostic: (original.draft as { diagnostic?: unknown })?.diagnostic,
      schemaIssues: issues,
      ...(journeyError ? {journeyError:error instanceof Error?error.message:String(error)}:{}),
      boardDefinition:_invalidBoard,
    };
    const correctionPrompt = `${acceptedDiagnostic ? "The diagnostic decision is already valid and frozen. Repair only boardDefinition; return only boardDefinition. Do not return or change diagnostic. Its activityId identifies an activity type, while board portal activityNodeId identifies the local node diagnostic." : "Repair the diagnostic and boardDefinition fields once. Return only diagnostic and boardDefinition."} Do not regenerate assignment capture. For action select, boardDefinition is required. Activity portals bind through activityNodeId, using the local canonical ID diagnostic; activityId is not a portal field. Preserve authored portal IDs, labels, paths, choices, theme and positions unless the named defect requires changing them. Do not remove a board to evade an error. Do not invent evidence, activities or device facts. ${BOARD_AUTHORING_INSTRUCTION}\nCONTRACT ISSUES AND PREVIOUS AUTHORED FIELDS:\n${JSON.stringify(correctionRequest)}\nCAPTURED ASSIGNMENT (read-only):\n${JSON.stringify(captured.data)}`;
    const correctionStarted = Date.now();
    let legacyRepair: Receipt | undefined;
    if (opts.providerReceipt) {
      for (const suffix of ["authoring-correction-v4", "authoring-correction-v3", "journey-contract-correction-v2", "diagnostic-schema-correction-v1"]) {
        const stage = `${opts.providerReceipt.stage}-${suffix}`;
        if (!hasReceivedMathProviderStage(opts.providerReceipt.draftDir, stage)) continue;
        const receipts = path.join(opts.providerReceipt.draftDir,"provider-receipts");
        const {requestHash} = JSON.parse(fs.readFileSync(path.join(receipts,`${stage}.stage.json`),"utf8"));
        const requestFile = path.join(opts.providerReceipt.draftDir,"provider-diagnostics",`${requestHash}.attempt-1.request.json`);
        if (fs.existsSync(requestFile)) {
          if (JSON.parse(fs.readFileSync(requestFile,"utf8")).context?.originalRequestHash !== hashDiscoveryContract(packet)) continue;
        } else {
          const frozenPacketFile = path.join(opts.providerReceipt.draftDir,"spelling-intake-request.json");
          if (!fs.existsSync(frozenPacketFile) || hashDiscoveryContract(JSON.parse(fs.readFileSync(frozenPacketFile,"utf8"))) !== hashDiscoveryContract(packet)) {
            throw new Error(`spelling_legacy_correction_identity_unverifiable:${stage}`);
          }
        }
        const candidate = JSON.parse(fs.readFileSync(path.join(receipts,`${requestHash}.json`),"utf8")).response as Receipt;
        try {
          const proposed = unpack(candidate);
          const fields=proposed.draft as Record<string,unknown>;
          const valid = await parse(fields && !("words" in fields) ? {...captured.data,...repairedFields(fields)} : {...fields,...repairedFields(fields)});
          const {diagnostic:_d,boardDefinition:_b,...source} = valid;
          if(hashDiscoveryContract(source)!==hashDiscoveryContract(captured.data)) continue;
          legacyRepair = candidate;
          console.log(` 🎮 [spelling-discovery] [legacy-correction] [reused] stage=${stage}`);
          break;
        } catch (legacyError) {
          console.warn(` 🎮 [spelling-discovery] [legacy-correction] [invalid] stage=${stage}`,legacyError instanceof Error ? legacyError.message : String(legacyError));
        }
      }
    }
    const corrected = legacyRepair ?? (opts.providerReceipt ? await runMathProviderStage({
      draftDir: opts.providerReceipt.draftDir,
      stage: `${opts.providerReceipt.stage}-authoring-correction-v${acceptedDiagnostic ? 5 : 4}`,
      model,
      request: correctionRequest,
      execute: () => receive(correctionPrompt, correctionStarted, correctionSchema),
    }) : await receive(correctionPrompt, correctionStarted, correctionSchema));
    const repair = unpack(corrected);
    const repaired = repair.draft as Record<string,unknown>;
    if (repaired && "words" in repaired) {
      // Compatibility with saved full-response corrections; they cannot change source facts.
      const legacyCapture = spellingIntakeSchema.omit({diagnostic:true,boardDefinition:true}).parse(
        Object.fromEntries(Object.entries(repaired).filter(([key])=>key!=="diagnostic" && key!=="boardDefinition")));
      if(hashDiscoveryContract(captured.data)!==hashDiscoveryContract(legacyCapture)) throw new Error('spelling_intake_correction_changed_source');
    }
    output = await parse({...captured.data,...repairedFields(repaired)});
    const {diagnostic:_diagnostic,boardDefinition:_board,...repairedCapture}=output;
    if(hashDiscoveryContract(captured.data)!==hashDiscoveryContract(repairedCapture)) throw new Error('spelling_intake_correction_changed_source');
    usage = combinePlannerUsage(original.usage, repair.usage);
    latencyMs += repair.latencyMs;
    console.log(" 🎮 [spelling-discovery] [diagnostic-schema-repair] [validated] attempt=2");
  }
  console.log(` 🎮 [spelling-discovery] [diagnostic-decision] [${output.diagnostic?.action ?? "legacy-fixed-instrument"}]`);
  return { output, telemetry: { model, usage, latencyMs } };
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

/** Post-Discovery spelling only: role and goal, no rules; the model brings the pedagogy. */
export const SPELLING_TUTOR_PERSONA = [
  "You are an expert reading and spelling tutor planning this child's next session.",
  "Your goal: she spells every assigned word correctly on her school test, and enjoys getting there.",
  "Use what you know about how children learn to spell, her profile, and exactly what she wrote.",
].join(" ");

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

const compactActiveSessionPlanSchema = z.object({
  planId: z.string().min(1).optional(),
  nodePlan: z.array(compactNodePlanSchema).min(1).max(12),
  boardDefinition: adventureBoardDefinitionSchema.optional(),
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
          contract.id !== "quest" && contract.id !== "boss" &&
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
    if (node.type === "word-radar" && (node.rounds?.length || typeof node.activityConfig?.teachingFocus === "string")) {
      issues.push({
        code: "word_radar_unrendered_teaching",
        severity: "error",
        message: `Word Radar node ${node.id} contains rounds or teachingFocus that its child-facing screen cannot render; choose an instrument that displays the teaching or remove unsupported content.`,
      });
    }
    if (node.type === "word-radar" && node.wordRadarConfig && capability) {
      const matchesCatalogMode = capability.capabilityModes.some((mode) =>
        Object.entries(mode.config).every(([key, value]) =>
          Object.is(node.wordRadarConfig?.[key as keyof typeof node.wordRadarConfig], value),
        ),
      );
      if (!matchesCatalogMode) {
        issues.push({
          code: "word_radar_capability_mismatch",
          severity: "error",
          message: `Word Radar node ${node.id} response contract does not match a catalog capability mode.`,
        });
      }
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
  if (packet.discoveryEvidence) return []; // Captured words are authoritative after ingestion.
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

const AUTHORED_JOURNEY_INSTRUCTION = `${BOARD_AUTHORING_INSTRUCTION} Return it as activeSessionPlan.boardDefinition. nodePlan is the canonical activity inventory, not its chronology. Checkpoint citations name possible prior interventions; validate exposure order on each path containing both. Do not return learningRoutes or a second rendered adventureBoard.`;

export function buildAssignmentPlannerPrompt(packet: AssignmentPlanningPacket): string {
  if (packet.discoveryEvidence) return `${SPELLING_TUTOR_PERSONA}\nThe packet has her assigned words, her Discovery attempts (childResponse is exactly what she spelled), her profile, and the activities you can use; each activity's label says what it really does. Decide what she needs and design the session: you choose the activities, their order, and how many.\nEverything below only describes how to record your plan and which evidence rules the system enforces; it is not teaching guidance.\nReturn the existing ${ASSIGNMENT_PLANNER_TOOL_NAME} tool object once. Every node needs its own measure-<nodeId> planned measurement and the spelling decision fields. Preserve source words exactly. You choose the number of activities, emphasis, mechanics, and routes; do not fabricate evidence. Existing Quest/Boss gates and earning rules remain unchanged. Do not introduce new reward systems.\n${packet.plannerInstruction}\n${AUTHORED_JOURNEY_INSTRUCTION}\nEvidence-first packet:\n${JSON.stringify({ ...packet, plannerInstruction: undefined })}`;
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
- Every activeSessionPlan.nodePlan entry must have exactly one corresponding plannedMeasurements entry with id "measure-\${node.id}". That measurement must state what would support, revise, or falsify the planner's theory for that exact node.
- Treat childChart.adventureMapProfile as delivery preference and layout intent. It is not today's board.
- Use packet.activityCatalog as the instrument list. Unavailable activities are visible for context but must not appear as launchable academic board nodes.
- Use activityCatalog evidence fields as the instrument truth table; do not treat all modes of one activity as equivalent.
- When no launchable instrument serves a sub-skill, emit a generationRequests entry (targetLane = the generated-baseline node's lane) with mechanicConstraints distinct from every other request.
- Give each generated-baseline node rounds from the captured worksheet problems: id, prompt, 2-3 options, exactly one correct; extend fact families, do not invent unrelated problems.
- Use packet.masteryContext as the clock, deadline, and proof plan. The goal is demonstrated homework mastery by testDate, not merely completing a cute board.
- If one node mixes targets from multiple source groups, omit targetLane or split the node. Never claim targetLane "silent_letters" for a node containing high-frequency targets.
- Every word-radar node must include wordRadarConfig from the activity catalog capability modes. recallMode allows only visible_read, partial_visual_recall, hidden_word_recall. Never emit audio_cued_letter_recall as recallMode; cite capability ids only in rationale. If you choose the catalog's audio_cued_letter_recall capability mode, emit recallMode partial_visual_recall with audio-cued config values. Use partial_visual_recall for new/weak spelling construction, hidden_word_recall only with prior recall evidence, and visible_read for recognition/fluency. Omit wordRadarConfig on non-word-radar nodes.
- Do not emit Quest or Boss nodes, locked or otherwise. They appear only on a later complete board after evidence authorizes them. Never invent targetLane values such as "all_homework", "mixed", or "combined".
- Include parent-review language that explains why every group was routed to its activity.
- In planTheory or reviewQuestions, explain why the journey you chose fits this child today.
- Use the packet as the only source of assignment truth.${revisionInstruction}
${AUTHORED_JOURNEY_INSTRUCTION}
- Return one tool-call object with nodePlan, boardDefinition, plannedMeasurements, planTheory, and reviewQuestions in their schema-defined locations.
- Treat candidateCard child outcomes as factual, uncertain evidence. Academic compatibility is a hard gate; predicted learning value is primary; engagement is secondary; runtime clarity and reliability support the decision; uncertainty may justify bounded exploration; model-call cost and latency are penalties. A rating never overrides learning evidence, and one choice never proves preference.

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
  setSchemaRequired(activeSessionPlan, ["nodePlan", "boardDefinition"]);

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
    }, ...(card.activityId==="mystery" ? {anyOf:[
      {properties:{targets:{type:"array",maxItems:0}}},
      {required:["activityConfig"],properties:{activityConfig:{type:"object",required:["activityId"],properties:{activityId:{enum:[...SPELLING_MYSTERY_INSTRUMENT_IDS]}}}}},
    ]} : {}) }));
  }
  return schema;
}

function assignmentPlannerWordRadarCorrectionSchema(packet: AssignmentPlanningPacket): Record<string, unknown> {
  const schema = assignmentPlannerToolJsonSchema(true, packet.activityCatalog) as JsonSchemaObject;
  const nodes = schemaProperties(schemaProperties(schema).activeSessionPlan).nodePlan.items as JsonSchemaObject;
  const branches = nodes.anyOf as JsonSchemaObject[];
  const radar = branches.find(branch => schemaProperties(branch).activityId?.const === "word-radar");
  const modes = packet.activityCatalog.find(card => card.activityId === "word-radar")?.capabilityModes.map(mode => mode.config) ?? [];
  if (!radar || !modes.length) throw new Error("word_radar_correction_capability_missing");
  schemaProperties(radar).rounds = { type: "array", maxItems: 0 };
  schemaProperties(radar).wordRadarConfig = { enum: modes };
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
  | BoardDefinitionIssue
  | ReturnType<typeof spellingCheckpointLineageIssues>[number]
  | {
    code: "planner_checkpoint_intervention_not_prior";
    measurementId: string;
    interventionNodeIds: string[];
  }
  | {
    code: "planner_unknown_evidence_id";
    measurementId: string;
    evidenceIds: string[];
  }
  | {
    code: "planner_missing_measurement";
    nodeId: string;
    measurementId: string;
  }
  | {
    code: "planner_unknown_spelling_target";
    nodeId: string;
    targets: string[];
  };

class AssignmentPlannerRelationshipInvalidError extends Error {
  readonly toolInput: AssignmentPlannerResponseObject;
  readonly issues: AssignmentPlannerRelationshipIssue[];

  constructor(toolInput: AssignmentPlannerResponseObject, issues: AssignmentPlannerRelationshipIssue[]) {
    super(`assignment_planner_relationship_invalid:issues=${JSON.stringify(issues)}`);
    this.name = "AssignmentPlannerRelationshipInvalidError";
    this.toolInput = toolInput;
    this.issues = issues;
  }
}

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

/** Check cited evidence and checkpoint exposure facts, without changing the authored journey. */
function assignmentPlannerRelationshipIssues(
  toolInput: unknown,
  allowedEvidenceIds: ReadonlySet<string>,
  requireSpellingMeasurements = false,
  allowedSpellingTargets: ReadonlySet<string> = new Set(),
): AssignmentPlannerRelationshipIssue[] {
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
  for(const id of gatedNodeIds) issues.push({code:'planner_encounter_not_authorized',id,message:'Opening Teaching boards cannot authorize Quest or Boss. Preserve the remaining journey and request these through the existing evidence-based successor decision.'});
  const definition = adventureBoardDefinitionSchema.safeParse(activeSessionPlan?.boardDefinition);
  if (!definition.success) issues.push({code:'board_definition_missing_or_invalid',message:JSON.stringify(definition.error.issues)});
  else issues.push(...validateBoardDefinition(definition.data,[...nodeOrder.keys()]));
  let pathOrders: Map<string,number>[] = [];
  if (definition.success && !issues.length) pathOrders = journeyExecutions(definition.data).map(path => new Map(path.activityNodeIds.map((id,index) => [id,index])));
  if (requireSpellingMeasurements) {
    const measurementById = new Map(rawMeasurements.flatMap((rawMeasurement) => {
      const measurement = jsonObject(rawMeasurement);
      return typeof measurement?.id === "string" ? [[measurement.id, measurement] as const] : [];
    }));
    for (const nodeId of nodeOrder.keys()) {
      if (gatedNodeIds.has(nodeId)) continue;
      const node = jsonObject(rawNodes[nodeOrder.get(nodeId)!]);
      const targets = Array.isArray(node?.targets)
        ? node.targets.filter((target): target is string => typeof target === "string")
        : [];
      const unknownTargets = targets.filter(
        target => !allowedSpellingTargets.has(target.trim().toLocaleLowerCase("en-US")),
      );
      if (unknownTargets.length) {
        issues.push({ code: "planner_unknown_spelling_target", nodeId, targets: unknownTargets });
      }
      const measurementId = `measure-${nodeId}`;
      const mystery=node?.type==="mystery" || node?.activityId==="mystery";
      const rewardShell=mystery && spellingImplementationType({type:typeof node?.type==="string"?node.type:"mystery",activityConfig:node?.activityConfig})==="mystery";
      if(rewardShell && targets.length)issues.push({code:"planner_mystery_academic_instrument_missing",id:nodeId,message:"Plain Mystery Reward has no spelling instrument: use targets:[] with reward/engagement evidence, or author a supported academic activityConfig. Preserve its portal and journey."});
      if(rewardShell && !targets.length)continue;
      if (!jsonObject(measurementById.get(measurementId)?.spelling)) {
        issues.push({ code: "planner_missing_measurement", nodeId, measurementId });
      }
    }
  }
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
    if (spelling.role === "fresh_checkpoint" && pathOrders.length && !checkpointInterventionsArePrior(pathOrders,nodeId,interventionNodeIds)) {
      issues.push({ code: "planner_checkpoint_intervention_not_prior", measurementId, interventionNodeIds });
    }
  }
  if (requireSpellingMeasurements) {
    const nodes = rawNodes.map(jsonObject).filter((node): node is Record<string, unknown> => !!node)
      .filter(node => typeof node.id === "string" && typeof node.type === "string" && Array.isArray(node.targets))
      .map(node => ({ id: node.id as string, type: node.type as string, targets: (node.targets as unknown[]).filter((target): target is string => typeof target === "string") }));
    const measurements = rawMeasurements.map(jsonObject).filter((row): row is Record<string, unknown> => !!row)
      .flatMap(row => { const spelling = jsonObject(row.spelling); return typeof row.id === "string" && spelling && Array.isArray(spelling.interventionNodeIds)
        ? [{ id: row.id, spelling: { role: String(spelling.role), interventionNodeIds: spelling.interventionNodeIds.filter((id): id is string => typeof id === "string") } }] : []; });
    if (definition.success && pathOrders.length) issues.push(...spellingCheckpointLineageIssues(nodes, measurements, definition.data));
  }
  return issues;
}

export function validateAssignmentPlannerRelationships(
  draft: AssignmentPlannerResponseObject,
  allowedEvidenceIds: ReadonlySet<string>,
  requireSpellingMeasurements = false,
  allowedSpellingTargets: ReadonlySet<string> = new Set(),
): AssignmentPlannerResponseObject {
  const issues = assignmentPlannerRelationshipIssues(
    draft,
    allowedEvidenceIds,
    requireSpellingMeasurements,
    allowedSpellingTargets,
  );
  if (issues.length) throw new AssignmentPlannerRelationshipInvalidError(draft, issues);
  return draft;
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

export function parseAssignmentPlannerToolUseResponse(
  response: Pick<Anthropic.Messages.Message, "content"> & { stop_reason?: string | null },
): AssignmentPlannerResponseObject {
  assertPlannerResponseComplete(response);
  const toolUse = response.content.find((block) =>
    block.type === "tool_use" &&
    "name" in block &&
    block.name === ASSIGNMENT_PLANNER_TOOL_NAME,
  );
  if (!toolUse || !("input" in toolUse)) {
    throw new Error(`assignment_planner_tool_missing:${ASSIGNMENT_PLANNER_TOOL_NAME}`);
  }
  try {
    return assignmentPlannerDraftSchema.parse(toolUse.input);
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
  return assignmentPlannerDraftSchema.parse(parsed);
}

type MeasurementCorrectionField = { path: string; index: number; key: "evidenceIds" | "interventionNodeIds" | "spelling" };
function measurementCorrectionFields(input: unknown, schemaIssues: z.core.$ZodIssue[], relationshipIssues: AssignmentPlannerRelationshipIssue[]): MeasurementCorrectionField[] | undefined {
  const raw=jsonObject(input), measurements=raw?.plannedMeasurements;
  const nodes=jsonObject(raw?.activeSessionPlan)?.nodePlan;
  if (!Array.isArray(measurements) || !Array.isArray(nodes)) return;
  const fields=new Map<string,MeasurementCorrectionField>();
  const add=(index:number,key:"evidenceIds"|"interventionNodeIds"|"spelling")=>{
    const measurement=jsonObject(measurements[index]);
    if (!measurement || typeof measurement.id!=="string") return false;
    const node=nodes.map(jsonObject).find(node=>node?.id===measurement.id!.toString().replace(/^measure-/,""));
    const reward=node?.type==="mystery" && Array.isArray(node.targets) && !node.targets.length && spellingImplementationType(node as {type:string;activityConfig?:unknown})==="mystery";
    const field:MeasurementCorrectionField={index,key:reward?"spelling":key,path:`plannedMeasurements.${index}.spelling${reward?"":`.${key}`}`};
    fields.set(field.path,field);return true;
  };
  for (const issue of schemaIssues) {
    const p=issue.path;
    if (p[0]!=="plannedMeasurements" || typeof p[1]!=="number" || p[2]!=="spelling") return;
    const measurement=jsonObject(measurements[p[1]]);
    const node=nodes.map(jsonObject).find(node=>node?.id===String(measurement?.id).replace(/^measure-/,""));
    const reward=node?.type==="mystery" && Array.isArray(node.targets) && !node.targets.length && spellingImplementationType(node as {type:string;activityConfig?:unknown})==="mystery";
    if (reward) {if(!add(p[1],"spelling")) return;continue;}
    if ((p.length!==4 && p.length!==5) || (p[3]!=="evidenceIds" && p[3]!=="interventionNodeIds")) return;
    if (!add(p[1],p[3])) return;
  }
  for (const issue of relationshipIssues) {
    const key=issue.code==="planner_unknown_evidence_id" ? "evidenceIds"
      : issue.code==="planner_checkpoint_lineage_missing" ? "interventionNodeIds" : undefined;
    if (!key || !("measurementId" in issue)) return;
    const index=measurements.findIndex(row=>jsonObject(row)?.id===issue.measurementId);
    if (!add(index,key)) return;
  }
  return fields.size ? [...fields.values()] : undefined;
}
function applyMeasurementCorrection(original:unknown, reply:unknown, fields:MeasurementCorrectionField[]):unknown {
  const input=jsonObject(reply), base=structuredClone(original) as {plannedMeasurements:Array<{spelling?:Record<string,unknown>}>};
  if (!input) throw new Error("planner_measurement_patch_invalid");
  if (!("corrections" in input)) {
    // Read-only compatibility: old full receipts may change only these invalid fields.
    const protectedReply=structuredClone(reply) as typeof base;
    for (const field of fields) {
      const proposed=protectedReply.plannedMeasurements?.[field.index], prior=base.plannedMeasurements[field.index];
      if (!proposed) throw new Error("planner_measurement_correction_changed_protected_fields");
      if (field.key==="spelling") delete proposed.spelling;
      else if (proposed.spelling) delete proposed.spelling[field.key];
      if (field.key==="spelling") delete prior.spelling;
      else if (prior.spelling) delete prior.spelling[field.key];
    }
    // Compact parsing already ignores hydrated-only active-plan fields. Compare that
    // same wire contract, including its config defaults, when reading old receipts.
    const normalize=(value:unknown)=>{
      const wire=JSON.parse(JSON.stringify(value));
      wire.activeSessionPlan=compactActiveSessionPlanSchema.parse(wire.activeSessionPlan);
      return wire;
    };
    if (!isDeepStrictEqual(normalize(base),normalize(protectedReply))) throw new Error("planner_measurement_correction_changed_protected_fields");
    return reply;
  }
  if (Object.keys(input).some(key=>key!=="corrections") || !Array.isArray(input.corrections) || !input.corrections.length || input.corrections.length>fields.length) throw new Error("planner_measurement_patch_invalid");
  const seen=new Set<string>();
  for (const entry of input.corrections) {
    const patch=jsonObject(entry), field=fields.find(field=>field.path===patch?.path);
    if (!patch || Object.keys(patch).some(key=>key!=="path" && key!=="value") || !field || seen.has(field.path)) throw new Error("planner_measurement_patch_invalid");
    seen.add(field.path);
    const measurement=base.plannedMeasurements[field.index];
    if (field.key==="spelling") {
      if (patch.value!==null) throw new Error("planner_measurement_patch_invalid");
      delete measurement.spelling;
    } else {
      if (!Array.isArray(patch.value) || patch.value.some(value=>typeof value!=="string") || !measurement.spelling) throw new Error("planner_measurement_patch_invalid");
      measurement.spelling[field.key]=patch.value;
    }
  }
  return base;
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
  const allowedEvidenceIds = assignmentPlannerAllowedEvidenceIds(packet);
  const allowedEvidenceIdSet = new Set(allowedEvidenceIds);
  const requireSpellingMeasurements = packet.capturedHomework.contentProfile.practiceDomain === "spelling";
  const allowedSpellingTargets = new Set(
    packet.capturedHomework.words.map(word => word.trim().toLocaleLowerCase("en-US")),
  );
  try {
    const draft = parseAssignmentPlannerToolUseResponse(received.message);
    return { draft: validateAssignmentPlannerRelationships(draft, allowedEvidenceIdSet, requireSpellingMeasurements, allowedSpellingTargets), usage: originalUsage,
      telemetry: { model: received.model, usage: originalUsage, latencyMs: received.latencyMs }, receivedAt: received.createdAt };
  } catch (error) {
    if ((!providerReceipt)
      || (!(error instanceof AssignmentPlannerToolInvalidError) && !(error instanceof AssignmentPlannerRelationshipInvalidError))) throw error;
    const schemaIssues = error instanceof AssignmentPlannerToolInvalidError ? error.issues : [];
    const relationshipIssues = error instanceof AssignmentPlannerRelationshipInvalidError
      ? error.issues
      : assignmentPlannerRelationshipIssues(error.toolInput, allowedEvidenceIdSet, requireSpellingMeasurements, allowedSpellingTargets);
    let patchFields=requireSpellingMeasurements && packet.discoveryEvidence ? measurementCorrectionFields(error.toolInput,schemaIssues,relationshipIssues) : undefined;
    if (patchFields) {
      let current:unknown=error.toolInput, failure:Error=error, latencyMs=received.latencyMs, receivedAt=received.createdAt;
      let usage:LanguageModelUsage|undefined=originalUsage;
      let defects={schemaIssues,relationshipIssues};
      const validate=(value:unknown)=>validateAssignmentPlannerRelationships(assignmentPlannerDraftSchema.parse(value),allowedEvidenceIdSet,true,allowedSpellingTargets);
      const diagnose=(nextError:unknown)=>{
        if (!(nextError instanceof z.ZodError) && !(nextError instanceof AssignmentPlannerRelationshipInvalidError)) throw nextError;
        failure=nextError instanceof z.ZodError ? new AssignmentPlannerToolInvalidError(current,nextError.issues) : nextError;
        const schemas=nextError instanceof z.ZodError?nextError.issues:[];
        const relationships=nextError instanceof AssignmentPlannerRelationshipInvalidError?nextError.issues:assignmentPlannerRelationshipIssues(current,allowedEvidenceIdSet,true,allowedSpellingTargets);
        defects={schemaIssues:schemas,relationshipIssues:relationships};
        patchFields=measurementCorrectionFields(current,schemas,relationships);
        if (!patchFields) {
          console.log(` 🎮 [assignment-planner] [measurement-field-correction] [scope-exhausted] defects=${JSON.stringify(defects)}`);
          throw failure;
        }
      };
      // Saved full corrections are adapters only: accept their named field edits,
      // never a rewritten journey, and never replace an uncertain provider outcome.
      for (const suffix of ["tool-correction-v3-1","tool-correction-v3-3-schema","tool-correction-v3-2-missing-measurement","tool-correction-v4-2-lineage","measurement-field-correction-v6-1","measurement-field-correction-v6-2","measurement-field-correction-v7-1","measurement-field-correction-v7-2"]) {
        const stage=`${providerReceipt.stage}-${suffix}`, directory=path.join(providerReceipt.draftDir,"provider-receipts"), file=path.join(directory,`${stage}.stage.json`);
        if (!fs.existsSync(file)) continue;
        const {requestHash}=JSON.parse(fs.readFileSync(file,"utf8"));
        if (!/^[a-f0-9]{64}$/.test(requestHash)) throw new Error(`provider_receipt_invalid:${stage}`);
        const saved=JSON.parse(fs.readFileSync(path.join(directory,`${requestHash}.json`),"utf8"));
        if (["in_flight","outcome_uncertain"].includes(saved.status)) throw new Error(`provider_outcome_uncertain:${stage}`);
        if (!hasReceivedMathProviderStage(providerReceipt.draftDir,stage)) continue;
        const diagnostic=path.join(providerReceipt.draftDir,"provider-diagnostics",`${requestHash}.attempt-${saved.attempts?.length??1}.request.json`);
        const frozen=path.join(providerReceipt.draftDir,"spelling-targeted-request.json");
        const identity=fs.existsSync(diagnostic) ? JSON.parse(fs.readFileSync(diagnostic,"utf8")).context?.originalRequestHash : fs.existsSync(frozen) ? hashDiscoveryContract(JSON.parse(fs.readFileSync(frozen,"utf8"))) : undefined;
        if (identity!==hashDiscoveryContract(packet)) throw new Error(`planner_legacy_measurement_identity_unverifiable:${stage}`);
        const legacy=saved.response as AssignmentPlannerReceipt;
        if (!("message" in legacy)) continue;
        assertPlannerResponseComplete(legacy.message);
        const tool=legacy.message.content.find(block=>block.type==="tool_use" && block.name===ASSIGNMENT_PLANNER_TOOL_NAME);
        if (!tool || !("input" in tool)) throw new Error("planner_measurement_patch_missing");
        try {current=applyMeasurementCorrection(current,tool.input,patchFields);} catch (legacyError) {
          if (!(legacyError instanceof Error) || !["planner_measurement_correction_changed_protected_fields","planner_measurement_patch_invalid"].includes(legacyError.message)) throw legacyError;
          console.log(` 🎮 [assignment-planner] [legacy-measurement-correction] [rejected] stage=${stage} reason=protected_fields_changed`);continue;
        }
        console.log(` 🎮 [assignment-planner] [legacy-measurement-correction] [reused] stage=${stage}`);
        usage=combinePlannerUsage(usage,usageFromAnthropic(legacy.message));latencyMs+=legacy.latencyMs;receivedAt=legacy.createdAt;
        try {return {draft:validate(current),usage,telemetry:{model,usage,latencyMs},receivedAt};} catch (nextError) {diagnose(nextError);}
      }
      for (let attempt=1;attempt<=2;attempt++) {
        const fields=patchFields;
        const schema={type:"object",additionalProperties:false,properties:{corrections:{type:"array",minItems:1,items:{anyOf:fields.map(field=>({type:"object",additionalProperties:false,properties:{path:{const:field.path},value:field.key==="spelling"?{type:"null"}:{type:"array",items:{type:"string"}}},required:["path","value"]}))}}},required:["corrections"]};
        const raw=jsonObject(current)!;
        const stage=`${providerReceipt.stage}-measurement-field-correction-v8-${attempt}`;
        const correctionStarted=Date.now();
        const correction=await runMathProviderStage({draftDir:providerReceipt.draftDir,stage,model,
          request:{version:7,attempt,strict:true,purpose:"assignment_planner_measurement_field_correction",originalRequestHash:hashDiscoveryContract(packet),invalidToolInput:current,fields,schemaHash:hashDiscoveryContract(schema),defects,allowedEvidenceIds},
          beforeRequest:()=>{if(!process.env.ANTHROPIC_API_KEY)throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");},
          execute:async()=>({message:await requestAssignmentPlannerTool({model,schema,measurementOnly:true,prompt:`Correct only the named measurement fields. Return corrections [{path,value}], not a complete plan. Every other field is immutable. A nonacademic Mystery reward has no spelling measurement: use value:null for its spelling field without removing its activity. Evidence IDs must come from the supplied observations. Checkpoints cite prior exposures for their target words on each executable path. Preserve already-valid checkpoint references. Do not emit Quest or Boss nodes, locked or otherwise. This is correction ${attempt} of 2.\nDEFECT: ${JSON.stringify(defects)}\nEDITABLE FIELDS: ${JSON.stringify(fields)}\nCURRENT MEASUREMENTS: ${JSON.stringify(raw.plannedMeasurements)}\nAVAILABLE EVIDENCE IDS: ${JSON.stringify(allowedEvidenceIds)}\nREAD-ONLY ACTIVITY INVENTORY: ${JSON.stringify((jsonObject(raw.activeSessionPlan)?.nodePlan as unknown[]).map(node=>{const n=jsonObject(node)!;return {id:n.id,type:n.type,targets:n.targets};}))}\nREAD-ONLY PATHS: ${JSON.stringify(jsonObject(raw.activeSessionPlan)?.boardDefinition)}`}),model,latencyMs:Date.now()-correctionStarted,createdAt:new Date().toISOString()})});
        console.log(` 🎮 [assignment-planner] [measurement-field-correction] [received] id=${correction.message.id} attempt=${attempt}`);
        assertPlannerResponseComplete(correction.message);
        const tool=correction.message.content.find(block=>block.type==="tool_use" && block.name===ASSIGNMENT_PLANNER_TOOL_NAME);
        if (!tool || !("input" in tool)) throw new Error("planner_measurement_patch_missing");
        current=applyMeasurementCorrection(current,tool.input,fields);
        usage=combinePlannerUsage(usage,usageFromAnthropic(correction.message));latencyMs+=correction.latencyMs;receivedAt=correction.createdAt;
        try {
          const draft=validate(current);
          return {draft,usage,telemetry:{model,usage,latencyMs},receivedAt};
        } catch (nextError) {
          diagnose(nextError);
          if (attempt===2) throw failure;
        }
      }
      throw failure;
    }
    const correctionRequest = {
      version: 3,
      purpose: "assignment_planner_tool_correction",
      originalRequestHash: hashDiscoveryContract(packet),
      invalidToolInput: error.toolInput,
      schemaIssues,
      // Preserve v3 receipt identity for existing schema/relationship corrections.
      // New exposure violations are checked again and use the bounded v4 follow-up.
      relationshipIssues: schemaIssues.length > 0 || relationshipIssues.some(issue => issue.code !== "planner_checkpoint_lineage_missing" && issue.code !== "planner_final_checkpoint_missing")
        ? relationshipIssues.filter(issue => issue.code !== "planner_checkpoint_lineage_missing" && issue.code !== "planner_final_checkpoint_missing")
        : relationshipIssues,
      allowedEvidenceIds,
      allowedSpellingTargets: [...allowedSpellingTargets].sort(),
    };
    const correctionPrompt = `Your previous ${ASSIGNMENT_PLANNER_TOOL_NAME} input failed its declared tool contract. Reissue the complete tool input once. Preserve every valid academic, design, node, activity, target, prediction, and evidence choice. Correct only the listed schema and relationship violations. Every node target must come from ALLOWED SPELLING TARGETS; a reward or break is not an academic target. Every spelling.evidenceIds value must come from ALLOWED EVIDENCE IDS; remove unknown IDs and never invent evidence, child facts, or new activities. A fresh_checkpoint may cite only targeted intervention nodes that occur before it on each executable path reaching that checkpoint; nodePlan inventory order is not journey order. A final fresh checkpoint must cover the assigned words and all prior pending interventions. Do not emit Quest or Boss nodes, locked or otherwise. Remove unauthorized encounters and their portal/path references while preserving the remaining authored journey. Those encounters belong to an evidence-authorized successor board, not this opening Teaching board.\nSCHEMA ISSUES:\n${JSON.stringify(schemaIssues)}\nRELATIONSHIP ISSUES:\n${JSON.stringify(relationshipIssues)}\nALLOWED SPELLING TARGETS:\n${JSON.stringify([...allowedSpellingTargets].sort())}\nALLOWED EVIDENCE IDS:\n${JSON.stringify(allowedEvidenceIds)}\nPREVIOUS TOOL INPUT:\n${JSON.stringify(error.toolInput)}`;
    const correctionStarted = Date.now();
    const correctionStage = relationshipIssues.some((issue) => issue.code === "planner_missing_measurement")
      ? `${providerReceipt.stage}-tool-correction-v3-2-missing-measurement`
      : `${providerReceipt.stage}-tool-correction-v3-1`;
    let frozenCorrectionRequest: unknown = correctionRequest;
    if (requireSpellingMeasurements && hasReceivedMathProviderStage(providerReceipt.draftDir, correctionStage)) {
      // Re-read paid authoring under its original request, never relabel it as a
      // new correction just because local validation issues changed after a fix.
      const directory = path.join(providerReceipt.draftDir, "provider-receipts");
      const { requestHash } = JSON.parse(fs.readFileSync(path.join(directory, `${correctionStage}.stage.json`), "utf8"));
      const saved = JSON.parse(fs.readFileSync(path.join(directory, `${requestHash}.json`), "utf8"));
      const diagnostic = path.join(providerReceipt.draftDir, "provider-diagnostics", `${requestHash}.attempt-${saved.attempts?.length ?? 1}.request.json`);
      const context = fs.existsSync(diagnostic) ? JSON.parse(fs.readFileSync(diagnostic, "utf8")).context : undefined;
      if (context?.purpose !== correctionRequest.purpose || context.originalRequestHash !== correctionRequest.originalRequestHash
        || !isDeepStrictEqual(context.invalidToolInput, correctionRequest.invalidToolInput)
        || hashDiscoveryContract({ provider: saved.provider ?? "anthropic", request: context }) !== requestHash) {
        throw new Error(`planner_saved_correction_identity_unverifiable:${correctionStage}`);
      }
      frozenCorrectionRequest = context;
      console.log(` 🎮 [assignment-planner] [saved-correction] [revalidating] stage=${correctionStage} request=${requestHash}`);
    }
    const correction = await runMathProviderStage({
      draftDir: providerReceipt.draftDir,
      stage: correctionStage,
      model,
      request: frozenCorrectionRequest,
      beforeRequest: () => {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
      },
      execute: async () => ({
        message: await requestAssignmentPlannerTool({
          prompt: correctionPrompt,
          model,
          schema: assignmentPlannerToolJsonSchema(Boolean(packet.discoveryEvidence), packet.activityCatalog),
        }),
        model,
        latencyMs: Date.now() - correctionStarted,
        createdAt: new Date().toISOString(),
      }),
    });
    console.log(` 🎮 [assignment-planner] [tool-correction] [received] id=${correction.message.id}`);
    const correctionUsage = usageFromAnthropic(correction.message);
    let combinedUsage = combinePlannerUsage(originalUsage, correctionUsage);
    let correctedDraft: AssignmentPlannerResponseObject;
    let validatedDraft: AssignmentPlannerResponseObject;
    let finalReceivedAt = correction.createdAt;
    let totalLatencyMs = received.latencyMs + correction.latencyMs;
    try {
      correctedDraft = parseAssignmentPlannerToolUseResponse(correction.message);
    } catch (correctionParseError) {
      if (!(correctionParseError instanceof AssignmentPlannerToolInvalidError)) throw correctionParseError;
      const schemaCorrectionRequest = {
        version: 5,
        purpose: "assignment_planner_schema_correction",
        originalRequestHash: hashDiscoveryContract(packet),
        invalidToolInput: correctionParseError.toolInput,
        schemaIssues: correctionParseError.issues,
        allowedEvidenceIds,
        allowedSpellingTargets: [...allowedSpellingTargets].sort(),
      };
      const schemaCorrectionPrompt = `Your corrected ${ASSIGNMENT_PLANNER_TOOL_NAME} input still failed its declared schema. Reissue the complete tool input once. Preserve every valid node, activity, target, route, prediction, measurement, and evidence choice. Correct only the listed schema violations. Every spelling.evidenceIds array must contain one or more IDs from ALLOWED EVIDENCE IDS. Do not add, remove, reorder, or redesign nodes. This is the final bounded correction request; return one complete valid tool input.\nSCHEMA ISSUES:\n${JSON.stringify(correctionParseError.issues)}\nALLOWED SPELLING TARGETS:\n${JSON.stringify([...allowedSpellingTargets].sort())}\nALLOWED EVIDENCE IDS:\n${JSON.stringify(allowedEvidenceIds)}\nPREVIOUS CORRECTED TOOL INPUT:\n${JSON.stringify(correctionParseError.toolInput)}`;
      const schemaCorrectionStarted = Date.now();
      const schemaCorrection = await runMathProviderStage({
        draftDir: providerReceipt.draftDir,
        stage: `${providerReceipt.stage}-tool-correction-v3-3-schema`,
        model,
        request: schemaCorrectionRequest,
        beforeRequest: () => {
          if (!process.env.ANTHROPIC_API_KEY) throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
        },
        execute: async () => ({
          message: await requestAssignmentPlannerTool({
            prompt: schemaCorrectionPrompt,
            model,
            schema: assignmentPlannerToolJsonSchema(Boolean(packet.discoveryEvidence), packet.activityCatalog),
          }),
          model,
          latencyMs: Date.now() - schemaCorrectionStarted,
          createdAt: new Date().toISOString(),
        }),
      });
      console.log(` 🎮 [assignment-planner] [schema-correction] [received] id=${schemaCorrection.message.id}`);
      correctedDraft = parseAssignmentPlannerToolUseResponse(schemaCorrection.message);
      combinedUsage = combinePlannerUsage(combinedUsage, usageFromAnthropic(schemaCorrection.message));
      totalLatencyMs += schemaCorrection.latencyMs;
      finalReceivedAt = schemaCorrection.createdAt;
    }
    try {
      validatedDraft = validateAssignmentPlannerRelationships(correctedDraft, allowedEvidenceIdSet, requireSpellingMeasurements, allowedSpellingTargets);
    } catch (correctionError) {
      const missingOnly = correctionError instanceof AssignmentPlannerRelationshipInvalidError
        && correctionError.issues.length > 0
        && correctionError.issues.every((issue) => issue.code === "planner_missing_measurement" || issue.code === "planner_checkpoint_lineage_missing" || issue.code === "planner_final_checkpoint_missing");
      if (!missingOnly || correctionStage.endsWith("v3-2-missing-measurement")) throw correctionError;
      const lineageCorrection = correctionError.issues.some(issue => issue.code === "planner_checkpoint_lineage_missing" || issue.code === "planner_final_checkpoint_missing");
      const measurementRequest = {
        version: 4,
        purpose: "assignment_planner_missing_measurement_correction",
        originalRequestHash: hashDiscoveryContract(packet),
        invalidToolInput: correctionError.toolInput,
        relationshipIssues: correctionError.issues,
        allowedEvidenceIds,
      };
      const measurementPrompt = `Your corrected ${ASSIGNMENT_PLANNER_TOOL_NAME} input still omitted required node measurements. Reissue the complete tool input once. Preserve every node, activity, target, route, prediction, and valid measurement exactly. Add the listed missing plannedMeasurements entries or missing checkpoint intervention references. Checkpoints must reference all listed prior exposures, including playful spelling practice. Each id must equal measure-<node id>; spelling.evidenceIds must come from ALLOWED EVIDENCE IDS. Do not add, remove, reorder, or redesign nodes.\nMISSING MEASUREMENTS:\n${JSON.stringify(correctionError.issues)}\nALLOWED EVIDENCE IDS:\n${JSON.stringify(allowedEvidenceIds)}\nPREVIOUS CORRECTED TOOL INPUT:\n${JSON.stringify(correctionError.toolInput)}`;
      const measurementStarted = Date.now();
      const measurementCorrection = await runMathProviderStage({
        draftDir: providerReceipt.draftDir,
        stage: `${providerReceipt.stage}-${lineageCorrection ? "tool-correction-v4-2-lineage" : "tool-correction-v3-2-missing-measurement"}`,
        model,
        request: measurementRequest,
        beforeRequest: () => {
          if (!process.env.ANTHROPIC_API_KEY) throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
        },
        execute: async () => ({
          message: await requestAssignmentPlannerTool({
            prompt: measurementPrompt,
            model,
            schema: assignmentPlannerToolJsonSchema(Boolean(packet.discoveryEvidence), packet.activityCatalog),
          }),
          model,
          latencyMs: Date.now() - measurementStarted,
          createdAt: new Date().toISOString(),
        }),
      });
      console.log(` 🎮 [assignment-planner] [measurement-correction] [received] id=${measurementCorrection.message.id}`);
      validatedDraft = validateAssignmentPlannerRelationships(
        parseAssignmentPlannerToolUseResponse(measurementCorrection.message),
        allowedEvidenceIdSet,
        requireSpellingMeasurements,
        allowedSpellingTargets,
      );
      combinedUsage = combinePlannerUsage(combinedUsage, usageFromAnthropic(measurementCorrection.message));
      totalLatencyMs += measurementCorrection.latencyMs;
      finalReceivedAt = measurementCorrection.createdAt;
    }
    return {
      draft: validatedDraft,
      usage: combinedUsage,
      telemetry: {
        model: correction.model,
        usage: combinedUsage,
        latencyMs: totalLatencyMs,
      },
      receivedAt: finalReceivedAt,
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
  geometryOnly?: boolean;
  repairBackground?: boolean;
  measurementOnly?: boolean;
};

async function requestAssignmentPlannerTool(args: AssignmentPlannerToolRequest): Promise<Anthropic.Messages.Message> {
  const client = new Anthropic({ maxRetries: 0 });
  const timeoutMs = Math.max(10_000, Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 300_000));
  const request: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: args.model,
    max_tokens: Math.max(8_000, Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? ASSIGNMENT_PLANNER_MAX_TOKENS)),
    system: `${ASSIGNMENT_PLANNER_PERSONA}\nCall ${ASSIGNMENT_PLANNER_TOOL_NAME} exactly once to submit ${args.geometryOnly ? (args.repairBackground ? "only portal positions, edge control points and the diagnosed invalid CSS background" : "only portal positions and edge control points") : args.measurementOnly ? "only named measurement field corrections" : "the complete plan"} matching its schema.`,
    tools: [{
      name: ASSIGNMENT_PLANNER_TOOL_NAME,
      ...(args.measurementOnly ? {strict:true} : {}),
      description: args.measurementOnly ? "Correct only the declared measurement field paths. Return corrections [{path,value}], no plan or protected fields." : args.geometryOnly ? `Correct only the declared portals positions and edges control points.${args.repairBackground ? " Also repair the diagnosed invalid CSS background; palette is frozen." : " Theme is frozen."} Return no activity, configuration, evidence, path or choice fields.` : "Write Sunny's captured homework interpretation, active intervention node plan, measurements, and mastery theory. Populate every tool field directly as its declared object or array type. Never serialize the plan or any tool field into a JSON string.",
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
  };
  return requestPlannerMessage(client, request, { timeout: timeoutMs, onRequest: recordProviderRequestDetails });
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
  const enrichedActiveSessionPlan = draft.activeSessionPlan;
  const plannedMeasurements = draft.plannedMeasurements;
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

/** A visual-only correction cannot rewrite the accepted learning journey. */
function canvasPatchSchema(draft:unknown,repairBackground=false) {
  const board=adventureBoardDefinitionSchema.parse((draft as AssignmentPlannerResponseObject).activeSessionPlan.boardDefinition);
  const portals=adventureBoardDefinitionSchema.shape.portals.element.pick({id:true,position:true}).extend({id:z.enum(board.portals.map(p=>p.id) as [string,...string[]])});
  const edges=board.edges.length ? adventureBoardDefinitionSchema.shape.edges.element.pick({id:true,controlPoints:true}).extend({id:z.enum(board.edges.map(e=>e.id) as [string,...string[]])}) : z.never();
  return z.object({portals:z.array(portals).length(board.portals.length),edges:z.array(edges).length(board.edges.length),...(repairBackground?{background:adventureBoardDefinitionSchema.shape.theme.shape.background.extend({type:z.enum(['solid','gradient'])})}: {})}).strict();
}
export function assignmentPlannerCanvasCorrectionSchema(draft:unknown,repairBackground=false):Record<string,unknown> {
  return z.toJSONSchema(canvasPatchSchema(draft,repairBackground),{io:"input"});
}
export function applyAssignmentPlannerCanvasCorrection<T>(original:T,raw:unknown,repairBackground=false):T {
  const parsed=canvasPatchSchema(original,repairBackground).safeParse(raw);
  if(!parsed.success || new Set(parsed.data.portals.map(p=>p.id)).size!==parsed.data.portals.length || new Set(parsed.data.edges.map(e=>e.id)).size!==parsed.data.edges.length)throw new Error("canvas_correction_invalid");
  const copy=structuredClone(original) as T & AssignmentPlannerResponseObject;
  const board=copy.activeSessionPlan.boardDefinition!;
  if(repairBackground && 'background' in parsed.data)board.theme.background=parsed.data.background as AdventureBoardDefinition['theme']['background'];
  for(const portal of board.portals)portal.position=parsed.data.portals.find(p=>p.id===portal.id)!.position;
  for(const edge of board.edges)edge.controlPoints=parsed.data.edges.find(e=>e.id===edge.id)!.controlPoints;
  return copy;
}
function canvasNeedsBackgroundRepair(issues:AssignmentPlanValidationIssue[]):boolean {
  return issues.some(issue=>issue.code==='board_canvas_invalid' && issue.message.includes('background_css_invalid'));
}
function canvasCorrectionPrompt(draft:AssignmentPlannerResponseObject,issues:AssignmentPlanValidationIssue[]):string {
  return `Repair only the cited layout defects. Return {portals:[{id,position:{landscape:{x,y},portrait:{x,y}}}],edges:[{id,controlPoints?:{landscape:[],portrait:[]}}]} for every declared portal/edge identity exactly once. ${canvasNeedsBackgroundRepair(issues)?'Also return background:{type,value} to repair the diagnosed invalid CSS only. Use executable CSS, never a symbolic name. Palette remains immutable.':'No background or theme fields.'} No plan, activities, configurations, labels, paths, choices or evidence fields. Those are already accepted and immutable. Positions are normalized to the safe composition area, not the whole viewport. Arrange the portrait independently; if controls cannot fit vertically, use horizontal separation rather than overlapping them. Preserve readable journey direction and meaningful forks. ${BOARD_CANVAS_AUTHORING_CONSTRAINTS}\nLAYOUT ERRORS:\n${JSON.stringify(issues)}\nACCEPTED JOURNEY REFERENCE:\n${JSON.stringify(draft.activeSessionPlan.boardDefinition)}`;
}
function parseCanvasCorrection(original:AssignmentPlannerResponseObject,response:Anthropic.Messages.Message,repairBackground=false):AssignmentPlannerResponseObject {
  assertPlannerResponseComplete(response);
  const tool=response.content.find(block=>block.type==="tool_use" && block.name===ASSIGNMENT_PLANNER_TOOL_NAME);
  if(!tool || !("input" in tool))throw new Error("canvas_correction_invalid");
  // Read existing full-plan receipts only after proving every protected field stayed identical.
  if(tool.input && typeof tool.input==="object" && "activeSessionPlan" in tool.input) {
    const legacy=parseAssignmentPlannerToolUseResponse(response);assertAssignmentPlannerCanvasCorrection(original,legacy,repairBackground);return legacy;
  }
  return applyAssignmentPlannerCanvasCorrection(original,tool.input,repairBackground);
}
export function assertAssignmentPlannerCanvasCorrection(original:unknown,corrected:unknown,repairBackground=false):void {
  if(repairBackground && !["solid","gradient"].includes((corrected as AssignmentPlannerResponseObject).activeSessionPlan.boardDefinition!.theme.background.type))throw new Error("canvas_correction_invalid");
  const protectedFields=(value:unknown)=>{
    const copy=structuredClone(value) as {activeSessionPlan:{boardDefinition:AdventureBoardDefinition}};
    if(repairBackground)delete (copy.activeSessionPlan.boardDefinition.theme as Partial<AdventureBoardDefinition['theme']>).background;
    for(const portal of copy.activeSessionPlan.boardDefinition.portals)delete (portal as Partial<typeof portal>).position;
    for(const edge of copy.activeSessionPlan.boardDefinition.edges)delete edge.controlPoints;
    return copy;
  };
  if(!isDeepStrictEqual(protectedFields(original),protectedFields(corrected)))throw new Error("canvas_correction_changed_journey");
}

async function plannerCanvasIssues(output:AssignmentPlannerOutput,opts:AssignmentPlanningOptions):Promise<AssignmentPlanValidationIssue[]> {
  if(!opts.providerReceipt || !output.activeSessionPlan.boardDefinition)return [];
  try {
    await verifyAuthoredBoardCanvas({definition:output.activeSessionPlan.boardDefinition,directory:path.join(opts.providerReceipt.draftDir,'planner-canvas'),rootDir:process.cwd()});
    return [];
  } catch(error) {
    if(!(error instanceof Error)||!error.message.startsWith('board_canvas_invalid:'))throw error;
    console.warn(` 🎮 [assignment-planner] [canvas] [correction-required] ${error.message}`);
    return [{code:'board_canvas_invalid',severity:'error',message:error.message}];
  }
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
  validationIssues.push(...await plannerCanvasIssues(output,opts));
  const blockingIssues = validationIssues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    if (opts.providerReceipt && packet.discoveryEvidence
      && blockingIssues.every((issue) => issue.code === "board_canvas_invalid" || issue.code === "word_radar_unrendered_teaching" || issue.code === "word_radar_capability_mismatch")) {
      const canvasOnly=blockingIssues.every(issue=>issue.code==="board_canvas_invalid");
      const repairBackground=canvasOnly&&canvasNeedsBackgroundRepair(blockingIssues);
      const correctionRequest = {
        version: repairBackground ? 3 : 1,
        purpose: "assignment_planner_semantic_correction",
        originalRequestHash: hashDiscoveryContract(packet),
        invalidToolInput: result.draft,
        validationIssues: blockingIssues,
      };
      const correctionPrompt = `Your ${ASSIGNMENT_PLANNER_TOOL_NAME} input passed schema and evidence checks, but its child-facing activity contract failed. Reissue the complete plan once. Preserve the assignment, child evidence, valid learning choices, measurements, and routes. For each listed Word Radar node, its screen cannot display rounds or teachingFocus: choose a catalog instrument that renders the intended teaching, or express the activity through Word Radar's supported wordRadarConfig without hidden teaching. A Word Radar response contract must exactly match a launchable catalog capability mode; copy its config values rather than combining modes. Keep all academic content visible to the child. For board_canvas_invalid, correct only the cited positions or geometry, preserving all portal identities, labels, paths, options and educational content. ${BOARD_CANVAS_AUTHORING_CONSTRAINTS} Do not invent evidence, targets, or activities.\nVALIDATION ISSUES:\n${JSON.stringify(blockingIssues)}\nLAUNCHABLE ACTIVITY CAPABILITIES:\n${JSON.stringify(packet.activityCatalog.filter(card => card.launchable).map(card => ({ activityId: card.activityId, nodeType: card.nodeType, capabilityModes: card.capabilityModes })))}\nPREVIOUS TOOL INPUT:\n${JSON.stringify(result.draft)}`;
      const correctionStarted = Date.now();
      const correction = await runMathProviderStage({
        draftDir: opts.providerReceipt.draftDir,
        stage: `${opts.providerReceipt.stage}-semantic-correction-${repairBackground?"background-v3-1":"v1"}`,
        model,
        request: correctionRequest,
        beforeRequest: () => {
          if (!process.env.ANTHROPIC_API_KEY) throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
        },
        execute: async () => ({
          message: await requestAssignmentPlannerTool({ prompt: canvasOnly ? canvasCorrectionPrompt(result.draft,blockingIssues) : correctionPrompt, model, geometryOnly:canvasOnly, repairBackground, schema: canvasOnly ? assignmentPlannerCanvasCorrectionSchema(result.draft,repairBackground) : assignmentPlannerToolJsonSchema(Boolean(packet.discoveryEvidence), packet.activityCatalog) }),
          model,
          latencyMs: Date.now() - correctionStarted,
          createdAt: new Date().toISOString(),
        }),
      });
      console.log(` 🎮 [assignment-planner] [semantic-correction] [received] id=${correction.message.id}`);
      let correctedDraft = validateAssignmentPlannerRelationships(
        canvasOnly ? parseCanvasCorrection(result.draft,correction.message,repairBackground) : parseAssignmentPlannerToolUseResponse(correction.message),
        new Set(assignmentPlannerAllowedEvidenceIds(packet)),
        true,
        new Set(packet.capturedHomework.words.map(word => word.trim().toLocaleLowerCase("en-US"))),
      );
      if(canvasOnly)assertAssignmentPlannerCanvasCorrection(result.draft,correctedDraft,repairBackground);
      let correctedAt = correction.createdAt;
      let correctionUsage: LanguageModelUsage | undefined = usageFromAnthropic(correction.message);
      let correctedOutput = hydrateAssignmentPlannerOutputFromDraft(correctedDraft, packet, correctedAt);
      let remainingIssues = validateAssignmentPlannerOutput(correctedOutput, {
        extraction: packet.sourceDocument,
        activityCatalog: packet.activityCatalog,
        requireNodeTitles: true,
        requireCatalogBinding: true,
      }).filter(issue => issue.severity === "error");
      remainingIssues.push(...await plannerCanvasIssues(correctedOutput,opts));
      if (remainingIssues.length && remainingIssues.every(issue => issue.code === "board_canvas_invalid" || issue.code === "word_radar_unrendered_teaching" || issue.code === "word_radar_capability_mismatch")) {
        const secondCanvasOnly=remainingIssues.every(issue=>issue.code==="board_canvas_invalid");
        const secondRepairBackground=secondCanvasOnly&&canvasNeedsBackgroundRepair(remainingIssues);
        const priorCorrected=correctedDraft;
        const secondRequest = {
          version: secondRepairBackground ? 3 : 2,
          purpose: "assignment_planner_semantic_correction",
          originalRequestHash: hashDiscoveryContract(packet),
          invalidToolInput: correctedDraft,
          validationIssues: remainingIssues,
        };
        const secondPrompt = `The first semantic correction still failed the child-facing contract. Reissue the complete plan one final time. Word Radar cannot show rounds or teachingFocus, and its wordRadarConfig must exactly match one launchable catalog capability. If teaching rounds are essential, choose a catalog teaching instrument that displays them; never leave teaching hidden inside Word Radar. Preserve the assignment, child evidence, valid learning choices, measurements, and routes. For board_canvas_invalid, correct only the cited positions or geometry, preserving all portal identities, labels, paths, options and educational content. ${BOARD_CANVAS_AUTHORING_CONSTRAINTS} Do not invent evidence, targets, or activities.\nVALIDATION ISSUES:\n${JSON.stringify(remainingIssues)}\nLAUNCHABLE ACTIVITY CAPABILITIES:\n${JSON.stringify(packet.activityCatalog.filter(card => card.launchable).map(card => ({ activityId: card.activityId, nodeType: card.nodeType, capabilityModes: card.capabilityModes })))}\nPREVIOUS TOOL INPUT:\n${JSON.stringify(correctedDraft)}`;
        const secondStarted = Date.now();
        const second = await runMathProviderStage({
          draftDir: opts.providerReceipt.draftDir,
          stage: `${opts.providerReceipt.stage}-semantic-correction-${secondRepairBackground?"background-v3-2":"v2"}`,
          model,
          request: secondRequest,
          beforeRequest: () => {
            if (!process.env.ANTHROPIC_API_KEY) throw new Error("assignment_planner_ai_unavailable:ANTHROPIC_API_KEY");
          },
          execute: async () => ({
            message: await requestAssignmentPlannerTool({ prompt: secondCanvasOnly ? canvasCorrectionPrompt(priorCorrected,remainingIssues) : secondPrompt, model, geometryOnly:secondCanvasOnly, repairBackground:secondRepairBackground, schema: secondCanvasOnly ? assignmentPlannerCanvasCorrectionSchema(priorCorrected,secondRepairBackground) : assignmentPlannerWordRadarCorrectionSchema(packet) }),
            model,
            latencyMs: Date.now() - secondStarted,
            createdAt: new Date().toISOString(),
          }),
        });
        console.log(` 🎮 [assignment-planner] [semantic-correction-v2] [received] id=${second.message.id}`);
        correctedDraft = validateAssignmentPlannerRelationships(
          secondCanvasOnly ? parseCanvasCorrection(priorCorrected,second.message,secondRepairBackground) : parseAssignmentPlannerToolUseResponse(second.message),
          new Set(assignmentPlannerAllowedEvidenceIds(packet)),
          true,
          new Set(packet.capturedHomework.words.map(word => word.trim().toLocaleLowerCase("en-US"))),
        );
        if(secondCanvasOnly)assertAssignmentPlannerCanvasCorrection(priorCorrected,correctedDraft,secondRepairBackground);
        correctedAt = second.createdAt;
        correctionUsage = combinePlannerUsage(correctionUsage, usageFromAnthropic(second.message));
        correctedOutput = hydrateAssignmentPlannerOutputFromDraft(correctedDraft, packet, correctedAt);
        remainingIssues = validateAssignmentPlannerOutput(correctedOutput, {
          extraction: packet.sourceDocument,
          activityCatalog: packet.activityCatalog,
          requireNodeTitles: true,
          requireCatalogBinding: true,
        }).filter(issue => issue.severity === "error");
      }
      remainingIssues.push(...await plannerCanvasIssues(correctedOutput,opts));
      if (remainingIssues.length) throw new Error(`assignment_planner_validation_failed:${remainingIssues.map(issue => issue.code).join(",")}: ${remainingIssues.map(issue => issue.message).join("; ")}`);
      console.log(" 🎮 [assignment-planner] [semantic-correction] [validated]");
      return { output: correctedOutput, receivedAt: correctedAt,
        telemetry: { model, usage: combinePlannerUsage(result.telemetry?.usage ?? result.usage, correctionUsage), latencyMs: Date.now() - started } };
    }
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

type PlannerDraftNode = z.infer<typeof compactNodePlanSchema>;
type PlannerDraftPlan = z.infer<typeof compactActiveSessionPlanSchema>;

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
  if (!args.draft.boardDefinition) throw new Error('board_definition_required:request_explicit_planner_revision');
  const definition = args.draft.boardDefinition;
  const definitionIssues = validateBoardDefinition(definition,nodePlan.map(node => node.id));
  if (definitionIssues.length) throw new Error(`board_definition_invalid:${JSON.stringify(definitionIssues)}`);
  return {
    planId,
    childId: args.packet.childId,
    createdAt: args.createdAt ?? new Date().toISOString(),
    source: "ingest_human_loop",
    domain: args.capturedContent.contentProfile.practiceDomain,
    testDate: null,
    nodePlan,
    boardDefinition: definition,
    adventureBoard: renderBoardDefinition(definition, {
      boardId: `assignment-board-${args.packet.childId}-${args.packet.sourceDocument.fileHash.slice(0, 8)}`,
      planId, childId:args.packet.childId, domain:args.capturedContent.contentProfile.practiceDomain,
      activities:nodePlan.map(node => ({...node, wordRadarConfig:node.wordRadarConfig ? {...node.wordRadarConfig} : undefined, state:'generating', verified:false})),
      companion:{id:companionId,name:args.packet.childChart.selectedCompanionName ?? companionId},
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
  // Quest and Boss are never briefed before evidence authorizes them (contract 21).
  const sourceBriefs = (briefs ?? []).filter((brief) => brief.kind !== "quest" && brief.kind !== "boss");
  if (sourceBriefs.length === 0) return undefined;

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
