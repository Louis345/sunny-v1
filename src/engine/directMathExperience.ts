import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { ChildChart } from "../profiles/childChart";
import type { AssignmentSourceExtraction } from "./assignmentSourceExtraction";
import type { ActiveSessionPlan, AIContentCatalogItem } from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import { NODE_REGISTRY } from "../shared/nodeRegistry";
import { listActivityToolContracts } from "./activityToolCatalog";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import {
  createLearningCycle,
  getLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type AcademicPrediction,
  type LearningAssumption,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
} from "./learningCycleRepository";

export type DirectActivity = {
  id: string;
  title: string;
  routeId: string;
  responsibilityId: string;
  learningPurpose: string;
  academicTarget: string;
  mechanic: string;
  engagementVariable: string;
  visualMock: { scene: string; layout: string; artworkPrompt: string };
  experience: {
    objective: string;
    childAction: string;
    worldReaction: string;
    anticipation: string;
    progress: string;
    recovery: string;
    reward: string;
  };
  items: DirectItem[];
  acceptanceSteps: string[];
  creatorPrompt: string;
  designPrediction: string;
  academicPrediction: Omit<AcademicPrediction, "predictionId" | "theoryId" | "createdAt" | "lockedAt">;
  preserve: string[];
  change: string[];
  explore: string[];
  avoid: string[];
  measurementKeys: string[];
  difficultyBoundary?: MathDifficultyBoundary;
  catalogDecision?: MathCatalogDecision;
  designArtifact?: ExperienceDesignArtifactV1;
};

export type DirectItem = {
  id: string;
  prompt: string;
  lineage: {
    sourceEvidenceIds: string[];
    exposure: "unseen" | "taught" | "practiced";
  };
  response:
    | { mode: "selection"; options: Array<{ id: string; label: string; correct: boolean }> }
    | { mode: "numeric"; expected: number; unit?: string }
    | { mode: "construction"; expectedState: Record<string, string | number | boolean>; successDescription: string }
    | { mode: "explanation"; rubric: string[] };
};

export type DirectLearningResponsibility = {
  id: string;
  title: string;
  purpose: string;
  academicTarget: string;
};

export type MathDifficultyBoundary = {
  allowedConcepts: string[];
  allowedRepresentations: string[];
  excludedExtensions: string[];
  startingSupport: string;
  expectedIndependence: string;
};

export type MathCatalogDecision = {
  action: "reuse" | "revise" | "generate_new" | "retire";
  contentId?: string;
  reason: string;
};

export type MathPlannedActivity = {
  id: string;
  routeId: string;
  responsibilityId: string;
  academicTarget: string;
  difficultyBoundary: MathDifficultyBoundary;
  items: DirectItem[];
  academicPrediction: DirectActivity["academicPrediction"];
  measurementKeys: string[];
  catalogDecision: MathCatalogDecision;
};

export type AgencyExperiment = {
  experimentId: string;
  contextEvidenceIds: string[];
  academicHeldConstants: string[];
  routes: Array<{
    routeId: string;
    nodeIds: string[];
    engagementHypothesis: string;
    predictedOutcome: string;
    supportingEvidenceIds: string[];
    uncertainty: string;
    falsifyingEvidence: string[];
    measurementKeys: string[];
  }>;
};

export type MathLearningProgram = {
  planId: string;
  contentScopeRationale: string;
  concept: Omit<AssignmentConcept, "assumptions">;
  assumptions: Array<Omit<LearningAssumption, "createdAt" | "lockedAt">>;
  academicTheory: string;
  profileEvidence: string[];
  learningResponsibilities: DirectLearningResponsibility[];
  fork: {
    hypothesis: string;
    heldConstant: string[];
    routes: Array<{ id: string; academicRationale: string; nodeIds: string[] }>;
  };
  /** Present on every newly planned program; optional only while reading pre-v6 checkpoints. */
  agencyExperiment?: AgencyExperiment;
  activities: MathPlannedActivity[];
};

export type ExperienceDesignArtifactV1 = {
  artifactId: string;
  nodeId: string;
  academicContractHash: string;
  title: string;
  audienceRationale: string;
  openingPromise: string;
  firstThreeSeconds: string;
  firstAction: string;
  interactionDemonstration: string;
  coreInteraction: string;
  mathAsPower: string;
  stakes: string;
  consequences: string;
  recovery: string;
  progression: string[];
  interactionContinuity: string;
  worldReaction: string;
  payoff: string;
  replayVariation: string;
  visualDirection: string;
  motionDirection: string;
  soundDirection: string;
  usefulLibraries: string[];
  engagementPrediction: string;
  falsifyingEvidence: string;
};

export type MathDesignPacket = {
  version: 1;
  planId: string;
  boardCreativeSpine: {
    title: string;
    narrative: string;
    openingChoice: string;
    backgroundDirection: string;
    routeDirections: Array<{
      routeId: string;
      label: string;
      promise: string;
      engagementVariable: string;
    }>;
    questTeaser: string;
    questArtworkDirection: string;
    bossTeaser: string;
    bossArtworkDirection: string;
  };
  artifacts: ExperienceDesignArtifactV1[];
  rationale: string;
  model: string;
  createdAt: string;
  revision: number;
};

export type MathDesignCheckpoint = {
  version: 1;
  planId: string;
  model: string;
  expectedNodeIds: string[];
  completedNodeIds: string[];
  missingNodeIds: string[];
  boardCreativeSpine?: MathDesignPacket["boardCreativeSpine"];
  artifacts: ExperienceDesignArtifactV1[];
  rationale?: string;
  attempts: Array<{
    attempt: number;
    requestedNodeIds: string[];
    receivedNodeIds: string[];
    inputTokens: number;
    outputTokens: number;
    elapsedMs: number;
    stopReason: string;
    rawResponsePath?: string;
  }>;
};

export type BaselineBuilderAssignment = {
  nodeId: string;
  provider: "anthropic" | "openai";
  model: "claude-opus-5" | "gpt-5.5";
};

export function assignBaselineBuilderModels(
  assignmentFingerprint: string,
  activities: Array<Pick<MathPlannedActivity, "id">>,
): BaselineBuilderAssignment[] {
  const finalNibble = Number.parseInt(assignmentFingerprint.slice(-1), 16);
  const startsWithGpt = Number.isFinite(finalNibble) && finalNibble % 2 === 1;
  return activities.map((activity, index) => {
    const useGpt = index % 2 === (startsWithGpt ? 0 : 1);
    return {
      nodeId: activity.id,
      provider: useGpt ? "openai" : "anthropic",
      model: useGpt ? "gpt-5.5" : "claude-opus-5",
    };
  });
}

const schemaString = { type: "string", minLength: 1 } as const;
const schemaStrings = { type: "array", items: schemaString } as const;
const schemaObject = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object" as const, properties, required, additionalProperties: true });
const schemaItemResponse = { oneOf: [
  schemaObject({ mode: { const: "selection" }, options: { type: "array", minItems: 2, items: schemaObject({ id: schemaString, label: schemaString, correct: { type: "boolean" } }) } }), schemaObject({ mode: { const: "numeric" }, expected: { type: "number" }, unit: schemaString }, ["mode", "expected"]),
  schemaObject({ mode: { const: "construction" }, expectedState: { type: "object", minProperties: 1, additionalProperties: { type: ["string", "number", "boolean"] } }, successDescription: schemaString }), schemaObject({ mode: { const: "explanation" }, rubric: { type: "array", minItems: 1, items: schemaString } }),
] } as const;

/** Structural transport contract only. It deliberately leaves counts, mechanics, themes, and content to the Planner. */
const directMathPlannerProperties = {
  planId: schemaString, contentScopeRationale: schemaString, academicTheory: schemaString, profileEvidence: schemaStrings,
  /**
   * The concept the assignment is probing, stated separately from the assignment
   * itself. Without a first-class slot the Planner had nowhere to put the idea,
   * so `academicTarget` absorbed the worksheet's framing and every constructId
   * ended up carrying its numbers (`...fact_retrieval.x2x5x10`). `conceptId` is
   * the stable identity that must survive across assignments; `instanceScope`
   * holds what this particular sheet happens to instantiate.
   */
  concept: schemaObject({
    conceptId: schemaString,
    name: schemaString,
    statement: schemaString,
    instanceScope: schemaString,
    prerequisites: schemaStrings,
    assumptions: schemaStrings,
  }),
  learningResponsibilities: { type: "array", minItems: 1, items: schemaObject({ id: schemaString, title: schemaString, purpose: schemaString, academicTarget: schemaString }) },
  boardWorld: schemaObject({ title: schemaString, narrative: schemaString, backgroundPrompt: schemaString }),
  fork: schemaObject({ question: schemaString, hypothesis: schemaString, heldConstant: schemaStrings, routes: { type: "array", minItems: 2, maxItems: 2, items: schemaObject({ id: schemaString, label: schemaString, promise: schemaString, engagementVariable: schemaString, nodeIds: schemaStrings }) } }),
  activities: { type: "array", minItems: 1, items: schemaObject({ id: schemaString, title: schemaString, routeId: schemaString, responsibilityId: schemaString, academicTarget: schemaString, mechanic: schemaString, engagementVariable: schemaString,
    visualMock: schemaObject({ scene: schemaString, layout: schemaString, artworkPrompt: schemaString }), experience: schemaObject({ objective: schemaString, childAction: schemaString, worldReaction: schemaString, anticipation: schemaString, progress: schemaString, recovery: schemaString, reward: schemaString }),
    items: { type: "array", minItems: 1, items: schemaObject({ id: schemaString, prompt: schemaString, lineage: schemaObject({ sourceEvidenceIds: { type: "array", minItems: 1, items: schemaString }, exposure: { enum: ["unseen", "taught", "practiced"] } }), response: schemaItemResponse }) }, acceptanceSteps: schemaStrings, creatorPrompt: schemaString, designPrediction: schemaString,
    academicPrediction: schemaObject({ constructId: schemaString, context: schemaString, horizon: schemaString, expectedMetric: schemaObject({ key: schemaString, min: { type: "number" }, max: { type: "number" } }), predictedErrorPatterns: schemaStrings, confidence: { type: "number" }, evidenceIds: schemaStrings, intervention: schemaString, evidenceLimit: { const: "practice_only" } }),
    preserve: schemaStrings, change: schemaStrings, explore: schemaStrings, avoid: schemaStrings, measurementKeys: schemaStrings }) },
  quest: schemaObject({ title: { const: "Quest" }, locked: { const: true }, teaser: schemaString, artworkPrompt: schemaString }),
  boss: schemaObject({ title: { const: "Boss" }, locked: { const: true }, teaser: schemaString, artworkPrompt: schemaString }),
};

export const DIRECT_MATH_PLANNER_TOOL_SCHEMA = schemaObject(
  directMathPlannerProperties,
  Object.keys(directMathPlannerProperties).filter((key) => key !== "quest" && key !== "boss"),
);

export const MATH_LEARNING_PROGRAM_TOOL_SCHEMA = schemaObject({
  planId: schemaString,
  contentScopeRationale: schemaString,
  concept: schemaObject({
    conceptId: schemaString,
    name: schemaString,
    statement: schemaString,
    instanceScope: schemaString,
    prerequisites: schemaStrings,
  }),
  assumptions: {
    type: "array",
    minItems: 1,
    items: schemaObject({
      assumptionId: schemaString,
      claim: schemaString,
      evidenceIds: schemaStrings,
      confidence: { type: "number", minimum: 0, maximum: 1 },
      uncertainty: schemaString,
    }),
  },
  academicTheory: schemaString,
  profileEvidence: schemaStrings,
  learningResponsibilities: {
    type: "array",
    minItems: 1,
    items: schemaObject({ id: schemaString, title: schemaString, purpose: schemaString, academicTarget: schemaString }),
  },
  fork: schemaObject({
    hypothesis: schemaString,
    heldConstant: schemaStrings,
    routes: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: schemaObject({ id: schemaString, academicRationale: schemaString, nodeIds: schemaStrings }),
    },
  }),
  agencyExperiment: schemaObject({
    experimentId: schemaString,
    contextEvidenceIds: schemaStrings,
    academicHeldConstants: schemaStrings,
    routes: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: schemaObject({
        routeId: schemaString,
        nodeIds: schemaStrings,
        engagementHypothesis: schemaString,
        predictedOutcome: schemaString,
        supportingEvidenceIds: schemaStrings,
        uncertainty: schemaString,
        falsifyingEvidence: schemaStrings,
        measurementKeys: schemaStrings,
      }),
    },
  }),
  activities: {
    type: "array",
    minItems: 1,
    items: schemaObject({
      id: schemaString,
      routeId: schemaString,
      responsibilityId: schemaString,
      academicTarget: schemaString,
      difficultyBoundary: schemaObject({
        allowedConcepts: schemaStrings,
        allowedRepresentations: schemaStrings,
        excludedExtensions: schemaStrings,
        startingSupport: schemaString,
        expectedIndependence: schemaString,
      }),
      items: {
        type: "array",
        minItems: 1,
        items: schemaObject({
          id: schemaString,
          prompt: schemaString,
          lineage: schemaObject({
            sourceEvidenceIds: { type: "array", minItems: 1, items: schemaString },
            exposure: { enum: ["unseen", "taught", "practiced"] },
          }),
          response: schemaItemResponse,
        }),
      },
      academicPrediction: schemaObject({
        constructId: schemaString,
        context: schemaString,
        horizon: schemaString,
        expectedMetric: schemaObject({ key: schemaString, min: { type: "number" }, max: { type: "number" } }),
        predictedErrorPatterns: schemaStrings,
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidenceIds: schemaStrings,
        intervention: schemaString,
        evidenceLimit: { const: "practice_only" },
      }),
      measurementKeys: schemaStrings,
      catalogDecision: schemaObject({
        action: { enum: ["reuse", "revise", "generate_new", "retire"] },
        contentId: schemaString,
        reason: schemaString,
      }, ["action", "reason"]),
    }),
  },
});

export type AssignmentConcept = {
  /** Stable identity that outlives this assignment. Must contain no instance numbers. */
  conceptId: string;
  name: string;
  statement: string;
  /** What this particular worksheet instantiates — the numbers live here, not in the id. */
  instanceScope: string;
  prerequisites: string[];
  /** The Planner's current beliefs about this child's grasp, corrected later by the retro. */
  assumptions: string[];
};

export type DirectLearningExperiencePlan = {
  planId: string;
  title: string;
  contentScopeRationale: string;
  concept: AssignmentConcept;
  academicTheory: string;
  profileEvidence: string[];
  boardWorld: { title: string; narrative: string; backgroundPrompt: string };
  learningResponsibilities: DirectLearningResponsibility[];
  fork: {
    question: string;
    hypothesis: string;
    heldConstant: string[];
    routes: Array<{
      id: string;
      label: string;
      promise: string;
      engagementVariable: string;
      nodeIds: string[];
    }>;
  };
  agencyExperiment?: AgencyExperiment;
  activities: DirectActivity[];
  quest: { title: "Quest"; locked: true; teaser: string; artworkPrompt: string };
  boss: { title: "Boss"; locked: true; teaser: string; artworkPrompt: string };
};

