import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  ActivityModelEntry,
  ActivityTraitModelEntry,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type {
  ChoiceEventSource,
  MysteryChoiceOption,
  NodeType,
} from "../shared/adventureTypes";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";
import { recordReward } from "./bandit";
import { getActivityToolContract } from "./activityToolCatalog";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  hydrateLearningProfileFromWaterfall,
  slimLearningProfileForDoorway,
} from "../profiles/chartWaterfall";

export type ChoiceEventContext =
  | "mystery"
  | "homework_required"
  | "quest"
  | "boss"
  | "free_choice";

export type ChoiceSentiment = "like" | "dislike" | "neutral";

export type ChoiceOption = MysteryChoiceOption;

export type ChoiceEventName =
  | "mystery_node_tap"
  | "impression"
  | "option_selected"
  | "option_skipped"
  | "mystery_dismissed"
  | "surprise_revealed"
  | "activity_launched"
  | "activity_completed"
  | "replay_requested";

export type ChoiceEvent = {
  type: "choice_event";
  version: 1;
  eventName?: ChoiceEventName;
  choiceEventId: string;
  choiceSetId: string;
  childId: string;
  sessionId?: string;
  nodeId?: string;
  context: ChoiceEventContext;
  domain: string;
  shownOptions: ChoiceOption[];
  selectedOptionId?: string | null;
  skippedOptionIds: string[];
  source: ChoiceEventSource;
  timeToChoose_ms?: number;
  started?: boolean;
  completed?: boolean;
  accuracy?: number;
  activePlayTime_ms?: number;
  replayRequested?: boolean;
  explicitSentiment?: ChoiceSentiment;
  frustrationScore?: number;
  createdAt: string;
};

export type ChoiceEventInput = Omit<ChoiceEvent, "type" | "version" | "choiceEventId"> & {
  choiceEventId?: string;
};

export type MysteryChoiceSet = {
  choiceSetId: string;
  childId: string;
  sessionId?: string;
  nodeId?: string;
  context: "mystery";
  domain: string;
  shownOptions: ChoiceOption[];
  generatedAt: string;
};

export type MysteryChoiceCandidate = Omit<ChoiceOption, "optionId" | "thumbnailUrl"> & {
  optionId?: string;
  thumbnailUrl?: string;
  catalogStatus?: string;
  evidenceGated?: boolean;
};

type RootOptions = {
  rootDir?: string;
  now?: Date;
};

type ApplyChoiceOptions = RootOptions & {
  recordBanditReward?: (
    childId: string,
    nodeType: NodeType,
    liked: boolean,
    completed: boolean,
    accuracy: number,
  ) => Promise<void> | void;
};

const STATIC_ACTIVITY_THUMBNAILS: Record<string, string> = {
  "monster-stampede": "/thumbnails/activities/monster-stampede.svg",
  pronunciation: "/thumbnails/activities/pronunciation.svg",
  karaoke: "/thumbnails/activities/karaoke.svg",
  "spell-check": "/thumbnails/activities/spell-check.svg",
  "word-radar": "/thumbnails/activities/word-radar.svg",
  "letter-rush": "/thumbnails/activities/letter-rush.svg",
  "speed-catcher": "/thumbnails/activities/speed-catcher.svg",
  asteroid: "/thumbnails/activities/asteroid.svg",
  "space-invaders": "/thumbnails/activities/space-invaders.svg",
  "space-frogger": "/thumbnails/activities/space-frogger.svg",
  "wheel-of-fortune": "/thumbnails/activities/wheel-of-fortune.svg",
  mystery: "/thumbnails/mystery-fallback.svg",
};

function rootDir(opts?: RootOptions): string {
  return opts?.rootDir ?? process.cwd();
}

function safeChildId(childId: string): string {
  return childId.trim().toLowerCase();
}

