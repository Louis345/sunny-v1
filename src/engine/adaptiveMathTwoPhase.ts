import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type EvidenceConfidence = {
  confidence: number;
  uncertainty: string;
};

export type MathOpeningEvaluationAssignment = {
  homeworkId: string;
  cycleId: string;
  sourceHash: string;
  extractionHash: string;
  academicContractHash: string;
  fullText: string;
  sourceEvidenceIds: string[];
  contextEvidenceIds: string[];
  sourceQuestionTexts: string[];
  sourceQuestionFingerprints: string[];
};

export type MathOpeningEvaluationItem = {
  itemId: string;
  constructId: string;
  prerequisiteConstructIds: string[];
  prompt: string;
  sourceEvidenceIds: string[];
  sourceQuestionFingerprint: string;
  exposureIdentity: string;
  difficultyBoundary: {
    allowedConcepts: string[];
    allowedRepresentations: string[];
    excludedExtensions: string[];
  };
  response:
    | { mode: "selection"; options: Array<{ id: string; label: string; correct: boolean }> }
    | { mode: "numeric"; expected: number; unit?: string }
    | { mode: "construction"; expectedState: Record<string, string | number | boolean>; successDescription: string };
};

export type MathOpeningEvaluation = {
  version: 1;
  evaluationId: string;
  artifactId: string;
  evaluationHash: string;
  homeworkId: string;
  cycleId: string;
  academicContractHash: string;
  title: string;
  openingPromise: string;
  firstAction: string;
  assumptions: Array<EvidenceConfidence & {
    assumptionId: string;
    claim: string;
    evidenceIds: string[];
    falsifyingEvidence: string[];
  }>;
  predictions: Array<EvidenceConfidence & {
    predictionId: string;
    constructId: string;
    claim: string;
    evidenceIds: string[];
    falsifyingEvidence: string[];
    measurementKeys: string[];
  }>;
  items: MathOpeningEvaluationItem[];
};

export type MathEvaluationAttempt = {
  attemptId: string;
  itemId: string;
  constructId: string;
  result: "correct" | "incorrect" | "assisted" | "exposed" | "unresolved" | "instrument_ambiguous";
  attemptedValue: unknown;
  observedErrorType?: string;
  assistance: "none" | "read" | "rephrase" | "explain" | "example" | "advance" | "unknown";
  exposure: "unseen" | "taught" | "practiced";
  responseMode: "selection" | "numeric" | "construction" | "explanation";
  device: { kind: string; inputMethods: string[] };
  artifactId: string;
  occurredAt: string;
};

export type MathEvaluationFinding = EvidenceConfidence & {
  constructId: string;
  summary: string;
  evidenceIds: string[];
  nextEvidenceRequired: string[];
};

export type MathEvaluationFindings = {
  version: 1;
  findingsId: string;
  evaluationId: string;
  evaluationArtifactId: string;
  evaluationHash: string;
  homeworkId: string;
  cycleId: string;
  academicContractHash: string;
  completedAt: string;
  demonstrated: MathEvaluationFinding[];
  holes: MathEvaluationFinding[];
  assisted: MathEvaluationFinding[];
  ambiguities: MathEvaluationFinding[];
  provenance: Array<{
    evidenceId: string;
    itemId: string;
    constructId: string;
    result: MathEvaluationAttempt["result"];
    assistance: MathEvaluationAttempt["assistance"];
    exposure: MathEvaluationAttempt["exposure"];
    responseMode: MathEvaluationAttempt["responseMode"];
    device: MathEvaluationAttempt["device"];
    artifactId: string;
    occurredAt: string;
    observedErrorType?: string;
  }>;
};

export type MathInterventionAction =
  | "visual_explainer"
  | "catalog_intervention"
  | "bounded_evaluation"
  | "transfer_planning";

export type MathInterventionDecision = EvidenceConfidence & {
  version: 1;
  decisionId: string;
  findingsHash: string;
  action: MathInterventionAction;
  targetConstructIds: string[];
  evidenceIds: string[];
  rationale: string;
  falsifyingEvidence: string[];
  measurementKeys: string[];
  nextEvidenceRequired: string[];
};

export type AdaptiveBoardPlannerContext = {
  findingsHash: string;
  interventionDecisionId: string;
  decision: MathInterventionDecision;
  findings: MathEvaluationFindings;
  historicalEvidence: Array<{ evidenceId: string; summary: string }>;
};

export type MathBoardWorkerState =
  | "waiting"
  | "planning"
  | "designing"
  | "building"
  | "ready"
  | "provider_paused"
  | "publication_failed";

export type MathBoardWorkerJob = {
  version: 1;
  jobId: string;
  jobFile: string;
  childId: string;
  homeworkId: string;
  cycleId: string;
  assignmentSourceHash: string;
  frozenExtractionHash: string;
  childChartSnapshotHash: string;
  findingsHash: string;
  findings: MathEvaluationFindings;
  decision: MathInterventionDecision;
  decisionHash: string;
  academicContractHash: string;
  expectedArtifactIds: string[];
  completedArtifactIds: string[];
  missingArtifactIds: string[];
  artifactHashes: Record<string, string>;
  state: MathBoardWorkerState;
  attempts: number;
  calls: number;
  tokens: number;
  costUsd: number | null;
  costAccountingComplete: boolean;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  failure?: string;
  history: Array<{ state: MathBoardWorkerState; at: string }>;
};

type MathBoardBuildResult = {
  completedArtifactIds: string[];
  artifactHashes: Record<string, string>;
  calls: number;
  tokens: number;
  costUsd: number | null;
  costAccountingComplete: boolean;
  inputFindingsHash: string;
};

type MathBoardWorkerUsage = {
  calls: number;
  tokens: number;
  costUsd: number | null;
  costAccountingComplete: boolean;
};

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`adaptive_math_missing_${label}`);
  return value.trim();
}

function requiredStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`adaptive_math_missing_${label}`);
  return value.map((entry, index) => requiredString(entry, `${label}_${index}`));
}

function confidence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`adaptive_math_invalid_${label}`);
  }
  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function adaptiveMathSnapshotHash(value: unknown): string {
  return stableHash(value);
}

export function adaptiveMathDraftBindingKey(input: {
  findingsHash: string;
  decisionId: string;
  decisionHash: string;
  childChartSnapshotHash: string;
  frozenExtractionHash: string;
  academicContractHash: string;
}): string {
  Object.entries(input).forEach(([key, value]) => requiredString(value, `draft_binding_${key}`));
  return stableHash(input).slice(0, 16);
}

