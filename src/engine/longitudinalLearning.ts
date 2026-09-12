import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  getLearningCycle,
  hasSufficientCalibrationEvidence,
  transitionLearningCycle,
  type AcademicPrediction,
  type AssumptionAssessment,
  type LearningConstructLink,
  type LearningCycleDecision,
  type LearningCycleRecordV2,
  type LearningEvidenceSourceRef,
  type LearningObservation,
  type PredictionEvaluation,
} from "./learningCycleRepository";

export type ConfirmedReturnedWorkItem = {
  itemId: string;
  prompt: string;
  childResponse?: string;
  correct?: boolean;
  teacherNote?: string;
  observedErrorType?: string;
  extractionConfidence: number;
  constructLinks: LearningConstructLink[];
};

export type ConfirmedReturnedWork = {
  childId: string;
  homeworkId: string;
  source: LearningEvidenceSourceRef;
  score?: { earned: number; possible: number };
  items: ConfirmedReturnedWorkItem[];
};

export type LongitudinalConstructHistory = {
  constructId: string;
  predictions: AcademicPrediction[];
  observations: LearningObservation[];
  evaluations: PredictionEvaluation[];
  decisions: LearningCycleDecision[];
};

export type LongitudinalLearningHistory = {
  childId: string;
  constructs: Record<string, LongitudinalConstructHistory>;
  recentDecisions: LearningCycleDecision[];
  pendingInterpretation: Array<{ homeworkId: string; sourceId: string; evaluationIds: string[] }>;
};

export type TheoryDecisionContent = {
  status: "supported" | "revised" | "falsified" | "inconclusive" | "awaiting_calibration";
  reason: string;
  nextAction: string;
  evidenceIds: string[];
  predictionEvaluationIds: string[];
  preserve: string[];
  change: string[];
  testNext: string[];
  nextEvidenceRequired: string[];
  revisedHypothesis?: string;
  assumptionAssessments?: AssumptionAssessment[];
};

type RootOptions = { rootDir?: string; now?: Date };

export function frozenSpellingWordMapping(cycle: LearningCycleRecordV2): Array<{ itemId: string; wordId: string; word: string; constructId: string }> | undefined {
  const items = cycle.domain === "spelling" ? cycle.nodes.find(node => node.role === "evaluation")?.evidenceContract.spellingItems : undefined;
  return items ? Object.values(items).map(item => ({ itemId: item.id, wordId: item.wordId, word: item.word, constructId: item.constructId })) : undefined;
}

