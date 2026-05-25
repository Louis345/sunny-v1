import type {
  AdventureBoardDomain,
  AdventureBoardEdge,
  AdventureBoardEvidenceRole,
  AdventureBoardJson,
  AdventureBoardLayoutRole,
  AdventureBoardNode,
  AdventureBoardNodeKind,
  AdventureBoardNodeState,
  AdventureBoardWordRadarConfig,
} from "./adventureBoardJson";

export interface ActiveSessionPlanBoardNodeSnapshot {
  id: string;
  type: string;
  activityId?: string;
  targets?: string[];
  targetLane?: string;
  locked?: boolean;
  choiceMode?: string;
  masteryUnlockState?: string;
  difficulty?: number;
  wordRadarConfig?: AdventureBoardWordRadarConfig;
}

export interface ActiveSessionPlanBoardSnapshot {
  planId: string;
  childId: string;
  domain: string;
  nodePlan: ActiveSessionPlanBoardNodeSnapshot[];
}

export interface BuildAdventureBoardFromActiveSessionPlanOptions {
  plan: ActiveSessionPlanBoardSnapshot;
  boardId: string;
  theme: AdventureBoardJson["theme"];
  title?: string;
  layout?: AdventureBoardJson["layout"];
  plannerRationale?: AdventureBoardJson["plannerRationale"];
  companion?: AdventureBoardJson["companion"];
  progress?: Partial<AdventureBoardJson["progress"]>;
  labelForNode?: (node: ActiveSessionPlanBoardNodeSnapshot, index: number) => string | undefined;
  thumbnailForNode?: (node: ActiveSessionPlanBoardNodeSnapshot, index: number) => string | undefined;
}

const supportedDomains = new Set<AdventureBoardDomain>([
  "spelling",
  "reading",
  "math",
  "science",
  "generic",
]);

export function buildAdventureBoardFromActiveSessionPlan(
  options: BuildAdventureBoardFromActiveSessionPlanOptions,
): AdventureBoardJson {
  const completedNodeIds = options.progress?.completedNodeIds ?? [];
  const currentNodeId =
    options.progress?.currentNodeId ??
    options.plan.nodePlan.find((node) => !node.locked && !completedNodeIds.includes(node.id))?.id;

  const nodes = options.plan.nodePlan.map((node, index) =>
    buildBoardNode({
      planNode: node,
      index,
      state: stateForPlanNode(node, completedNodeIds, currentNodeId),
      label: options.labelForNode?.(node, index) ?? labelForPlanNode(node),
      thumbnailUrl: options.thumbnailForNode?.(node, index),
    }),
  );

  return {
    schemaVersion: 1,
    boardId: options.boardId,
    planId: options.plan.planId,
    childId: options.plan.childId,
    domain: domainForBoard(options.plan.domain),
    title: options.title,
    theme: options.theme,
    layout: options.layout ?? {
      preset: "horizontal-adventure-spine",
      companionSlot: "right",
      routeChoiceBehavior: "exclusive",
    },
    plannerRationale: options.plannerRationale,
    nodes,
    edges: buildPresentationEdges(nodes),
    choiceSets: [],
    companion: options.companion,
    progress: {
      currentNodeId,
      completedNodeIds,
      activeChoiceSetId: options.progress?.activeChoiceSetId,
    },
  };
}

