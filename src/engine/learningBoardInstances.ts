import { createHash } from "crypto";
import type {
  LearningCycleAgencyExperiment,
  LearningCycleNodeContract,
  LearningCycleNodeState,
  LearningCycleRecordV2,
} from "./learningCycleRepository";

export type LearningBoardKind = "probe" | "teaching" | "successor" | "legacy";

/** One complete, immutable published board inside the canonical cycle (contract 21). */
export type LearningBoardInstance = {
  boardId: string;
  kind: LearningBoardKind;
  predecessorBoardId: string | null;
  plannerDecisionId: string | null;
  evidenceIds: string[];
  nodeIds: string[];
  agencyExperiment?: LearningCycleAgencyExperiment;
  topologyHash: string;
  /** Null while the complete successor is still being implemented and verified. */
  publishedAt: string | null;
};

export type PublishBoardInstanceInput = Omit<LearningBoardInstance, "boardId" | "topologyHash">;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Frozen node facts: identity, academic contract and Creator-authored presentation. Runtime state is excluded. */
function frozenNode(node: LearningCycleNodeContract | undefined, nodeId: string) {
  if (!node) return { nodeId, missing: true };
  return {
    nodeId: node.nodeId,
    role: node.role,
    implementationType: node.implementationType,
    routeId: node.routeId,
    predictionId: node.predictionId,
    title: node.title,
    academicTarget: node.academicTarget,
    algorithmOwner: node.algorithmOwner,
    theoryId: node.theoryId,
    experimentId: node.experimentId,
    mechanic: node.mechanic,
    theme: node.theme,
    design: node.design,
    openingScreen: node.openingScreen,
    evidenceContract: node.evidenceContract,
  };
}

export function boardTopologyHash(cycle: LearningCycleRecordV2, board: LearningBoardInstance): string {
  const nodes = new Map(cycle.nodes.map((node) => [node.nodeId, node]));
  return createHash("sha256").update(stableJson({
    boardId: board.boardId,
    kind: board.kind,
    predecessorBoardId: board.predecessorBoardId,
    plannerDecisionId: board.plannerDecisionId,
    evidenceIds: board.evidenceIds,
    nodes: board.nodeIds.map((nodeId) => frozenNode(nodes.get(nodeId), nodeId)),
    agencyExperiment: board.agencyExperiment ?? null,
  })).digest("hex");
}

export function publishBoardInstance(cycle: LearningCycleRecordV2, input: PublishBoardInstanceInput): LearningBoardInstance {
  const boards = cycle.boards ?? [];
  if (boards.some((board) => board.publishedAt === null)) throw new Error("learning_board_successor_already_preparing");
  const owned = new Set(boards.flatMap((board) => board.nodeIds));
  const known = new Set(cycle.nodes.map((node) => node.nodeId));
  if (input.nodeIds.length === 0) throw new Error("learning_board_empty");
  for (const nodeId of input.nodeIds) {
    if (!known.has(nodeId)) throw new Error(`learning_board_node_missing:${nodeId}`);
    if (owned.has(nodeId)) throw new Error(`learning_board_node_already_owned:${nodeId}`);
  }
  const board: LearningBoardInstance = {
    ...structuredClone(input),
    boardId: `${cycle.homeworkId}:board:${boards.length + 1}`,
    topologyHash: "",
  };
  board.topologyHash = boardTopologyHash(cycle, board);
  console.log(` 🎮 [learning-board] [publish] [${board.boardId}] kind=${board.kind} decision=${board.plannerDecisionId ?? "none"} nodes=${board.nodeIds.length}`);
  return board;
}

/** Contract-21 boards, or one synthesized read-only legacy instance for older cycles. */
export function listBoardInstances(cycle: LearningCycleRecordV2): LearningBoardInstance[] {
  if (cycle.boards) return cycle.boards;
  const legacy: LearningBoardInstance = {
    boardId: `cycle-board:${cycle.homeworkId}`,
    kind: "legacy",
    predecessorBoardId: null,
    plannerDecisionId: null,
    evidenceIds: [],
    nodeIds: cycle.nodes.map((node) => node.nodeId),
    ...(cycle.agencyExperiment ? { agencyExperiment: cycle.agencyExperiment } : {}),
    topologyHash: "",
    publishedAt: cycle.createdAt,
  };
  legacy.topologyHash = boardTopologyHash(cycle, legacy);
  return [legacy];
}

