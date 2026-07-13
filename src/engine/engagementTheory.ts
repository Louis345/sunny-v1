import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getLatestLearningCycle, transitionLearningCycle } from "./learningCycleRepository";
import type {
  EngagementDimension,
  EngagementDimensionState,
  EngagementExperiment,
  EngagementTheory,
} from "../context/schemas/learningProfile";
import type { ChoiceEvent } from "./choiceEvents";
import { resolveChildContextDir } from "../utils/contextRoot";

export const ENGAGEMENT_DIMENSIONS: readonly EngagementDimension[] = [
  "visual",
  "puzzle",
  "story",
  "speed",
  "competition",
  "control",
  "novelty",
  "voice",
  "calm",
];

function theoryPath(childId: string, rootDir = process.cwd()): string {
  return path.join(resolveChildContextDir(childId.trim().toLowerCase(), { rootDir }), "engagement_theory.json");
}

function stableId(input: unknown): string {
  return crypto.createHash("sha1").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}

function emptyDimensions(now: string): Record<EngagementDimension, EngagementDimensionState> {
  return Object.fromEntries(ENGAGEMENT_DIMENSIONS.map((dimension) => [dimension, {
    dimension,
    positiveWeight: 0,
    negativeWeight: 0,
    mixedWeight: 0,
    evidenceCount: 0,
    confidence: 0,
    lastUpdated: now,
  }])) as Record<EngagementDimension, EngagementDimensionState>;
}

function experimentFor(theoryId: string, domain: string): EngagementExperiment {
  return {
    experimentId: `engagement-experiment:${stableId({ theoryId, domain })}`,
    theoryId,
    variable: "mechanic",
    arms: [],
    holdConstant: ["academic targets", "question count", "difficulty", "evidence contract"],
    successSignals: ["started", "completed", "replayed", "low frustration", "accuracy preserved"],
    status: "planned",
  };
}

export function buildInitialEngagementTheory(input: {
  childId: string;
  domain: string;
  homeworkId?: string;
  now?: Date;
}): EngagementTheory {
  const now = (input.now ?? new Date()).toISOString();
  const theoryId = `engagement-theory:${stableId({
    childId: input.childId.trim().toLowerCase(),
    domain: input.domain,
    homeworkId: input.homeworkId ?? null,
  })}`;
  return {
    version: 1,
    theoryId,
    childId: input.childId.trim().toLowerCase(),
    domain: input.domain.trim().toLowerCase(),
    ...(input.homeworkId ? { homeworkId: input.homeworkId } : {}),
    hypothesis: "Sunny does not yet have enough preference evidence; test distinct mechanics while holding the academic target constant.",
    dimensions: emptyDimensions(now),
    preferredDimensions: [],
    avoidedDimensions: [],
    promptDirectives: {
      prefer: [],
      avoid: [],
      vary: ["mechanic", "theme"],
      holdConstant: ["academic targets", "question count", "difficulty", "evidence contract"],
    },
    evidence: [],
    nextExperiment: experimentFor(theoryId, input.domain),
    updatedAt: now,
  };
}

export function readEngagementTheory(childId: string, opts: { rootDir?: string } = {}): EngagementTheory | null {
  const file = theoryPath(childId, opts.rootDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as EngagementTheory;
  } catch {
    return null;
  }
}

