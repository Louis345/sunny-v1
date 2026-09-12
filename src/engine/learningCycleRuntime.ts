import { MATH_ITEMS_SCHEMA, parseDirectItem, type DirectItem } from "./directMathExperience";
import Anthropic from "@anthropic-ai/sdk";
import { getChildChart } from "../profiles/childChart";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import { evaluateAcademicPredictions } from "./longitudinalLearning";
import {
  applyEvidenceBasedMathContentDecisions,
  type EvidenceBasedContentDecision,
} from "./learningDecisionContext";
import {
  getLearningCycle,
  transitionLearningCycle,
  type LearningCycleEvidenceSummary,
  type LearningCycleRecordV2,
  type LearningCycleRepositoryOptions,
  type LearningObservation,
  type LearningCycleSpellingItem,
  type LearningProgressionAction,
  type NextInstrumentPrescription,
} from "./learningCycleRepository";
import { areDistinctWordsPronunciationEquivalent } from "../shared/karaokeMatchWord";

export type CanonicalCompletionResult = {
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
    scaffoldLevel?: number;
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
  nextInstrument?: NextInstrumentPrescription;
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
    nextInstrument: undefined,
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
  if (node.role !== "evaluation" && !["ready", "active"].includes(node.state)) throw new Error("spelling_instrument_not_active");
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
  const spellingItems = node.evidenceContract.spellingItems;
  if (node.state !== "completed" && spellingItems && Object.values(spellingItems).every(item => item.lineage.measurementRole === "fresh_checkpoint")) {
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
  const companionHelp = (input.result.companionInteractions?.length ?? 0) > 0;
  const previouslyExposedItemIds = new Set(input.cycle.observations.map((observation) => observation.itemId));
  return rows.map((row, index) => {
    const item = node.evidenceContract.itemContracts?.[row.target];
    const measurementRole = item?.lineage.measurementRole ?? itemRoles?.[row.target] ?? "practice";
    const scaffolded = Number(row.scaffoldLevel ?? 0) > 0 || companionHelp;
    const repeatedAssessmentItem = node.state === "completed" || previouslyExposedItemIds.has(row.target);
    const spellingItem = spellingItems?.[row.target];
    const responseNotCaptured = isUncapturedResponse(row.attemptedValue, input.cycle.domain === "math" || Boolean(spellingItems));
    const result = responseNotCaptured ? { observedErrorType: "response_not_captured" } : spellingItems ? scoreSpellingRecall(spellingItem, row.attemptedValue!) : input.cycle.domain === "math" ? scoreMathResponse(item, row.attemptedValue!) : { correct: row.correct, score: row.correct ? 1 : 0 };
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
      ...(row.attemptedValue ? { childResponse: row.attemptedValue } : {}),
      constructLinks: [{ constructId: spellingItem?.constructId ?? constructId, role: "primary", confidence: 1 }],
      result,
      assistance: {
        status: scaffolded ? "assisted" : spellingItems ? "unknown" : "unassisted",
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
  const agencyNodeLaunchable = !experiment || !isAgencyNode
    ? undefined
    : firstIncompleteShared
      ? node.nodeId === firstIncompleteShared
      : node.nodeId === firstIncompleteSelected;
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
  const engagementEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId: `${evidenceId}:engagement`,
    summary: `${node.title} completed in ${Math.max(0, input.result.timeSpent_ms)}ms; won=${input.result.won ?? "unreported"}; replay=${node.state === "completed"}; frustration=${(input.result.frustrationSignals ?? []).join(",") || "none"}.`,
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
  const keys = ["nodeId", "title", "academicTarget", "mechanic", "theme", "openingPurpose", "creatorPrompt"] as const;
  if (keys.some((key) => typeof row[key] !== "string" || !String(row[key]).trim())) return undefined;
  // Design decisions are optional so an older Planner response still parses,
  // but they are carried through whenever the Planner supplies them.
  const designKeys = ["stakesDesign", "failureMode", "escalation", "mechanicSpec", "mathematicalHook"] as const;
  return {
    ...(Array.isArray(row.items) ? { items: row.items.map(parseDirectItem) } : {}),
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
  const nextInstrument = parseNextInstrument(row.nextInstrument) ?? parseNextInstrument({
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
  });
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
  if (["generate_support", "generate_quest", "generate_boss"].includes(String(row.progressionAction)) && !nextInstrument) {
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
    throw new Error(`canonical_progression_${String(row.progressionAction).replace("generate_", "")}_prescription_missing`);
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
    ...(nextInstrument ? { nextInstrument } : {}),
  };
}

async function askPlanner(
  cycle: LearningCycleRecordV2,
  client?: Anthropic,
  model?: string,
  opts: LearningCycleRepositoryOptions = {},
): Promise<CanonicalProgressionDecision> {
  const toolName = "decide_learning_cycle_progression";
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const chart = getChildChart(cycle.childId, { rootDir: opts.rootDir });
  const childContext = {
    identity: chart.identity,
    demographics: chart.demographics,
    engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory),
  };
  const isSynthetic = (id: string): boolean =>
    /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(id);
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
  const response = await anthropic.messages.create({
    model: model ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    // The prescription now carries five additional design fields; 2600 truncated them.
    max_tokens: 6000,
    messages: [{ role: "user", content: `You are Sunny's AI Planner. Compare the preregistered academic theory and predictions with the factual scorecard. Quest requires a captured, correct, unseen independent checkpoint. Practice cannot satisfy that boundary. For math, author nextItems with stable unique ids, prompts, lineage, and frozen response contracts. Include fresh checkpoint evidence when further progression is intended. Explanation responses remain unscored and cannot independently unlock progression. Never reuse exposed item ids or prompts. Quest tests unseen transfer; Boss tests unseen synthesis; Boss must end awaiting calibration. Return exactly one concise decision and always propose one complete next instrument using the required next* fields. Runtime uses that proposal only when progressionAction generates an instrument.

You are the artist here, not a compliance function. Sunny holds the academic truth and the evidence limits; everything else is yours. Stakes, failure, consequence, escalation, pacing, tone, and payoff are your decisions to make and to defend, and you may change them run to run. You have full freedom to choose a game, simulation, manipulative, story, conversation, demonstration, or another fitting form.

Two things this Planner has gotten wrong before, stated plainly so you can avoid them:
- Do not name a stake and then remove it in the same breath. Phrases like "no penalty", "no hard fail", "not punitive", or "low-pressure" attached to a tension you just introduced produce an experience with nothing at risk, which children read as boring. If you want a real stake, let it cost something. If you want no stake, say so deliberately and own it — do not do both.
- Do not treat the engagement context as a list of things to avoid. It is observation with sample sizes attached, and dimensions too weakly evidenced to act on have already been withheld from you. A presentation that has not been seen to work is untested, not forbidden. Nothing in that context constrains stakes, difficulty, or consequence.

Title the instrument as the child should see it. It appears as the first thing on their screen, so give it a real name, not a category label.

Do not copy assignment items or name a prototype to imitate. If evidence is insufficient, prescribe exactly one concise harder or clarifying support instrument rather than a generic quiz.

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
          contentDecisions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                contentId: { type: "string" },
                action: { type: "string", enum: ["candidate", "reuse", "revise", "retire"] },
                reason: { type: "string" },
                evidenceIds: { type: "array", items: { type: "string" } },
              },
              required: ["contentId", "action", "reason", "evidenceIds"],
            },
          },
          revisedHypothesis: { type: "string" },
          nextNodeId: { type: "string", minLength: 1 },
          nextTitle: { type: "string", minLength: 1 },
          nextAcademicTarget: { type: "string", minLength: 1 },
          nextMechanic: { type: "string", minLength: 1 },
          nextTheme: { type: "string", minLength: 1 },
          nextOpeningPurpose: { type: "string", minLength: 1 },
          nextCreatorPrompt: { type: "string", minLength: 1 },
          ...(cycle.domain === "math" ? { nextItems: MATH_ITEMS_SCHEMA } : {}),
          nextStakesDesign: {
            type: "string",
            minLength: 1,
            description: "What is genuinely at risk for the child in this instrument, and what losing it costs them.",
          },
          nextFailureMode: {
            type: "string",
            minLength: 1,
            description: "How a run can end badly. If you decide it cannot be failed, say so and say why that serves this child right now.",
          },
          nextEscalation: {
            type: "string",
            minLength: 1,
            description: "How difficulty or pressure moves from the first moment to the last.",
          },
          nextMechanicSpec: {
            type: "string",
            minLength: 1,
            description: "Concretely: what the child's finger or cursor does, what visibly moves in response, and what failure looks like on screen. Not an adjective or a genre name.",
          },
          nextMathematicalHook: {
            type: "string",
            minLength: 1,
            description: "The surprising or satisfying thing about this specific mathematics that could make a child say whoa.",
          },
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
          "nextNodeId",
          "nextTitle",
          "nextAcademicTarget",
          "nextMechanic",
          "nextTheme",
          "nextOpeningPurpose",
          "nextCreatorPrompt",
          ...(cycle.domain === "math" ? ["nextItems"] : []),
          "nextStakesDesign",
          "nextFailureMode",
          "nextEscalation",
          "nextMechanicSpec",
          "nextMathematicalHook",
        ],
      },
    }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const tool = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!tool || tool.type !== "tool_use") throw new Error("canonical_progression_tool_output_missing");
  return parseCanonicalProgressionDecision(tool.input);
}

export async function advanceCanonicalCycleFromEvidence(
  input: {
    childId: string;
    homeworkId: string;
    client?: Anthropic;
    model?: string;
    decide?: (cycle: LearningCycleRecordV2) => Promise<CanonicalProgressionDecision>;
  },
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  let cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (!["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(cycle.lifecycle)) return cycle;
  const calculated = evaluateAcademicPredictions(cycle.academicPredictions, cycle.observations, (opts.now ?? new Date()).toISOString());
  const missing = calculated.filter((evaluation) => !cycle!.predictionEvaluations.some((saved) => saved.evaluationId === evaluation.evaluationId));
  if (missing.length > 0) {
    cycle = transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
      type: "prediction_evaluations_recorded",
      evaluations: missing,
    }, opts);
  }
  const plannerDecision = input.decide ? await input.decide(cycle) : await askPlanner(cycle, input.client, input.model, opts);
  const decision = resolveCanonicalProgressionDecisionForLifecycle(cycle.lifecycle, plannerDecision);
  if (cycle.domain === "math" && ["generate_support", "generate_quest", "generate_boss"].includes(decision.progressionAction)) {
    const items = decision.nextInstrument?.items;
    if (!items?.length || new Set(items.map(item => item.id)).size !== items.length) throw new Error("math_instrument_requires_unique_frozen_items");
    decision.nextInstrument!.items = items.map(parseDirectItem);
  }
  const allowedEvaluationIds = new Set(cycle.predictionEvaluations.map((evaluation) => evaluation.evaluationId));
  const citedEvaluationIds = decision.predictionEvaluationIds ?? [];
  if (citedEvaluationIds.some((id) => !allowedEvaluationIds.has(id))) throw new Error("canonical_progression_unknown_prediction_evaluation");
  if (allowedEvaluationIds.size > 0 && citedEvaluationIds.length === 0) throw new Error("canonical_progression_prediction_evaluation_citation_required");
  if (cycle.lifecycle === "baseline_evaluating"
    && decision.progressionAction === "generate_quest"
    && !baselineQuestEvidenceEligibility(cycle).eligible) {
    throw new Error("canonical_progression_quest_requires_eligible_baseline_evidence");
  }
  if (cycle.lifecycle === "quest_evaluating" && !["generate_boss", "generate_support", "await_calibration"].includes(decision.progressionAction)) {
    throw new Error("canonical_progression_quest_action_invalid");
  }
  if (cycle.lifecycle === "quest_evaluating" && decision.progressionAction === "generate_boss") {
    const quest = cycle.nodes.find((node) => node.role === "quest");
    const hasUnassistedUnseenQuestEvidence = quest && cycle.observations.some((observation) =>
      observation.sourceId.endsWith(`:${quest.nodeId}`) &&
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
  const evidenceIds = [...new Set([
    ...cycle.evidence.academic.map((item) => item.evidenceId),
    ...cycle.evidence.engagement.map((item) => item.evidenceId),
  ].filter((id) => !/(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(id)))];
  const decisionEvidenceIds = new Set([
    ...evidenceIds,
    ...cycle.observations.map((observation) => observation.observationId),
    ...cycle.predictionEvaluations.map((evaluation) => evaluation.evaluationId),
  ]);
  const latest = getLearningCycle(cycle.childId, cycle.homeworkId, opts);
  if (!latest) throw new Error(`learning_cycle_missing:${cycle.homeworkId}`);
  if (latest.revision !== cycle.revision) {
    const intervening = latest.decisionHistory.slice(cycle.decisionHistory.length);
    const replayOnly = latest.lifecycle === cycle.lifecycle && intervening.length === latest.revision - cycle.revision &&
      intervening.every(event => event.eventType === "instrument_observed" && event.fromLifecycle === cycle.lifecycle && event.toLifecycle === cycle.lifecycle) &&
      latest.observations.slice(cycle.observations.length).every(observation => observation.provenance === "practice");
    if (!replayOnly) throw new Error("canonical_progression_context_changed");
    console.log(` 🎮 [canonical-progression] [replay-preserved] fromRevision=${cycle.revision} toRevision=${latest.revision}`);
  }
  if (decision.contentDecisions?.length) {
    applyEvidenceBasedMathContentDecisions(cycle.childId, decision.contentDecisions, decisionEvidenceIds, opts);
  }
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, latest.revision, {
    type: "theory_decided",
    decision: {
      ...decision,
      nextAction: decision.progressionAction,
      evidenceIds,
      predictionEvaluationIds: citedEvaluationIds,
    },
  }, opts);
}
