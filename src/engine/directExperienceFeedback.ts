import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { readChoiceEvents, type ChoiceEvent } from "./choiceEvents";

export type DirectFeedbackOutcome = "supported" | "revised" | "inconclusive";

export type DirectFeedbackObservation = {
  choiceEventId: string;
  nodeId: string;
  observedAt: string;
  academic: { completed: boolean; accuracy?: number };
  interaction: {
    demoRequested?: boolean;
    demoReplayCount?: number;
    timeToFirstValidActionMs?: number;
    invalidActionCount?: number;
    soundMuted?: boolean;
  };
  engagement: { funRating?: number; replayRequested?: boolean; frustrationScore?: number };
};

export type DirectFeedbackDecision = {
  decisionId: string;
  choiceEventId: string;
  nodeId: string;
  designPrediction: string;
  outcome: DirectFeedbackOutcome;
  preserve: string[];
  change: string[];
  explore: string[];
  avoid: string[];
  evidenceIds: string[];
  nextPromptDirectives: string[];
  model: string;
  createdAt: string;
};

type DecisionContent = Pick<DirectFeedbackDecision,
  "outcome" | "preserve" | "change" | "explore" | "avoid" | "evidenceIds" | "nextPromptDirectives"
>;

type DirectRecord = {
  plannerPlan?: { activities?: Array<{ id?: string; designPrediction?: string }> };
  feedbackObservations?: DirectFeedbackObservation[];
  feedbackDecisions?: DirectFeedbackDecision[];
  [key: string]: unknown;
};

type FeedbackOptions = {
  rootDir?: string;
  model?: string;
  client?: Anthropic;
  interpret?: (input: {
    designPrediction: string;
    observation: DirectFeedbackObservation;
  }) => Promise<DecisionContent>;
  events?: ChoiceEvent[];
};

function recordPath(childId: string, rootDir = process.cwd()): string {
  return path.join(rootDir, "src", "context", childId.trim().toLowerCase(), "homework", "direct_experience_plan.json");
}

function readRecord(childId: string, rootDir?: string): { file: string; record: DirectRecord } | null {
  const file = recordPath(childId, rootDir);
  if (!fs.existsSync(file)) return null;
  return { file, record: JSON.parse(fs.readFileSync(file, "utf8")) as DirectRecord };
}

