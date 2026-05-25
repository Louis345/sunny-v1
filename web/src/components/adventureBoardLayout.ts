import type {
  AdventureBoardJson,
  AdventureBoardLayoutRole,
  AdventureBoardNode,
  AdventureBoardNodeState,
} from "../../../src/shared/adventureBoardJson";

export type PositionedAdventureBoardNode = AdventureBoardNode & {
  position: { x: number; y: number };
};

function roleFor(node: AdventureBoardNode): AdventureBoardLayoutRole {
  if (node.layout?.role) return node.layout.role;
  if (node.kind === "start") return "start";
  if (node.kind === "mystery") return "mystery";
  if (node.kind === "choice-gate") return "choice-gate";
  if (node.kind === "quest") return "quest";
  if (node.kind === "boss") return "boss";
  if (node.evidenceRole === "transfer") return "evidence-route";
  return "baseline";
}

function siblingOrdinal(nodes: AdventureBoardNode[], node: AdventureBoardNode): number {
  const role = roleFor(node);
  const lane = node.layout?.lane ?? "main";
  return nodes
    .filter((candidate) => roleFor(candidate) === role && (candidate.layout?.lane ?? "main") === lane)
    .findIndex((candidate) => candidate.id === node.id);
}

function horizontalPosition(
  node: AdventureBoardNode,
  nodes: AdventureBoardNode[],
): { x: number; y: number } {
  const role = roleFor(node);
  const lane = node.layout?.lane ?? "main";
  const order = Math.max(0, (node.layout?.order ?? siblingOrdinal(nodes, node)) - 1);

  if (role === "start") return { x: 0.10, y: 0.82 };
  if (role === "mystery") return { x: 0.54, y: 0.46 };
  if (role === "choice-gate") return { x: 0.64, y: 0.56 };
  if (role === "quest") return { x: 0.76, y: 0.34 };
  if (role === "boss") return { x: 0.86, y: 0.18 };

  if (role === "evidence-route") {
    const upper = [
      { x: 0.38, y: 0.30 },
      { x: 0.58, y: 0.26 },
      { x: 0.68, y: 0.31 },
    ];
    const lower = [
      { x: 0.46, y: 0.76 },
      { x: 0.58, y: 0.72 },
      { x: 0.68, y: 0.67 },
    ];
    const main = [
      { x: 0.46, y: 0.42 },
      { x: 0.58, y: 0.40 },
      { x: 0.68, y: 0.44 },
    ];
    const track = lane === "lower" ? lower : lane === "main" ? main : upper;
    return track[Math.min(order, track.length - 1)]!;
  }

  const baseline = [
    { x: 0.25, y: 0.70 },
    { x: 0.40, y: 0.58 },
    { x: 0.47, y: 0.66 },
  ];
  return baseline[Math.min(order, baseline.length - 1)]!;
}

function stateForRouteChoice(
  board: AdventureBoardJson,
  node: AdventureBoardNode,
): { state: AdventureBoardNodeState; lock?: AdventureBoardNode["lock"] } {
  const groupId = node.layout?.routeGroupId;
  if (!groupId || board.layout?.routeChoiceBehavior === "parallel") {
    return { state: node.state, lock: node.lock };
  }

  const hasSelectedSibling = board.nodes.some((candidate) =>
    candidate.layout?.routeGroupId === groupId && candidate.layout?.selected,
  );
  if (!hasSelectedSibling || node.layout?.selected) {
    return { state: node.state, lock: node.lock };
  }

  return {
    state: "locked",
    lock: node.lock ?? {
      reason: "route-not-picked",
      label: "Route not picked",
    },
  };
}

export function resolveAdventureBoardNodes(board: AdventureBoardJson): PositionedAdventureBoardNode[] {
  return board.nodes.map((node) => {
    const routeState = stateForRouteChoice(board, node);
    return {
      ...node,
      ...routeState,
      position: node.position ?? horizontalPosition(node, board.nodes),
    };
  });
}