export function mathQuestionFingerprint(prompt: string): string {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function atomicWriteJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export const MATH_OPENING_EVALUATION_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "version", "evaluationId", "artifactId", "homeworkId", "cycleId", "academicContractHash",
    "title", "openingPromise", "firstAction", "assumptions", "predictions", "items",
  ],
  properties: {
    version: { const: 1 },
    evaluationId: { type: "string", minLength: 1 },
    artifactId: { type: "string", minLength: 1 },
    homeworkId: { type: "string", minLength: 1 },
    cycleId: { type: "string", minLength: 1 },
    academicContractHash: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    openingPromise: { type: "string", minLength: 1 },
    firstAction: { type: "string", minLength: 1 },
    assumptions: {
      type: "array", minItems: 1, items: {
        type: "object", additionalProperties: false,
        required: ["assumptionId", "claim", "evidenceIds", "confidence", "uncertainty", "falsifyingEvidence"],
        properties: {
          assumptionId: { type: "string", minLength: 1 }, claim: { type: "string", minLength: 1 },
          evidenceIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          confidence: { type: "number", minimum: 0, maximum: 1 }, uncertainty: { type: "string", minLength: 1 },
          falsifyingEvidence: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        },
      },
    },
    predictions: {
      type: "array", minItems: 1, items: {
        type: "object", additionalProperties: false,
        required: ["predictionId", "constructId", "claim", "evidenceIds", "confidence", "uncertainty", "falsifyingEvidence", "measurementKeys"],
        properties: {
          predictionId: { type: "string", minLength: 1 }, constructId: { type: "string", minLength: 1 },
          claim: { type: "string", minLength: 1 },
          evidenceIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          confidence: { type: "number", minimum: 0, maximum: 1 }, uncertainty: { type: "string", minLength: 1 },
          falsifyingEvidence: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          measurementKeys: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        },
      },
    },
    items: {
      type: "array", minItems: 1, items: {
        type: "object", additionalProperties: false,
        required: ["itemId", "constructId", "prerequisiteConstructIds", "prompt", "sourceEvidenceIds", "sourceQuestionFingerprint", "exposureIdentity", "difficultyBoundary", "response"],
        properties: {
          itemId: { type: "string", minLength: 1 }, constructId: { type: "string", minLength: 1 },
          prerequisiteConstructIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          prompt: { type: "string", minLength: 1 },
          sourceEvidenceIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          sourceQuestionFingerprint: { type: "string", minLength: 1 }, exposureIdentity: { type: "string", pattern: "^unseen:" },
          difficultyBoundary: {
            type: "object", additionalProperties: false,
            required: ["allowedConcepts", "allowedRepresentations", "excludedExtensions"],
            properties: {
              allowedConcepts: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
              allowedRepresentations: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
              excludedExtensions: { type: "array", items: { type: "string", minLength: 1 } },
            },
          },
          response: {
            oneOf: [
              { type: "object", additionalProperties: false, required: ["mode", "options"], properties: {
                mode: { const: "selection" }, options: { type: "array", minItems: 2, items: {
                  type: "object", additionalProperties: false, required: ["id", "label", "correct"],
                  properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, correct: { type: "boolean" } },
                } },
              } },
              { type: "object", additionalProperties: false, required: ["mode", "expected"], properties: {
                mode: { const: "numeric" }, expected: { type: "number" }, unit: { type: "string" },
              } },
              { type: "object", additionalProperties: false, required: ["mode", "expectedState", "successDescription"], properties: {
                mode: { const: "construction" }, expectedState: { type: "object", minProperties: 1 }, successDescription: { type: "string", minLength: 1 },
              } },
            ],
          },
        },
      },
    },
  },
} as const;

function normalizedTokens(value: string): string[] {
  const numberWords: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  };
  const stop = new Set([
    "a", "an", "and", "are", "ask", "asks", "both", "count", "counts", "does", "each", "explain",
    "for", "in", "is", "number", "numbers", "of", "on", "say", "the", "there", "these",
    "those", "to", "what", "which", "with",
  ]);
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter(Boolean)
    .map((token) => numberWords[token] ?? token)
    .filter((token) => !/^\d+$/.test(token) && !stop.has(token))
    .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token);
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalizedTokens(left));
  const b = new Set(normalizedTokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  const jaccard = overlap / new Set([...a, ...b]).size;
  const containment = overlap / Math.min(a.size, b.size);
  return Math.max(jaccard, containment);
}

function validateOpeningResponse(item: MathOpeningEvaluationItem): void {
  if (!item.response || !["selection", "numeric", "construction"].includes(item.response.mode)) {
    throw new Error(`opening_evaluation_response_contract_invalid:${item.itemId}`);
  }
  if (item.response.mode === "selection") {
    if (!Array.isArray(item.response.options) || item.response.options.length < 2) {
      throw new Error(`opening_evaluation_selection_options_invalid:${item.itemId}`);
    }
    const ids = item.response.options.map((option) => requiredString(option.id, "selection_option_id"));
    item.response.options.forEach((option) => requiredString(option.label, "selection_option_label"));
    if (new Set(ids).size !== ids.length) throw new Error(`opening_evaluation_selection_option_ids_invalid:${item.itemId}`);
    if (item.response.options.filter((option) => option.correct === true).length !== 1) {
      throw new Error(`opening_evaluation_selection_correctness_invalid:${item.itemId}`);
    }
    return;
  }
  if (item.response.mode === "numeric") {
    if (typeof item.response.expected !== "number" || !Number.isFinite(item.response.expected)) {
      throw new Error(`opening_evaluation_numeric_contract_invalid:${item.itemId}`);
    }
    return;
  }
  const entries = item.response.expectedState && typeof item.response.expectedState === "object"
    ? Object.entries(item.response.expectedState)
    : [];
  if (entries.length === 0 || entries.some(([key, value]) => !key.trim() || !["string", "number", "boolean"].includes(typeof value))) {
    throw new Error(`opening_evaluation_construction_contract_invalid:${item.itemId}`);
  }
  requiredString(item.response.successDescription, "construction_success_description");
}