/** The latest published board is the one the child plays; earlier boards are read-only history. */
export function currentBoardInstance(cycle: LearningCycleRecordV2): LearningBoardInstance {
  return [...listBoardInstances(cycle)].reverse().find((board) => board.publishedAt !== null)!;
}

/** The one successor being prepared between sessions, if any. */
export function preparingBoardInstance(cycle: LearningCycleRecordV2): LearningBoardInstance | undefined {
  return listBoardInstances(cycle).find((board) => board.publishedAt === null);
}

export function boardOwningNode(cycle: LearningCycleRecordV2, nodeId: string): LearningBoardInstance | undefined {
  return listBoardInstances(cycle).find((board) => board.nodeIds.includes(nodeId));
}

/** Contract-21 boards for a write: legacy cycles gain their synthesized instance before any successor. */
export function boardsForWrite(cycle: LearningCycleRecordV2): LearningBoardInstance[] {
  return structuredClone(listBoardInstances(cycle));
}

/** What a binding is, as opposed to proof about it: never changes once a board is published. */
function bindingIdentity(binding: LearningCycleNodeContract["artifactBinding"]) {
  return binding && {
    contentId: binding.contentId,
    artifactId: binding.artifactId,
    localArtifactPath: binding.localArtifactPath,
    activityConfigPath: binding.activityConfigPath,
    contractFingerprint: binding.contractFingerprint,
    generatedHtmlHash: binding.creativeProvenance?.generatedHtmlHash,
  };
}

/** True when the node's artifact is bound on a published board, so its bytes may never be replaced. */
export function isPublishedArtifactNode(cycle: LearningCycleRecordV2, nodeId: string): boolean {
  if (!cycle.boards) return false;
  const owner = boardOwningNode(cycle, nodeId);
  return Boolean(owner?.publishedAt && cycle.nodes.find((node) => node.nodeId === nodeId)?.artifactBinding);
}

const LIFECYCLE_RANK: Record<LearningCycleNodeState, number> = {
  generating: 0,
  blocked: 1,
  locked: 1,
  ready: 1,
  active: 1,
  completed: 2,
};

export function assertPublishedBoardsImmutable(previous: LearningCycleRecordV2, next: LearningCycleRecordV2): void {
  const before = previous.boards ?? [];
  if (before.length === 0 && !next.boards?.length) return;
  const after = new Map((next.boards ?? []).map((board) => [board.boardId, board]));
  for (const board of before) {
    const current = after.get(board.boardId);
    if (!current) throw new Error(`learning_board_removed:${board.boardId}`);
    const publication = board.publishedAt === null ? { ...current, publishedAt: null } : current;
    if (stableJson(publication) !== stableJson(board) || boardTopologyHash(next, board) !== board.topologyHash) {
      throw new Error(`learning_board_topology_changed:${board.boardId}`);
    }
    if (board.agencyExperiment && next.agencyExperiment?.experimentId === board.agencyExperiment.experimentId
      && stableJson(next.agencyExperiment) !== stableJson(board.agencyExperiment)) {
      throw new Error(`learning_board_topology_changed:${board.boardId}`);
    }
  }
  const owned = new Set((next.boards ?? []).flatMap((board) => board.nodeIds));
  for (const node of next.nodes) {
    if (!owned.has(node.nodeId)) throw new Error(`learning_board_node_unowned:${node.nodeId}`);
  }
  const prior = new Map(previous.nodes.map((node) => [node.nodeId, node]));
  const frozen = new Set(before.filter((board) => board.publishedAt !== null).flatMap((board) => board.nodeIds));
  for (const node of next.nodes) {
    const old = prior.get(node.nodeId);
    if (!old || !frozen.has(node.nodeId)) continue;
    if (LIFECYCLE_RANK[node.state] < LIFECYCLE_RANK[old.state] && !(node.state === "blocked" && old.state !== "completed")) {
      throw new Error(`learning_board_state_regressed:${node.nodeId}`);
    }
    if (old.state === "completed" && node.state !== "completed") throw new Error(`learning_board_state_regressed:${node.nodeId}`);
    // Only route navigation inside a board's frozen choice may close a playable node again.
    const routeNode = before.some((board) => board.agencyExperiment
      && [...board.agencyExperiment.sharedNodeIds, ...board.agencyExperiment.routes.flatMap((route) => route.nodeIds)].includes(node.nodeId));
    if (node.state === "locked" && ["ready", "active"].includes(old.state) && !routeNode) {
      throw new Error(`learning_board_state_regressed:${node.nodeId}`);
    }
    if (old.state === "blocked" && old.artifactBinding === null && node.artifactBinding !== null) {
      throw new Error(`learning_board_artifact_rebound:${node.nodeId}`);
    }
    if (old.artifactBinding) {
      const retired = node.artifactBinding === null && node.state === "blocked";
      if (!retired && stableJson(bindingIdentity(node.artifactBinding)) !== stableJson(bindingIdentity(old.artifactBinding))) {
        throw new Error(`learning_board_artifact_rebound:${node.nodeId}`);
      }
    }
  }
}

