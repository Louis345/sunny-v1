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
  accuracy?: number;
  activePlayTime_ms?: number;
  frustrationScore?: number;
};

type PostChoiceEventOptions = {
  preview?: string | boolean | null;
};

type ChoiceEventResponse = {
  ok: boolean;
  applied?: boolean;
  skippedPersistence?: boolean;
  choiceEventId?: string;
  error?: string;
};

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
  const activityId = boardNode?.activityId ?? option.nodeId ?? option.id;
  return {
    optionId: option.id,
    activityId,
    nodeType: asNodeType(activityId),
    label: option.label,
    purposeLabel: option.tags?.[0] ?? option.label,
    preferenceTraits: option.choiceSignal?.traits,
    thumbnailUrl: option.thumbnailUrl,
    domain: board.domain,
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
  return {
    eventName: "option_selected",
    choiceSetId: choiceSet.id,
    childId: packet.childChart.childId,
    sessionId: options.sessionId ?? packet.activeSessionPlan?.planId,
    nodeId: selectedOption.nodeId,
    context: contextForChoiceSet(choiceSet),
    domain: board.domain,
    shownOptions,
    selectedOptionId: selectedOption.id,
    skippedOptionIds: choiceSet.options
      .map((option) => option.id)
      .filter((optionId) => optionId !== selectedOption.id),
    source: options.source ?? "child_choice",
    createdAt: options.createdAt ?? new Date().toISOString(),
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
  return {
    eventName:
      action === "replay_same" || action === "replay_harder"
        ? "replay_requested"
        : "activity_completed",
    postActivityAction: action,
    choiceSetId: `post_activity:${packet.activeSessionPlan?.planId ?? board.boardId}:${node.id}`,
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
      domain: board.domain,
    }],
    selectedOptionId: optionId,
    skippedOptionIds: [],
    source: options.source ?? "child_choice",
    completed: action === "abandon" ? false : outcome.completed,
    ...(accuracy != null ? { accuracy } : {}),
    ...(typeof outcome.activePlayTime_ms === "number"
      ? { activePlayTime_ms: outcome.activePlayTime_ms }
      : {}),
    replayRequested: action === "replay_same" || action === "replay_harder",
    ...(typeof outcome.frustrationScore === "number"
      ? { frustrationScore: outcome.frustrationScore }
      : {}),
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

export async function postAdventureBoardChoiceEvent(
  input: ChoiceEventInput,
  options: PostChoiceEventOptions = {},
): Promise<ChoiceEventResponse> {
  const response = await fetch(`/api/child/${encodeURIComponent(input.childId)}/choice-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      preview: options.preview,
      payload: input,
    }),
  });
  const body = await response.json().catch(() => ({})) as ChoiceEventResponse;
  if (!response.ok) {
    return {
      ok: false,
      error: body.error ?? `choice_event_http_${response.status}`,
    };
  }
  return body;
}
