import { adventureBoardDefinitionSchema, validateBoardDefinition, type AdventureBoardDefinition } from '../shared/adventureBoardDefinition';
import { createHash } from "crypto";
import { isDeepStrictEqual } from "node:util";
import { THEME_PRESETS } from "../shared/boardLayout";
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
  definition?: AdventureBoardDefinition;
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

/** Actual capability availability, shared by status, projection and launch. */
export function unavailableActivityReason(node: LearningCycleNodeContract): string | undefined {
  return node.notReadyReason ?? (node.implementationType === "word-builder" ? "activity_unavailable:word-builder" : undefined);
}

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
    ...(board.definition ? { definition: board.definition } : {}),
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
  if (input.definition && input.kind !== 'successor') {
    const definition = adventureBoardDefinitionSchema.parse(input.definition);
    const issues = validateBoardDefinition(definition, input.nodeIds);
    if (issues.length) throw new Error(`board_definition_invalid:${JSON.stringify(issues)}`);
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
  const boards = listBoardInstances(cycle);
  // An initial candidate is a status cursor only; projection and launch remain gated.
  return [...boards].reverse().find((board) => board.publishedAt !== null) ?? boards[0]!;
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
  const previousNodes = new Map(previous.nodes.map((node) => [node.nodeId, node]));
  // A never-bound Not ready step re-pointed to the built-in it named is the one allowed change to a frozen node (contract 51).
  const repointed = new Set(next.nodes.filter((node) => {
    const old = previousNodes.get(node.nodeId);
    return Boolean(old?.notReadyReason && !old.artifactBinding && !old.reusedFrom && node.reusedFrom);
  }).map((node) => node.nodeId));
  for (const board of before) {
    const current = after.get(board.boardId);
    if (!current) throw new Error(`learning_board_removed:${board.boardId}`);
    const publication = board.publishedAt === null ? { ...current, publishedAt: null } : current;
    const rehashed = board.nodeIds.some((nodeId) => repointed.has(nodeId));
    const othersFrozen = !rehashed || board.nodeIds.every((nodeId) => repointed.has(nodeId)
      || stableJson(frozenNode(next.nodes.find((node) => node.nodeId === nodeId), nodeId)) === stableJson(frozenNode(previousNodes.get(nodeId), nodeId)));
    const expected = rehashed ? { ...board, topologyHash: current.topologyHash } : board;
    if (!othersFrozen || stableJson(publication) !== stableJson(expected) || boardTopologyHash(next, board) !== expected.topologyHash) {
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
    // A Not ready portal was never bound, so it may receive its first binding once (an in-place repair).
    // A retired binding stays retired.
    if (old.state === "blocked" && old.artifactBinding === null && node.artifactBinding !== null && !old.notReadyReason) {
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
 * publish Probe nodes independently. Teaching must pass the common artifact
 * and canvas gates before it can become visible.
 */
export function withInitialBoard<T extends Pick<LearningCycleRecordV2, "homeworkId" | "nodes" | "assignment"> & {boardDefinition?:AdventureBoardDefinition}>(input: T, kind: "probe" | "teaching", publishedAt: string): T & { boards: LearningBoardInstance[] } {
  if (!input.boardDefinition) throw new Error("board_definition_missing:initial");
  const draft = { ...input, boards: [] } as unknown as LearningCycleRecordV2;
  return {
    ...input,
    boards: [publishBoardInstance(draft, {
      kind,
      ...(input.boardDefinition ? {definition:input.boardDefinition}:{}),
      predecessorBoardId: null,
      plannerDecisionId: null,
      evidenceIds: [...input.assignment.capturedEvidenceIds],
      nodeIds: input.nodes.map((node) => node.nodeId),
      publishedAt: kind === "probe" ? publishedAt : null,
    })],
  };
}

/**
 * Operational status for the one successor being prepared. updatedAt stays fixed
 * from decision to publication so a polling session never refreshes into the new
 * board; the successor first appears on a later session.
 */
export function successorPreparationStatus(cycle: LearningCycleRecordV2): { updatedAt: string; startedAt: string; phase: "successor_preparing" | "successor_published" | "needs_attention"; nodes: Array<{nodeId:string;status:string;reason?:string}> } | undefined {
  const latest = listBoardInstances(cycle).at(-1);
  if (!latest || latest.kind !== "successor") return undefined;
  const decidedAt = cycle.decisionHistory.find((entry) => entry.decisionId === latest.plannerDecisionId)?.createdAt ?? cycle.createdAt;
  // Publication freezes the design; it does not prove that any portal can launch.
  // Keep the current chapter stable, but expose actual availability on later visits.
  const nodes = latest.publishedAt === null ? [] : latest.nodeIds.map(nodeId => {
    const node = cycle.nodes.find(candidate => candidate.nodeId === nodeId);
    const reason = node ? unavailableActivityReason(node) : "successor_activity_missing";
    const available = !reason && node?.artifactBinding?.validationStatus === "passed" && ["ready","active","completed"].includes(node.state);
    return { nodeId, status: available ? (node!.state === "completed" ? "completed" : "ready") : "not_ready",
      ...(!available ? {reason:reason ?? "successor_activity_unavailable"} : {}) };
  });
  const attention = latest.publishedAt === null ? cycle.lifecycle === "blocked"
    : !nodes.some(node => node.status === "ready" || node.status === "completed");
  return { updatedAt: decidedAt, startedAt: decidedAt, phase: attention ? "needs_attention" : latest.publishedAt === null ? "successor_preparing" : "successor_published", nodes };
}

/**
 * The single outstanding successor step after a restart: a committed evidence batch still awaiting its
 * one Planner decision, or a preparing successor with unbuilt or held nodes. Failed nodes are never rebuilt.
 */
export function successorResumeAction(cycle: LearningCycleRecordV2): "decide" | "prepare" | null {
  // Legacy cycles never auto-resume: that would start Planner calls they never made before contract 21.
  if (!cycle.boards || cycle.lifecycle === "blocked") return null;
  if (["baseline_evaluating", "quest_evaluating", "boss_evaluating"].includes(cycle.lifecycle)) return "decide";
  const preparing = preparingBoardInstance(cycle);
  if (!preparing) return null;
  const nodes = cycle.nodes.filter((node) => preparing.nodeIds.includes(node.nodeId));
  // An activity held before the Not ready rule resumes so preparation can degrade it and publish.
  if (nodes.some((node) => node.state === "blocked" && !node.notReadyReason)) return "prepare";
  return nodes.some((node) => node.state === "generating") || (preparing.definition && !cycle.canvasVerifications?.[preparing.boardId]) ? "prepare" : null;
}

/** Presentation history for the map artist: the named design and look of each published board,
 * newest first. It helps the artist make something new; it is never child evidence. */
export function boardDesignHistory(cycles:ReadonlyArray<{boards?:ReadonlyArray<Pick<LearningBoardInstance,"definition"|"publishedAt">>}>,limit=6):Array<{pattern:string;theme:string|null;publishedAt:string}> {
  return cycles.flatMap(cycle=>cycle.boards??[])
    .flatMap(board=>board.publishedAt&&board.definition?.pattern?[{pattern:board.definition.pattern,theme:THEME_PRESETS.find(preset=>isDeepStrictEqual(preset.palette,board.definition!.theme.palette))?.id??null,publishedAt:board.publishedAt}]:[])
    .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,limit);
}
