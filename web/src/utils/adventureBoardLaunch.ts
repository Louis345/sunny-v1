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

export type PlannerBoardIframeStartMessage = {
  type: "start";
  childName: string;
  companionName: string;
  config: Record<string, never>;
};

/** Only legacy reward games require a parent-frame start handshake. */
export function buildPlannerBoardIframeStartMessage(input: {
  nodeType: string;
  childName: string;
  companionName: string;
}): PlannerBoardIframeStartMessage | null {
  if (input.nodeType !== "mystery") return null;
  return {
    type: "start",
    childName: input.childName,
    companionName: input.companionName,
    config: {},
  };
}

export type HomeworkVoiceSessionStart = {
  childId: string;
  homeworkId: string;
  domain: "spelling" | "science" | "reading" | "math";
};

export function resolveHomeworkVoiceAutostart(input: {
  previousScope: string | null;
  childId: string;
  homeworkId: string;
  phase: string;
}): { scope: string; shouldStart: boolean } {
  const scope = `${input.childId}:${input.homeworkId}`;
  return {
    scope,
    shouldStart: input.phase === "picker" && input.previousScope !== scope,
  };
}

/**
 * Voice may join a homework session only after the browser has received one
 * complete, canonical packet whose plan and evidence cycle name the same
 * assignment. The child picker alone is never launch authority.
 */
export function resolveHomeworkVoiceSessionStart(
  packet: ChildExperiencePacket | null,
  loading: boolean,
): HomeworkVoiceSessionStart | null {
  if (loading || !packet) return null;
  const childId = packet.childChart?.childId?.trim().toLowerCase();
  const plan = packet.activeSessionPlan;
  const homeworkId = plan?.activeHomeworkId?.trim();
  const cycleHomeworkId = packet.childChart?.learningCycle?.homeworkId?.trim();
  const lifecycle = packet.childChart?.learningCycle?.lifecycle;
  const domain = plan?.domain;
  const supportedDomain =
    domain === "spelling" ||
    domain === "science" ||
    domain === "reading" ||
    domain === "math";
  const requiresCanonicalCycle = domain === "math" || domain === "spelling";
  if (
    !childId ||
    !homeworkId ||
    !plan?.adventureBoard ||
    !supportedDomain ||
    ["evidence_ready", "targeted_planning", "board_designing", "board_generating", "baseline_generating", "quest_generating", "boss_generating"].includes(lifecycle ?? "") ||
    (requiresCanonicalCycle && homeworkId !== cycleHomeworkId) ||
    (!requiresCanonicalCycle && cycleHomeworkId && homeworkId !== cycleHomeworkId)
  ) {
    return null;
  }
  return {
    childId,
    homeworkId,
    domain,
  };
}

/**
 * Discovery keeps an adventureBoard-shaped packet for server and rollback
 * compatibility, but it is a pre-board experience. The child must enter its
 * one generated evaluation directly; the targeted map does not exist yet.
 */
export function isDirectDiscoveryPacket(packet: ChildExperiencePacket | null): boolean {
  return Boolean(packet?.activeSessionPlan?.planId?.startsWith("discovery:"));
}

/**
 * A Probe Board is a complete, playable opening chapter. Unlike the legacy
 * direct Discovery packet it must remain a board so the child can move through
 * each ready Planner-authored probe while unfinished siblings remain normally locked.
 */
export function isProbeBoardPacket(packet: ChildExperiencePacket | null): boolean {
  return Boolean(packet?.activeSessionPlan?.planId?.startsWith("probe-board:"));
}

export function resolveProbeBoardCompletion(
  result: Record<string, unknown>,
): "continue-probe" | "finish-session" {
  return result.probeChapterComplete === true
    ? "finish-session"
    : "continue-probe";
}

export async function runProbeBoardCompletionHandoff(input: {
  completion: Record<string, unknown>;
  refresh: () => Promise<unknown>;
  continueProbe: () => void;
  finishSession: () => void;
}): Promise<"continue-probe" | "finish-session"> {
  const action = resolveProbeBoardCompletion(input.completion);
  try {
    await input.refresh();
  } catch (error) {
    console.warn(" 🎮 [adaptive-math] [probe-board-refresh] [deferred]", error);
  }
  if (action === "finish-session") input.finishSession();
  else input.continueProbe();
  return action;
}

export function hasPendingLearningGeneration(packet: ChildExperiencePacket | null, completingDiscovery: boolean): boolean {
  if (!["math", "spelling"].includes(packet?.activeSessionPlan?.domain ?? "")) return false;
  const nodes = packet?.activeSessionPlan?.adventureBoard?.nodes ?? [];
  return Boolean(nodes.some(node => node.state === "preview")
    || (isProbeBoardPacket(packet) && nodes.some(node =>
      node.state === "locked" && node.lock?.reason === "artifact-not-ready"))
    || ["evidence_ready", "targeted_planning", "board_designing", "board_generating", "baseline_generating", "quest_generating", "boss_generating"].includes(packet?.childChart.learningCycle?.lifecycle ?? "")
    || (isDirectDiscoveryPacket(packet) && completingDiscovery));
}