export function buildMathOpeningEvaluationPrompt(input: {
  assignment: MathOpeningEvaluationAssignment;
  childChart: unknown;
}): string {
  return `You are Sunny's existing AI Math Planner preparing the independent opening evaluation transaction.

Create fresh, age-appropriate items that measure the assignment concepts and prerequisite relationships. Do not teach, hint, demonstrate, or reveal an answer before the child's first response. Do not copy or lightly rewrite a school worksheet question. The experience may be playful, but its first response must remain independent.

Bind every item to a construct ID, prerequisite construct IDs, assignment evidence IDs, a unique unseen exposure identity, a response contract, a correct-answer contract, and a difficulty boundary. Prefer the lowest-friction response mode that preserves the mathematical evidence on the detected device. Record assumptions and predictions with confidence, uncertainty, falsifying evidence, and measurement keys. Evaluation completion does not establish mastery.

Assignment identity and extracted scope:
${JSON.stringify(input.assignment, null, 2)}

Factual child chart snapshot:
${JSON.stringify(input.childChart, null, 2)}`;
}

export function createMathOpeningEvaluation(
  value: MathOpeningEvaluation,
  assignment: MathOpeningEvaluationAssignment,
): MathOpeningEvaluation {
  if (value.version !== 1) throw new Error("opening_evaluation_version_unsupported");
  if (value.homeworkId !== assignment.homeworkId || value.cycleId !== assignment.cycleId) {
    throw new Error("opening_evaluation_assignment_identity_mismatch");
  }
  if (value.academicContractHash !== assignment.academicContractHash) {
    throw new Error("opening_evaluation_academic_contract_mismatch");
  }
  requiredString(value.evaluationId, "evaluation_id");
  requiredString(value.artifactId, "evaluation_artifact_id");
  requiredString(value.academicContractHash, "academic_contract_hash");
  requiredString(value.title, "evaluation_title");
  requiredString(value.openingPromise, "opening_promise");
  requiredString(value.firstAction, "first_action");
  if (!Array.isArray(value.items) || value.items.length === 0) throw new Error("opening_evaluation_items_missing");
  const itemIds = new Set<string>();
  const assignmentEvidenceIds = new Set(assignment.sourceEvidenceIds);
  for (const item of value.items) {
    if (itemIds.has(item.itemId)) throw new Error(`opening_evaluation_duplicate_item:${item.itemId}`);
    itemIds.add(requiredString(item.itemId, "item_id"));
    requiredString(item.constructId, "construct_id");
    requiredString(item.prompt, "item_prompt");
    requiredStrings(item.prerequisiteConstructIds, "prerequisite_construct_ids");
    const sourceEvidenceIds = requiredStrings(item.sourceEvidenceIds, "source_evidence_ids");
    if (sourceEvidenceIds.some((evidenceId) => !assignmentEvidenceIds.has(evidenceId))) {
      throw new Error(`opening_evaluation_unknown_source_evidence:${item.itemId}`);
    }
    if (!item.exposureIdentity.startsWith("unseen:")) throw new Error(`opening_evaluation_item_not_unseen:${item.itemId}`);
    const computedQuestionFingerprint = mathQuestionFingerprint(item.prompt);
    if (assignment.sourceQuestionFingerprints.includes(computedQuestionFingerprint)) {
      throw new Error(`opening_evaluation_copies_source_question:${item.itemId}`);
    }
    if (assignment.sourceQuestionTexts.some((sourceQuestion) => tokenSimilarity(sourceQuestion, item.prompt) >= 0.5)) {
      throw new Error(`opening_evaluation_lightly_rewrites_source_question:${item.itemId}`);
    }
    requiredStrings(item.difficultyBoundary?.allowedConcepts, "allowed_concepts");
    requiredStrings(item.difficultyBoundary?.allowedRepresentations, "allowed_representations");
    if (!Array.isArray(item.difficultyBoundary?.excludedExtensions)) throw new Error("adaptive_math_missing_excluded_extensions");
    validateOpeningResponse(item);
  }
  if (!Array.isArray(value.assumptions) || value.assumptions.length === 0) throw new Error("opening_evaluation_assumptions_missing");
  const knownEvidenceIds = new Set([...assignment.sourceEvidenceIds, ...assignment.contextEvidenceIds]);
  value.assumptions.forEach((entry) => {
    requiredString(entry.assumptionId, "assumption_id");
    const evidenceIds = requiredStrings(entry.evidenceIds, "assumption_evidence_ids");
    if (evidenceIds.some((evidenceId) => !knownEvidenceIds.has(evidenceId))) {
      throw new Error(`opening_evaluation_unknown_assumption_evidence:${entry.assumptionId}`);
    }
    confidence(entry.confidence, "assumption_confidence");
    requiredString(entry.uncertainty, "assumption_uncertainty");
    requiredStrings(entry.falsifyingEvidence, "assumption_falsifying_evidence");
  });
  if (!Array.isArray(value.predictions) || value.predictions.length === 0) throw new Error("opening_evaluation_predictions_missing");
  value.predictions.forEach((entry) => {
    requiredString(entry.predictionId, "prediction_id");
    requiredString(entry.constructId, "prediction_construct_id");
    const evidenceIds = requiredStrings(entry.evidenceIds, "prediction_evidence_ids");
    if (evidenceIds.some((evidenceId) => !knownEvidenceIds.has(evidenceId))) {
      throw new Error(`opening_evaluation_unknown_prediction_evidence:${entry.predictionId}`);
    }
    confidence(entry.confidence, "prediction_confidence");
    requiredString(entry.uncertainty, "prediction_uncertainty");
    requiredStrings(entry.falsifyingEvidence, "prediction_falsifying_evidence");
    requiredStrings(entry.measurementKeys, "prediction_measurement_keys");
  });
  const result = structuredClone(value);
  result.items.forEach((item) => {
    item.sourceQuestionFingerprint = mathQuestionFingerprint(item.prompt);
  });
  result.evaluationHash = mathOpeningEvaluationHash(result);
  return result;
}

export function mathOpeningEvaluationHash(value: MathOpeningEvaluation): string {
  const { evaluationHash: _ignored, ...frozenEvaluation } = value;
  return stableHash(frozenEvaluation);
}

function findingFor(
  constructId: string,
  evidenceIds: string[],
  kind: "demonstrated" | "hole" | "assisted" | "ambiguity",
): MathEvaluationFinding {
  const language = {
    demonstrated: "Fresh unassisted evidence demonstrated this construct in the measured context.",
    hole: "Fresh evidence showed an incorrect or unresolved response for this construct.",
    assisted: "The response used support or prior exposure, so independence remains unknown.",
    ambiguity: "The instrument or response mode may have confounded the observed result.",
  }[kind];
  return {
    constructId,
    summary: language,
    evidenceIds,
    confidence: evidenceIds.length > 1 ? 0.72 : 0.58,
    uncertainty: "This finding is limited to the captured items, context, assistance, and response mode.",
    nextEvidenceRequired: [`Fresh unassisted evidence for ${constructId} using an unexposed item.`],
  };
}

