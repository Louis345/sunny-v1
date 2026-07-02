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
  AdventureChoiceOption,
  AdventureChoiceSet,
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

export interface ActiveSessionPlanLearningRouteSnapshot {
  id: string;
  label: string;
  rationale: string;
  nodeIds: string[];
}

export interface ActiveSessionPlanBoardSnapshot {
  planId: string;
  childId: string;
  domain: string;
  nodePlan: ActiveSessionPlanBoardNodeSnapshot[];
  learningRoutes?: ActiveSessionPlanLearningRouteSnapshot[];
  adventureBoard?: AdventureBoardJson;
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

const routeSlots = ["5a.1", "5b.1", "5a.2"] as const;
const routeLanes = ["upper", "lower", "upper"] as const;
const maxVisibleRouteCount = 2;
const maxVisibleNodesPerRoute = 2;

type NormalizedRouteLayoutEntry = {
  node: ActiveSessionPlanBoardNodeSnapshot;
  routeId: string;
  routeIndex: number;
  routeOrder: number;
};

function isBaselineLikeRouteNode(node: ActiveSessionPlanBoardNodeSnapshot): boolean {
  return /(^|[-_])baseline([-_]|$)/i.test(node.id);
}

function normalizeRouteLayout(plan: ActiveSessionPlanBoardSnapshot): {
  requiredNodes: ActiveSessionPlanBoardNodeSnapshot[];
  routeEntries: NormalizedRouteLayoutEntry[];
  hasExplicitRoutes: boolean;
} {
  const baselineNodes = plan.nodePlan.filter((node) => !isDestinationNode(node));
  const nodeById = new Map(plan.nodePlan.map((node) => [node.id, node]));
  const routeUseCounts = new Map<string, number>();
  for (const route of plan.learningRoutes ?? []) {
    for (const nodeId of route.nodeIds) {
      const node = nodeById.get(nodeId);
      if (!node || isDestinationNode(node)) continue;
      routeUseCounts.set(nodeId, (routeUseCounts.get(nodeId) ?? 0) + 1);
    }
  }

  const visibleRouteIds = new Set((plan.learningRoutes ?? [])
    .slice(0, maxVisibleRouteCount)
    .map((route) => route.id));
  const routeEntries: NormalizedRouteLayoutEntry[] = [];
  const hiddenRouteNodeIds = new Set<string>();

  for (const [routeIndex, route] of (plan.learningRoutes ?? []).entries()) {
    const candidates: ActiveSessionPlanBoardNodeSnapshot[] = [];
    for (const nodeId of route.nodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      if (isDestinationNode(node)) continue;
      if (isBaselineLikeRouteNode(node)) continue;
      if ((routeUseCounts.get(node.id) ?? 0) !== 1) continue;
      candidates.push(node);
    }

    if (!visibleRouteIds.has(route.id)) {
      for (const node of candidates) hiddenRouteNodeIds.add(node.id);
      continue;
    }

    for (const [routeOrder, node] of candidates.slice(0, maxVisibleNodesPerRoute).entries()) {
      routeEntries.push({ node, routeId: route.id, routeIndex, routeOrder });
    }
    for (const node of candidates.slice(maxVisibleNodesPerRoute)) hiddenRouteNodeIds.add(node.id);
  }

  const routeNodeIds = new Set(routeEntries.map((entry) => entry.node.id));
  const requiredNodes = baselineNodes.filter((node) =>
    !routeNodeIds.has(node.id) &&
    !hiddenRouteNodeIds.has(node.id));

  return {
    requiredNodes,
    routeEntries,
    hasExplicitRoutes: (plan.learningRoutes?.length ?? 0) >= 2 && routeEntries.length >= 2,
  };
}

export function buildAdventureBoardFromActiveSessionPlan(
  options: BuildAdventureBoardFromActiveSessionPlanOptions,
): AdventureBoardJson {
  const completedNodeIds = options.progress?.completedNodeIds ?? [];
  const baselineNodes = options.plan.nodePlan.filter((node) => !isDestinationNode(node));
  const normalizedLayout = normalizeRouteLayout(options.plan);
  const requiredBaselineCount = baselineNodes.length >= 4 ? 2 : 1;
  const requiredNodes = normalizedLayout.hasExplicitRoutes
    ? normalizedLayout.requiredNodes
    : baselineNodes.slice(0, requiredBaselineCount);
  const routeNodes = normalizedLayout.hasExplicitRoutes
    ? normalizedLayout.routeEntries.map((entry) => entry.node)
    : baselineNodes.slice(requiredBaselineCount);
  const hasRealRouteChoice = routeNodes.length >= 2;
  const mysteryNode = options.plan.nodePlan.find((node) => activityIdForPlanNode(node) === "mystery");
  const questNode = options.plan.nodePlan.find((node) => activityIdForPlanNode(node) === "quest");
  const bossNode = options.plan.nodePlan.find((node) => activityIdForPlanNode(node) === "boss");
  const firstRequired = requiredNodes[0] ?? baselineNodes[0] ?? mysteryNode ?? questNode ?? bossNode;
  const currentNodeId =
    options.progress?.currentNodeId ??
    firstRequired?.id ??
    options.plan.nodePlan.find((node) => !node.locked && !completedNodeIds.includes(node.id))?.id;

  const requiredBoardNodes = requiredNodes.map((node, index) =>
    buildBoardNode({
      planNode: node,
      index,
      state: stateForPlanNode(node, completedNodeIds, currentNodeId),
      label: options.labelForNode?.(node, index) ?? labelForPlanNode(node),
      thumbnailUrl: options.thumbnailForNode?.(node, index),
      slot: index === 0 ? "2" : "3",
      role: "baseline",
      lane: "main",
      order: index + 1,
    }),
  );
  const routeBoardNodes = routeNodes.map((node, index) => {
    const routeEntry = normalizedLayout.hasExplicitRoutes
      ? normalizedLayout.routeEntries.find((entry) => entry.node.id === node.id)
      : undefined;
    const routeSlot = routeEntry
      ? slotForRouteEntry(routeEntry)
      : (hasRealRouteChoice
          ? routeSlots[index] ?? "5c.1"
          : (index === 0 ? "4" : routeSlots[index - 1] ?? "5c.1"));
    const routeLane = routeEntry
      ? laneForRouteEntry(routeEntry)
      : (hasRealRouteChoice ? routeLanes[index] ?? "middle" : "main");
    const routeOrder = routeEntry
      ? routeEntry.routeOrder + 1
      : (hasRealRouteChoice ? laneOrderForRouteNode(index) : requiredNodes.length + index + 1);
    return buildBoardNode({
      planNode: node,
      index: requiredNodes.length + index,
      state: stateForPlanNode(node, completedNodeIds, currentNodeId),
      label: options.labelForNode?.(node, requiredNodes.length + index) ?? labelForPlanNode(node),
      thumbnailUrl: options.thumbnailForNode?.(node, requiredNodes.length + index),
      slot: routeSlot,
      role: hasRealRouteChoice ? "evidence-route" : "baseline",
      lane: routeLane,
      order: routeOrder,
    });
  });
  const destinationNodes = [mysteryNode, questNode, bossNode]
    .filter((node): node is ActiveSessionPlanBoardNodeSnapshot => Boolean(node))
    .map((node, index) =>
      buildBoardNode({
        planNode: node,
        index: baselineNodes.length + index,
        state: destinationStateForPlanNode(node),
        label: options.labelForNode?.(node, baselineNodes.length + index) ?? labelForPlanNode(node),
        thumbnailUrl: options.thumbnailForNode?.(node, baselineNodes.length + index),
        slot: destinationSlotForPlanNode(node),
        role: layoutRoleForKind(kindForPlanNode(node)),
        lane: "main",
        order: 1,
      }),
    );
  const choiceGate = hasRealRouteChoice
    ? buildChoiceGate(options, requiredNodes.length)
    : undefined;
  const nodes = [
    ...requiredBoardNodes,
    ...(choiceGate ? [choiceGate] : []),
    ...routeBoardNodes,
    ...destinationNodes,
  ];

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
      ...(hasRealRouteChoice ? { routeChoiceBehavior: "exclusive" as const } : {}),
    },
    plannerRationale: options.plannerRationale,
    nodes,
    edges: buildPresentationEdges({
      requiredNodes: requiredBoardNodes,
      routeNodes: routeBoardNodes,
      destinationNodes,
      hasRealRouteChoice,
      choiceGate,
    }),
    choiceSets: [
      ...buildRouteChoiceSets({
        routeNodes,
        learningRoutes: options.plan.learningRoutes,
        hasRealRouteChoice,
        completedNodeIds,
        labelForNode: options.labelForNode,
        thumbnailForNode: options.thumbnailForNode,
        routeStartIndex: requiredNodes.length,
      }),
      ...buildMysteryChoiceSets({
        mysteryNode,
        completedNodeIds,
        thumbnailForNode: options.thumbnailForNode,
        index: baselineNodes.length,
      }),
    ],
    companion: options.companion,
    progress: {
      currentNodeId,
      completedNodeIds,
      activeChoiceSetId: options.progress?.activeChoiceSetId ??
        (hasRealRouteChoice ? "baseline-route-options" : undefined),
    },
  };
}

