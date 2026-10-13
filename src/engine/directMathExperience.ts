import {assertNativeLearningProgramCorrection,hydrateNativeLearningProgram,nativeLearningProgramToolJsonSchema,resolveAssignmentPlannerModel,type AssignmentPlanningPacket,type AssignmentPlannerOutput,type AssignmentPlannerTelemetry} from "./assignmentPlanner";
import {requestPlannerMessage,assertPlannerResponseComplete} from "./plannerTransport";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {learningPlannerInstructions} from "./learningPlannerInstructions";
import {verifyAuthoredBoardCanvas,verifyPreparingBoardCanvas} from './adventureBoardCanvas';
import {JOURNEY_AUTHORING_INSTRUCTION,adventureJourneySchema,ADVENTURE_JOURNEY_TOOL_SCHEMA,journeyFromBoardDefinition,validateBoardDefinition,adventureCompositionSchema,assembleAdventureBoardDefinition,BOARD_CANVAS_AUTHORING_CONSTRAINTS,type AdventureJourneyDefinition,type AdventureBoardComposition, requireBoardDefinition, BOARD_DEFINITION_TOOL_SCHEMA, BOARD_AUTHORING_INSTRUCTION, journeyExecutions, renderBoardDefinition, type AdventureBoardDefinition } from "../shared/adventureBoardDefinition";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { resolveChildContextDir, resolveContextRoot } from "../utils/contextRoot";
import { DISCOVERY_VERIFIER_VERSION, DISCOVERY_RELEASE_VIEWPORTS, MATH_JOURNEY_CONTRACT, MATH_IMPLEMENTATION_REPAIR_CONTRACT, verifyMathControlJourney, recordJourneyCapture, assertMathControlsVisible, type JourneyCapture, type MathJourney, type MathJourneyStep, freezeEngineeringLessonSnapshot, engineeringFeatures, engineeringLessonContext, recordEngineeringRepairEvidence } from "./discoveryVisualReview";
import type { ChildChart } from "../profiles/childChart";
import { assignmentPlannerContent, type AssignmentSourceExtraction } from "./assignmentSourceExtraction";
import type { ActiveSessionPlan, AIContentCatalogItem } from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import { NODE_REGISTRY } from "../shared/nodeRegistry";
import { engagementTheoryEvidenceContext } from "./engagementTheory";
import { assignmentLedgerPath, writeAssignmentLedgerEntry } from "./assignmentLedger";
import { writeWaterfallContentCatalog } from "../profiles/chartWaterfall";
import { OPENAI_REPAIR_MAX_OUTPUT_TOKENS, readOpenAiResponseStream } from "./openAiResponses";
import { applyDiscoveryHtmlPatch, runMathProviderStage, hasReceivedMathProviderStage, estimateDiscoveryRepairCost } from "./adaptiveMathDiscovery";
import {
  buildPlannerContentCandidateCards,
  resolveExactMathCatalogReuse,
  type PlannerContentCandidateCard,
} from "./learningDecisionContext";
import {
  createLearningCycle,
  getLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type AcademicPrediction,
  type LearningAssumption,
  type LearningCycleMathItem,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
} from "./learningCycleRepository";
import { withInitialBoard } from "./learningBoardInstances";

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

export type DirectItem = LearningCycleMathItem;

export function mergeActiveDomainProjection(
  existing: unknown,
  domain: string,
  value: unknown,
): Record<string, unknown> {
  const current = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return { ...current, [domain]: value };
}

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
  academicCompatibility?: string;
  predictedLearningValue?: string;
  engagementHypothesis?: string;
  reliabilityEvidence?: string;
  explorationRationale?: string;
  costRationale?: string;
  evidenceIds?: string[];
};

export type MathPlannedActivity = {
  purpose?: "baseline" | "bonus";
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
  domain?: "math";
  journey?: AdventureJourneyDefinition;
  boardDefinition?: AdventureBoardDefinition;
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
  bonusActivity?: MathPlannedActivity;
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
      childFacingActionCue: string;
      previewNodeId: string;
      engagementVariable: string;
    }>;
  };
  artifacts: ExperienceDesignArtifactV1[];
  rationale: string;
  model: string;
  createdAt: string;
  revision: number;
};

export type MathDesignCheckpoint = {
  composition?: AdventureBoardComposition;
  sourceHash?: string;
  compositionDefect?: string;
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
  model: "gpt-5.6";
};

export function assignBaselineBuilderModels(
  _assignmentFingerprint: string,
  activities: Array<Pick<MathPlannedActivity, "id">>,
): BaselineBuilderAssignment[] {
  return activities.map(activity => ({nodeId:activity.id,provider:"openai",model:"gpt-5.6"}));
}

function predictionEligibility(prediction: Record<string, unknown>): Pick<AcademicPrediction, "eligibility"> {
  if (prediction.eligibility === undefined) return {};
  const value = object(prediction.eligibility);
  const sources = value && stringArray(value.sources, "prediction_eligibility_sources");
  if (!value || !sources?.length || sources.some(source => !["independent_probe", "graded_work", "delayed_reassessment"].includes(source))
    || typeof value.maxDelayDays !== "number" || !Number.isFinite(value.maxDelayDays) || value.maxDelayDays <= 0) {
    throw new Error("prediction_eligibility_invalid");
  }
  return { eligibility: { sources: sources as NonNullable<AcademicPrediction["eligibility"]>["sources"], maxDelayDays: value.maxDelayDays } };
}

const schemaPredictionEligibility = { type: "object", additionalProperties: false, required: ["sources", "maxDelayDays"], properties: {
  sources: { type: "array", minItems: 1, items: { enum: ["independent_probe", "graded_work", "delayed_reassessment"] } },
  maxDelayDays: { type: "number", exclusiveMinimum: 0 },
} };

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
    items: { type: "array", minItems: 1, items: schemaObject({ id: schemaString, prompt: schemaString, lineage: schemaObject({ sourceEvidenceIds: { type: "array", minItems: 1, items: schemaString }, exposure: { enum: ["unseen", "taught", "practiced"] }, measurementRole: { enum: ["instruction", "practice", "fresh_checkpoint"] } }), response: schemaItemResponse }) }, acceptanceSteps: schemaStrings, creatorPrompt: schemaString, designPrediction: schemaString,
    academicPrediction: schemaObject({ constructId: schemaString, context: schemaString, horizon: schemaString, eligibility: schemaPredictionEligibility, expectedMetric: schemaObject({ key: schemaString, min: { type: "number" }, max: { type: "number" } }), predictedErrorPatterns: schemaStrings, confidence: { type: "number" }, evidenceIds: schemaStrings, intervention: schemaString, evidenceLimit: { const: "practice_only" } }),
    preserve: schemaStrings, change: schemaStrings, explore: schemaStrings, avoid: schemaStrings, measurementKeys: schemaStrings }) },
  quest: schemaObject({ title: { const: "Quest" }, locked: { const: true }, teaser: schemaString, artworkPrompt: schemaString }),
  boss: schemaObject({ title: { const: "Boss" }, locked: { const: true }, teaser: schemaString, artworkPrompt: schemaString }),
};

export const MATH_ITEMS_SCHEMA = directMathPlannerProperties.activities.items.properties.items;

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
  journey: ADVENTURE_JOURNEY_TOOL_SCHEMA,
  activities: {
    type: "array",
    minItems: 1,
    items: schemaObject({
      id: schemaString,
      purpose: { enum: ["baseline", "bonus"] },
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
            measurementRole: { enum: ["instruction", "practice", "fresh_checkpoint"] },
          }),
          response: schemaItemResponse,
        }),
      },
      academicPrediction: schemaObject({
        constructId: schemaString,
        context: schemaString,
        horizon: schemaString,
        eligibility: schemaPredictionEligibility,
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
        academicCompatibility: schemaString,
        predictedLearningValue: schemaString,
        engagementHypothesis: schemaString,
        reliabilityEvidence: schemaString,
        explorationRationale: schemaString,
        costRationale: schemaString,
        evidenceIds: schemaStrings,
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
  boardDefinition?: AdventureBoardDefinition;
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
      childFacingActionCue?: string;
      previewNodeId?: string;
      engagementVariable: string;
      nodeIds: string[];
    }>;
  };
  agencyExperiment?: AgencyExperiment;
  activities: DirectActivity[];
  bonusActivity?: DirectActivity;
};

export type DirectArtifact = {
  childId: string;
  homeworkId: string;
  nodeId: string;
  title: string;
  htmlPath: string;
  artworkUrl: string;
  /** Dedicated circular-safe board art. Never a shrunken activity screenshot. */
  thumbnailUrl?: string;
  creatorPrompt: string;
  promptHash: string;
  plannerModel: string;
  creatorModel: string;
  architectModel?: string;
  builderProvider?: "anthropic" | "openai";
  builderModel?: string;
  creatorContractVersion?: number;
  creatorTestPath?: string;
  creatorTestHash?: string;
  academicContractHash?: string;
  designArtifactHash?: string;
  htmlHash?: string;
  externalLibraryUrls?: string[];
  itemIds?: string[];
  spellingItemBindings?: Array<{ itemId: string; word: string }>;
  generationElapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

export function preserveDirectArtifactGenerationMetrics(
  generated: (Pick<GeneratedActivityHtml, "elapsedMs" | "inputTokens" | "outputTokens"> & { html?: string }) | undefined,
  existing: Pick<DirectArtifact, "generationElapsedMs" | "inputTokens" | "outputTokens">,
): Required<Pick<DirectArtifact, "generationElapsedMs" | "inputTokens" | "outputTokens">> {
  return generated
    ? {
        generationElapsedMs: generated.elapsedMs,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
      }
    : {
        generationElapsedMs: existing.generationElapsedMs ?? 0,
        inputTokens: existing.inputTokens ?? 0,
        outputTokens: existing.outputTokens ?? 0,
      };
}

export type DirectGenerationStats = {
  generatedNodeIds: string[];
  reusedNodeIds: string[];
  generatedImages: number;
  reusedImages: number;
  bonusDeferred: boolean;
};

export type DirectArtworkBundle = {
  backgroundUrl: string;
  thumbnailUrls: Record<string, string>;
  generatedImages: number;
  reusedImages: number;
};

export const MATH_BROWSER_VERIFIER_VERSION = 17;

export const TARGETED_COMPANION_RUNTIME_CONTRACT = `Represent currentChallenge as {id,prompt,mode,measurementRole,readAloudRequested,readAloudCount,companionSupportTrigger}. For each instruction or practice item, its first answer-hidden state must set readAloudRequested:true, readAloudCount:1, and companionSupportTrigger:"guided_prompt" so Elli can give one brief contextual introduction. Do this once per item, never after an answer. A fresh_checkpoint must not summon Elli automatically. When the child activates a visible Read it to me or Explain control on any item, increment readAloudCount and resend that same answer-hidden state with readAloudRequested:true and companionSupportTrigger:"child_request". Elli owns spoken teaching; do not narrate inside the activity.`;

export type DirectPlaywrightReport = {
  passed: boolean;
  failures: string[];
  screenshots: string[];
  captures?: JourneyCapture[];
  verification?: {
    runtime: boolean;
    scoring: boolean;
    contracts: boolean;
  };
  creatorTests?: {
    passed: boolean;
    manifestHash: string;
    viewports: string[];
    failures: string[];
  };
};

export function hasReadyDirectMathExperience(childId: string, rootDir = process.cwd()): boolean {
  const directPath = path.join(resolveChildContextDir(childId, { rootDir }), "homework", "direct_experience_plan.json");
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

export function assertConceptId(conceptId: string): string {
  const trimmed = conceptId.trim();
  if (!trimmed) throw new Error("direct_plan_invalid_concept_id");
  return trimmed;
}

export function parseAssignmentConcept(value: unknown): AssignmentConcept {
  const record = object(value);
  if (!record) throw new Error("direct_plan_missing_concept");
  return {
    conceptId: assertConceptId(requiredString(record, "conceptId")),
    name: requiredString(record, "name"),
    statement: requiredString(record, "statement"),
    instanceScope: requiredString(record, "instanceScope"),
    prerequisites: stringArray(record.prerequisites, "concept_prerequisites"),
    assumptions: stringArray(record.assumptions, "concept_assumptions"),
  };
}

export function parseDirectItem(rawItem: unknown): DirectItem {
  const item = object(rawItem);
  const lineage = object(item?.lineage);
  const response = object(item?.response);
  if (!item || !lineage) throw new Error("direct_plan_invalid_item_lineage");
  if (!response) throw new Error("direct_plan_invalid_item_response");
  const sourceEvidenceIds = stringArray(lineage.sourceEvidenceIds, "item_source_evidence_ids");
  if (sourceEvidenceIds.length === 0) throw new Error("direct_plan_invalid_item_lineage");
  const exposure = requiredString(lineage, "exposure");
  if (!["unseen", "taught", "practiced"].includes(exposure)) throw new Error("direct_plan_invalid_item_exposure");
  const measurementRole = typeof lineage.measurementRole === "string" && lineage.measurementRole.trim()
    ? lineage.measurementRole.trim()
    : "practice";
  if (!["instruction", "practice", "fresh_checkpoint"].includes(measurementRole)) throw new Error("direct_plan_invalid_measurement_role");
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
    if (new Set(options.map(option => option.id)).size !== options.length) throw new Error("direct_plan_duplicate_option_id");
    parsedResponse = { mode, options };
  } else if (mode === "numeric") {
    parsedResponse = { mode, expected: requiredNumber(response, "expected"), ...(typeof response.unit === "string" ? { unit: response.unit } : {}) };
  } else if (mode === "construction") {
    const expectedState = object(response.expectedState);
    if (!expectedState || Object.keys(expectedState).length === 0 || Object.values(expectedState).some(value => !["string", "number", "boolean"].includes(typeof value))) throw new Error("direct_plan_invalid_construction_state");
    parsedResponse = {
      mode,
      expectedState: expectedState as Record<string, string | number | boolean>,
      successDescription: requiredString(response, "successDescription"),
    };
  } else if (mode === "explanation") {
    const rubric = stringArray(response.rubric, "explanation_rubric");
    if (!rubric.length) throw new Error("direct_plan_invalid_explanation_rubric");
    parsedResponse = { mode, rubric };
  } else {
    throw new Error(`direct_plan_invalid_response_mode:${mode}`);
  }
  const id = requiredString(item, "id", "item_id");
  const prompt = requiredString(item, "prompt");
  const longHandOnTwelve = /\blong hand\s+(?:is\s+)?(?:on|points?\s+to)\s+(?:the\s+)?12\b/i.test(prompt);
  const shortHandPastHour = /\bshort hand\s+(?:is\s+)?(?:just\s+)?past\b/i.test(prompt);
  const expectedMinutes = parsedResponse.mode === "construction"
    ? Number(parsedResponse.expectedState.minutes)
    : parsedResponse.mode === "numeric"
      ? parsedResponse.unit?.toLowerCase().includes("minute")
        ? parsedResponse.expected
        : parsedResponse.expected % 100
      : parsedResponse.mode === "selection"
        ? Number(parsedResponse.options.find(option => option.correct)?.label.match(/:(\d{1,2})$/)?.[1])
        : Number.NaN;
  if (longHandOnTwelve && shortHandPastHour && expectedMinutes === 0) {
    throw new Error(`math_item_clock_state_inconsistent:${id}:minute_hand_12_requires_hour_hand_on_hour`);
  }
  return {
    id,
    prompt,
    lineage: {
      sourceEvidenceIds,
      exposure: exposure as DirectItem["lineage"]["exposure"],
      measurementRole: measurementRole as DirectItem["lineage"]["measurementRole"],
    },
    response: parsedResponse,
  };
}

export function parseMathLearningProgram(value: unknown): MathLearningProgram {
  const root = object(value);
  if (!root) throw new Error("math_learning_program_must_be_object");
  const conceptRecord = object(root.concept);
  if (!conceptRecord) throw new Error("math_learning_program_missing_concept");
  const concept = {
    conceptId: assertConceptId(requiredString(conceptRecord, "conceptId")),
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
  const activityIds=(Array.isArray(root.activities)?root.activities:[]).filter((a:any)=>a.purpose!=='bonus').map((a:any)=>a.id);
  const boardDefinition=root.boardDefinition?requireBoardDefinition(root.boardDefinition,activityIds):undefined;
  const parsedJourney=root.journey?adventureJourneySchema.safeParse(root.journey):undefined;
  if(parsedJourney && !parsedJourney.success)throw new Error(`board_definition_invalid:${JSON.stringify(parsedJourney.error.issues)}`);
  const journey=parsedJourney?.success?parsedJourney.data:boardDefinition?journeyFromBoardDefinition(boardDefinition):undefined;
  if(!journey)throw new Error("board_definition_missing");
  if(root.journey && boardDefinition && !isDeepStrictEqual(journey,journeyFromBoardDefinition(boardDefinition)))throw new Error("planner_journey_definition_mismatch");
  const issues=validateBoardDefinition(journey,activityIds);
  if(issues.length)throw new Error(`board_definition_invalid:${JSON.stringify(issues)}`);
  // Lossless compatibility view; this is not independently authored navigation.
  const routes=journeyExecutions(journey).map(path=>({id:path.id,academicRationale:journey.rationale,nodeIds:path.activityNodeIds}));
  const fork={hypothesis:journey.rationale,heldConstant:[]};
  const parsedActivities = (Array.isArray(root.activities) ? root.activities : []).map((raw): MathPlannedActivity => {
    const activity = object(raw);
    const boundary = object(activity?.difficultyBoundary);
    const prediction = object(activity?.academicPrediction);
    const metric = object(prediction?.expectedMetric);
    const catalogDecision = object(activity?.catalogDecision);
    if (!activity || !boundary || !prediction || !metric || !catalogDecision) throw new Error("math_learning_program_invalid_activity");
    const action = requiredString(catalogDecision, "action");
    if (!["reuse", "revise", "generate_new", "retire"].includes(action)) throw new Error("math_learning_program_invalid_catalog_action");
    const rawItems = Array.isArray(activity.items) ? activity.items : [];
    const explicitRoleCount = rawItems.filter((rawItem) => {
      const role = object(object(rawItem)?.lineage)?.measurementRole;
      return typeof role === "string" && Boolean(role.trim());
    }).length;
    if (explicitRoleCount > 0 && explicitRoleCount !== rawItems.length) {
      throw new Error(`math_learning_program_activity_mixed_measurement_roles:${requiredString(activity, "id")}`);
    }
    const items = rawItems.map(parseDirectItem);
    if (explicitRoleCount > 0 && !items.some((item) => item.lineage.measurementRole === "fresh_checkpoint")) {
      throw new Error(`math_learning_program_activity_requires_fresh_checkpoint:${requiredString(activity, "id")}`);
    }
    return {
      purpose: activity.purpose === "bonus" ? "bonus" : "baseline",
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
      items,
      academicPrediction: {
        constructId: assertConceptId(requiredString(prediction, "constructId")),
        context: requiredString(prediction, "context"),
        horizon: requiredString(prediction, "horizon"),
        ...predictionEligibility(prediction),
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
        ...(typeof catalogDecision.academicCompatibility === "string" ? { academicCompatibility: catalogDecision.academicCompatibility } : {}),
        ...(typeof catalogDecision.predictedLearningValue === "string" ? { predictedLearningValue: catalogDecision.predictedLearningValue } : {}),
        ...(typeof catalogDecision.engagementHypothesis === "string" ? { engagementHypothesis: catalogDecision.engagementHypothesis } : {}),
        ...(typeof catalogDecision.reliabilityEvidence === "string" ? { reliabilityEvidence: catalogDecision.reliabilityEvidence } : {}),
        ...(typeof catalogDecision.explorationRationale === "string" ? { explorationRationale: catalogDecision.explorationRationale } : {}),
        ...(typeof catalogDecision.costRationale === "string" ? { costRationale: catalogDecision.costRationale } : {}),
        ...(Array.isArray(catalogDecision.evidenceIds) ? { evidenceIds: stringArray(catalogDecision.evidenceIds, "catalog_evidence_ids") } : {}),
      },
    };
  });
  const activities = parsedActivities.filter((activity) => activity.purpose !== "bonus");
  if (activities.length === 0 && parsedActivities.length > 0) {
    throw new Error("math_learning_program_requires_baseline_activities");
  }
  if (activities.length === 0) throw new Error("math_learning_program_requires_activities");
  const bonusActivities = parsedActivities.filter((activity) => activity.purpose === "bonus");
  if (bonusActivities.length > 1) throw new Error("math_learning_program_requires_at_most_one_bonus");
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
    ...(root.journey ? {domain:"math" as const,journey} : {}),
    ...(boardDefinition ? {boardDefinition} : {}),
    activities,
    ...(bonusActivities[0] ? { bonusActivity: bonusActivities[0] } : {}),
  };
}

export function parseSavedDirectMathPlannerResponse(
  value: unknown,
  maxTokens = Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? 32000),
): MathLearningProgram {
  const response = object(value);
  const content = Array.isArray(response?.content) ? response.content : [];
  const toolUse = content.map(object).find((block) =>
    block?.type === "tool_use" && block.name === "create_math_learning_program");
  if (!toolUse) throw new Error("direct_planner_tool_output_missing");
  if (response?.stopReason === "max_tokens" || response?.stop_reason === "max_tokens") {
    throw new Error(`direct_planner_plan_truncated:raise planner max tokens above ${maxTokens}`);
  }
  return parseMathLearningProgram(toolUse.input);
}

