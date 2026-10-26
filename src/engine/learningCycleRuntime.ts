import {isDeepStrictEqual} from "node:util";
import { spellingActivityMenu } from "./spellingTeachingTools";
import { spellingActivityCatalog } from "./assignmentPlanner";
import {readSuccessorBoardDefinition, assembleAdventureBoardDefinition, BOARD_DEFINITION_TOOL_SCHEMA, BOARD_AUTHORING_INSTRUCTION, type AdventureBoardComposition, type AdventureJourneyDefinition} from "../shared/adventureBoardDefinition";
import { canonicalJourneyLaunchable, isRetryablePlannerBlock, isSpellingPracticeContinuation, repointReusedSetup } from './learningCycleRepository';
import {requestPlannerMessage, readPlannerToolReceipt, plannerTransportPolicy} from "./plannerTransport";
import fs from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import { MATH_ITEMS_SCHEMA, drawJourney, parseDirectItem, type DirectItem } from "./directMathExperience";
import { runPlannerToolLoop } from "./plannerToolLoop";
import { providerTurnSender } from "./plannerToolProvider";
import { spellingSuccessorToolkit } from "./spellingSuccessorTools";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import { hasReceivedMathProviderStage, readReceivedMathProviderStage, runMathProviderStage } from "./adaptiveMathDiscovery";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import { evaluateAcademicPredictions } from "./longitudinalLearning";
import {
  applyEvidenceBasedMathContentDecisions,
  validateEvidenceBasedContentDecisions,
  assertContentDecisionShape,
  type EvidenceBasedContentDecision,
} from "./learningDecisionContext";
import {
  getLearningCycle,
  transitionLearningCycle,
  validateSpellingPrescription,
  spellingAssignmentItems,
  spellingBuiltInActivities,
  type LearningCycleEvidenceSummary,
  type LearningCycleRecordV2,
  type LearningCycleDecision,
  type LearningCycleRepositoryOptions,
  type LearningObservation,
  type LearningCycleSpellingItem,
  type LearningProgressionAction,
  type NextInstrumentPrescription,
  type SuccessorProgram,
} from "./learningCycleRepository";
import { areDistinctWordsPronunciationEquivalent } from "../shared/karaokeMatchWord";
import {currentBoardInstance} from "./learningBoardInstances";

export type CanonicalCompletionResult = {
  /** Server-validated launch whose per-answer records already exist. */
  captureLaunchId?: string;
  completed: boolean;
  /** Terminal participation is separate from a native game's legacy win flag. */
  ended?: boolean;
  won?: boolean;
  earlyExit?: boolean;
  accuracy: number;
  timeSpent_ms: number;
  targetResults?: Array<{
    target: string;
    correct: boolean;
    attemptedValue?: string;
    responseTime_ms?: number;
    attempts?: number;
    scaffoldLevel?: number;
    evidenceRole?: "assisted_instruction";
  }>;
  frustrationSignals?: string[];
  replay?: boolean;
  companionInteractions?: string[];
};

export type CanonicalProgressionDecision = {
  status: "supported" | "revised" | "falsified" | "inconclusive" | "awaiting_calibration";
  reason: string;
  progressionAction: LearningProgressionAction;
  preserve: string[];
  change: string[];
  testNext: string[];
  nextEvidenceRequired: string[];
  predictionEvaluationIds?: string[];
  contentDecisions?: EvidenceBasedContentDecision[];
  revisedHypothesis?: string;
  /** The one complete successor board program. Absent only for await_calibration. */
  successor?: SuccessorProgram;
};

export type BaselineQuestEvidenceEligibility = {
  eligible: boolean;
  targetAlignedObservationCount: number;
  independentCorrectObservationCount: number;
  reason: "eligible_independent_correct_evidence" | "no_target_aligned_baseline_evidence" | "no_independent_correct_baseline_evidence";
};

export function baselineQuestEvidenceEligibility(
  cycle: LearningCycleRecordV2,
): BaselineQuestEvidenceEligibility {
  const targetAligned = cycle.observations.filter(observation => {
    if (/(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(`${observation.observationId} ${observation.sourceId}`)) return false;
    const node = cycle.nodes.find(node => node.role === "baseline" && observation.sourceId.endsWith(`:${node.nodeId}`));
    if (!node) return false;
    const construct = cycle.academicPredictions.find(p => p.predictionId === node.predictionId)?.constructId ?? `${cycle.domain}.${slug(node.academicTarget.skill)}`;
    return observation.constructLinks.some(link => link.role === "primary" && link.confidence > 0 && link.constructId === construct)
      && !observation.confounds.includes("response_not_captured");
  });
  const independentCorrect = targetAligned.filter((observation) =>
    observation.result.correct === true
    && observation.provenance === "independent_probe"
    && observation.exposure === "unseen"
    && Boolean(observation.childResponse?.trim())
    && !observation.confounds.includes("item_previously_exposed")
    && observation.assistance.status === "unassisted"
    && !observation.confounds.includes("assistance_present"));
  return {
    eligible: independentCorrect.length > 0,
    targetAlignedObservationCount: targetAligned.length,
    independentCorrectObservationCount: independentCorrect.length,
    reason: independentCorrect.length > 0
      ? "eligible_independent_correct_evidence"
      : targetAligned.length > 0
        ? "no_independent_correct_baseline_evidence"
        : "no_target_aligned_baseline_evidence",
  };
}

export function resolveCanonicalProgressionDecisionForLifecycle(
  lifecycle: LearningCycleRecordV2["lifecycle"],
  decision: CanonicalProgressionDecision,
): CanonicalProgressionDecision {
  if (lifecycle !== "boss_evaluating" || decision.status !== "awaiting_calibration" || decision.progressionAction === "await_calibration") {
    return decision;
  }
  console.log(` 🎮 [canonical-progression] [boss-action-normalized] from=${decision.progressionAction} to=await_calibration`);
  return {
    ...decision,
    progressionAction: "await_calibration",
    successor: undefined,
  };
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "unknown";
}

function isUncapturedResponse(value: string | undefined, requireCapture: boolean): boolean {
  return (requireCapture && (typeof value !== "string" || !value.trim())) || /spoken[_\s-]*aloud.*not[_\s-]*transcribed|response[_\s-]*not[_\s-]*captured/i.test(
    value ?? "",
  );
}

function scoreMathResponse(item: DirectItem | undefined, value: string): LearningObservation["result"] {
  const response = item?.response;
  if (!response) return { observedErrorType: "answer_contract_missing" };
  if (response.mode === "explanation") return { observedErrorType: "explanation_requires_interpretation" };
  let correct: boolean;
  if (response.mode === "numeric") {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return { observedErrorType: "response_format_invalid" };
    correct = Number.isFinite(Number(value)) && Number(value) === response.expected;
  } else if (response.mode === "selection") {
    const selected = response.options.find(option => option.id === value.trim());
    if (!selected) return { observedErrorType: "response_format_invalid" };
    correct = selected.correct;
  } else {
    let state: unknown;
    try { state = JSON.parse(value); } catch { return { observedErrorType: "response_format_invalid" }; }
    if (!state || typeof state !== "object" || Array.isArray(state)) return { observedErrorType: "response_format_invalid" };
    correct = Object.entries(response.expectedState).every(([key, expected]) => Object.hasOwn(state, key) && (state as Record<string, unknown>)[key] === expected);
  }
  return { correct, score: correct ? 1 : 0 };
}

export function scoreSpellingRecall(
  item: LearningCycleSpellingItem | undefined,
  value: string,
  disposition: { skipped?: boolean } = {},
): LearningObservation["result"] {
  if (!item) return { observedErrorType: "answer_contract_missing" };
  if (disposition.skipped) return { observedErrorType: "not_sure" };
  if (!value.trim()) return { observedErrorType: "response_not_captured" };
  const normalize = (text: string): string => item.response.caseSensitive
    ? text.normalize("NFC").trim()
    : text.normalize("NFC").trim().toLocaleLowerCase("en-US");
  const correct = item.response.acceptedForms.some(answer => normalize(answer) === normalize(value));
  if (
    !correct &&
    item.response.acceptedForms.some((answer) =>
      areDistinctWordsPronunciationEquivalent(normalize(answer), normalize(value)),
    )
  ) {
    return { observedErrorType: "instrument_ambiguous" };
  }
  return { correct, score: correct ? 1 : 0 };
}

/** support is supplied by the server's live instrument context, never the attempt body. */
export function recordSpellingDiscoveryAttempt(input: {
  childId: string;
  homeworkId: string;
  attempt: { attemptId: string; itemId: string; attemptedValue: string; observedAt: string; skipped?: boolean };
  support?: LearningObservation["assistance"];
  instrumentSignals?: string[];
  artifactHash?: string;
  sessionId?: string;
  launchId?: string;
}, opts: LearningCycleRepositoryOptions = {}): LearningCycleRecordV2 {
  let cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle || cycle.domain !== "spelling") throw new Error("spelling_cycle_missing");
  const node = cycle.nodes.find(candidate => candidate.evidenceContract.spellingItems?.[input.attempt.itemId]);
  const item = node?.evidenceContract.spellingItems?.[input.attempt.itemId];
  if (!node || !item) throw new Error("spelling_item_not_in_contract");
  const { attempt } = input;
  if (!attempt.attemptId.trim() || !Number.isFinite(Date.parse(attempt.observedAt))) throw new Error("spelling_attempt_identity_invalid");
  const prior = cycle.observations.find(row => row.observationId === attempt.attemptId);
  if (prior) {
    if (prior.itemId !== attempt.itemId || (prior.childResponse ?? "") !== attempt.attemptedValue
      || (prior.confounds.includes("response_disposition:not_sure") || prior.result.observedErrorType === "not_sure") !== (attempt.skipped === true)) throw new Error("spelling_attempt_identity_conflict");
    return cycle;
  }
  const support = input.support ?? { status: "unknown" as const, scaffolds: [] };
  const repeated = cycle.observations.some(row => row.itemId === item.id);
  const previouslyExposed = repeated || cycle.observations.some(row => row.confounds.includes(`word_id:${item.wordId}`));
  const signals = input.instrumentSignals ?? [];
  const result = signals.length ? { observedErrorType: "instrument_ambiguous" } : scoreSpellingRecall(item, attempt.attemptedValue, attempt);
  const exposure: LearningObservation["exposure"] = previouslyExposed || item.lineage.exposure === "practiced"
    ? "previously_practiced" : item.lineage.exposure === "taught" ? "previously_taught" : "unseen";
  const independent = node.role === "evaluation" && support.status === "unassisted" && exposure === "unseen" && typeof result.correct === "boolean";
  if (node.role !== "evaluation" && !["ready", "active", "completed"].includes(node.state)) throw new Error("spelling_instrument_not_active");
  if (cycle.lifecycle === "evaluation_ready") cycle = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, { type: "evaluation_started", evaluationId: node.nodeId }, opts);
  const observation: LearningObservation = {
    observationId: attempt.attemptId, itemId: item.id, sourceId: node.role === "evaluation" ? `evaluation:${node.nodeId}` : `activity:${node.nodeId}:recall`,
    ...(attempt.attemptedValue ? { childResponse: attempt.attemptedValue } : {}),
    constructLinks: [{ constructId: item.constructId, role: "primary", confidence: 1 }],
    result, assistance: structuredClone(support), exposure,
    provenance: independent ? "independent_probe" : "practice", observedAt: attempt.observedAt,
    confounds: [...new Set([
      `word_id:${item.wordId}`, `response_mode:${item.response.mode}`, `measurement_role:${item.lineage.measurementRole}`,
      ...(attempt.skipped ? ["response_disposition:not_sure"] : []),
      ...(repeated ? ["repeated_attempt"] : ["first_response"]), ...(result.observedErrorType ? [result.observedErrorType] : []),
      ...(support.status !== "unassisted" ? [`assistance_${support.status}`] : []), ...signals,
      ...(input.artifactHash ? [`artifact_hash:${input.artifactHash}`] : []),
      ...(input.sessionId ? [`session_id:${input.sessionId}`] : []),
      ...(input.launchId ? [`launch_id:${input.launchId}`] : []),
    ])],
  };
  const updated = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    ...(node.role === "evaluation" ? { type: "evaluation_attempted" as const, evaluationId: node.nodeId } : { type: "instrument_observed" as const, completed: false }), nodeId: node.nodeId,
    observations: [observation], academicEvidence: [{ evidenceId: observation.observationId, summary: `${item.id}: ${result.observedErrorType ?? (result.correct ? "correct" : "incorrect")}; assistance=${support.status}; exposure=${exposure}.` }],
    engagementEvidence: signals.length ? [{ evidenceId: `${observation.observationId}:instrument`, summary: signals.join(", ") }] : [],
    companionObservations: support.scaffolds.map(evidenceId => ({ evidenceId, summary: `Support was invoked during spelling recall; item=${item.id}. Exact instructional exposure is not assumed from the request alone.` })),
  }, opts);
  console.log(` 🎮 [spelling-discovery] [attempt] [committed] homework=${input.homeworkId} item=${item.id} attempt=${attempt.attemptId} provenance=${observation.provenance}`);
  return updated;
}