export type DirectArtifact = {
  childId: string;
  homeworkId: string;
  nodeId: string;
  title: string;
  htmlPath: string;
  artworkUrl: string;
  creatorPrompt: string;
  promptHash: string;
  plannerModel: string;
  creatorModel: string;
  architectModel?: string;
  builderProvider?: "anthropic" | "openai";
  builderModel?: string;
  academicContractHash?: string;
  designArtifactHash?: string;
  htmlHash?: string;
  externalLibraryUrls?: string[];
  generationElapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type DirectPlaywrightReport = {
  passed: boolean;
  failures: string[];
  screenshots: string[];
};

export function hasReadyDirectMathExperience(childId: string, rootDir = process.cwd()): boolean {
  const directPath = path.join(rootDir, "src", "context", childId.trim().toLowerCase(), "homework", "direct_experience_plan.json");
  if (!fs.existsSync(directPath)) return false;
  try {
    const record = JSON.parse(fs.readFileSync(directPath, "utf8")) as {
      childId?: string;
      activeSessionPlan?: { domain?: string };
    };
    return record.childId === childId.trim().toLowerCase()
      && record.activeSessionPlan?.domain === "math";
  } catch {
    return false;
  }
}

export function readDirectCanonicalLearningContext(childId: string, homeworkId: string, rootDir = process.cwd()): unknown {
  return getLearningCycle(childId, homeworkId, { rootDir });
}

export function boardPosition(percentX: number, percentY: number): { x: number; y: number } {
  return { x: percentX / 100, y: percentY / 100 };
}

export function routeNodePosition(index: number, count: number, routeIndex: number): { x: number; y: number } {
  const safeCount = Math.max(1, count);
  const x = 0.30 + ((index + 1) * 0.46) / (safeCount + 1);
  return { x, y: routeIndex === 0 ? 0.32 : 0.72 };
}

export function sharedNodePosition(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0.22, y: 0.64 };
  const progress = index / (count - 1);
  return { x: 0.15 + progress * 0.15, y: 0.72 - progress * 0.14 };
}

export function boardShortLabel(label: string, maxLength = 24): string {
  const normalized = label.replace(/\s+/g, " ").trim();
  const lead = normalized.split(/\s*(?::|—|–)\s*/u, 1)[0] ?? normalized;
  if (lead.length <= maxLength) return lead;
  const words = lead.split(" ");
  let result = "";
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > maxLength) break;
    result = candidate;
  }
  return result || lead.slice(0, maxLength).trimEnd();
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredString(record: Record<string, unknown>, key: string, errorLabel = key): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`direct_plan_missing_${errorLabel}`);
  return value.trim();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`direct_plan_invalid_${label}`);
  }
  return value.map(String);
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`direct_plan_invalid_${key}`);
  return value;
}

export function assertInstanceFreeConceptId(conceptId: string): string {
  const trimmed = conceptId.trim();
  if (!trimmed) throw new Error("direct_plan_invalid_concept_id");
  if (/\d/.test(trimmed)) throw new Error(`concept_id_contains_instance:${trimmed}`);
  return trimmed;
}

export function parseAssignmentConcept(value: unknown): AssignmentConcept {
  const record = object(value);
  if (!record) throw new Error("direct_plan_missing_concept");
  return {
    conceptId: assertInstanceFreeConceptId(requiredString(record, "conceptId")),
    name: requiredString(record, "name"),
    statement: requiredString(record, "statement"),
    instanceScope: requiredString(record, "instanceScope"),
    prerequisites: stringArray(record.prerequisites, "concept_prerequisites"),
    assumptions: stringArray(record.assumptions, "concept_assumptions"),
  };
}

function parseDirectItem(rawItem: unknown): DirectItem {
  const item = object(rawItem);
  const lineage = object(item?.lineage);
  const response = object(item?.response);
  if (!item || !lineage || !response) throw new Error("direct_plan_invalid_item");
  const sourceEvidenceIds = stringArray(lineage.sourceEvidenceIds, "item_source_evidence_ids");
  if (sourceEvidenceIds.length === 0) throw new Error("direct_plan_invalid_item_lineage");
  const exposure = requiredString(lineage, "exposure");
  if (!["unseen", "taught", "practiced"].includes(exposure)) throw new Error("direct_plan_invalid_item_exposure");
  const mode = requiredString(response, "mode");
  let parsedResponse: DirectItem["response"];
  if (mode === "selection") {
    const options = (Array.isArray(response.options) ? response.options : []).map((rawOption) => {
      const option = object(rawOption);
      if (!option || typeof option.correct !== "boolean") throw new Error("direct_plan_invalid_selection_option");
      return { id: requiredString(option, "id"), label: requiredString(option, "label"), correct: option.correct };
    });
    if (options.length < 2 || options.filter((option) => option.correct).length !== 1) {
      throw new Error("direct_plan_selection_requires_one_correct_option");
    }
    parsedResponse = { mode, options };
  } else if (mode === "numeric") {
    parsedResponse = { mode, expected: requiredNumber(response, "expected"), ...(typeof response.unit === "string" ? { unit: response.unit } : {}) };
  } else if (mode === "construction") {
    const expectedState = object(response.expectedState);
    if (!expectedState || Object.keys(expectedState).length === 0) throw new Error("direct_plan_invalid_construction_state");
    parsedResponse = {
      mode,
      expectedState: expectedState as Record<string, string | number | boolean>,
      successDescription: requiredString(response, "successDescription"),
    };
  } else if (mode === "explanation") {
    parsedResponse = { mode, rubric: stringArray(response.rubric, "explanation_rubric") };
  } else {
    throw new Error(`direct_plan_invalid_response_mode:${mode}`);
  }
  return {
    id: requiredString(item, "id"),
    prompt: requiredString(item, "prompt"),
    lineage: { sourceEvidenceIds, exposure: exposure as DirectItem["lineage"]["exposure"] },
    response: parsedResponse,
  };
}

export function parseMathLearningProgram(value: unknown): MathLearningProgram {
  const root = object(value);
  if (!root) throw new Error("math_learning_program_must_be_object");
  const conceptRecord = object(root.concept);
  if (!conceptRecord) throw new Error("math_learning_program_missing_concept");
  const concept = {
    conceptId: assertInstanceFreeConceptId(requiredString(conceptRecord, "conceptId")),
    name: requiredString(conceptRecord, "name"),
    statement: requiredString(conceptRecord, "statement"),
    instanceScope: requiredString(conceptRecord, "instanceScope"),
    prerequisites: stringArray(conceptRecord.prerequisites, "concept_prerequisites"),
  };
  const assumptions = (Array.isArray(root.assumptions) ? root.assumptions : []).map((raw) => {
    const assumption = object(raw);
    if (!assumption) throw new Error("math_learning_program_invalid_assumption");
    const confidence = requiredNumber(assumption, "confidence");
    if (confidence < 0 || confidence > 1) throw new Error("math_learning_program_invalid_assumption_confidence");
    return {
      assumptionId: requiredString(assumption, "assumptionId"),
      claim: requiredString(assumption, "claim"),
      evidenceIds: stringArray(assumption.evidenceIds, "assumption_evidence_ids"),
      confidence,
      uncertainty: requiredString(assumption, "uncertainty"),
    };
  });
  if (assumptions.length === 0) throw new Error("math_learning_program_requires_assumptions");
  const learningResponsibilities = (Array.isArray(root.learningResponsibilities) ? root.learningResponsibilities : []).map((raw) => {
    const responsibility = object(raw);
    if (!responsibility) throw new Error("math_learning_program_invalid_responsibility");
    return {
      id: requiredString(responsibility, "id"),
      title: requiredString(responsibility, "title"),
      purpose: requiredString(responsibility, "purpose"),
      academicTarget: requiredString(responsibility, "academicTarget"),
    };
  });
  const fork = object(root.fork);
  const routes = (Array.isArray(fork?.routes) ? fork.routes : []).map((raw) => {
    const route = object(raw);
    if (!route) throw new Error("math_learning_program_invalid_route");
    return {
      id: requiredString(route, "id"),
      academicRationale: requiredString(route, "academicRationale"),
      nodeIds: stringArray(route.nodeIds, "route_node_ids"),
    };
  });
  if (routes.length !== 2) throw new Error("math_learning_program_requires_two_routes");
  const activities = (Array.isArray(root.activities) ? root.activities : []).map((raw): MathPlannedActivity => {
    const activity = object(raw);
    const boundary = object(activity?.difficultyBoundary);
    const prediction = object(activity?.academicPrediction);
    const metric = object(prediction?.expectedMetric);
    const catalogDecision = object(activity?.catalogDecision);
    if (!activity || !boundary || !prediction || !metric || !catalogDecision) throw new Error("math_learning_program_invalid_activity");
    const action = requiredString(catalogDecision, "action");
    if (!["reuse", "revise", "generate_new", "retire"].includes(action)) throw new Error("math_learning_program_invalid_catalog_action");
    return {
      id: requiredString(activity, "id"),
      routeId: requiredString(activity, "routeId"),
      responsibilityId: requiredString(activity, "responsibilityId"),
      academicTarget: requiredString(activity, "academicTarget"),
      difficultyBoundary: {
        allowedConcepts: stringArray(boundary.allowedConcepts, "allowed_concepts"),
        allowedRepresentations: stringArray(boundary.allowedRepresentations, "allowed_representations"),
        excludedExtensions: stringArray(boundary.excludedExtensions, "excluded_extensions"),
        startingSupport: requiredString(boundary, "startingSupport"),
        expectedIndependence: requiredString(boundary, "expectedIndependence"),
      },
      items: (Array.isArray(activity.items) ? activity.items : []).map(parseDirectItem),
      academicPrediction: {
        constructId: assertInstanceFreeConceptId(requiredString(prediction, "constructId")),
        context: requiredString(prediction, "context"),
        horizon: requiredString(prediction, "horizon"),
        expectedMetric: { key: requiredString(metric, "key"), min: requiredNumber(metric, "min"), max: requiredNumber(metric, "max") },
        predictedErrorPatterns: stringArray(prediction.predictedErrorPatterns, "predicted_error_patterns"),
        confidence: requiredNumber(prediction, "confidence"),
        evidenceIds: stringArray(prediction.evidenceIds, "prediction_evidence_ids"),
        intervention: requiredString(prediction, "intervention"),
        evidenceLimit: "practice_only",
      },
      measurementKeys: stringArray(activity.measurementKeys, "measurement_keys"),
      catalogDecision: {
        action: action as MathCatalogDecision["action"],
        ...(typeof catalogDecision.contentId === "string" ? { contentId: catalogDecision.contentId } : {}),
        reason: requiredString(catalogDecision, "reason"),
      },
    };
  });
  if (activities.length === 0) throw new Error("math_learning_program_requires_activities");
  const normalizedResponsibilities = [...learningResponsibilities];
  const knownResponsibilityIds = new Set(normalizedResponsibilities.map((item) => item.id));
  for (const activity of activities) {
    if (knownResponsibilityIds.has(activity.responsibilityId)) continue;
    normalizedResponsibilities.push({
      id: activity.responsibilityId,
      title: activity.academicTarget,
      purpose: activity.academicTarget,
      academicTarget: activity.academicTarget,
    });
    knownResponsibilityIds.add(activity.responsibilityId);
  }
  const routeIds = new Set(routes.map((route) => route.id));
  for (const activity of activities) {
    if (routeIds.has(activity.routeId)) continue;
    const membershipMatches = routes.filter((route) => route.nodeIds.includes(activity.id));
    if (membershipMatches.length === 1) activity.routeId = membershipMatches[0]!.id;
  }
  for (const route of routes) route.nodeIds = activities.filter((activity) => activity.routeId === route.id).map((activity) => activity.id);
  if (routes.some((route) => route.nodeIds.length === 0)) throw new Error("math_learning_program_empty_route");
  const rawAgencyExperiment = object(root.agencyExperiment);
  const agencyExperiment = rawAgencyExperiment ? {
    experimentId: requiredString(rawAgencyExperiment, "experimentId"),
    contextEvidenceIds: stringArray(rawAgencyExperiment.contextEvidenceIds, "agency_context_evidence_ids"),
    academicHeldConstants: stringArray(rawAgencyExperiment.academicHeldConstants, "agency_academic_held_constants"),
    routes: (Array.isArray(rawAgencyExperiment.routes) ? rawAgencyExperiment.routes : []).map((raw) => {
      const route = object(raw);
      if (!route) throw new Error("math_learning_program_invalid_agency_route");
      return {
        routeId: requiredString(route, "routeId"),
        nodeIds: stringArray(route.nodeIds, "agency_route_node_ids"),
        engagementHypothesis: requiredString(route, "engagementHypothesis"),
        predictedOutcome: requiredString(route, "predictedOutcome"),
        supportingEvidenceIds: stringArray(route.supportingEvidenceIds, "agency_route_supporting_evidence_ids"),
        uncertainty: requiredString(route, "uncertainty"),
        falsifyingEvidence: stringArray(route.falsifyingEvidence, "agency_route_falsifying_evidence"),
        measurementKeys: stringArray(route.measurementKeys, "agency_route_measurement_keys"),
      };
    }),
  } satisfies AgencyExperiment : undefined;
  if (agencyExperiment) {
    const experimentByRoute = new Map(agencyExperiment.routes.map((route) => [route.routeId, route]));
    if (experimentByRoute.size !== routes.length || routes.some((route) => !experimentByRoute.has(route.id))) {
      throw new Error("math_learning_program_agency_routes_mismatch");
    }
    for (const route of routes) experimentByRoute.get(route.id)!.nodeIds = [...route.nodeIds];
  }
  return {
    planId: requiredString(root, "planId"),
    contentScopeRationale: requiredString(root, "contentScopeRationale"),
    concept,
    assumptions,
    academicTheory: requiredString(root, "academicTheory"),
    profileEvidence: stringArray(root.profileEvidence, "profile_evidence"),
    learningResponsibilities: normalizedResponsibilities,
    fork: {
      hypothesis: requiredString(fork ?? {}, "hypothesis"),
      heldConstant: stringArray(fork?.heldConstant, "held_constant"),
      routes,
    },
    ...(agencyExperiment ? { agencyExperiment } : {}),
    activities,
  };
}