/** The existing Planner corrects executable geometry before its program is frozen. */
export async function verifyMathPlannerCanvas(program: MathLearningProgram, responseFile: string): Promise<MathLearningProgram> {
  if(program.journey && !program.boardDefinition)return program;
  await verifyAuthoredBoardCanvas({definition:requireBoardDefinition(program.boardDefinition,program.activities.map(activity=>activity.id)),rootDir:process.cwd(),directory:path.join(path.dirname(responseFile),'canvas-verification')});
  return program;
}

export function correctableMathPlannerTruthError(error: unknown): error is Error {
  return error instanceof Error && ["math_item_clock_state_inconsistent:", "board_definition_", "board_canvas_invalid:"].some(prefix => error.message.startsWith(prefix));
}

export async function correctSavedDirectMathPlannerResponse(input: {
  savedResponse: unknown;
  validationError: string;
  client?: Anthropic;
  model?: string;
  maxTokens?: number;
  correctionResponseFile?: string;
}): Promise<MathLearningProgram> {
  if (input.correctionResponseFile && fs.existsSync(input.correctionResponseFile)) {
    return verifyMathPlannerCanvas(parseSavedDirectMathPlannerResponse(JSON.parse(fs.readFileSync(input.correctionResponseFile, "utf8")), input.maxTokens),input.correctionResponseFile);
  }
  const saved = object(input.savedResponse);
  const toolUse = (Array.isArray(saved?.content) ? saved.content : []).map(object)
    .find(block => block?.type === "tool_use" && block.name === "create_math_learning_program");
  if (!toolUse) throw new Error("direct_planner_tool_output_missing");
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5";
  const maxTokens = input.maxTokens ?? Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? 32000);
  const request = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: `Your prior math learning program failed an executable contract check. Correct only the cited invalid reference, missing journey field, overlapping or clipped composition, or factual contradiction and directly dependent fields. Preserve every child-evidence ID, item ID, measurement role, construct, route, activity count, prediction, theory, and difficulty decision. Do not add a new intervention or reinterpret evidence. Return the complete corrected program through the required tool.\n\nVALIDATION ERROR:\n${input.validationError}\n\nPRIOR PROGRAM:\n${JSON.stringify(toolUse.input, null, 2)}` }],
    tools: [{
      name: "create_math_learning_program",
      description: "Return the corrected academic-only math learning program.",
      input_schema: MATH_LEARNING_PROGRAM_TOOL_SCHEMA,
    }],
    tool_choice: { type: "tool", name: "create_math_learning_program" },
  } satisfies Parameters<typeof client.messages.stream>[0];
  const execute = () => client.messages.stream(request, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000) }).finalMessage();
  const response = input.correctionResponseFile
    ? await runMathProviderStage({draftDir:path.dirname(input.correctionResponseFile),stage:"targeted-planner-correction",model:request.model,request,execute})
    : await execute();
  const savedCorrection = {
    ...response,
    model,
    stopReason: response.stop_reason,
    usage: response.usage,
    content: response.content,
  };
  if (input.correctionResponseFile) {
    fs.mkdirSync(path.dirname(input.correctionResponseFile), { recursive: true });
    fs.writeFileSync(input.correctionResponseFile, `${JSON.stringify(savedCorrection, null, 2)}\n`, "utf8");
  }
  const program=parseSavedDirectMathPlannerResponse(savedCorrection, maxTokens);
  return input.correctionResponseFile ? verifyMathPlannerCanvas(program,input.correctionResponseFile) : program;
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
      ...(typeof route.childFacingActionCue === "string" && route.childFacingActionCue.trim()
        ? { childFacingActionCue: route.childFacingActionCue.trim() }
        : {}),
      ...(typeof route.previewNodeId === "string" && route.previewNodeId.trim()
        ? { previewNodeId: route.previewNodeId.trim() }
        : {}),
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
    const rawItems = Array.isArray(activity.items) ? activity.items : [];
    const explicitRoleCount = rawItems.filter((rawItem) => {
      const role = object(object(rawItem)?.lineage)?.measurementRole;
      return typeof role === "string" && Boolean(role.trim());
    }).length;
    if (explicitRoleCount > 0 && explicitRoleCount !== rawItems.length) {
      throw new Error("direct_plan_activity_mixed_measurement_roles");
    }
    const items = rawItems.map(parseDirectItem);
    if (items.length === 0) throw new Error("direct_plan_activity_requires_items");
    if (explicitRoleCount > 0 && !items.some((item) => item.lineage.measurementRole === "fresh_checkpoint")) {
      throw new Error(`direct_plan_activity_requires_fresh_checkpoint:${requiredString(activity, "id", "activity_id")}`);
    }
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
        constructId: assertConceptId(requiredString(academicPrediction, "constructId")),
        context: requiredString(academicPrediction, "context"),
        horizon: requiredString(academicPrediction, "horizon"),
        ...predictionEligibility(academicPrediction),
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
  const boardWorld = object(root.boardWorld);
  if (!boardWorld) throw new Error("direct_plan_missing_board_world");
  const boardTitle = requiredString(boardWorld, "title");
  return {
    ...(root.boardDefinition ? {boardDefinition:requireBoardDefinition(root.boardDefinition,activities.map(activity=>activity.id))}:{}),
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
        childFacingActionCue: requiredString(route, "childFacingActionCue"),
        previewNodeId: requiredString(route, "previewNodeId"),
        engagementVariable: requiredString(route, "engagementVariable"),
      };
    }),
  };
}

export function mathDesignHasRoutePresentationBindings(
  value: Pick<MathDesignPacket, "boardCreativeSpine"> | MathDesignCheckpoint,
): boolean {
  const directions = value.boardCreativeSpine?.routeDirections;
  return Array.isArray(directions) && directions.length > 0 && directions.every((route) =>
    typeof route.childFacingActionCue === "string" && route.childFacingActionCue.trim().length > 0
    && typeof route.previewNodeId === "string" && route.previewNodeId.trim().length > 0);
}

