import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type {
  AdventureBoardNode,
  AdventureChoiceOption,
} from "../../../src/shared/adventureBoardJson";
import type {
  NodeConfig,
  NodeType,
  WordRadarNodeConfig,
  WordRadarRecallMode,
} from "../../../src/shared/adventureTypes";

type ActiveSessionPlan = NonNullable<ChildExperiencePacket["activeSessionPlan"]>;
type PlannerNode = ActiveSessionPlan["nodePlan"][number];

function uniqueWords(words: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = raw?.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function difficulty(value: number | undefined): 1 | 2 | 3 {
  if (value === 2 || value === 3) return value;
  return 1;
}

function nodeType(raw: string | undefined): NodeType | null {
  if (!raw || raw === "activity" || raw === "choice-gate" || raw === "start" || raw === "reward") {
    return null;
  }
  return raw as NodeType;
}

function wordRadarRecallMode(value: string | undefined): WordRadarRecallMode | null {
  if (
    value === "visible_read" ||
    value === "partial_visual_recall" ||
    value === "hidden_word_recall"
  ) {
    return value;
  }
  return null;
}

function wordRadarInputMode(
  value: string | undefined,
): WordRadarNodeConfig["inputMode"] | null {
  if (value === "whole-word" || value === "letter-by-letter" || value === "keyboard") {
    return value;
  }
  return null;
}

function boardWordRadarConfig(
  boardNode: AdventureBoardNode,
): WordRadarNodeConfig | undefined {
  const config = boardNode.wordRadarConfig;
  if (!config) return undefined;
  const recallMode = wordRadarRecallMode(config.recallMode);
  const inputMode = wordRadarInputMode(config.inputMode);
  if (!recallMode || !inputMode) return undefined;
  return {
    recallMode,
    inputMode,
    speakStyle: config.speakStyle === "option-b" ? "option-b" : "option-a",
    showTimer: config.showTimer === true,
    timerSeconds:
      typeof config.timerSeconds === "number" ? config.timerSeconds : undefined,
    hideWordDuringResponse: config.hideWordDuringResponse === true,
    requiresCapturedResponse: config.requiresCapturedResponse === true,
  };
}

function findPlannerNode(
  packet: ChildExperiencePacket,
  boardNode: AdventureBoardNode,
): PlannerNode | undefined {
  const plan = packet.activeSessionPlan;
  const payloadId = boardNode.action?.payloadId?.trim();
  const ids = [payloadId, boardNode.id].filter((id): id is string => Boolean(id));
  return plan?.nodePlan.find((node) => ids.includes(node.id)) ??
    plan?.nodePlan.find((node) => node.activityId === payloadId || node.activityId === boardNode.activityId);
}

export function resolvePlannerBoardLaunchNode(
  packet: ChildExperiencePacket,
  boardNode: AdventureBoardNode,
  options: { allowLocked?: boolean } = {},
): NodeConfig | null {
  if (
    boardNode.state === "hidden" ||
    boardNode.state === "preview" ||
    (boardNode.state === "locked" && options.allowLocked !== true)
  ) {
    return null;
  }
  if (
    boardNode.action &&
    boardNode.action.type !== "launch-activity" &&
    options.allowLocked !== true
  ) {
    return null;
  }

  const planNode = findPlannerNode(packet, boardNode);
  const type = nodeType(planNode?.type ?? boardNode.activityId ?? boardNode.kind);
  if (!type) return null;

  const words = uniqueWords([
    ...(planNode?.targets ?? []),
    ...(boardNode.target?.words ?? []),
  ]);
  const radarItems =
    type === "word-radar"
      ? words.map((word) => ({
          display: word,
          acceptedResponses: [word.toLowerCase()],
          label: "Spelling",
        }))
      : undefined;
  const source = planNode as Partial<NodeConfig> | undefined;
  const firstRound = planNode?.rounds?.[0];
  const activityTitle = planNode?.title ?? boardNode.label;
  const learningFocus = planNode?.targetLane ?? boardNode.target?.laneId;
  const mechanic = source?.mechanic ?? boardNode.mechanic;

  return {
    id: planNode?.id ?? boardNode.id,
    title: activityTitle,
    planId: packet.activeSessionPlan?.planId,
    type,
    words,
    wordRadarItems: radarItems,
    wordRadarConfig:
      type === "word-radar"
        ? planNode?.wordRadarConfig ?? boardWordRadarConfig(boardNode)
        : undefined,
    pronunciationConfig:
      type === "pronunciation" ? planNode?.pronunciationConfig : undefined,
    targetLane: planNode?.targetLane ?? boardNode.target?.laneId,
    difficulty: difficulty(planNode?.difficulty),
    thumbnailUrl: boardNode.thumbnailUrl,
    thumbnailPrompt: source?.thumbnailPrompt,
    rewardWrapper: source?.rewardWrapper,
    gameFile: source?.gameFile,
    gameHtmlPath: source?.gameHtmlPath,
    storyFile: source?.storyFile,
    storyText: source?.storyText,
    storyTitle: source?.storyTitle,
    storyImagePrompt: source?.storyImagePrompt,
    date: source?.date,
    activityConfigPath: source?.activityConfigPath,
    contentId: source?.contentId ?? boardNode.contentId,
    theoryId: source?.theoryId ?? boardNode.theoryId,
    experimentId: source?.experimentId ?? boardNode.experimentId,
    engagementDimensions: source?.engagementDimensions ?? boardNode.engagementDimensions,
    engagementHypothesis: source?.engagementHypothesis ?? boardNode.engagementHypothesis,
    mechanic,
    sfxProfile: source?.sfxProfile ?? boardNode.sfxProfile,
    companionPolicy: source?.companionPolicy ?? boardNode.companionPolicy,
    companionContext: {
      activityTitle,
      ...(learningFocus ? { learningFocus } : {}),
      ...(mechanic ? { mechanic } : {}),
      ...(firstRound?.prompt ? { currentChallenge: firstRound.prompt } : {}),
      ...(firstRound?.options?.length
        ? { availableActions: firstRound.options.map((option) => option.label) }
        : {}),
      ...(planNode?.rounds?.length ? { totalItems: planNode.rounds.length } : {}),
    },
    choiceSetId: boardNode.choiceSetId,
    isLocked: false,
    isCompleted: boardNode.state === "completed",
    isGoal: type === "boss",
  };
}

/** Build the answer-key-free snapshot injected into Elli when a board node opens. */
export function buildPlannerBoardCompanionContext(
  node: NodeConfig,
): Record<string, unknown> {
  const context = node.companionContext ?? {};
  const activityTitle = context.activityTitle ?? node.title ?? node.type;
  return {
    game: node.type,
    activityId: node.id,
    nodeId: node.id,
    phase: "launched",
    activityTitle,
    ...(context.learningFocus ? { learningFocus: context.learningFocus } : {}),
    ...(context.mechanic ? { mechanic: context.mechanic } : {}),
    ...(context.currentChallenge ? { currentChallenge: context.currentChallenge } : {}),
    ...(context.availableActions?.length
      ? { availableActions: context.availableActions }
      : {}),
    ...(context.currentChallenge ? { itemIndex: 0 } : {}),
    ...(typeof context.totalItems === "number" ? { totalItems: context.totalItems } : {}),
    answerVisibility: "hidden",
    progress: `${activityTitle} started.`,
  };
}

export function resolvePlannerBoardChoiceLaunchNode(
  packet: ChildExperiencePacket,
  option: AdventureChoiceOption,
): NodeConfig | null {
  if (option.state === "locked" || !option.nodeId) return null;
  const boardNode = packet.activeSessionPlan?.adventureBoard?.nodes.find(
    (node) => node.id === option.nodeId,
  );
  if (!boardNode) return null;
  const launchNode = resolvePlannerBoardLaunchNode(packet, boardNode, { allowLocked: true });
  if (!launchNode) return null;
  return {
    ...launchNode,
    ...(option.activityId ? { activityId: option.activityId } : {}),
    ...(option.gameHtmlPath ? { gameHtmlPath: option.gameHtmlPath } : {}),
    ...(option.contentId ? { contentId: option.contentId } : {}),
    ...(option.theoryId ? { theoryId: option.theoryId } : {}),
    ...(option.experimentId ? { experimentId: option.experimentId } : {}),
    ...(option.engagementDimensions ? { engagementDimensions: option.engagementDimensions } : {}),
    ...(option.engagementHypothesis ? { engagementHypothesis: option.engagementHypothesis } : {}),
    ...(option.mechanic ? { mechanic: option.mechanic } : {}),
  };
}
