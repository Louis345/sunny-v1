import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type {
  AdventureBoardJson,
  AdventureChoiceOption,
  AdventureChoiceSet,
} from "../../../src/shared/adventureBoardJson";
import {
  ALL_NODE_TYPES,
  type ChoiceEventSource,
  type MysteryChoiceOption,
  type NodeType,
} from "../../../src/shared/adventureTypes";
import type {
  ChoiceEventContext,
  ChoiceEventInput,
  PostActivityAction,
} from "../../../src/engine/choiceEvents";
import type { NodeConfig } from "../../../src/shared/adventureTypes";

type BuildChoiceEventOptions = {
  createdAt?: string;
  sessionId?: string;
  source?: ChoiceEventSource;
};

export type PostActivityChoiceOutcome = {
  completed: boolean;
  timeToChoose_ms?: number;
  accuracy?: number;
  activePlayTime_ms?: number;
  frustrationScore?: number;
  funRating?: number;
  demoRequested?: boolean;
  demoReplayCount?: number;
  timeToFirstValidActionMs?: number;
  invalidActionCount?: number;
  soundMuted?: boolean;
};

type PostChoiceEventOptions = {
  preview?: string | boolean | null;
};

type ChoiceEventResponse = {
  ok: boolean;
  applied?: boolean;
  skippedPersistence?: boolean;
  queued?: boolean;
  retryable?: boolean;
  choiceEventId?: string;
  error?: string;
};

const CHOICE_EVENT_OUTBOX_KEY = "sunny.choiceEventOutbox.v1";
const CHOICE_EVENT_OUTBOX_LIMIT = 100;

function stableEventId(input: {
  childId: string;
  choiceSetId: string;
  selectedOptionId?: string | null;
  createdAt: string;
}): string {
  const source = `${input.childId}|${input.choiceSetId}|${input.selectedOptionId ?? ""}|${input.createdAt}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `choice_event_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assignmentIdentity(packet: ChildExperiencePacket): {
  homeworkId?: string;
  cycleRevision?: number;
} {
  const cycle = packet.childChart.learningCycle;
  const homeworkId = cycle?.homeworkId ?? packet.activeSessionPlan?.activeHomeworkId;
  return {
    ...(homeworkId ? { homeworkId } : {}),
    ...(typeof cycle?.revision === "number" ? { cycleRevision: cycle.revision } : {}),
  };
}

function readOutbox(): ChoiceEventInput[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHOICE_EVENT_OUTBOX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as ChoiceEventInput[] : [];
  } catch {
    return [];
  }
}

function writeOutbox(events: ChoiceEventInput[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHOICE_EVENT_OUTBOX_KEY, JSON.stringify(events));
}

function queueChoiceEvent(input: ChoiceEventInput): void {
  const events = readOutbox();
  if (!events.some((event) => event.choiceEventId === input.choiceEventId)) events.push(input);
  writeOutbox(events.slice(-CHOICE_EVENT_OUTBOX_LIMIT));
}

function asNodeType(value: string | undefined): NodeType | undefined {
  if (!value) return undefined;
  return (ALL_NODE_TYPES as readonly string[]).includes(value) ? (value as NodeType) : undefined;
}

function contextForChoiceSet(choiceSet: AdventureChoiceSet): ChoiceEventContext {
  if (choiceSet.kind === "baseline-route") return "baseline_route";
  if (choiceSet.kind === "mystery") return "mystery";
  if (choiceSet.kind === "quest-wrapper") return "quest";
  if (choiceSet.kind === "boss-wrapper") return "boss";
  return "free_choice";
}

function contextForNode(node: NodeConfig): ChoiceEventContext {
  if (node.type === "quest") return "quest";
  if (node.type === "boss") return "boss";
  return "homework_required";
}

function boardForPacket(packet: ChildExperiencePacket): AdventureBoardJson {
  const board = packet.activeSessionPlan?.adventureBoard;
  if (!board) {
    throw new Error("Planner board choice event requires an active adventure board.");
  }
  return board;
}

function optionToChoiceOption(
  board: AdventureBoardJson,
  option: AdventureChoiceOption,
): MysteryChoiceOption {
  const boardNode = option.nodeId
    ? board.nodes.find((node) => node.id === option.nodeId)
    : undefined;
  const activityId = option.activityId ?? boardNode?.activityId ?? option.nodeId ?? option.id;
  return {
    optionId: option.id,
    activityId,
    nodeType: asNodeType(activityId),
    label: option.label,
    purposeLabel: option.tags?.[0] ?? option.label,
    preferenceTraits: option.choiceSignal?.traits,
    thumbnailUrl: option.thumbnailUrl,
    domain: board.domain,
    activityKind: "learning_activity",
    gameFile: option.gameHtmlPath,
    theoryId: option.theoryId ?? boardNode?.theoryId,
    experimentId: option.experimentId ?? boardNode?.experimentId,
    contentId: option.contentId ?? boardNode?.contentId,
    engagementDimensions: option.engagementDimensions ?? boardNode?.engagementDimensions,
    engagementHypothesis: option.engagementHypothesis ?? boardNode?.engagementHypothesis,
  };
}

