import type { LearningCycleNodeContract, LearningCycleRecordV2 } from "../engine/learningCycleRepository";

/**
 * The built node whose problem is open, for binding live item context (2026-11-10): any role, any subject, when the
 * node's item contracts hold the item. A math Discovery node binds as before. Spelling words bind through
 * bindSpellingAssessment. Undefined when the node has no built artifact or does not hold the item.
 */
export function liveItemNode(cycle: Pick<LearningCycleRecordV2, "domain" | "nodes"> | null | undefined, nodeId: string, itemId: string):
  (LearningCycleNodeContract & { artifactBinding: NonNullable<LearningCycleNodeContract["artifactBinding"]> }) | undefined {
  const node = cycle?.nodes.find(candidate => candidate.nodeId === nodeId);
  if (!node?.artifactBinding || !itemId.trim()) return undefined;
  const holds = Boolean(node.evidenceContract.itemContracts?.[itemId]) || (cycle!.domain === "math" && node.role === "evaluation");
  return holds ? node as never : undefined;
}