/**
 * Freeze a new cycle's opening board as its first instance. Opening boards
 * (the Probe Board, or a directly ingested first board) publish before every
 * node is verified; their nodes still only move forward.
 */
export function withInitialBoard<T extends Pick<LearningCycleRecordV2, "homeworkId" | "nodes" | "assignment">>(input: T, kind: "probe" | "teaching", publishedAt: string): T & { boards: LearningBoardInstance[] } {
  const draft = { ...input, boards: [] } as unknown as LearningCycleRecordV2;
  return {
    ...input,
    boards: [publishBoardInstance(draft, {
      kind,
      predecessorBoardId: null,
      plannerDecisionId: null,
      evidenceIds: [...input.assignment.capturedEvidenceIds],
      nodeIds: input.nodes.map((node) => node.nodeId),
      publishedAt,
    })],
  };
}

/**
 * Operational status for the one successor being prepared. updatedAt stays fixed
 * from decision to publication so a polling session never refreshes into the new
 * board; the successor first appears on a later session.
 */
export function successorPreparationStatus(cycle: LearningCycleRecordV2): { updatedAt: string; startedAt: string; phase: "successor_preparing" | "successor_published" | "needs_attention"; nodes: [] } | undefined {
  const latest = listBoardInstances(cycle).at(-1);
  if (!latest || latest.kind !== "successor") return undefined;
  const decidedAt = cycle.decisionHistory.find((entry) => entry.decisionId === latest.plannerDecisionId)?.createdAt ?? cycle.createdAt;
  const attention = latest.publishedAt === null && cycle.nodes.some((node) => latest.nodeIds.includes(node.nodeId) && node.state === "blocked");
  return { updatedAt: decidedAt, startedAt: decidedAt, phase: attention ? "needs_attention" : latest.publishedAt === null ? "successor_preparing" : "successor_published", nodes: [] };
}

/**
 * The single outstanding successor step after a restart: a committed evidence batch still awaiting its
 * one Planner decision, or a preparing successor with unbuilt nodes. Nodes needing human attention never resume.
 */
export function successorResumeAction(cycle: LearningCycleRecordV2): "decide" | "prepare" | null {
  // Legacy cycles never auto-resume: that would start Planner calls they never made before contract 21.
  if (!cycle.boards) return null;
  if (["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(cycle.lifecycle)) return "decide";
  const preparing = preparingBoardInstance(cycle);
  if (!preparing) return null;
  const nodes = cycle.nodes.filter((node) => preparing.nodeIds.includes(node.nodeId));
  if (nodes.some((node) => node.state === "blocked")) return null;
  return nodes.some((node) => node.state === "generating") ? "prepare" : null;
}