function slotForRouteEntry(entry: NormalizedRouteLayoutEntry): AdventureBoardNode["slot"] {
  if (entry.routeIndex === 0) return entry.routeOrder === 0 ? "5a.1" : "5a.2";
  return entry.routeOrder === 0 ? "5b.1" : "5b.2";
}

function laneForRouteEntry(entry: NormalizedRouteLayoutEntry): NonNullable<AdventureBoardNode["layout"]>["lane"] {
  return entry.routeIndex === 0 ? "upper" : "lower";
}

export function resolveAdventureBoardForActiveSessionPlan(
  options: BuildAdventureBoardFromActiveSessionPlanOptions,
): AdventureBoardJson {
  return buildAdventureBoardFromActiveSessionPlan(options);
}

function buildBoardNode(input: {
  planNode: ActiveSessionPlanBoardNodeSnapshot;
  index: number;
  state: AdventureBoardNodeState;
  label: string;
  thumbnailUrl?: string;
  slot?: AdventureBoardNode["slot"];
  role?: AdventureBoardLayoutRole;
  lane?: NonNullable<AdventureBoardNode["layout"]>["lane"];
  order?: number;
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
  const choiceSetId = activityIdForPlanNode(input.planNode) === "mystery"
    ? mysteryChoiceSetId(input.planNode)
    : undefined;

  return {
    id: input.planNode.id,
    kind,
    activityId: input.planNode.activityId ?? input.planNode.type,
    label: input.label,
    shortLabel: input.label.length > 18 ? input.label.slice(0, 18) : input.label,
    icon: iconForPlanNode(input.planNode, kind),
    thumbnailUrl: input.thumbnailUrl,
    slot: input.slot,
    layout: {
      role: input.role ?? layoutRoleForKind(kind),
      lane: input.lane ?? "main",
      order: input.order ?? input.index + 1,
    },
    state: input.state,
    evidenceRole,
    target,
    wordRadarConfig: input.planNode.wordRadarConfig,
    lock: input.planNode.locked || input.state === "locked"
      ? {
          reason: input.planNode.masteryUnlockState ?? "planner_locked",
          label: lockLabelForPlanNode(input.planNode),
        }
      : undefined,
    choiceSetId,
    action: input.planNode.locked || input.state === "locked"
      ? { type: "show-locked-reason", payloadId: input.planNode.id }
      : choiceSetId
        ? { type: "open-choice-set", payloadId: choiceSetId }
        : { type: "launch-activity", payloadId: input.planNode.id },
  };
}

function buildChoiceGate(
  options: BuildAdventureBoardFromActiveSessionPlanOptions,
  index: number,
): AdventureBoardNode {
  const choiceGateNode: ActiveSessionPlanBoardNodeSnapshot = {
    id: "choose-path",
    type: "choice-gate",
    activityId: "choice-gate",
  };
  return {
    id: "choose-path",
    kind: "choice-gate",
    label: "Choose Path",
    shortLabel: "Choose Path",
    icon: "route",
    thumbnailUrl: options.thumbnailForNode?.(choiceGateNode, index),
    slot: "4",
    layout: { role: "choice-gate", lane: "main", order: 1 },
    state: "available",
    evidenceRole: "preference",
    choiceSetId: "baseline-route-options",
    action: { type: "open-choice-set", payloadId: "baseline-route-options" },
  };
}

function buildPresentationEdges(args: {
  requiredNodes: AdventureBoardNode[];
  routeNodes: AdventureBoardNode[];
  destinationNodes: AdventureBoardNode[];
  hasRealRouteChoice: boolean;
  choiceGate?: AdventureBoardNode;
}): AdventureBoardEdge[] {
  const edges: AdventureBoardEdge[] = [];
  for (let index = 0; index < args.requiredNodes.length - 1; index += 1) {
    const from = args.requiredNodes[index]!;
    const to = args.requiredNodes[index + 1]!;
    edges.push(edgeBetween(from, to));
  }

  const lastRequired = args.requiredNodes[args.requiredNodes.length - 1];
  const firstDestination = args.destinationNodes[0];
  if (args.hasRealRouteChoice && args.choiceGate && lastRequired) {
    edges.push(edgeBetween(lastRequired, args.choiceGate));
    for (const routeLane of routeLaneGroups(args.routeNodes)) {
      const firstRouteNode = routeLane[0];
      const lastRouteNode = routeLane[routeLane.length - 1];
      if (!firstRouteNode || !lastRouteNode) continue;
      edges.push(edgeBetween(args.choiceGate, firstRouteNode, "glow"));
      for (let index = 0; index < routeLane.length - 1; index += 1) {
        edges.push(edgeBetween(routeLane[index]!, routeLane[index + 1]!));
      }
      if (firstDestination) edges.push(edgeBetween(lastRouteNode, firstDestination));
    }
  } else {
    const linearNodes = [...args.requiredNodes, ...args.routeNodes, ...args.destinationNodes];
    const existing = new Set(edges.map((edge) => `${edge.from}->${edge.to}`));
    for (let index = 0; index < linearNodes.length - 1; index += 1) {
      const from = linearNodes[index]!;
      const to = linearNodes[index + 1]!;
      if (existing.has(`${from.id}->${to.id}`)) continue;
      edges.push(edgeBetween(from, to));
    }
  }

  for (let index = 0; index < args.destinationNodes.length - 1; index += 1) {
    edges.push(edgeBetween(args.destinationNodes[index]!, args.destinationNodes[index + 1]!));
  }
  return edges;
}

function routeLaneGroups(routeNodes: AdventureBoardNode[]): AdventureBoardNode[][] {
  const groups = new Map<string, AdventureBoardNode[]>();
  for (const node of routeNodes) {
    const lane = node.layout?.lane ?? "main";
    groups.set(lane, [...(groups.get(lane) ?? []), node]);
  }
  return [...groups.values()].map((nodes) =>
    [...nodes].sort((a, b) => (a.layout?.order ?? 0) - (b.layout?.order ?? 0)));
}

function edgeBetween(
  from: AdventureBoardNode,
  to: AdventureBoardNode,
  style?: AdventureBoardEdge["style"],
): AdventureBoardEdge {
  return {
    id: `edge-${from.id}-to-${to.id}`,
    from: from.id,
    to: to.id,
    state: to.state === "locked" ? "locked" : from.state === "completed" ? "completed" : "available",
    style: style ?? (to.state === "locked" ? "dashed" : undefined),
  };
}

function buildRouteChoiceSets(args: {
  routeNodes: ActiveSessionPlanBoardNodeSnapshot[];
  learningRoutes?: ActiveSessionPlanLearningRouteSnapshot[];
  hasRealRouteChoice: boolean;
  completedNodeIds: string[];
  labelForNode?: (node: ActiveSessionPlanBoardNodeSnapshot, index: number) => string | undefined;
  thumbnailForNode?: (node: ActiveSessionPlanBoardNodeSnapshot, index: number) => string | undefined;
  routeStartIndex: number;
}): AdventureChoiceSet[] {
  if (!args.hasRealRouteChoice) return [];
  const routeByNodeId = new Map<string, ActiveSessionPlanLearningRouteSnapshot>();
  for (const route of args.learningRoutes ?? []) {
    for (const nodeId of route.nodeIds) routeByNodeId.set(nodeId, route);
  }
  const explicitOptions = (args.learningRoutes ?? [])
    .map((route) => {
      const node = args.routeNodes.find((candidate) => route.nodeIds.includes(candidate.id));
      return node ? { route, node } : null;
    })
    .filter((item): item is { route: ActiveSessionPlanLearningRouteSnapshot; node: ActiveSessionPlanBoardNodeSnapshot } => Boolean(item));
  if (explicitOptions.length >= 2) {
    return [{
      id: "baseline-route-options",
      kind: "baseline-route",
      title: "Choose your path",
      options: explicitOptions.slice(0, 3).map(({ route, node }): AdventureChoiceOption => {
        const absoluteIndex = args.routeStartIndex + args.routeNodes.findIndex((candidate) => candidate.id === node.id);
        return {
          id: `choice-${route.id}`,
          label: route.label,
          description: route.rationale,
          thumbnailUrl: args.thumbnailForNode?.(node, absoluteIndex),
          state: node.locked
            ? "locked"
            : args.completedNodeIds.includes(node.id)
              ? "completed"
              : "available",
          nodeId: node.id,
          choiceSignal: choiceSignalForNode(node),
        };
      }),
    }];
  }
  return [{
    id: "baseline-route-options",
    kind: "baseline-route",
    title: "Choose your path",
    options: args.routeNodes.slice(0, 3).map((node, index): AdventureChoiceOption => {
      const absoluteIndex = args.routeStartIndex + index;
      const route = routeByNodeId.get(node.id);
      const label = route?.label ?? args.labelForNode?.(node, absoluteIndex) ?? labelForPlanNode(node);
      return {
        id: `choice-${route?.id ?? node.id}`,
        label,
        description: route?.rationale ?? `Try ${label} next.`,
        thumbnailUrl: args.thumbnailForNode?.(node, absoluteIndex),
        state: node.locked
          ? "locked"
          : args.completedNodeIds.includes(node.id)
            ? "completed"
            : "available",
        nodeId: node.id,
        choiceSignal: choiceSignalForNode(node),
      };
    }),
  }];
}

function buildMysteryChoiceSets(args: {
  mysteryNode?: ActiveSessionPlanBoardNodeSnapshot;
  completedNodeIds: string[];
  thumbnailForNode?: (node: ActiveSessionPlanBoardNodeSnapshot, index: number) => string | undefined;
  index: number;
}): AdventureChoiceSet[] {
  if (!args.mysteryNode) return [];
  const state: AdventureChoiceOption["state"] = args.mysteryNode.locked
    ? "locked"
    : args.completedNodeIds.includes(args.mysteryNode.id)
      ? "completed"
      : "available";
  const base = {
    thumbnailUrl: args.thumbnailForNode?.(args.mysteryNode, args.index),
    nodeId: args.mysteryNode.id,
    state,
    lock: args.mysteryNode.locked
      ? { reason: args.mysteryNode.masteryUnlockState ?? "planner_locked", label: "Preparing" }
      : undefined,
  };
  return [{
    id: mysteryChoiceSetId(args.mysteryNode),
    kind: "mystery",
    title: "Pick a mystery challenge",
    options: [
      {
        id: `${args.mysteryNode.id}-story`,
        label: "Story Challenge",
        description: "Try the practice inside a story wrapper.",
        icon: "book",
        tags: ["story", "calm", "reading"],
        choiceSignal: {
          algorithmFeed: "choicePolicy",
          traits: ["story", "calm", "reading"],
          expectedEvidence: `shown/chosen/skipped/completed outcome for ${args.mysteryNode.id} story wrapper; preference only`,
          preferenceNotMastery: true,
        },
        ...base,
      },
      {
        id: `${args.mysteryNode.id}-speed`,
        label: "Speed Challenge",
        description: "Try the practice with a fast arcade wrapper.",
        icon: "zap",
        tags: ["speed", "competition", "arcade"],
        choiceSignal: {
          algorithmFeed: "choicePolicy",
          traits: ["speed", "competition", "arcade"],
          expectedEvidence: `shown/chosen/skipped/completed outcome for ${args.mysteryNode.id} speed wrapper; preference only`,
          preferenceNotMastery: true,
        },
        ...base,
      },
      {
        id: `${args.mysteryNode.id}-puzzle`,
        label: "Puzzle Challenge",
        description: "Try the practice with a thinking wrapper.",
        icon: "sparkles",
        tags: ["puzzle", "control", "thinking"],
        choiceSignal: {
          algorithmFeed: "choicePolicy",
          traits: ["puzzle", "control", "thinking"],
          expectedEvidence: `shown/chosen/skipped/completed outcome for ${args.mysteryNode.id} puzzle wrapper; preference only`,
          preferenceNotMastery: true,
        },
        ...base,
      },
    ],
  }];
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
  const type = activityIdForPlanNode(node);
  if (type === "mystery") return "mystery";
  if (type === "quest") return "quest";
  if (type === "boss") return "boss";
  if (type === "choice-gate") return "choice-gate";
  return "activity";
}

function activityIdForPlanNode(node: ActiveSessionPlanBoardNodeSnapshot): string {
  return (node.activityId ?? node.type).toLowerCase();
}

function isDestinationNode(node: ActiveSessionPlanBoardNodeSnapshot): boolean {
  return ["mystery", "quest", "boss"].includes(activityIdForPlanNode(node));
}

function destinationStateForPlanNode(node: ActiveSessionPlanBoardNodeSnapshot): AdventureBoardNodeState {
  if (activityIdForPlanNode(node) === "mystery") return node.locked ? "locked" : "available";
  return "locked";
}

function destinationSlotForPlanNode(node: ActiveSessionPlanBoardNodeSnapshot): AdventureBoardNode["slot"] {
  if (activityIdForPlanNode(node) === "mystery") return "6";
  if (activityIdForPlanNode(node) === "quest") return "7";
  return "8";
}

function laneOrderForRouteNode(index: number): number {
  return index < 2 ? 1 : index;
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
  const activityId = activityIdForPlanNode(node);
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
  const activityId = activityIdForPlanNode(node);
  if (activityId === "word-radar") return "radar";
  if (activityId === "spell-check") return "book";
  if (activityId === "pronunciation") return "mic";
  if (kind === "mystery") return "mystery";
  if (kind === "quest") return "star";
  if (kind === "boss") return "crown";
  return undefined;
}

function lockLabelForPlanNode(node: ActiveSessionPlanBoardNodeSnapshot): string {
  if (activityIdForPlanNode(node) === "quest") return "Quest is preparing";
  if (activityIdForPlanNode(node) === "boss") return "After Quest";
  return "Locked";
}

function mysteryChoiceSetId(node: ActiveSessionPlanBoardNodeSnapshot): string {
  return `${node.id}-options`;
}

function choiceSignalForNode(node: ActiveSessionPlanBoardNodeSnapshot) {
  return {
    algorithmFeed: "choicePolicy" as const,
    traits: [
      activityIdForPlanNode(node) === "pronunciation" ? "voice" : "practice",
      activityIdForPlanNode(node) === "spell-check" ? "typing" : "control",
    ],
    expectedEvidence: `shown/chosen/skipped/completed outcome for ${activityIdForPlanNode(node)}; preference only`,
    preferenceNotMastery: true as const,
  };
}

function domainForBoard(domain: string): AdventureBoardDomain {
  return supportedDomains.has(domain as AdventureBoardDomain)
    ? (domain as AdventureBoardDomain)
    : "generic";
}
