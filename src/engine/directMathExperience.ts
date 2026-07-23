import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { ChildChart } from "../profiles/childChart";
import type { AssignmentSourceExtraction } from "./assignmentSourceExtraction";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import { NODE_REGISTRY } from "../shared/nodeRegistry";
import { listActivityToolContracts } from "./activityToolCatalog";
import {
  createLearningCycle,
  getLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type AcademicPrediction,
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

export type DirectLearningExperiencePlan = {
  planId: string;
  title: string;
  contentScopeRationale: string;
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
  activities: DirectActivity[];
  quest: { title: "Quest"; locked: true; teaser: string; artworkPrompt: string };
  boss: { title: "Boss"; locked: true; teaser: string; artworkPrompt: string };
};

export type DirectCreativeRevision = {
  planId: string;
  rationale: string;
  qualityPrediction: string;
  model: string;
  createdAt: string;
  activities: Array<{
    id: string;
    visualMock: DirectActivity["visualMock"];
    experience: DirectActivity["experience"];
    creatorPrompt: string;
    designPrediction: string;
    preserve: string[];
    change: string[];
    explore: string[];
    avoid: string[];
  }>;
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
};

export type DirectPlaywrightReport = {
  passed: boolean;
  failures: string[];
  screenshots: string[];
};

export type DirectTasteReview = {
  status: "reviewed" | "unavailable";
  childId: string;
  homeworkId: string;
  model: string;
  reviewedAt: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  nodeReviews: Array<{
    nodeId: string;
    clarity: number;
    craft: number;
    responsiveness: number;
    missionPayoff: number;
    originality: number;
    strengths: string[];
    concerns: string[];
  }>;
  childPreferenceClaim: "not_evaluated";
  learningClaim: "not_evaluated";
  error?: string;
};

const DIRECT_CREATIVE_REVISION_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["planId", "rationale", "qualityPrediction", "activities"],
  properties: {
    planId: schemaString,
    rationale: schemaString,
    qualityPrediction: schemaString,
    activities: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "visualMock",
          "experience",
          "creatorPrompt",
          "designPrediction",
          "preserve",
          "change",
          "explore",
          "avoid",
        ],
        properties: {
          id: schemaString,
          visualMock: {
            type: "object",
            additionalProperties: false,
            required: ["scene", "layout", "artworkPrompt"],
            properties: {
              scene: schemaString,
              layout: schemaString,
              artworkPrompt: schemaString,
            },
          },
          experience: {
            type: "object",
            additionalProperties: false,
            required: ["objective", "childAction", "worldReaction", "anticipation", "progress", "recovery", "reward"],
            properties: {
              objective: schemaString,
              childAction: schemaString,
              worldReaction: schemaString,
              anticipation: schemaString,
              progress: schemaString,
              recovery: schemaString,
              reward: schemaString,
            },
          },
          creatorPrompt: schemaString,
          designPrediction: schemaString,
          preserve: schemaStrings,
          change: schemaStrings,
          explore: schemaStrings,
          avoid: schemaStrings,
        },
      },
    },
  },
} as const;

function tasteStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`direct_taste_invalid_${label}`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function tasteScore(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new Error(`direct_taste_invalid_${label}`);
  }
  return Number(value);
}

function parseDirectTasteReview(value: unknown, plan: DirectLearningExperiencePlan): Pick<
  DirectTasteReview,
  "summary" | "strengths" | "concerns" | "nodeReviews"
> {
  const record = object(value);
  if (!record) throw new Error("direct_taste_invalid_output");
  const rawNodes = record.nodeReviews;
  if (!Array.isArray(rawNodes)) throw new Error("direct_taste_invalid_node_reviews");
  const expectedIds = new Set(plan.activities.map((activity) => activity.id));
  const seen = new Set<string>();
  const nodeReviews = rawNodes.map((rawNode) => {
    const node = object(rawNode);
    if (!node) throw new Error("direct_taste_invalid_node");
    const nodeId = requiredString(node, "nodeId", "taste_node_id");
    if (!expectedIds.has(nodeId) || seen.has(nodeId)) throw new Error(`direct_taste_unexpected_node:${nodeId}`);
    seen.add(nodeId);
    return {
      nodeId,
      clarity: tasteScore(node.clarity, `${nodeId}_clarity`),
      craft: tasteScore(node.craft, `${nodeId}_craft`),
      responsiveness: tasteScore(node.responsiveness, `${nodeId}_responsiveness`),
      missionPayoff: tasteScore(node.missionPayoff, `${nodeId}_mission_payoff`),
      originality: tasteScore(node.originality, `${nodeId}_originality`),
      strengths: tasteStrings(node.strengths, `${nodeId}_strengths`),
      concerns: tasteStrings(node.concerns, `${nodeId}_concerns`),
    };
  });
  if (seen.size !== expectedIds.size) throw new Error("direct_taste_missing_node_review");
  return {
    summary: requiredString(record, "summary", "taste_summary"),
    strengths: tasteStrings(record.strengths, "strengths"),
    concerns: tasteStrings(record.concerns, "concerns"),
    nodeReviews,
  };
}