function observationsForCompletion(input: {
  cycle: LearningCycleRecordV2;
  sessionId: string;
  nodeId: string;
  result: CanonicalCompletionResult;
  observedAt: string;
}): LearningObservation[] {
  const node = input.cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId)!;
  if (!node.evidenceContract.academic) return [];
  const serverAssistedInstruction = input.cycle.domain === "spelling"
    && node.implementationType === "visual-explainer";
  if (input.result.targetResults?.some(row => row.evidenceRole === "assisted_instruction")
    && !serverAssistedInstruction) {
    throw new Error(`learning_cycle_evidence_role_conflict:${node.nodeId}`);
  }
  const spellingItems = node.evidenceContract.spellingItems;
  if (input.cycle.domain === "spelling" && spellingItems && input.result.captureLaunchId) {
    const captured = input.cycle.observations.filter(row => row.sourceId === `activity:${node.nodeId}:recall` && Boolean(spellingItems[row.itemId]) && row.confounds.includes(`launch_id:${input.result.captureLaunchId}`));
    if (node.state !== "completed" && !isSpellingPracticeContinuation(input.cycle) && Object.values(spellingItems).every(item => item.lineage.measurementRole === "fresh_checkpoint") && Object.keys(spellingItems).some(itemId => !captured.some(row => row.itemId === itemId))) throw new Error("spelling_checkpoint_coverage_incomplete");
    // Completion summarizes the latest captured response per item; earlier attempts remain audit facts.
    return [...new Map(captured.map(row => [row.itemId, row])).values()];
  }
  if (node.state !== "completed" && !isSpellingPracticeContinuation(input.cycle) && spellingItems && Object.values(spellingItems).every(item => item.lineage.measurementRole === "fresh_checkpoint")) {
    const captured = Object.keys(spellingItems).map(itemId => input.cycle.observations.find(row => row.itemId === itemId && row.sourceId === `activity:${node.nodeId}:recall`));
    if (captured.some(row => !row)) throw new Error("spelling_checkpoint_coverage_incomplete");
    return captured as LearningObservation[];
  }
  const itemRoles = node.evidenceContract.itemRoles;
  const seen = new Set<string>();
  for (const row of input.result.targetResults ?? []) {
    if ((input.cycle.domain === "math" || itemRoles) && seen.has(row.target)) throw new Error(`learning_cycle_duplicate_item:${row.target}`);
    seen.add(row.target);
  }
  if (itemRoles && !input.result.targetResults?.length) {
    throw new Error(`learning_cycle_instrument_target_results_missing:${node.nodeId}`);
  }
  if (itemRoles) {
    for (const row of input.result.targetResults ?? []) {
      if (!Object.hasOwn(itemRoles, row.target)) {
        throw new Error(`learning_cycle_instrument_unknown_item:${row.target}`);
      }
    }
  }
  const prediction = input.cycle.academicPredictions.find((candidate) => candidate.predictionId === node.predictionId);
  const constructId = prediction?.constructId ?? `${input.cycle.domain}.${slug(node.academicTarget.skill)}`;
  const rows = input.result.targetResults?.length
    ? input.result.targetResults
    : [{ target: node.nodeId, correct: input.result.accuracy >= 0.5 }];
  const companionHelp = input.cycle.domain !== "spelling" && (input.result.companionInteractions?.length ?? 0) > 0;
  const previouslyExposedItemIds = new Set(input.cycle.observations.map((observation) => observation.itemId));
  return rows.map((row, index) => {
    const item = node.evidenceContract.itemContracts?.[row.target];
    const measurementRole = item?.lineage.measurementRole ?? itemRoles?.[row.target] ?? "practice";
    const assistedInstruction = serverAssistedInstruction;
    const scaffolded = assistedInstruction || Number(row.scaffoldLevel ?? 0) > 0 || companionHelp;
    const repeatedAssessmentItem = node.state === "completed" || previouslyExposedItemIds.has(row.target);
    const spellingItem = spellingItems?.[row.target];
    const responseNotCaptured = !assistedInstruction && isUncapturedResponse(row.attemptedValue, input.cycle.domain === "math" || Boolean(spellingItems));
    const result = assistedInstruction
      ? { observedErrorType: "assisted_instruction" }
      : responseNotCaptured
        ? { observedErrorType: "response_not_captured" }
        : spellingItems
          ? scoreSpellingRecall(spellingItem, row.attemptedValue!)
          : input.cycle.domain === "math"
            ? scoreMathResponse(item, row.attemptedValue!)
            : { correct: row.correct, score: row.correct ? 1 : 0 };
    const eligibleFreshCheckpoint = !spellingItems && (input.cycle.domain === "math" ? item?.lineage.exposure === "unseen" && typeof result.correct === "boolean" : true) && (item || itemRoles
      ? measurementRole === "fresh_checkpoint"
      : node.role !== "baseline")
      && !scaffolded
      && !repeatedAssessmentItem
      && !responseNotCaptured;
    return {
      observationId: `${input.sessionId}:${input.nodeId}:observation:${index + 1}`,
      sourceId: `activity:${input.sessionId}:${input.nodeId}`,
      itemId: row.target || `${input.nodeId}:item:${index + 1}`,
      ...(!assistedInstruction && row.attemptedValue ? { childResponse: row.attemptedValue } : {}),
      constructLinks: [{ constructId: spellingItem?.constructId ?? constructId, role: "primary", confidence: 1 }],
      result,
      assistance: {
        status: scaffolded ? "assisted" : input.cycle.domain === "spelling" ? "unknown" : "unassisted",
        scaffolds: [
          ...(Number(row.scaffoldLevel ?? 0) > 0 ? [`scaffold_level_${row.scaffoldLevel}`] : []),
          ...(companionHelp ? ["companion_help"] : []),
        ],
      },
      exposure: eligibleFreshCheckpoint ? "unseen" : "previously_practiced",
      provenance: eligibleFreshCheckpoint ? "independent_probe" : "practice",
      observedAt: input.observedAt,
      confounds: [
        ...(scaffolded ? ["assistance_present"] : []),
        ...(repeatedAssessmentItem ? ["item_previously_exposed"] : []),
        ...(result.observedErrorType ? [result.observedErrorType] : []),
        `measurement_role:${measurementRole}`,
      ],
    };
  });
}

