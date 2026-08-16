import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import {
  getLearningCycle,
  transitionLearningCycle,
  type LearningCycleEvidenceSummary,
  type LearningCycleRecordV2,
  type LearningCycleRepositoryOptions,
  type LearningObservation,
  type LearningProgressionAction,
  type NextInstrumentPrescription,
} from "./learningCycleRepository";

export type CanonicalCompletionResult = {
  completed: boolean;
  accuracy: number;
  timeSpent_ms: number;
  targetResults?: Array<{
    target: string;
    correct?: boolean;
    attemptedValue?: string;
    responseTime_ms?: number;
    scaffoldLevel?: number;
    observedErrorType?: string;
    assistanceStatus?: "unassisted" | "assisted" | "unknown";
    confounds?: string[];
    resolutionId?: string;
    attemptId?: string;
    supersedesAttemptId?: string;
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
  revisedHypothesis?: string;
  nextInstrument?: NextInstrumentPrescription;
};

export type BaselineQuestEvidenceEligibility = {
  eligible: boolean;
  targetAlignedObservationCount: number;
  independentCorrectObservationCount: number;
  reason: "eligible_independent_correct_evidence" | "no_target_aligned_baseline_evidence" | "no_independent_correct_baseline_evidence";
};

export type QuestBossEvidenceEligibility = {
  eligible: boolean;
  targetAlignedObservationCount: number;
  correctObservationCount: number;
  qualifyingObservationCount: number;
  reason:
    | "eligible_fresh_correct_unassisted_quest_evidence"
    | "no_target_aligned_quest_evidence"
    | "no_correct_quest_evidence"
    | "no_fresh_unassisted_quest_evidence";
};

function observationBelongsToNode(cycle: LearningCycleRecordV2, observation: LearningObservation, nodeIds: Set<string>): boolean {
  if (observation.nodeId) return nodeIds.has(observation.nodeId);
  const matchedNodeId = cycle.nodes
    .map((node) => node.nodeId)
    .filter((nodeId) => observation.sourceId.endsWith(`:${nodeId}`))
    .sort((left, right) => right.length - left.length)[0];
  return matchedNodeId != null && nodeIds.has(matchedNodeId);
}

export function baselineQuestEvidenceEligibility(
  cycle: LearningCycleRecordV2,
): BaselineQuestEvidenceEligibility {
  const baselineNodeIds = new Set(cycle.nodes.filter((node) => node.role === "baseline").map((node) => node.nodeId));
  const isSynthetic = (value: string): boolean =>
    /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(value);
  const targetAligned = cycle.observations.filter((observation) => {
    if (isSynthetic(observation.observationId) || isSynthetic(observation.sourceId)) return false;
    return observationBelongsToNode(cycle, observation, baselineNodeIds)
      && observation.constructLinks.some((link) => link.role === "primary" && link.confidence > 0)
      && !observation.confounds.includes("response_not_captured");
  });
  const independentCorrect = targetAligned.filter((observation) =>
    observation.result.correct === true
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

export function questBossEvidenceEligibility(
  cycle: LearningCycleRecordV2,
): QuestBossEvidenceEligibility {
  const questNodeIds = new Set(cycle.nodes.filter((node) => node.role === "quest").map((node) => node.nodeId));
  const isSynthetic = (value: string): boolean =>
    /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(value);
  const targetAligned = cycle.observations.filter((observation) => {
    if (isSynthetic(observation.observationId) || isSynthetic(observation.sourceId)) return false;
    return observationBelongsToNode(cycle, observation, questNodeIds)
      && observation.constructLinks.some((link) => link.role === "primary" && link.confidence > 0)
      && !observation.confounds.includes("response_not_captured");
  });
  const correct = targetAligned.filter((observation) => observation.result.correct === true);
  const qualifying = correct.filter((observation) =>
    observation.provenance === "independent_probe"
    && observation.exposure === "unseen"
    && observation.assistance.status === "unassisted"
    && !observation.confounds.includes("assistance_present")
    && !observation.confounds.includes("item_previously_exposed"));
  return {
    eligible: qualifying.length > 0,
    targetAlignedObservationCount: targetAligned.length,
    correctObservationCount: correct.length,
    qualifyingObservationCount: qualifying.length,
    reason: qualifying.length > 0
      ? "eligible_fresh_correct_unassisted_quest_evidence"
      : targetAligned.length === 0
        ? "no_target_aligned_quest_evidence"
        : correct.length === 0
          ? "no_correct_quest_evidence"
          : "no_fresh_unassisted_quest_evidence",
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

function isUncapturedResponse(value: string | undefined): boolean {
  return /spoken[_\s-]*aloud.*not[_\s-]*transcribed|response[_\s-]*not[_\s-]*captured/i.test(
    value ?? "",
  );
}

function observationsForCompletion(input: {
  cycle: LearningCycleRecordV2;
  sessionId: string;
  nodeId: string;
  result: CanonicalCompletionResult;
  observedAt: string;
}): LearningObservation[] {
  const node = input.cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId)!;
  const prediction = input.cycle.academicPredictions.find((candidate) => candidate.predictionId === node.predictionId);
  const constructId = prediction?.constructId
    ?? node.academicTarget.targets[0]
    ?? `${input.cycle.domain}.${slug(node.academicTarget.skill)}`;
  const rawRows = input.result.targetResults?.length
    ? input.result.targetResults
    : [{ target: node.nodeId, correct: input.result.accuracy >= 0.5 }];
  const supersededAttemptIds = new Set(rawRows
    .map((row) => row.supersedesAttemptId?.trim())
    .filter((value): value is string => Boolean(value)));
  const rows = rawRows.filter((row) => !row.attemptId?.trim() || !supersededAttemptIds.has(row.attemptId.trim()));
  const companionHelp = (input.result.companionInteractions?.length ?? 0) > 0;
  const previouslyExposedItemIds = new Set(input.cycle.observations.map((observation) => observation.itemId));
  return rows.map((row, index) => {
    const unresolved = typeof row.observedErrorType === "string" && row.observedErrorType.trim().length > 0;
    const scaffolded = Number(row.scaffoldLevel ?? 0) > 0 || companionHelp || row.assistanceStatus === "assisted";
    const repeatedAssessmentItem = node.role !== "baseline" && previouslyExposedItemIds.has(row.target);
    const responseNotCaptured = isUncapturedResponse(row.attemptedValue);
    return {
      observationId: row.resolutionId?.trim() || `${input.sessionId}:${input.nodeId}:observation:${index + 1}`,
      sourceId: `activity:${input.sessionId}:${input.nodeId}`,
      nodeId: input.nodeId,
      itemId: row.target || `${input.nodeId}:item:${index + 1}`,
      ...(row.attemptedValue ? { childResponse: row.attemptedValue } : {}),
      constructLinks: [{ constructId, role: "primary", confidence: 1 }],
      result: responseNotCaptured
        ? { observedErrorType: "response_not_captured" }
        : unresolved
          ? { observedErrorType: row.observedErrorType!.trim() }
          : { correct: row.correct, score: row.correct === true ? 1 : 0 },
      assistance: {
        status: row.assistanceStatus ?? (scaffolded ? "assisted" : "unassisted"),
        scaffolds: [
          ...(Number(row.scaffoldLevel ?? 0) > 0 ? [`scaffold_level_${row.scaffoldLevel}`] : []),
          ...(companionHelp ? ["companion_help"] : []),
        ],
      },
      exposure: node.role === "baseline" || repeatedAssessmentItem ? "previously_practiced" : "unseen",
      provenance: node.role === "baseline" || repeatedAssessmentItem ? "practice" : "independent_probe",
      observedAt: input.observedAt,
      confounds: [
        ...(scaffolded ? ["assistance_present"] : []),
        ...(repeatedAssessmentItem ? ["item_previously_exposed"] : []),
        ...(responseNotCaptured ? ["response_not_captured"] : []),
        ...(unresolved ? [row.observedErrorType!.trim()] : []),
        ...(row.confounds ?? []).filter((value) => typeof value === "string" && value.trim().length > 0),
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
  if (!cycle || !input.result.completed) return cycle;
  const evidenceId = `${input.sessionId}:${input.nodeId}:completion`;
  const alreadyRecorded = cycle.evidence.academic.some((item) => item.evidenceId === evidenceId);
  if (alreadyRecorded) return cycle;
  const node = cycle.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`learning_cycle_node_missing:${input.nodeId}`);
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
  if (agencyNodeLaunchable === false || (agencyNodeLaunchable === undefined && node.state !== "ready" && node.state !== "active")) {
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
    summary: `${node.title} completed in ${Math.max(0, input.result.timeSpent_ms)}ms; replay=${input.result.replay === true}; frustration=${(input.result.frustrationSignals ?? []).join(",") || "none"}.`,
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
  const factualSessionFinalizations = cycle.sessionFinalizations.filter((item) =>
    !isSynthetic(item.choiceEventId)
  );
  const baselineEligibility = baselineQuestEvidenceEligibility(cycle);
  const bossEligibility = questBossEvidenceEligibility(cycle);
  const allowedProgressionActions: LearningProgressionAction[] = cycle.lifecycle === "baseline_evaluating" && !baselineEligibility.eligible
    ? ["generate_support", "collect_more_evidence"]
    : cycle.lifecycle === "quest_evaluating"
      ? bossEligibility.eligible
        ? ["generate_support", "generate_boss", "await_calibration"]
        : ["generate_support", "await_calibration"]
      : ["generate_support", "generate_quest", "generate_boss", "collect_more_evidence", "await_calibration"];
  const response = await anthropic.messages.create({
    model: model ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    // The prescription now carries five additional design fields; 2600 truncated them.
    max_tokens: 6000,
    messages: [{ role: "user", content: `You are Sunny's AI Planner. Compare the preregistered academic theory and predictions with the factual scorecard. Practice can justify a transfer test but cannot prove mastery. Quest tests unseen transfer; Boss tests unseen synthesis; Boss must end awaiting calibration. Return exactly one concise decision and always propose one complete next instrument using the required next* fields. Runtime uses that proposal only when progressionAction generates an instrument.

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

Quest Boss eligibility (runtime truth boundary, not a mastery judgment):
${JSON.stringify(bossEligibility, null, 2)}
Allowed progression actions for this lifecycle: ${allowedProgressionActions.join(", ")}

Cycle:
${JSON.stringify({ lifecycle: cycle.lifecycle, assignment: cycle.assignment, theory: cycle.academicTheory, predictions: cycle.academicPredictions, evidence: factualEvidence, observations: factualObservations, sessionFinalizations: factualSessionFinalizations, nodes: cycle.nodes.map((node) => ({ nodeId: node.nodeId, role: node.role, title: node.title, state: node.state, routeId: node.routeId, evidenceIds: node.evidenceIds.filter((id) => !isSynthetic(id)) })) }, null, 2)}` }],
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
          revisedHypothesis: { type: "string" },
          nextNodeId: { type: "string", minLength: 1 },
          nextTitle: { type: "string", minLength: 1 },
          nextAcademicTarget: { type: "string", minLength: 1 },
          nextMechanic: { type: "string", minLength: 1 },
          nextTheme: { type: "string", minLength: 1 },
          nextOpeningPurpose: { type: "string", minLength: 1 },
          nextCreatorPrompt: { type: "string", minLength: 1 },
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
          "nextNodeId",
          "nextTitle",
          "nextAcademicTarget",
          "nextMechanic",
          "nextTheme",
          "nextOpeningPurpose",
          "nextCreatorPrompt",
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

type AdvanceCanonicalCycleInput = {
  childId: string;
  homeworkId: string;
  client?: Anthropic;
  model?: string;
  decide?: (cycle: LearningCycleRecordV2) => Promise<CanonicalProgressionDecision>;
};

type PlannerDecisionLease = {
  ownerId: string;
  lockDir: string;
  heartbeat: ReturnType<typeof setInterval>;
};

const PLANNER_DECISION_LEASE_MS = 10 * 60 * 1000;

function acquirePlannerDecisionLease(
  input: Pick<AdvanceCanonicalCycleInput, "childId" | "homeworkId">,
  opts: LearningCycleRepositoryOptions,
): PlannerDecisionLease {
  const ownerId = randomUUID();
  const safeHomeworkId = input.homeworkId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const lockDir = path.join(
    resolveChildContextDir(input.childId.trim().toLowerCase(), { rootDir: opts.rootDir }),
    "homework",
    "cycles",
    ".locks",
    `${safeHomeworkId}.planner`,
  );
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, "owner"), ownerId, "utf8");
      const heartbeat = setInterval(() => {
        try {
          if (fs.readFileSync(path.join(lockDir, "owner"), "utf8") !== ownerId) return;
          const now = new Date();
          fs.utimesSync(lockDir, now, now);
        } catch (error) {
          console.error(` 🎮 [canonical-progression] [lease-heartbeat] [failed] ${error instanceof Error ? error.message : String(error)}`);
        }
      }, 30_000);
      heartbeat.unref();
      return { ownerId, lockDir, heartbeat };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      const ageMs = Date.now() - fs.statSync(lockDir).mtimeMs;
      if (ageMs < PLANNER_DECISION_LEASE_MS) {
        throw new Error(`canonical_progression_decision_in_flight:${input.homeworkId}`);
      }
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  }
  throw new Error(`canonical_progression_lease_acquisition_exhausted:${input.homeworkId}`);
}

function releasePlannerDecisionLease(lease: PlannerDecisionLease): void {
  clearInterval(lease.heartbeat);
  try {
    if (fs.readFileSync(path.join(lease.lockDir, "owner"), "utf8") === lease.ownerId) {
      fs.rmSync(lease.lockDir, { recursive: true, force: true });
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") {
      console.error(` 🎮 [canonical-progression] [lease-release] [failed] ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function advanceCanonicalCycleFromEvidenceUnlocked(
  input: AdvanceCanonicalCycleInput,
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  let cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (!["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(cycle.lifecycle)) return cycle;
  const evaluatingRole = cycle.lifecycle === "baseline_evaluating"
    ? "baseline"
    : cycle.lifecycle === "quest_evaluating"
      ? "quest"
      : "boss";
  const evaluationSessionFinalizationId = cycle.evaluationSessionFinalizationId;
  const evaluationNodeId = cycle.evaluationNodeId;
  const currentFinalization = cycle.sessionFinalizations.find((item) =>
    item.choiceEventId === evaluationSessionFinalizationId);
  const hasFinalizedScorecard = cycle.nodes.some((node) =>
    node.role === evaluatingRole && node.state === "completed" &&
    node.nodeId === evaluationNodeId && node.nodeId === currentFinalization?.nodeId);
  if (!hasFinalizedScorecard) {
    throw new Error(`canonical_progression_session_not_finalized:${cycle.lifecycle}`);
  }
  if (cycle.progressionDecisionClaim?.status === "running") {
    const claimAgeMs = Date.now() - Date.parse(cycle.progressionDecisionClaim.claimedAt);
    if (!Number.isFinite(claimAgeMs) || claimAgeMs < 10 * 60 * 1000) {
      throw new Error(`canonical_progression_decision_in_flight:${cycle.progressionDecisionClaim.finalizationId}`);
    }
    cycle = transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
      type: "progression_decision_failed",
      finalizationId: cycle.progressionDecisionClaim.finalizationId,
      claimId: cycle.progressionDecisionClaim.claimId,
      reason: "stale_planner_claim_recovered_after_restart",
    }, opts);
    console.log(` 🎮 [canonical-progression] [stale-claim] [recovered] finalization=${cycle.evaluationSessionFinalizationId}`);
  }
  const claimId = randomUUID();
  const claimed = transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
    type: "progression_decision_claimed",
    finalizationId: cycle.evaluationSessionFinalizationId!,
    claimId,
  }, opts);
  const preserveFailedClaim = (error: unknown): void => {
    const latest = getLearningCycle(input.childId, input.homeworkId, opts);
    if (latest?.progressionDecisionClaim?.status !== "running" ||
      latest.progressionDecisionClaim.finalizationId !== claimed.evaluationSessionFinalizationId ||
      latest.progressionDecisionClaim.claimId !== claimId) return;
    try {
      transitionLearningCycle(latest.childId, latest.homeworkId, latest.revision, {
        type: "progression_decision_failed",
        finalizationId: latest.progressionDecisionClaim.finalizationId,
        claimId,
        reason: error instanceof Error ? error.message : String(error),
      }, opts);
    } catch (claimError) {
      console.error(` 🎮 [canonical-progression] [failure-checkpoint] [failed] ${claimError instanceof Error ? claimError.message : String(claimError)}`);
    }
  };
  try {
    const plannerDecision = input.decide
      ? await input.decide(claimed)
      : await askPlanner(claimed, input.client, input.model, opts);
    const decision = resolveCanonicalProgressionDecisionForLifecycle(claimed.lifecycle, plannerDecision);
    if (claimed.lifecycle === "baseline_evaluating"
      && decision.progressionAction === "generate_quest"
      && !baselineQuestEvidenceEligibility(claimed).eligible) {
      throw new Error("canonical_progression_quest_requires_eligible_baseline_evidence");
    }
    if (claimed.lifecycle === "quest_evaluating" && !["generate_boss", "generate_support", "await_calibration"].includes(decision.progressionAction)) {
      throw new Error("canonical_progression_quest_action_invalid");
    }
    if (claimed.lifecycle === "quest_evaluating" && decision.progressionAction === "generate_boss") {
      if (!questBossEvidenceEligibility(claimed).eligible) {
        throw new Error("canonical_progression_boss_requires_eligible_quest_evidence");
      }
    }
    if (claimed.lifecycle === "boss_evaluating" && decision.progressionAction !== "await_calibration") {
      throw new Error("canonical_progression_boss_requires_calibration");
    }
    const evidenceIds = [...new Set([
      ...claimed.evidence.academic.map((item) => item.evidenceId),
      ...claimed.evidence.engagement.map((item) => item.evidenceId),
    ].filter((id) => !/(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(id)))];
    const theoryEvent = {
      type: "theory_decided" as const,
      claimId,
      decision: {
        ...decision,
        nextAction: decision.progressionAction,
        evidenceIds,
        predictionEvaluationIds: [],
      },
    };
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const latest = getLearningCycle(claimed.childId, claimed.homeworkId, opts);
      if (!latest) throw new Error(`learning_cycle_missing:${claimed.homeworkId}`);
      if (latest.progressionDecisionClaim?.status !== "running" ||
        latest.progressionDecisionClaim.finalizationId !== claimed.evaluationSessionFinalizationId ||
        latest.progressionDecisionClaim.claimId !== claimId) {
        throw new Error(`canonical_progression_claim_lost:${claimed.evaluationSessionFinalizationId}`);
      }
      try {
        return transitionLearningCycle(latest.childId, latest.homeworkId, latest.revision, theoryEvent, opts);
      } catch (error) {
        const retryable = error instanceof Error && (
          error.message.startsWith("learning_cycle_revision_conflict:") ||
          error.message.startsWith("learning_cycle_transition_in_flight:")
        );
        if (!retryable || attempt === 10) {
          throw error;
        }
        console.log(` 🎮 [canonical-progression] [decision-commit] [contention-retry] attempt=${attempt}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
    }
    throw new Error("canonical_progression_decision_commit_exhausted");
  } catch (error) {
    preserveFailedClaim(error);
    throw error;
  }
}

export async function advanceCanonicalCycleFromEvidence(
  input: AdvanceCanonicalCycleInput,
  opts: LearningCycleRepositoryOptions = {},
): Promise<LearningCycleRecordV2> {
  const lease = acquirePlannerDecisionLease(input, opts);
  try {
    return await advanceCanonicalCycleFromEvidenceUnlocked(input, opts);
  } finally {
    releasePlannerDecisionLease(lease);
  }
}