export function parseDirectLearningExperiencePlan(value: unknown): DirectLearningExperiencePlan {
  const root = object(value);
  if (!root) throw new Error("direct_plan_must_be_object");
  const learningResponsibilities = (Array.isArray(root.learningResponsibilities) ? root.learningResponsibilities : []).map((raw) => {
    const responsibility = object(raw);
    if (!responsibility) throw new Error("direct_plan_invalid_learning_responsibility");
    return {
      id: requiredString(responsibility, "id", "responsibility_id"),
      title: requiredString(responsibility, "title"),
      purpose: requiredString(responsibility, "purpose"),
      academicTarget: requiredString(responsibility, "academicTarget"),
    };
  });
  if (learningResponsibilities.length === 0) throw new Error("direct_plan_requires_learning_responsibilities");
  if (new Set(learningResponsibilities.map((responsibility) => responsibility.id)).size !== learningResponsibilities.length) {
    throw new Error("direct_plan_duplicate_learning_responsibility");
  }
  const fork = object(root.fork);
  if (!fork) throw new Error("direct_plan_missing_fork");
  const rawRoutes = Array.isArray(fork.routes) ? fork.routes : [];
  if (rawRoutes.length !== 2) throw new Error("direct_plan_requires_two_routes");
  const routes = rawRoutes.map((raw) => {
    const route = object(raw);
    if (!route) throw new Error("direct_plan_invalid_route");
    return {
      id: requiredString(route, "id", "route_id"),
      label: requiredString(route, "label"),
      promise: requiredString(route, "promise"),
      engagementVariable: requiredString(route, "engagementVariable"),
      nodeIds: stringArray(route.nodeIds, "route_node_ids"),
    };
  });
  if (routes[0]!.id === routes[1]!.id || routes[0]!.engagementVariable === routes[1]!.engagementVariable) {
    throw new Error("direct_plan_requires_genuine_fork");
  }
  const rawActivities = Array.isArray(root.activities) ? root.activities : [];
  if (rawActivities.length === 0) throw new Error("direct_plan_requires_activities");
  const activities = rawActivities.map((raw): DirectActivity => {
    const activity = object(raw);
    const visualMock = object(activity?.visualMock);
    const experience = object(activity?.experience);
    const academicPrediction = object(activity?.academicPrediction);
    const expectedMetric = object(academicPrediction?.expectedMetric);
    if (!activity || !visualMock || !experience || !academicPrediction || !expectedMetric) throw new Error("direct_plan_invalid_activity");
    const responsibilityId = requiredString(activity, "responsibilityId");
    const responsibility = learningResponsibilities.find((candidate) => candidate.id === responsibilityId);
    if (!responsibility) throw new Error(`direct_plan_activity_responsibility_unknown:${responsibilityId}`);
    const academicTarget = requiredString(activity, "academicTarget");
    if (academicTarget !== responsibility.academicTarget) {
      throw new Error(`direct_plan_activity_target_mismatch:${requiredString(activity, "id")}:${responsibilityId}`);
    }
    const items = (Array.isArray(activity.items) ? activity.items : []).map((rawItem): DirectItem => {
      const item = object(rawItem);
      const lineage = object(item?.lineage);
      const response = object(item?.response);
      if (!item || !lineage) throw new Error("direct_plan_invalid_item_lineage");
      if (!response) throw new Error("direct_plan_invalid_item_response");
      const sourceEvidenceIds = stringArray(lineage.sourceEvidenceIds, "item_source_evidence_ids");
      if (sourceEvidenceIds.length === 0) throw new Error("direct_plan_invalid_item_lineage");
      const exposure = requiredString(lineage, "exposure");
      if (!["unseen", "taught", "practiced"].includes(exposure)) throw new Error("direct_plan_invalid_item_exposure");
      const mode = requiredString(response, "mode");
      let parsedResponse: DirectItem["response"];
      if (mode === "selection") {
        const options = (Array.isArray(response.options) ? response.options : []).map((rawOption) => {
          const option = object(rawOption);
          if (!option || typeof option.correct !== "boolean") throw new Error("direct_plan_invalid_selection_option");
          return { id: requiredString(option, "id", "selection_option_id"), label: requiredString(option, "label"), correct: option.correct };
        });
        if (options.length < 2 || options.filter((option) => option.correct).length !== 1) {
          throw new Error("direct_plan_selection_requires_one_correct_option");
        }
        parsedResponse = { mode, options };
      } else if (mode === "numeric") {
        parsedResponse = {
          mode,
          expected: requiredNumber(response, "expected"),
          ...(typeof response.unit === "string" && response.unit.trim() ? { unit: response.unit.trim() } : {}),
        };
      } else if (mode === "construction") {
        const expectedState = object(response.expectedState);
        if (!expectedState || Object.keys(expectedState).length === 0
          || Object.values(expectedState).some((entry) => !["string", "number", "boolean"].includes(typeof entry))) {
          throw new Error("direct_plan_invalid_construction_state");
        }
        parsedResponse = {
          mode,
          expectedState: expectedState as Record<string, string | number | boolean>,
          successDescription: requiredString(response, "successDescription"),
        };
      } else if (mode === "explanation") {
        const rubric = stringArray(response.rubric, "explanation_rubric");
        if (rubric.length === 0) throw new Error("direct_plan_invalid_explanation_rubric");
        parsedResponse = { mode, rubric };
      } else {
        throw new Error(`direct_plan_invalid_response_mode:${mode}`);
      }
      return {
        id: requiredString(item, "id", "item_id"),
        prompt: requiredString(item, "prompt"),
        lineage: { sourceEvidenceIds, exposure: exposure as DirectItem["lineage"]["exposure"] },
        response: parsedResponse,
      };
    });
    if (items.length === 0) throw new Error("direct_plan_activity_requires_items");
    if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("direct_plan_duplicate_item_id");
    return {
      id: requiredString(activity, "id", "activity_id"),
      title: requiredString(activity, "title"),
      routeId: requiredString(activity, "routeId"),
      responsibilityId,
      learningPurpose: responsibility.purpose,
      academicTarget,
      mechanic: requiredString(activity, "mechanic"),
      engagementVariable: requiredString(activity, "engagementVariable"),
      visualMock: {
        scene: requiredString(visualMock, "scene"),
        layout: requiredString(visualMock, "layout"),
        artworkPrompt: requiredString(visualMock, "artworkPrompt"),
      },
      experience: {
        objective: requiredString(experience, "objective"),
        childAction: requiredString(experience, "childAction"),
        worldReaction: requiredString(experience, "worldReaction"),
        anticipation: requiredString(experience, "anticipation"),
        progress: requiredString(experience, "progress"),
        recovery: requiredString(experience, "recovery"),
        reward: requiredString(experience, "reward"),
      },
      items,
      acceptanceSteps: stringArray(activity.acceptanceSteps, "acceptance_steps"),
      creatorPrompt: requiredString(activity, "creatorPrompt"),
      designPrediction: requiredString(activity, "designPrediction"),
      academicPrediction: {
        constructId: assertInstanceFreeConceptId(requiredString(academicPrediction, "constructId")),
        context: requiredString(academicPrediction, "context"),
        horizon: requiredString(academicPrediction, "horizon"),
        expectedMetric: {
          key: requiredString(expectedMetric, "key"),
          min: requiredNumber(expectedMetric, "min"),
          max: requiredNumber(expectedMetric, "max"),
        },
        predictedErrorPatterns: stringArray(academicPrediction.predictedErrorPatterns, "predicted_error_patterns"),
        confidence: requiredNumber(academicPrediction, "confidence"),
        evidenceIds: stringArray(academicPrediction.evidenceIds, "academic_prediction_evidence_ids"),
        intervention: requiredString(academicPrediction, "intervention"),
        evidenceLimit: (() => {
          const value = requiredString(academicPrediction, "evidenceLimit");
          if (value !== "practice_only") throw new Error("direct_plan_initial_activity_must_be_practice_only");
          return "practice_only" as const;
        })(),
      },
      preserve: stringArray(activity.preserve, "preserve"),
      change: stringArray(activity.change, "change"),
      explore: stringArray(activity.explore, "explore"),
      avoid: stringArray(activity.avoid, "avoid"),
      measurementKeys: stringArray(activity.measurementKeys, "measurement_keys"),
    };
  });
  const ids = new Set(activities.map((activity) => activity.id));
  if (ids.size !== activities.length) throw new Error("direct_plan_duplicate_activity_id");
  for (const activity of activities) {
    const route = routes.find((candidate) => candidate.id === activity.routeId);
    if (!route) throw new Error("direct_plan_activity_not_bound_to_route");
  }
  for (const route of routes) route.nodeIds = activities.filter((activity) => activity.routeId === route.id).map((activity) => activity.id);
  if (routes.some((route) => route.nodeIds.length === 0)) throw new Error("direct_plan_route_has_no_activity");
  for (const responsibility of learningResponsibilities) {
    if (!activities.some((activity) => activity.responsibilityId === responsibility.id)) {
      throw new Error(`direct_plan_missing_responsibility:${responsibility.id}`);
    }
  }
  const quest = object(root.quest);
  const boss = object(root.boss);
  const lockedTeaser = <Role extends "Quest" | "Boss">(role: Role, value: Record<string, unknown> | null) => ({
    title: role,
    locked: true as const,
    teaser: value ? requiredString(value, "teaser") : `${role} unlocks when the learning evidence is ready.`,
    artworkPrompt: value ? requiredString(value, "artworkPrompt") : `Locked ${role} destination placeholder`,
  });
  const boardWorld = object(root.boardWorld);
  if (!boardWorld) throw new Error("direct_plan_missing_board_world");
  const boardTitle = requiredString(boardWorld, "title");
  return {
    planId: requiredString(root, "planId"),
    title: boardTitle,
    contentScopeRationale: requiredString(root, "contentScopeRationale"),
    concept: parseAssignmentConcept(root.concept),
    academicTheory: requiredString(root, "academicTheory"),
    profileEvidence: stringArray(root.profileEvidence, "profile_evidence"),
    boardWorld: {
      title: boardTitle,
      narrative: requiredString(boardWorld, "narrative"),
      backgroundPrompt: requiredString(boardWorld, "backgroundPrompt"),
    },
    learningResponsibilities,
    fork: {
      question: requiredString(fork, "question"),
      hypothesis: requiredString(fork, "hypothesis"),
      heldConstant: stringArray(fork.heldConstant, "held_constant"),
      routes,
    },
    activities,
    quest: lockedTeaser("Quest", quest),
    boss: lockedTeaser("Boss", boss),
  };
}

export function mathAcademicContractHash(activity: MathPlannedActivity): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    id: activity.id,
    routeId: activity.routeId,
    responsibilityId: activity.responsibilityId,
    academicTarget: activity.academicTarget,
    difficultyBoundary: activity.difficultyBoundary,
    items: activity.items,
    academicPrediction: activity.academicPrediction,
  })).digest("hex");
}

export function assertDesignArtifactAcademicContract(
  activity: MathPlannedActivity,
  artifact: Pick<ExperienceDesignArtifactV1, "academicContractHash">,
): void {
  if (artifact.academicContractHash !== mathAcademicContractHash(activity)) {
    throw new Error(`math_design_artifact_academic_contract_changed:${activity.id}`);
  }
}

export function parseExperienceDesignArtifact(value: unknown, activity: MathPlannedActivity): ExperienceDesignArtifactV1 {
  const record = object(value);
  if (!record) throw new Error(`math_design_artifact_invalid:${activity.id}`);
  const optionalText = (key: string): string => typeof record[key] === "string" ? String(record[key]).trim() : "";
  const optionalTexts = (key: string): string[] => Array.isArray(record[key])
    ? (record[key] as unknown[]).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
  const nodeId = requiredString(record, "nodeId");
  if (nodeId !== activity.id) throw new Error(`math_design_artifact_node_mismatch:${activity.id}:${nodeId}`);
  const expectedHash = mathAcademicContractHash(activity);
  assertDesignArtifactAcademicContract(activity, {
    academicContractHash: requiredString(record, "academicContractHash"),
  });
  return {
    artifactId: requiredString(record, "artifactId"),
    nodeId,
    academicContractHash: expectedHash,
    title: requiredString(record, "title"),
    audienceRationale: optionalText("audienceRationale"),
    openingPromise: requiredString(record, "openingPromise"),
    firstThreeSeconds: requiredString(record, "firstThreeSeconds"),
    firstAction: requiredString(record, "firstAction"),
    interactionDemonstration: optionalText("interactionDemonstration"),
    coreInteraction: requiredString(record, "coreInteraction"),
    mathAsPower: requiredString(record, "mathAsPower"),
    stakes: optionalText("stakes"),
    consequences: optionalText("consequences"),
    recovery: optionalText("recovery"),
    progression: optionalTexts("progression"),
    interactionContinuity: optionalText("interactionContinuity"),
    worldReaction: optionalText("worldReaction"),
    payoff: optionalText("payoff"),
    replayVariation: optionalText("replayVariation"),
    visualDirection: requiredString(record, "visualDirection"),
    motionDirection: optionalText("motionDirection"),
    soundDirection: optionalText("soundDirection"),
    usefulLibraries: optionalTexts("usefulLibraries"),
    engagementPrediction: optionalText("engagementPrediction"),
    falsifyingEvidence: optionalText("falsifyingEvidence"),
  };
}

export function createMathDesignCheckpoint(input: {
  planId: string;
  expectedNodeIds: string[];
  model: string;
}): MathDesignCheckpoint {
  return {
    version: 1,
    planId: input.planId,
    model: input.model,
    expectedNodeIds: [...input.expectedNodeIds],
    completedNodeIds: [],
    missingNodeIds: [...input.expectedNodeIds],
    artifacts: [],
    attempts: [],
  };
}