function fileDate(value: string): string {
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function choiceEventsDir(childId: string, opts?: RootOptions): string {
  return path.join(resolveChildContextDir(safeChildId(childId), { rootDir: rootDir(opts) }), "choice_events");
}

function profilePath(childId: string, opts?: RootOptions): string {
  return path.join(resolveChildContextDir(safeChildId(childId), { rootDir: rootDir(opts) }), "learning_profile.json");
}

function readProfile(childId: string, opts?: RootOptions): LearningProfile | null {
  const filePath = profilePath(childId, opts);
  if (!fs.existsSync(filePath)) return null;
  try {
    return hydrateLearningProfileFromWaterfall(
      childId,
      JSON.parse(fs.readFileSync(filePath, "utf8")) as LearningProfile,
      opts,
    );
  } catch {
    return null;
  }
}

function writeProfile(childId: string, profile: LearningProfile, opts?: RootOptions): void {
  const filePath = profilePath(childId, opts);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  profile.lastUpdated = (opts?.now ?? new Date()).toISOString();
  fs.writeFileSync(filePath, JSON.stringify(slimLearningProfileForDoorway(profile), null, 2), "utf8");
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function clamp01(value: number | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizedDomain(value: string): string {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "general";
}

function selectedOption(event: ChoiceEvent): ChoiceOption | undefined {
  if (!event.selectedOptionId) return undefined;
  return event.shownOptions.find((option) => option.optionId === event.selectedOptionId);
}

function asNodeType(value: string | undefined): NodeType | null {
  if (!value) return null;
  return (ALL_NODE_TYPES as readonly string[]).includes(value) ? (value as NodeType) : null;
}

export function thumbnailUrlForActivity(activityId: string): string {
  return STATIC_ACTIVITY_THUMBNAILS[activityId] ??
    `/thumbnails/activities/${activityId.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.svg`;
}

export function preferenceWeightForChoiceSource(source: ChoiceEventSource): number {
  switch (source) {
    case "child_choice":
      return 1;
    case "parent_choice":
      return 0.65;
    case "system_recommendation":
      return 0.35;
    case "system_required":
      return 0;
  }
}

export function buildMysteryChoiceSet(input: {
  childId: string;
  sessionId?: string;
  nodeId?: string;
  domain: string;
  candidates: MysteryChoiceCandidate[];
  maxOptions?: number;
  now?: Date;
}): MysteryChoiceSet {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const shownOptions = input.candidates
    .slice(0, Math.max(1, input.maxOptions ?? 3))
    .map((candidate) => {
      const optionId = candidate.optionId ?? candidate.activityId;
      return {
        ...candidate,
        optionId,
        thumbnailUrl: candidate.thumbnailUrl ?? thumbnailUrlForActivity(candidate.activityId),
      };
    });
  return {
    choiceSetId: `choice_set_${stableHash({
      childId: safeChildId(input.childId),
      sessionId: input.sessionId ?? null,
      nodeId: input.nodeId ?? null,
      domain: normalizedDomain(input.domain),
      generatedAt,
      options: shownOptions.map((option) => option.optionId),
    })}`,
    childId: safeChildId(input.childId),
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    context: "mystery",
    domain: normalizedDomain(input.domain),
    shownOptions,
    generatedAt,
  };
}

export function normalizeChoiceEvent(input: ChoiceEventInput): ChoiceEvent {
  const createdAt = input.createdAt || new Date().toISOString();
  const shownOptions = input.shownOptions.map((option) => ({
    ...option,
    optionId: option.optionId || option.activityId,
    thumbnailUrl: option.thumbnailUrl ?? thumbnailUrlForActivity(option.activityId),
  }));
  const selected = input.selectedOptionId ?? null;
  const skippedOptionIds =
    input.skippedOptionIds.length > 0
      ? input.skippedOptionIds
      : shownOptions
        .map((option) => option.optionId)
        .filter((optionId) => selected !== optionId);
  return {
    type: "choice_event",
    version: 1,
    choiceEventId:
      input.choiceEventId ??
      `choice_event_${stableHash({
        childId: safeChildId(input.childId),
        choiceSetId: input.choiceSetId,
        selected,
        createdAt,
      })}`,
    ...input,
    childId: safeChildId(input.childId),
    domain: normalizedDomain(input.domain),
    shownOptions,
    selectedOptionId: selected,
    skippedOptionIds,
    createdAt,
  };
}

export function recordChoiceEvent(input: ChoiceEventInput, opts: RootOptions = {}): ChoiceEvent {
  const event = normalizeChoiceEvent(input);
  const dir = choiceEventsDir(event.childId, opts);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    path.join(dir, `${fileDate(event.createdAt)}.ndjson`),
    `${JSON.stringify(event)}\n`,
    "utf8",
  );
  console.log(
    `  🎮 [choice-event] [recorded] child=${event.childId} context=${event.context} source=${event.source} selected=${event.selectedOptionId ?? "none"}`,
  );
  return event;
}

export function readChoiceEvents(childId: string, opts: RootOptions = {}): ChoiceEvent[] {
  const dir = choiceEventsDir(childId, opts);
  if (!fs.existsSync(dir)) return [];
  const out: ChoiceEvent[] = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".ndjson")).sort()) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as ChoiceEvent);
      } catch {
        // Skip malformed historical rows.
      }
    }
  }
  return out;
}