export function recordCanonicalNodeCompletion(
  input: {
    childId: string;
    homeworkId: string;
    sessionId: string;
    nodeId: string;
    result: CanonicalCompletionResult;
  },
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 | null {
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle || input.result.earlyExit || (!input.result.completed && !input.result.ended)) return cycle;
  const node = cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`learning_cycle_node_missing:${input.nodeId}`);
  if (node.evidenceContract.spellingItems && !input.sessionId.trim()) throw new Error("canonical_completion_session_required");
  const evidenceId = `${input.sessionId}:${input.nodeId}:completion`;
  const alreadyRecorded = cycle.evidence.academic.some((item) => item.evidenceId === evidenceId);
  if (alreadyRecorded) return cycle;
  if (node.role === "evaluation") throw new Error("learning_cycle_evaluation_requires_discovery_endpoint");
  const experiment = cycle.agencyExperiment;
  const firstIncompleteShared = experiment?.sharedNodeIds.find((nodeId) =>
    cycle.nodes.find((candidate) => candidate.nodeId === nodeId)?.state !== "completed");
  const selectedRoute = experiment?.routes.find((route) => route.routeId === cycle.routeSelection?.selectedRouteId);
  const firstIncompleteSelected = selectedRoute?.nodeIds.find((nodeId) =>
    cycle.nodes.find((candidate) => candidate.nodeId === nodeId)?.state !== "completed");
  const isAgencyNode = experiment
    ? experiment.sharedNodeIds.includes(node.nodeId) || experiment.routes.some((route) => route.nodeIds.includes(node.nodeId))
    : false;
  const agencyNodeLaunchable = canonicalJourneyLaunchable(cycle,node.nodeId) ?? (!experiment || !isAgencyNode
    ? undefined
    : firstIncompleteShared
      ? node.nodeId === firstIncompleteShared
      : node.nodeId === firstIncompleteSelected);
  if (node.state !== "completed" && (agencyNodeLaunchable === false || (agencyNodeLaunchable === undefined && node.state !== "ready" && node.state !== "active"))) {
    throw new Error(`learning_cycle_node_not_launchable:${input.nodeId}`);
  }
  const observedAt = (opts.now ?? new Date()).toISOString();
  const observations = observationsForCompletion({
    cycle,
    sessionId: input.sessionId,
    nodeId: node.nodeId,
    result: input.result,
    observedAt,
  });
  const scoredObservations = observations.filter(
    (observation) => typeof observation.result.correct === "boolean",
  );
  const accuracy = scoredObservations.length
    ? scoredObservations.filter((observation) => observation.result.correct === true).length /
      scoredObservations.length
    : undefined;
  const academicEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId,
    ...(typeof accuracy === "number" ? { accuracy } : {}),
    summary: typeof accuracy === "number"
      ? `${node.title} completed at ${Math.round(accuracy * 100)}% across ${scoredObservations.length} scored target readings.`
      : `${node.title} completed with no independently scorable target response.`,
  }];
  const spellingResponseTimes = cycle.domain === "spelling"
    ? (input.result.targetResults ?? [])
      .filter((row) => Number.isFinite(row.responseTime_ms) && Number(row.responseTime_ms) >= 0)
      .map((row) => `${row.target.slice(0, 100)}: response=${row.responseTime_ms}ms${Number.isSafeInteger(row.attempts) ? `, attempts=${row.attempts}` : ""}`)
      .join(" | ") || "unreported"
    : "not-applicable";
  const engagementEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId: `${evidenceId}:engagement`,
    summary: `${node.title} completed in ${Math.max(0, input.result.timeSpent_ms)}ms; won=${input.result.won ?? "unreported"}; replay=${node.state === "completed"}; reportedFrustration=${(input.result.frustrationSignals ?? []).join(",") || "none"}; practiceResponseTimes=${spellingResponseTimes}.`,
  }];
  const companionObservations: LearningCycleEvidenceSummary[] = (input.result.companionInteractions ?? []).map((summary, index) => ({
    evidenceId: `${evidenceId}:companion:${index + 1}`,
    summary,
  }));
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "instrument_observed",
    nodeId: node.nodeId,
    academicEvidence,
    engagementEvidence,
    companionObservations,
    observations,
  }, opts);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function parseNextInstrument(value: unknown): NextInstrumentPrescription | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  // A spelling step is an order for a built-in, so it carries no creator prompt.
  const keys = ["nodeId", "title", "academicTarget", "mechanic", "theme", "openingPurpose", ...(row.spelling === undefined ? ["creatorPrompt"] as const : [])] as const;
  if (keys.some((key) => typeof row[key] !== "string" || !String(row[key]).trim())) return undefined;
  // Design decisions are optional so an older Planner response still parses,
  // but they are carried through whenever the Planner supplies them.
  const designKeys = ["creatorPrompt", "stakesDesign", "failureMode", "escalation", "mechanicSpec", "mathematicalHook", "picture"] as const;
  return {
    ...(Array.isArray(row.items) ? { items: row.items.map(parseDirectItem) } : {}),
    ...(row.spelling !== undefined ? { spelling: validateSpellingPrescription(row.spelling) } : {}),
    ...(row.encounter === "quest" || row.encounter === "boss" ? { encounter: row.encounter } : {}),
    ...Object.fromEntries(keys.map((key) => [key, String(row[key]).trim()])),
    ...Object.fromEntries(designKeys
      .filter((key) => typeof row[key] === "string" && String(row[key]).trim())
      .map((key) => [key, String(row[key]).trim()])),
  } as NextInstrumentPrescription;
}

