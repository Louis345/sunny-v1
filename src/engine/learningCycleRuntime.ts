import Anthropic from "@anthropic-ai/sdk";
import { getChildChart } from "../profiles/childChart";
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
  revisedHypothesis?: string;
  nextInstrument?: NextInstrumentPrescription;
};

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "unknown";
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
  const constructId = prediction?.constructId ?? `${input.cycle.domain}.${slug(node.academicTarget.skill)}`;
  const rows = input.result.targetResults?.length
    ? input.result.targetResults
    : [{ target: node.nodeId, correct: input.result.accuracy >= 0.5 }];
  const companionHelp = (input.result.companionInteractions?.length ?? 0) > 0;
  const previouslyExposedItemIds = new Set(input.cycle.observations.map((observation) => observation.itemId));
  return rows.map((row, index) => {
    const scaffolded = Number(row.scaffoldLevel ?? 0) > 0 || companionHelp;
    const repeatedAssessmentItem = node.role !== "baseline" && previouslyExposedItemIds.has(row.target);
    return {
      observationId: `${input.sessionId}:${input.nodeId}:observation:${index + 1}`,
      sourceId: `activity:${input.sessionId}:${input.nodeId}`,
      itemId: row.target || `${input.nodeId}:item:${index + 1}`,
      ...(row.attemptedValue ? { childResponse: row.attemptedValue } : {}),
      constructLinks: [{ constructId, role: "primary", confidence: 1 }],
      result: { correct: row.correct, score: row.correct ? 1 : 0 },
      assistance: {
        status: scaffolded ? "assisted" : "unassisted",
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
  const accuracy = Math.max(0, Math.min(1, Number(input.result.accuracy) || 0));
  const observedAt = (opts.now ?? new Date()).toISOString();
  const academicEvidence: LearningCycleEvidenceSummary[] = [{
    evidenceId,
    accuracy,
    summary: `${node.title} completed at ${Math.round(accuracy * 100)}% across ${input.result.targetResults?.length ?? 0} target readings.`,
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
    observations: observationsForCompletion({ cycle, sessionId: input.sessionId, nodeId: node.nodeId, result: input.result, observedAt }),
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

function parseProgressionDecision(value: unknown): CanonicalProgressionDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("canonical_progression_decision_invalid");
  const row = value as Record<string, unknown>;
  const statuses = new Set(["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"]);
  const actions = new Set<LearningProgressionAction>(["generate_support", "generate_quest", "generate_boss", "collect_more_evidence", "await_calibration"]);
  if (typeof row.status !== "string" || !statuses.has(row.status) || typeof row.progressionAction !== "string" || !actions.has(row.progressionAction as LearningProgressionAction)) {
    throw new Error("canonical_progression_decision_invalid");
  }
  if (typeof row.reason !== "string" || !row.reason.trim()) throw new Error("canonical_progression_reason_missing");
  const nextInstrument = parseNextInstrument(row.nextInstrument) ?? parseNextInstrument({
    nodeId: row.nextNodeId,
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

Cycle:
${JSON.stringify({ lifecycle: cycle.lifecycle, assignment: cycle.assignment, theory: cycle.academicTheory, predictions: cycle.academicPredictions, evidence: factualEvidence, observations: factualObservations, nodes: cycle.nodes.map((node) => ({ nodeId: node.nodeId, role: node.role, title: node.title, state: node.state, routeId: node.routeId, evidenceIds: node.evidenceIds.filter((id) => !isSynthetic(id)) })) }, null, 2)}` }],
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
            enum: ["generate_support", "generate_quest", "generate_boss", "collect_more_evidence", "await_calibration"],
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
  return parseProgressionDecision(tool.input);
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
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (!["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(cycle.lifecycle)) return cycle;
  const decision = input.decide ? await input.decide(cycle) : await askPlanner(cycle, input.client, input.model, opts);
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
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
    type: "theory_decided",
    decision: {
      ...decision,
      nextAction: decision.progressionAction,
      evidenceIds,
      predictionEvaluationIds: [],
    },
  }, opts);
}