function preferenceLiked(event: ChoiceEvent): boolean | null {
  if (event.explicitSentiment === "like") return true;
  if (event.explicitSentiment === "dislike") return false;
  if (event.replayRequested) return true;
  if (event.eventName === "option_selected" && event.source === "child_choice") return true;
  if (event.eventName === "surprise_revealed" && event.started !== false) return true;
  if (event.completed === true && clamp01(event.frustrationScore, 0) < 0.5) return true;
  if (event.completed === false) return false;
  return null;
}

function shouldApplyPreferenceEvent(event: ChoiceEvent): boolean {
  if (!event.eventName) return true;
  return (
    event.eventName === "option_selected" ||
    event.eventName === "surprise_revealed" ||
    event.eventName === "activity_completed" ||
    event.eventName === "replay_requested"
  );
}

function engagementFromChoice(event: ChoiceEvent, weight: number): number {
  const liked = preferenceLiked(event);
  return clamp01(
    0.25 +
      weight * 0.3 +
      (event.completed ? 0.15 : 0) +
      (event.replayRequested ? 0.2 : 0) +
      (liked === true ? 0.15 : liked === false ? -0.2 : 0) -
      clamp01(event.frustrationScore, 0) * 0.2,
    0.5,
  );
}

function mergePreferenceIntoActivityModel(
  priorModel: Record<string, ActivityModelEntry> | undefined,
  input: {
    activityId: string;
    domain: string;
    completed: boolean;
    accuracy: number;
    engagementScore: number;
    frustrationScore: number;
    liked: boolean | null;
    occurredAt: string;
  },
): Record<string, ActivityModelEntry> {
  const activityModel = { ...(priorModel ?? {}) };
  const prior = activityModel[input.activityId];
  const plays = (prior?.plays ?? 0) + 1;
  const completions = (prior?.completions ?? 0) + (input.completed ? 1 : 0);
  const avg = (oldValue: number | undefined, nextValue: number, fallback: number) =>
    round((((oldValue ?? fallback) * (plays - 1)) + nextValue) / plays);
  const domains = { ...(prior?.domains ?? {}) };
  domains[input.domain] = (domains[input.domain] ?? 0) + 1;
  activityModel[input.activityId] = {
    activityId: input.activityId,
    plays,
    completions,
    completionRate: round(completions / plays),
    averageAccuracy: avg(prior?.averageAccuracy, input.accuracy, 0),
    engagementScore: avg(prior?.engagementScore, input.engagementScore, 0.5),
    frustrationScore: avg(prior?.frustrationScore, input.frustrationScore, 0),
    likedCount: (prior?.likedCount ?? 0) + (input.liked === true ? 1 : 0),
    dislikedCount: (prior?.dislikedCount ?? 0) + (input.liked === false ? 1 : 0),
    lastRating:
      input.liked === true
        ? "like"
        : input.liked === false
          ? "dislike"
          : "implicit",
    lastPlayed: input.occurredAt,
    domains,
    missedWords: prior?.missedWords ?? [],
  };
  return activityModel;
}

function traitDimensionsForActivity(activityId: string): string[] {
  try {
    return getActivityToolContract(activityId).traits.preferenceDimensions;
  } catch {
    return [];
  }
}