function groupedFindings(
  attempts: MathEvaluationAttempt[],
  include: (attempt: MathEvaluationAttempt) => boolean,
  kind: "demonstrated" | "hole" | "assisted" | "ambiguity",
): MathEvaluationFinding[] {
  const grouped = new Map<string, string[]>();
  attempts.filter(include).forEach((attempt) => {
    grouped.set(attempt.constructId, [...(grouped.get(attempt.constructId) ?? []), attempt.attemptId]);
  });
  return [...grouped.entries()].map(([constructId, evidenceIds]) => findingFor(constructId, evidenceIds, kind));
}

function answerContractMatches(item: MathOpeningEvaluationItem, attemptedValue: unknown): boolean {
  if (item.response.mode === "selection") {
    const selectedId = typeof attemptedValue === "string"
      ? attemptedValue
      : attemptedValue && typeof attemptedValue === "object" && "optionId" in attemptedValue
        ? String((attemptedValue as { optionId: unknown }).optionId)
        : "";
    return item.response.options.some((option) => option.id === selectedId && option.correct);
  }
  if (item.response.mode === "numeric") return attemptedValue === item.response.expected;
  if (item.response.mode === "construction") {
    if (!attemptedValue || typeof attemptedValue !== "object" || Array.isArray(attemptedValue)) return false;
    const actual = attemptedValue as Record<string, unknown>;
    return Object.entries(item.response.expectedState).every(([key, expected]) => actual[key] === expected);
  }
  return false;
}

export function createMathEvaluationFindings(input: {
  evaluation: MathOpeningEvaluation;
  attempts: MathEvaluationAttempt[];
  completedAt: string;
}): MathEvaluationFindings {
  if (input.evaluation.evaluationHash !== mathOpeningEvaluationHash(input.evaluation)) {
    throw new Error("evaluation_findings_evaluation_hash_mismatch");
  }
  const itemsById = new Map(input.evaluation.items.map((item) => [item.itemId, item]));
  const attemptIds = new Set<string>();
  input.attempts.forEach((attempt) => {
    const item = itemsById.get(attempt.itemId);
    if (!item) throw new Error(`evaluation_attempt_unknown_item:${attempt.itemId}`);
    if (attempt.constructId !== item.constructId) {
      throw new Error(`evaluation_attempt_construct_mismatch:${attempt.attemptId}`);
    }
    if (attempt.responseMode !== item.response.mode) {
      throw new Error(`evaluation_attempt_response_mode_mismatch:${attempt.attemptId}`);
    }
    if (attempt.result === "correct" && !answerContractMatches(item, attempt.attemptedValue)) {
      throw new Error(`evaluation_attempt_correctness_mismatch:${attempt.attemptId}`);
    }
    if (attempt.result === "incorrect" && answerContractMatches(item, attempt.attemptedValue)) {
      throw new Error(`evaluation_attempt_scoring_disagreement:${attempt.attemptId}`);
    }
    if (attemptIds.has(attempt.attemptId)) throw new Error(`evaluation_attempt_duplicate:${attempt.attemptId}`);
    attemptIds.add(requiredString(attempt.attemptId, "attempt_id"));
    requiredString(attempt.artifactId, "attempt_artifact_id");
    if (attempt.artifactId !== input.evaluation.artifactId) {
      throw new Error(`evaluation_attempt_artifact_mismatch:${attempt.attemptId}`);
    }
  });
  const packet: MathEvaluationFindings = {
    version: 1,
    findingsId: `findings:${input.evaluation.evaluationId}`,
    evaluationId: input.evaluation.evaluationId,
    evaluationArtifactId: input.evaluation.artifactId,
    evaluationHash: input.evaluation.evaluationHash,
    homeworkId: input.evaluation.homeworkId,
    cycleId: input.evaluation.cycleId,
    academicContractHash: input.evaluation.academicContractHash,
    completedAt: requiredString(input.completedAt, "findings_completed_at"),
    demonstrated: groupedFindings(input.attempts, (attempt) =>
      attempt.result === "correct" && attempt.assistance === "none" && attempt.exposure === "unseen", "demonstrated"),
    holes: groupedFindings(input.attempts, (attempt) =>
      attempt.result === "incorrect" || attempt.result === "unresolved", "hole"),
    assisted: groupedFindings(input.attempts, (attempt) =>
      attempt.result === "assisted" || attempt.result === "exposed" || attempt.assistance !== "none", "assisted"),
    ambiguities: groupedFindings(input.attempts, (attempt) =>
      attempt.result === "instrument_ambiguous", "ambiguity"),
    provenance: input.attempts.map((attempt) => ({
      evidenceId: attempt.attemptId,
      itemId: attempt.itemId,
      constructId: attempt.constructId,
      result: attempt.result,
      assistance: attempt.assistance,
      exposure: attempt.exposure,
      responseMode: attempt.responseMode,
      device: structuredClone(attempt.device),
      artifactId: attempt.artifactId,
      occurredAt: attempt.occurredAt,
      ...(attempt.observedErrorType ? { observedErrorType: attempt.observedErrorType } : {}),
    })),
  };
  return packet;
}

export function mathEvaluationFindingsHash(findings: MathEvaluationFindings): string {
  return stableHash(findings);
}

