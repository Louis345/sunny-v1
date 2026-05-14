import type { NodeConfig } from "./adventureTypes";

export function hasPlayableMasteryArtifact(node: NodeConfig): boolean {
  const status = node.adaptiveArtifact?.validationStatus;
  const validationPassed = status === "passed" || status === "warning";
  return Boolean(
    node.adaptiveArtifact?.artifactId &&
      node.adaptiveArtifact.contentId &&
      validationPassed &&
      (node.gameFile || node.gameHtmlPath),
  );
}

function isMasteryNode(node: NodeConfig): boolean {
  return node.type === "quest" || node.type === "boss";
}

function shouldKeepMasteryLocked(node: NodeConfig): boolean {
  if (!isMasteryNode(node)) return false;
  if (node.masteryUnlockState === "completed") return false;
  if (node.masteryUnlockState === "unlocked") return !hasPlayableMasteryArtifact(node);
  return true;
}

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
    if (shouldKeepMasteryLocked(node)) {
      isLocked = true;
    } else if (node.type === "boss" && !node.gameHtmlPath && !node.gameFile) {
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