function mergeChoiceIntoActivityTraitModel(
  priorModel: Record<string, ActivityTraitModelEntry> | undefined,
  input: {
    activityId: string;
    dimensions: string[];
    liked: boolean | null;
    weight: number;
    occurredAt: string;
  },
): Record<string, ActivityTraitModelEntry> | undefined {
  if (input.dimensions.length === 0) return priorModel;
  const model = { ...(priorModel ?? {}) };
  for (const dimension of input.dimensions) {
    const prior = model[dimension];
    const positiveWeight = round((prior?.positiveWeight ?? 0) + (input.liked === true ? input.weight : 0));
    const negativeWeight = round((prior?.negativeWeight ?? 0) + (input.liked === false ? input.weight : 0));
    const mixedWeight = round((prior?.mixedWeight ?? 0) + (input.liked == null ? input.weight : 0));
    const evidenceCount = (prior?.evidenceCount ?? 0) + 1;
    const activityCounts = { ...(prior?.activityCounts ?? {}) };
    activityCounts[input.activityId] = (activityCounts[input.activityId] ?? 0) + 1;
    model[dimension] = {
      dimension,
      positiveWeight,
      negativeWeight,
      mixedWeight,
      evidenceCount,
      confidence: round(Math.min(1, (positiveWeight + negativeWeight + mixedWeight) / Math.max(1, evidenceCount))),
      lastUpdated: input.occurredAt,
      activityCounts,
    };
  }
  return model;
}

export async function applyChoiceEventPreference(
  input: ChoiceEvent | ChoiceEventInput,
  opts: ApplyChoiceOptions = {},
): Promise<{ applied: boolean; reason: string; activityId?: string }> {
  const event = "type" in input && input.type === "choice_event"
    ? input
    : normalizeChoiceEvent(input as ChoiceEventInput);
  const weight = preferenceWeightForChoiceSource(event.source);
  if (weight <= 0) {
    return { applied: false, reason: "not_preference_source" };
  }
  if (!shouldApplyPreferenceEvent(event)) {
    return { applied: false, reason: "non_preference_event" };
  }
  const option = selectedOption(event);
  if (!option) {
    return { applied: false, reason: "no_selected_option" };
  }
  const profile = readProfile(event.childId, opts);
  if (!profile) {
    return { applied: false, reason: "missing_profile", activityId: option.activityId };
  }
  const liked = preferenceLiked(event);
  const completed =
    event.eventName === "activity_completed"
      ? event.completed !== false
      : event.started === false
        ? false
        : event.completed === true;
  const isChoiceIntent =
    event.eventName === "option_selected" ||
    event.eventName === "surprise_revealed";
  const accuracy = clamp01(event.accuracy, completed ? 1 : 0.5);
  const frustrationScore = clamp01(
    event.frustrationScore,
    completed || isChoiceIntent ? 0.1 : 0.65,
  );
  const engagementScore = engagementFromChoice(event, weight);
  const next: LearningProfile = {
    ...profile,
    activityModel: mergePreferenceIntoActivityModel(profile.activityModel, {
      activityId: option.activityId,
      domain: event.domain,
      completed,
      accuracy,
      engagementScore,
      frustrationScore,
      liked,
      occurredAt: event.createdAt,
    }),
    activityTraitModel: mergeChoiceIntoActivityTraitModel(profile.activityTraitModel, {
      activityId: option.activityId,
      dimensions: traitDimensionsForActivity(option.activityId),
      liked,
      weight: round(
        Math.min(
          1,
          0.25 +
            weight * 0.45 +
            (event.completed ? 0.1 : 0) +
            (event.replayRequested ? 0.2 : 0),
        ),
      ),
      occurredAt: event.createdAt,
    }),
  };
  writeProfile(event.childId, next, opts);
  const nodeType = option.nodeType ?? asNodeType(option.activityId);
  if (event.source === "child_choice" && nodeType) {
    const reward = opts.recordBanditReward ?? recordReward;
    await reward(event.childId, nodeType, liked === true, completed, accuracy);
  }
  console.log(
    `  🎮 [choice-event] [preference-applied] child=${event.childId} activity=${option.activityId} source=${event.source}`,
  );
  return { applied: true, reason: "preference_applied", activityId: option.activityId };
}