export function parseCanonicalProgressionDecision(value: unknown): CanonicalProgressionDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("canonical_progression_decision_invalid");
  const row = value as Record<string, unknown>;
  const statuses = new Set(["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"]);
  const actions = new Set<LearningProgressionAction>(["generate_support", "generate_quest", "generate_boss", "collect_more_evidence", "await_calibration"]);
  if (typeof row.status !== "string" || !statuses.has(row.status) || typeof row.progressionAction !== "string" || !actions.has(row.progressionAction as LearningProgressionAction)) {
    throw new Error("canonical_progression_decision_invalid");
  }
  if (typeof row.reason !== "string" || !row.reason.trim()) throw new Error("canonical_progression_reason_missing");
  const generatedNodeId = typeof row.nextTitle === "string" && row.nextTitle.trim()
    ? `generated-${String(row.progressionAction).replace("generate_", "")}-${row.nextTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`
    : undefined;
  const action = String(row.progressionAction);
  const legacyEncounter = action === "generate_quest" ? "quest" : action === "generate_boss" ? "boss" : undefined;
  // Older checkpointed responses carry one next* instrument; they replay as a one-node successor.
  const legacyInstrument = parseNextInstrument(row.nextInstrument) ?? parseNextInstrument({
    nodeId: row.nextNodeId ?? generatedNodeId,
    title: row.nextTitle,
    academicTarget: row.nextAcademicTarget,
    items: row.nextItems,
    mechanic: row.nextMechanic,
    theme: row.nextTheme,
    openingPurpose: row.nextOpeningPurpose,
    creatorPrompt: row.nextCreatorPrompt,
    stakesDesign: row.nextStakesDesign,
    failureMode: row.nextFailureMode,
    escalation: row.nextEscalation,
    mechanicSpec: row.nextMechanicSpec,
    mathematicalHook: row.nextMathematicalHook,
    encounter: legacyEncounter,
  });
  if (legacyInstrument && legacyEncounter && !legacyInstrument.encounter) legacyInstrument.encounter = legacyEncounter;
  const instruments = Array.isArray(row.nextInstruments)
    ? row.nextInstruments.map((value) => {
        const parsed = parseNextInstrument(value);
        if (!parsed) throw new Error("canonical_progression_instrument_invalid");
        return parsed;
      })
    : legacyInstrument ? [legacyInstrument] : [];
  const boardDefinition = action === 'await_calibration' ? undefined : readSuccessorBoardDefinition(row.boardDefinition,instruments);
  const contentDecisions = (Array.isArray(row.contentDecisions) ? row.contentDecisions : []).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("canonical_progression_content_decision_invalid");
    const decision = value as Record<string, unknown>;
    const action = String(decision.action ?? "");
    if (!new Set(["candidate", "reuse", "revise", "retire"]).has(action)) throw new Error("canonical_progression_content_decision_invalid");
    return {
      contentId: String(decision.contentId ?? "").trim(),
      action: action as EvidenceBasedContentDecision["action"],
      reason: String(decision.reason ?? "").trim(),
      evidenceIds: strings(decision.evidenceIds),
    };
  });
  if (action !== "await_calibration" && instruments.length === 0) {
    console.log(` 🎮 [canonical-progression] [planner-prescription-invalid] action=${String(row.progressionAction)} value=${JSON.stringify({
      nextInstrument: row.nextInstrument ?? null,
      nextNodeId: row.nextNodeId ?? null,
      nextTitle: row.nextTitle ?? null,
      nextAcademicTarget: row.nextAcademicTarget ?? null,
      nextMechanic: row.nextMechanic ?? null,
      nextTheme: row.nextTheme ?? null,
      nextOpeningPurpose: row.nextOpeningPurpose ?? null,
      nextCreatorPrompt: row.nextCreatorPrompt ?? null,
    })}`);
    throw new Error(`canonical_progression_${action.replace("generate_", "")}_prescription_missing`);
  }
  return {
    status: row.status as CanonicalProgressionDecision["status"],
    reason: row.reason.trim(),
    progressionAction: row.progressionAction as LearningProgressionAction,
    preserve: strings(row.preserve),
    change: strings(row.change),
    testNext: strings(row.testNext),
    nextEvidenceRequired: strings(row.nextEvidenceRequired),
    predictionEvaluationIds: strings(row.predictionEvaluationIds),
    ...(contentDecisions.length > 0 ? { contentDecisions } : {}),
    ...(typeof row.revisedHypothesis === "string" && row.revisedHypothesis.trim() ? { revisedHypothesis: row.revisedHypothesis.trim() } : {}),
    ...(action !== "await_calibration" ? { successor: { instruments, boardDefinition } } : {}),
  };
}

function assertPredictionCitations(decision:Pick<CanonicalProgressionDecision,'predictionEvaluationIds'>, cycle:LearningCycleRecordV2):void {
  const allowed = new Set(cycle.predictionEvaluations.map(evaluation => evaluation.evaluationId));
  const cited = decision.predictionEvaluationIds ?? [];
  if (cited.some(id => !allowed.has(id))) throw new Error("canonical_progression_unknown_prediction_evaluation");
  if (allowed.size > 0 && cited.length === 0) throw new Error("canonical_progression_prediction_evaluation_citation_required");
}