export type NativeLearningProgram = {domain:"spelling";planId:string;journey:AdventureJourneyDefinition;plan:ActiveSessionPlan;planningResult?:{output:AssignmentPlannerOutput;telemetry:AssignmentPlannerTelemetry;receivedAt?:string}};
export type NativePlannedProgram=NativeLearningProgram & {planningResult:NonNullable<NativeLearningProgram["planningResult"]>};
export type LearningProgram=MathLearningProgram|NativeLearningProgram;
type LearningCreatorInput = {
  childId: string;
  program: MathLearningProgram | NativeLearningProgram;
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
  retryUncertain?: boolean;
};
export function askLearningExperienceDesigner(input:LearningCreatorInput & {program:NativeLearningProgram}):Promise<{packet:{composition:AdventureBoardComposition};plan:ActiveSessionPlan}>;
export function askLearningExperienceDesigner(input:LearningCreatorInput & {program:MathLearningProgram}):Promise<{packet:MathDesignPacket;plan:DirectLearningExperiencePlan}>;
export async function askLearningExperienceDesigner(input:LearningCreatorInput):Promise<{packet:MathDesignPacket|{composition:AdventureBoardComposition};plan:DirectLearningExperiencePlan|ActiveSessionPlan}> {
  const native=input.program.domain==="spelling" ? input.program : undefined;
  const program=input.program as MathLearningProgram;
  const journey=input.program.journey;
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5";
  const programActivities = [
    ...(native ? [] : program.activities),
    ...(!native && program.bonusActivity ? [program.bonusActivity] : []),
  ];
  const { bonusActivity: _bonusActivity, ...programWithoutBonusDuplicate } = program;
  const contracts = programActivities.map((activity) => ({
    ...activity,
    academicContractHash: mathAcademicContractHash(activity),
  }));
  const toolName = native ? "create_learning_design_packet" : "create_math_design_packet";
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
      minItems: native ? 0 : program.fork.routes.length,
      maxItems: native ? 0 : program.fork.routes.length,
      items: schemaObject({
        routeId: schemaString,
        label: schemaString,
        promise: schemaString,
        childFacingActionCue: schemaString,
        previewNodeId: schemaString,
        engagementVariable: schemaString,
      }, ["routeId", "label", "promise", "childFacingActionCue", "previewNodeId", "engagementVariable"]),
    },
    questTeaser: schemaString,
    questArtworkDirection: schemaString,
    bossTeaser: schemaString,
    bossArtworkDirection: schemaString,
  }, ["title", "narrative", "openingChoice", "backgroundDirection", "routeDirections"]);
  const savedCheckpoint = input.checkpointFile && fs.existsSync(input.checkpointFile)
    ? JSON.parse(fs.readFileSync(input.checkpointFile, "utf8")) as MathDesignCheckpoint : undefined;
  let checkpoint = input.checkpoint ?? savedCheckpoint ?? createMathDesignCheckpoint({
    planId: program.planId,
    expectedNodeIds: programActivities.map((activity) => activity.id),
    model,
  });
  if (checkpoint.planId !== program.planId) throw new Error("math_design_checkpoint_identity_mismatch");
  if(journey){
    const sourceHash=crypto.createHash("sha256").update(JSON.stringify({childId:input.childId,domain:native?"spelling":"math",program:input.program})).digest("hex");
    if(checkpoint.sourceHash && checkpoint.sourceHash!==sourceHash)throw new Error("learning_design_checkpoint_program_mismatch");
    if(!checkpoint.sourceHash && (checkpoint.composition || checkpoint.attempts.length))throw new Error("learning_design_checkpoint_program_mismatch");
    checkpoint={...checkpoint,sourceHash};
  }
  for (let attemptIndex = 0;
    checkpoint.attempts.length < 2 && attemptIndex < 2 && (checkpoint.missingNodeIds.length > 0 || (!native && !mathDesignHasRoutePresentationBindings(checkpoint)) || (journey && !checkpoint.composition));
    attemptIndex += 1) {
    const requestedNodeIds = [...checkpoint.missingNodeIds];
    const isContinuation = Boolean(checkpoint.boardCreativeSpine);
    const presentationOnly = requestedNodeIds.length === 0 && isContinuation;
    const prompt = native ? `You are Sunny's existing Experience Creator. Realize this immutable spelling journey using its native catalog instruments. Return only composition and rationale; never change educational labels, activities, paths, choices, hypotheses or evidence. Do not generate replacement activities. Preserve the illustrated Grok world, vivid inviting portals, animated dashed or glow paths, left-to-right landscape progression, and an independently composed portrait. Available artwork: /generated/adventure-board-demo/silent-letter-world.jpeg. ${BOARD_CANVAS_AUTHORING_CONSTRAINTS}\nChild chart facts: ${JSON.stringify(factualModelContext(input.childContext))}\nImmutable journey and activity configurations: ${JSON.stringify(native)}\nPrior outcomes: ${JSON.stringify(factualModelContext(input.priorOutcomes))}\n${checkpoint.compositionDefect ? `Bounded visual correction ${checkpoint.attempts.length+1} of 2. Fix only this composition defect: ${checkpoint.compositionDefect}` : ""}` : `You are Sunny's Experience Creator. Design one coherent child-facing math chapter and rich design artifacts for the requested prescribed nodes.

The Math Planner's educational program is immutable. You cannot change activity count or IDs, routes, responsibilities, academic targets, difficulty boundaries, item content, response contracts, predictions, measurement keys, or catalog decisions.

You own the complete creative design: board world, route identities, titles, experience form, interaction, mission, stakes, consequences, recovery, progression, payoff, replay variation, visual craft, motion, sound, and useful third-party libraries. Games are optional. Make the board one coherent chapter without forcing identical mechanics or themes.

Creative objective: design something this specific child can understand immediately and may choose to continue playing. Mathematics must visibly change the world, mission, progress, or payoff. You independently choose mechanics, stakes, consequences, recovery, pacing, and payoff. Do not default to consequence-free play merely because evidence is uncertain; choose what best fits the academic responsibility and factual child evidence. Treat profile observations as hypotheses, and do not repeatedly literalize one interest.

For every route, author a short childFacingActionCue that names what the child will actually do, and previewNodeId naming the route node whose opening view demonstrates that action. The cue is not an explanation paragraph. The preview node must belong to that route.

${presentationOnly
    ? `This is one presentation-only revision. Return zero artifacts. Copy every frozen board-spine field and route field exactly, adding only childFacingActionCue and previewNodeId to each route direction.\nFrozen board spine:\n${JSON.stringify(checkpoint.boardCreativeSpine, null, 2)}\nFrozen route membership:\n${JSON.stringify(program.fork.routes, null, 2)}\nCompleted artifact summaries:\n${JSON.stringify(checkpoint.artifacts.map((artifact) => ({ nodeId: artifact.nodeId, title: artifact.title, firstAction: artifact.firstAction, coreInteraction: artifact.coreInteraction })), null, 2)}`
    : `Return design artifacts only for these node IDs: ${requestedNodeIds.join(", ")}. Copy each supplied academicContractHash exactly. Do not write HTML.\n${isContinuation ? `This is a missing-content continuation, not a redesign. Preserve the frozen board spine and completed sibling designs. Return only the missing artifacts.\nFrozen board spine:\n${JSON.stringify(checkpoint.boardCreativeSpine, null, 2)}\nCompleted sibling summaries:\n${JSON.stringify(checkpoint.artifacts.map((artifact) => ({ nodeId: artifact.nodeId, title: artifact.title, coreInteraction: artifact.coreInteraction, visualDirection: artifact.visualDirection })), null, 2)}` : "Also return one boardCreativeSpine for the complete chapter."}`}

Child: ${input.childId}

Factual child context:
${JSON.stringify(factualModelContext(input.childContext), null, 2)}

Factual prior outcomes and catalog history:
${JSON.stringify(factualModelContext(input.priorOutcomes), null, 2)}

${journey ? `Author composition for the immutable journey: ${JSON.stringify(journey)}. Preserve labels and bindings. Use illustrated Grok artwork, animated paths and independently composed portrait. Available artwork: /generated/adventure-board-demo/silent-letter-world.jpeg. ${BOARD_CANVAS_AUTHORING_CONSTRAINTS}${checkpoint.compositionDefect ? ` Fix only the diagnosed composition defect: ${checkpoint.compositionDefect}` : ""}\n\n` : ""}Immutable MathLearningProgram:
${JSON.stringify({ ...programWithoutBonusDuplicate, activities: contracts }, null, 2)}`;
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
          additionalProperties: !native,
          required: native ? ["composition","rationale"] : [...(presentationOnly || !isContinuation ? ["boardCreativeSpine", "artifacts", "rationale"] : ["artifacts", "rationale"]),...(journey && !checkpoint.composition ? ["composition"] : [])],
          properties: {
            ...(journey ? {composition:z.toJSONSchema(adventureCompositionSchema,{io:"input"})} : {}),
            ...(!native ? {boardCreativeSpine: boardCreativeSpineSchema,
            artifacts: {
              type: "array",
              minItems: requestedNodeIds.length,
              maxItems: requestedNodeIds.length,
              items: designArtifactSchema,
            },
            } : {}),
            rationale: schemaString,
          },
        },
      }],
      tool_choice: { type: "tool", name: toolName },
    } as never;
    let response: Awaited<ReturnType<ReturnType<typeof client.messages.stream>["finalMessage"]>> | undefined;
    for (let transportAttempt = 1; transportAttempt <= 2; transportAttempt += 1) {
      try {
        const execute = () => client.messages.stream(request, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000), maxRetries: 0 }).finalMessage();
        response = input.checkpointFile
          ? await runMathProviderStage({draftDir:path.dirname(input.checkpointFile),stage:`targeted-design-${checkpoint.attempts.length+1}`,model,request,execute,retryUncertain:input.retryUncertain,beforeRequest:()=>{
            if(!input.client&&!process.env.ANTHROPIC_API_KEY?.trim())throw new Error("preflight_missing:ANTHROPIC_API_KEY");
          }})
          : await execute();
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
        if (input.checkpointFile || !isRetryableProviderTransportError(error) || transportAttempt === 2) throw error;
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
    let composition=checkpoint.composition;
    if(journey && !composition){
      try {
        composition=adventureCompositionSchema.parse(root.composition);
        const definition=assembleAdventureBoardDefinition(journey,composition);
        await verifyAuthoredBoardCanvas({definition,rootDir:process.cwd(),directory:path.join(input.rawResponseDir??path.dirname(input.checkpointFile??path.join(os.tmpdir(),"sunny-design.json")),"creator-canvas")});
      }
      catch(error){
        const authoringDefect=error instanceof z.ZodError || (error instanceof Error && ["board_composition_identity_invalid","board_canvas_invalid:"].some(prefix=>error.message.startsWith(prefix)));
        if(!authoringDefect)throw error;
        composition=undefined;checkpoint={...checkpoint,compositionDefect:error instanceof Error?error.message:String(error)};
        console.warn(` 🎮 [experience-creator] [composition] [invalid] ${checkpoint.compositionDefect}`);
      }
    }
    let boardCreativeSpine = checkpoint.boardCreativeSpine;
    if (presentationOnly && boardCreativeSpine && root.boardCreativeSpine) {
      const revision = parseBoardCreativeSpine(root.boardCreativeSpine);
      const revisedByRoute = new Map(revision.routeDirections.map((route) => [route.routeId, route]));
      boardCreativeSpine = {
        ...boardCreativeSpine,
        routeDirections: boardCreativeSpine.routeDirections.map((route) => {
          const revised = revisedByRoute.get(route.routeId);
          if (!revised) throw new Error(`math_design_route_missing:${route.routeId}`);
          return {
            ...route,
            childFacingActionCue: revised.childFacingActionCue,
            previewNodeId: revised.previewNodeId,
          };
        }),
      };
    } else if (!boardCreativeSpine && root.boardCreativeSpine) {
      boardCreativeSpine = parseBoardCreativeSpine(root.boardCreativeSpine);
    }
    const received: ExperienceDesignArtifactV1[] = [];
    for (const raw of Array.isArray(root.artifacts) ? root.artifacts : []) {
      try {
        const rawRecord = object(raw);
        const nodeId = rawRecord ? requiredString(rawRecord, "nodeId") : "";
        if (!requestedNodeIds.includes(nodeId)) continue;
        const activity = programActivities.find((candidate) => candidate.id === nodeId);
        if (!activity || received.some((artifact) => artifact.nodeId === nodeId)) continue;
        received.push(parseExperienceDesignArtifact(raw, activity));
      } catch (error) {
        console.warn(` 🎮 [experience-creator] [artifact] [invalid] ${error instanceof Error?error.message:String(error)}`);
        // Invalid siblings remain missing and are named in the bounded continuation.
      }
    }
    checkpoint = mergeMathDesignCheckpoint(checkpoint, {
      artifacts: received,
      programActivities,
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
    if(composition)checkpoint={...checkpoint,composition};
    if (input.checkpointFile) {
      fs.mkdirSync(path.dirname(input.checkpointFile), { recursive: true });
      fs.writeFileSync(input.checkpointFile+".tmp", `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
      fs.renameSync(input.checkpointFile+".tmp",input.checkpointFile);
    }
  }
  if(native){
    if(!checkpoint.composition)throw new Error("learning_design_provider_contract_failed:composition_missing");
    const boardDefinition=assembleAdventureBoardDefinition(native.journey,checkpoint.composition);
    console.log(` 🎮 [experience-creator] [composition] [saved] plan=${native.planId}`);
    return {packet:{composition:checkpoint.composition},plan:{...native.plan,journey:native.journey,boardDefinition}};
  }
  if(journey && !checkpoint.composition)throw new Error("learning_design_provider_contract_failed:composition_missing");
  if (!checkpoint.boardCreativeSpine || checkpoint.missingNodeIds.length > 0 || !mathDesignHasRoutePresentationBindings(checkpoint)) {
    throw new Error(`math_design_provider_contract_failed:missing_nodes=${checkpoint.missingNodeIds.join(",") || "board-spine"}:checkpoint=${input.checkpointFile ?? "memory"}`);
  }
  const artifactByNode = new Map(checkpoint.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const routeDirections = checkpoint.boardCreativeSpine.routeDirections;
  const designedRouteIds = new Set(routeDirections.map((route) => route.routeId));
  if (program.fork.routes.some((route) => !designedRouteIds.has(route.id))) {
    throw new Error(`math_design_provider_contract_failed:missing_route_direction:checkpoint=${input.checkpointFile ?? "memory"}`);
  }
  for (const route of program.fork.routes) {
    const direction = routeDirections.find((candidate) => candidate.routeId === route.id)!;
    if (!route.nodeIds.includes(direction.previewNodeId)) {
      throw new Error(`math_design_route_preview_node_mismatch:${route.id}:${direction.previewNodeId}`);
    }
  }
  const packet: MathDesignPacket = {
    version: 1,
    planId: program.planId,
    boardCreativeSpine: checkpoint.boardCreativeSpine,
    artifacts: programActivities.map((activity) => artifactByNode.get(activity.id)!),
    rationale: checkpoint.rationale ?? "Completed coherent design packet.",
    model,
    createdAt: (input.now ?? new Date()).toISOString(),
    revision: input.revision ?? 0,
  };
  const routeById = new Map(routeDirections.map((route) => [route.routeId, route]));
  const plan: DirectLearningExperiencePlan = {
    planId: program.planId,
    boardDefinition: journey && checkpoint.composition ? assembleAdventureBoardDefinition(journey,checkpoint.composition) : structuredClone(program.boardDefinition),
    title: journey?.title ?? program.boardDefinition?.title ?? packet.boardCreativeSpine.title,
    contentScopeRationale: program.contentScopeRationale,
    concept: {
      ...program.concept,
      assumptions: program.assumptions.map((assumption) => assumption.claim),
    },
    academicTheory: program.academicTheory,
    profileEvidence: program.profileEvidence,
    boardWorld: {
      title: packet.boardCreativeSpine.title,
      narrative: packet.boardCreativeSpine.narrative,
      backgroundPrompt: packet.boardCreativeSpine.backgroundDirection,
    },
    learningResponsibilities: program.learningResponsibilities,
    fork: {
      question: packet.boardCreativeSpine.openingChoice,
      hypothesis: program.fork.hypothesis,
      heldConstant: program.fork.heldConstant,
      routes: program.fork.routes.map((route) => {
        const design = routeById.get(route.id);
        if (!design) throw new Error(`math_design_route_missing:${route.id}`);
        return {
          id: route.id,
          label: design.label,
          promise: design.promise,
          childFacingActionCue: design.childFacingActionCue,
          previewNodeId: design.previewNodeId,
          engagementVariable: design.engagementVariable,
          nodeIds: route.nodeIds,
        };
      }),
    },
    ...(program.agencyExperiment ? { agencyExperiment: program.agencyExperiment } : {}),
    activities: program.activities.map((activity) => {
      const design = artifactByNode.get(activity.id)!;
      const route = routeById.get(activity.routeId);
      return {
        id: activity.id,
        title: design.title,
        routeId: activity.routeId,
        responsibilityId: activity.responsibilityId,
        learningPurpose: program.learningResponsibilities.find((item) => item.id === activity.responsibilityId)!.purpose,
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
  };
  if (program.bonusActivity) {
    const activity = program.bonusActivity;
    const design = artifactByNode.get(activity.id)!;
    plan.bonusActivity = {
      id: activity.id,
      title: design.title,
      routeId: "bonus",
      responsibilityId: activity.responsibilityId,
      learningPurpose: "Optional assignment-aligned reward practice",
      academicTarget: activity.academicTarget,
      mechanic: design.coreInteraction,
      engagementVariable: "earned-companion-play",
      visualMock: {
        scene: design.visualDirection,
        layout: design.firstThreeSeconds,
        artworkPrompt: design.visualDirection,
      },
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
      academicPrediction: { ...activity.academicPrediction, evidenceLimit: "practice_only" },
      preserve: [],
      change: [],
      explore: [],
      avoid: [],
      measurementKeys: activity.measurementKeys,
      difficultyBoundary: activity.difficultyBoundary,
      catalogDecision: activity.catalogDecision,
      designArtifact: design,
    };
  }
  return { packet, plan };
}

function mathReadingAccessContext(chart: ChildChart): unknown {
  const reading = chart.learningProfile.readingProfile;
  return {
    currentReadingLevel: reading?.currentReadingLevel ?? null,
    averageReadingAccuracy: reading?.averageReadingAccuracy ?? null,
    comprehensionAccuracy: reading?.comprehensionAccuracy ?? null,
    flaggedPatterns: reading?.flaggedPatterns ?? [],
    presentationSettings: {
      fontSize: reading?.fontSize ?? null,
      lineHeight: reading?.lineHeight ?? null,
      fontFamily: reading?.fontFamily ?? null,
      wordsPerLine: reading?.wordsPerLine ?? null,
      dyslexiaMode: reading?.dyslexiaMode ?? null,
    },
    interpretation: [
      "Recorded reading observations and caregiver presentation settings; preserve their uncertainty.",
      "A presentation setting such as dyslexiaMode is not a diagnosis.",
      "Use this context to reduce avoidable reading and writing load without replacing the Planner's pedagogical judgment.",
    ],
  };
}

export function askMathExperienceDesigner(input:LearningCreatorInput & {program:MathLearningProgram}):Promise<{packet:MathDesignPacket;plan:DirectLearningExperiencePlan}> {
  return askLearningExperienceDesigner(input);
}

export function mathPlannerChartContext(chart: ChildChart): unknown {
  const economy = chart.companionCare?.plan.economy;
  return {
    identity: chart.identity,
    demographics: {
      age: chart.demographics.age,
      grade: chart.demographics.grade,
      attentionSpan: chart.demographics.attentionSpan,
      iepActive: chart.demographics.iepActive,
    },
    learningProfile: {
      sessionStats: chart.learningProfile.sessionStats,
      readingAccess: mathReadingAccessContext(chart),
    },
    engagementEvidence: engagementTheoryEvidenceContext(chart.engagementTheory),
    factBankSummary: chart.factBankSummary,
    recentDecision: chart.decisionTrace.latest,
    longitudinalLearning: chart.learningHistory,
    rewardEvidence: {
      videoCallTickets: economy?.videoCallTickets ?? [],
      bonusRewardReceipts: economy?.bonusRewardReceipts ?? [],
      purchaseCount: (economy?.purchaseReceipts ?? []).length,
      currentCoinBalance: economy?.coins ?? chart.economy?.coinBalance ?? 0,
      interpretation: "Factual reward activity only. It is not mastery or a durable preference conclusion.",
    },
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

function creatorChildContextWithoutIdentity(value: unknown): unknown {
  const factual = factualModelContext(value);
  if (!factual || typeof factual !== "object" || Array.isArray(factual)) return factual;
  const { identity: _identity, ...context } = factual as Record<string, unknown>;
  return context;
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
  const rewardEconomy = chart.companionCare?.plan.economy;

  return {
    audience: {
      displayName: chart.identity.displayName,
      age: chart.demographics.age,
      grade: chart.demographics.grade,
      attentionSpan: chart.demographics.attentionSpan,
    },
    readingAccess: mathReadingAccessContext(chart),
    explicitPreferences: favoriteGames.length > 0 ? { favoriteGames } : null,
    engagementObservations: {
      howToRead: [
        "These are factual observations with uncertainty, not design instructions or durable preference conclusions.",
        "An unmeasured or negative dimension is not a prohibition.",
      ],
      dimensions,
      observations,
    },
    rewardObservations: {
      videoCallTickets: rewardEconomy?.videoCallTickets ?? [],
      bonusRewardReceipts: rewardEconomy?.bonusRewardReceipts ?? [],
      purchaseCount: (rewardEconomy?.purchaseReceipts ?? []).length,
      howToRead: "Factual actions with sparse evidence; do not infer a durable preference from one event.",
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

export function mathPlannerCandidateCards(chart: ChildChart): PlannerContentCandidateCard[] {
  return buildPlannerContentCandidateCards({ chart, domain: "math" });
}

type LearningPlannerInput = {
  domain?:"math"|"spelling";
  packet?:AssignmentPlanningPacket;
  childId: string;
  chart: ChildChart;
  extraction: AssignmentSourceExtraction;
  client?: Anthropic;
  model?: string;
  priorOutcomes?: unknown;
  discoveryEvidenceSummary?: unknown;
  /** Concept ids already on record for this child, so the Planner reuses instead of rephrasing. */
  priorConceptIds?: string[];
  rawResponseFile?: string;
  maxTokens?: number;
};
export function askLearningPlanner(input:LearningPlannerInput & {domain:"spelling";packet:AssignmentPlanningPacket}):Promise<NativePlannedProgram>;
export function askLearningPlanner(input:LearningPlannerInput & {domain?:"math"}):Promise<MathLearningProgram>;
export async function askLearningPlanner(input:LearningPlannerInput):Promise<MathLearningProgram|NativePlannedProgram> {
  const native=input.domain==="spelling";
  if(native && (!input.packet || input.packet.capturedHomework.contentProfile.practiceDomain!=="spelling"))throw new Error("learning_planner_captured_domain_mismatch");
  const packet=input.packet;
  const model=input.model??(native?resolveAssignmentPlannerModel():process.env.SUNNY_PLANNER_MODEL??"claude-opus-5");
  const maxTokens=input.maxTokens??Number(native?16000:process.env.SUNNY_PLANNER_MAX_TOKENS??32000);
  const started=Date.now();
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = native ? `${learningPlannerInstructions('spelling').text}
Call create_learning_program exactly once. Return domain, planId, journey, activities and planTheory directly at the tool root. Each activity carries its own measurement; do not invent a separate measurement ID or repeat the inventory in another field. spelling is the preregistered measurement prescription for academic activities and null for nonacademic rewards. It is never a measured learning claim.
${JOURNEY_AUTHORING_INSTRUCTION}
Root contains shared opening, the choice, and shared closing. Each option names a separate branch-segment path beginning AFTER that choice. Never include the enclosing choice or root path in an option segment. You choose activities, count, support, alternatives and hypotheses.
Use available native instruments through their catalog configurations. Request generated content only for a missing capability. Preserve captured words and cite the supplied observation IDs. Separate assisted practice, independent measurements and engagement. Do not claim mastery or readiness.
Homework and child-chart context:
${JSON.stringify({homework:packet!.capturedHomework,childChart:packet!.childChart,masteryContext:packet!.masteryContext,activityCatalog:packet!.activityCatalog,discoveryEvidence:packet!.discoveryEvidence})}` : `${learningPlannerInstructions('math').text}

Read the assignment, child chart, prior evidence, and prior calibration. Prescribe the smallest coherent learning program that can test your theory. Teach the concept the teacher is targeting rather than copying or lightly rewriting worksheet questions.

You own only the educational prescription:
- stable concept identity and assignment scope;
- explicit assumptions, evidence, confidence, and uncertainty;
- academic theory and preregistered predictions;
- activity count, sequence, node responsibilities, route structure, and academic comparability;
- difficulty boundaries, teaching/practice items, response contracts, and evidence requirements;
- a catalog decision for each node: reuse, revise, generate_new, or retire.

You own the journey title, portal labels, activity bindings, paths, choices and hypotheses. The existing Experience Creator owns artwork, palette and composition and implements activity worlds without changing your educational journey.

Choose educationally sufficient activity and item counts. Distribute responsibilities across the journey; do not duplicate the curriculum merely for symmetry. Optional bonus content remains outside the required chapter and cannot support mastery. Keep initial nodes practice_only. Quest and Boss are not part of this baseline program and remain locked until real evidence supports a later decision.

${JOURNEY_AUTHORING_INSTRUCTION} Activity routeId is descriptive only; navigation comes solely from journey.

Describe engagement hypotheses in the authored choice options. Use factual child-chart and historical evidence to state a separate engagement hypothesis, predicted outcome, uncertainty, falsifying evidence, and measurement keys for each route. Keep the academic purpose and difficulty comparable at the choice point. A route choice is weak engagement evidence only and never proves a preference. The later decision must consider starts, completion, abandonment, switching, replay, assistance, interaction difficulty, rating, and academic outcomes.

For every node define a difficultyBoundary with allowed concepts and representations, excluded extensions, starting support, and expected independence. Keep all item content within that boundary. Response modes may be selection, numeric, construction, or explanation.

Every assumption must have a stable assumptionId, factual evidence IDs, confidence from 0 to 1, and explicit uncertainty. Predictions concern later independent, delayed, or graded performance; engagement facts never prove academic ability.

concept.conceptId is a stable namespaced identity chosen from the assignment and prior concept history. Put assignment-specific context in instanceScope. Reuse a prior concept ID exactly when it is the same idea.

Each item contains id, prompt, lineage {sourceEvidenceIds, exposure, measurementRole}, and one response contract. Use measurementRole instruction for teaching, practice for rehearsal, and fresh_checkpoint for an unseen measurement item. Every activity must include at least one fresh_checkpoint whose answer is not exposed before commitment:
- selection: {mode, options:[{id,label,correct}]}
- numeric: {mode, expected, optional unit}
- construction: {mode, expectedState, successDescription}
- explanation: {mode, rubric}
Every responsibility, route, activity, item, assumption, and selection option has a non-empty stable ID.

Concept ids already on record for this child. Reuse one exactly if you mean the same idea; coin a new one only if this assignment is genuinely about something else:
${input.priorConceptIds?.length ? input.priorConceptIds.map((id) => `- ${id}`).join("\n") : "- none recorded"}

Assignment:
${input.extraction.fullText}

${input.discoveryEvidenceSummary ? `Factual Discovery construct summary (derived from canonical observations; use its observation IDs when citing evidence):\n${JSON.stringify(input.discoveryEvidenceSummary, null, 2)}\n` : ""}

Available reusable instruments and generated candidates, expressed as factual candidate cards (capabilities, outcomes, runtime status, uncertainty, hashes, and estimated decision costs):
${JSON.stringify(mathPlannerCandidateCards(input.chart), null, 2)}

Decision policy:
- Academic compatibility is a hard gate.
- Predicted learning value is primary; engagement evidence is secondary.
- Runtime clarity and reliability are supporting evidence.
- Uncertainty may justify bounded exploration.
- Model-call cost and latency are penalties, never reasons to use academically incompatible content.
- Ratings never override learning evidence, and one selection never becomes a preference.
- Choose reuse only when the card says reuse is eligible and its frozen academic contract is exact. Choose revise when the interaction/design is useful but the academic contract or implementation must change. Choose generate_new when no candidate is sufficient. Retire only a named candidate that should no longer be offered; still prescribe a replacement node for the responsibility.

Child chart:
${JSON.stringify(mathPlannerChartContext(input.chart), null, 2)}

  Prior factual outcomes and Planner interpretations:
${JSON.stringify(factualModelContext(input.priorOutcomes ?? []), null, 2)}`;
  const toolName = native?"create_learning_program":"create_math_learning_program";
  const plannerContent = native?[{type:"text" as const,text:prompt}]:assignmentPlannerContent(input.extraction,prompt);
  // A whole board — every activity, item, prediction and creator prompt — is a
  // long generation against a 20k token budget, and the non-streaming request
  // was timing out before it finished. Stream it, as the Creator already does.
  let request = {
    model,
    max_tokens:maxTokens,
    messages: [{ role: "user", content: plannerContent }],
    tools: [{
      name: toolName,
      description: native?"Return the semantic spelling program with inline instrument measurements.":"Return the academic-only math learning program.",
      input_schema: native?nativeLearningProgramToolJsonSchema(packet!.activityCatalog) as Anthropic.Messages.Tool.InputSchema:MATH_LEARNING_PROGRAM_TOOL_SCHEMA,
    }],
    tool_choice: { type: "tool", name: toolName },
  } satisfies Parameters<typeof client.messages.stream>[0];
  if(native && input.rawResponseFile){
    const directory=path.dirname(input.rawResponseFile),pointer=path.join(directory,'provider-receipts','targeted-planner.stage.json');
    if(fs.existsSync(pointer)){
      const {requestHash}=JSON.parse(fs.readFileSync(pointer,'utf8'));
      const receipt=JSON.parse(fs.readFileSync(path.join(directory,'provider-receipts',`${requestHash}.json`),'utf8'));
      const frozen=JSON.parse(fs.readFileSync(path.join(directory,'provider-diagnostics',`${requestHash}.attempt-${receipt.attempts?.length??1}.request.json`),'utf8')).context as typeof request;
      const facts=(candidate:typeof request)=>{
        const content=candidate.messages[0].content;
        const text=Array.isArray(content)?content.find(block=>block.type==='text')?.text:content;
        if(typeof text!=='string' || !text.includes('Homework and child-chart context:\n'))throw new Error('learning_planner_initial_identity_unverifiable');
        return JSON.parse(text.split('Homework and child-chart context:\n').at(-1)!);
      };
      if(frozen.model!==model || !isDeepStrictEqual(facts(frozen),facts(request)))throw new Error('learning_planner_initial_identity_mismatch');
      request=frozen;
      console.log(' 🎮 [learning-planner] [initial-request] [frozen-replay]');
    }
  }
  const execute = () => native?requestPlannerMessage(client,request):client.messages.stream(request, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000),maxRetries:0 }).finalMessage();
  const response = input.rawResponseFile
    ? await runMathProviderStage({draftDir:path.dirname(input.rawResponseFile),stage:"targeted-planner",model:request.model,request,execute})
    : await execute();
  if (input.rawResponseFile && !fs.existsSync(input.rawResponseFile)) {
    fs.mkdirSync(path.dirname(input.rawResponseFile), { recursive: true });
    fs.writeFileSync(input.rawResponseFile, `${JSON.stringify({
      ...response,
      model,
      stopReason: response.stop_reason,
      usage: response.usage,
      content: response.content,
    }, null, 2)}\n`, "utf8");
  }
  const savedResponse = {
    ...response,
    stopReason: response.stop_reason,
    content: response.content,
  };
  try {
    if(native)return nativeProgramFromResponse(savedResponse,packet!,model,Date.now()-started);
    const program=parseSavedDirectMathPlannerResponse(savedResponse, input.maxTokens ?? Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? 32000));
    return input.rawResponseFile ? await verifyMathPlannerCanvas(program,input.rawResponseFile) : program;
  } catch (error) {
    if(native){
      if(!nativePlannerContractError(error))throw error;
      return correctNativeLearningProgram({savedResponse,packet:packet!,model,client,rawResponseFile:input.rawResponseFile,initialError:error,started});
    }
    if (!correctableMathPlannerTruthError(error)) throw error;
    console.log(` 🎮 [adaptive-math] [targeted-planner-truth] [correction-required] child=${input.childId} reason=${error.message}`);
    return correctSavedDirectMathPlannerResponse({
      savedResponse,
      validationError: error.message,
      client,
      model: input.model,
      maxTokens: input.maxTokens,
      ...(input.rawResponseFile ? { correctionResponseFile: input.rawResponseFile.replace(/\.json$/i, "-correction.json") } : {}),
    });
  }
}

/** Compatibility command; both domains enter the same Planner request sequence. */
export function askDirectMathPlanner(input:LearningPlannerInput & {domain?:"math"}):Promise<MathLearningProgram>{return askLearningPlanner(input);}
function nativePlannerContractError(error:unknown):error is Error {
 return error instanceof z.ZodError || (error instanceof Error && ["learning_program_invalid:","assignment_planner_relationship_invalid:","board_definition_","planner_tool_output_missing_or_multiple:"].some(prefix=>error.message.startsWith(prefix)));
}
function nativeProgramFromResponse(response:unknown,packet:AssignmentPlanningPacket,model:string,latencyMs:number):NativePlannedProgram {
 const message=response as Anthropic.Messages.Message;assertPlannerResponseComplete(message);
 const tools=message.content.filter(block=>block.type==="tool_use"&&block.name==="create_learning_program");
 if(tools.length!==1 || tools[0].type!=="tool_use")throw new Error("planner_tool_output_missing_or_multiple:create_learning_program");
 const output=hydrateNativeLearningProgram(tools[0].input,packet);
 return {domain:"spelling",planId:output.activeSessionPlan.planId,journey:output.activeSessionPlan.journey!,plan:output.activeSessionPlan,planningResult:{output,telemetry:{model,latencyMs},receivedAt:output.activeSessionPlan.createdAt}};
}
async function correctNativeLearningProgram(input:{savedResponse:unknown;packet:AssignmentPlanningPacket;model:string;client:Anthropic;rawResponseFile?:string;initialError:Error;started:number}):Promise<NativePlannedProgram> {
 let prior=input.savedResponse,defect=input.initialError;
 const identity=crypto.createHash("sha256").update(JSON.stringify(input.packet)).digest("hex");
 for(let attempt=1;attempt<=2;attempt++){
  const stage=`targeted-planner-correction-${attempt}`;
  let envelope={identity,request:{model:input.model,max_tokens:16000,messages:[{role:"user" as const,content:`Correct only the diagnosed tool arguments and directly dependent fields. Preserve valid activity IDs, configs, count, educational choices and factual evidence. Return domain, planId, journey, activities (each with its measurement) and planTheory at the tool root, not under activeSessionPlan. Option paths are branch segments AFTER the choice; omit shared opening and closing portals. This is bounded correction ${attempt} of 2.
DEFECT: ${defect.message}
PRIOR RESPONSE: ${JSON.stringify(prior)}
CAPTURED HOMEWORK AND EVIDENCE: ${JSON.stringify({homework:input.packet.capturedHomework,discovery:input.packet.discoveryEvidence})}`}],tools:[{name:"create_learning_program",description:"Correct the cited native learning program arguments.",input_schema:nativeLearningProgramToolJsonSchema(input.packet.activityCatalog) as Anthropic.Messages.Tool.InputSchema}],tool_choice:{type:"tool" as const,name:"create_learning_program"}}};
  const directory=input.rawResponseFile?path.dirname(input.rawResponseFile):undefined;
  const pointer=directory?path.join(directory,"provider-receipts",`${stage}.stage.json`):undefined;
  if(pointer && fs.existsSync(pointer)){
   const {requestHash}=JSON.parse(fs.readFileSync(pointer,"utf8"));const receipt=JSON.parse(fs.readFileSync(path.join(directory!,"provider-receipts",`${requestHash}.json`),"utf8"));
   const frozen=JSON.parse(fs.readFileSync(path.join(directory!,"provider-diagnostics",`${requestHash}.attempt-${receipt.attempts?.length??1}.request.json`),"utf8")).context;
   if(frozen.identity!==identity)throw new Error("learning_planner_correction_identity_mismatch");envelope=frozen;
  }
  const execute=()=>requestPlannerMessage(input.client,envelope.request);
  const response=directory?await runMathProviderStage({draftDir:directory,stage,model:input.model,request:envelope,execute}):await execute();
  const toolInput=(message:unknown)=>{const content=(message as Anthropic.Messages.Message).content;return content.find(block=>block.type==="tool_use"&&block.name==="create_learning_program") as Anthropic.Messages.ToolUseBlock|undefined;};
  const original=toolInput(input.savedResponse),candidate=toolInput(response);
  if(original&&candidate)assertNativeLearningProgramCorrection(original.input,candidate.input,input.initialError);
  try{return nativeProgramFromResponse(response,input.packet,input.model,Date.now()-input.started);}
  catch(error){if(!nativePlannerContractError(error))throw error;prior=response;defect=error;console.warn(` 🎮 [learning-planner] [correction] [invalid] attempt=${attempt} ${defect.message}`);}
 }
 throw defect;
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

export function createDirectBoardThumbnailPrompt(activity: DirectActivity): string {
  const design = activity.designArtifact;
  return `Create one dedicated board-node thumbnail for this child learning experience.

Experience title: ${activity.title}
Opening promise: ${design?.openingPromise ?? activity.experience.objective}
Core interaction: ${design?.coreInteraction ?? activity.experience.childAction}
World reaction: ${design?.worldReaction ?? activity.experience.worldReaction}
Approved visual direction: ${design?.visualDirection ?? activity.visualMock.scene}

Composition requirements: one instantly recognizable central subject or action symbol; bold silhouette; strong foreground/background contrast; readable when cropped into a small circle; important content inside the central 70 percent; no thin detail at the edge. Match the approved world while making sibling nodes visually distinct.

Do not include words, letters, numbers, equations, answer choices, interface panels, buttons, screenshots, borders, or badges. This is destination artwork, not an activity screenshot.`;
}

export function createDirectBoardBackgroundPrompt(backgroundDirection: string): string {
  return `Create one full-screen board background from this approved creative direction:

${backgroundDirection}

Render scenery only. Preserve the world, palette, atmosphere, landmarks, and composition, but leave all interface labels and instructional affordances to Sunny's HTML layer.

Do not include words, letters, numbers, equations, captions, signs, labels, speaker icons, buttons, interface panels, or watermarks.`;
}

export function createDirectBoardThumbnailFilename(homeworkId: string, activity: DirectActivity): string {
  const safeNodeId = activity.id.replace(/[^a-z0-9_-]/gi, "_");
  const promptVersion = crypto
    .createHash("sha256")
    .update(createDirectBoardThumbnailPrompt(activity))
    .digest("hex")
    .slice(0, 12);
  return `${homeworkId}-${safeNodeId}-thumbnail-${promptVersion}.jpeg`;
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

export type CreatorPlaywrightAssertion =
  | { type: "visible" | "enabled" | "hidden" | "changed"; selector: string }
  | { type: "text_contains"; selector: string; value: string }
  | { type: "event"; eventType: "game_state_update" | "attempt_event" | "progress_event" | "node_complete"; itemId?: string };

export type CreatorPlaywrightManifest = {
  version: 1;
  nodeId: string;
  journey: Array<{
    itemId: string;
    steps: MathJourneyStep[];
    assertions: CreatorPlaywrightAssertion[];
  }>;
  completionAssertions: CreatorPlaywrightAssertion[];
};

export type GeneratedActivityPackage = {
  html: string;
  htmlHash: string;
  manifest: CreatorPlaywrightManifest;
  manifestText: string;
  manifestHash: string;
};

const CREATOR_TEST_SCRIPT = /<script\b(?=[^>]*\bid=["']sunny-playwright-test["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/i;
const CREATOR_ACTIONS = new Set(["click", "fill", "press", "drag"]);
const CREATOR_ASSERTIONS = new Set(["visible", "enabled", "hidden", "changed", "text_contains", "event"]);
const CREATOR_EVENTS = new Set(["game_state_update", "attempt_event", "progress_event", "node_complete"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], code: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(code);
}

function parseCreatorAssertion(value: unknown, itemId?: string): CreatorPlaywrightAssertion {
  const assertion = record(value);
  if (!assertion || typeof assertion.type !== "string" || !CREATOR_ASSERTIONS.has(assertion.type)) {
    throw new Error("creator_playwright_manifest_assertion_invalid");
  }
  if (assertion.type === "event") {
    exactKeys(assertion, ["type", "eventType", "itemId"], "creator_playwright_manifest_assertion_invalid");
    if (typeof assertion.eventType !== "string" || !CREATOR_EVENTS.has(assertion.eventType)
      || (assertion.itemId !== undefined && assertion.itemId !== itemId)) {
      throw new Error("creator_playwright_manifest_assertion_invalid");
    }
    return assertion as CreatorPlaywrightAssertion;
  }
  exactKeys(assertion, assertion.type === "text_contains" ? ["type", "selector", "value"] : ["type", "selector"], "creator_playwright_manifest_assertion_invalid");
  if (typeof assertion.selector !== "string" || !assertion.selector.trim()
    || (assertion.type === "text_contains" && (typeof assertion.value !== "string" || !assertion.value.trim()))) {
    throw new Error("creator_playwright_manifest_assertion_invalid");
  }
  return assertion as CreatorPlaywrightAssertion;
}

function parseCreatorStep(value: unknown): MathJourneyStep {
  const step = record(value);
  if (!step || typeof step.action !== "string" || !CREATOR_ACTIONS.has(step.action)) {
    throw new Error("creator_playwright_manifest_action_invalid");
  }
  exactKeys(step, ["action", "selector", "value", "target"], "creator_playwright_manifest_action_invalid");
  if (typeof step.selector !== "string" || !step.selector.trim()
    || (["fill", "press"].includes(step.action) && typeof step.value !== "string")
    || (step.action === "drag" && (typeof step.target !== "string" || !step.target.trim()))) {
    throw new Error("creator_playwright_manifest_action_invalid");
  }
  return step as MathJourneyStep;
}

export function parseCreatorPlaywrightManifest(
  parsed: unknown,
  expected: { nodeId: string; itemIds: string[] },
): CreatorPlaywrightManifest {
  const value = record(parsed);
  if (!value) throw new Error(`creator_playwright_manifest_invalid:${expected.nodeId}`);
  exactKeys(value, ["version", "nodeId", "journey", "completionAssertions"], "creator_playwright_manifest_invalid");
  if (value.version !== 1) throw new Error(`creator_playwright_manifest_version:${expected.nodeId}`);
  if (value.nodeId !== expected.nodeId) throw new Error(`creator_playwright_manifest_node_mismatch:${expected.nodeId}`);
  if (!Array.isArray(value.journey) || value.journey.length !== expected.itemIds.length) {
    throw new Error(`creator_playwright_manifest_item_coverage:${expected.nodeId}`);
  }
  const journey = value.journey.map((candidate): CreatorPlaywrightManifest["journey"][number] => {
    const item = record(candidate);
    if (!item) throw new Error(`creator_playwright_manifest_item_invalid:${expected.nodeId}`);
    exactKeys(item, ["itemId", "steps", "assertions"], "creator_playwright_manifest_item_invalid");
    if (typeof item.itemId !== "string" || !Array.isArray(item.steps) || item.steps.length < 1 || item.steps.length > 10) {
      throw new Error(`creator_playwright_manifest_item_invalid:${expected.nodeId}`);
    }
    if (!Array.isArray(item.assertions) || item.assertions.length < 1 || item.assertions.length > 8) {
      throw new Error(`creator_playwright_manifest_assertion_missing:${item.itemId}`);
    }
    const itemId = item.itemId;
    return {
      itemId,
      steps: item.steps.map(parseCreatorStep),
      assertions: item.assertions.map((assertion) => parseCreatorAssertion(assertion, itemId)),
    };
  });
  if (expected.itemIds.some((itemId) => journey.filter((item) => item.itemId === itemId).length !== 1)
    || journey.some((item) => !expected.itemIds.includes(item.itemId))) {
    throw new Error(`creator_playwright_manifest_item_coverage:${expected.nodeId}`);
  }
  if (journey.some((item, index) => item.itemId !== expected.itemIds[index])) {
    throw new Error(`creator_playwright_manifest_item_order:${expected.nodeId}`);
  }
  if (!Array.isArray(value.completionAssertions) || value.completionAssertions.length < 1 || value.completionAssertions.length > 8) {
    throw new Error(`creator_playwright_manifest_completion_missing:${expected.nodeId}`);
  }
  const completionAssertions = value.completionAssertions.map((assertion) => parseCreatorAssertion(assertion));
  if (!completionAssertions.some((assertion) => assertion.type === "event" && assertion.eventType === "node_complete")) {
    throw new Error(`creator_playwright_manifest_completion_missing:${expected.nodeId}`);
  }
  return { version: 1, nodeId: expected.nodeId, journey, completionAssertions };
}

export function parseGeneratedActivityPackage(raw: string, expected: { nodeId: string; itemIds: string[] }): GeneratedActivityPackage {
  const normalized = normalizeGeneratedHtml(stripHtml(raw));
  const match = normalized.match(CREATOR_TEST_SCRIPT);
  if (!match) throw new Error(`creator_playwright_manifest_missing:${expected.nodeId}`);
  let parsed: unknown;
  try { parsed = JSON.parse(match[1]!); }
  catch { throw new Error(`creator_playwright_manifest_json_invalid:${expected.nodeId}`); }
  const manifest = parseCreatorPlaywrightManifest(parsed, expected);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const html = normalizeGeneratedHtml(normalized.replace(CREATOR_TEST_SCRIPT, ""));
  if (!isCompleteGeneratedHtml(html)) throw new Error(`direct_activity_html_truncated:${expected.nodeId}:chars=${html.length}`);
  return {
    html,
    htmlHash: crypto.createHash("sha256").update(html).digest("hex"),
    manifest,
    manifestText,
    manifestHash: crypto.createHash("sha256").update(manifestText).digest("hex"),
  };
}

export function creatorPromptHash(
  activity: DirectActivity,
  plannerModel: string,
  creatorModel: string,
  creatorContractVersion = 19,
): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    creatorContractVersion,
    plannerModel,
    creatorModel,
    activity,
  })).digest("hex");
}

export function shouldReuseDirectArtifact(input: {
  htmlComplete: boolean;
  savedPromptHash?: string;
  expectedPromptHash: string;
  compatiblePromptHashes?: string[];
}): boolean {
  return input.htmlComplete && Boolean(input.savedPromptHash) && (
    input.savedPromptHash === input.expectedPromptHash
    || input.compatiblePromptHashes?.includes(input.savedPromptHash!) === true
  );
}

export const CREATOR_PLAYWRIGHT_MANIFEST_CONTRACT = `Before </body>, include one private <script id="sunny-playwright-test" type="application/json"> manifest. Sunny removes this script before publishing the activity. The JSON shape is {"version":1,"nodeId":string,"journey":[{"itemId":string,"steps":[action],"assertions":[assertion]}],"completionAssertions":[assertion]}.
Cover every frozen item exactly once and in order. Each item needs 1-10 actions using its real visible controls and at least one assertion proving the intended result. Actions are {"action":"click","selector":"..."}, {"action":"fill","selector":"...","value":"..."}, {"action":"press","selector":"...","value":"Enter"}, or {"action":"drag","selector":"...","target":"..."}. Assertions are visible, enabled, hidden, changed, text_contains, or event. DOM assertions use {"type":"visible|enabled|hidden|changed","selector":"..."} or {"type":"text_contains","selector":"...","value":"..."}. Event assertions use {"type":"event","eventType":"game_state_update|attempt_event|progress_event|node_complete","itemId":"the frozen item id"}; omit itemId only for completion. completionAssertions must include node_complete. Use stable selectors for real child controls. The manifest is data only: no JavaScript, expressions, imports, callbacks, URLs, or generated evidence.
Sunny runs this Creator-authored journey in Playwright, then independently verifies scoring, evidence, item transitions, and completion. The manifest cannot declare the activity correct.`;

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
Emit window.parent.postMessage({type:"activity_ready",payload:{nodeId:"${input.activity.id}"}},"*") only when the opening is genuinely ready. Do not emit activity_ready while the opening is empty, loading, charging, or waiting through a decorative animation. The title, mathematical representation, and first meaningful action must already be rendered, enabled, and visually obvious.
Whenever the activity or active problem changes, emit window.parent.postMessage({type:"game_state_update",payload:{game:"generated-math",activityId:"${input.activity.id}",nodeId:"${input.activity.id}",phase:"question",activityTitle:${JSON.stringify(input.activity.title)},learningFocus:${JSON.stringify(input.activity.academicTarget)},mechanic:${JSON.stringify(input.activity.mechanic)},currentChallenge,availableActions,itemIndex,totalItems,answerVisibility:"hidden"}},"*") so Elli has live context. Never expose answers.
${TARGETED_COMPANION_RUNTIME_CONTRACT}
Listen for parent messages with type:"sunny_companion_presence". Pause activity timers and input while summoned, and resume the same state when collapsed. Do not restart or change progress.
Sunny may reserve a 220px right-side companion safe area while the child asks for help. Keep essential instructions, mathematical representations, and primary controls outside it at the 1365×768 target and the 1280×720 embedded frame; decorative scenery may extend behind it.
For sound, post semantic cues to Sunny with window.parent.postMessage({type:"sunny_sfx",payload:{cue}},"*"). The allowed cue values are "interaction", "recovery", "progress", and "completion". Emit them when the approved design calls for those moments; Sunny owns the actual recorded sound quality.
Include one visible sound toggle. It must post window.parent.postMessage({type:"sunny_sound_toggle",payload:{muted}},"*") whenever its state changes. Do not use speechSynthesis, spoken browser narration, HTML audio elements, or external audio assets. Do not create AudioContext oscillators or synthesized tones. Spoken explanations belong only to Elli after the child asks.
For captured attemptedValue use the selected option id, numeric text without units, JSON.stringify of the construction state, or the actual explanation text. Never substitute a correctness label for the response.
Maintain a factual targetResults array for the full activity. Record exactly one first committed response per item as {target,correct,attemptedValue,responseTimeMs,scaffoldLevel}; recovery retries must never append duplicate target rows or overwrite the first response, where target is the stable item id, attemptedValue is what the child submitted, and scaffoldLevel reflects demos, hints, or companion help.
Every Planner-authored item must render controls that match its response mode. When the response mode changes, replace the previous item's controls before accepting input; never leave numeric or selection controls under an explanation prompt. Exercise every item in order, including the final item, and prove that it can submit through the same handlers as the visible child controls.
After the final submission, completion state must not read the next item or call question-state helpers that require a current item. Capture the final item before advancing, then render and emit completion from terminal-safe state.
Emit window.parent.postMessage({type:"attempt_event",payload:{domain:"math",target,correct,attemptedValue,responseTimeMs,scaffoldLevel}},"*") for each answer.
Emit window.parent.postMessage({type:"progress_event",payload:{nodeId:"${input.activity.id}",completedItems,totalItems}},"*") whenever visible progress advances.
On completion calculate accuracy from targetResults and emit window.parent.postMessage({type:"node_complete",payload:{nodeId:"${input.activity.id}",completed:true,accuracy,targetResults,timeSpent_ms}},"*").
${CREATOR_PLAYWRIGHT_MANIFEST_CONTRACT}
Include <div id="sunny-companion"></div> so the parent app owns Elli.
At a 1365×768 viewport and a 1280×720 embedded frame, the title and first required action must be visible immediately. Use high-contrast text and controls against every panel behind them. Keep all primary controls inside the viewport without page scrolling or clipping. Before returning, measure the bounding rectangle of every enabled child control at both sizes. If any edge lies outside the viewport, compact spacing or resize the layout until all controls fit without scrolling.
Return raw HTML containing the private manifest and end with </html>.

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

export function buildDirectActivityRepairPrompt(input: {
  activity: DirectActivity;
  html: string;
  failures: string[];
}): string {
  return `You are Sunny's Experience Creator repairing only the implementation of one frozen targeted math activity. The attached screenshots show exact failed journey states. The Planner's difficulty boundary and academic prediction remain immutable. Each submitted answer emits attempt_event with payload.target equal to the frozen item ID. Final node_complete contains exactly one first-response targetResults row per item. Do not emit Discovery evaluation_attempt events in a teaching activity. ${MATH_IMPLEMENTATION_REPAIR_CONTRACT}
VERIFICATION FAILURES:
${input.failures.map((failure) => `- ${failure}`).join("\n")}

IMMUTABLE ACADEMIC CONTRACT:
${JSON.stringify({
  responsibilityId: input.activity.responsibilityId,
  academicTarget: input.activity.academicTarget,
  difficultyBoundary: input.activity.difficultyBoundary,
  items: input.activity.items,
  academicPrediction: input.activity.academicPrediction,
}, null, 2)}

IMMUTABLE DESIGN ARTIFACT:
${JSON.stringify(input.activity.designArtifact, null, 2)}

CURRENT HTML:
${input.html}`;
}

export type TruncatedDirectRepairReceipt = {
  stage: string;
  requestHash: string;
  requestBudget: number;
  receiptFile: string;
};

/** Finds only the legacy board-repair truncation that the human may replace once. */
export function findTruncatedDirectRepairReceipt(outputDir: string, nodeId: string): TruncatedDirectRepairReceipt | undefined {
  const stage = `${nodeId}-repair`;
  const requestFile = path.join(outputDir, `${stage}-request.json`);
  const stageFile = path.join(outputDir, "provider-receipts", `${stage}.stage.json`);
  if (!fs.existsSync(requestFile) || !fs.existsSync(stageFile)) return undefined;
  const request = JSON.parse(fs.readFileSync(requestFile, "utf8")) as { max_output_tokens?: number };
  const savedStage = JSON.parse(fs.readFileSync(stageFile, "utf8")) as { requestHash?: string };
  if (!savedStage.requestHash || !/^[a-f0-9]{64}$/.test(savedStage.requestHash)) throw new Error(`provider_receipt_invalid:${stageFile}`);
  const receiptFile = path.join(outputDir, "provider-receipts", `${savedStage.requestHash}.json`);
  if (!fs.existsSync(receiptFile)) throw new Error(`provider_receipt_invalid:${receiptFile}`);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8")) as { status?: string; response?: { stopReason?: string } };
  const requestBudget = Number(request.max_output_tokens ?? 0);
  return receipt.status === "received"
    && receipt.response?.stopReason === "max_output_tokens"
    && requestBudget > 0
    && requestBudget < OPENAI_REPAIR_MAX_OUTPUT_TOKENS
    ? { stage, requestHash: savedStage.requestHash, requestBudget, receiptFile }
    : undefined;
}

export async function repairDirectArtifact(input: {
  artifact: DirectArtifact;
  activity: DirectActivity;
  failures: string[];
  screenshotPaths: string[];
  outputDir: string;
  model?: string;
  rootDir?: string;
  authorizeTruncatedReplacement?: boolean;
  retryUncertain?: boolean;
}): Promise<DirectArtifact> {
  const metadataPath = input.artifact.htmlPath.replace(/\.html$/i, ".artifact.json");
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<string, unknown> : {};
  const originalAcademicHash = input.artifact.academicContractHash;
  const originalDesignHash = input.artifact.designArtifactHash;
  if (metadata.academicContractHash !== originalAcademicHash || metadata.designArtifactHash !== originalDesignHash) throw new Error(`direct_activity_repair_frozen_hash_mismatch:${input.artifact.nodeId}`);
  if (!input.screenshotPaths.length || input.screenshotPaths.some(file => !fs.existsSync(file))) throw new Error(`repair_screenshot_missing:${input.artifact.nodeId}`);
  fs.mkdirSync(input.outputDir, { recursive: true });
  const atomicWrite = (file: string, data: string): void => { fs.writeFileSync(file + ".tmp", data, "utf8"); fs.renameSync(file + ".tmp", file); };
  const sourcePath = path.join(input.outputDir, `${input.artifact.nodeId}-repair-source.html`);
  if (!fs.existsSync(sourcePath)) atomicWrite(sourcePath, fs.readFileSync(input.artifact.htmlPath, "utf8"));
  const originalHtml = fs.readFileSync(sourcePath, "utf8");
  const originalHtmlHash = crypto.createHash("sha256").update(originalHtml).digest("hex");
  const model = input.model ?? (process.env.SUNNY_DIRECT_REPAIR_MODEL?.trim() || "gpt-5.6");
  const lessonSnapshot = freezeEngineeringLessonSnapshot({ snapshotFile: path.join(input.outputDir, `${input.artifact.nodeId}-engineering.snapshot.json`), auditRoot: resolveContextRoot({ rootDir: input.rootDir }), features: engineeringFeatures(originalHtml), defects: input.failures, verifierVersion: MATH_BROWSER_VERIFIER_VERSION * 1000 + DISCOVERY_VERIFIER_VERSION, preserveCompleted: hasReceivedMathProviderStage(input.outputDir, `${input.artifact.nodeId}-repair`) });
  const prompt = buildDirectActivityRepairPrompt({
    activity: input.activity,
    html: originalHtml,
    failures: input.failures,
  }) + engineeringLessonContext(lessonSnapshot);
  const content: Array<Record<string, unknown>> = input.screenshotPaths
    .map((file) => ({
      type: "input_image",
      image_url: `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`,
    }));
  content.push({ type: "input_text", text: prompt });
  const primaryStage = `${input.artifact.nodeId}-repair`;
  const requestFile = path.join(input.outputDir, `${primaryStage}-request.json`);
  if (!fs.existsSync(requestFile)) atomicWrite(requestFile, JSON.stringify({model,input:[{role:"user",content}],max_output_tokens:OPENAI_REPAIR_MAX_OUTPUT_TOKENS,reasoning:{effort:"high"},stream:true,store:false}));
  const primaryRequest = JSON.parse(fs.readFileSync(requestFile,"utf8")) as Record<string, unknown>;
  const truncatedPrimary = findTruncatedDirectRepairReceipt(input.outputDir, input.artifact.nodeId);
  if (input.authorizeTruncatedReplacement && !truncatedPrimary) {
    throw new Error(`board_repair_replacement_not_eligible:${input.artifact.nodeId}`);
  }
  const replacementStage = `${primaryStage}-replacement`;
  const replacementRequestFile = path.join(input.outputDir, `${replacementStage}-request.json`);
  const authorizationFile = path.join(input.outputDir, `${replacementStage}-authorization.json`);
  if (input.authorizeTruncatedReplacement) {
    if (!fs.existsSync(replacementRequestFile)) atomicWrite(replacementRequestFile, JSON.stringify({ ...primaryRequest, max_output_tokens: OPENAI_REPAIR_MAX_OUTPUT_TOKENS }));
    if (!fs.existsSync(authorizationFile)) atomicWrite(authorizationFile, `${JSON.stringify({
      version: 1,
      nodeId: input.artifact.nodeId,
      reason: "saved_request_output_budget_exhausted",
      originalStage: primaryStage,
      originalRequestHash: truncatedPrimary!.requestHash,
      replacementStage,
      authorizedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    console.log(` 🎮 [adaptive-math] [board-repair-replacement] [authorized] node=${input.artifact.nodeId} originalStage=${primaryStage} replacementStage=${replacementStage}`);
  }
  const stage = input.authorizeTruncatedReplacement ? replacementStage : primaryStage;
  const request = JSON.parse(fs.readFileSync(input.authorizeTruncatedReplacement ? replacementRequestFile : requestFile,"utf8"));
  const startedAt = Date.now();
  const streamed = await runMathProviderStage({draftDir:input.outputDir,stage,model:request.model,request,retryUncertain:input.retryUncertain,beforeRequest:() => {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("preflight_missing:OPENAI_API_KEY");
  },execute:async () => {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000)),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`direct_activity_repair_provider_failed:${input.artifact.nodeId}:${response.status}`), {status:response.status});
  }
  return readOpenAiResponseStream(response);
  }});
  if (streamed.stopReason !== "completed") {
    if (streamed.stopReason === "max_output_tokens") {
      const message = `board_repair_harness_failure:output_budget_exhausted:node=${input.artifact.nodeId}:stage=${stage}:budget=${request.max_output_tokens}:reasoningTokens=${streamed.reasoningTokens}:visibleTextCharacters=${streamed.visibleTextCharacters}`;
      console.error(` 🎮 [adaptive-math] [repair-harness] [budget-exhausted] ${message}`);
      throw new Error(message);
    }
    throw new Error(`direct_activity_repair_incomplete:${streamed.stopReason}`);
  }
  const applied = applyDiscoveryHtmlPatch(originalHtml, streamed.raw);
  const htmlHash = crypto.createHash("sha256").update(applied.html).digest("hex");
  const currentHash = crypto.createHash("sha256").update(fs.readFileSync(input.artifact.htmlPath)).digest("hex");
  if (![originalHtmlHash,htmlHash].includes(currentHash) || ![originalHtmlHash,htmlHash].includes(input.artifact.htmlHash ?? "")) throw new Error(`direct_activity_repair_source_changed:${input.artifact.nodeId}`);
  const diagnosticPath = path.join(input.outputDir, `${input.artifact.nodeId}-repair.json`);
  if (applied.engineeringLesson) recordEngineeringRepairEvidence({ file: path.join(input.outputDir, `${input.artifact.nodeId}.engineering-repair.json`), verifierVersion: MATH_BROWSER_VERIFIER_VERSION * 1000 + DISCOVERY_VERIFIER_VERSION, originalHash: originalHtmlHash, repairedHash: htmlHash, academicHash: originalAcademicHash!, designHash: originalDesignHash!, issues: input.failures, proposal: applied.engineeringLesson, inputTokens: streamed.inputTokens, outputTokens: streamed.outputTokens, latencyMs: Date.now() - startedAt, costUsd: estimateDiscoveryRepairCost({ provider: "openai", inputTokens: streamed.inputTokens, outputTokens: streamed.outputTokens }) });
  fs.writeFileSync(diagnosticPath, `${JSON.stringify({
    nodeId: input.artifact.nodeId,
    model:request.model,
    failures: input.failures,
    screenshotPaths: input.screenshotPaths,
    stopReason: streamed.stopReason,
    inputTokens: streamed.inputTokens,
    outputTokens: streamed.outputTokens,
    reasoningTokens: streamed.reasoningTokens,
    visibleTextCharacters: streamed.visibleTextCharacters,
    latencyMs: Date.now() - startedAt,
    replacementCount: applied.replacementCount,
    changedOriginalCharacters: applied.changedOriginalCharacters,
    originalHtmlHash,
    repairedHtmlHash: htmlHash,
  }, null, 2)}\n`, "utf8");
  if (currentHash !== htmlHash) atomicWrite(input.artifact.htmlPath, applied.html);
  atomicWrite(metadataPath, `${JSON.stringify({
      ...metadata,
      htmlHash,
      repair: { model:request.model, diagnosticPath, originalHtmlHash },
    }, null, 2)}\n`);
  console.log(` 🎮 [adaptive-math] [node-repair] [saved] node=${input.artifact.nodeId} model=${model} replacements=${applied.replacementCount} latencyMs=${Date.now() - startedAt}`);
  return { ...input.artifact, htmlHash };
}

