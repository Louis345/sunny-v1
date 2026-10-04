import { describe, expect, it } from "vitest";
import {
  bossBoardPreview,
  boardLifecycleSequence,
  predecessorHistoryBoard,
  questBoardPreview,
  supportBoardPreview,
} from "../storybook/boardLifecycleFixtures";

describe("immutable board lifecycle Storybook fixtures", () => {
  it("publishes a complete support board without unauthorized Quest or Boss placeholders", () => {
    expect(supportBoardPreview.nodes.some((node) => node.kind === "quest")).toBe(false);
    expect(supportBoardPreview.nodes.some((node) => node.kind === "boss")).toBe(false);
    expect(supportBoardPreview.nodes.some((node) => node.state === "preview")).toBe(false);
    expect(
      supportBoardPreview.nodes.some((node) =>
        node.lock?.label.toLowerCase().includes("quest"),
      ),
    ).toBe(false);
  });

  it("keeps the full board agency and branching routes when Quest and Boss are absent", () => {
    const choiceGate = supportBoardPreview.nodes.find((node) => node.kind === "choice-gate");
    const choiceSet = supportBoardPreview.choiceSets?.find(
      (set) => set.id === choiceGate?.choiceSetId,
    );
    const routeNodeIds = choiceSet?.options
      .map((option) => option.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId)) ?? [];

    expect(choiceGate?.label).toBe("Choose Path");
    expect(choiceSet?.kind).toBe("baseline-route");
    expect(new Set(routeNodeIds).size).toBeGreaterThanOrEqual(2);
    expect(
      routeNodeIds.every((nodeId) =>
        supportBoardPreview.nodes.some(
          (node) => node.id === nodeId && node.state === "available",
        ),
      ),
    ).toBe(true);

    const destinationsByRoute = routeNodeIds.map((nodeId) =>
      supportBoardPreview.edges
        .filter((edge) => edge.from === nodeId)
        .map((edge) => edge.to),
    );
    expect(
      destinationsByRoute[0]?.some((destination) =>
        destinationsByRoute.slice(1).some((destinations) => destinations.includes(destination)),
      ),
    ).toBe(true);
  });

  it("includes only the encounter authorized for that complete board instance", () => {
    expect(questBoardPreview.nodes.filter((node) => node.kind === "quest")).toHaveLength(1);
    expect(questBoardPreview.nodes.some((node) => node.kind === "boss")).toBe(false);
    expect(questBoardPreview.nodes.find((node) => node.kind === "quest")?.state).toBe("available");

    expect(bossBoardPreview.nodes.filter((node) => node.kind === "boss")).toHaveLength(1);
    expect(bossBoardPreview.nodes.some((node) => node.kind === "quest")).toBe(false);
    expect(bossBoardPreview.nodes.find((node) => node.kind === "boss")?.state).toBe("available");
  });

  it("uses distinct immutable board and plan identities for each later-session board", () => {
    expect(new Set([
      supportBoardPreview.boardId,
      questBoardPreview.boardId,
      bossBoardPreview.boardId,
    ])).toHaveLength(3);
    expect(new Set([
      supportBoardPreview.planId,
      questBoardPreview.planId,
      bossBoardPreview.planId,
    ])).toHaveLength(3);
  });

  it("shows the predecessor unchanged after its successor exists: same topology, only forward state", () => {
    const topology = (board: typeof supportBoardPreview) => ({
      boardId: board.boardId,
      nodes: board.nodes.map(({ id, kind, label, position, activityId }) => ({ id, kind, label, position, activityId })),
      edges: board.edges.map(({ id, from, to }) => ({ id, from, to })),
      choices: board.choiceSets?.map((set) => ({ id: set.id, options: set.options.map((option) => option.nodeId) })),
    });
    expect(topology(predecessorHistoryBoard)).toEqual(topology(supportBoardPreview));
    expect(predecessorHistoryBoard.nodes.some((node) => node.kind === "quest" || node.kind === "boss")).toBe(false);
    const untaken = predecessorHistoryBoard.nodes.find((node) => node.id === "story-spell-route");
    expect(untaken?.lock?.label).toBe("Not taken");
    expect(predecessorHistoryBoard.nodes.find((node) => node.id === "memory-check")?.state).toBe("completed");
  });

  it("chains each later board to exactly one predecessor and one Planner decision", () => {
    expect(boardLifecycleSequence.map((entry) => entry.board.boardId)).toEqual([
      supportBoardPreview.boardId, questBoardPreview.boardId, bossBoardPreview.boardId,
    ]);
    expect(boardLifecycleSequence.map((entry) => entry.predecessorBoardId)).toEqual([
      null, supportBoardPreview.boardId, questBoardPreview.boardId,
    ]);
    expect(new Set(boardLifecycleSequence.map((entry) => entry.plannerDecisionId)).size).toBe(3);
  });
});