/** Keep the child off a targeted map until it contains something they can actually play. */
export function shouldHoldTargetedBoardForPreparation(packet: ChildExperiencePacket | null): boolean {
  if (!packet || isDirectDiscoveryPacket(packet)) return false;
  if (!["math", "spelling"].includes(packet.activeSessionPlan?.domain ?? "")) return false;
  const nodes = packet.activeSessionPlan?.adventureBoard?.nodes ?? [];
  const hasPlayableActivity = nodes.some((node) =>
    node.action?.type === "launch-activity"
    && ["current", "available", "completed"].includes(node.state));
  if (hasPlayableActivity) return false;
  return nodes.some((node) =>
    node.state === "preview"
    || node.lock?.reason === "generation-needs-attention"
    || node.lock?.reason === "artifact-generating");
}

export function resolveDirectDiscoverySurface(
  sessionReady: boolean,
  launchAvailable: boolean,
): "loading-curtain" | "direct-discovery" | "unavailable" {
  if (!sessionReady) return "loading-curtain";
  return launchAvailable ? "direct-discovery" : "unavailable";
}

export function resolveDiscoveryCompletionHandoff(
  result: Record<string, unknown>,
): "preview-complete" | "targeted-planning" {
  return result.skippedPersistence === true
    ? "preview-complete"
    : "targeted-planning";
}

export function resolvePlannerBoardSessionScope(
  childId: string | null,
  activeHomeworkId: string | null | undefined,
): string {
  return `${childId ?? "none"}:${activeHomeworkId ?? "none"}`;
}

export function resolvePersistedDiscoveryHandoff(
  localHandoff: "preview-complete" | "targeted-planning" | null,
  lifecycle: string | null | undefined,
): "preview-complete" | "targeted-planning" | null {
  if (localHandoff) return localHandoff;
  return lifecycle && !["evaluation_ready", "evaluation_active"].includes(lifecycle)
    ? "targeted-planning"
    : null;
}

export function resolveDiscoveryEngagementDelivery(
  result: Record<string, unknown>,
): "committed" | "preview-skipped" | "queued" | "failed" {
  if (result.skippedPersistence === true) return "preview-skipped";
  if (result.ok === true && result.applied === true) return "committed";
  if (result.queued === true) return "queued";
  return "failed";
}

export async function runDiscoveryExitSequence(input: {
  commitEngagement: () => Promise<Record<string, unknown>>;
  completeAcademic: () => Promise<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  const completion = input.completeAcademic();
  void Promise.resolve().then(input.commitEngagement).then(result => {
    console.log(` 🎮 [discovery-engagement] [delivery] [${resolveDiscoveryEngagementDelivery(result)}]`);
  }).catch(error => console.error(" 🎮 [discovery-engagement] [delivery] [failed]", error));
  return completion;
}

export function resolveDirectDiscoveryLaunchNode(
  packet: ChildExperiencePacket | null,
): NodeConfig | null {
  if (!packet || !isDirectDiscoveryPacket(packet)) return null;
  const board = packet.activeSessionPlan?.adventureBoard;
  const discoveryNode = board?.nodes.find(
    (node) => node.kind !== "start" && node.action?.type === "launch-activity",
  );
  const launch = discoveryNode
    ? resolvePlannerBoardLaunchNode(packet, discoveryNode, { allowLocked: true })
    : null;
  if (launch && packet.activeSessionPlan?.domain === "spelling") {
    if (packet.spellingDiscovery?.nodeId !== launch.id) return null;
    launch.wordRadarItems = packet.spellingDiscovery.items;
  }
  return launch;
}

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
      ? packet.spellingInstruments?.[planNode?.id ?? boardNode.id]?.items ?? words.map((word) => ({
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
    spellingAssessment: packet.spellingInstruments?.[planNode?.id ?? boardNode.id]?.assessment,
    spellingItemBindings: packet.spellingInstruments?.[planNode?.id ?? boardNode.id]?.items.map(item => ({ itemId: item.itemId, word: item.display })),
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
  const ownerBoardNode = packet.activeSessionPlan?.adventureBoard?.nodes.find(
    (node) => node.id === option.nodeId,
  );
  if (!ownerBoardNode) return null;
  const launchBoardNode = option.launchNodeId
    ? packet.activeSessionPlan?.adventureBoard?.nodes.find((node) => node.id === option.launchNodeId)
    : ownerBoardNode;
  if (!launchBoardNode) return null;
  const launchNode = resolvePlannerBoardLaunchNode(packet, launchBoardNode, { allowLocked: true });
  if (!launchNode) return null;
  return {
    ...launchNode,
    id: ownerBoardNode.id,
    choiceSetId: ownerBoardNode.choiceSetId ?? launchNode.choiceSetId,
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