export function mergeMathDesignCheckpoint(
  checkpoint: MathDesignCheckpoint,
  input: {
    artifacts: ExperienceDesignArtifactV1[];
    programActivities: MathPlannedActivity[];
    boardCreativeSpine?: MathDesignPacket["boardCreativeSpine"];
    rationale?: string;
    attempt?: MathDesignCheckpoint["attempts"][number];
  },
): MathDesignCheckpoint {
  const expected = new Set(checkpoint.expectedNodeIds);
  const activities = new Map(input.programActivities.map((activity) => [activity.id, activity]));
  const merged = new Map(checkpoint.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  for (const artifact of input.artifacts) {
    if (!expected.has(artifact.nodeId)) continue;
    const activity = activities.get(artifact.nodeId);
    if (!activity) continue;
    assertDesignArtifactAcademicContract(activity, artifact);
    if (!merged.has(artifact.nodeId)) merged.set(artifact.nodeId, artifact);
  }
  const artifacts = checkpoint.expectedNodeIds.flatMap((nodeId) => {
    const artifact = merged.get(nodeId);
    return artifact ? [artifact] : [];
  });
  const completedNodeIds = artifacts.map((artifact) => artifact.nodeId);
  const completed = new Set(completedNodeIds);
  return {
    ...checkpoint,
    ...(input.boardCreativeSpine ? { boardCreativeSpine: input.boardCreativeSpine } : {}),
    ...(input.rationale ? { rationale: input.rationale } : {}),
    artifacts,
    completedNodeIds,
    missingNodeIds: checkpoint.expectedNodeIds.filter((nodeId) => !completed.has(nodeId)),
    attempts: input.attempt ? [...checkpoint.attempts, input.attempt] : checkpoint.attempts,
  };
}

function parseBoardCreativeSpine(value: unknown): MathDesignPacket["boardCreativeSpine"] {
  const spine = object(value);
  if (!spine) throw new Error("math_design_board_spine_invalid");
  return {
    title: requiredString(spine, "title"),
    narrative: requiredString(spine, "narrative"),
    openingChoice: requiredString(spine, "openingChoice"),
    backgroundDirection: requiredString(spine, "backgroundDirection"),
    routeDirections: (Array.isArray(spine.routeDirections) ? spine.routeDirections : []).map((raw) => {
      const route = object(raw);
      if (!route) throw new Error("math_design_route_invalid");
      return {
        routeId: requiredString(route, "routeId"),
        label: requiredString(route, "label"),
        promise: requiredString(route, "promise"),
        engagementVariable: requiredString(route, "engagementVariable"),
      };
    }),
    questTeaser: typeof spine.questTeaser === "string" && spine.questTeaser.trim()
      ? spine.questTeaser.trim()
      : "Quest unlocks when the learning evidence is ready.",
    questArtworkDirection: typeof spine.questArtworkDirection === "string" && spine.questArtworkDirection.trim()
      ? spine.questArtworkDirection.trim()
      : "Locked Quest destination placeholder",
    bossTeaser: typeof spine.bossTeaser === "string" && spine.bossTeaser.trim()
      ? spine.bossTeaser.trim()
      : "Boss unlocks after qualifying Quest evidence.",
    bossArtworkDirection: typeof spine.bossArtworkDirection === "string" && spine.bossArtworkDirection.trim()
      ? spine.bossArtworkDirection.trim()
      : "Locked Boss destination placeholder",
  };
}

export async function askMathExperienceDesigner(input: {
  childId: string;
  program: MathLearningProgram;
  childContext: unknown;
  priorOutcomes: unknown;
  designNotes?: string;
  revision?: number;
  client?: Anthropic;
  model?: string;
  now?: Date;
  checkpoint?: MathDesignCheckpoint;
  checkpointFile?: string;
  rawResponseDir?: string;
}): Promise<{ packet: MathDesignPacket; plan: DirectLearningExperiencePlan }> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5";
  const contracts = input.program.activities.map((activity) => ({
    ...activity,
    academicContractHash: mathAcademicContractHash(activity),
  }));
  const toolName = "create_math_design_packet";
  const designArtifactSchema = schemaObject({
    artifactId: schemaString,
    nodeId: schemaString,
    academicContractHash: schemaString,
    title: schemaString,
    audienceRationale: schemaString,
    openingPromise: schemaString,
    firstThreeSeconds: schemaString,
    firstAction: schemaString,
    interactionDemonstration: schemaString,
    coreInteraction: schemaString,
    mathAsPower: schemaString,
    stakes: schemaString,
    consequences: schemaString,
    recovery: schemaString,
    progression: { type: "array", minItems: 1, items: schemaString },
    interactionContinuity: schemaString,
    worldReaction: schemaString,
    payoff: schemaString,
    replayVariation: schemaString,
    visualDirection: schemaString,
    motionDirection: schemaString,
    soundDirection: schemaString,
    usefulLibraries: schemaStrings,
    engagementPrediction: schemaString,
    falsifyingEvidence: schemaString,
  }, ["artifactId", "nodeId", "academicContractHash", "title", "openingPromise", "firstThreeSeconds", "firstAction", "coreInteraction", "mathAsPower", "visualDirection"]);
  const boardCreativeSpineSchema = schemaObject({
    title: schemaString,
    narrative: schemaString,
    openingChoice: schemaString,
    backgroundDirection: schemaString,
    routeDirections: {
      type: "array",
      minItems: input.program.fork.routes.length,
      maxItems: input.program.fork.routes.length,
      items: schemaObject({
        routeId: schemaString,
        label: schemaString,
        promise: schemaString,
        engagementVariable: schemaString,
      }),
    },
    questTeaser: schemaString,
    questArtworkDirection: schemaString,
    bossTeaser: schemaString,
    bossArtworkDirection: schemaString,
  }, ["title", "narrative", "openingChoice", "backgroundDirection", "routeDirections"]);
  let checkpoint = input.checkpoint ?? createMathDesignCheckpoint({
    planId: input.program.planId,
    expectedNodeIds: input.program.activities.map((activity) => activity.id),
    model,
  });
  for (let attemptIndex = 0; attemptIndex < 2 && checkpoint.missingNodeIds.length > 0; attemptIndex += 1) {
    const requestedNodeIds = [...checkpoint.missingNodeIds];
    const isContinuation = Boolean(checkpoint.boardCreativeSpine);
    const prompt = `You are Sunny's Experience Creator. Design one coherent child-facing math chapter and rich design artifacts for the requested prescribed nodes.

The Math Planner's educational program is immutable. You cannot change activity count or IDs, routes, responsibilities, academic targets, difficulty boundaries, item content, response contracts, predictions, measurement keys, or catalog decisions.

You own the complete creative design: board world, route identities, titles, experience form, interaction, mission, stakes, consequences, recovery, progression, payoff, replay variation, visual craft, motion, sound, and useful third-party libraries. Games are optional. Make the board one coherent chapter without forcing identical mechanics or themes.

Creative objective: design something this specific child can understand immediately and may choose to continue playing. Mathematics must visibly change the world, mission, progress, or payoff. You independently choose mechanics, stakes, consequences, recovery, pacing, and payoff. Do not default to consequence-free play merely because evidence is uncertain; choose what best fits the academic responsibility and factual child evidence. Treat profile observations as hypotheses, and do not repeatedly literalize one interest.

Return design artifacts only for these node IDs: ${requestedNodeIds.join(", ")}. Copy each supplied academicContractHash exactly. Do not write HTML.
${isContinuation ? `This is a missing-content continuation, not a redesign. Preserve the frozen board spine and completed sibling designs. Return only the missing artifacts.\nFrozen board spine:\n${JSON.stringify(checkpoint.boardCreativeSpine, null, 2)}\nCompleted sibling summaries:\n${JSON.stringify(checkpoint.artifacts.map((artifact) => ({ nodeId: artifact.nodeId, title: artifact.title, coreInteraction: artifact.coreInteraction, visualDirection: artifact.visualDirection })), null, 2)}` : "Also return one boardCreativeSpine for the complete chapter."}

Child: ${input.childId}

Factual child context:
${JSON.stringify(factualModelContext(input.childContext), null, 2)}

Factual prior outcomes and catalog history:
${JSON.stringify(factualModelContext(input.priorOutcomes), null, 2)}

Immutable MathLearningProgram:
${JSON.stringify({ ...input.program, activities: contracts }, null, 2)}`;
    const startedAt = Date.now();
    const request = {
      model,
      max_tokens: Number(process.env.SUNNY_DIRECTOR_MAX_TOKENS ?? 16000),
      output_config: { effort: "high" },
      messages: [{ role: "user", content: prompt }],
      tools: [{
        name: toolName,
        description: "Return the board spine when requested and the requested immutable-node design artifacts.",
        input_schema: {
          type: "object",
          additionalProperties: true,
          required: isContinuation ? ["artifacts", "rationale"] : ["boardCreativeSpine", "artifacts", "rationale"],
          properties: {
            boardCreativeSpine: boardCreativeSpineSchema,
            artifacts: {
              type: "array",
              minItems: requestedNodeIds.length,
              maxItems: requestedNodeIds.length,
              items: designArtifactSchema,
            },
            rationale: schemaString,
          },
        },
      }],
      tool_choice: { type: "tool", name: toolName },
    } as never;
    let response: Awaited<ReturnType<ReturnType<typeof client.messages.stream>["finalMessage"]>> | undefined;
    for (let transportAttempt = 1; transportAttempt <= 2; transportAttempt += 1) {
      try {
        response = await client.messages
          .stream(request, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000) })
          .finalMessage();
        break;
      } catch (error) {
        const details = providerTransportErrorDetails(error);
        if (input.rawResponseDir) {
          fs.mkdirSync(input.rawResponseDir, { recursive: true });
          fs.writeFileSync(
            path.join(
              input.rawResponseDir,
              `design-transport-error-${checkpoint.attempts.length + 1}-${transportAttempt}.json`,
            ),
            `${JSON.stringify({
              model,
              requestedNodeIds,
              transportAttempt,
              elapsedMs: Date.now() - startedAt,
              ...details,
            }, null, 2)}\n`,
            "utf8",
          );
        }
        if (!isRetryableProviderTransportError(error) || transportAttempt === 2) throw error;
        console.warn(
          ` 🎮 [math-design] [transport-retry] attempt=${transportAttempt} ` +
          `nodes=${requestedNodeIds.join(",")} reason=${details.name}:${details.message}`,
        );
      }
    }
    if (!response) throw new Error(`math_design_transport_exhausted:nodes=${requestedNodeIds.join(",")}`);
    const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
    const rawResponsePath = input.rawResponseDir
      ? path.join(input.rawResponseDir, `design-response-${checkpoint.attempts.length + 1}.json`)
      : undefined;
    if (rawResponsePath) {
      fs.mkdirSync(path.dirname(rawResponsePath), { recursive: true });
      fs.writeFileSync(rawResponsePath, `${JSON.stringify({
        model,
        stopReason: response.stop_reason,
        usage: response.usage,
        requestedNodeIds,
        content: response.content,
      }, null, 2)}\n`, "utf8");
    }
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`math_design_provider_contract_failed:missing_tool_output:nodes=${requestedNodeIds.join(",")}`);
    }
    const root = object(toolUse.input);
    if (!root) throw new Error(`math_design_provider_contract_failed:invalid_tool_output:nodes=${requestedNodeIds.join(",")}`);
    let boardCreativeSpine = checkpoint.boardCreativeSpine;
    if (!boardCreativeSpine && root.boardCreativeSpine) {
      boardCreativeSpine = parseBoardCreativeSpine(root.boardCreativeSpine);
    }
    const received: ExperienceDesignArtifactV1[] = [];
    for (const raw of Array.isArray(root.artifacts) ? root.artifacts : []) {
      try {
        const rawRecord = object(raw);
        const nodeId = rawRecord ? requiredString(rawRecord, "nodeId") : "";
        if (!requestedNodeIds.includes(nodeId)) continue;
        const activity = input.program.activities.find((candidate) => candidate.id === nodeId);
        if (!activity || received.some((artifact) => artifact.nodeId === nodeId)) continue;
        received.push(parseExperienceDesignArtifact(raw, activity));
      } catch {
        // Invalid siblings remain missing and are named in the bounded continuation.
      }
    }
    checkpoint = mergeMathDesignCheckpoint(checkpoint, {
      artifacts: received,
      programActivities: input.program.activities,
      ...(boardCreativeSpine ? { boardCreativeSpine } : {}),
      ...(typeof root.rationale === "string" && root.rationale.trim() ? { rationale: root.rationale.trim() } : {}),
      attempt: {
        attempt: checkpoint.attempts.length + 1,
        requestedNodeIds,
        receivedNodeIds: received.map((artifact) => artifact.nodeId),
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        elapsedMs: Date.now() - startedAt,
        stopReason: response.stop_reason ?? "unknown",
        ...(rawResponsePath ? { rawResponsePath } : {}),
      },
    });
    if (input.checkpointFile) {
      fs.mkdirSync(path.dirname(input.checkpointFile), { recursive: true });
      fs.writeFileSync(input.checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    }
  }
  if (!checkpoint.boardCreativeSpine || checkpoint.missingNodeIds.length > 0) {
    throw new Error(`math_design_provider_contract_failed:missing_nodes=${checkpoint.missingNodeIds.join(",") || "board-spine"}:checkpoint=${input.checkpointFile ?? "memory"}`);
  }
  const artifactByNode = new Map(checkpoint.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const routeDirections = checkpoint.boardCreativeSpine.routeDirections;
  const designedRouteIds = new Set(routeDirections.map((route) => route.routeId));
  if (input.program.fork.routes.some((route) => !designedRouteIds.has(route.id))) {
    throw new Error(`math_design_provider_contract_failed:missing_route_direction:checkpoint=${input.checkpointFile ?? "memory"}`);
  }
  const packet: MathDesignPacket = {
    version: 1,
    planId: input.program.planId,
    boardCreativeSpine: checkpoint.boardCreativeSpine,
    artifacts: input.program.activities.map((activity) => artifactByNode.get(activity.id)!),
    rationale: checkpoint.rationale ?? "Completed coherent design packet.",
    model,
    createdAt: (input.now ?? new Date()).toISOString(),
    revision: input.revision ?? 0,
  };
  const routeById = new Map(routeDirections.map((route) => [route.routeId, route]));
  const plan: DirectLearningExperiencePlan = {
    planId: input.program.planId,
    title: packet.boardCreativeSpine.title,
    contentScopeRationale: input.program.contentScopeRationale,
    concept: {
      ...input.program.concept,
      assumptions: input.program.assumptions.map((assumption) => assumption.claim),
    },
    academicTheory: input.program.academicTheory,
    profileEvidence: input.program.profileEvidence,
    boardWorld: {
      title: packet.boardCreativeSpine.title,
      narrative: packet.boardCreativeSpine.narrative,
      backgroundPrompt: packet.boardCreativeSpine.backgroundDirection,
    },
    learningResponsibilities: input.program.learningResponsibilities,
    fork: {
      question: packet.boardCreativeSpine.openingChoice,
      hypothesis: input.program.fork.hypothesis,
      heldConstant: input.program.fork.heldConstant,
      routes: input.program.fork.routes.map((route) => {
        const design = routeById.get(route.id);
        if (!design) throw new Error(`math_design_route_missing:${route.id}`);
        return { id: route.id, label: design.label, promise: design.promise, engagementVariable: design.engagementVariable, nodeIds: route.nodeIds };
      }),
    },
    ...(input.program.agencyExperiment ? { agencyExperiment: input.program.agencyExperiment } : {}),
    activities: input.program.activities.map((activity) => {
      const design = artifactByNode.get(activity.id)!;
      const route = routeById.get(activity.routeId);
      return {
        id: activity.id,
        title: design.title,
        routeId: activity.routeId,
        responsibilityId: activity.responsibilityId,
        learningPurpose: input.program.learningResponsibilities.find((item) => item.id === activity.responsibilityId)!.purpose,
        academicTarget: activity.academicTarget,
        mechanic: design.coreInteraction,
        engagementVariable: route?.engagementVariable ?? "shared-baseline",
        visualMock: { scene: design.visualDirection, layout: design.firstThreeSeconds, artworkPrompt: design.visualDirection },
        experience: {
          objective: design.openingPromise,
          childAction: design.firstAction,
          worldReaction: design.worldReaction,
          anticipation: design.stakes,
          progress: design.progression.join(" → "),
          recovery: design.recovery,
          reward: design.payoff,
        },
        items: activity.items,
        acceptanceSteps: [design.firstAction, design.consequences, design.recovery, design.payoff],
        creatorPrompt: JSON.stringify(design),
        designPrediction: design.engagementPrediction,
        academicPrediction: activity.academicPrediction,
        preserve: [],
        change: [],
        explore: [],
        avoid: [],
        measurementKeys: activity.measurementKeys,
        difficultyBoundary: activity.difficultyBoundary,
        catalogDecision: activity.catalogDecision,
        designArtifact: design,
      };
    }),
    quest: { title: "Quest", locked: true, teaser: packet.boardCreativeSpine.questTeaser, artworkPrompt: packet.boardCreativeSpine.questArtworkDirection },
    boss: { title: "Boss", locked: true, teaser: packet.boardCreativeSpine.bossTeaser, artworkPrompt: packet.boardCreativeSpine.bossArtworkDirection },
  };
  return { packet, plan };
}