function writeRecord(file: string, record: DirectRecord): void {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

function observationFromEvent(event: ChoiceEvent): DirectFeedbackObservation {
  return {
    choiceEventId: event.choiceEventId,
    nodeId: event.nodeId ?? "unknown",
    observedAt: event.createdAt,
    academic: {
      completed: event.completed === true,
      ...(typeof event.accuracy === "number" ? { accuracy: event.accuracy } : {}),
    },
    interaction: {
      ...(typeof event.demoRequested === "boolean" ? { demoRequested: event.demoRequested } : {}),
      ...(typeof event.demoReplayCount === "number" ? { demoReplayCount: event.demoReplayCount } : {}),
      ...(typeof event.timeToFirstValidActionMs === "number" ? { timeToFirstValidActionMs: event.timeToFirstValidActionMs } : {}),
      ...(typeof event.invalidActionCount === "number" ? { invalidActionCount: event.invalidActionCount } : {}),
      ...(typeof event.soundMuted === "boolean" ? { soundMuted: event.soundMuted } : {}),
    },
    engagement: {
      ...(typeof event.funRating === "number" ? { funRating: event.funRating } : {}),
      ...(typeof event.replayRequested === "boolean" ? { replayRequested: event.replayRequested } : {}),
      ...(typeof event.frustrationScore === "number" ? { frustrationScore: event.frustrationScore } : {}),
    },
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function parseDecision(value: unknown): DecisionContent {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (record.outcome !== "supported" && record.outcome !== "revised" && record.outcome !== "inconclusive") {
    throw new Error("direct_feedback_invalid_outcome");
  }
  return {
    outcome: record.outcome,
    preserve: strings(record.preserve),
    change: strings(record.change),
    explore: strings(record.explore),
    avoid: strings(record.avoid),
    evidenceIds: strings(record.evidenceIds),
    nextPromptDirectives: strings(record.nextPromptDirectives),
  };
}

async function askPlannerForInterpretation(input: {
  designPrediction: string;
  observation: DirectFeedbackObservation;
  client?: Anthropic;
  model: string;
}): Promise<DecisionContent> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const toolName = "interpret_direct_experience_outcome";
  const response = await client.messages.create({
    model: input.model,
    max_tokens: 1400,
    messages: [{ role: "user", content: `You are Sunny's learning-experience Planner. Compare the preregistered design prediction with the factual observation. Return exactly one supported, revised, or inconclusive design decision. Keep academic performance, interaction confusion, and engagement separate. A demo request or low fun rating cannot reduce mastery. Cite only supplied evidence IDs.\n\nPrediction:\n${input.designPrediction}\n\nObservation:\n${JSON.stringify(input.observation, null, 2)}` }],
    tools: [{ name: toolName, description: "Record one bounded design interpretation.", input_schema: { type: "object", additionalProperties: true } }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const tool = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!tool || tool.type !== "tool_use") throw new Error("direct_feedback_tool_output_missing");
  return parseDecision(tool.input);
}

export function readDirectFeedbackContext(childId: string, options: { rootDir?: string } = {}): {
  observations: DirectFeedbackObservation[];
  decisions: DirectFeedbackDecision[];
} {
  const stored = readRecord(childId, options.rootDir)?.record;
  return {
    observations: stored?.feedbackObservations ?? [],
    decisions: stored?.feedbackDecisions ?? [],
  };
}

export async function interpretDirectExperienceOutcome(
  event: ChoiceEvent,
  options: FeedbackOptions = {},
): Promise<{ applied: boolean; reason: string }> {
  const stored = readRecord(event.childId, options.rootDir);
  if (!stored || !event.nodeId) return { applied: false, reason: "direct_experience_not_found" };
  const activity = stored.record.plannerPlan?.activities?.find((candidate) => candidate.id === event.nodeId);
  if (!activity?.designPrediction) return { applied: false, reason: "direct_activity_not_found" };
  if ((stored.record.feedbackDecisions ?? []).some((decision) => decision.choiceEventId === event.choiceEventId)) {
    return { applied: false, reason: "already_interpreted" };
  }
  const observation = observationFromEvent(event);
  const observations = stored.record.feedbackObservations ?? [];
  if (!observations.some((item) => item.choiceEventId === event.choiceEventId)) {
    stored.record.feedbackObservations = [...observations, observation];
    writeRecord(stored.file, stored.record);
  }
  const model = options.model ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5";
  const content = options.interpret
    ? await options.interpret({ designPrediction: activity.designPrediction, observation })
    : await askPlannerForInterpretation({ designPrediction: activity.designPrediction, observation, client: options.client, model });
  const latest = readRecord(event.childId, options.rootDir);
  if (!latest) return { applied: false, reason: "direct_experience_removed" };
  if ((latest.record.feedbackDecisions ?? []).some((decision) => decision.choiceEventId === event.choiceEventId)) {
    return { applied: false, reason: "already_interpreted" };
  }
  const decision: DirectFeedbackDecision = {
    decisionId: `direct-feedback:${event.choiceEventId}`,
    choiceEventId: event.choiceEventId,
    nodeId: event.nodeId,
    designPrediction: activity.designPrediction,
    ...content,
    model,
    createdAt: new Date().toISOString(),
  };
  latest.record.feedbackDecisions = [...(latest.record.feedbackDecisions ?? []), decision];
  writeRecord(latest.file, latest.record);
  console.log(` 🎮 [direct-feedback] [interpreted] child=${event.childId} node=${event.nodeId} outcome=${decision.outcome}`);
  return { applied: true, reason: "interpreted" };
}

export async function interpretPendingDirectExperienceOutcomes(
  childId: string,
  options: FeedbackOptions = {},
): Promise<{ interpreted: number; deferred: number }> {
  const events = options.events ?? readChoiceEvents(childId, { rootDir: options.rootDir });
  let interpreted = 0;
  let deferred = 0;
  for (const event of events.filter((candidate) =>
    candidate.context === "homework_required" &&
    candidate.eventName === "activity_completed" &&
    candidate.childId === childId.trim().toLowerCase()
  )) {
    try {
      const result = await interpretDirectExperienceOutcome(event, options);
      if (result.applied) interpreted += 1;
    } catch (error) {
      deferred += 1;
      console.warn(` 🎮 [direct-feedback] [deferred] child=${childId} event=${event.choiceEventId} reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { interpreted, deferred };
}