export function buildAdaptiveProgressionCreatorPrompt(input: {
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  childContext: unknown;
}): string {
  const nodeId = input.node.nodeId;
  const spelling = input.cycle.domain === "spelling";
  const { generationPrompt: _generationPrompt, ...creatorNodeContract } = input.node;
  const prompt = `You are Sunny's Experience Creator. Build one complete child-facing activity as self-contained HTML with inline CSS and JavaScript.

Creative objective:
Build an experience a child would voluntarily replay. The ${spelling ? "assigned spelling" : "mathematics"} must be the power the child uses to affect the world, not an unrelated question interrupting play. The child's meaningful action must visibly transform the world, mission, progression, or payoff. Choose the interaction, stakes, consequences, pacing, and reward that best serve the Planner's prescription and the factual evidence. Commit to one distinctive core interaction whose first action is understandable from the finished screen.

${spelling ? "Preserve the assigned spelling words and frozen item IDs in evidenceContract.spellingItems. attemptedValue is the child's actual submitted letters, never the revealed answer or game outcome. Missing capture stays absent. Report visible letters or other support as scaffoldLevel greater than zero. These are practice responses; no mastery or unseen-item claim is allowed." : "For captured attemptedValue use the selected option id, numeric text without units, JSON.stringify of the construction state, or the actual explanation text. Keep exactly one first committed response per item in targetResults; retries must not duplicate or overwrite it. Preserve evidenceContract.itemContracts exactly; explanations are unscored evidence for later interpretation."}

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

${spelling ? "Use the frozen spelling item identities even when a word was practiced earlier; make the activity presentation appropriate to the Planner's responsibility. Repetition remains previously exposed practice, not unseen evidence." : "Author fresh content appropriate to this assignment and node responsibility. Do not reuse any exposed item identity or exact prompt listed in the cycle. Quest must test unseen transfer. Boss must test unseen synthesis. A generated support node remains teaching/practice evidence. Do not claim mastery."}
The first visible H1 must be exactly ${JSON.stringify(input.node.openingScreen.title)}. A short exciting subtitle may establish the AI-authored world.
Visibly use the assigned artwork URL as part of the world: ${input.node.artwork.localPath ?? "none"}.
Keep the complete HTML under 24,000 characters. Prefer concise CSS and JavaScript.
Every DOM element queried by JavaScript must exist before the query runs; place behavior after its markup or initialize it on DOMContentLoaded.

Runtime contract appendix:
Load <script src="/games/_contract.js"></script> in <head>.
Read runtime identity and parameters from window.GAME_PARAMS. Never hardcode the child identity, homework identity, or session identity into the HTML.
Emit window.parent.postMessage({type:"activity_ready",payload:{nodeId:"${nodeId}"}},"*") when ready.
Whenever the activity or problem changes, emit window.parent.postMessage({type:"game_state_update",payload:{game:"generated-${spelling ? "spelling" : "math"}",activityId:"${nodeId}",nodeId:"${nodeId}",phase:"question",activityTitle:${JSON.stringify(input.node.title)},learningFocus:${JSON.stringify(input.node.academicTarget.skill)},mechanic:${JSON.stringify(input.node.mechanic)},currentChallenge,availableActions,itemIndex,totalItems,answerVisibility:"hidden"}},"*") so Elli has live context. Never expose answers.
${TARGETED_COMPANION_RUNTIME_CONTRACT}
${spelling ? `Spelling runtime identities:
${JSON.stringify(Object.values(input.node.evidenceContract.spellingItems ?? {}).map(item => ({itemId:item.id,word:item.word,measurementRole:item.lineage?.measurementRole})))}
currentChallenge.id, journey.itemId, and target all use the full itemId from this map. Never use wordId or a shortened suffix as a runtime item ID. Use the same itemId for state, attempt_event and targetResults; copy its measurementRole into currentChallenge. These identities describe the saved measurement occasion, not the displayed word or educational order.
` : ""}Listen for parent messages with type:"sunny_companion_presence". Pause activity timers and input while summoned, and resume the same state when collapsed. Do not restart or change progress.
Maintain a factual targetResults array with exactly one immutable first committed response per Planner item: {target,correct,attemptedValue,responseTimeMs,scaffoldLevel}. Log retries as separate attempt events; never append duplicate targets or overwrite the first response.
For every answer call window.fireAttemptEvent({domain:"${spelling ? "spelling" : "math"}",target,correct,attemptedValue,responseTimeMs,scaffoldLevel}).
Emit window.parent.postMessage({type:"progress_event",payload:{nodeId:"${nodeId}",completedItems,totalItems}},"*") whenever visible progress advances.
Use window.fireCompanionEvent("correct_answer" or "wrong_answer", {target}) after meaningful answers and window.fireCompanionEvent("game_complete", {}) at completion.
On completion calculate accuracy from targetResults and call window.sendNodeComplete({nodeId:window.GAME_PARAMS.nodeId,completed:true,accuracy,targetResults,timeSpent_ms}).
${MATH_JOURNEY_CONTRACT}
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
${JSON.stringify(creatorChildContextWithoutIdentity(input.childContext), null, 2)}`;
  return prompt;
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
    max_tokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 48000),
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
  htmlHash: string;
  manifest: CreatorPlaywrightManifest;
  manifestText: string;
  manifestHash: string;
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
};

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
  receiptDir: string;
  rootDir?: string;
}): Promise<GeneratedActivityHtml> {
  const lessonSnapshot = freezeEngineeringLessonSnapshot({ snapshotFile: path.join(input.receiptDir, `${input.activity.id}-engineering.snapshot.json`), auditRoot: resolveContextRoot({ rootDir: input.rootDir }), features: engineeringFeatures(JSON.stringify(input.activity)), verifierVersion: MATH_BROWSER_VERIFIER_VERSION * 1000 + DISCOVERY_VERIFIER_VERSION, preserveCompleted: hasReceivedMathProviderStage(input.receiptDir, `${input.activity.id}-build`) });
  const prompt = buildDirectActivityCreatorPrompt(input) + engineeringLessonContext(lessonSnapshot);
  const startedAt = Date.now();
  const request = input.provider === "openai"
    ? {model:input.model,input:prompt,max_output_tokens:Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 48000),reasoning:{effort:"high"},stream: true}
    : {model:input.model,max_tokens:Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 48000),thinking:{type:"adaptive"},output_config:{effort:"high"},messages:[{role:"user",content:prompt}]};
  const captured = await runMathProviderStage({draftDir:input.receiptDir,stage:`${input.activity.id}-build`,model:input.model,request,beforeRequest:()=>{
    if(input.provider==="openai"&&!process.env.OPENAI_API_KEY?.trim())throw new Error("preflight_missing:OPENAI_API_KEY");
  },execute:async()=>{
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
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000)),
    });
    if (!response.ok) {
      const payload = await response.json() as Record<string, unknown>;
      const error = object(payload.error);
      throw Object.assign(new Error(`direct_activity_provider_failed:${input.activity.id}:openai:${response.status}:${String(error?.message ?? "request_failed")}`),{status:response.status});
    }
    ({ raw, inputTokens, outputTokens, stopReason } = await readOpenAiResponseStream(response));
  } else {
    const response = await input.client.messages.stream(request as never, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600000), maxRetries: 0 }).finalMessage();
    raw = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;
    stopReason = response.stop_reason ?? "unknown";
  }
  return {raw,inputTokens,outputTokens,stopReason,elapsedMs:Date.now()-startedAt};
  }});
  const {raw,inputTokens,outputTokens,stopReason,elapsedMs}=captured;
  const generated = parseGeneratedActivityPackage(raw, {
    nodeId: input.activity.id,
    itemIds: input.activity.items.map((item) => item.id),
  });
  return { ...generated, elapsedMs, inputTokens, outputTokens };
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