function progressionEvidence(cycle:LearningCycleRecordV2) {
  const evidenceIds = [...new Set([...cycle.evidence.academic, ...cycle.evidence.engagement]
    .map(item=>item.evidenceId).filter(id=>!/(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(id)))];
  return {evidenceIds, decisionEvidenceIds:new Set([...evidenceIds,...cycle.observations.map(row=>row.observationId),...cycle.predictionEvaluations.map(row=>row.evaluationId)])};
}

function plannerCheckpoint(cycle: LearningCycleRecordV2, opts: LearningCycleRepositoryOptions) {
  const entry = [...cycle.decisionHistory].reverse().find(row => row.toLifecycle === cycle.lifecycle && row.fromLifecycle !== cycle.lifecycle);
  const batchId = entry?.decisionId ?? `${cycle.homeworkId}:r${cycle.revision}`;
  const recordedRevision = Number(entry?.decisionId.match(/:r(\d+)$/)?.[1]);
  const revision = Number.isSafeInteger(recordedRevision) ? recordedRevision : cycle.revision;
  return {batchId, revision, stage:`progression-decision-r${revision}`, draftDir:path.join(resolveChildContextDir(cycle.childId, {rootDir:opts.rootDir}), "homework", "cycles", ".planner", cycle.homeworkId, batchId.replace(/[^a-zA-Z0-9_-]+/g,"_"))};
}

/** Freeze the purchased request, without changing the identity of old receipts. */
function freezePlannerRequest<T extends Parameters<typeof requestPlannerMessage>[1]>(input: {draftDir:string; stage:string; request:T; legacyContext?:unknown}) {
  const file=path.join(input.draftDir,`${input.stage}.request.json`);
  const legacy=!fs.existsSync(file) && fs.existsSync(path.join(input.draftDir,'provider-receipts',`${input.stage}.stage.json`));
  const timeout=Number(process.env.SUNNY_AI_TIMEOUT_MS??300000);
  if(legacy) {
    // The old primary used a small snapshot; its corrections hashed the full 6k request.
    const request={...input.request,max_tokens:6000};
    return {request,timeout,receiptContext:input.legacyContext??request,beforeRequest:undefined};
  }
  fs.mkdirSync(input.draftDir,{recursive:true});
  if(!fs.existsSync(file)) {
    const temporary=`${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary,JSON.stringify({request:input.request,snapshot:input.legacyContext??null,policy:plannerTransportPolicy(input.request.model,input.request.max_tokens,timeout)}));
      try {fs.linkSync(temporary,file);} catch(error) {if((error as NodeJS.ErrnoException).code!=='EEXIST') throw error;}
    } finally {if(fs.existsSync(temporary)) fs.unlinkSync(temporary);}
  }
  const frozen=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!frozen.request?.model || !('snapshot' in frozen) || !frozen.policy) throw Error('planner_frozen_request_invalid');
  const request=frozen.request as T;
  return {request,timeout:frozen.policy.timeout as number,receiptContext:frozen as unknown,beforeRequest:()=>{
    if(!isDeepStrictEqual(plannerTransportPolicy(request.model,request.max_tokens,frozen.policy.timeout),frozen.policy)) {
      // No request was sent: leave the existing rejected/absent receipt resumable.
      throw Object.assign(Error('planner_frozen_transport_changed'),{status:409});
    }
  }};
}

/** Explicit operator action only. No purchase, deletion or evidence rewrite. */
export function authorizeCanonicalPlannerRetry(input: {childId:string; homeworkId:string; blockedDecisionId:string; reason:string}, opts: LearningCycleRepositoryOptions = {}) {
  const cycle = getLearningCycle(input.childId,input.homeworkId,opts);
  const blocked = cycle && [...cycle.decisionHistory].reverse().find(row=>row.fromLifecycle!==row.toLifecycle);
  if (!cycle || cycle.lifecycle!=="blocked" || blocked?.eventType!=="block" || blocked.decisionId!==input.blockedDecisionId
    || !isRetryablePlannerBlock(blocked.reason) || !input.reason.trim()) throw Error("planner_retry_not_eligible");
  const checkpoint = plannerCheckpoint({...cycle,lifecycle:blocked.fromLifecycle,decisionHistory:cycle.decisionHistory.slice(0,cycle.decisionHistory.indexOf(blocked))},opts);
  const receipts = path.join(checkpoint.draftDir,"provider-receipts");
  if (blocked.reason.startsWith("planner_decision_invalid:provider_stage_request_changed:")) {
    // The collided attempt's saved turns and drawing are set aside (never deleted), so the fixed code decides fresh.
    const superseded = path.join(checkpoint.draftDir,"superseded",input.blockedDecisionId.replace(/[^a-zA-Z0-9_-]+/g,"_"));
    fs.mkdirSync(superseded,{recursive:true});
    const stale = [
      ...(fs.existsSync(receipts)?fs.readdirSync(receipts):[]).filter(name=>name.startsWith(`${checkpoint.stage}-tools-turn-`)||name.startsWith(`${checkpoint.stage}-design-`)).map(name=>path.join(receipts,name)),
      ...[`${checkpoint.stage}-design.json`,`${checkpoint.stage}-tools.question.json`].map(name=>path.join(checkpoint.draftDir,name)).filter(file=>fs.existsSync(file)),
    ];
    for (const file of stale) fs.renameSync(file,path.join(superseded,path.basename(file)));
    console.log(` 🎮 [canonical-progression] [retry] [superseded] homework=${cycle.homeworkId} files=${stale.length} dir=${superseded}`);
  } else {
    const stage = JSON.parse(fs.readFileSync(path.join(receipts,`${checkpoint.stage}.stage.json`),"utf8"));
    if (typeof stage.requestHash!=="string" || !/^[a-f0-9]{64}$/.test(stage.requestHash)) throw Error("planner_retry_receipt_invalid");
    const receipt = JSON.parse(fs.readFileSync(path.join(receipts,`${stage.requestHash}.json`),"utf8"));
    if (receipt.status!=="received" || receipt.response?.plannerMessage?.stop_reason!=="max_tokens") throw Error("planner_retry_receipt_not_truncated");
  }
  const authorized = transitionLearningCycle(input.childId,input.homeworkId,cycle.revision,{type:"planner_retry_authorized",blockedDecisionId:input.blockedDecisionId,reason:input.reason},opts);
  console.log(` 🎮 [canonical-progression] [retry] [authorized] homework=${cycle.homeworkId} blocked_decision=${input.blockedDecisionId} attempt=${authorized.decisionHistory.at(-1)!.decisionId}`);
  return authorized;
}

/** Explicit zero-purchase recovery of a complete primary response. No intermediate lifecycle
 * is persisted: a crash cannot leave normal startup authorized to buy another decision. */
export async function replayCanonicalPlannerResponse(input:{childId:string;homeworkId:string;blockedDecisionId:string;reason:string},opts:LearningCycleRepositoryOptions={}) {
  const chart=getChildChart(input.childId,{rootDir:opts.rootDir});
  if(chart.childId!==input.childId || !input.reason.trim())throw new Error('planner_replay_not_eligible');
  const cycle=getLearningCycle(input.childId,input.homeworkId,opts);
  if(!cycle)throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if(cycle.decisionHistory.some(row=>row.replayedResponse?.blockedDecisionId===input.blockedDecisionId))return cycle;
  const blocked=[...cycle.decisionHistory].reverse().find(row=>row.fromLifecycle!==row.toLifecycle);
  if(cycle.lifecycle!=='blocked'||blocked?.eventType!=='block'||blocked.decisionId!==input.blockedDecisionId
    ||!/^planner_decision_invalid:(board_definition_|board_canvas_invalid:)/.test(blocked.reason)
    ||!['baseline_evaluating','quest_evaluating','boss_evaluating'].includes(blocked.fromLifecycle))throw new Error('planner_replay_not_eligible');
  const checkpoint=plannerCheckpoint({...cycle,lifecycle:blocked.fromLifecycle,decisionHistory:cycle.decisionHistory.slice(0,cycle.decisionHistory.indexOf(blocked))},opts);
  const directory=path.join(checkpoint.draftDir,'provider-receipts');
  const pointer=JSON.parse(fs.readFileSync(path.join(directory,`${checkpoint.stage}.stage.json`),'utf8'));
  if(!/^[a-f0-9]{64}$/.test(pointer.requestHash))throw new Error('planner_replay_receipt_invalid');
  const bytes=fs.readFileSync(path.join(directory,`${pointer.requestHash}.json`));
  const receipt=JSON.parse(bytes.toString('utf8'));
  if(receipt.status!=='received'||receipt.response?.plannerMessage?.stop_reason!=='tool_use')throw new Error('planner_replay_receipt_not_complete');
  const received=readPlannerToolReceipt(receipt.response,'decide_learning_cycle_progression');
  const content=(received as Record<string,unknown>).contentDecisions??[];
  assertContentDecisionShape(content);
  validateEvidenceBasedContentDecisions(content,new Set(chart.contentCatalog.items.map(item=>item.contentId)),progressionEvidence(cycle).decisionEvidenceIds);
  const decision=parseCanonicalProgressionDecision(received);
  const replay={blockedDecisionId:input.blockedDecisionId,requestHash:pointer.requestHash,receiptHash:createHash('sha256').update(bytes).digest('hex'),reason:input.reason.trim(),
    ...(decision.contentDecisions?.length?{deferredContentDecisions:decision.contentDecisions}:{})};
  const result=await decideOnce({childId:input.childId,homeworkId:input.homeworkId,decide:async()=>decision},opts,{...replay,fromLifecycle:blocked.fromLifecycle});
  console.log(` 🎮 [canonical-progression] [received-response] [replayed] homework=${cycle.homeworkId} blocked_decision=${blocked.decisionId} provider_calls=0`);
  if(replay.deferredContentDecisions?.length)console.log(` 🎮 [canonical-progression] [catalog-proposals] [deferred] count=${replay.deferredContentDecisions.length} reason=separate-profile-writes-not-in-replay-transaction`);
  return result;
}

/** Each spelling order that re-runs a built-in is that built-in's catalog reuse decision, cited by its own recorded answers. */
function spellingReuseFromOrders(cycle: LearningCycleRecordV2, decision: CanonicalProgressionDecision): EvidenceBasedContentDecision[] {
  return (decision.successor?.instruments ?? []).flatMap((order) => {
    const builtIn = order.spelling?.builtInActivityId ? cycle.nodes.find((node) => node.nodeId === order.spelling!.builtInActivityId) : undefined;
    const contentId = builtIn?.artifactBinding?.contentId;
    const items = new Set(Object.keys(builtIn?.evidenceContract.spellingItems ?? {}));
    const evidenceIds = cycle.observations.filter((row) => items.has(row.itemId)).map((row) => row.observationId);
    if (!contentId || !evidenceIds.length) return [];
    return [{ contentId, action: "reuse" as const, reason: `Re-run on the next board: ${decision.reason}`, evidenceIds }];
  }).filter((row, index, rows) => rows.findIndex((other) => other.contentId === row.contentId) === index);
}

function catalogedOnly(childId: string, decisions: EvidenceBasedContentDecision[], opts: LearningCycleRepositoryOptions): EvidenceBasedContentDecision[] {
  if (!decisions.length) return decisions;
  try {
    const cataloged = new Set(getChildChart(childId, opts).contentCatalog.items.map((item) => item.contentId));
    return decisions.filter((row) => cataloged.has(row.contentId));
  } catch (error) {
    console.warn(` 🎮 [content-catalog] [reuse-record] [skipped] child=${childId} reason=${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/** Math and encounter briefs: the Planner designs what the AI builder implements. */
const ARTIST_BRIEF = `You are the artist here, not a compliance function. Sunny holds the academic truth and the evidence limits; everything else is yours. Stakes, failure, consequence, escalation, pacing, tone, and payoff are your decisions to make and to defend, and you may change them run to run. You have full freedom to choose a game, simulation, manipulative, story, conversation, demonstration, or another fitting form.

Two things this Planner has gotten wrong before, stated plainly so you can avoid them:
- Do not name a stake and then remove it in the same breath. Phrases like "no penalty", "no hard fail", "not punitive", or "low-pressure" attached to a tension you just introduced produce an experience with nothing at risk, which children read as boring. If you want a real stake, let it cost something. If you want no stake, say so deliberately and own it — do not do both.
- Do not treat the engagement context as a list of things to avoid. It is observation with sample sizes attached, and dimensions too weakly evidenced to act on have already been withheld from you. A presentation that has not been seen to work is untested, not forbidden. Nothing in that context constrains stakes, difficulty, or consequence.`;

/** Spelling: the Planner is the doctor writing orders; Sunny runs each order with a tested built-in activity. */

/** Briefs for the AI builder. Spelling steps are orders for tested built-ins and never carry them. */
const DESIGN_FIELDS_SCHEMA = {
  creatorPrompt: { type: "string", minLength: 1 },
  stakesDesign: { type: "string", minLength: 1, description: "What is genuinely at risk for the child in this instrument, and what losing it costs them." },
  failureMode: { type: "string", minLength: 1, description: "How a run can end badly. If you decide it cannot be failed, say so and say why that serves this child right now." },
  escalation: { type: "string", minLength: 1, description: "How difficulty or pressure moves from the first moment to the last." },
  mechanicSpec: { type: "string", minLength: 1, description: "Concretely: what the child's finger or cursor does, what visibly moves in response, and what failure looks like on screen. Not an adjective or a genre name." },
  mathematicalHook: { type: "string", minLength: 1, description: "The surprising or satisfying thing about this specific mathematics that could make a child say whoa." },
} as const;

async function askPlanner(
  cycle: LearningCycleRecordV2,
  client?: Anthropic,
  model?: string,
  opts: LearningCycleRepositoryOptions = {},
  draw?: AdvanceInput["draw"],
): Promise<CanonicalProgressionDecision> {
  const toolName = "decide_learning_cycle_progression";
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const chart = getChildChart(cycle.childId, { rootDir: opts.rootDir });
  const {decisionEvidenceIds} = progressionEvidence(cycle);
  const isSynthetic = (id: string): boolean => /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(id);
  // Exclude dependent citations too: an ordinary-looking evaluation id can cite
  // an observation whose source identifies it as simulated.
  const excluded=new Set<string>();
  const histories=Object.values(chart.learningHistory.constructs);
  for(const history of histories) {
    for(const row of history.observations) if([row.observationId,row.sourceId].some(isSynthetic)) {excluded.add(row.observationId);excluded.add(row.sourceId);}
  }
  const excludedReference=(id:string)=>isSynthetic(id)||excluded.has(id);
  const dependencies=histories.flatMap(history=>[
    ...history.predictions.map(row=>({id:row.predictionId,references:row.evidenceIds})),
    ...history.evaluations.map(row=>({id:row.evaluationId,references:[row.predictionId,row.sourceId,...row.observationIds]})),
    ...history.decisions.map(row=>({id:row.decisionId,references:[...row.evidenceIds,...(row.predictionEvaluationIds??[])]})),
  ]);
  // Each changing pass excludes at least one of these finite record identities.
  for(let pass=0;pass<dependencies.length;pass++) {
    let changed=false;
    for(const row of dependencies) if(!excluded.has(row.id) && [row.id,...row.references].some(excludedReference)) {excluded.add(row.id);changed=true;}
    if(!changed) break;
  }
  const factualDecision = (row: LearningCycleRecordV2['decisionHistory'][number]) =>
    ![row.decisionId,...row.evidenceIds,...(row.predictionEvaluationIds??[])].some(excludedReference);
  const constructIds = new Set([
    ...cycle.academicPredictions.map(row=>row.constructId),
    ...cycle.observations.flatMap(row=>row.constructLinks.map(link=>link.constructId)),
  ]);
  const priorBoard = currentBoardInstance(cycle);
  const childContext = {
    identity: chart.identity,
    demographics: chart.demographics,
    childVoice: chart.childVoice,
    learningHistory: {
      constructs:Object.fromEntries(Object.entries(chart.learningHistory.constructs).filter(([id])=>constructIds.has(id) && !isSynthetic(id)).map(([id,history])=>[id,{
        constructId:id,
        predictions:history.predictions.filter(row=>!excludedReference(row.predictionId)),
        observations:history.observations.filter(row=>!excludedReference(row.observationId)),
        evaluations:history.evaluations.filter(row=>!excludedReference(row.evaluationId)),
        decisions:history.decisions.filter(factualDecision),
      }])),
      recentDecisions:chart.learningHistory.recentDecisions.filter(factualDecision),
      pendingInterpretation:chart.learningHistory.pendingInterpretation.filter(row=>![row.sourceId,...row.evaluationIds].some(excludedReference)),
    },
    priorPlan: {
      // Earlier author choices, not instructions or proof about the child.
      boardId:priorBoard.boardId,
      plannerDecisionId:priorBoard.plannerDecisionId,
      instruments:cycle.nodes.filter(node=>priorBoard.nodeIds.includes(node.nodeId)).map(({nodeId,academicTarget,mechanic,evidenceContract})=>({nodeId,academicTarget,mechanic,evidenceContract})),
    },
    engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory),

  };
  const factualEvidence = {
    academic: cycle.evidence.academic.filter((item) => !isSynthetic(item.evidenceId)),
    engagement: cycle.evidence.engagement.filter((item) => !isSynthetic(item.evidenceId)),
    companionObservations: cycle.evidence.companionObservations
      .filter((item) => !isSynthetic(item.evidenceId)),
  };
  const factualObservations = cycle.observations.filter((observation) =>
    !isSynthetic(observation.observationId) && !isSynthetic(observation.sourceId)
  );
  const baselineEligibility = baselineQuestEvidenceEligibility(cycle);
  const allowedProgressionActions: LearningProgressionAction[] = cycle.lifecycle === "baseline_evaluating" && !baselineEligibility.eligible
    ? ["generate_support", "collect_more_evidence"]
    : ["generate_support", "generate_quest", "generate_boss", "collect_more_evidence", "await_calibration"];
  const plannerModel = model ?? (cycle.domain === "spelling" ? process.env.SUNNY_EXPERIENCE_PLANNER_MODEL : undefined) ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  const savedSpellingItems = spellingAssignmentItems(cycle);
  const builtIns = spellingBuiltInActivities(cycle);
  const legacyContentSchema = {type:'array',items:{type:'object',additionalProperties:false,properties:{contentId:{type:'string'},action:{type:'string',enum:['candidate','reuse','revise','retire']},reason:{type:'string'},evidenceIds:{type:'array',items:{type:'string'}}},required:['contentId','action','reason','evidenceIds']}};
  const instrumentSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      nodeId: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      academicTarget: { type: "string", minLength: 1 },
      mechanic: { type: "string", minLength: 1 },
      theme: { type: "string", minLength: 1 },
      openingPurpose: { type: "string", minLength: 1 },
      ...(cycle.domain === "math" ? { items: MATH_ITEMS_SCHEMA } : {}),
      encounter: { type: "string", enum: ["quest", "boss"], description: "Only on the single Quest or Boss node your progressionAction authorizes." },
      ...DESIGN_FIELDS_SCHEMA,
    },
    required: ["nodeId", "title", "academicTarget", "mechanic", "theme", "openingPurpose", ...(cycle.domain === "math" ? ["items"] : []), ...Object.keys(DESIGN_FIELDS_SCHEMA)],
  };
  // The raw response is checkpointed before validation; a restart from the same
  // frozen snapshot replays it and makes no new provider call (contract 21).
  // One checkpoint per closed evidence batch: keyed by the transition that closed it, so practice
  // replays and recorded prediction evaluations cannot turn a restart into a new paid call.
  const {batchId, revision:checkpointRevision, draftDir, stage:decisionStage} = plannerCheckpoint(cycle,opts);
  const snapshot = {
    childId: cycle.childId, homeworkId: cycle.homeworkId, batchId, lifecycle: cycle.lifecycle,
    cycleRevision: checkpointRevision,
    observationIds: cycle.observations.filter((observation) => observation.provenance !== "practice").map((observation) => observation.observationId),
    model: plannerModel,
  };
  // Spelling decides through small locked tools. A decision already received through the retired
  // single form, and a citation patch received for it, replay read only; that form is never sent again.
  if(cycle.domain==='spelling'){
    const savedDecision=readReceivedMathProviderStage(draftDir,decisionStage);
    if(savedDecision!==undefined){
      const patchStage=`progression-citation-patch-r${checkpointRevision}`;
      const patch=hasReceivedMathProviderStage(draftDir,patchStage)?readPlannerToolReceipt(readReceivedMathProviderStage(draftDir,patchStage),toolName) as Record<string,unknown>:{};
      const decision=parseCanonicalProgressionDecision({...readPlannerToolReceipt(savedDecision,toolName) as Record<string,unknown>,...patch});
      assertPredictionCitations(decision,cycle);
      console.log(` 🎮 [canonical-progression] [saved-decision] [replayed] homework=${cycle.homeworkId} revision=${checkpointRevision}`);
      return decision;
    }
    const evaluationIds=cycle.predictionEvaluations.map(evaluation=>evaluation.evaluationId);
    // Quest and Boss encounters are planned features spelling cannot run yet; they are not offered.
    const actions=allowedProgressionActions.filter(action=>action!=="generate_quest"&&action!=="generate_boss");
    const facts={builtIns:builtIns.map(node=>{const items=Object.values(node.evidenceContract.spellingItems??{});const roles=Object.values(node.evidenceContract.itemRoles??{});
      return {nodeId:node.nodeId,title:node.title,implementationType:node.implementationType??"word-radar",wordIds:[...new Set(items.map(item=>item.wordId))],responseMode:items[0]?.response.mode??"spelling_letters",checkpoint:roles.length>0&&roles.every(role=>role==="fresh_checkpoint")};}),
      // The Teaching board's own menu: every certified game and mode, set up fresh for the words she is given.
      activities:(()=>{const menu=spellingActivityMenu(spellingActivityCatalog(cycle.childId));return menu.choices.map(id=>({id,checkpoint:menu.roles(id).includes("fresh_checkpoint"),setup:menu.setup(id)}));})(),
      evaluationIds,allowedActions:actions,idPrefix:`${cycle.homeworkId}-r${checkpointRevision}-step`,
      // The same check the re-run step applies, asked while the Planner is still choosing.
      rerunnable:(nodeId:string,wordIds:string[])=>{const source=builtIns.find(node=>node.nodeId===nodeId);return Boolean(source&&repointReusedSetup(source,`${nodeId}-check`,wordIds.map(wordId=>({id:`check:${wordId}`,wordId}))));}};
    const prompt=`You are Sunny's AI Planner, her spelling tutor. The goal: she wants to come back to Sunny, and she knows her words by the school test. Compare your preregistered theory and predictions with what she actually did and said, decide what happens next, and build her next board, using the tools.
1. decide: one evidence-grounded decision. Cite the prediction evaluations you judge.
2. Unless you await calibration, build the next board: add_step for each step, then set_order and, when she should pick her path, add_choice. Then finish_board.
Sunny runs each step as you write it. The board she has now stays as it is; yours opens at a later session. The kiosk screen shows up to 7 stops along any one path, counting the start, the choice and the finish. Title each step as she should see it. Per-word response time, assistance, exposure and response mode are in the evidence below; Elli talks with her during each activity.
Games and modes on the menu (a hidden-word Radar is an independent check; the rest are practice):
${JSON.stringify(facts.activities.map(row=>row.id))}
Tested built-in activities she played, which you may re-run:
${JSON.stringify(facts.builtIns.map(row=>({builtIn:row.nodeId,title:row.title,type:row.implementationType,words:row.wordIds.length,checkpoint:row.checkpoint})))}
Saved spelling words:
${JSON.stringify([...savedSpellingItems.values()].map(item=>({wordId:item.wordId,word:item.word})))}
Child chart context:
${JSON.stringify(childContext, null, 2)}
Baseline Quest eligibility (runtime truth boundary, not a mastery judgment):
${JSON.stringify(baselineEligibility, null, 2)}
Allowed progression actions: ${actions.join(", ")}
Cycle:
${JSON.stringify({ lifecycle: cycle.lifecycle, assignment: cycle.assignment, theory: cycle.academicTheory, predictions: cycle.academicPredictions, predictionEvaluations: cycle.predictionEvaluations, evidence: factualEvidence, observations: factualObservations, nodes: cycle.nodes.map((node) => ({ nodeId: node.nodeId, role: node.role, title: node.title, state: node.state, routeId: node.routeId, evidenceIds: node.evidenceIds.filter((id) => !isSynthetic(id)) })) }, null, 2)}`;
    // The question is frozen when its evidence batch closes: a restart asks the same question and replays
    // the saved turns at no cost, whatever has been recorded since.
    const frozenFile=path.join(draftDir,`${decisionStage}-tools.question.json`);
    const {rerunnable,...factData}=facts;
    const question=fs.existsSync(frozenFile)?JSON.parse(fs.readFileSync(frozenFile,"utf8")) as {prompt:string;model:string;facts:typeof factData}:{prompt,model:plannerModel,facts:factData};
    if(!fs.existsSync(frozenFile)){fs.mkdirSync(draftDir,{recursive:true});fs.writeFileSync(`${frozenFile}.tmp`,JSON.stringify(question));fs.renameSync(`${frozenFile}.tmp`,frozenFile);}
    const kit=spellingSuccessorToolkit({...question.facts,rerunnable});
    const loop=await runPlannerToolLoop({label:"spelling-next-board",prompt:question.prompt,model:question.model,maxTokens:16000,tools:kit.tools,state:kit.initialState(),finished:kit.finished,
      send:providerTurnSender({label:"spelling-next-board",stagePrefix:`${decisionStage}-tools`,draftDir,client:anthropic})});
    console.log(` 🎮 [canonical-progression] [planner-response] [checkpointed] homework=${cycle.homeworkId} revision=${cycle.revision} tools=${loop.stats.stop}`);
    if(!kit.finished(loop.state))throw new Error(`canonical_progression_tools_unfinished:${loop.stats.stop}`);
    const {decision,journey}=kit.result(loop.state);
    if(!journey)return parseCanonicalProgressionDecision(decision);
    const drawing=draw?await draw(journey):await drawJourney({journey,label:`${cycle.homeworkId}:r${checkpointRevision}`,stagePrefix:`${decisionStage}-design`,identity:{childId:cycle.childId,homeworkId:cycle.homeworkId,batchId,journey},child:chart.childVoice,
      checkpointFile:path.join(draftDir,`${decisionStage}-design.json`),rawResponseDir:draftDir,...(client?{client}:{})});
    return parseCanonicalProgressionDecision({...decision,boardDefinition:assembleAdventureBoardDefinition(journey,drawing.composition,drawing.pattern)});
  }
  let request = {
    model: plannerModel,
    // A complete successor program and board exceeded the former 6,000-token allowance.
    max_tokens: 32000,
    messages: [{ role: "user", content: `You are Sunny's AI Planner. Compare the preregistered academic theory and predictions with the factual scorecard. Quest requires a captured, correct, unseen independent checkpoint. Practice cannot satisfy that boundary. For math, author nextItems with stable unique ids, prompts, lineage, and frozen response contracts. Include fresh checkpoint evidence when further progression is intended. Explanation responses remain unscored and cannot independently unlock progression. Never reuse exposed item ids or prompts. Quest tests unseen transfer; Boss tests unseen synthesis; Boss must end awaiting calibration. Call ${toolName} exactly once with one concise decision. Unless progressionAction is await_calibration, author the one complete next board in nextInstruments: you decide how many activities it has. ${BOARD_AUTHORING_INSTRUCTION} The current board is never changed; your program becomes a new board for a later session. Mark exactly one instrument with encounter "quest" only when progressionAction is generate_quest, or "boss" only when it is generate_boss; never add an encounter otherwise.

${ARTIST_BRIEF}

Title each instrument as the child should see it. It appears as the first thing on their screen, so give it a real name, not a category label.

For math, do not copy assignment items or name a prototype to imitate. If evidence is insufficient, prescribe a focused harder or clarifying support board rather than a generic quiz.
For spelling, each instrument must prescribe spelling.wordIds from the saved word identities below, a measurementRole, and a responseMode. You choose which words need teaching or practice and when to collect fresh recall. The server binds the saved spellings and new occasion IDs; you cannot replace answer keys or reset exposure. Fresh recall after practice is not unseen transfer or delayed retention. Include initially secure and targeted words when prescribing a final assignment check.
Saved spelling words:
${JSON.stringify([...savedSpellingItems.values()].map(item => ({ wordId: item.wordId, word: item.word, responseMode: item.response.mode })))}
Tested built-in activities (spelling.builtInActivityId; wordIds are that activity's words):
${JSON.stringify(builtIns.map(node => ({ activityId: node.nodeId, type: node.implementationType, title: node.title, wordIds: [...new Set(Object.values(node.evidenceContract.spellingItems ?? {}).map(item => item.wordId))], checkpoint: Object.values(node.evidenceContract.itemRoles ?? {}).length > 0 && Object.values(node.evidenceContract.itemRoles ?? {}).every(role => role === "fresh_checkpoint") })))}
For spelling, Correct practice after long response time is not effortless recall. Examine per-word response time alongside assistance, exposure, response mode, and instrument ambiguity. When the evidence suggests a child is struggling, author teaching and guided practice before another fresh recall check; let Elli respond conversationally from the live item and child context. Do not infer mastery from supported or partial-visibility practice, and do not use a fixed latency threshold to choose the lesson.

Child chart context:
${JSON.stringify(childContext, null, 2)}

Baseline Quest eligibility (runtime truth boundary, not a mastery judgment):
${JSON.stringify(baselineEligibility, null, 2)}
Allowed progression actions for this lifecycle: ${allowedProgressionActions.join(", ")}

Cycle:
${JSON.stringify({ lifecycle: cycle.lifecycle, assignment: cycle.assignment, theory: cycle.academicTheory, predictions: cycle.academicPredictions, predictionEvaluations: cycle.predictionEvaluations, evidence: factualEvidence, observations: factualObservations, nodes: cycle.nodes.map((node) => ({ nodeId: node.nodeId, role: node.role, title: node.title, state: node.state, routeId: node.routeId, evidenceIds: node.evidenceIds.filter((id) => !isSynthetic(id)) })) }, null, 2)}` }],
    tools: [{
      name: toolName,
      description: "Return one evidence-grounded progression decision.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"],
          },
          reason: { type: "string" },
          progressionAction: {
            type: "string",
            enum: allowedProgressionActions,
          },
          preserve: { type: "array", items: { type: "string" } },
          change: { type: "array", items: { type: "string" } },
          testNext: { type: "array", items: { type: "string" } },
          nextEvidenceRequired: { type: "array", items: { type: "string" } },
          predictionEvaluationIds: { type: "array", items: { type: "string" } },
          contentDecisions: legacyContentSchema,
          revisedHypothesis: { type: "string" },
          nextInstruments: { type: "array", minItems: 1, items: instrumentSchema },
          boardDefinition: BOARD_DEFINITION_TOOL_SCHEMA,
        },
        required: [
          "status",
          "reason",
          "progressionAction",
          "preserve",
          "change",
          "testNext",
          "nextEvidenceRequired",
          "predictionEvaluationIds",
          // Required so a decision cannot omit its successor; await_calibration's program is ignored.
          "nextInstruments",
        ],
      },
    }],
    tool_choice: { type: "tool", name: toolName },
  } satisfies Parameters<typeof requestPlannerMessage>[1];
  // Freeze new requests before purchase. Legacy stage hashes remain readable;
  // a received old answer is never silently replaced by a changed prompt/budget.
  const frozen=freezePlannerRequest({draftDir,stage:decisionStage,request,legacyContext:snapshot});
  request=frozen.request;
  const rawDecision = await runMathProviderStage({draftDir,stage:decisionStage,model:request.model,request:frozen.receiptContext,beforeRequest:frozen.beforeRequest,execute:async()=>({plannerMessage:await requestPlannerMessage(anthropic,request,{timeout:frozen.timeout})})});
  console.log(` 🎮 [canonical-progression] [planner-response] [checkpointed] homework=${cycle.homeworkId} revision=${cycle.revision}`);
  const received = readPlannerToolReceipt(rawDecision, toolName);
  const decision = parseCanonicalProgressionDecision(received);
  assertPredictionCitations(decision,cycle);
  return decision;
}

