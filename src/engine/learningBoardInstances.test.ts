import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  assertPublishedBoardsImmutable,
  boardTopologyHash,
  isPublishedArtifactNode,
  listBoardInstances,
  publishBoardInstance,
} from "./learningBoardInstances";
import {
  createLearningCycle,
  getLearningCycle,
  projectLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
} from "./learningCycleRepository";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-board-instances-"));
}

function node(nodeId: string, overrides: Partial<LearningCycleNodeContract> = {}): LearningCycleNodeContract {
  return {
    nodeId,
    role: "baseline",
    title: nodeId,
    state: "ready",
    academicTarget: { domain: "math", skill: "equal_groups", targets: ["5x2"] },
    algorithmOwner: "retrieval-practice",
    theoryId: "theory-1",
    experimentId: `experiment-${nodeId}`,
    mechanic: "sort",
    theme: "space",
    openingScreen: { title: nodeId, purpose: "Practice." },
    generationPrompt: null,
    artifactBinding: null,
    artwork: { status: "pending", localPath: null, prompt: null },
    sfxContract: [],
    companionContract: { events: [] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
    ...overrides,
  };
}

const binding = {
  contentId: "content-1",
  artifactId: "artifact-1",
  localArtifactPath: "/generated/a.html",
  localArtworkPath: "/generated/a.jpeg",
  contractFingerprint: "fp-1",
  validationStatus: "passed" as const,
};

function cycleInput(withBoard: boolean): CreateLearningCycleInput {
  const nodes = [
    node("shared-entry"),
    node("route-a", { routeId: "route-a", state: "locked" }),
    node("route-b", { routeId: "route-b", state: "locked" }),
    node("checkpoint", { state: "locked" }),
  ];
  const agencyExperiment = {
    experimentId: "agency-1",
    sharedNodeIds: ["shared-entry"],
    routes: [
      { routeId: "route-a", nodeIds: ["route-a", "checkpoint"] },
      { routeId: "route-b", nodeIds: ["route-b", "checkpoint"] },
    ],
  };
  const base: CreateLearningCycleInput = {
    childId: "boardkid",
    homeworkId: "hw-boards",
    domain: "math",
    assignment: { title: "Equal groups", contentFingerprint: "fp", capturedEvidenceIds: ["assignment:1"], targets: ["5x2"] },
    academicTheory: {
      theoryId: "theory-1", revision: 1, hypothesis: "h", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [],
    },
    engagementTheory: null,
    nodes,
    agencyExperiment,
  };
  if (!withBoard) return base;
  const draft = { ...base, boards: [] } as unknown as LearningCycleRecordV2;
  const board = publishBoardInstance(draft, {
    kind: "teaching",
    predecessorBoardId: "hw-boards:board:0",
    plannerDecisionId: "hw-boards:decision:r4",
    evidenceIds: ["obs-1"],
    nodeIds: nodes.map((candidate) => candidate.nodeId),
    agencyExperiment,
    publishedAt: "2026-10-01T12:00:00.000Z",
  });
  return { ...base, boards: [board] };
}

function published(): LearningCycleRecordV2 {
  return createLearningCycle(cycleInput(true), { rootDir: root(), now: new Date("2026-10-01T12:00:00.000Z") });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("immutable board instances (contract 21, test 1)", () => {
  it("publishes a unique board identity linked to its decision, predecessor and evidence", () => {
    const cycle = published();
    const [board] = listBoardInstances(cycle);
    expect(board).toMatchObject({
      boardId: "hw-boards:board:1",
      kind: "teaching",
      predecessorBoardId: "hw-boards:board:0",
      plannerDecisionId: "hw-boards:decision:r4",
      evidenceIds: ["obs-1"],
      nodeIds: ["shared-entry", "route-a", "route-b", "checkpoint"],
      publishedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(board!.topologyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(boardTopologyHash(cycle, board!)).toBe(board!.topologyHash);
  });

  it("keeps the topology hash stable across forward runtime state, artifact binding, artwork and evidence", () => {
    const cycle = published();
    const [board] = listBoardInstances(cycle);
    const advanced = structuredClone(cycle);
    advanced.nodes[0]!.state = "completed";
    advanced.nodes[0]!.artifactBinding = binding;
    advanced.nodes[0]!.artwork = { status: "ready", localPath: "/generated/a.jpeg", prompt: null };
    advanced.nodes[0]!.evidenceIds = ["obs-2"];
    expect(boardTopologyHash(advanced, board!)).toBe(board!.topologyHash);
    expect(() => assertPublishedBoardsImmutable(cycle, advanced)).not.toThrow();
  });

  it.each([
    ["repurposed title", (next: LearningCycleRecordV2) => { next.nodes[1]!.title = "New Name"; next.nodes[1]!.openingScreen.title = "New Name"; }],
    ["repurposed mechanic", (next: LearningCycleRecordV2) => { next.nodes[1]!.mechanic = "race"; }],
    ["replaced item contract", (next: LearningCycleRecordV2) => { next.nodes[3]!.academicTarget.targets = ["5x9"]; }],
    ["rewired route choice", (next: LearningCycleRecordV2) => { next.agencyExperiment!.routes[1]!.nodeIds = ["route-b"]; }],
  ])("rejects a %s on a published board", (_label, mutate) => {
    const cycle = published();
    const next = structuredClone(cycle);
    mutate(next);
    expect(() => assertPublishedBoardsImmutable(cycle, next)).toThrow("learning_board_topology_changed");
  });

  it("rejects appending a node that no published board owns", () => {
    const cycle = published();
    const next = structuredClone(cycle);
    next.nodes.push(node("appended-support"));
    expect(() => assertPublishedBoardsImmutable(cycle, next)).toThrow("learning_board_node_unowned:appended-support");
  });

  it("rejects removing a node or a board instance", () => {
    const cycle = published();
    const withoutNode = structuredClone(cycle);
    withoutNode.nodes = withoutNode.nodes.filter((candidate) => candidate.nodeId !== "route-b");
    expect(() => assertPublishedBoardsImmutable(cycle, withoutNode)).toThrow("learning_board_topology_changed");
    const withoutBoard = structuredClone(cycle);
    withoutBoard.boards = [];
    expect(() => assertPublishedBoardsImmutable(cycle, withoutBoard)).toThrow("learning_board_removed:hw-boards:board:1");
  });

  it("rejects relocking a completed node or returning a playable node to generating", () => {
    const cycle = published();
    const completed = structuredClone(cycle);
    completed.nodes[0]!.state = "completed";
    const relocked = structuredClone(completed);
    relocked.nodes[0]!.state = "locked";
    expect(() => assertPublishedBoardsImmutable(completed, relocked)).toThrow("learning_board_state_regressed:shared-entry");
    const regenerating = structuredClone(cycle);
    regenerating.nodes[0]!.state = "generating";
    expect(() => assertPublishedBoardsImmutable(cycle, regenerating)).toThrow("learning_board_state_regressed:shared-entry");
  });

  it("treats route navigation inside the frozen choice as navigation, not relock", () => {
    const cycle = published();
    const next = structuredClone(cycle);
    next.nodes[1]!.state = "ready";
    const back = structuredClone(next);
    back.nodes[1]!.state = "locked";
    expect(() => assertPublishedBoardsImmutable(next, back)).not.toThrow();
  });

  it("writes an artifact binding once and only allows retirement, never rebinding", () => {
    const cycle = published();
    const bound = structuredClone(cycle);
    bound.nodes[0]!.artifactBinding = binding;
    expect(() => assertPublishedBoardsImmutable(cycle, bound)).not.toThrow();
    const rebound = structuredClone(bound);
    rebound.nodes[0]!.artifactBinding = { ...binding, artifactId: "artifact-2" };
    expect(() => assertPublishedBoardsImmutable(bound, rebound)).toThrow("learning_board_artifact_rebound:shared-entry");
    const retired = structuredClone(bound);
    retired.nodes[0]!.artifactBinding = null;
    retired.nodes[0]!.state = "blocked";
    expect(() => assertPublishedBoardsImmutable(bound, retired)).not.toThrow();
    const reboundAfterRetirement = structuredClone(retired);
    reboundAfterRetirement.nodes[0]!.artifactBinding = { ...binding, artifactId: "artifact-after-retirement" };
    reboundAfterRetirement.nodes[0]!.state = "ready";
    expect(() => assertPublishedBoardsImmutable(retired, reboundAfterRetirement))
      .toThrow("learning_board_artifact_rebound:shared-entry");
    const clearedButPlayable = structuredClone(bound);
    clearedButPlayable.nodes[0]!.artifactBinding = null;
    expect(() => assertPublishedBoardsImmutable(bound, clearedButPlayable)).toThrow("learning_board_artifact_rebound:shared-entry");
  });

  it("allows refreshing verification proof for the same artifact bytes but never new bytes", () => {
    const cycle = published();
    const bound = structuredClone(cycle);
    bound.nodes[0]!.artifactBinding = { ...binding, creativeProvenance: { rationale: "r", qualityPrediction: "q", creatorPromptHash: "c", artworkPromptHash: "a", generatedHtmlHash: "html-1" } };
    const reverified = structuredClone(bound);
    reverified.nodes[0]!.artifactBinding!.validationProof = { engine: "playwright", passed: true, worldStateChanged: true, screenshotPaths: ["new.png"], htmlHash: "html-1", verifierVersion: 9 };
    expect(() => assertPublishedBoardsImmutable(bound, reverified)).not.toThrow();
    const repaired = structuredClone(bound);
    repaired.nodes[0]!.artifactBinding!.creativeProvenance!.generatedHtmlHash = "html-2";
    expect(() => assertPublishedBoardsImmutable(bound, repaired)).toThrow("learning_board_artifact_rebound:shared-entry");
    expect(isPublishedArtifactNode(bound, "shared-entry")).toBe(true);
    expect(isPublishedArtifactNode(cycle, "shared-entry")).toBe(false);
  });

  it("enforces immutability on every canonical transition of a cycle with published boards", () => {
    const rootDir = root();
    const cycle = createLearningCycle(cycleInput(true), { rootDir });
    expect(() => transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
      type: "plan_reconciled",
      assignment: cycle.assignment,
      academicTheory: cycle.academicTheory,
      engagementTheory: null,
      nodes: [...cycle.nodes, node("reconciled-extra")],
      reason: "re-ingestion attempted to append a node",
    }, { rootDir })).toThrow("learning_board_node_unowned:reconciled-extra");
    expect(getLearningCycle(cycle.childId, cycle.homeworkId, { rootDir })).toEqual(cycle);
  });

  it("rejects a board that claims an already-owned node or an unknown node", () => {
    const cycle = published();
    const successor = {
      kind: "successor" as const,
      predecessorBoardId: "hw-boards:board:1",
      plannerDecisionId: "hw-boards:decision:r9",
      evidenceIds: ["obs-1"],
      publishedAt: "2026-10-02T12:00:00.000Z",
    };
    expect(() => publishBoardInstance(cycle, { ...successor, nodeIds: ["checkpoint"] }))
      .toThrow("learning_board_node_already_owned:checkpoint");
    expect(() => publishBoardInstance(cycle, { ...successor, nodeIds: ["missing"] }))
      .toThrow("learning_board_node_missing:missing");
  });
});

describe("legacy board readability (test 16)", () => {
  it("reads a pre-contract-21 cycle as one synthesized legacy board without rewriting it", () => {
    const rootDir = root();
    const legacy = createLearningCycle(cycleInput(false), { rootDir, now: new Date("2026-07-01T00:00:00.000Z") });
    const file = path.join(rootDir, "src/context/boardkid/homework/cycles/hw-boards.json");
    const before = fs.readFileSync(file, "utf8");
    const reread = getLearningCycle("boardkid", "hw-boards", { rootDir })!;

    expect(reread.boards).toBeUndefined();
    expect(listBoardInstances(reread)).toEqual([expect.objectContaining({
      boardId: "cycle-board:hw-boards",
      kind: "legacy",
      predecessorBoardId: null,
      plannerDecisionId: null,
      nodeIds: legacy.nodes.map((candidate) => candidate.nodeId),
      publishedAt: "2026-07-01T00:00:00.000Z",
    })]);
    expect(projectLearningCycle(reread).adventureBoard.boardId).toBe("cycle-board:hw-boards");
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("does not retroactively enforce contract-21 immutability on legacy cycles", () => {
    const legacy = createLearningCycle(cycleInput(false), { rootDir: root() });
    const next = structuredClone(legacy);
    next.nodes.push(node("legacy-append"));
    expect(() => assertPublishedBoardsImmutable(legacy, next)).not.toThrow();
  });
});

describe("board instance functions are pure (test 17)", () => {
  it("never mutates the cycle or writes files", () => {
    const rootDir = root();
    const cycle = deepFreeze(createLearningCycle(cycleInput(true), { rootDir }));
    const filesBefore = fs.readdirSync(rootDir, { recursive: true }).sort();
    const [board] = listBoardInstances(cycle);
    boardTopologyHash(cycle, board!);
    assertPublishedBoardsImmutable(cycle, cycle);
    expect(fs.readdirSync(rootDir, { recursive: true }).sort()).toEqual(filesBefore);
  });
});