export function buildAdventureBoardChoiceEventInput(
  packet: ChildExperiencePacket,
  choiceSet: AdventureChoiceSet,
  selectedOption: AdventureChoiceOption,
  options: BuildChoiceEventOptions = {},
): ChoiceEventInput {
  const board = boardForPacket(packet);
  const shownOptions = choiceSet.options.map((option) => optionToChoiceOption(board, option));
  const createdAt = options.createdAt ?? new Date().toISOString();
  const selectedOptionId = selectedOption.id;
  return {
    choiceEventId: stableEventId({
      childId: packet.childChart.childId,
      choiceSetId: choiceSet.id,
      selectedOptionId,
      createdAt,
    }),
    ...assignmentIdentity(packet),
    eventName: "option_selected",
    choiceSetId: choiceSet.id,
    childId: packet.childChart.childId,
    sessionId: options.sessionId ?? packet.activeSessionPlan?.planId,
    nodeId: selectedOption.nodeId,
    context: contextForChoiceSet(choiceSet),
    domain: board.domain,
    shownOptions,
    selectedOptionId,
    skippedOptionIds: choiceSet.options
      .map((option) => option.id)
      .filter((optionId) => optionId !== selectedOption.id),
    source: options.source ?? "child_choice",
    createdAt,
  };
}

export function buildAdventureBoardPostActivityChoiceEventInput(
  packet: ChildExperiencePacket,
  node: NodeConfig,
  action: PostActivityAction,
  outcome: PostActivityChoiceOutcome,
  options: BuildChoiceEventOptions = {},
): ChoiceEventInput {
  const board = boardForPacket(packet);
  const optionId = `${node.id}:${node.type}`;
  const accuracy =
    typeof outcome.accuracy === "number" && Number.isFinite(outcome.accuracy)
      ? outcome.accuracy > 1 ? outcome.accuracy / 100 : outcome.accuracy
      : undefined;
  const funRating =
    typeof outcome.funRating === "number" &&
    Number.isInteger(outcome.funRating) &&
    outcome.funRating >= 1 &&
    outcome.funRating <= 5
      ? outcome.funRating
      : undefined;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const choiceSetId = `post_activity:${packet.activeSessionPlan?.planId ?? board.boardId}:${node.id}`;
  return {
    choiceEventId: stableEventId({
      childId: packet.childChart.childId,
      choiceSetId,
      selectedOptionId: optionId,
      createdAt,
    }),
    ...assignmentIdentity(packet),
    eventName:
      action === "replay_same" || action === "replay_harder"
        ? "replay_requested"
        : "activity_completed",
    postActivityAction: action,
    choiceSetId,
    childId: packet.childChart.childId,
    sessionId: options.sessionId ?? packet.activeSessionPlan?.planId,
    nodeId: node.id,
    context: contextForNode(node),
    domain: board.domain,
    shownOptions: [{
      optionId,
      activityId: node.type,
      nodeType: asNodeType(node.type),
      label: node.type,
      purposeLabel: action,
      preferenceTraits: node.engagementDimensions,
      domain: board.domain,
      contentId: node.contentId,
      theoryId: node.theoryId,
      experimentId: node.experimentId,
      engagementDimensions: node.engagementDimensions,
      engagementHypothesis: node.engagementHypothesis,
    }],
    selectedOptionId: optionId,
    skippedOptionIds: [],
    source: options.source ?? "child_choice",
    completed: action === "abandon" ? false : outcome.completed,
    ...(typeof outcome.timeToChoose_ms === "number"
      ? { timeToChoose_ms: Math.max(0, Math.round(outcome.timeToChoose_ms)) }
      : {}),
    ...(accuracy != null ? { accuracy } : {}),
    ...(typeof outcome.activePlayTime_ms === "number"
      ? { activePlayTime_ms: outcome.activePlayTime_ms }
      : {}),
    replayRequested: action === "replay_same" || action === "replay_harder",
    ...(typeof outcome.frustrationScore === "number"
      ? { frustrationScore: outcome.frustrationScore }
      : {}),
    ...(funRating != null ? { funRating } : {}),
    ...(typeof outcome.demoRequested === "boolean" ? { demoRequested: outcome.demoRequested } : {}),
    ...(typeof outcome.demoReplayCount === "number" ? { demoReplayCount: outcome.demoReplayCount } : {}),
    ...(typeof outcome.timeToFirstValidActionMs === "number" ? { timeToFirstValidActionMs: outcome.timeToFirstValidActionMs } : {}),
    ...(typeof outcome.invalidActionCount === "number" ? { invalidActionCount: outcome.invalidActionCount } : {}),
    ...(typeof outcome.soundMuted === "boolean" ? { soundMuted: outcome.soundMuted } : {}),
    createdAt,
  };
}

async function sendChoiceEvent(input: ChoiceEventInput): Promise<ChoiceEventResponse> {
  const response = await fetch(`/api/child/${encodeURIComponent(input.childId)}/choice-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: input }),
  });
  const body = await response.json().catch(() => ({})) as ChoiceEventResponse;
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    return { ok: false, retryable, error: body.error ?? `choice_event_http_${response.status}` };
  }
  return body;
}

export async function postAdventureBoardChoiceEvent(
  input: ChoiceEventInput,
  options: PostChoiceEventOptions = {},
): Promise<ChoiceEventResponse> {
  try {
    const result = await sendChoiceEvent(input);
    const queued = !result.ok && result.retryable !== false && !options.preview;
    if (queued) queueChoiceEvent(input);
    return { ...result, queued };
  } catch (error) {
    if (!options.preview) queueChoiceEvent(input);
    return {
      ok: false,
      queued: !options.preview,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function flushAdventureBoardChoiceEventOutbox(): Promise<{
  delivered: number;
  remaining: number;
}> {
  const pending = readOutbox();
  const remaining: ChoiceEventInput[] = [];
  let delivered = 0;
  for (const input of pending) {
    try {
      const result = await sendChoiceEvent(input);
      if (result.ok && !result.skippedPersistence) delivered += 1;
      else if (result.retryable !== false) remaining.push(input);
    } catch {
      remaining.push(input);
    }
  }
  writeOutbox(remaining);
  return { delivered, remaining: remaining.length };
}