export function createMathInterventionDecision(
  value: MathInterventionDecision,
  findings: MathEvaluationFindings,
): MathInterventionDecision {
  if (value.version !== 1) throw new Error("intervention_decision_version_unsupported");
  if (value.findingsHash !== mathEvaluationFindingsHash(findings)) throw new Error("intervention_decision_findings_hash_mismatch");
  requiredString(value.decisionId, "decision_id");
  if (!["visual_explainer", "catalog_intervention", "bounded_evaluation", "transfer_planning"].includes(value.action)) {
    throw new Error("intervention_decision_action_invalid");
  }
  requiredStrings(value.targetConstructIds, "decision_target_construct_ids");
  requiredStrings(value.evidenceIds, "decision_evidence_ids");
  const knownEvidence = new Set(findings.provenance.map((entry) => entry.evidenceId));
  const unknown = value.evidenceIds.filter((evidenceId) => !knownEvidence.has(evidenceId));
  if (unknown.length > 0) throw new Error(`intervention_decision_unknown_evidence:${unknown.join(",")}`);
  const citedConstructs = new Set(findings.provenance
    .filter((entry) => value.evidenceIds.includes(entry.evidenceId))
    .map((entry) => entry.constructId));
  const unsupportedTargets = value.targetConstructIds.filter((constructId) => !citedConstructs.has(constructId));
  if (unsupportedTargets.length > 0) throw new Error(`intervention_decision_target_not_supported:${unsupportedTargets.join(",")}`);
  requiredString(value.rationale, "decision_rationale");
  confidence(value.confidence, "decision_confidence");
  requiredString(value.uncertainty, "decision_uncertainty");
  requiredStrings(value.falsifyingEvidence, "decision_falsifying_evidence");
  requiredStrings(value.measurementKeys, "decision_measurement_keys");
  requiredStrings(value.nextEvidenceRequired, "decision_next_evidence_required");
  return structuredClone(value);
}

export function buildAdaptiveBoardPlannerContext(input: {
  findings: MathEvaluationFindings;
  decision: MathInterventionDecision;
  historicalEvidence: Array<{ evidenceId: string; summary: string }>;
}): AdaptiveBoardPlannerContext {
  if (input.decision.findingsHash !== mathEvaluationFindingsHash(input.findings)) {
    throw new Error("adaptive_math_planner_context_decision_mismatch");
  }
  return {
    findingsHash: mathEvaluationFindingsHash(input.findings),
    interventionDecisionId: requiredString(input.decision.decisionId, "planner_intervention_decision_id"),
    decision: structuredClone(input.decision),
    findings: structuredClone(input.findings),
    historicalEvidence: structuredClone(input.historicalEvidence),
  };
}

function transitionJob(job: MathBoardWorkerJob, state: MathBoardWorkerState): MathBoardWorkerJob {
  const now = new Date();
  const startedAtMs = Date.parse(job.startedAt);
  const next = {
    ...job,
    state,
    updatedAt: now.toISOString(),
    elapsedMs: Number.isFinite(startedAtMs) ? Math.max(0, now.getTime() - startedAtMs) : job.elapsedMs,
    history: [...job.history, { state, at: now.toISOString() }],
  };
  atomicWriteJson(job.jobFile, next);
  console.log(` 🎮 [adaptive-math-worker] [state] [${state}] job=${job.jobId}`);
  return next;
}

function validateMathBoardWorkerJob(value: MathBoardWorkerJob): MathBoardWorkerJob {
  try {
    if (value.version !== 1) throw new Error("version");
    requiredString(value.jobId, "worker_job_id");
    requiredString(value.jobFile, "worker_job_file");
    requiredString(value.childId, "worker_child_id");
    requiredString(value.homeworkId, "worker_homework_id");
    requiredString(value.cycleId, "worker_cycle_id");
    requiredString(value.assignmentSourceHash, "worker_assignment_source_hash");
    requiredString(value.frozenExtractionHash, "worker_frozen_extraction_hash");
    requiredString(value.childChartSnapshotHash, "worker_child_chart_snapshot_hash");
    requiredString(value.academicContractHash, "worker_academic_contract_hash");
    const findingsHash = mathEvaluationFindingsHash(value.findings);
    if (findingsHash !== value.findingsHash || value.decision.findingsHash !== findingsHash) throw new Error("findings_hash");
    createMathInterventionDecision(value.decision, value.findings);
    if (adaptiveMathSnapshotHash(value.decision) !== value.decisionHash) throw new Error("decision_hash");
    if (value.homeworkId !== value.findings.homeworkId
      || value.cycleId !== value.findings.cycleId
      || value.academicContractHash !== value.findings.academicContractHash) throw new Error("evidence_identity");
    if (!Array.isArray(value.expectedArtifactIds)) throw new Error("expected_artifacts");
    const expected = value.expectedArtifactIds.map((id, index) => requiredString(id, `worker_expected_artifacts_${index}`));
    if (new Set(expected).size !== expected.length) throw new Error("duplicate_expected_artifacts");
    const completed = value.completedArtifactIds ?? [];
    const missing = value.missingArtifactIds ?? [];
    if (completed.some((id) => !expected.includes(id)) || missing.some((id) => !expected.includes(id))) throw new Error("unknown_artifact");
    if (new Set([...completed, ...missing]).size !== expected.length
      || expected.some((id) => completed.includes(id) === missing.includes(id))) throw new Error("artifact_partition");
    if (Object.keys(value.artifactHashes ?? {}).some((id) => !expected.includes(id))) throw new Error("unknown_artifact_hash");
    if (value.state === "ready" && (missing.length > 0 || expected.some((id) => !value.artifactHashes[id]?.trim()))) {
      throw new Error("ready_incomplete");
    }
    if (!(["waiting", "planning", "designing", "building", "ready", "provider_paused", "publication_failed"] as string[]).includes(value.state)) {
      throw new Error("state");
    }
    if (typeof value.costAccountingComplete !== "boolean") throw new Error("cost_accounting");
    const nonnegativeInteger = (entry: unknown, label: string): void => {
      if (!Number.isInteger(entry) || (entry as number) < 0) throw new Error(label);
    };
    nonnegativeInteger(value.attempts, "attempts");
    nonnegativeInteger(value.calls, "calls");
    nonnegativeInteger(value.tokens, "tokens");
    if (typeof value.elapsedMs !== "number" || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0) throw new Error("elapsed_ms");
    if (value.costUsd !== null && (typeof value.costUsd !== "number" || !Number.isFinite(value.costUsd) || value.costUsd < 0)) {
      throw new Error("cost_usd");
    }
    if (value.costAccountingComplete && value.costUsd === null) throw new Error("complete_cost_missing");
    if (!Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error("timestamp");
    if (!Array.isArray(value.history) || value.history.length === 0 || value.history.some((entry) =>
      !(["waiting", "planning", "designing", "building", "ready", "provider_paused", "publication_failed"] as string[]).includes(entry.state)
      || !Number.isFinite(Date.parse(entry.at)))) throw new Error("history");
    return value;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`adaptive_math_worker_checkpoint_invalid:${reason}`);
  }
}

