import type { NodeConfig } from "./adventureTypes";

/** Node 1 always unlocked; later nodes until previous is completed; boss until all others done. */
export function applyHomeworkStyleNodeLocks(
  nodes: NodeConfig[],
  completedIds: ReadonlySet<string>,
): NodeConfig[] {
  const bossSlotIndex = nodes.findIndex(
    (n, i) => n.type === "boss" || (n.isGoal === true && i === nodes.length - 1),
  );

  return nodes.map((node, idx) => {
    const isCompleted = completedIds.has(node.id);
    let isLocked = false;
    if (node.type === "boss" && !node.gameHtmlPath) {
      isLocked = true;
    } else if (isCompleted) {
      isLocked = false;
    } else if (idx === 0) {
      isLocked = false;
    } else if (bossSlotIndex >= 0 && idx === bossSlotIndex) {
      isLocked = nodes.some((n, j) => j !== bossSlotIndex && !completedIds.has(n.id));
    } else {
      const prev = nodes[idx - 1];
      isLocked = prev ? !completedIds.has(prev.id) : true;
    }
    return { ...node, isLocked, isCompleted };
  });
}