function stableId(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function scoreOf(observation: LearningObservation): number | null {
  if (typeof observation.result.score === "number") return observation.result.score;
  if (typeof observation.result.correct === "boolean") return observation.result.correct ? 1 : 0;
  return null;
}

export function evaluateAcademicPredictions(
  predictions: AcademicPrediction[],
  observations: LearningObservation[],
  evaluatedAt = new Date().toISOString(),
): PredictionEvaluation[] {
  return predictions.flatMap((prediction) => {
    const registeredAt = Date.parse(prediction.lockedAt ?? prediction.createdAt);
    const eligibility = prediction.eligibility;
    const matched = observations.filter((observation) => {
      const observedAt = Date.parse(observation.observedAt);
      const external = observation.provenance === "graded_work" || observation.provenance === "delayed_reassessment";
      const unassistedSpellingRecall = prediction.constructId.startsWith("spelling.")
        && prediction.expectedMetric.key === "unassisted_recall_accuracy" && prediction.evidenceLimit === "practice_only"
        && eligibility?.checkpointItemIds?.includes(observation.itemId)
        && observation.provenance === "practice" && observation.assistance.status === "unassisted"
        && observation.confounds.includes("measurement_role:fresh_checkpoint") && observation.confounds.includes("first_response")
        && !observation.confounds.some(c => /repeated_attempt|audio_unavailable|answer_exposure|live_context_unavailable/.test(c));
      return Number.isFinite(registeredAt) && observedAt > registeredAt
        && (!eligibility || (Number.isFinite(eligibility.maxDelayDays) && eligibility.maxDelayDays >= 0
          && observedAt - registeredAt <= eligibility.maxDelayDays * 86_400_000
          && (eligibility.sources as string[]).includes(observation.provenance)))
        && observation.constructLinks.some((link) => link.constructId === prediction.constructId)
        && (external || unassistedSpellingRecall || (observation.provenance === "independent_probe"
          && observation.assistance.status === "unassisted" && observation.exposure === "unseen"))
        && scoreOf(observation) != null
        && !observation.confounds.some(c => /response_not_captured|instrument_ambiguous|assistance_present|item_previously_exposed/.test(c));
    });
    const sources = [...new Set(matched.map(observation => observation.sourceId))];
    return sources.map(sourceId => {
    const batch = matched.filter(observation => observation.sourceId === sourceId);
    const numeric = batch.map(scoreOf).filter((value): value is number => value != null);
    const observedMetric = numeric.length > 0
      ? round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length)
      : null;
    const predictionError = observedMetric == null
      ? null
      : observedMetric < prediction.expectedMetric.min
        ? round(prediction.expectedMetric.min - observedMetric)
        : observedMetric > prediction.expectedMetric.max
          ? round(observedMetric - prediction.expectedMetric.max)
          : 0;
    const observationIds = batch.map((observation) => observation.observationId);
    return {
      evaluationId: `evaluation:${stableId({ predictionId: prediction.predictionId, sourceId, observationIds })}`,
      predictionId: prediction.predictionId,
      sourceId,
      observationIds,
      predictedMetric: { min: prediction.expectedMetric.min, max: prediction.expectedMetric.max },
      observedMetric,
      predictionError,
      observedErrorPatterns: [...new Set(batch.flatMap((observation) =>
        observation.result.observedErrorType ? [observation.result.observedErrorType] : []))],
      sufficiency: eligibility && numeric.length > 0 ? "sufficient" as const : "insufficient" as const,
      attribution: "observational_not_causal" as const,
      evaluatedAt,
    };
    });
  });
}

function observationsFromReturnedWork(input: ConfirmedReturnedWork): LearningObservation[] {
  return input.items.map((item) => ({
    observationId: `observation:${stableId({ sourceId: input.source.sourceId, itemId: item.itemId })}`,
    sourceId: input.source.sourceId,
    itemId: item.itemId,
    prompt: item.prompt,
    ...(item.childResponse ? { childResponse: item.childResponse } : {}),
    constructLinks: item.constructLinks.map((link) => ({ ...link })),
    result: {
      ...(typeof item.correct === "boolean" ? { correct: item.correct, score: item.correct ? 1 : 0 } : {}),
      ...(item.observedErrorType ? { observedErrorType: item.observedErrorType } : {}),
      ...(item.teacherNote ? { teacherNote: item.teacherNote } : {}),
    },
    assistance: { status: "unknown", scaffolds: [] },
    exposure: "unknown",
    provenance: input.source.type === "delayed_reassessment" ? "delayed_reassessment" : "graded_work",
    observedAt: input.source.capturedAt,
    confounds: item.extractionConfidence < 0.8 ? ["low_extraction_confidence"] : [],
  }));
}