export function createMathBoardWorkerJob(input: {
  rootDir: string;
  childId: string;
  homeworkId: string;
  cycleId: string;
  assignmentSourceHash: string;
  frozenExtractionHash: string;
  childChartSnapshotHash: string;
  findings: MathEvaluationFindings;
  decision: MathInterventionDecision;
  academicContractHash: string;
  expectedArtifactIds: string[];
}): MathBoardWorkerJob {
  const findingsHash = mathEvaluationFindingsHash(input.findings);
  if (input.decision.findingsHash !== findingsHash) {
    throw new Error("adaptive_math_worker_findings_hash_mismatch");
  }
  if (input.homeworkId !== input.findings.homeworkId
    || input.cycleId !== input.findings.cycleId
    || input.academicContractHash !== input.findings.academicContractHash) {
    throw new Error("adaptive_math_worker_evidence_identity_mismatch");
  }
  const childId = requiredString(input.childId, "worker_child_id");
  const decision = createMathInterventionDecision(input.decision, input.findings);
  const decisionHash = adaptiveMathSnapshotHash(decision);
  const jobKey = stableHash({
    childId,
    homeworkId: input.homeworkId,
    cycleId: input.cycleId,
    decisionId: input.decision.decisionId,
    decisionHash,
    findingsHash,
    academicContractHash: input.academicContractHash,
    assignmentSourceHash: input.assignmentSourceHash,
    frozenExtractionHash: input.frozenExtractionHash,
    childChartSnapshotHash: input.childChartSnapshotHash,
    expectedArtifactIds: [...input.expectedArtifactIds].sort(),
  }).slice(0, 16);
  const jobFile = path.join(input.rootDir, "outputs", "adaptive-math-worker", input.homeworkId, `${jobKey}.json`);
  if (fs.existsSync(jobFile)) return validateMathBoardWorkerJob(readJson<MathBoardWorkerJob>(jobFile));
  if (!Array.isArray(input.expectedArtifactIds)) throw new Error("adaptive_math_invalid_worker_expected_artifact_ids");
  const expectedArtifactIds = input.expectedArtifactIds.map((id, index) => requiredString(id, `worker_expected_artifact_ids_${index}`));
  if (new Set(expectedArtifactIds).size !== expectedArtifactIds.length) {
    throw new Error("adaptive_math_duplicate_worker_expected_artifact_ids");
  }
  const createdAt = new Date().toISOString();
  const job: MathBoardWorkerJob = {
    version: 1,
    jobId: `adaptive-board:${input.homeworkId}:${input.decision.decisionId}`,
    jobFile,
    childId,
    homeworkId: input.homeworkId,
    cycleId: input.cycleId,
    assignmentSourceHash: input.assignmentSourceHash,
    frozenExtractionHash: input.frozenExtractionHash,
    childChartSnapshotHash: input.childChartSnapshotHash,
    findingsHash,
    findings: structuredClone(input.findings),
    decision: structuredClone(decision),
    decisionHash,
    academicContractHash: input.academicContractHash,
    expectedArtifactIds,
    completedArtifactIds: [],
    missingArtifactIds: [...expectedArtifactIds],
    artifactHashes: {},
    state: "waiting",
    attempts: 0,
    calls: 0,
    tokens: 0,
    costUsd: 0,
    costAccountingComplete: true,
    startedAt: createdAt,
    updatedAt: createdAt,
    elapsedMs: 0,
    history: [{ state: "waiting", at: createdAt }],
  };
  atomicWriteJson(jobFile, job);
  return job;
}