function buildBoardNode(input: {
  planNode: ActiveSessionPlanBoardNodeSnapshot;
  index: number;
  state: AdventureBoardNodeState;
  label: string;
  thumbnailUrl?: string;
}): AdventureBoardNode {
  const kind = kindForPlanNode(input.planNode);
  const evidenceRole = evidenceRoleForKind(kind);
  const target = input.planNode.targetLane
    ? {
        laneId: input.planNode.targetLane,
        skill: input.planNode.targetLane,
        words: input.planNode.targets ?? [],
      }
    : undefined;

  return {
    id: input.planNode.id,
    kind,
    activityId: input.planNode.activityId ?? input.planNode.type,
    label: input.label,
    icon: iconForPlanNode(input.planNode, kind),
    thumbnailUrl: input.thumbnailUrl,
    layout: {
      role: layoutRoleForKind(kind),
      lane: "main",
      order: input.index + 1,
    },
    state: input.state,
    evidenceRole,
    target,
    wordRadarConfig: input.planNode.wordRadarConfig,
    lock: input.planNode.locked
      ? {
          reason: input.planNode.masteryUnlockState ?? "planner_locked",
          label: lockLabelForPlanNode(input.planNode),
        }
      : undefined,
    action: input.planNode.locked
      ? { type: "show-locked-reason", payloadId: input.planNode.id }
      : { type: "launch-activity", payloadId: input.planNode.id },
  };
}

function buildPresentationEdges(nodes: AdventureBoardNode[]): AdventureBoardEdge[] {
  const edges: AdventureBoardEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    edges.push({
      id: `edge-${from.id}-to-${to.id}`,
      from: from.id,
      to: to.id,
      state: to.state === "locked" ? "locked" : from.state === "completed" ? "completed" : "available",
      style: to.state === "locked" ? "dashed" : undefined,
    });
  }
  return edges;
}

function stateForPlanNode(
  node: ActiveSessionPlanBoardNodeSnapshot,
  completedNodeIds: string[],
  currentNodeId?: string,
): AdventureBoardNodeState {
  if (node.locked) return "locked";
  if (completedNodeIds.includes(node.id)) return "completed";
  if (node.id === currentNodeId) return "current";
  return "available";
}

function kindForPlanNode(node: ActiveSessionPlanBoardNodeSnapshot): AdventureBoardNodeKind {
  const type = (node.activityId ?? node.type).toLowerCase();
  if (type === "mystery") return "mystery";
  if (type === "quest") return "quest";
  if (type === "boss") return "boss";
  if (type === "choice-gate") return "choice-gate";
  return "activity";
}

function evidenceRoleForKind(kind: AdventureBoardNodeKind): AdventureBoardEvidenceRole {
  if (kind === "mystery") return "preference";
  if (kind === "quest") return "transfer";
  if (kind === "boss") return "mastery";
  return "baseline";
}

function layoutRoleForKind(kind: AdventureBoardNodeKind): AdventureBoardLayoutRole {
  if (kind === "mystery") return "mystery";
  if (kind === "quest") return "quest";
  if (kind === "boss") return "boss";
  if (kind === "choice-gate") return "choice-gate";
  return "baseline";
}

function labelForPlanNode(node: ActiveSessionPlanBoardNodeSnapshot): string {
  const activityId = node.activityId ?? node.type;
  if (activityId === "word-radar") return "Word Radar";
  if (activityId === "spell-check") return "Spell Check";
  if (activityId === "mystery") return "Mystery";
  if (activityId === "quest") return "Quest";
  if (activityId === "boss") return "Boss";
  return activityId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function iconForPlanNode(
  node: ActiveSessionPlanBoardNodeSnapshot,
  kind: AdventureBoardNodeKind,
): string | undefined {
  const activityId = node.activityId ?? node.type;
  if (activityId === "word-radar") return "radar";
  if (activityId === "spell-check") return "book";
  if (kind === "mystery") return "mystery";
  if (kind === "quest") return "star";
  if (kind === "boss") return "crown";
  return undefined;
}

function lockLabelForPlanNode(node: ActiveSessionPlanBoardNodeSnapshot): string {
  if (node.activityId === "quest" || node.type === "quest") return "Quest is preparing";
  if (node.activityId === "boss" || node.type === "boss") return "After Quest";
  return "Locked";
}

function domainForBoard(domain: string): AdventureBoardDomain {
  return supportedDomains.has(domain as AdventureBoardDomain)
    ? (domain as AdventureBoardDomain)
    : "generic";
}