export function recordConfirmedReturnedWork(
  input: ConfirmedReturnedWork,
  opts: RootOptions = {},
): LearningCycleRecordV2 {
  if (input.source.status !== "confirmed") throw new Error("returned_work_requires_confirmation");
  if (input.source.assignmentLink.homeworkId !== input.homeworkId) throw new Error("returned_work_assignment_link_mismatch");
  const cycle = getLearningCycle(input.childId, input.homeworkId, opts);
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const duplicate = cycle.evidenceSources.find((source) =>
    source.sourceId === input.source.sourceId || source.fileFingerprint === input.source.fileFingerprint);
  if (duplicate) return cycle;
  const spelling = frozenSpellingWordMapping(cycle);
  if (spelling) for (const row of input.items) {
    const target = spelling.find(item => item.word.normalize("NFC").toLocaleLowerCase("en-US") === row.prompt.normalize("NFC").trim().toLocaleLowerCase("en-US"));
    if (!target || row.constructLinks.length !== 1 || row.constructLinks[0].role !== "primary" || row.constructLinks[0].constructId !== target.constructId) throw new Error(`returned_spelling_mapping_invalid:${row.itemId}`);
  }
  const observations = observationsFromReturnedWork(input);
  const evaluations = evaluateAcademicPredictions(cycle.academicPredictions, observations, input.source.capturedAt);
  const score = input.score && input.score.possible > 0 ? round(input.score.earned / input.score.possible) : null;
  return transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "returned_work_confirmed",
    source: input.source,
    observations,
    evaluations,
    calibration: {
      calibrationId: `calibration:${stableId({ sourceId: input.source.sourceId, homeworkId: input.homeworkId })}`,
      gradedAt: input.source.capturedAt,
      score,
      status: "inconclusive",
      gradedItems: input.items.map((item) => ({
        target: item.constructLinks.find((link) => link.role === "primary")?.constructId ?? item.prompt,
        correct: item.correct === true,
        ...(item.observedErrorType ? { observedErrorType: item.observedErrorType } : {}),
        ...(item.teacherNote ? { note: item.teacherNote } : {}),
      })),
      sourceFile: input.source.sourceFile,
      reason: "Returned work was recorded as factual evidence pending Planner interpretation.",
      nextAction: "Evaluate the preregistered predictions and write one theory decision.",
    },
  }, opts);
}