export async function runMathBoardWorker(
  jobFile: string,
  dependencies: {
    build: (input: {
      homeworkId: string;
      cycleId: string;
      frozenExtractionHash: string;
      childChartSnapshotHash: string;
      findingsHash: string;
      findings: MathEvaluationFindings;
      decisionId: string;
      decision: MathInterventionDecision;
      academicContractHash: string;
      expectedArtifactIds: string[];
      completedArtifactIds: string[];
      reportPhase: (state: Extract<MathBoardWorkerState, "planning" | "designing" | "building">) => void;
      reportExpectedArtifacts: (artifactIds: string[]) => void;
      reportArtifact: (artifactId: string, artifactHash: string) => void;
      reportUsage: (usage: MathBoardWorkerUsage) => void;
    }) => Promise<MathBoardBuildResult>;
    failureState?: (error: unknown) => Extract<MathBoardWorkerState, "provider_paused" | "publication_failed">;
  },
): Promise<MathBoardWorkerJob> {
  let job = validateMathBoardWorkerJob(readJson<MathBoardWorkerJob>(jobFile));
  if (job.state === "ready") return job;
  job = { ...job, attempts: job.attempts + 1, failure: undefined };
  atomicWriteJson(jobFile, job);
  const reportPhase = (state: Extract<MathBoardWorkerState, "planning" | "designing" | "building">): void => {
    job = transitionJob(job, state);
  };
  const reportArtifact = (artifactId: string, artifactHash: string): void => {
    if (!job.expectedArtifactIds.includes(artifactId)) {
      throw new Error(`adaptive_math_worker_unexpected_artifact:${artifactId}`);
    }
    const completed = new Set([...job.completedArtifactIds, artifactId]);
    job = {
      ...job,
      completedArtifactIds: job.expectedArtifactIds.filter((id) => completed.has(id)),
      missingArtifactIds: job.expectedArtifactIds.filter((id) => !completed.has(id)),
      artifactHashes: { ...job.artifactHashes, [artifactId]: requiredString(artifactHash, "worker_artifact_hash") },
    };
    atomicWriteJson(job.jobFile, job);
    console.log(` 🎮 [adaptive-math-worker] [artifact] [saved] id=${artifactId}`);
  };
  const reportExpectedArtifacts = (artifactIds: string[]): void => {
    const expected = requiredStrings(artifactIds, "worker_reported_expected_artifact_ids");
    if (new Set(expected).size !== expected.length) throw new Error("adaptive_math_duplicate_worker_reported_artifacts");
    if (job.expectedArtifactIds.length > 0 && stableHash(job.expectedArtifactIds) !== stableHash(expected)) {
      throw new Error("adaptive_math_worker_expected_artifacts_changed");
    }
    job = {
      ...job,
      expectedArtifactIds: expected,
      completedArtifactIds: expected.filter((id) => job.completedArtifactIds.includes(id)),
      missingArtifactIds: expected.filter((id) => !job.completedArtifactIds.includes(id)),
    };
    atomicWriteJson(job.jobFile, job);
  };
  let usageReportedThisAttempt = false;
  const reportUsage = (usage: MathBoardWorkerUsage): void => {
    if (!Number.isInteger(usage.calls) || usage.calls < 0
      || !Number.isInteger(usage.tokens) || usage.tokens < 0
      || (usage.costUsd !== null && (!Number.isFinite(usage.costUsd) || usage.costUsd < 0))
      || typeof usage.costAccountingComplete !== "boolean"
      || (usage.costAccountingComplete && usage.costUsd === null)) {
      throw new Error("adaptive_math_worker_usage_invalid");
    }
    usageReportedThisAttempt = true;
    job = {
      ...job,
      calls: job.calls + usage.calls,
      tokens: job.tokens + usage.tokens,
      costUsd: job.costUsd === null || usage.costUsd === null
        ? null
        : Number((job.costUsd + usage.costUsd).toFixed(6)),
      costAccountingComplete: job.costAccountingComplete && usage.costAccountingComplete,
    };
    atomicWriteJson(job.jobFile, job);
  };
  try {
    const result = await dependencies.build({
      homeworkId: job.homeworkId,
      cycleId: job.cycleId,
      frozenExtractionHash: job.frozenExtractionHash,
      childChartSnapshotHash: job.childChartSnapshotHash,
      findingsHash: job.findingsHash,
      findings: structuredClone(job.findings),
      decisionId: job.decision.decisionId,
      decision: structuredClone(job.decision),
      academicContractHash: job.academicContractHash,
      expectedArtifactIds: [...job.expectedArtifactIds],
      completedArtifactIds: [...job.completedArtifactIds],
      reportPhase,
      reportExpectedArtifacts,
      reportArtifact,
      reportUsage,
    });
    if (result.inputFindingsHash !== job.findingsHash) throw new Error("adaptive_math_worker_builder_findings_hash_mismatch");
    const completed = new Set([...job.completedArtifactIds, ...result.completedArtifactIds]);
    job = {
      ...job,
      completedArtifactIds: job.expectedArtifactIds.filter((id) => completed.has(id)),
      missingArtifactIds: job.expectedArtifactIds.filter((id) => !completed.has(id)),
      artifactHashes: { ...job.artifactHashes, ...result.artifactHashes },
      calls: job.calls + result.calls,
      tokens: job.tokens + result.tokens,
      costUsd: job.costUsd === null || result.costUsd === null
        ? null
        : Number((job.costUsd + result.costUsd).toFixed(6)),
      costAccountingComplete: job.costAccountingComplete && result.costAccountingComplete,
    };
    if (job.missingArtifactIds.length > 0) throw new Error(`adaptive_math_worker_missing_artifacts:${job.missingArtifactIds.join(",")}`);
    const missingHashes = job.expectedArtifactIds.filter((artifactId) => !job.artifactHashes[artifactId]?.trim());
    if (missingHashes.length > 0) {
      throw new Error(`adaptive_math_worker_missing_artifact_hashes:${missingHashes.join(",")}`);
    }
    return validateMathBoardWorkerJob(transitionJob(job, "ready"));
  } catch (error) {
    job = {
      ...job,
      failure: error instanceof Error ? error.message : String(error),
      ...(!usageReportedThisAttempt ? { costUsd: null, costAccountingComplete: false } : {}),
    };
    transitionJob(job, dependencies.failureState?.(error) ?? "provider_paused");
    throw error;
  }
}

function independentCorrect(attempts: MathEvaluationAttempt[], constructId: string): number {
  return attempts.filter((attempt) =>
    attempt.constructId === constructId
      && attempt.result === "correct"
      && attempt.assistance === "none"
      && attempt.exposure === "unseen").length;
}

function independentEligible(attempts: MathEvaluationAttempt[], constructId: string): number {
  return attempts.filter((attempt) =>
    attempt.constructId === constructId
      && attempt.assistance === "none"
      && attempt.exposure === "unseen"
      && attempt.result !== "instrument_ambiguous").length;
}