export async function mapConcurrentSettled<T, R>(
  values: T[],
  limit: number,
  run: (value: T, index: number) => Promise<R>,
): Promise<{ results: Array<R | undefined>; failures: Array<{ index: number; error: unknown }> }> {
  const results = new Array<R | undefined>(values.length);
  const failures: Array<{ index: number; error: unknown }> = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = await run(values[index]!, index);
      } catch (error) {
        failures.push({ index, error });
      }
    }
  });
  await Promise.all(workers);
  failures.sort((left, right) => left.index - right.index);
  return { results, failures };
}

export function selectDirectArtifactActivities<T extends { id: string }>(
  activities: T[],
  requestedNodeIds?: string[],
): T[] {
  if (!requestedNodeIds || requestedNodeIds.length === 0) return activities;
  const requested = new Set(requestedNodeIds);
  const missing = [...requested].filter((nodeId) => !activities.some((activity) => activity.id === nodeId));
  if (missing.length > 0) throw new Error(`direct_artifact_requested_node_missing:${missing.join(",")}`);
  return activities.filter((activity) => requested.has(activity.id));
}

export async function generateDirectArtworkBundle(input: {
  plan: DirectLearningExperiencePlan;
  homeworkId: string;
  rootDir?: string;
  nodeIds?: string[];
  existingArtworkUrls?: Partial<Pick<DirectArtworkBundle, "backgroundUrl">>;
}): Promise<DirectArtworkBundle> {
  const rootDir = input.rootDir ?? process.cwd();
  const publicDir = path.join(rootDir, "web", "public");
  const selectedActivities = selectDirectArtifactActivities(input.plan.activities, input.nodeIds);
  process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN = "3";
  const artworkJobs = [
    { key: "backgroundUrl" as const, prompt: createDirectBoardBackgroundPrompt(input.plan.boardWorld.backgroundPrompt), filename: `${input.homeworkId}-background.jpeg` },
  ];
  let reusedImages = 0;
  const resolvedArtwork = await mapConcurrent(artworkJobs, 2, async (job) => {
    const existing = input.existingArtworkUrls?.[job.key];
    if (existing) {
      reusedImages += 1;
      return [job.key, existing] as const;
    }
    const localFile = path.join(publicDir, "generated", "direct-math", job.filename);
    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 0) reusedImages += 1;
    return [job.key, await createDirectArtwork(job.prompt, publicDir, job.filename)] as const;
  });
  const artworkUrls = Object.fromEntries(resolvedArtwork) as Pick<DirectArtworkBundle, "backgroundUrl">;
  const thumbnailEntries = await mapConcurrent(selectedActivities, 2, async (activity) => {
    const filename = createDirectBoardThumbnailFilename(input.homeworkId, activity);
    const localFile = path.join(publicDir, "generated", "direct-math", filename);
    const reused = fs.existsSync(localFile) && fs.statSync(localFile).size > 0;
    const thumbnailUrl = await createDirectArtwork(createDirectBoardThumbnailPrompt(activity), publicDir, filename);
    if (reused) reusedImages += 1;
    return [activity.id, thumbnailUrl] as const;
  });
  const totalImages = artworkJobs.length + thumbnailEntries.length;
  return {
    ...artworkUrls,
    thumbnailUrls: Object.fromEntries(thumbnailEntries),
    generatedImages: totalImages - reusedImages,
    reusedImages,
  };
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
  nodeIds?: string[];
  onArtifactSaved?: (artifact: DirectArtifact) => Promise<void> | void;
  candidateCards?: PlannerContentCandidateCard[];
  existingArtworkUrls?: {
    backgroundUrl: string;
  };
  deferOptionalArtwork?: boolean;
}): Promise<{
  artifacts: DirectArtifact[];
  backgroundUrl: string;
  stats: DirectGenerationStats;
}> {
  const rootDir = input.rootDir ?? process.cwd();
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const plannerModel = input.plannerModel ?? process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5";
  const architectModel = input.architectModel ?? process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5";
  const builderAssignments = new Map(
    assignBaselineBuilderModels(input.assignmentFingerprint, input.plan.activities)
      .map((assignment) => [assignment.nodeId, assignment]),
  );
  const selectedActivities = selectDirectArtifactActivities(input.plan.activities, input.nodeIds);
  const forceNodeIds = new Set(input.forceNodeIds ?? []);
  const artworkBundle = input.deferOptionalArtwork
    ? {
        backgroundUrl: input.existingArtworkUrls?.backgroundUrl ?? "/generated/adaptive-discovery-background.svg",
        thumbnailUrls: {},
        generatedImages: 0,
        reusedImages: 0,
      }
    : await generateDirectArtworkBundle({
        rootDir,
        plan: input.plan,
        homeworkId: input.homeworkId,
        nodeIds: input.nodeIds,
        existingArtworkUrls: input.existingArtworkUrls,
      });
  const { backgroundUrl } = artworkBundle;
  const thumbnailByNodeId = new Map(Object.entries(artworkBundle.thumbnailUrls));
  const generatedNodeIds: string[] = [];
  const reusedNodeIds: string[] = [];
  const gamesDir = path.join(resolveChildContextDir(input.childId, { rootDir }), "homework", "games", input.homeworkId);
  fs.mkdirSync(gamesDir, { recursive: true });
  const activityBuild = await mapConcurrentSettled(selectedActivities, 2, async (activity): Promise<DirectArtifact> => {
    const artworkUrl = backgroundUrl;
    const builder = builderAssignments.get(activity.id);
    if (!builder) throw new Error(`direct_builder_assignment_missing:${activity.id}`);
    const model = builder.model;
    const htmlPath = path.join(gamesDir, `${activity.id}.html`);
    const creatorTestPath = path.join(gamesDir, `${activity.id}.playwright.json`);
    const metadataPath = path.join(gamesDir, `${activity.id}.artifact.json`);
    let existingHtml = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
    const expectedPromptHash = creatorPromptHash(activity, plannerModel, model);
    let existingMetadata: Partial<DirectArtifact> & {
      creatorContractVersion?: number;
      designArtifact?: ExperienceDesignArtifactV1;
    } = {};
    let savedPromptHash: string | undefined;
    try {
      existingMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as typeof existingMetadata;
      savedPromptHash = existingMetadata.promptHash;
    } catch {
      savedPromptHash = undefined;
    }
    const itemIds = activity.items.map((item) => item.id);
    const savedManifestBytes = fs.existsSync(creatorTestPath) ? fs.readFileSync(creatorTestPath, "utf8") : "";
    const savedManifestValid = existingMetadata.creatorContractVersion === 19
      && Boolean(existingMetadata.creatorTestHash)
      && crypto.createHash("sha256").update(savedManifestBytes).digest("hex") === existingMetadata.creatorTestHash;
    const frozenAcademicContractHash = activity.designArtifact?.academicContractHash ?? "";
    let exactCatalogReuse = frozenAcademicContractHash && !forceNodeIds.has(activity.id)
      ? resolveExactMathCatalogReuse({
          decision: activity.catalogDecision ?? { action: "generate_new" },
          targetNodeId: activity.id,
          academicContractHash: frozenAcademicContractHash,
          cards: input.candidateCards ?? [],
        })
      : null;
    if (exactCatalogReuse?.runtime.launchPath) {
      const sourceMetadataPath = exactCatalogReuse.runtime.launchPath.replace(/\.html$/i, ".artifact.json");
      const sourceCreatorTestPath = exactCatalogReuse.runtime.launchPath.replace(/\.html$/i, ".playwright.json");
      let sourceHtml = "";
      let sourceManifest = "";
      if (fs.existsSync(sourceMetadataPath)) {
        try {
          const sourceMetadata = JSON.parse(fs.readFileSync(sourceMetadataPath, "utf8")) as typeof existingMetadata;
          sourceHtml = fs.readFileSync(exactCatalogReuse.runtime.launchPath, "utf8");
          sourceManifest = fs.existsSync(sourceCreatorTestPath) ? fs.readFileSync(sourceCreatorTestPath, "utf8") : "";
          if (sourceMetadata.creatorContractVersion !== 19 || !sourceMetadata.creatorTestHash
            || crypto.createHash("sha256").update(sourceManifest).digest("hex") !== sourceMetadata.creatorTestHash) {
            throw new Error("creator_playwright_manifest_catalog_reuse_ineligible");
          }
          existingMetadata = sourceMetadata;
          if (sourceMetadata.designArtifact?.academicContractHash === frozenAcademicContractHash) {
            activity.designArtifact = sourceMetadata.designArtifact;
            activity.title = sourceMetadata.designArtifact.title;
            activity.creatorPrompt = JSON.stringify(sourceMetadata.designArtifact);
          }
        } catch (error) {
          console.warn(` 🎮 [math-catalog] [reuse-metadata-warning] node=${activity.id} reason=${error instanceof Error ? error.message : String(error)}`);
          exactCatalogReuse = null;
        }
      } else {
        exactCatalogReuse = null;
      }
      if (exactCatalogReuse) {
        fs.writeFileSync(htmlPath, sourceHtml, "utf8");
        fs.writeFileSync(creatorTestPath, sourceManifest, "utf8");
        existingHtml = sourceHtml;
        savedPromptHash = exactCatalogReuse.hashes.implementationPromptHash ?? savedPromptHash;
        reusedNodeIds.push(activity.id);
        console.log(`  ✓ ${activity.id} [catalog/${exactCatalogReuse.contentId}] exact reuse`);
      }
    }
    let generated: GeneratedActivityHtml | undefined;
    const reusable = Boolean(exactCatalogReuse) || (!forceNodeIds.has(activity.id)
      && savedManifestValid
      && shouldReuseDirectArtifact({
        htmlComplete: isCompleteGeneratedHtml(existingHtml),
        savedPromptHash,
        expectedPromptHash,
      }));
    if (!reusable) {
      generatedNodeIds.push(activity.id);
      console.log(`  ↻ ${activity.id} [${builder.provider}/${model}] building`);
      generated = await generateActivityHtml({
        activity,
        artworkUrl,
        childId: input.childId,
        client,
        provider: builder.provider,
        model,
        receiptDir: path.join(gamesDir,"provider-checkpoints"),
        rootDir: input.rootDir,
      });
      fs.writeFileSync(htmlPath, generated.html, "utf8");
      fs.writeFileSync(creatorTestPath, generated.manifestText, "utf8");
    } else if (!exactCatalogReuse) {
      reusedNodeIds.push(activity.id);
      console.log(`  ✓ ${activity.id} [${builder.provider}/${model}] reused`);
    }
    const resolvedPromptHash = generated ? expectedPromptHash : savedPromptHash ?? expectedPromptHash;
    const resolvedCreatorContractVersion = 19;
    const resolvedCreatorTestHash = generated?.manifestHash ?? existingMetadata.creatorTestHash;
    const html = generated?.html ?? existingHtml;
    const generationMetrics = preserveDirectArtifactGenerationMetrics(generated, existingMetadata);
    const resolvedBuilderProvider = generated ? builder.provider : existingMetadata.builderProvider ?? builder.provider;
    const resolvedBuilderModel = generated ? model : existingMetadata.builderModel ?? model;
    const designArtifactHash = crypto.createHash("sha256").update(JSON.stringify(activity.designArtifact)).digest("hex");
    const htmlHash = crypto.createHash("sha256").update(html).digest("hex");
    fs.writeFileSync(metadataPath, `${JSON.stringify({
      version: 3,
      nodeId: activity.id,
      designArtifact: activity.designArtifact,
      academicContractHash: activity.designArtifact?.academicContractHash,
      designArtifactHash,
      creatorPrompt: activity.creatorPrompt,
      promptHash: resolvedPromptHash,
      creatorContractVersion: resolvedCreatorContractVersion,
      creatorTestPath,
      creatorTestHash: resolvedCreatorTestHash,
      itemIds,
      plannerModel,
      architectModel,
      builderProvider: resolvedBuilderProvider,
      builderModel: resolvedBuilderModel,
      thumbnailUrl: thumbnailByNodeId.get(activity.id),
      htmlHash,
      externalLibraryUrls: externalLibraryUrls(html),
      ...generationMetrics,
    }, null, 2)}\n`, "utf8");
    if (generated) console.log(`  ✓ ${activity.id} [${builder.provider}/${model}] saved ${Math.round(generated.elapsedMs / 1000)}s`);
    const artifact: DirectArtifact = {
      childId: input.childId,
      homeworkId: input.homeworkId,
      nodeId: activity.id,
      title: activity.title,
      htmlPath,
      artworkUrl,
      thumbnailUrl: thumbnailByNodeId.get(activity.id),
      creatorPrompt: activity.creatorPrompt,
      promptHash: resolvedPromptHash,
      plannerModel,
      creatorModel: model,
      architectModel,
      builderProvider: resolvedBuilderProvider,
      builderModel: resolvedBuilderModel,
      creatorContractVersion: resolvedCreatorContractVersion,
      creatorTestPath,
      creatorTestHash: resolvedCreatorTestHash,
      academicContractHash: activity.designArtifact?.academicContractHash,
      designArtifactHash,
      htmlHash,
      externalLibraryUrls: externalLibraryUrls(html),
      itemIds,
      ...generationMetrics,
    };
    await input.onArtifactSaved?.(artifact);
    return artifact;
  });
  const artifacts = activityBuild.results.filter((artifact): artifact is DirectArtifact => Boolean(artifact));
  if (activityBuild.failures.length > 0) {
    const failures = activityBuild.failures.map(({ index, error }) => {
      const activity = selectedActivities[index]!;
      const builder = builderAssignments.get(activity.id);
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ${activity.id} [${builder?.provider ?? "unknown"}/${builder?.model ?? "unknown"}] ${reason}`);
      return `${activity.id}:${builder?.provider ?? "unknown"}:${builder?.model ?? "unknown"}:${reason}`;
    });
    const completedIds = artifacts.map((artifact) => artifact.nodeId);
    const missingIds = selectedActivities
      .map((activity) => activity.id)
      .filter((nodeId) => !completedIds.includes(nodeId));
    throw new Error(
      `direct_activity_build_incomplete:completed=${completedIds.join(",") || "none"}:missing=${missingIds.join(",")}:failures=${failures.join("|")}`,
    );
  }
  if (input.plan.bonusActivity) {
    console.log(`  ○ ${input.plan.bonusActivity.id} bonus deferred until earned`);
  }
  return {
    artifacts,
    backgroundUrl,
    stats: {
      generatedNodeIds: generatedNodeIds.sort(),
      reusedNodeIds: reusedNodeIds.sort(),
      generatedImages: artworkBundle.generatedImages,
      reusedImages: artworkBundle.reusedImages,
      bonusDeferred: Boolean(input.plan.bonusActivity),
    },
  };
}

function contentType(file: string): string {
  if (/\.html$/i.test(file)) return "text/html; charset=utf-8";
  if (/\.jpe?g$/i.test(file)) return "image/jpeg";
  if (/\.png$/i.test(file)) return "image/png";
  return "application/octet-stream";
}

type DirectBrowserPage = Awaited<ReturnType<Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>["newPage"]>>;

async function openDirectArtifactPage(input: {
  page: DirectBrowserPage;
  artifact: DirectArtifact;
  port: number;
}): Promise<void> {
  await input.page.addInitScript(`window.__sunnyMessages=[];window.addEventListener("message",event=>window.__sunnyMessages.push(event.data));`);
  const launchPath = NODE_REGISTRY["generated-baseline"]?.getUrl?.({
    id: input.artifact.nodeId,
    type: "generated-baseline",
    gameHtmlPath: input.artifact.htmlPath,
    date: input.artifact.homeworkId,
    words: [],
    ...(input.artifact.spellingItemBindings ? { spellingItemBindings: input.artifact.spellingItemBindings } : {}),
    difficulty: 2,
  }, { childId: input.artifact.childId, companion: "elli", previewParam: "" });
  if (!launchPath) throw new Error("launch_url_missing");
  const navigation = await input.page.goto(`http://127.0.0.1:${input.port}${launchPath}`, { waitUntil: "load" });
  if (navigation?.status() !== 200 || !navigation.headers()["content-type"]?.includes("text/html")) {
    throw new Error("real_launch_not_html");
  }
}

async function creatorEventExists(
  page: DirectBrowserPage,
  assertion: Extract<CreatorPlaywrightAssertion, { type: "event" }>,
): Promise<void> {
  const eventType = JSON.stringify(assertion.eventType);
  const itemId = JSON.stringify(assertion.itemId ?? null);
  await page.waitForFunction(`(() => {
    const eventType = ${eventType}; const itemId = ${itemId};
    const messages = window.__sunnyMessages ?? [];
    const belongsToItem = message => {
      const payload = message?.payload && typeof message.payload === "object" ? message.payload : message;
      return payload?.target === itemId || payload?.itemId === itemId || payload?.currentChallenge?.id === itemId;
    };
    if (eventType === "progress_event" && itemId) {
      const attemptIndex = messages.findLastIndex(message => message?.type === "attempt_event" && belongsToItem(message));
      return attemptIndex >= 0 && messages.slice(attemptIndex + 1).some(message => message?.type === "progress_event");
    }
    return messages.some(message => {
      if (message?.type !== eventType) return false;
      if (!itemId) return true;
      return belongsToItem(message);
    });
  })()`, undefined, { timeout: 5_000 });
}

function creatorAssertionLabel(assertion: CreatorPlaywrightAssertion): string {
  return assertion.type === "event"
    ? `event:${assertion.eventType}`
    : `${assertion.type}:${assertion.selector}`;
}

async function runCreatorAssertion(
  page: DirectBrowserPage,
  assertion: CreatorPlaywrightAssertion,
  changedFrom?: string | null,
): Promise<void> {
  if (assertion.type === "event") {
    await creatorEventExists(page, assertion);
    return;
  }
  const locator = page.locator(assertion.selector).first();
  if (assertion.type === "hidden") {
    await locator.waitFor({ state: "hidden", timeout: 5_000 });
    return;
  }
  await locator.waitFor({ state: "visible", timeout: 5_000 });
  if (assertion.type === "visible") return;
  if (assertion.type === "enabled") {
    await page.waitForFunction(`(() => { const element = document.querySelector(${JSON.stringify(assertion.selector)}); return Boolean(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true"; })()`, undefined, { timeout: 5_000 });
    return;
  }
  if (assertion.type === "text_contains") {
    await page.waitForFunction(`document.querySelector(${JSON.stringify(assertion.selector)})?.textContent?.includes(${JSON.stringify(assertion.value)}) === true`, undefined, { timeout: 5_000 });
    return;
  }
  await page.waitForFunction(`document.querySelector(${JSON.stringify(assertion.selector)})?.outerHTML !== ${JSON.stringify(changedFrom ?? null)}`, undefined, { timeout: 5_000 });
}

async function runCreatorPlaywrightManifest(page: DirectBrowserPage, manifest: CreatorPlaywrightManifest): Promise<void> {
  for (const item of manifest.journey) {
    const changedBaselines = new Map<number, string | null>();
    for (let index = 0; index < item.assertions.length; index += 1) {
      const assertion = item.assertions[index]!;
      if (assertion.type === "changed") {
        changedBaselines.set(index, await page.locator(assertion.selector).first()
          .evaluate((element) => (element as unknown as { outerHTML: string }).outerHTML).catch(() => null));
      }
    }
    for (let index = 0; index < item.steps.length; index += 1) {
      const step = item.steps[index]!;
      try {
        const locator = page.locator(step.selector).first();
        if (step.action === "click") await locator.click();
        else if (step.action === "fill") await locator.fill(step.value ?? "");
        else if (step.action === "press") await locator.press(step.value ?? "Enter");
        else await locator.dragTo(page.locator(step.target!).first());
      } catch (error) {
        throw new Error(`creator_playwright_action_failed;item=${item.itemId};step=${index + 1};action=${step.action}:${step.selector};reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (let index = 0; index < item.assertions.length; index += 1) {
      const assertion = item.assertions[index]!;
      try {
        await runCreatorAssertion(page, assertion, changedBaselines.get(index));
      } catch (error) {
        throw new Error(`creator_playwright_assertion_failed;item=${item.itemId};assertion=${creatorAssertionLabel(assertion)};reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  for (const assertion of manifest.completionAssertions) {
    try {
      await runCreatorAssertion(page, assertion);
    } catch (error) {
      throw new Error(`creator_playwright_assertion_failed;item=completion;assertion=${creatorAssertionLabel(assertion)};reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function runDirectBrowserSmokeCheck(input: {
  artifacts: DirectArtifact[];
  rootDir?: string;
  itemContractsByNodeId?: Record<string, DirectItem[]>;
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
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | undefined;
  const failures: string[] = [], screenshots: string[] = [], captures: JourneyCapture[] = [];
  const creatorFailures: string[] = [];
  const creatorPassedViewports = new Set<string>();
  const creatorManifests = new Map<string, CreatorPlaywrightManifest>();
  const creatorManifestHashes: string[] = [];
  for (const artifact of input.artifacts) {
    if ((artifact.creatorContractVersion ?? 0) < 19) continue;
    if (!artifact.creatorTestPath || !fs.existsSync(artifact.creatorTestPath)) {
      const failure = `${artifact.nodeId}:creator_playwright_manifest_file_missing`;
      failures.push(failure); creatorFailures.push(failure); continue;
    }
    const bytes = fs.readFileSync(artifact.creatorTestPath, "utf8");
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!artifact.creatorTestHash || digest !== artifact.creatorTestHash) {
      const failure = `${artifact.nodeId}:creator_playwright_manifest_hash_mismatch`;
      failures.push(failure); creatorFailures.push(failure); continue;
    }
    try {
      const manifest = parseCreatorPlaywrightManifest(JSON.parse(bytes), {
        nodeId: artifact.nodeId,
        itemIds: artifact.itemIds ?? [],
      });
      creatorManifests.set(artifact.nodeId, manifest);
      creatorManifestHashes.push(digest);
    } catch (error) {
      const failure = `${artifact.nodeId}:${error instanceof Error ? error.message : String(error)}`;
      failures.push(failure); creatorFailures.push(failure);
    }
  }
  const screenshotDir = path.join(rootDir, "outputs", "math-browser-verification");
  try {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    for (const artifact of input.artifacts) for (const viewport of DISCOVERY_RELEASE_VIEWPORTS) {
      const creatorManifest = creatorManifests.get(artifact.nodeId);
      if ((artifact.creatorContractVersion ?? 0) >= 19 && creatorManifest) {
        const creatorPage = await browser.newPage({ viewport });
        const creatorErrors: string[] = [];
        creatorPage.on("pageerror", error => creatorErrors.push(error.message));
        try {
          await openDirectArtifactPage({ page: creatorPage, artifact, port: address.port });
          await assertMathControlsVisible(creatorPage);
          await runCreatorPlaywrightManifest(creatorPage, creatorManifest);
          creatorPassedViewports.add(viewport.name);
        } catch (error) {
          const failure = `${artifact.nodeId}:${viewport.name}:creator_playwright:${error instanceof Error ? error.message : String(error)}`;
          failures.push(failure); creatorFailures.push(failure);
        } finally {
          for (const error of creatorErrors) {
            const failure = `${artifact.nodeId}:${viewport.name}:creator_playwright:browser_error:${error}`;
            failures.push(failure); creatorFailures.push(failure);
          }
          await creatorPage.close();
        }
      }
      const page = await browser.newPage({ viewport });
      const viewportCaptures: JourneyCapture[] = [];
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await openDirectArtifactPage({ page, artifact, port: address.port });
        await assertMathControlsVisible(page);
        await verifyMathControlJourney(page, {
          completionType: "node_complete",
          itemIds: artifact.itemIds,
          requireItemStateTransitions: Boolean(artifact.itemIds?.length),
          itemContracts: input.itemContractsByNodeId?.[artifact.nodeId],
          journey: creatorManifest?.journey.map((item) => ({ itemId: item.itemId, steps: item.steps })),
          captureState: async (request) => {
            const recorded = await recordJourneyCapture(page, {
              outputDir: screenshotDir,
              filePrefix: `${artifact.nodeId.replace(/[^a-z0-9_-]/gi, "_")}-${viewport.name}`,
              viewport: viewport.name,
              request,
            }, viewportCaptures);
            for (const { from, to } of recorded.relabeled) {
              const index = screenshots.indexOf(from);
              if (index >= 0) screenshots[index] = to;
            }
            if (recorded.capture) screenshots.push(recorded.capture.path);
            return recorded.capture?.kind === "academic_item";
          },
        });
        const safeNodeId = artifact.nodeId.replace(/[^a-z0-9_-]/gi, "_");
        const completionTarget = path.join(screenshotDir, `${safeNodeId}-${viewport.name}-completion.png`);
        await page.screenshot({ path: completionTarget, fullPage: false });
        screenshots.push(completionTarget);
        viewportCaptures.push({
          path: completionTarget,
          label: path.basename(completionTarget, ".png"),
          kind: "completion",
          viewport: viewport.name,
          verifierVersion: DISCOVERY_VERIFIER_VERSION,
          observedItemId: null,
          promptVisible: false,
        });
      } catch (error) {
        failures.push(`${artifact.nodeId}:${viewport.name}:${error instanceof Error ? error.message : String(error)}`);
      } finally {
        failures.push(...errors.map(error => `${artifact.nodeId}:${viewport.name}:browser_error:${error}`));
        if (failures.some(failure => failure.startsWith(`${artifact.nodeId}:${viewport.name}:`))) {
          const target = path.join(screenshotDir, `${artifact.nodeId.replace(/[^a-z0-9_-]/gi,"_")}-${viewport.name}-failure.png`);
          await page.screenshot({ path: target, fullPage: false }).then(() => screenshots.push(target)).catch(error => failures.push(`screenshot_failed:${String(error)}`));
        }
        captures.push(...viewportCaptures);
        await page.close();
      }
    }
  } finally {
    try { await browser?.close(); } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  }
  const passed = failures.length === 0;
  const frozenContractsCovered = input.artifacts.length > 0 && input.artifacts.every(
    artifact => (input.itemContractsByNodeId?.[artifact.nodeId]?.length ?? 0) > 0,
  );
  const aggregateManifestHash = creatorManifestHashes.length === 1
    ? creatorManifestHashes[0]!
    : crypto.createHash("sha256").update(JSON.stringify(creatorManifestHashes.sort())).digest("hex");
  return {
    passed,
    failures,
    screenshots,
    captures,
    verification: {
      runtime: passed,
      scoring: passed && frozenContractsCovered,
      contracts: passed && frozenContractsCovered,
    },
    ...(input.artifacts.some((artifact) => (artifact.creatorContractVersion ?? 0) >= 19) ? {
      creatorTests: {
        passed: creatorFailures.length === 0,
        manifestHash: aggregateManifestHash,
        viewports: DISCOVERY_RELEASE_VIEWPORTS.map((viewport) => viewport.name)
          .filter((name) => creatorPassedViewports.has(name)),
        failures: creatorFailures,
      },
    } : {}),
  };
}

export function buildDirectActiveSessionPlan(input: {
  childId: string;
  homeworkId: string;
  plan: DirectLearningExperiencePlan;
  artifacts: DirectArtifact[];
  backgroundUrl: string;
  report: DirectPlaywrightReport;
  companion?: { id: string; name: string };
  createdAt?: string;
}): ActiveSessionPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const artifactById = new Map(input.artifacts.map((artifact) => [artifact.nodeId, artifact]));
  const engagementHypothesisForRoute = (routeId: string): string =>
    input.plan.agencyExperiment?.routes.find((route) => route.routeId === routeId)?.engagementHypothesis
    ?? input.plan.fork.hypothesis;
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
      source: "chart_planner", targetLane: activity.academicTarget, title: activity.title,
      ...(rounds.length > 0 ? { rounds } : {}),
      gameHtmlPath: artifact.htmlPath, date: input.homeworkId, thumbnailUrl: artifact.thumbnailUrl ?? previewUrl(activity.id, artifact.artworkUrl), contentId: `${input.homeworkId}:${activity.id}`, mechanic: activity.mechanic,
      engagementDimensions: [activity.engagementVariable as never], engagementHypothesis: engagementHypothesisForRoute(activity.routeId),
    };
  });
  const boardDefinition = requireBoardDefinition(input.plan.boardDefinition, nodePlan.map(node => node.id));
  const adventureBoard = renderBoardDefinition(boardDefinition, {
    boardId: `direct:${input.homeworkId}`, planId:input.plan.planId, childId:input.childId, domain:'math',
    companion: input.companion ?? {id:'elli',name:'Elli'},
    activities: nodePlan.map(node => ({...node,wordRadarConfig:node.wordRadarConfig ? {...node.wordRadarConfig} : undefined,verified:input.report.passed,state:'ready'})),
  });
  return {
    planId: input.plan.planId, childId: input.childId, createdAt, source: "ingest_human_loop", activeHomeworkId: input.homeworkId, domain: "math", testDate: null,
    nodePlan, boardDefinition, adventureBoard,
    variationPolicy: { avoidExactPreviousNodeOrder: true, avoidExactPreviousWordOrder: true, seed: input.homeworkId, previousCompletedNodeCount: 0 },
    companionPolicy: { companionId: input.companion?.id ?? "elli", displayName: input.companion?.name ?? "Elli", openingLinePolicy: "context_start_short", verbosity: "low", maxMicroProbes: 1 },
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
      evidenceContract: {
        academic: true,
        engagement: true,
        companionObservations: true,
        itemRoles: Object.fromEntries(activity.items.map((item) => [item.id, item.lineage.measurementRole])),
        itemContracts: Object.fromEntries(activity.items.map(item => [item.id, structuredClone(item)])),
      },
      evidenceIds: [],
    };
  });
  return {
    childId: input.childId,
    homeworkId: input.homeworkId,
    domain: "math",
    boardDefinition: input.activeSessionPlan.boardDefinition,
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
    ...(input.plannerPlan.agencyExperiment ? {
      agencyExperiment: {
        experimentId: input.plannerPlan.agencyExperiment.experimentId,
        sharedNodeIds: input.plannerPlan.activities
          .filter((activity) => !input.plannerPlan.agencyExperiment!.routes.some((route) => route.nodeIds.includes(activity.id)))
          .map((activity) => activity.id),
        routes: input.plannerPlan.agencyExperiment.routes.map((route) => ({
          routeId: route.routeId,
          nodeIds: [...route.nodeIds],
        })),
      },
    } : {}),
    nodes: baselineNodes,
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

export async function persistDirectExperience(input: {
  rootDir?: string;
  childId: string;
  homeworkId: string;
  extraction: AssignmentSourceExtraction;
  plannerPlan: DirectLearningExperiencePlan;
  activeSessionPlan: ActiveSessionPlan;
  artifacts: DirectArtifact[];
  report: DirectPlaywrightReport;
  assumptions?: MathLearningProgram["assumptions"];
}): Promise<string> {
  if (!input.report.passed || input.report.failures.length) throw new Error("direct_publication_browser_verification_required");
  const rootDir = input.rootDir ?? process.cwd();
  const contextDir = resolveChildContextDir(input.childId, { rootDir });
  const canvasProof = await verifyAuthoredBoardCanvas({definition:requireBoardDefinition(input.activeSessionPlan.boardDefinition,input.activeSessionPlan.nodePlan.map(node=>node.id)),rootDir,directory:path.join(contextDir,"homework","direct-drafts",input.homeworkId,"canvas-verification")});
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
  const contentCatalogPath = path.join(contextDir, "content_catalog.json");
  const ledgerEntry = {
    childId: input.childId,
    homeworkId: input.homeworkId,
    sourceFilename: input.extraction.filename,
    concept: {
      ...input.plannerPlan.concept,
      assumptions: (input.assumptions ?? []).map((assumption) => assumption.claim),
    },
    boardSummary: {
      title: input.plannerPlan.title,
      routeLabels: input.plannerPlan.fork.routes.map((route) => route.label),
      activityCount: input.plannerPlan.activities.length,
    },
    ingestedAt: now,
  };
  const ledgerPath = assignmentLedgerPath(ledgerEntry, { rootDir });
  const publicationPaths = [directPath, planPath, homeworkPath, profilePath, contentCatalogPath, cyclePath, ledgerPath];
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
  if (existingCycle?.boards) {
    // Published boards are immutable: the same assignment resumes as-is (contract 21).
    if (existingCycle.assignment.contentFingerprint !== canonicalInput.assignment.contentFingerprint) {
      throw new Error(`learning_cycle_reingestion_fingerprint_changed:${input.homeworkId}`);
    }
    if(existingCycle.lifecycle!=="blocked" && existingCycle.boards.some(board=>board.kind==="teaching" && board.predecessorBoardId===null && board.publishedAt===null)) {
      await verifyPreparingBoardCanvas({rootDir,childId:input.childId,homeworkId:input.homeworkId,directory:path.join(contextDir,"homework","direct-drafts",input.homeworkId,"canvas-verification")});
    }
    console.log(` 🎮 [learning-cycle] [reingestion] [resumed] homework=${input.homeworkId} revision=${existingCycle.revision}`);
  } else if (existingCycle && !existingCycle.adaptiveGeneration?.designHash) {
    transitionLearningCycle(input.childId, input.homeworkId, existingCycle.revision, {
      type: "plan_reconciled",
      assignment: canonicalInput.assignment,
      academicTheory: canonicalInput.academicTheory,
      engagementTheory: canonicalInput.engagementTheory,
      nodes: canonicalInput.nodes,
      academicPredictions: canonicalInput.academicPredictions,
      assumptions: canonicalInput.assumptions,
      agencyExperiment: canonicalInput.agencyExperiment,
      boardDefinition: canonicalInput.boardDefinition,
      reason: "Re-ingestion reconciled the AI-authored board with the existing assignment cycle.",
    }, { rootDir, now: new Date(now) });
  } else if (!existingCycle) {
    const created = createLearningCycle(withInitialBoard(canonicalInput, "teaching", now), { rootDir, now: new Date(now) });
    transitionLearningCycle(input.childId,input.homeworkId,created.revision,{type:"board_canvas_verified",boardId:created.boards![0].boardId,proof:canvasProof},{rootDir,now:new Date(now)});
  }
  writeAssignmentLedgerEntry(ledgerEntry, { rootDir });
  fs.mkdirSync(path.dirname(directPath), { recursive: true });
  fs.writeFileSync(directPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  let previousPlan: { activeByDomain?: unknown } = {};
  let previousHomework: { activeByDomain?: unknown } = {};
  try { previousPlan = JSON.parse(fs.readFileSync(planPath, "utf8")) as typeof previousPlan; } catch { previousPlan = {}; }
  try { previousHomework = JSON.parse(fs.readFileSync(homeworkPath, "utf8")) as typeof previousHomework; } catch { previousHomework = {}; }
  const planFile = {
    version: 1,
    childId: input.childId,
    selectedDomain: "math",
    current: input.activeSessionPlan,
    activeByDomain: mergeActiveDomainProjection(previousPlan.activeByDomain, "math", input.activeSessionPlan),
    updatedAt: now,
  };
  fs.mkdirSync(path.join(contextDir, "plans"), { recursive: true });
  fs.writeFileSync(planPath, `${JSON.stringify(planFile, null, 2)}\n`, "utf8");
  const pending = { weekOf: now.slice(0, 10), testDate: null, returnTag: `#sunny_${input.childId}_${input.homeworkId}`, wordList: [], contentProfile: { practiceDomain: "math", topic: input.plannerPlan.title }, capturedContent: { title: input.plannerPlan.title, rawText: input.extraction.fullText }, homeworkId: input.homeworkId, generatedAt: now, nodes: input.activeSessionPlan.nodePlan };
  const homeworkFile = {
    version: 1,
    childId: input.childId,
    selectedDomain: "math",
    current: pending,
    activeByDomain: mergeActiveDomainProjection(previousHomework.activeByDomain, "math", pending),
    updatedAt: now,
  };
  fs.writeFileSync(homeworkPath, `${JSON.stringify(homeworkFile, null, 2)}\n`, "utf8");
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  profile.pendingHomework = pending;
  profile.activeSessionPlan = input.activeSessionPlan;
  let sharedCatalog: AIContentCatalogItem[] = [];
  try {
    const shared = JSON.parse(fs.readFileSync(contentCatalogPath, "utf8")) as { items?: AIContentCatalogItem[] };
    sharedCatalog = Array.isArray(shared.items) ? shared.items : [];
  } catch {
    sharedCatalog = [];
  }
  const profileCatalog = Array.isArray(profile.aiContentCatalog) ? profile.aiContentCatalog as AIContentCatalogItem[] : [];
  const existingById = new Map([...sharedCatalog, ...profileCatalog].map((entry) => [entry.contentId, entry]));
  const existingCatalog = [...existingById.values()];
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
      reviewReason: "Published after real browser controls completed; parent assessment-validity review remains separate.",
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
  const bonusActivity = input.plannerPlan.bonusActivity;
  const bonusArtifact = bonusActivity
    ? input.artifacts.find((candidate) => candidate.nodeId === bonusActivity.id)
    : undefined;
  if (bonusActivity && bonusArtifact) {
    const design = bonusActivity.designArtifact;
    publishedEntries.push({
      contentId: `${input.homeworkId}:${bonusActivity.id}`,
      homeworkId: input.homeworkId,
      childId: input.childId,
      type: "game",
      source: "generated",
      purpose: "dopamine_reward",
      title: bonusActivity.title,
      activityId: bonusActivity.id,
      gameHtmlPath: bonusArtifact.htmlPath,
      domain: "math",
      skillTarget: bonusActivity.academicTarget,
      algorithmTargets: ["retrieval-practice", "variable-reward", "activity-affinity"],
      targetSkills: [bonusActivity.academicTarget],
      targetConcepts: [input.plannerPlan.concept.conceptId],
      targetWords: [],
      engagementHooks: [bonusActivity.engagementVariable],
      inputEvidence: { contentFingerprint: input.extraction.fileHash },
      reuseStatus: "candidate",
      reuseReason: "Optional practice-only earned reward awaiting factual child engagement evidence.",
      reviewStatus: "approved_ready",
      reviewReason: "Optional reward artifact; it is excluded from mastery and cannot block the learning board.",
      validationStatus: "passed",
      mechanic: bonusActivity.mechanic,
      theme: bonusActivity.visualMock.scene,
      ...(design ? {
        designMemory: {
          artifactId: design.artifactId,
          artifactHash: crypto.createHash("sha256").update(JSON.stringify(design)).digest("hex"),
          academicResponsibility: bonusActivity.responsibilityId,
          interactionHistory: [design.coreInteraction],
          themeHistory: [design.visualDirection],
          humanReview: "not_reviewed",
          childEvidenceIds: [],
          predictionIds: [],
          theoryDecisionIds: [],
          plannerModel: bonusArtifact.plannerModel,
          architectModel: bonusArtifact.architectModel,
          builderProvider: bonusArtifact.builderProvider,
          builderModel: bonusArtifact.builderModel,
          academicContractHash: bonusArtifact.academicContractHash,
          implementationPromptHash: bonusArtifact.promptHash,
          generatedHtmlHash: bonusArtifact.htmlHash,
        },
      } : {}),
    });
  }
  const publishedIds = new Set(publishedEntries.map((entry) => entry.contentId));
  profile.aiContentCatalog = [
    ...existingCatalog.filter((entry) => !publishedIds.has(entry.contentId)),
    ...publishedEntries,
  ];
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  writeWaterfallContentCatalog(input.childId, profile, { rootDir });
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