function chartForPlanner(chart: ChildChart): unknown {
  return {
    identity: chart.identity,
    demographics: chart.demographics,
    learningProfile: {
      sessionStats: chart.learningProfile.sessionStats,
    },
    engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory),
    factBankSummary: chart.factBankSummary,
    recentDecision: chart.decisionTrace.latest,
    longitudinalLearning: chart.learningHistory,
  };
}

const INHERITED_CREATIVE_KEYS = new Set([
  "promptDirectives",
  "preferredDimensions",
  "avoidedDimensions",
  "creatorPrompt",
  "nextCreatorPrompt",
  "nextPromptDirectives",
  "generationPrompt",
  "designPrediction",
  "qualityPrediction",
  "preserve",
  "change",
  "explore",
  "avoid",
]);

function factualModelContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(factualModelContext);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !INHERITED_CREATIVE_KEYS.has(key))
      .map(([key, nested]) => [key, factualModelContext(nested)]),
  );
}

function isSyntheticEvidenceIdentity(value: string): boolean {
  return /(^|[:_-])(synthetic|playwright|browser-acceptance|readiness)([:_-]|$)/i.test(value);
}

function providerTransportErrorDetails(error: unknown): {
  name: string;
  message: string;
  code?: string;
  causeName?: string;
  causeCode?: string;
} {
  const value = error instanceof Error ? error : new Error(String(error));
  const cause = object((value as Error & { cause?: unknown }).cause);
  const code = (value as Error & { code?: unknown }).code;
  return {
    name: value.name,
    message: value.message,
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof cause?.name === "string" ? { causeName: cause.name } : {}),
    ...(typeof cause?.code === "string" ? { causeCode: cause.code } : {}),
  };
}

function isRetryableProviderTransportError(error: unknown): boolean {
  const details = providerTransportErrorDetails(error);
  return /APIConnection|Timeout/i.test(details.name) ||
    /connection error|request timed out|socket|network/i.test(details.message) ||
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENETUNREACH"]
      .includes(details.code ?? details.causeCode ?? "");
}

export function buildMathCreativeChildContext(chart: ChildChart): unknown {
  const rawEngagement = object(engagementTheoryEvidenceContext(chart.engagementTheory));
  const dimensions = Array.isArray(rawEngagement?.dimensions)
    ? rawEngagement.dimensions.filter((entry) => {
        const dimension = object(entry);
        const name = typeof dimension?.dimension === "string" ? dimension.dimension : "";
        return /^[a-z][a-z0-9_-]*$/i.test(name);
      })
    : [];
  const observations = Array.isArray(rawEngagement?.evidence)
    ? rawEngagement.evidence.filter((entry) => {
        const evidence = object(entry);
        const id = typeof evidence?.id === "string" ? evidence.id : "";
        const summary = typeof evidence?.summary === "string" ? evidence.summary : "";
        return Boolean(id) &&
          !isSyntheticEvidenceIdentity(id) &&
          !/generated-baseline/i.test(`${id} ${summary}`);
      })
    : [];
  const favoriteGames = Array.isArray(chart.learningProfile.rewardPreferences?.favoriteGames)
    ? chart.learningProfile.rewardPreferences.favoriteGames.filter(
        (value) => typeof value === "string" && value.trim(),
      )
    : [];

  return {
    audience: {
      displayName: chart.identity.displayName,
      age: chart.demographics.age,
      grade: chart.demographics.grade,
      learningStyle: chart.demographics.learningStyle,
      attentionSpan: chart.demographics.attentionSpan,
    },
    explicitPreferences: favoriteGames.length > 0 ? { favoriteGames } : null,
    engagementObservations: {
      howToRead: [
        "These are factual observations with uncertainty, not design instructions or durable preference conclusions.",
        "An unmeasured or negative dimension is not a prohibition.",
      ],
      dimensions,
      observations,
    },
  };
}

function factualCycleEvidence(cycle: LearningCycleRecordV2): LearningCycleRecordV2["evidence"] {
  return {
    academic: cycle.evidence.academic.filter((item) => !isSyntheticEvidenceIdentity(item.evidenceId)),
    engagement: cycle.evidence.engagement.filter((item) => !isSyntheticEvidenceIdentity(item.evidenceId)),
    companionObservations: cycle.evidence.companionObservations
      .filter((item) => !isSyntheticEvidenceIdentity(item.evidenceId)),
  };
}

function factualCycleObservations(cycle: LearningCycleRecordV2): LearningCycleRecordV2["observations"] {
  return cycle.observations.filter((observation) =>
    !isSyntheticEvidenceIdentity(observation.observationId) &&
    !isSyntheticEvidenceIdentity(observation.sourceId)
  );
}

function availableMathInstrumentsForPlanner(): unknown[] {
  return listActivityToolContracts()
    .filter((contract) => contract.domains.includes("math") || contract.domains.includes("reward"))
    .map((contract) => ({
      id: contract.id,
      label: contract.label,
      purposes: contract.purposes,
      strengths: contract.strengths,
      weakFor: contract.weakFor,
      plannerVisibility: contract.plannerVisibility,
      runtimeAvailable: Boolean(contract.nodeType && NODE_REGISTRY[contract.nodeType]),
      configuration: contract.configKnobs,
      measurements: contract.measures,
    }));
}

export async function askDirectMathPlanner(input: {
  childId: string;
  chart: ChildChart;
  extraction: AssignmentSourceExtraction;
  client?: Anthropic;
  model?: string;
  priorOutcomes?: unknown;
  /** Concept ids already on record for this child, so the Planner reuses instead of rephrasing. */
  priorConceptIds?: string[];
  rawResponseFile?: string;
}): Promise<MathLearningProgram> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are Sunny's AI Math Planner, acting like the educational lead in an IEP team.

Read the assignment, child chart, prior evidence, and prior calibration. Prescribe the smallest coherent learning program that can test your theory. Teach the concept the teacher is targeting rather than copying or lightly rewriting worksheet questions.

You own only the educational prescription:
- stable concept identity and assignment scope;
- explicit assumptions, evidence, confidence, and uncertainty;
- academic theory and preregistered predictions;
- activity count, sequence, node responsibilities, route structure, and academic comparability;
- difficulty boundaries, teaching/practice items, response contracts, and evidence requirements;
- a catalog decision for each node: reuse, revise, generate_new, or retire.

You do not choose titles, worlds, visuals, mechanics, stakes, consequences, rewards, motion, sound, artwork, libraries, HTML, or Creator prompts. A separate Experience Creator owns those choices after your program is locked.

Choose any educationally sufficient activity and item counts. Use exactly two academically valid routes with at least one node each. Distribute responsibilities across the whole board; do not duplicate the complete curriculum merely for symmetry. Keep initial nodes practice_only. Quest and Boss are not part of this baseline program and remain locked until real evidence supports a later decision.

Create one agencyExperiment for the two routes. Use factual child-chart and historical evidence to state a separate engagement hypothesis, predicted outcome, uncertainty, falsifying evidence, and measurement keys for each route. Keep the academic purpose and difficulty comparable at the choice point. A route choice is weak engagement evidence only and never proves a preference. The later decision must consider starts, completion, abandonment, switching, replay, assistance, interaction difficulty, rating, and academic outcomes.

For every node define a difficultyBoundary with allowed concepts and representations, excluded extensions, starting support, and expected independence. Keep all item content within that boundary. Response modes may be selection, numeric, construction, or explanation.

Every assumption must have a stable assumptionId, factual evidence IDs, confidence from 0 to 1, and explicit uncertainty. Predictions concern later independent, delayed, or graded performance; engagement facts never prove academic ability.

concept.conceptId is a stable namespaced identity chosen from the assignment and prior concept history. Put assignment-specific context in instanceScope. Reuse a prior concept ID exactly when it is the same idea.

Each item contains id, prompt, lineage {sourceEvidenceIds, exposure}, and one response contract:
- selection: {mode, options:[{id,label,correct}]}
- numeric: {mode, expected, optional unit}
- construction: {mode, expectedState, successDescription}
- explanation: {mode, rubric}
Every responsibility, route, activity, item, assumption, and selection option has a non-empty stable ID.

Concept ids already on record for this child. Reuse one exactly if you mean the same idea; coin a new one only if this assignment is genuinely about something else:
${input.priorConceptIds?.length ? input.priorConceptIds.map((id) => `- ${id}`).join("\n") : "- none recorded"}

Assignment:
${input.extraction.fullText}

Available reusable instruments:
${JSON.stringify(availableMathInstrumentsForPlanner(), null, 2)}

Child chart:
${JSON.stringify(chartForPlanner(input.chart), null, 2)}

  Prior factual outcomes and Planner interpretations:
${JSON.stringify(factualModelContext(input.priorOutcomes ?? []), null, 2)}`;
  const toolName = "create_math_learning_program";
  // A whole board — every activity, item, prediction and creator prompt — is a
  // long generation against a 20k token budget, and the non-streaming request
  // was timing out before it finished. Stream it, as the Creator already does.
  const response = await client.messages.stream({
    model: input.model ?? process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
    max_tokens: Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? 20000),
    messages: [{ role: "user", content: prompt }],
    tools: [{
      name: toolName,
      description: "Return the academic-only math learning program.",
      input_schema: MATH_LEARNING_PROGRAM_TOOL_SCHEMA,
    }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000) }).finalMessage();
  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (input.rawResponseFile) {
    fs.mkdirSync(path.dirname(input.rawResponseFile), { recursive: true });
    fs.writeFileSync(input.rawResponseFile, `${JSON.stringify({
      model: input.model ?? process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
      stopReason: response.stop_reason,
      usage: response.usage,
      content: response.content,
    }, null, 2)}\n`, "utf8");
  }
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("direct_planner_tool_output_missing");
  // A plan cut off at the token ceiling arrives structurally incomplete, and the
  // schema parser then blames whichever field happened to be truncated away
  // ("requires activities"), which sends you looking in the wrong place.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `direct_planner_plan_truncated:raise SUNNY_PLANNER_MAX_TOKENS above ${process.env.SUNNY_PLANNER_MAX_TOKENS ?? 20000}`,
    );
  }
  return parseMathLearningProgram(toolUse.input);
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`direct_artwork_download_failed:${response.status}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

async function requestDirectArtwork(prompt: string): Promise<string> {
  const apiKey = process.env.GROK_API_KEY?.trim();
  if (!apiKey) throw new Error("direct_artwork_missing_grok_key");
  const response = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image",
      prompt,
      n: 1,
    }),
  });
  if (!response.ok) throw new Error(`direct_artwork_provider_failed:${response.status}:${await response.text()}`);
  const json = await response.json() as { data?: Array<{ url?: string }> };
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("direct_artwork_provider_returned_no_url");
  return url;
}

export async function createDirectArtwork(prompt: string, publicDir: string, filename: string): Promise<string> {
  const relative = path.join("generated", "direct-math", filename);
  const localPath = path.join(publicDir, relative);
  if (!fs.existsSync(localPath) || fs.statSync(localPath).size === 0) {
    const remote = await requestDirectArtwork(prompt);
    await download(remote, localPath);
  }
  return `/${relative.replaceAll(path.sep, "/")}`;
}

function stripHtml(text: string): string {
  return text.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "");
}

export function isCompleteGeneratedHtml(html: string): boolean {
  return /^\s*<!doctype html/i.test(html) && /<\/html>\s*$/i.test(html.trim());
}

export function normalizeGeneratedHtml(html: string): string {
  const trimmed = html.trim();
  if (isCompleteGeneratedHtml(trimmed)) return trimmed;
  const documentStart = trimmed.search(/<!doctype html/i);
  const documentEnd = trimmed.toLowerCase().lastIndexOf("</html>");
  if (documentStart >= 0 && documentEnd > documentStart) {
    const document = trimmed.slice(documentStart, documentEnd + "</html>".length);
    if (isCompleteGeneratedHtml(document)) return document;
  }
  const count = (pattern: RegExp) => trimmed.match(pattern)?.length ?? 0;
  const structurallyClosed = /^<!doctype html/i.test(trimmed)
    && count(/<html\b/gi) === 1
    && count(/<\/html>/gi) === 0
    && count(/<script\b/gi) === count(/<\/script>/gi)
    && count(/<style\b/gi) === count(/<\/style>/gi)
    && (/<\/script>\s*$/i.test(trimmed) || /<\/body>\s*$/i.test(trimmed));
  if (!structurallyClosed) return html;
  return `${trimmed}${/<\/body>\s*$/i.test(trimmed) ? "" : "</body>"}</html>`;
}

export function creatorPromptHash(
  activity: DirectActivity,
  plannerModel: string,
  creatorModel: string,
): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    creatorContractVersion: 13,
    plannerModel,
    creatorModel,
    activity,
  })).digest("hex");
}

export function shouldReuseDirectArtifact(input: {
  htmlComplete: boolean;
  savedPromptHash?: string;
  expectedPromptHash: string;
}): boolean {
  return input.htmlComplete && input.savedPromptHash === input.expectedPromptHash;
}