function readCanonicalCycles(childId: string, rootDir = process.cwd()): LearningCycleRecordV2[] {
  const dir = path.join(resolveChildContextDir(childId, { rootDir }), "homework", "cycles");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const cycle = getLearningCycle(childId, file.replace(/\.json$/, ""), { rootDir });
        return cycle ? [cycle] : [];
      } catch (error) {
        console.warn(` 🎮 [longitudinal-history] [cycle-skip] [invalid] file=${file} reason=${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    });
}

export function buildLongitudinalLearningHistory(
  childIdRaw: string,
  opts: { rootDir?: string } = {},
): LongitudinalLearningHistory {
  const childId = childIdRaw.trim().toLowerCase();
  const cycles = readCanonicalCycles(childId, opts.rootDir);
  const constructs: Record<string, LongitudinalConstructHistory> = {};
  const ensure = (constructId: string): LongitudinalConstructHistory =>
    constructs[constructId] ??= { constructId, predictions: [], observations: [], evaluations: [], decisions: [] };
  for (const cycle of cycles) {
    for (const prediction of cycle.academicPredictions) ensure(prediction.constructId).predictions.push(prediction);
    for (const observation of cycle.observations) {
      for (const link of observation.constructLinks) ensure(link.constructId).observations.push(observation);
    }
    for (const evaluation of cycle.predictionEvaluations) {
      const prediction = cycle.academicPredictions.find((candidate) => candidate.predictionId === evaluation.predictionId);
      if (prediction) ensure(prediction.constructId).evaluations.push(evaluation);
    }
    for (const decision of cycle.decisionHistory.filter((candidate) => candidate.eventType === "theory_decided")) {
      const ids = new Set(decision.predictionEvaluationIds ?? []);
      for (const evaluation of cycle.predictionEvaluations.filter((candidate) => ids.has(candidate.evaluationId))) {
        const prediction = cycle.academicPredictions.find((candidate) => candidate.predictionId === evaluation.predictionId);
        if (prediction) ensure(prediction.constructId).decisions.push(decision);
      }
    }
  }
  for (const history of Object.values(constructs)) {
    history.predictions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    history.observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    history.evaluations.sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt));
  }
  const recentDecisions = cycles.flatMap((cycle) => cycle.decisionHistory)
    .filter((decision) => decision.eventType === "theory_decided")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  const pendingInterpretation = cycles.flatMap((cycle) => cycle.evidenceSources
    .filter((source) => source.status === "confirmed" && !cycle.decisionHistory.some((decision) =>
      decision.eventType === "theory_decided" && decision.evidenceIds.some((id) =>
        cycle.observations.some((observation) => observation.sourceId === source.sourceId && observation.observationId === id))))
    .map((source) => ({
      homeworkId: cycle.homeworkId,
      sourceId: source.sourceId,
      evaluationIds: cycle.predictionEvaluations.filter((evaluation) => evaluation.sourceId === source.sourceId).map((evaluation) => evaluation.evaluationId),
    })));
  return { childId, constructs, recentDecisions, pendingInterpretation };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function parseTheoryDecision(value: unknown, cycle: LearningCycleRecordV2): TheoryDecisionContent {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const statuses = new Set(["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"]);
  if (typeof row.status !== "string" || !statuses.has(row.status)) throw new Error("longitudinal_theory_decision_status_invalid");
  if (typeof row.reason !== "string" || !row.reason.trim() || typeof row.nextAction !== "string" || !row.nextAction.trim()) {
    throw new Error("longitudinal_theory_decision_reason_invalid");
  }
  const rawAssessments = Array.isArray(row.assumptionAssessments) ? row.assumptionAssessments : [];
  const assessments = rawAssessments.map((raw): AssumptionAssessment => {
    const assessment = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    if (typeof assessment.assumptionId !== "string" || !cycle.assumptions.some((item) => item.assumptionId === assessment.assumptionId)) {
      throw new Error("longitudinal_assumption_assessment_unknown");
    }
    if (!["supported", "rejected", "uncertain"].includes(String(assessment.outcome)) ||
        typeof assessment.reason !== "string" || !assessment.reason.trim()) {
      throw new Error("longitudinal_assumption_assessment_invalid");
    }
    return {
      assumptionId: assessment.assumptionId,
      outcome: assessment.outcome as AssumptionAssessment["outcome"],
      reason: assessment.reason,
      observationIds: stringArray(assessment.observationIds),
    };
  });
  if (cycle.assumptions.some((assumption) => !assessments.some((assessment) => assessment.assumptionId === assumption.assumptionId))) {
    throw new Error("longitudinal_assumption_assessment_missing");
  }
  return {
    status: row.status as TheoryDecisionContent["status"],
    reason: row.reason,
    nextAction: row.nextAction,
    evidenceIds: stringArray(row.evidenceIds),
    predictionEvaluationIds: stringArray(row.predictionEvaluationIds),
    preserve: stringArray(row.preserve),
    change: stringArray(row.change),
    testNext: stringArray(row.testNext),
    nextEvidenceRequired: stringArray(row.nextEvidenceRequired),
    assumptionAssessments: assessments,
    ...(typeof row.revisedHypothesis === "string" && row.revisedHypothesis.trim() ? { revisedHypothesis: row.revisedHypothesis } : {}),
  };
}

async function askPlannerForTheoryDecision(input: {
  cycle: LearningCycleRecordV2;
  sourceId: string;
  client?: Anthropic;
  model?: string;
}): Promise<TheoryDecisionContent> {
  const observations = input.cycle.observations.filter((observation) => observation.sourceId === input.sourceId);
  const evaluations = input.cycle.predictionEvaluations.filter((evaluation) => evaluation.sourceId === input.sourceId);
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const toolName = "record_longitudinal_theory_decision";
  const response = await client.messages.create({
    model: input.model ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    max_tokens: 5000,
    messages: [{ role: "user", content: `You are Sunny's AI learning Planner. Interpret one confirmed external-evidence batch. Observations are immutable facts. Compare only preregistered predictions with their evaluations and return exactly one theory decision. A supported prediction does not automatically prove mastery. Cite only supplied observation and evaluation IDs. Assess every preregistered assumption as supported, rejected, or uncertain; do not rewrite it.\n\nTheory:\n${JSON.stringify(input.cycle.academicTheory, null, 2)}\n\nAssumptions:\n${JSON.stringify(input.cycle.assumptions, null, 2)}\n\nPredictions:\n${JSON.stringify(input.cycle.academicPredictions, null, 2)}\n\nObservations:\n${JSON.stringify(observations, null, 2)}\n\nEvaluations:\n${JSON.stringify(evaluations, null, 2)}` }],
    tools: [{
      name: toolName,
      description: "Return one evidence-citing theory decision and assess every locked assumption.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["status", "reason", "nextAction", "evidenceIds", "predictionEvaluationIds", "preserve", "change", "testNext", "nextEvidenceRequired", "assumptionAssessments"],
        properties: {
          status: { type: "string", enum: ["supported", "revised", "falsified", "inconclusive", "awaiting_calibration"] },
          reason: { type: "string" },
          nextAction: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          predictionEvaluationIds: { type: "array", items: { type: "string" } },
          preserve: { type: "array", items: { type: "string" } },
          change: { type: "array", items: { type: "string" } },
          testNext: { type: "array", items: { type: "string" } },
          nextEvidenceRequired: { type: "array", items: { type: "string" } },
          revisedHypothesis: { type: "string" },
          assumptionAssessments: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["assumptionId", "outcome", "reason", "observationIds"],
              properties: {
                assumptionId: { type: "string" },
                outcome: { type: "string", enum: ["supported", "rejected", "uncertain"] },
                reason: { type: "string" },
                observationIds: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const tool = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!tool || tool.type !== "tool_use") throw new Error("longitudinal_theory_decision_missing");
  return parseTheoryDecision(tool.input, input.cycle);
}

export async function interpretReturnedWorkBatch(input: {
  childId: string;
  homeworkId: string;
  sourceId: string;
  rootDir?: string;
  now?: Date;
  client?: Anthropic;
  model?: string;
  interpret?: (cycle: LearningCycleRecordV2, sourceId: string) => Promise<TheoryDecisionContent>;
}): Promise<{ applied: boolean; reason: string; cycle: LearningCycleRecordV2 }> {
  const cycle = getLearningCycle(input.childId, input.homeworkId, { rootDir: input.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  const sourceObservations = cycle.observations.filter((observation) => observation.sourceId === input.sourceId);
  if (sourceObservations.length === 0) return { applied: false, reason: "source_observations_missing", cycle };
  if (cycle.decisionHistory.some((decision) => decision.eventType === "theory_decided" &&
    decision.evidenceIds.some((id) => sourceObservations.some((observation) => observation.observationId === id)))) {
    return { applied: false, reason: "already_interpreted", cycle };
  }
  const content = input.interpret
    ? await input.interpret(cycle, input.sourceId)
    : await askPlannerForTheoryDecision({ cycle, sourceId: input.sourceId, client: input.client, model: input.model });
  const allowedObservationIds = new Set(sourceObservations.map((observation) => observation.observationId));
  const allowedEvaluationIds = new Set(cycle.predictionEvaluations.filter((evaluation) => evaluation.sourceId === input.sourceId).map((evaluation) => evaluation.evaluationId));
  if (content.evidenceIds.some((id) => !allowedObservationIds.has(id)) ||
      content.predictionEvaluationIds.some((id) => !allowedEvaluationIds.has(id))) {
    throw new Error("longitudinal_theory_decision_unknown_evidence");
  }
  if (["supported", "falsified"].includes(content.status) && !content.predictionEvaluationIds.length) throw new Error("longitudinal_prediction_evaluation_required");
  if (!content.evidenceIds.length) throw new Error("longitudinal_theory_observation_required");
  if (["supported", "falsified"].includes(content.status) && !hasSufficientCalibrationEvidence(cycle, content)) {
    throw new Error("longitudinal_prediction_evidence_insufficient");
  }
  const updated = transitionLearningCycle(input.childId, input.homeworkId, cycle.revision, {
    type: "theory_decided",
    decision: content,
  }, { rootDir: input.rootDir, now: input.now });
  return { applied: true, reason: "interpreted", cycle: updated };
}
