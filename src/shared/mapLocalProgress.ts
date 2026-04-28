import type { MapState, NodeResult } from "./adventureTypes";
import { applyHomeworkStyleNodeLocks } from "./mapNodeLocks";

/** Client-only map advance (preview / no server round-trip). Does not persist. */
export function applyLocalNodeResult(mapState: MapState, result: NodeResult): MapState {
  const completed = [...mapState.completedNodes];
  if (!completed.includes(result.nodeId)) {
    completed.push(result.nodeId);
  }
  let currentNodeIndex = mapState.currentNodeIndex;
  let xp = mapState.xp;
  if (result.completed) {
    xp += 5;
    const wn = Math.max(0, Math.floor(result.wordsAttempted));
    const correctWords = wn === 0 ? 0 : Math.min(wn, Math.round(wn * result.accuracy));
    xp += correctWords * 10;
    const nodeCfg = mapState.nodes.find((n) => n.id === result.nodeId);
    if (nodeCfg?.isGoal) {
      xp += 50;
    }
    if (currentNodeIndex < mapState.nodes.length - 1) {
      currentNodeIndex += 1;
    }
  }
  const completedSet = new Set(completed);
  const nodes = applyHomeworkStyleNodeLocks(mapState.nodes, completedSet);
  return {
    ...mapState,
    completedNodes: completed,
    currentNodeIndex,
    xp,
    nodes,
  };
}