export function buildDirectActivityCreatorPrompt(input: {
  activity: DirectActivity;
  artworkUrl: string;
  childId: string;
}): string {
  return `Build the complete child-facing activity below as one self-contained HTML file with inline CSS and JavaScript.

The Planner's academic contract is immutable. The approved design artifact is the creative authority. Implement both faithfully without turning the experience into a generic quiz.

This optional board-world asset is available: ${input.artworkUrl}. Use it only if it serves the approved artifact; the experience may instead render its world entirely with HTML, CSS, SVG, Canvas, or WebGL.
You may use the HTTPS libraries named by the design artifact, or no library. Keep the complete HTML under 45,000 characters.

Runtime contract:
Emit window.parent.postMessage({type:"activity_ready",payload:{nodeId:"${input.activity.id}"}},"*") when the experience is ready.
Whenever the activity or active problem changes, emit window.parent.postMessage({type:"game_state_update",payload:{game:"generated-math",activityId:"${input.activity.id}",nodeId:"${input.activity.id}",phase:"question",activityTitle:${JSON.stringify(input.activity.title)},learningFocus:${JSON.stringify(input.activity.academicTarget)},mechanic:${JSON.stringify(input.activity.mechanic)},currentChallenge,availableActions,itemIndex,totalItems,answerVisibility:"hidden"}},"*") so Elli has live context. Never expose answers.
For sound, post semantic cues to Sunny with window.parent.postMessage({type:"sunny_sfx",payload:{cue}},"*"). The allowed cue values are "interaction", "recovery", "progress", and "completion". Emit them when the approved design calls for those moments; Sunny owns the actual recorded sound quality.
Include one visible sound toggle. It must post window.parent.postMessage({type:"sunny_sound_toggle",payload:{muted}},"*") whenever its state changes. Do not use speechSynthesis, spoken browser narration, HTML audio elements, or external audio assets. Do not create AudioContext oscillators or synthesized tones. Spoken explanations belong only to Elli after the child asks.
Maintain a factual targetResults array for the full activity. For each answer append {target,correct,attemptedValue,responseTimeMs,scaffoldLevel}, where target is the stable item id, attemptedValue is what the child submitted, and scaffoldLevel reflects demos, hints, or companion help.
Emit window.parent.postMessage({type:"attempt_event",payload:{domain:"math",target,correct,attemptedValue,responseTimeMs,scaffoldLevel}},"*") for each answer.
Emit window.parent.postMessage({type:"progress_event",payload:{nodeId:"${input.activity.id}",completedItems,totalItems}},"*") whenever visible progress advances.
On completion calculate accuracy from targetResults and emit window.parent.postMessage({type:"node_complete",payload:{nodeId:"${input.activity.id}",completed:true,accuracy,targetResults,timeSpent_ms}},"*").
Include <div id="sunny-companion"></div> so the parent app owns Elli.
At a 1365×768 viewport, the title and first required action must be visible immediately. Keep all primary controls inside the viewport without page scrolling or clipping.
Return raw HTML only and end with </html>.

Child: ${input.childId}
Immutable academic contract:
${JSON.stringify({
  responsibilityId: input.activity.responsibilityId,
  academicTarget: input.activity.academicTarget,
  difficultyBoundary: input.activity.difficultyBoundary,
  items: input.activity.items,
  academicPrediction: input.activity.academicPrediction,
}, null, 2)}

Approved design artifact:
${JSON.stringify(input.activity.designArtifact, null, 2)}`;
}

export function buildAdaptiveProgressionCreatorPrompt(input: {
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  childContext: unknown;
}): string {
  const nodeId = input.node.nodeId;
  const { generationPrompt: _generationPrompt, ...creatorNodeContract } = input.node;
  const prompt = `You are Sunny's Experience Creator. Build one complete child-facing activity as self-contained HTML with inline CSS and JavaScript.

Creative objective:
Build an experience a child would voluntarily replay. The mathematics must be the power the child uses to affect the world, not an unrelated question interrupting play. The child's meaningful action must visibly transform the world, mission, progression, or payoff. Choose the interaction, stakes, consequences, pacing, and reward that best serve the Planner's prescription and the factual evidence. Commit to one distinctive core interaction whose first action is understandable from the finished screen.

The AI Planner already made the educational decision below. Implement it faithfully without changing the theory, evidence limit, or purpose:
${input.node.generationPrompt?.text ?? "No Planner prescription was provided."}
${input.node.design ? `
The Planner's design decisions for this node. Build these; do not soften them:
${input.node.design.mechanicSpec ? `- Core interaction: ${input.node.design.mechanicSpec}` : ""}
${input.node.design.stakes ? `- What is at risk: ${input.node.design.stakes}` : ""}
${input.node.design.failureMode ? `- How a run goes wrong: ${input.node.design.failureMode}` : ""}
${input.node.design.escalation ? `- How pressure builds: ${input.node.design.escalation}` : ""}
${input.node.design.mathematicalHook ? `- The mathematical hook to make visible: ${input.node.design.mathematicalHook}` : ""}
If the Planner specified a way to fail, that failure must be genuinely reachable on screen and must cost the child something they can see. Do not replace it with a hint, a retry, or an encouraging message.
` : ""}
Never display the answer to a question before the child has committed to a response.

Author fresh content appropriate to this assignment and node responsibility. Do not reuse any exposed item identity or exact prompt listed in the cycle. Quest must test unseen transfer. Boss must test unseen synthesis. A generated support node remains teaching/practice evidence. Do not claim mastery.
The first visible H1 must be exactly ${JSON.stringify(input.node.openingScreen.title)}. A short exciting subtitle may establish the AI-authored world.
Visibly use the assigned artwork URL as part of the world: ${input.node.artwork.localPath ?? "none"}.
Keep the complete HTML under 24,000 characters. Prefer concise CSS and JavaScript.
Every DOM element queried by JavaScript must exist before the query runs; place behavior after its markup or initialize it on DOMContentLoaded.

Runtime contract appendix:
Load <script src="/games/_contract.js"></script> in <head>.
Read runtime identity and parameters from window.GAME_PARAMS. Never hardcode the child identity, homework identity, or session identity into the HTML.
Emit window.parent.postMessage({type:"activity_ready",payload:{nodeId:"${nodeId}"}},"*") when ready.
Whenever the activity or problem changes, emit window.parent.postMessage({type:"game_state_update",payload:{game:"generated-math",activityId:"${nodeId}",nodeId:"${nodeId}",phase:"question",activityTitle:${JSON.stringify(input.node.title)},learningFocus:${JSON.stringify(input.node.academicTarget.skill)},mechanic:${JSON.stringify(input.node.mechanic)},currentChallenge,availableActions,itemIndex,totalItems,answerVisibility:"hidden"}},"*") so Elli has live context. Never expose answers.
Maintain a factual targetResults array. For every submitted answer append {target,correct,attemptedValue,responseTimeMs,scaffoldLevel} using a stable fresh item identity.
For every answer call window.fireAttemptEvent({domain:"math",target,correct,attemptedValue,responseTimeMs,scaffoldLevel}).
Emit window.parent.postMessage({type:"progress_event",payload:{nodeId:"${nodeId}",completedItems,totalItems}},"*") whenever visible progress advances.
Use window.fireCompanionEvent("correct_answer" or "wrong_answer", {target}) after meaningful answers and window.fireCompanionEvent("game_complete", {}) at completion.
On completion calculate accuracy from targetResults and call window.sendNodeComplete({nodeId:window.GAME_PARAMS.nodeId,completed:true,accuracy,targetResults,timeSpent_ms}).
Expose window.SUNNY_VALIDATION_HOOKS = {playthrough: async () => { ... }}. This is required for Quest and Boss. The hook must use the same handlers as visible child controls, exercise an incorrect response and visible recovery, complete every assessable item, and reach completion. It must not fabricate or post evidence directly.
Include <div id="sunny-companion"></div>; Sunny owns its rendering, so do not create companion chrome. Return raw HTML only and end with </html>.

Assignment identity and current theory:
${JSON.stringify({
    assignment: {
      homeworkId: input.cycle.homeworkId,
      title: input.cycle.assignment.title,
      targets: input.cycle.assignment.targets,
      fingerprint: input.cycle.assignment.contentFingerprint,
    },
    theory: input.cycle.academicTheory,
    engagementEvidence: engagementTheoryEvidenceContext(input.cycle.engagementTheory),
  }, null, 2)}

Canonical node contract:
${JSON.stringify(creatorNodeContract, null, 2)}

Prior factual observations (never rewrite them):
${JSON.stringify(factualCycleObservations(input.cycle), null, 2)}

Current child context:
${JSON.stringify(factualModelContext(input.childContext), null, 2)}`;
  const childIdentity = input.cycle.childId.trim();
  if (!childIdentity) return prompt;
  const escapedIdentity = childIdentity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const scrubbed = prompt.replace(new RegExp(escapedIdentity, "gi"), "the current child");
  // The Planner may legitimately put the child's own name in the title it
  // chose. Scrubbing the prompt would rewrite the mandated H1 too, and the
  // Creator would faithfully render "the current child's Last Cargo Run" — which
  // then fails the opening-title check against the contract. Restore the exact
  // required title after scrubbing; it is the one place the name belongs.
  const requiredTitle = JSON.stringify(input.node.openingScreen.title);
  const scrubbedTitle = JSON.stringify(
    input.node.openingScreen.title.replace(new RegExp(escapedIdentity, "gi"), "the current child"),
  );
  return scrubbedTitle === requiredTitle
    ? scrubbed
    : scrubbed.replace(`The first visible H1 must be exactly ${scrubbedTitle}`, `The first visible H1 must be exactly ${requiredTitle}`);
}

export async function generateAdaptiveProgressionActivityHtml(input: {
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  childContext: unknown;
  client?: Anthropic;
  model?: string;
}): Promise<string> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const request = {
    model: input.model ?? process.env.SUNNY_GENERATION_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    max_tokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 32000),
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [{ role: "user", content: buildAdaptiveProgressionCreatorPrompt(input) }],
  } as never;
  const response = await client.messages
    .stream(request, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) })
    .finalMessage();
  const html = normalizeGeneratedHtml(stripHtml(response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")));
  if (!isCompleteGeneratedHtml(html)) {
    throw new Error(`adaptive_activity_html_truncated:${input.node.nodeId}:stop=${response.stop_reason ?? "unknown"}:chars=${html.length}`);
  }
  return html;
}

type GeneratedActivityHtml = {
  html: string;
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
};

function openAiResponseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.flatMap((item) => {
    const record = object(item);
    const content = Array.isArray(record?.content) ? record.content : [];
    return content.flatMap((part) => {
      const block = object(part);
      return typeof block?.text === "string" ? [block.text] : [];
    });
  }).join("\n");
}

export async function readOpenAiResponseStream(response: Response): Promise<{
  raw: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}> {
  if (!response.body) throw new Error("direct_activity_openai_stream_missing_body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = "unknown";

  const consumeEvent = (record: string): void => {
    const data = record.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as Record<string, unknown>;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      raw += event.delta;
      return;
    }
    if (event.type === "error" || event.type === "response.failed") {
      const failure = object(event.error) ?? object(event.response);
      throw new Error(`direct_activity_openai_stream_failed:${String(failure?.message ?? event.type)}`);
    }
    if (event.type === "response.completed") {
      const completed = object(event.response);
      const usage = object(completed?.usage);
      inputTokens = Number(usage?.input_tokens ?? 0);
      outputTokens = Number(usage?.output_tokens ?? 0);
      stopReason = String(completed?.status ?? "completed");
      if (!raw && completed) raw = openAiResponseText(completed);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consumeEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (buffer.trim()) consumeEvent(buffer);
  return { raw, inputTokens, outputTokens, stopReason };
}

function externalLibraryUrls(html: string): string[] {
  return [...new Set(
    [...html.matchAll(/(?:src|href)=["'](https:\/\/[^"']+)["']/gi)].map((match) => match[1]!),
  )].sort();
}

async function generateActivityHtml(input: {
  activity: DirectActivity;
  artworkUrl: string;
  childId: string;
  client: Anthropic;
  provider: "anthropic" | "openai";
  model: string;
}): Promise<GeneratedActivityHtml> {
  const prompt = buildDirectActivityCreatorPrompt(input);
  const startedAt = Date.now();
  let raw = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = "unknown";
  if (input.provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        input: prompt,
        max_output_tokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 32000),
        reasoning: { effort: "high" },
        stream: true,
      }),
      signal: AbortSignal.timeout(Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 240000)),
    });
    if (!response.ok) {
      const payload = await response.json() as Record<string, unknown>;
      const error = object(payload.error);
      throw new Error(`direct_activity_provider_failed:${input.activity.id}:openai:${response.status}:${String(error?.message ?? "request_failed")}`);
    }
    ({ raw, inputTokens, outputTokens, stopReason } = await readOpenAiResponseStream(response));
  } else {
    const response = await input.client.messages.stream({
      model: input.model,
      max_tokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 32000),
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: prompt }],
    } as never, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 240000) }).finalMessage();
    raw = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;
    stopReason = response.stop_reason ?? "unknown";
  }
  const html = normalizeGeneratedHtml(stripHtml(raw));
  if (!isCompleteGeneratedHtml(html)) {
    throw new Error(`direct_activity_html_truncated:${input.activity.id}:stop=${stopReason}:chars=${html.length}`);
  }
  return { html, elapsedMs: Date.now() - startedAt, inputTokens, outputTokens };
}

