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
    holdConstant: ["academic targets", "question count", "evidence contract"],
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
      holdConstant: ["academic targets", "question count", "evidence contract"],
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
    const explicitlyLiked = event.explicitSentiment === "like" ||
      (typeof event.funRating === "number" && event.funRating >= 4);
    const explicitlyDisliked = event.explicitSentiment === "dislike" ||
      (typeof event.funRating === "number" && event.funRating <= 2);
    const hasPreferenceOutcome =
      explicitlyLiked ||
      explicitlyDisliked ||
      abandoned ||
      event.replayRequested === true ||
      event.postActivityAction === "replay_same" ||
      event.postActivityAction === "replay_harder";
    const positive = !abandoned && (
      explicitlyLiked ||
      event.replayRequested === true ||
      event.postActivityAction === "replay_same" ||
      event.postActivityAction === "replay_harder"
    );
    if (hasPreferenceOutcome) {
      for (const dimension of dimensions) {
        adjust(next.dimensions[dimension], {
          positive: positive ? 1 : undefined,
          negative: abandoned || explicitlyDisliked ? 1 : undefined,
          mixed: positive || abandoned || explicitlyDisliked ? undefined : 0.5,
          now: event.createdAt,
        });
      }
    }
    next.evidence.unshift({
      id: event.choiceEventId,
      kind: "choice",
      summary: [
        `${event.eventName ?? "choice"}: ${event.selectedOptionId ?? "none"}`,
        `homework=${event.homeworkId ?? "unknown"}`,
        `node=${event.nodeId ?? "unknown"}`,
        `completed=${event.completed ?? "unknown"}`,
        `funRating=${event.funRating != null ? `${event.funRating}/5` : "unknown"}`,
        `replay=${event.replayRequested ?? false}`,
        `action=${event.postActivityAction ?? "unknown"}`,
        `frustration=${event.frustrationScore ?? "unknown"}`,
      ].join("; "),
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
    prefer: [],
    avoid: [],
    vary: ["mechanic", "theme"],
    holdConstant: ["academic targets", "question count", "evidence contract"],
  };
  next.hypothesis = next.preferredDimensions.length > 0
    ? `Observed so far: stronger engagement with ${next.preferredDimensions.join(", ")}. Every other presentation is untested, not ruled out.`
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
  const positive = input.completed && !frustrated &&
    (input.liked === true || input.replayRequested === true);
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
    prefer: [],
    avoid: [],
    vary: ["mechanic", "theme"],
    holdConstant: ["academic targets", "question count", "evidence contract"],
  };
  next.hypothesis = next.preferredDimensions.length > 0
    ? `Observed so far: stronger engagement with ${next.preferredDimensions.join(", ")}. Every other presentation is untested, not ruled out.`
    : next.hypothesis;
  next.updatedAt = now;
  return next;
}

/**
 * A dimension only reaches a prompt once it is actually supported. Below these
 * thresholds the reading is noise, and a model shown a weak negative weight
 * reliably converts it into a design prohibition — which is how a single
 * `competition` observation at confidence 0.25 came to strip the stakes out of
 * every generated Quest.
 */
export const ENGAGEMENT_PROMPT_MIN_CONFIDENCE = 0.6;
export const ENGAGEMENT_PROMPT_MIN_EVIDENCE = 5;

export function engagementTheoryEvidenceContext(theory: EngagementTheory | null | undefined): unknown {
  if (!theory) return null;
  const all = Object.values(theory.dimensions ?? {})
    .sort((a, b) => a.dimension.localeCompare(b.dimension));
  const supported = all.filter((dimension) =>
    dimension.confidence >= ENGAGEMENT_PROMPT_MIN_CONFIDENCE &&
    dimension.evidenceCount >= ENGAGEMENT_PROMPT_MIN_EVIDENCE);
  return {
    theoryId: theory.theoryId,
    domain: theory.domain,
    homeworkId: theory.homeworkId,
    howToRead: [
      "These are observations with sample sizes, not instructions.",
      "A low or negative weight means this presentation has not been seen to work yet — it is not a prohibition, and it is often just untested.",
      "Nothing here constrains stakes, failure, difficulty, or consequence. Those are yours to choose.",
      `Dimensions below confidence ${ENGAGEMENT_PROMPT_MIN_CONFIDENCE} or ${ENGAGEMENT_PROMPT_MIN_EVIDENCE} observations are withheld as too weak to act on.`,
    ],
    dimensions: supported.map((dimension) => ({
      dimension: dimension.dimension,
      positiveWeight: dimension.positiveWeight,
      negativeWeight: dimension.negativeWeight,
      mixedWeight: dimension.mixedWeight,
      evidenceCount: dimension.evidenceCount,
      confidence: dimension.confidence,
      lastUpdated: dimension.lastUpdated,
    })),
    unmeasuredDimensions: all
      .filter((dimension) => !supported.includes(dimension))
      .map((dimension) => dimension.dimension),
    evidence: (theory.evidence ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      summary: item.summary,
      sourcePath: item.sourcePath,
      createdAt: item.createdAt,
    })),
    updatedAt: theory.updatedAt,
  };
}

export function engagementTheoryPromptContext(theory: EngagementTheory | null | undefined): string {
  const context = engagementTheoryEvidenceContext(theory);
  return context
    ? JSON.stringify(context, null, 2)
    : "No prior engagement observations exist. Treat all presentation hypotheses as uncertain.";
}