export function compareAdaptiveMathEvidence(input: {
  constructId: string;
  findings: MathEvaluationFindings;
  decision: MathInterventionDecision;
  beforeEvaluation: MathOpeningEvaluation;
  before: MathEvaluationAttempt[];
  intervention: {
    artifactId: string;
    decisionId: string;
    decisionHash: string;
    targetConstructIds: string[];
    evidenceIds: string[];
    completed: boolean;
    completedAt: string;
  };
  interventionEvidence: Array<{
    evidenceId: string;
    artifactId: string;
    decisionId: string;
    decisionHash: string;
    targetConstructIds: string[];
    occurredAt: string;
  }>;
  afterEvaluation: MathOpeningEvaluation;
  after: MathEvaluationAttempt[];
}): {
  outcome: "improved" | "unchanged" | "weaker" | "inconclusive";
  before: { correct: number; eligible: number };
  after: { correct: number; eligible: number };
  intervention: {
    artifactId: string;
    decisionId: string;
    decisionHash: string;
    targetConstructIds: string[];
    evidenceIds: string[];
    completed: boolean;
    completedAt: string;
  };
  claim: string;
  nextEvidenceRequired: string[];
} {
  if (input.beforeEvaluation.homeworkId !== input.afterEvaluation.homeworkId
    || input.beforeEvaluation.cycleId !== input.afterEvaluation.cycleId
    || input.beforeEvaluation.academicContractHash !== input.afterEvaluation.academicContractHash) {
    throw new Error("adaptive_math_comparison_identity_mismatch");
  }
  if (input.beforeEvaluation.evaluationHash !== mathOpeningEvaluationHash(input.beforeEvaluation)
    || input.afterEvaluation.evaluationHash !== mathOpeningEvaluationHash(input.afterEvaluation)) {
    throw new Error("adaptive_math_comparison_evaluation_hash_mismatch");
  }
  const validatedDecision = createMathInterventionDecision(input.decision, input.findings);
  if (input.intervention.decisionId !== validatedDecision.decisionId
    || input.intervention.decisionHash !== adaptiveMathSnapshotHash(validatedDecision)) {
    throw new Error("adaptive_math_comparison_decision_binding_mismatch");
  }
  if (input.findings.evaluationId !== input.beforeEvaluation.evaluationId
    || input.findings.evaluationArtifactId !== input.beforeEvaluation.artifactId
    || input.findings.evaluationHash !== input.beforeEvaluation.evaluationHash
    || input.findings.homeworkId !== input.beforeEvaluation.homeworkId
    || input.findings.cycleId !== input.beforeEvaluation.cycleId
    || input.findings.academicContractHash !== input.beforeEvaluation.academicContractHash) {
    throw new Error("adaptive_math_comparison_findings_identity_mismatch");
  }
  const recomputedFindings = createMathEvaluationFindings({
    evaluation: input.beforeEvaluation,
    attempts: input.before,
    completedAt: input.findings.completedAt,
  });
  if (mathEvaluationFindingsHash(recomputedFindings) !== mathEvaluationFindingsHash(input.findings)) {
    throw new Error("adaptive_math_comparison_findings_hash_mismatch");
  }
  createMathEvaluationFindings({
    evaluation: input.afterEvaluation,
    attempts: input.after,
    completedAt: input.after.at(-1)?.occurredAt ?? new Date(0).toISOString(),
  });
  if (input.before.some((attempt) => attempt.artifactId !== input.beforeEvaluation.artifactId)
    || input.after.some((attempt) => attempt.artifactId !== input.afterEvaluation.artifactId)) {
    throw new Error("adaptive_math_comparison_attempt_artifact_mismatch");
  }
  if (!input.intervention.completed) throw new Error("adaptive_math_comparison_intervention_incomplete");
  requiredString(input.intervention.artifactId, "comparison_intervention_artifact_id");
  requiredString(input.intervention.decisionId, "comparison_intervention_decision_id");
  requiredString(input.intervention.decisionHash, "comparison_intervention_decision_hash");
  const interventionTargets = requiredStrings(input.intervention.targetConstructIds, "comparison_intervention_targets");
  if (!interventionTargets.includes(input.constructId)) throw new Error("adaptive_math_comparison_intervention_target_mismatch");
  const interventionEvidenceIds = requiredStrings(input.intervention.evidenceIds, "comparison_intervention_evidence_ids");
  const interventionAt = Date.parse(requiredString(input.intervention.completedAt, "comparison_intervention_completed_at"));
  const beforeTimes = input.before.map((attempt) => Date.parse(attempt.occurredAt));
  const afterTimes = input.after.map((attempt) => Date.parse(attempt.occurredAt));
  if (!Number.isFinite(interventionAt) || beforeTimes.some((time) => !Number.isFinite(time)) || afterTimes.some((time) => !Number.isFinite(time))) {
    throw new Error("adaptive_math_comparison_timestamp_invalid");
  }
  if (beforeTimes.length === 0 || afterTimes.length === 0
    || Math.max(...beforeTimes) >= interventionAt || interventionAt >= Math.min(...afterTimes)) {
    throw new Error("adaptive_math_comparison_event_order_invalid");
  }
  const evidenceById = new Map(input.interventionEvidence.map((entry) => [entry.evidenceId, entry]));
  for (const evidenceId of interventionEvidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence || evidence.artifactId !== input.intervention.artifactId
      || evidence.decisionId !== input.intervention.decisionId
      || evidence.decisionHash !== input.intervention.decisionHash
      || !evidence.targetConstructIds.includes(input.constructId)) {
      throw new Error(`adaptive_math_comparison_intervention_evidence_missing:${evidenceId}`);
    }
    const evidenceAt = Date.parse(evidence.occurredAt);
    if (!Number.isFinite(evidenceAt) || evidenceAt < Math.max(...beforeTimes) || evidenceAt > interventionAt) {
      throw new Error(`adaptive_math_comparison_intervention_evidence_order_invalid:${evidenceId}`);
    }
  }
  const beforeItems = input.beforeEvaluation.items.filter((item) => item.constructId === input.constructId);
  const afterItems = input.afterEvaluation.items.filter((item) => item.constructId === input.constructId);
  if (beforeItems.length === 0 || afterItems.length === 0) {
    throw new Error("adaptive_math_comparison_construct_missing");
  }
  const difficultySignature = (items: MathOpeningEvaluationItem[]): string => stableHash(items.map((item) => ({
    prerequisiteConstructIds: [...item.prerequisiteConstructIds].sort(),
    allowedConcepts: [...item.difficultyBoundary.allowedConcepts].sort(),
    allowedRepresentations: [...item.difficultyBoundary.allowedRepresentations].sort(),
    excludedExtensions: [...item.difficultyBoundary.excludedExtensions].sort(),
    responseMode: item.response.mode,
  })));
  if (difficultySignature(beforeItems) !== difficultySignature(afterItems)) {
    throw new Error("adaptive_math_comparison_difficulty_mismatch");
  }
  const beforeExposure = new Set(beforeItems.map((item) => item.exposureIdentity));
  if (afterItems.some((item) => !item.exposureIdentity.startsWith("unseen:") || beforeExposure.has(item.exposureIdentity))) {
    throw new Error("adaptive_math_comparison_exposure_invalid");
  }
  const beforeQuestionFingerprints = new Set(beforeItems.map((item) => mathQuestionFingerprint(item.prompt)));
  if (afterItems.some((item) => beforeQuestionFingerprints.has(mathQuestionFingerprint(item.prompt)))) {
    throw new Error("adaptive_math_comparison_question_reused");
  }
  if (afterItems.some((afterItem) => beforeItems.some((beforeItem) => tokenSimilarity(beforeItem.prompt, afterItem.prompt) >= 0.5))) {
    throw new Error("adaptive_math_comparison_question_lightly_rewritten");
  }
  const before = {
    correct: independentCorrect(input.before, input.constructId),
    eligible: independentEligible(input.before, input.constructId),
  };
  const after = {
    correct: independentCorrect(input.after, input.constructId),
    eligible: independentEligible(input.after, input.constructId),
  };
  let outcome: "improved" | "unchanged" | "weaker" | "inconclusive" = "inconclusive";
  if (before.eligible > 0 && after.eligible > 0) {
    const beforeRate = before.correct / before.eligible;
    const afterRate = after.correct / after.eligible;
    outcome = afterRate > beforeRate ? "improved" : afterRate < beforeRate ? "weaker" : "unchanged";
  }
  const claim = outcome === "improved"
    ? "Fresh independent performance improved after the recorded intervention; this is consistent with helping, but repeated or externally calibrated evidence is still required."
    : `Fresh independent performance was ${outcome}; the episode does not establish mastery or intervention causation.`;
  return {
    outcome,
    before,
    after,
    intervention: structuredClone(input.intervention),
    claim,
    nextEvidenceRequired: [`Delayed or returned-work evidence for ${input.constructId}.`],
  };
}