async function mapConcurrent<T, R>(
  values: T[],
  limit: number,
  run: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await run(values[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function generateDirectArtifacts(input: {
  plan: DirectLearningExperiencePlan;
  childId: string;
  homeworkId: string;
  rootDir?: string;
  client?: Anthropic;
  plannerModel?: string;
  architectModel?: string;
  assignmentFingerprint: string;
  forceNodeIds?: string[];
  existingArtworkUrls?: {
    backgroundUrl: string;
    questArtworkUrl: string;
    bossArtworkUrl: string;
  };
}): Promise<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }> {
  const rootDir = input.rootDir ?? process.cwd();
  const publicDir = path.join(rootDir, "web", "public");
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const plannerModel = input.plannerModel ?? process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5";
  const architectModel = input.architectModel ?? process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5";
  const builderAssignments = new Map(
    assignBaselineBuilderModels(input.assignmentFingerprint, input.plan.activities)
      .map((assignment) => [assignment.nodeId, assignment]),
  );
  const forceNodeIds = new Set(input.forceNodeIds ?? []);
  process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN = "3";
  const artworkJobs = [
    { prompt: input.plan.boardWorld.backgroundPrompt, filename: `${input.homeworkId}-background.jpeg` },
    { prompt: input.plan.quest.artworkPrompt, filename: `${input.homeworkId}-quest.jpeg` },
    { prompt: input.plan.boss.artworkPrompt, filename: `${input.homeworkId}-boss.jpeg` },
  ];
  const artworkUrls = input.existingArtworkUrls ?? await mapConcurrent(artworkJobs, 2, (job) =>
    createDirectArtwork(job.prompt, publicDir, job.filename));
  const [backgroundUrl, questArtworkUrl, bossArtworkUrl] = Array.isArray(artworkUrls)
    ? artworkUrls as [string, string, string]
    : [artworkUrls.backgroundUrl, artworkUrls.questArtworkUrl, artworkUrls.bossArtworkUrl];
  const gamesDir = path.join(rootDir, "src", "context", input.childId, "homework", "games", input.homeworkId);
  fs.mkdirSync(gamesDir, { recursive: true });
  const artifacts = await mapConcurrent(input.plan.activities, 2, async (activity, index): Promise<DirectArtifact> => {
    const artworkUrl = backgroundUrl;
    const builder = builderAssignments.get(activity.id);
    if (!builder) throw new Error(`direct_builder_assignment_missing:${activity.id}`);
    const model = builder.model;
    const htmlPath = path.join(gamesDir, `${activity.id}.html`);
    const metadataPath = path.join(gamesDir, `${activity.id}.artifact.json`);
    const existingHtml = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
    const expectedPromptHash = creatorPromptHash(activity, plannerModel, model);
    let savedPromptHash: string | undefined;
    try {
      savedPromptHash = (JSON.parse(fs.readFileSync(metadataPath, "utf8")) as { promptHash?: string }).promptHash;
    } catch {
      savedPromptHash = undefined;
    }
    let generated: GeneratedActivityHtml | undefined;
    if (forceNodeIds.has(activity.id)
      || !shouldReuseDirectArtifact({ htmlComplete: isCompleteGeneratedHtml(existingHtml), savedPromptHash, expectedPromptHash })) {
      generated = await generateActivityHtml({
        activity,
        artworkUrl,
        childId: input.childId,
        client,
        provider: builder.provider,
        model,
      });
      fs.writeFileSync(htmlPath, generated.html, "utf8");
    }
    const html = generated?.html ?? existingHtml;
    const designArtifactHash = crypto.createHash("sha256").update(JSON.stringify(activity.designArtifact)).digest("hex");
    const htmlHash = crypto.createHash("sha256").update(html).digest("hex");
    fs.writeFileSync(metadataPath, `${JSON.stringify({
      version: 3,
      nodeId: activity.id,
      designArtifact: activity.designArtifact,
      academicContractHash: activity.designArtifact?.academicContractHash,
      designArtifactHash,
      creatorPrompt: activity.creatorPrompt,
      promptHash: expectedPromptHash,
      plannerModel,
      architectModel,
      builderProvider: builder.provider,
      builderModel: model,
      htmlHash,
      externalLibraryUrls: externalLibraryUrls(html),
      generationElapsedMs: generated?.elapsedMs ?? 0,
      inputTokens: generated?.inputTokens ?? 0,
      outputTokens: generated?.outputTokens ?? 0,
    }, null, 2)}\n`, "utf8");
    return {
      childId: input.childId,
      homeworkId: input.homeworkId,
      nodeId: activity.id,
      title: activity.title,
      htmlPath,
      artworkUrl,
      creatorPrompt: activity.creatorPrompt,
      promptHash: expectedPromptHash,
      plannerModel,
      creatorModel: model,
      architectModel,
      builderProvider: builder.provider,
      builderModel: model,
      academicContractHash: activity.designArtifact?.academicContractHash,
      designArtifactHash,
      htmlHash,
      externalLibraryUrls: externalLibraryUrls(html),
      generationElapsedMs: generated?.elapsedMs ?? 0,
      inputTokens: generated?.inputTokens ?? 0,
      outputTokens: generated?.outputTokens ?? 0,
    };
  });
  return { artifacts, backgroundUrl, questArtworkUrl, bossArtworkUrl };
}

function contentType(file: string): string {
  if (/\.html$/i.test(file)) return "text/html; charset=utf-8";
  if (/\.jpe?g$/i.test(file)) return "image/jpeg";
  if (/\.png$/i.test(file)) return "image/png";
  return "application/octet-stream";
}

export async function runDirectBrowserSmokeCheck(input: {
  artifacts: DirectArtifact[];
  rootDir?: string;
}): Promise<DirectPlaywrightReport> {
  const rootDir = input.rootDir ?? process.cwd();
  const publicDir = path.join(rootDir, "web", "public");
  const byLaunchPath = new Map(input.artifacts.map((artifact) => [
    `/api/homework/game/${artifact.childId}/${artifact.homeworkId}/${encodeURIComponent(path.basename(artifact.htmlPath))}`,
    artifact,
  ]));
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const launchArtifact = byLaunchPath.get(url.pathname);
    if (launchArtifact) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(fs.readFileSync(launchArtifact.htmlPath));
      return;
    }
    const publicFile = path.join(publicDir, url.pathname.replace(/^\//, ""));
    if (publicFile.startsWith(publicDir) && fs.existsSync(publicFile)) {
      response.writeHead(200, { "content-type": contentType(publicFile) });
      response.end(fs.readFileSync(publicFile));
      return;
    }
    response.writeHead(404); response.end("not found");
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("direct_playwright_server_failed");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];
  const screenshots: string[] = [];
  const screenshotDir = input.artifacts[0]
    ? path.join(rootDir, "web", "public", "generated", "direct-math", `${input.artifacts[0].homeworkId}-previews`)
    : "";
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
  try {
    for (const artifact of input.artifacts) {
      const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.addInitScript(`window.__sunnyMessages=[];window.addEventListener("message",event=>window.__sunnyMessages.push(event.data));`);
      const launchPath = NODE_REGISTRY["generated-baseline"]?.getUrl?.({
        id: artifact.nodeId,
        type: "generated-baseline",
        gameHtmlPath: artifact.htmlPath,
        date: artifact.homeworkId,
        words: [],
        difficulty: 2,
      }, { childId: artifact.childId, companion: "elli", previewParam: "" });
      if (!launchPath) {
        failures.push(`${artifact.nodeId}:launch_url_missing`);
        await page.close();
        continue;
      }
      const navigation = await page.goto(`http://127.0.0.1:${address.port}${launchPath}`, { waitUntil: "load" });
      if (navigation?.status() !== 200 || !navigation.headers()["content-type"]?.includes("text/html")) {
        failures.push(`${artifact.nodeId}:real_launch_not_html`);
      }
      await page.waitForFunction(
        `window.__sunnyMessages.some(message=>message?.type==='activity_ready')`,
        undefined,
        { timeout: 5_000 },
      ).catch(() => undefined);
      const visibleTitle = page.locator("h1").first();
      if (await visibleTitle.count() !== 1 || !await visibleTitle.isVisible()) {
        failures.push(`${artifact.nodeId}:title_not_visible`);
      }
      const viewportCheck = await page.evaluate<{
        interactiveCount: number;
        clipped: boolean;
        horizontalOverflow: boolean;
      }>(`(() => {
        const interactive = [...document.querySelectorAll(
          "button:not([disabled]),input:not([disabled]),select:not([disabled]),[role=button]:not([aria-disabled=true])"
        )].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        });
        return {
          interactiveCount: interactive.length,
          clipped: interactive.some((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
          }),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
        };
      })()`);
      if (viewportCheck.interactiveCount === 0) failures.push(`${artifact.nodeId}:first_action_not_visible`);
      if (viewportCheck.clipped) failures.push(`${artifact.nodeId}:primary_control_clipped`);
      if (viewportCheck.horizontalOverflow) failures.push(`${artifact.nodeId}:viewport_horizontal_overflow`);
      if (screenshotDir) {
        const screenshotPath = path.join(screenshotDir, `${artifact.nodeId.replace(/[^a-z0-9_-]/gi, "_")}-opening.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false })
          .then(() => screenshots.push(screenshotPath))
          .catch((error) => console.warn(` 🎮 [direct-taste] [screenshot-unavailable] node=${artifact.nodeId} reason=${error instanceof Error ? error.message : String(error)}`));
      }
      pageErrors.forEach((error) => failures.push(`${artifact.nodeId}:browser_error:${error}`));
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return { passed: failures.length === 0, failures, screenshots };
}

export function buildDirectActiveSessionPlan(input: {
  childId: string;
  homeworkId: string;
  plan: DirectLearningExperiencePlan;
  artifacts: DirectArtifact[];
  backgroundUrl: string;
  questArtworkUrl: string;
  bossArtworkUrl: string;
  report: DirectPlaywrightReport;
  createdAt?: string;
}): ActiveSessionPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const artifactById = new Map(input.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const engagementHypothesisForRoute = (routeId: string): string =>
    input.plan.agencyExperiment?.routes.find((route) => route.routeId === routeId)?.engagementHypothesis
    ?? input.plan.fork.hypothesis;
  const choiceRouteIds = new Set(input.plan.fork.routes.map((route) => route.id));
  const sharedActivities = input.plan.activities.filter((activity) => !choiceRouteIds.has(activity.routeId));
  const previewUrl = (nodeId: string, fallback: string): string => {
    const screenshot = input.report.screenshots.find((file) =>
      path.basename(file).startsWith(`${nodeId}-opening`));
    if (!screenshot) return fallback;
    const marker = `${path.sep}web${path.sep}public${path.sep}`;
    const markerIndex = screenshot.indexOf(marker);
    return markerIndex >= 0
      ? `/${screenshot.slice(markerIndex + marker.length).split(path.sep).join("/")}`
      : fallback;
  };
  const nodePlan: ActiveSessionPlan["nodePlan"] = input.plan.activities.map((activity) => {
    const artifact = artifactById.get(activity.id)!;
    const rounds = activity.items.flatMap((item) => item.response.mode === "selection" ? [{
      id: item.id,
      prompt: item.prompt,
      options: item.response.options.map((option) => ({ id: option.id, label: option.label, correct: option.correct })),
    }] : []);
    return {
      id: activity.id, type: "generated-baseline", activityId: "generated-baseline", targets: activity.items.map((item) => item.id), difficulty: 2,
      source: "chart_planner", targetLane: activity.academicTarget, locked: false, masteryUnlockState: "unlocked", title: activity.title,
      ...(rounds.length > 0 ? { rounds } : {}),
      gameHtmlPath: artifact.htmlPath, date: input.homeworkId, thumbnailUrl: previewUrl(activity.id, artifact.artworkUrl), contentId: `${input.homeworkId}:${activity.id}`, mechanic: activity.mechanic,
      engagementDimensions: [activity.engagementVariable as never], engagementHypothesis: engagementHypothesisForRoute(activity.routeId),
    };
  });
  nodePlan.push(
    { id: "quest", type: "quest", activityId: "quest", targets: [], difficulty: 2, source: "chart_planner", locked: true, masteryUnlockState: "preparing", title: "Quest", thumbnailUrl: input.questArtworkUrl },
    { id: "boss", type: "boss", activityId: "boss", targets: [], difficulty: 3, source: "chart_planner", locked: true, masteryUnlockState: "preparing", title: "Boss", thumbnailUrl: input.bossArtworkUrl },
  );
  const nodes: AdventureBoardJson["nodes"] = [
    { id: "start", kind: "start", label: "Start", shortLabel: "Start", state: "completed", position: boardPosition(8, 78) },
  ];
  sharedActivities.forEach((activity, index) => {
    const artifact = artifactById.get(activity.id)!;
    nodes.push({ id: activity.id, kind: "activity", activityId: "generated-baseline", label: activity.title, shortLabel: boardShortLabel(activity.title), state: index === 0 ? "current" : "available", position: sharedNodePosition(index, sharedActivities.length), action: { type: "launch-activity", payloadId: activity.id }, thumbnailUrl: previewUrl(activity.id, artifact.artworkUrl), mechanic: activity.mechanic, engagementDimensions: [activity.engagementVariable], engagementHypothesis: input.plan.fork.hypothesis, contentId: `${input.homeworkId}:${activity.id}` });
  });
  nodes.push({ id: "choose-path", kind: "choice-gate", label: input.plan.fork.question, shortLabel: "Choose Path", state: sharedActivities.length === 0 ? "current" : "available", position: sharedActivities.length === 0 ? boardPosition(24, 58) : boardPosition(44, 48), action: { type: "open-choice-set", payloadId: "direct-route-choice" }, choiceSetId: "direct-route-choice" });
  input.plan.fork.routes.forEach((route, routeIndex) => route.nodeIds.forEach((nodeId, index) => {
    const activity = input.plan.activities.find((item) => item.id === nodeId)!;
    const artifact = artifactById.get(nodeId)!;
    nodes.push({ id: nodeId, kind: "activity", activityId: "generated-baseline", label: activity.title, shortLabel: boardShortLabel(activity.title), state: "available", position: routeNodePosition(index, route.nodeIds.length, routeIndex), action: { type: "launch-activity", payloadId: nodeId }, thumbnailUrl: previewUrl(nodeId, artifact.artworkUrl), mechanic: activity.mechanic, engagementDimensions: [activity.engagementVariable], engagementHypothesis: engagementHypothesisForRoute(route.id), contentId: `${input.homeworkId}:${nodeId}` });
  }));
  nodes.push(
    { id: "quest", kind: "quest", label: "Quest", state: "locked", position: boardPosition(82, 48), thumbnailUrl: input.questArtworkUrl, lock: { reason: "Complete your adventure routes to reveal the Quest.", label: "Locked" }, action: { type: "show-locked-reason", payloadId: "quest" } },
    { id: "boss", kind: "boss", label: "Boss", state: "locked", position: boardPosition(94, 28), thumbnailUrl: input.bossArtworkUrl, lock: { reason: "Complete the Quest before facing the Boss.", label: "Locked" }, action: { type: "show-locked-reason", payloadId: "boss" } },
  );
  const edges: AdventureBoardJson["edges"] = [];
  let sharedPrevious = "start";
  for (const activity of sharedActivities) {
    edges.push({ id: `${sharedPrevious}-${activity.id}`, from: sharedPrevious, to: activity.id, state: "available" });
    sharedPrevious = activity.id;
  }
  edges.push({ id: `${sharedPrevious}-choice`, from: sharedPrevious, to: "choose-path", state: "available" });
  for (const route of input.plan.fork.routes) {
    let previous = "choose-path";
    for (const nodeId of route.nodeIds) { edges.push({ id: `${previous}-${nodeId}`, from: previous, to: nodeId, state: "available" }); previous = nodeId; }
    edges.push({ id: `${previous}-quest`, from: previous, to: "quest", state: "locked" });
  }
  edges.push({ id: "quest-boss", from: "quest", to: "boss", state: "locked" });
  const adventureBoard: AdventureBoardJson = {
    schemaVersion: 1, boardId: `direct:${input.homeworkId}`, planId: input.plan.planId, childId: input.childId, domain: "math", title: input.plan.boardWorld.title,
    theme: { background: { type: "image", value: input.backgroundUrl }, palette: { path: "#fff4c2", completed: "#34d399", available: "#7c3aed", locked: "#64748b", current: "#f59e0b", preview: "#94a3b8", text: "#ffffff", panel: "rgba(15,23,42,.82)" } },
    layout: { preset: "horizontal-adventure-spine", companionSlot: "right", routeChoiceBehavior: "parallel" },
    plannerRationale: { agencyDesign: input.plan.fork.hypothesis, evidenceDesign: input.plan.fork.heldConstant.join("; "), layoutChoice: "Two visible choose-your-adventure routes converge on a locked Quest." },
    nodes, edges,
    choiceSets: [{ id: "direct-route-choice", kind: "baseline-route", title: input.plan.fork.question, options: input.plan.fork.routes.map((route) => ({ id: route.id, label: route.label, description: route.promise, state: "available", nodeId: route.nodeIds[0], engagementDimensions: [route.engagementVariable], choiceSignal: { algorithmFeed: "choicePolicy", traits: [route.engagementVariable], expectedEvidence: "selection, start, completion, abandonment, replay", preferenceNotMastery: true } })) }],
    companion: { id: "elli", name: "Elli" }, progress: {
      currentNodeId: sharedActivities[0]?.id ?? "choose-path",
      completedNodeIds: ["start"],
      ...(sharedActivities.length === 0 ? { activeChoiceSetId: "direct-route-choice" } : {}),
    },
  };
  return {
    planId: input.plan.planId, childId: input.childId, createdAt, source: "ingest_human_loop", activeHomeworkId: input.homeworkId, domain: "math", testDate: null,
    nodePlan, learningRoutes: input.plan.fork.routes.map((route) => ({ id: route.id, label: route.label, rationale: route.promise, nodeIds: [...sharedActivities.map((activity) => activity.id), ...route.nodeIds, "quest", "boss"] })), adventureBoard,
    variationPolicy: { avoidExactPreviousNodeOrder: true, avoidExactPreviousWordOrder: true, seed: input.homeworkId, previousCompletedNodeCount: 0 },
    companionPolicy: { companionId: "elli", displayName: "Elli", openingLinePolicy: "context_start_short", verbosity: "low", maxMicroProbes: 1 },
    evidenceUsed: input.plan.profileEvidence.map((summary, index) => ({ id: `planner-evidence-${index + 1}`, type: "child_chart", summary })), openQuestions: [], approvalStatus: "approved",
    planTheory: { hypothesis: input.plan.academicTheory, evidenceSummary: input.plan.profileEvidence, intervention: input.plan.boardWorld.narrative, supportCriteria: ["Real child evidence supports transfer."], reviseCriteria: ["Real child evidence is mixed."], falsifyCriteria: ["Real child evidence contradicts the theory."] },
  };
}

function canonicalReturnTag(childId: string, homeworkId: string): string {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `#sunny_${normalize(childId)}_${normalize(homeworkId)}`;
}

export function buildDirectLearningCycleInput(input: {
  childId: string;
  homeworkId: string;
  extraction: AssignmentSourceExtraction;
  plannerPlan: DirectLearningExperiencePlan;
  activeSessionPlan: ActiveSessionPlan;
  artifacts: DirectArtifact[];
  assumptions?: MathLearningProgram["assumptions"];
  createdAt?: string;
}): CreateLearningCycleInput {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const artifactById = new Map(input.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const planNodeById = new Map(input.activeSessionPlan.nodePlan.map((node) => [node.id, node]));
  const theoryId = `${input.homeworkId}:academic-theory`;
  const baselineNodes: LearningCycleNodeContract[] = input.plannerPlan.activities.map((activity) => {
    const artifact = artifactById.get(activity.id);
    if (!artifact) throw new Error(`direct_cycle_artifact_missing:${activity.id}`);
    const sessionNode = planNodeById.get(activity.id);
    return {
      nodeId: activity.id,
      routeId: activity.routeId,
      predictionId: `${input.homeworkId}:prediction:${activity.id}`,
      role: "baseline",
      title: activity.title,
      state: "ready",
      academicTarget: {
        domain: "math",
        skill: activity.academicTarget,
        targets: activity.items.map((item) => item.prompt),
      },
      algorithmOwner: "ai_tutor",
      theoryId,
      experimentId: `${input.homeworkId}:${activity.routeId}:${activity.engagementVariable}`,
      mechanic: activity.mechanic,
      theme: activity.visualMock.scene,
      openingScreen: { title: activity.title, purpose: activity.experience.objective },
      generationPrompt: {
        promptId: `${input.homeworkId}:${activity.id}:creator`,
        createdFromEvidenceIds: [`assignment:${input.extraction.fileHash}`],
        text: activity.creatorPrompt,
      },
      prediction: {
        claim: activity.designPrediction,
        createdAt,
        evidenceLimit: "practice_only",
      },
      artifactBinding: {
        contentId: `${input.homeworkId}:${activity.id}`,
        artifactId: artifact.promptHash,
        localArtifactPath: artifact.htmlPath,
        localArtworkPath: artifact.artworkUrl,
        contractFingerprint: artifact.promptHash,
        validationStatus: "passed",
        creativeProvenance: {
          rationale: activity.designArtifact?.audienceRationale ?? activity.designPrediction,
          qualityPrediction: activity.designArtifact?.engagementPrediction ?? activity.designPrediction,
          creatorPromptHash: artifact.promptHash,
          artworkPromptHash: crypto.createHash("sha256").update(activity.visualMock.artworkPrompt).digest("hex"),
          plannerModel: artifact.plannerModel,
          architectModel: artifact.architectModel,
          builderProvider: artifact.builderProvider,
          builderModel: artifact.builderModel,
          academicContractHash: artifact.academicContractHash,
          designArtifactHash: artifact.designArtifactHash,
          generatedHtmlHash: artifact.htmlHash,
          externalLibraryUrls: artifact.externalLibraryUrls,
          generationElapsedMs: artifact.generationElapsedMs,
          inputTokens: artifact.inputTokens,
          outputTokens: artifact.outputTokens,
        },
        validationProof: sessionNode?.validationProof,
      },
      artwork: { status: "ready", localPath: artifact.artworkUrl, prompt: activity.visualMock.artworkPrompt },
      sfxContract: ["interaction", "recovery", "progress", "completion"],
      companionContract: { events: ["completion", "frustration", "replay"] },
      evidenceContract: { academic: true, engagement: true, companionObservations: true },
      evidenceIds: [],
    };
  });
  const lockedNode = (role: "quest" | "boss"): LearningCycleNodeContract => {
    const teaser = input.plannerPlan[role];
    const sessionNode = planNodeById.get(role);
    return {
      nodeId: role,
      role,
      title: role === "quest" ? "Quest" : "Boss",
      state: "locked",
      // These were the literal strings "novel transfer" / "novel synthesis",
      // which nothing ever replaced — so the payoff nodes had no concept to
      // teach toward and their construct resolved to a slug of two words.
      // The role still says what kind of evidence the node produces; the target
      // says what it is about.
      academicTarget: {
        domain: "math",
        skill: `${input.plannerPlan.concept.conceptId} (${role === "quest" ? "unseen transfer" : "unseen synthesis"})`,
        targets: [],
      },
      algorithmOwner: "ai_tutor",
      theoryId,
      experimentId: `${input.homeworkId}:${role}`,
      mechanic: "locked-teaser",
      theme: teaser.teaser,
      openingScreen: { title: role === "quest" ? "Quest" : "Boss", purpose: teaser.teaser },
      generationPrompt: null,
      artifactBinding: null,
      artwork: { status: sessionNode?.thumbnailUrl ? "ready" : "placeholder", localPath: sessionNode?.thumbnailUrl ?? null, prompt: teaser.artworkPrompt },
      sfxContract: [],
      companionContract: { events: [] },
      evidenceContract: { academic: true, engagement: false, companionObservations: true },
      evidenceIds: [],
    };
  };
  return {
    childId: input.childId,
    homeworkId: input.homeworkId,
    domain: "math",
    assignment: {
      title: input.plannerPlan.title,
      contentFingerprint: input.extraction.fileHash,
      capturedEvidenceIds: [`assignment:${input.extraction.fileHash}`],
      targets: [...new Set(input.plannerPlan.activities.map((activity) => activity.academicTarget))],
      returnTag: canonicalReturnTag(input.childId, input.homeworkId),
      rawText: input.extraction.fullText,
      sourceFilename: input.extraction.filename,
    },
    academicTheory: {
      theoryId,
      revision: 1,
      hypothesis: input.plannerPlan.academicTheory,
      supportCriteria: ["Real child evidence and returned work support the prediction."],
      reviseCriteria: ["Observed performance is mixed or a confound limits the claim."],
      falsifyCriteria: ["Returned work contradicts the prediction."],
    },
    engagementTheory: null,
    nodes: [...baselineNodes, lockedNode("quest"), lockedNode("boss")],
    academicPredictions: input.plannerPlan.activities.map((activity) => ({
      predictionId: `${input.homeworkId}:prediction:${activity.id}`,
      theoryId,
      ...structuredClone(activity.academicPrediction),
      createdAt,
      lockedAt: createdAt,
    })),
    assumptions: (input.assumptions ?? input.plannerPlan.concept.assumptions.map((claim, index) => ({
      assumptionId: `${input.homeworkId}:assumption:${index + 1}`,
      claim,
      evidenceIds: [`assignment:${input.extraction.fileHash}`],
      confidence: 0.5,
      uncertainty: "Legacy assumption without structured uncertainty.",
    }))).map((assumption) => ({
      ...structuredClone(assumption),
      createdAt,
      lockedAt: createdAt,
    })),
  };
}

export function persistDirectExperience(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  extraction: AssignmentSourceExtraction;
  plannerPlan: DirectLearningExperiencePlan;
  activeSessionPlan: ActiveSessionPlan;
  artifacts: DirectArtifact[];
  report: DirectPlaywrightReport;
  assumptions?: MathLearningProgram["assumptions"];
}): string {
  const rootDir = input.rootDir ?? process.cwd();
  const contextDir = path.join(rootDir, "src", "context", input.childId);
  const directPath = path.join(contextDir, "homework", "direct_experience_plan.json");
  const now = new Date().toISOString();
  let priorFeedback: { feedbackObservations?: unknown[]; feedbackDecisions?: unknown[] } = {};
  try {
    priorFeedback = JSON.parse(fs.readFileSync(directPath, "utf8")) as typeof priorFeedback;
  } catch {
    priorFeedback = {};
  }
  const record = {
    version: 2,
    childId: input.childId,
    homeworkId: input.homeworkId,
    generatedAt: now,
    assignment: input.extraction,
    plannerPlan: input.plannerPlan,
    activeSessionPlan: input.activeSessionPlan,
    artifacts: input.artifacts,
    assumptions: input.assumptions,
    playwrightReport: input.report,
    feedbackObservations: priorFeedback.feedbackObservations ?? [],
    feedbackDecisions: priorFeedback.feedbackDecisions ?? [],
  };
  const planPath = path.join(contextDir, "plans", "active_session_plan.json");
  const homeworkPath = path.join(contextDir, "homework", "current.json");
  const profilePath = path.join(contextDir, "learning_profile.json");
  const cyclePath = path.join(contextDir, "homework", "cycles", `${input.homeworkId}.json`);
  const publicationPaths = [directPath, planPath, homeworkPath, profilePath, cyclePath];
  const beforePublication = new Map(publicationPaths.map((file) => [
    file,
    fs.existsSync(file) ? fs.readFileSync(file) : null,
  ]));
  try {
  const canonicalInput = buildDirectLearningCycleInput({
    childId: input.childId,
    homeworkId: input.homeworkId,
    extraction: input.extraction,
    plannerPlan: input.plannerPlan,
    activeSessionPlan: input.activeSessionPlan,
    artifacts: input.artifacts,
    assumptions: input.assumptions,
    createdAt: now,
  });
  const existingCycle = getLearningCycle(input.childId, input.homeworkId, { rootDir });
  if (existingCycle) {
    transitionLearningCycle(input.childId, input.homeworkId, existingCycle.revision, {
      type: "plan_reconciled",
      assignment: canonicalInput.assignment,
      academicTheory: canonicalInput.academicTheory,
      engagementTheory: canonicalInput.engagementTheory,
      nodes: canonicalInput.nodes,
      academicPredictions: canonicalInput.academicPredictions,
      assumptions: canonicalInput.assumptions,
      reason: "Re-ingestion reconciled the AI-authored board with the existing assignment cycle.",
    }, { rootDir, now: new Date(now) });
  } else {
    createLearningCycle(canonicalInput, { rootDir, now: new Date(now) });
  }
  fs.mkdirSync(path.dirname(directPath), { recursive: true });
  fs.writeFileSync(directPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const planFile = { version: 1, childId: input.childId, selectedDomain: "math", current: input.activeSessionPlan, activeByDomain: { math: input.activeSessionPlan }, updatedAt: now };
  fs.mkdirSync(path.join(contextDir, "plans"), { recursive: true });
  fs.writeFileSync(planPath, `${JSON.stringify(planFile, null, 2)}\n`, "utf8");
  const pending = { weekOf: now.slice(0, 10), testDate: null, returnTag: `#sunny_${input.childId}_${input.homeworkId}`, wordList: [], contentProfile: { practiceDomain: "math", topic: input.plannerPlan.title }, capturedContent: { title: input.plannerPlan.title, rawText: input.extraction.fullText }, homeworkId: input.homeworkId, generatedAt: now, nodes: input.activeSessionPlan.nodePlan };
  const homeworkFile = { version: 1, childId: input.childId, selectedDomain: "math", current: pending, activeByDomain: { math: pending }, updatedAt: now };
  fs.writeFileSync(homeworkPath, `${JSON.stringify(homeworkFile, null, 2)}\n`, "utf8");
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  profile.pendingHomework = pending;
  profile.activeSessionPlan = input.activeSessionPlan;
  const existingCatalog = Array.isArray(profile.aiContentCatalog) ? profile.aiContentCatalog as AIContentCatalogItem[] : [];
  const publishedEntries: AIContentCatalogItem[] = input.plannerPlan.activities.map((activity) => {
    const artifact = input.artifacts.find((candidate) => candidate.nodeId === activity.id)!;
    const design = activity.designArtifact;
    return {
      contentId: `${input.homeworkId}:${activity.id}`,
      homeworkId: input.homeworkId,
      childId: input.childId,
      type: "game",
      source: "generated",
      purpose: "learning_intervention",
      title: activity.title,
      activityId: activity.id,
      gameHtmlPath: artifact.htmlPath,
      domain: "math",
      skillTarget: activity.academicTarget,
      algorithmTargets: ["retrieval-practice"],
      targetSkills: [activity.academicTarget],
      targetConcepts: [input.plannerPlan.concept.conceptId],
      targetWords: [],
      engagementHooks: [activity.engagementVariable],
      inputEvidence: { contentFingerprint: input.extraction.fileHash },
      reuseStatus: activity.catalogDecision?.action === "retire" ? "retire" : "candidate",
      reuseReason: activity.catalogDecision?.reason ?? "Artifact-designed candidate awaiting real child evidence.",
      reviewStatus: "approved_ready",
      reviewReason: "Published after Playwright runtime verification; human taste remains unreviewed.",
      validationStatus: "passed",
      mechanic: activity.mechanic,
      theme: activity.visualMock.scene,
      ...(design ? {
        designMemory: {
          artifactId: design.artifactId,
          artifactHash: crypto.createHash("sha256").update(JSON.stringify(design)).digest("hex"),
          academicResponsibility: activity.responsibilityId,
          interactionHistory: [design.coreInteraction],
          themeHistory: [design.visualDirection],
          humanReview: "not_reviewed",
          childEvidenceIds: [],
          predictionIds: [`${input.homeworkId}:prediction:${activity.id}`],
          theoryDecisionIds: [],
          plannerModel: artifact.plannerModel,
          architectModel: artifact.architectModel,
          builderProvider: artifact.builderProvider,
          builderModel: artifact.builderModel,
          academicContractHash: artifact.academicContractHash,
          implementationPromptHash: artifact.promptHash,
          generatedHtmlHash: artifact.htmlHash,
        },
      } : {}),
    };
  });
  const publishedIds = new Set(publishedEntries.map((entry) => entry.contentId));
  profile.aiContentCatalog = [
    ...existingCatalog.filter((entry) => !publishedIds.has(entry.contentId)),
    ...publishedEntries,
  ];
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return directPath;
  } catch (error) {
    for (const [file, previous] of beforePublication) {
      if (previous === null) fs.rmSync(file, { force: true });
      else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, previous);
      }
    }
    throw error;
  }
}