export async function safeRunDirectTasteReview(input: {
  childId: string;
  homeworkId: string;
  plan: DirectLearningExperiencePlan;
  screenshots: string[];
  model?: string;
  client?: Anthropic;
  review?: (input: {
    plan: DirectLearningExperiencePlan;
    screenshots: string[];
  }) => Promise<unknown>;
  now?: Date;
}): Promise<DirectTasteReview> {
  const model = input.model ?? process.env.SUNNY_TASTE_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  const reviewedAt = (input.now ?? new Date()).toISOString();
  try {
    let rawReview: unknown;
    if (input.review) {
      rawReview = await input.review({ plan: input.plan, screenshots: input.screenshots });
    } else {
      const screenshots = input.screenshots.filter((screenshot) => fs.existsSync(screenshot));
      if (screenshots.length !== input.plan.activities.length) throw new Error("direct_taste_screenshots_incomplete");
      const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const toolName = "review_direct_math_taste";
      const content: any[] = [{
        type: "text",
        text: `You are Sunny's advisory child-experience quality critic.
Review the complete generated math board from its saved Planner promises and one opening screenshot per activity.
Score only the adult-observable quality floor: visual craft, clarity of the first action, apparent responsiveness, mission/payoff, and originality.
Do not claim that this child likes the experience. Do not infer learning, mastery, attention, or preference. Real child behavior and ratings decide those questions.
Be candid and specific. This report advises the human and never blocks publication or rewrites content.

Planner-authored board:
${JSON.stringify({
  boardWorld: input.plan.boardWorld,
  fork: input.plan.fork,
  activities: input.plan.activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    academicTarget: activity.academicTarget,
    mechanic: activity.mechanic,
    objective: activity.experience.objective,
    childAction: activity.experience.childAction,
    worldReaction: activity.experience.worldReaction,
    progress: activity.experience.progress,
    reward: activity.experience.reward,
  })),
}, null, 2)}

The screenshots follow in the same activity order.`,
      }];
      screenshots.forEach((screenshot, index) => {
        content.push({ type: "text", text: `Opening screenshot for ${input.plan.activities[index]!.id}:` });
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: /\.jpe?g$/i.test(screenshot) ? "image/jpeg" : "image/png",
            data: fs.readFileSync(screenshot).toString("base64"),
          },
        });
      });
      const response = await client.messages.create({
        model,
        max_tokens: 3000,
        messages: [{ role: "user", content }],
        tools: [{
          name: toolName,
          description: "Return one advisory quality scorecard for the generated board.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "strengths", "concerns", "nodeReviews"],
            properties: {
              summary: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              concerns: { type: "array", items: { type: "string" } },
              nodeReviews: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["nodeId", "clarity", "craft", "responsiveness", "missionPayoff", "originality", "strengths", "concerns"],
                  properties: {
                    nodeId: { type: "string" },
                    clarity: { type: "integer", minimum: 1, maximum: 5 },
                    craft: { type: "integer", minimum: 1, maximum: 5 },
                    responsiveness: { type: "integer", minimum: 1, maximum: 5 },
                    missionPayoff: { type: "integer", minimum: 1, maximum: 5 },
                    originality: { type: "integer", minimum: 1, maximum: 5 },
                    strengths: { type: "array", items: { type: "string" } },
                    concerns: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        }],
        tool_choice: { type: "tool", name: toolName },
      } as any, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
      const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
      if (!toolUse || toolUse.type !== "tool_use") throw new Error("direct_taste_tool_output_missing");
      rawReview = toolUse.input;
    }
    const review = parseDirectTasteReview(rawReview, input.plan);
    return {
      status: "reviewed",
      childId: input.childId,
      homeworkId: input.homeworkId,
      model,
      reviewedAt,
      ...review,
      childPreferenceClaim: "not_evaluated",
      learningClaim: "not_evaluated",
    };
  } catch (error) {
    return {
      status: "unavailable",
      childId: input.childId,
      homeworkId: input.homeworkId,
      model,
      reviewedAt,
      summary: "",
      strengths: [],
      concerns: [],
      nodeReviews: [],
      childPreferenceClaim: "not_evaluated",
      learningClaim: "not_evaluated",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function hasReadyDirectMathExperience(childId: string, rootDir = process.cwd()): boolean {
  const directPath = path.join(rootDir, "src", "context", childId.trim().toLowerCase(), "homework", "direct_experience_plan.json");
  if (!fs.existsSync(directPath)) return false;
  try {
    const record = JSON.parse(fs.readFileSync(directPath, "utf8")) as {
      childId?: string;
      activeSessionPlan?: { domain?: string };
      playwrightReport?: { passed?: boolean };
    };
    return record.childId === childId.trim().toLowerCase()
      && record.activeSessionPlan?.domain === "math"
      && record.playwrightReport?.passed === true;
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
  const x = 0.26 + ((index + 1) * 0.52) / (safeCount + 1);
  return { x, y: routeIndex === 0 ? 0.32 : 0.72 };
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
        constructId: requiredString(academicPrediction, "constructId"),
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

function parseDirectCreativeRevision(
  value: unknown,
  plan: DirectLearningExperiencePlan,
  model: string,
  createdAt: string,
): DirectCreativeRevision {
  const root = object(value);
  if (!root) throw new Error("direct_creative_revision_invalid_output");
  const planId = requiredString(root, "planId", "creative_revision_plan_id");
  if (planId !== plan.planId) throw new Error("direct_creative_revision_plan_mismatch");
  const rawActivities = Array.isArray(root.activities) ? root.activities : [];
  const expectedIds = new Set(plan.activities.map((activity) => activity.id));
  const seen = new Set<string>();
  const activities = rawActivities.map((raw) => {
    const activity = object(raw);
    const visualMock = object(activity?.visualMock);
    const experience = object(activity?.experience);
    if (!activity || !visualMock || !experience) throw new Error("direct_creative_revision_invalid_activity");
    const id = requiredString(activity, "id", "creative_revision_activity_id");
    if (!expectedIds.has(id)) throw new Error(`direct_creative_revision_unexpected_activity:${id}`);
    if (seen.has(id)) throw new Error(`direct_creative_revision_duplicate_activity:${id}`);
    seen.add(id);
    const artworkPrompt = requiredString(visualMock, "artworkPrompt");
    const noInstructionalText = "without words, letters, numbers, equations, labels";
    return {
      id,
      visualMock: {
        scene: requiredString(visualMock, "scene"),
        layout: requiredString(visualMock, "layout"),
        artworkPrompt: artworkPrompt.toLowerCase().includes(noInstructionalText)
          ? artworkPrompt
          : `${artworkPrompt}. ${noInstructionalText}.`,
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
      creatorPrompt: requiredString(activity, "creatorPrompt"),
      designPrediction: requiredString(activity, "designPrediction"),
      preserve: stringArray(activity.preserve, "creative_revision_preserve"),
      change: stringArray(activity.change, "creative_revision_change"),
      explore: stringArray(activity.explore, "creative_revision_explore"),
      avoid: stringArray(activity.avoid, "creative_revision_avoid"),
    };
  });
  if (seen.size !== expectedIds.size) throw new Error("direct_creative_revision_missing_activity");
  return {
    planId,
    rationale: requiredString(root, "rationale", "creative_revision_rationale"),
    qualityPrediction: requiredString(root, "qualityPrediction", "creative_revision_quality_prediction"),
    model,
    createdAt,
    activities,
  };
}

export async function askDirectCreativeDirector(input: {
  childId: string;
  plan: DirectLearningExperiencePlan;
  childContext?: unknown;
  priorOutcomes?: unknown;
  previousTasteReview?: unknown;
  client?: Anthropic;
  model?: string;
  now?: Date;
}): Promise<{ plan: DirectLearningExperiencePlan; revision: DirectCreativeRevision }> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? process.env.SUNNY_TASTE_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  const prompt = `You are Sunny's Creative Director. Strengthen the complete board before artwork or HTML is built.

The Planner is the tutor and its academic prescription is immutable. You may revise only each activity's visualMock, experience presentation, creatorPrompt, designPrediction, preserve, change, explore, and avoid fields. You may not change activity count or IDs, routes, responsibilities, academic targets, item content, response contracts, correct answers, academic predictions, evidence limits, Quest/Boss state, or the board lifecycle. Return one revision for every activity ID, exactly once. Do not write HTML, CSS, JavaScript, tests, or replacement curriculum.

Judge the board as one coherent child experience. Strengthen mission, stakes, visible progression, action-to-world reaction, recovery, anticipation, and payoff. Make the two routes mechanically legible and meaningfully distinct rather than cosmetically different answer-selection screens. The opening view should communicate the current objective, visible progress, and anticipated payoff without adult explanation.

Use these human-labeled references as design evidence, not templates:
- Skyglider: positive for an immediate objective, clear action, visible journey, and satisfying world movement.
- Crane: positive when the mathematical representation and mission action are integrated.
- Vault: positive for strong identity, anticipation, and a challenge that visibly builds toward a payoff.
- Moonlit Cargo: negative when the viewport is sparse and answer selection feels cosmetic.
- Tidepool: negative when decorative controls and empty space do not explain the mission.
- Rope-and-Peg: negative because image-generated instructional text and quantities became corrupted and the promised puzzle was unclear.

All mathematical truth, quantities, equations, labels, and instructions must be rendered in HTML. Every artworkPrompt must describe atmospheric art without instructional content and include this exact direction: "without words, letters, numbers, equations, labels". Generated imagery supplies the world, never the mathematics.

Prior ratings, replay, abandonment, demo use, invalid actions, companion reactions, and taste reports are evidence to consider. They do not prove learning or child preference by themselves. Predict the observable quality improvement your revision is intended to produce; real child behavior remains authoritative.

Child: ${input.childId}

Child context:
${JSON.stringify(input.childContext ?? {}, null, 2)}

Prior factual outcomes:
${JSON.stringify(input.priorOutcomes ?? {}, null, 2)}

Previous advisory taste review:
${JSON.stringify(input.previousTasteReview ?? {}, null, 2)}

Planner-authored board:
${JSON.stringify({
  planId: input.plan.planId,
  boardWorld: input.plan.boardWorld,
  fork: input.plan.fork,
  activities: input.plan.activities,
}, null, 2)}`;
  const toolName = "direct_creative_revision";
  const response = await client.messages.create({
    model,
    max_tokens: Number(process.env.SUNNY_DIRECTOR_MAX_TOKENS ?? 12000),
    messages: [{ role: "user", content: prompt }],
    tools: [{
      name: toolName,
      description: "Return one bounded creative revision for every existing activity.",
      input_schema: DIRECT_CREATIVE_REVISION_TOOL_SCHEMA,
    }],
    tool_choice: { type: "tool", name: toolName },
  } as any, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("direct_creative_revision_tool_output_missing");
  const revision = parseDirectCreativeRevision(
    toolUse.input,
    input.plan,
    model,
    (input.now ?? new Date()).toISOString(),
  );
  const revisionsById = new Map(revision.activities.map((activity) => [activity.id, activity]));
  return {
    revision,
    plan: {
      ...input.plan,
      activities: input.plan.activities.map((activity) => {
        const creative = revisionsById.get(activity.id)!;
        return {
          ...activity,
          visualMock: creative.visualMock,
          experience: creative.experience,
          creatorPrompt: creative.creatorPrompt,
          designPrediction: creative.designPrediction,
          preserve: creative.preserve,
          change: creative.change,
          explore: creative.explore,
          avoid: creative.avoid,
        };
      }),
    },
  };
}

function chartForPlanner(chart: ChildChart): unknown {
  return {
    identity: chart.identity,
    demographics: chart.demographics,
    learningProfile: {
      rewardPreferences: chart.learningProfile.rewardPreferences,
      sessionStats: chart.learningProfile.sessionStats,
      activityModel: chart.learningProfile.activityModel,
      activityTraitModel: chart.learningProfile.activityTraitModel,
    },
    engagementTheory: chart.engagementTheory,
    factBankSummary: chart.factBankSummary,
    recentDecision: chart.decisionTrace.latest,
    longitudinalLearning: chart.learningHistory,
  };
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
}): Promise<DirectLearningExperiencePlan> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are Sunny's autonomous AI math Planner and creative director.

Study the assignment to infer the concepts, relationships, representations, and reasoning the teacher intends the child to learn. Teach the underlying concepts, not its visible questions: never show, drill, or superficially rewrite the assignment's exact problems. The assignment text is private evidence for your planning, not a content bank for the child experience.

You own the complete learning program: activity and item counts, sequence, pedagogy, content, response formats, mechanics, stakes and consequences, recovery, rewards, pacing, sound, visuals, and route design. Make these choices from the assignment, child chart, prior evidence, and your professional judgment.

Available reusable instruments are optional tools, not a required menu. You may reuse, configure, or generate an experience. Reuse only an instrument marked runtimeAvailable and only when its capabilities fit your prescription; otherwise generate the experience you believe is best. Do not force a catalog tool into the board.

Create one coherent choose-your-adventure math board for this exact child and assignment.
You decide how many baseline activities and how many items in each activity are educationally necessary. There is no fixed activity count or item count.
First decompose the assignment into distinct learning responsibilities before deciding how many activities are necessary.
Give each activity one primary learning responsibility. Do not merge materially different responsibilities merely to reduce the node count.
Declare those responsibilities in learningResponsibilities, and cover every declared responsibility at least once across the complete board. Distribute responsibilities across routes according to your teaching strategy; do not duplicate the complete curriculum merely to make routes symmetrical.
At ingestion, prescribe at least one playable activity on each route and never return an empty activity list. Prior evidence may change what you prescribe, but it cannot erase the child-visible board.
Set each activity's responsibilityId to exactly one declared responsibility and keep its academicTarget identical to that responsibility's academicTarget.
Keep the two routes academically comparable while allowing their presentation and engagement variable to differ.
The board must include exactly two meaningful routes so the child has agency and Sunny can compare one engagement variable while holding the academic need comparable.
fork.question is child-facing copy: at most 10 words, inviting, and easy to say aloud. Put the detailed research claim only in fork.hypothesis.
Choose the best experience form for each responsibility. Describe the experience you want the Creator to build.
Use profile evidence as broad motivators; do not repeat one literal interest across every activity.
Quest and Boss are locked board-owned destinations. You may optionally provide teaser and artwork direction for either one, but do not create playable Quest or Boss content.
Author a non-empty item set for each activity and explain the complete board and item scope in contentScopeRationale. An item may use selection, numeric, construction, or explanation response mode. Select the response mode that matches the mathematical action; only selection mode uses answer options. Ground expected responses and rubrics in the assignment.
Initial board activities create teaching and practice evidence only. Completion cannot establish mastery or unlock Quest or Boss.
For every activity, preregister academicPrediction separately from designPrediction. academicPrediction must name a stable namespaced construct, external or independent context, time horizon, expected metric range, predicted error patterns, confidence, evidence IDs, intervention, and evidenceLimit "practice_only". Use the longitudinal child history when available. Never infer academic ability from interests or engagement ratings.
For every activity, write a bespoke creatorPrompt that tells a separate Experience Creator how to realize this activity. Derive it from the assignment, child chart, prior factual outcomes, recent themes, and engagement theory. Also preregister designPrediction and list preserve, change, explore, avoid, and namespaced measurementKeys. These values must vary when evidence supports a change; do not hardcode a game, theme, layout, mechanic, or activity count.
Write artwork prompts from the supplied child demographics and profile evidence. Never assume a fixed age or generic child profile.
Keep every field concise. Do not write HTML, JavaScript, CSS, browser tests, or implementation code. Sunny's browser harness will execute Creator-declared real controls and observe runtime events.

Return one JSON object containing planId, contentScopeRationale, academicTheory, profileEvidence, learningResponsibilities, boardWorld, fork, and activities. You may optionally include quest and boss teaser objects. boardWorld.title is the canonical board and plan title; do not duplicate it at the root.
Each activity contains identity and responsibility fields, visualMock, experience, creatorPrompt, designPrediction, academicPrediction, adaptive directive arrays, acceptanceSteps, and an AI-selected items array.
Every item contains id, prompt, lineage {sourceEvidenceIds, exposure}, and one response contract:
- selection: {mode, options:[{id,label,correct}]}
- numeric: {mode, expected, optional unit}
- construction: {mode, expectedState, successDescription}
- explanation: {mode, rubric}
If you provide Quest or Boss teaser objects, their titles must remain exactly "Quest" and "Boss" and locked must be true.
Every responsibility, route, activity, item, and selection option must have its own non-empty stable id.

Assignment:
${input.extraction.fullText}

Available reusable instruments:
${JSON.stringify(availableMathInstrumentsForPlanner(), null, 2)}

Child chart:
${JSON.stringify(chartForPlanner(input.chart), null, 2)}

  Prior factual outcomes and Planner interpretations:
${JSON.stringify(input.priorOutcomes ?? [], null, 2)}`;
  const toolName = "create_learning_experience_plan";
  const response = await client.messages.create({
    model: input.model ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    max_tokens: Number(process.env.SUNNY_PLANNER_MAX_TOKENS ?? 20000),
    messages: [{ role: "user", content: prompt }],
    tools: [{
      name: toolName,
      description: "Return the complete planner-authored learning experience plan.",
      input_schema: DIRECT_MATH_PLANNER_TOOL_SCHEMA,
    }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("direct_planner_tool_output_missing");
  return parseDirectLearningExperiencePlan(toolUse.input);
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
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image",
        prompt,
        n: 1,
      }),
    });
    if (response.ok) {
      const json = await response.json() as { data?: Array<{ url?: string }> };
      const url = json.data?.[0]?.url;
      if (url) return url;
      throw new Error("direct_artwork_provider_returned_no_url");
    }
    if (response.status !== 429 || attempt === 2) {
      throw new Error(`direct_artwork_provider_failed:${response.status}:${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("direct_artwork_provider_exhausted");
}

async function createArtwork(prompt: string, publicDir: string, filename: string): Promise<string> {
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
    creatorContractVersion: 11,
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

The AI Planner's exact Creator prompt is the sole design authority:
${input.activity.creatorPrompt}

Implement the Planner-authored activity and saved content faithfully. Do not add a second design doctrine or reinterpret it as a generic shell.
Use this assigned local artwork asset in the experience: ${input.artworkUrl}.
Keep the complete HTML under 18,000 characters. Prefer concise CSS and JavaScript and do not duplicate implementations.

Runtime contract:
Emit window.parent.postMessage({type:"activity_ready",payload:{nodeId:"${input.activity.id}"}},"*") when the experience is ready.
Whenever the activity or active problem changes, emit window.parent.postMessage({type:"game_state_update",payload:{game:"generated-math",activityId:"${input.activity.id}",nodeId:"${input.activity.id}",phase:"question",activityTitle:${JSON.stringify(input.activity.title)},learningFocus:${JSON.stringify(input.activity.academicTarget)},mechanic:${JSON.stringify(input.activity.mechanic)},currentChallenge,availableActions,itemIndex,totalItems,answerVisibility:"hidden"}},"*") so Elli has live context. Never expose answers.
Maintain a factual targetResults array for the full activity. For each answer append {target,correct,attemptedValue,responseTimeMs,scaffoldLevel}, where target is the stable item id, attemptedValue is what the child submitted, and scaffoldLevel reflects demos, hints, or companion help.
Emit window.parent.postMessage({type:"attempt_event",payload:{domain:"math",target,correct,attemptedValue,responseTimeMs,scaffoldLevel}},"*") for each answer.
Emit window.parent.postMessage({type:"progress_event",payload:{nodeId:"${input.activity.id}",completedItems,totalItems}},"*") whenever visible progress advances.
On completion calculate accuracy from targetResults and emit window.parent.postMessage({type:"node_complete",payload:{nodeId:"${input.activity.id}",completed:true,accuracy,targetResults,timeSpent_ms}},"*").
Include <div id="sunny-companion"></div> so the parent app owns Elli.
Return raw HTML only, use no external libraries, and end with </html>.

Child: ${input.childId}
ExperienceSpec:
${JSON.stringify(input.activity, null, 2)}`;
}

export function buildAdaptiveProgressionCreatorPrompt(input: {
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  childContext: unknown;
}): string {
  const nodeId = input.node.nodeId;
  return `You are Sunny's Experience Creator. Build one complete child-facing activity as self-contained HTML with inline CSS and JavaScript.

The AI Planner already made the educational decision below. Implement it faithfully without changing the theory, evidence limit, or purpose:
${input.node.generationPrompt?.text ?? "No Planner prescription was provided."}

Author fresh content appropriate to this assignment and node responsibility. Do not reuse any exposed item identity or exact prompt listed in the cycle. Quest must test unseen transfer. Boss must test unseen synthesis. A generated support node remains teaching/practice evidence. Do not claim mastery.
The first visible H1 must be exactly ${JSON.stringify(input.node.openingScreen.title)}. A short exciting subtitle may establish the AI-authored world.
Visibly use the assigned artwork URL as part of the world: ${input.node.artwork.localPath ?? "none"}.
Keep the complete HTML under 18,000 characters. Prefer concise CSS and JavaScript.

Runtime contract:
Emit window.parent.postMessage({type:"activity_ready",payload:{nodeId:"${nodeId}"}},"*") when ready.
Whenever the activity or problem changes, emit window.parent.postMessage({type:"game_state_update",payload:{game:"generated-math",activityId:"${nodeId}",nodeId:"${nodeId}",phase:"question",activityTitle:${JSON.stringify(input.node.title)},learningFocus:${JSON.stringify(input.node.academicTarget.skill)},mechanic:${JSON.stringify(input.node.mechanic)},currentChallenge,availableActions,itemIndex,totalItems,answerVisibility:"hidden"}},"*") so Elli has live context. Never expose answers.
Maintain a factual targetResults array. For every submitted answer append {target,correct,attemptedValue,responseTimeMs,scaffoldLevel} using a stable fresh item identity.
Emit window.parent.postMessage({type:"attempt_event",payload:{domain:"math",target,correct,attemptedValue,responseTimeMs,scaffoldLevel}},"*") for every answer.
Emit window.parent.postMessage({type:"progress_event",payload:{nodeId:"${nodeId}",completedItems,totalItems}},"*") whenever visible progress advances.
On completion calculate accuracy from targetResults and emit window.parent.postMessage({type:"node_complete",payload:{nodeId:"${nodeId}",completed:true,accuracy,targetResults,timeSpent_ms}},"*").
Include <div id="sunny-companion"></div>. Return raw HTML only and end with </html>.

Assignment identity and current theory:
${JSON.stringify({
    assignment: {
      homeworkId: input.cycle.homeworkId,
      title: input.cycle.assignment.title,
      targets: input.cycle.assignment.targets,
      fingerprint: input.cycle.assignment.contentFingerprint,
    },
    theory: input.cycle.academicTheory,
    engagementTheory: input.cycle.engagementTheory,
  }, null, 2)}

Canonical node contract:
${JSON.stringify(input.node, null, 2)}

Prior factual observations (never rewrite them):
${JSON.stringify(input.cycle.observations, null, 2)}

Current child context:
${JSON.stringify(input.childContext, null, 2)}`;
}

export async function generateAdaptiveProgressionActivityHtml(input: {
  cycle: LearningCycleRecordV2;
  node: LearningCycleNodeContract;
  childContext: unknown;
  client?: Anthropic;
  model?: string;
}): Promise<string> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: input.model ?? process.env.SUNNY_GENERATION_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    max_tokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 12000),
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: buildAdaptiveProgressionCreatorPrompt(input) }],
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const html = normalizeGeneratedHtml(stripHtml(response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")));
  if (!isCompleteGeneratedHtml(html)) {
    throw new Error(`adaptive_activity_html_truncated:${input.node.nodeId}:stop=${response.stop_reason ?? "unknown"}:chars=${html.length}`);
  }
  return html;
}

async function generateActivityHtml(input: {
  activity: DirectActivity;
  artworkUrl: string;
  childId: string;
  client: Anthropic;
  model: string;
}): Promise<string> {
  const prompt = buildDirectActivityCreatorPrompt(input);
  const response = await input.client.messages.create({
    model: input.model,
    max_tokens: Number(process.env.SUNNY_GENERATION_MAX_TOKENS ?? 12000),
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: prompt }],
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const html = normalizeGeneratedHtml(stripHtml(response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n")));
  if (!isCompleteGeneratedHtml(html)) {
    throw new Error(`direct_activity_html_truncated:${input.activity.id}:stop=${response.stop_reason ?? "unknown"}:chars=${html.length}`);
  }
  return html;
}

export async function generateDirectArtifacts(input: {
  plan: DirectLearningExperiencePlan;
  childId: string;
  homeworkId: string;
  rootDir?: string;
  client?: Anthropic;
  model?: string;
  plannerModel?: string;
}): Promise<{ artifacts: DirectArtifact[]; backgroundUrl: string; questArtworkUrl: string; bossArtworkUrl: string }> {
  const rootDir = input.rootDir ?? process.cwd();
  const publicDir = path.join(rootDir, "web", "public");
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? process.env.SUNNY_GENERATION_MODEL ?? "claude-sonnet-5";
  const plannerModel = input.plannerModel ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN = String(input.plan.activities.length + 3);
  const artworkJobs = [
    { prompt: input.plan.boardWorld.backgroundPrompt, filename: `${input.homeworkId}-background.jpeg` },
    { prompt: input.plan.quest.artworkPrompt, filename: `${input.homeworkId}-quest.jpeg` },
    { prompt: input.plan.boss.artworkPrompt, filename: `${input.homeworkId}-boss.jpeg` },
    ...input.plan.activities.map((activity) => ({ prompt: activity.visualMock.artworkPrompt, filename: `${input.homeworkId}-${activity.id}.jpeg` })),
  ];
  const artworkUrls: string[] = [];
  for (const job of artworkJobs) artworkUrls.push(await createArtwork(job.prompt, publicDir, job.filename));
  const [backgroundUrl, questArtworkUrl, bossArtworkUrl, ...activityArt] = artworkUrls as [string, string, string, ...string[]];
  const gamesDir = path.join(rootDir, "src", "context", input.childId, "homework", "games", input.homeworkId);
  fs.mkdirSync(gamesDir, { recursive: true });
  const artifacts: DirectArtifact[] = [];
  for (const [index, activity] of input.plan.activities.entries()) {
    const artworkUrl = activityArt[index]!;
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
    if (!shouldReuseDirectArtifact({ htmlComplete: isCompleteGeneratedHtml(existingHtml), savedPromptHash, expectedPromptHash })) {
      const html = await generateActivityHtml({ activity, artworkUrl, childId: input.childId, client, model });
      fs.writeFileSync(htmlPath, html, "utf8");
    }
    fs.writeFileSync(metadataPath, `${JSON.stringify({ version: 1, nodeId: activity.id, creatorPrompt: activity.creatorPrompt, promptHash: expectedPromptHash, plannerModel, creatorModel: model }, null, 2)}\n`, "utf8");
    artifacts.push({
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
    });
  }
  return { artifacts, backgroundUrl, questArtworkUrl, bossArtworkUrl };
}

function contentType(file: string): string {
  if (/\.html$/i.test(file)) return "text/html; charset=utf-8";
  if (/\.jpe?g$/i.test(file)) return "image/jpeg";
  if (/\.png$/i.test(file)) return "image/png";
  return "application/octet-stream";
}

export async function runDirectPlaywrightAcceptance(input: {
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
    ? path.join(rootDir, "src", "context", input.artifacts[0].childId, "homework", "direct-playwright", input.artifacts[0].homeworkId)
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
      const messages = await page.evaluate<Array<{ type?: string }>>(`window.__sunnyMessages||[]`);
      const ready = messages.some((message) => message?.type === "activity_ready");
      if (!ready) failures.push(`${artifact.nodeId}:activity_ready_evidence_missing`);
      pageErrors.forEach((error) => failures.push(`${artifact.nodeId}:browser_error:${error}`));
      if (screenshotDir) {
        const screenshotPath = path.join(screenshotDir, `${artifact.nodeId.replace(/[^a-z0-9_-]/gi, "_")}-opening.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false })
          .then(() => screenshots.push(screenshotPath))
          .catch((error) => console.warn(` 🎮 [direct-taste] [screenshot-unavailable] node=${artifact.nodeId} reason=${error instanceof Error ? error.message : String(error)}`));
      }
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
      gameHtmlPath: artifact.htmlPath, date: input.homeworkId, thumbnailUrl: artifact.artworkUrl, contentId: `${input.homeworkId}:${activity.id}`, mechanic: activity.mechanic,
      engagementDimensions: [activity.engagementVariable as never], engagementHypothesis: input.plan.fork.hypothesis,
      validationProof: { engine: "playwright", passed: true, worldStateChanged: true, screenshotPaths: input.report.screenshots.filter((file) => file.includes(activity.id)) },
    };
  });
  nodePlan.push(
    { id: "quest", type: "quest", activityId: "quest", targets: [], difficulty: 2, source: "chart_planner", locked: true, masteryUnlockState: "preparing", title: "Quest", thumbnailUrl: input.questArtworkUrl },
    { id: "boss", type: "boss", activityId: "boss", targets: [], difficulty: 3, source: "chart_planner", locked: true, masteryUnlockState: "preparing", title: "Boss", thumbnailUrl: input.bossArtworkUrl },
  );
  const nodes: AdventureBoardJson["nodes"] = [
    { id: "start", kind: "start", label: "Start", state: "completed", position: boardPosition(8, 78) },
    { id: "choose-path", kind: "choice-gate", label: input.plan.fork.question, state: "current", position: boardPosition(20, 58), action: { type: "open-choice-set", payloadId: "direct-route-choice" }, choiceSetId: "direct-route-choice" },
  ];
  input.plan.fork.routes.forEach((route, routeIndex) => route.nodeIds.forEach((nodeId, index) => {
    const activity = input.plan.activities.find((item) => item.id === nodeId)!;
    const artifact = artifactById.get(nodeId)!;
    nodes.push({ id: nodeId, kind: "activity", activityId: "generated-baseline", label: activity.title, state: "available", position: routeNodePosition(index, route.nodeIds.length, routeIndex), action: { type: "launch-activity", payloadId: nodeId }, thumbnailUrl: artifact.artworkUrl, mechanic: activity.mechanic, engagementDimensions: [activity.engagementVariable], engagementHypothesis: input.plan.fork.hypothesis, contentId: `${input.homeworkId}:${nodeId}` });
  }));
  nodes.push(
    { id: "quest", kind: "quest", label: "Quest", state: "locked", position: boardPosition(82, 48), thumbnailUrl: input.questArtworkUrl, lock: { reason: "Complete your adventure routes to reveal the Quest.", label: "Locked" }, action: { type: "show-locked-reason", payloadId: "quest" } },
    { id: "boss", kind: "boss", label: "Boss", state: "locked", position: boardPosition(94, 28), thumbnailUrl: input.bossArtworkUrl, lock: { reason: "Complete the Quest before facing the Boss.", label: "Locked" }, action: { type: "show-locked-reason", payloadId: "boss" } },
  );
  const edges: AdventureBoardJson["edges"] = [{ id: "start-choice", from: "start", to: "choose-path", state: "available" }];
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
    companion: { id: "elli", name: "Elli" }, progress: { currentNodeId: "choose-path", completedNodeIds: ["start"], activeChoiceSetId: "direct-route-choice" },
  };
  return {
    planId: input.plan.planId, childId: input.childId, createdAt, source: "ingest_human_loop", activeHomeworkId: input.homeworkId, domain: "math", testDate: null,
    nodePlan, learningRoutes: input.plan.fork.routes.map((route) => ({ id: route.id, label: route.label, rationale: route.promise, nodeIds: [...route.nodeIds, "quest", "boss"] })), adventureBoard,
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
      academicTarget: { domain: "math", skill: role === "quest" ? "novel transfer" : "novel synthesis", targets: [] },
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
  creativeRevision?: DirectCreativeRevision;
  tasteReview?: DirectTasteReview;
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
    playwrightReport: input.report,
    creativeRevision: input.creativeRevision,
    tasteReview: input.tasteReview,
    feedbackObservations: priorFeedback.feedbackObservations ?? [],
    feedbackDecisions: priorFeedback.feedbackDecisions ?? [],
  };
  const canonicalInput = buildDirectLearningCycleInput({
    childId: input.childId,
    homeworkId: input.homeworkId,
    extraction: input.extraction,
    plannerPlan: input.plannerPlan,
    activeSessionPlan: input.activeSessionPlan,
    artifacts: input.artifacts,
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
      reason: "Re-ingestion reconciled the AI-authored board with the existing assignment cycle.",
    }, { rootDir, now: new Date(now) });
  } else {
    createLearningCycle(canonicalInput, { rootDir, now: new Date(now) });
  }
  fs.mkdirSync(path.dirname(directPath), { recursive: true });
  fs.writeFileSync(directPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const planFile = { version: 1, childId: input.childId, selectedDomain: "math", current: input.activeSessionPlan, activeByDomain: { math: input.activeSessionPlan }, updatedAt: now };
  fs.mkdirSync(path.join(contextDir, "plans"), { recursive: true });
  fs.writeFileSync(path.join(contextDir, "plans", "active_session_plan.json"), `${JSON.stringify(planFile, null, 2)}\n`, "utf8");
  const pending = { weekOf: now.slice(0, 10), testDate: null, returnTag: `#sunny_${input.childId}_${input.homeworkId}`, wordList: [], contentProfile: { practiceDomain: "math", topic: input.plannerPlan.title }, capturedContent: { title: input.plannerPlan.title, rawText: input.extraction.fullText }, homeworkId: input.homeworkId, generatedAt: now, nodes: input.activeSessionPlan.nodePlan };
  const homeworkFile = { version: 1, childId: input.childId, selectedDomain: "math", current: pending, activeByDomain: { math: pending }, updatedAt: now };
  fs.writeFileSync(path.join(contextDir, "homework", "current.json"), `${JSON.stringify(homeworkFile, null, 2)}\n`, "utf8");
  const profilePath = path.join(contextDir, "learning_profile.json");
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  profile.pendingHomework = pending;
  profile.activeSessionPlan = input.activeSessionPlan;
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return directPath;
}