export function writeEngagementTheory(
  childId: string,
  theory: EngagementTheory,
  opts: { rootDir?: string } = {},
): string {
  const currentCycle = getLatestLearningCycle(childId, opts);
  if (currentCycle && JSON.stringify(currentCycle.engagementTheory) !== JSON.stringify(theory)) {
    transitionLearningCycle(childId, currentCycle.homeworkId, currentCycle.revision, {
      type: "engagement_theory_updated",
      theory,
      reason: "Preference evidence updated the canonical engagement theory.",
    }, opts);
  }
  const file = theoryPath(childId, opts.rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(theory, null, 2)}\n`, "utf8");
  return file;
}

function dimensionsForEvent(event: ChoiceEvent): EngagementDimension[] {
  const option = event.shownOptions.find((candidate) => candidate.optionId === event.selectedOptionId);
  return (option?.preferenceTraits ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is EngagementDimension => ENGAGEMENT_DIMENSIONS.includes(value as EngagementDimension));
}

function dimensionsForOption(event: ChoiceEvent, optionId: string): EngagementDimension[] {
  const option = event.shownOptions.find((candidate) => candidate.optionId === optionId);
  return (option?.preferenceTraits ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is EngagementDimension => ENGAGEMENT_DIMENSIONS.includes(value as EngagementDimension));
}

function adjust(
  state: EngagementDimensionState,
  input: { positive?: number; negative?: number; mixed?: number; now: string },
): void {
  state.positiveWeight += input.positive ?? 0;
  state.negativeWeight += input.negative ?? 0;
  state.mixedWeight += input.mixed ?? 0;
  state.evidenceCount += 1;
  state.confidence = Math.min(
    1,
    (state.positiveWeight + state.negativeWeight + state.mixedWeight) / Math.max(1, state.evidenceCount),
  );
  state.lastUpdated = input.now;
}

export function updateEngagementTheoryFromChoiceEvents(
  theory: EngagementTheory,
  events: ChoiceEvent[],
): EngagementTheory {
  const next: EngagementTheory = JSON.parse(JSON.stringify(theory)) as EngagementTheory;
  for (const event of events) {
    const dimensions = dimensionsForEvent(event);
    if (dimensions.length === 0) continue;
    const abandoned = event.completed === false || event.postActivityAction === "abandon";
    const positive = event.completed === true && !abandoned && (event.replayRequested === true || (event.frustrationScore ?? 0) < 0.5);
    for (const dimension of dimensions) {
      adjust(next.dimensions[dimension], {
        positive: positive ? 1 : undefined,
        negative: abandoned ? 1 : undefined,
        mixed: positive || abandoned ? undefined : 0.5,
        now: event.createdAt,
      });
    }
    // Skipping is deliberately weak avoidance evidence: it informs the next
    // experiment, but cannot outweigh actually starting and finishing work.
    for (const skippedOptionId of event.skippedOptionIds ?? []) {
      for (const dimension of dimensionsForOption(event, skippedOptionId)) {
        adjust(next.dimensions[dimension], {
          negative: 0.25,
          now: event.createdAt,
        });
      }
    }
    next.evidence.unshift({
      id: event.choiceEventId,
      kind: "choice",
      summary: `${event.eventName ?? "choice"}: ${event.selectedOptionId ?? "none"}; completed=${event.completed ?? "unknown"}; frustration=${event.frustrationScore ?? "unknown"}`,
      sourcePath: `choice_events/${event.createdAt.slice(0, 10)}.ndjson`,
      createdAt: event.createdAt,
    });
  }
  next.evidence = next.evidence.slice(0, 100);
  next.preferredDimensions = [...ENGAGEMENT_DIMENSIONS]
    .filter((dimension) => next.dimensions[dimension].positiveWeight > next.dimensions[dimension].negativeWeight)
    .sort((a, b) => next.dimensions[b].positiveWeight - next.dimensions[a].positiveWeight)
    .slice(0, 4);
  next.avoidedDimensions = [...ENGAGEMENT_DIMENSIONS]
    .filter((dimension) => next.dimensions[dimension].negativeWeight > next.dimensions[dimension].positiveWeight)
    .sort((a, b) => next.dimensions[b].negativeWeight - next.dimensions[a].negativeWeight)
    .slice(0, 4);
  next.promptDirectives = {
    prefer: next.preferredDimensions.map((dimension) => `Prefer ${dimension} mechanics or presentation.`),
    avoid: next.avoidedDimensions.map((dimension) => `Avoid high-pressure ${dimension} presentation unless explicitly tested.`),
    vary: ["mechanic", "theme"],
    holdConstant: ["academic targets", "question count", "difficulty", "evidence contract"],
  };
  next.hypothesis = next.preferredDimensions.length > 0
    ? `The child currently shows stronger engagement with ${next.preferredDimensions.join(", ")} than with ${next.avoidedDimensions.join(", ") || "unmeasured alternatives"}.`
    : theory.hypothesis;
  next.updatedAt = events.at(-1)?.createdAt ?? new Date().toISOString();
  return next;
}

export function updateEngagementTheoryFromActivityEvidence(
  theory: EngagementTheory,
  input: {
    activityId: string;
    contentId?: string;
    experimentId?: string;
    dimensions?: string[];
    completed: boolean;
    frustrationScore?: number;
    liked?: boolean;
    replayRequested?: boolean;
    source?: "real_child" | "caregiver" | "graded_work" | "synthetic_lab" | "system";
    createdAt?: string;
  },
): EngagementTheory {
  if (input.source === "synthetic_lab" || input.source === "system") return theory;
  const next: EngagementTheory = JSON.parse(JSON.stringify(theory)) as EngagementTheory;
  const now = input.createdAt ?? new Date().toISOString();
  const dimensions = (input.dimensions ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is EngagementDimension => ENGAGEMENT_DIMENSIONS.includes(value as EngagementDimension));
  if (dimensions.length === 0) return next;
  const frustrated = (input.frustrationScore ?? 0) >= 0.5 || !input.completed;
  const positive = input.completed && !frustrated && (input.liked === true || input.replayRequested === true || (input.frustrationScore ?? 0) < 0.25);
  for (const dimension of dimensions) {
    adjust(next.dimensions[dimension], {
      positive: positive ? 1 : undefined,
      negative: frustrated ? 1 : undefined,
      mixed: positive || frustrated ? undefined : 0.5,
      now,
    });
  }
  next.evidence.unshift({
    id: `activity:${input.contentId ?? input.activityId}:${now}`,
    kind: "activity",
    summary: `${input.activityId}: completed=${input.completed}; liked=${input.liked ?? "unknown"}; frustration=${input.frustrationScore ?? "unknown"}`,
    sourcePath: "activity-evidence.ndjson",
    createdAt: now,
  });
  next.evidence = next.evidence.slice(0, 100);
  next.preferredDimensions = [...ENGAGEMENT_DIMENSIONS]
    .filter((dimension) => next.dimensions[dimension].positiveWeight > next.dimensions[dimension].negativeWeight)
    .sort((a, b) => next.dimensions[b].positiveWeight - next.dimensions[a].positiveWeight)
    .slice(0, 4);
  next.avoidedDimensions = [...ENGAGEMENT_DIMENSIONS]
    .filter((dimension) => next.dimensions[dimension].negativeWeight > next.dimensions[dimension].positiveWeight)
    .sort((a, b) => next.dimensions[b].negativeWeight - next.dimensions[a].negativeWeight)
    .slice(0, 4);
  next.promptDirectives = {
    prefer: next.preferredDimensions.map((dimension) => `Prefer ${dimension} mechanics or presentation.`),
    avoid: next.avoidedDimensions.map((dimension) => `Avoid high-pressure ${dimension} presentation unless explicitly tested.`),
    vary: ["mechanic", "theme"],
    holdConstant: ["academic targets", "question count", "difficulty", "evidence contract"],
  };
  next.hypothesis = next.preferredDimensions.length > 0
    ? `The child currently shows stronger engagement with ${next.preferredDimensions.join(", ")} than with ${next.avoidedDimensions.join(", ") || "unmeasured alternatives"}.`
    : next.hypothesis;
  next.updatedAt = now;
  return next;
}

export function engagementTheoryPromptContext(theory: EngagementTheory | null): string {
  if (!theory) return "No prior engagement theory exists. Create a controlled first experiment.";
  return JSON.stringify({
    theoryId: theory.theoryId,
    hypothesis: theory.hypothesis,
    preferredDimensions: theory.preferredDimensions,
    avoidedDimensions: theory.avoidedDimensions,
    promptDirectives: theory.promptDirectives,
    nextExperiment: theory.nextExperiment,
  }, null, 2);
}