type AdvanceInput = {
  childId: string;
  homeworkId: string;
  client?: Anthropic;
  model?: string;
  decide?: (cycle: LearningCycleRecordV2) => Promise<CanonicalProgressionDecision>;
  /** Draws the next board's journey; the map artist when omitted. Tests pass a plain layout. */
  draw?: (journey: AdventureJourneyDefinition) => Promise<{ composition: AdventureBoardComposition; pattern?: string }>;
};

/**
 * One evidence-cited Planner decision for a closed batch. A provider decision that fails validation,
 * or whose outcome is uncertain, blocks the cycle visibly instead of replaying or re-buying it forever.
 */
export async function advanceCanonicalCycleFromEvidence(
  input: AdvanceInput,
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  try {
    return await decideOnce(input, opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = Boolean((error as { status?: number }).status)
      || /^(learning_cycle_revision_conflict|provider_request_rejected|learning_cycle_missing)/.test(message);
    const latest = !input.decide && !retryable ? getLearningCycle(input.childId, input.homeworkId, opts) : null;
    if (latest && ["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(latest.lifecycle)) {
      const reason = message.startsWith("provider_outcome_uncertain") ? message : `planner_decision_invalid:${message}`;
      transitionLearningCycle(latest.childId, latest.homeworkId, latest.revision, { type: "block", reason }, opts);
      console.error(` 🎮 [canonical-progression] [blocked] homework=${latest.homeworkId} reason=${reason}`);
    }
    throw error;
  }
}

async function decideOnce(
  input: AdvanceInput,
  opts: LearningCycleRepositoryOptions,
  replay?:NonNullable<LearningCycleDecision['replayedResponse']>&{fromLifecycle:LearningCycleRecordV2['lifecycle']},
): Promise<LearningCycleRecordV2> {
  let cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if(replay)cycle={...cycle,lifecycle:replay.fromLifecycle};
  if (!["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(cycle.lifecycle)) return cycle;
  const calculated = replay ? [] : evaluateAcademicPredictions(cycle.academicPredictions, cycle.observations, (opts.now ?? new Date()).toISOString());
  const missing = calculated.filter((evaluation) => !cycle!.predictionEvaluations.some((saved) => saved.evaluationId === evaluation.evaluationId));
  if (missing.length > 0) {
    cycle = transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
      type: "prediction_evaluations_recorded",
      evaluations: missing,
    }, opts);
  }
  const plannerDecision = input.decide ? await input.decide(cycle) : await askPlanner(cycle, input.client, input.model, opts, input.draw);
  const decision = resolveCanonicalProgressionDecisionForLifecycle(cycle.lifecycle, plannerDecision);
  const instruments = decision.successor?.instruments ?? [];
  if (cycle.domain === "math") {
    for (const instrument of instruments) {
      const items = instrument.items;
      if (!items?.length || new Set(items.map(item => item.id)).size !== items.length) throw new Error("math_instrument_requires_unique_frozen_items");
      instrument.items = items.map(parseDirectItem);
    }
  }
  assertPredictionCitations(decision,cycle);
  const citedEvaluationIds = decision.predictionEvaluationIds ?? [];
  if (cycle.lifecycle === "baseline_evaluating"
    && decision.progressionAction === "generate_quest"
    && !baselineQuestEvidenceEligibility(cycle).eligible) {
    throw new Error("canonical_progression_quest_requires_eligible_baseline_evidence");
  }
  if (cycle.lifecycle === "quest_evaluating" && !["generate_boss", "generate_support", "await_calibration"].includes(decision.progressionAction)) {
    throw new Error("canonical_progression_quest_action_invalid");
  }
  if (cycle.lifecycle === "quest_evaluating" && decision.progressionAction === "generate_boss") {
    const completedQuests = cycle.nodes.filter((node) => node.role === "quest" && node.state === "completed");
    const hasUnassistedUnseenQuestEvidence = cycle.observations.some((observation) =>
      completedQuests.some((quest) => observation.sourceId.endsWith(`:${quest.nodeId}`)) &&
      observation.provenance === "independent_probe" &&
      observation.exposure === "unseen" &&
      observation.assistance.status === "unassisted");
    if (!hasUnassistedUnseenQuestEvidence) {
      throw new Error("canonical_progression_boss_requires_unseen_quest_evidence");
    }
  }
  if (cycle.lifecycle === "boss_evaluating" && decision.progressionAction !== "await_calibration") {
    throw new Error("canonical_progression_boss_requires_calibration");
  }
  const expectedEncounter = decision.progressionAction === "generate_quest" ? "quest" : decision.progressionAction === "generate_boss" ? "boss" : undefined;
  const encounters = instruments.filter((instrument) => instrument.encounter);
  if (encounters.some((instrument) => instrument.encounter !== expectedEncounter) || encounters.length > 1) {
    throw new Error("canonical_progression_encounter_not_authorized");
  }
  if (expectedEncounter && encounters.length === 0) throw new Error("canonical_progression_encounter_missing");
  const {evidenceIds,decisionEvidenceIds} = progressionEvidence(cycle);
  const latest = getLearningCycle(cycle.childId, cycle.homeworkId, opts);
  if (!latest) throw new Error(`learning_cycle_missing:${cycle.homeworkId}`);
  // The decision belongs to the evidence batch that closed; anything recorded since (practice replays,
  // engagement bookkeeping, session notes) is evidence for the next decision, never a reason to discard
  // this one. The transition below still applies only at the latest revision.
  // The one real guard: a cycle that left this stage meanwhile (paused, or already decided) takes no decision.
  // An explicit operator replay of a received decision onto its blocked cycle is the one exception.
  if (!replay && latest.lifecycle !== cycle.lifecycle) throw new Error(`canonical_progression_stage_changed:${cycle.lifecycle}->${latest.lifecycle}`);
  if (latest.revision !== cycle.revision) console.log(` 🎮 [canonical-progression] [later-evidence-kept] fromRevision=${cycle.revision} toRevision=${latest.revision}`);
  // Catalog records never fail a decision: an order whose built-in has no catalog entry (or no readable chart) records nothing.
  const contentDecisions = cycle.domain === "spelling" ? catalogedOnly(cycle.childId, spellingReuseFromOrders(cycle, decision), opts) : decision.contentDecisions;
  if (!replay && contentDecisions?.length) {
    applyEvidenceBasedMathContentDecisions(cycle.childId, contentDecisions, decisionEvidenceIds, opts);
  }
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, latest.revision, {
    type: "theory_decided",
    decision: {
      ...decision,
      nextAction: decision.progressionAction,
      evidenceIds,
      predictionEvaluationIds: citedEvaluationIds,
      ...(replay?{replayedResponse:{blockedDecisionId:replay.blockedDecisionId,requestHash:replay.requestHash,receiptHash:replay.receiptHash,reason:replay.reason,...(replay.deferredContentDecisions?{deferredContentDecisions:replay.deferredContentDecisions}:{})}}:{}),
    },
  }, opts);
}
