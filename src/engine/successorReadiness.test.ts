import { describe, expect, it } from "vitest";
import { successorPreparationStatus } from "./learningBoardInstances";
import type { LearningCycleRecordV2 } from "./learningCycleRepository";

// Human catch 2026-10-22: the timestamp was called success even with five
// unavailable activities. Logs contained failures; tests asserted the title
// from a timestamp alone, never the resulting launch availability.
function fixture(states: Array<"ready" | "blocked">, publishedAt: string | null = "2026-10-21T21:48:19Z") {
  return {
    createdAt: "2026-10-21T20:28:40Z", lifecycle: "baseline_ready", decisionHistory: [],
    boards: [{ kind: "successor", boardId: "next", publishedAt, nodeIds: states.map((_, i) => `node-${i}`) }],
    nodes: states.map((state, i) => ({ nodeId: `node-${i}`, state,
      artifactBinding: state === "ready" ? { validationStatus: "passed" } : null,
      ...(state === "blocked" ? { notReadyReason: "successor_node_failed:human_review_required" } : {}),
    })),
  } as unknown as LearningCycleRecordV2;
}

describe("successor readiness is executable availability, not a publication timestamp", () => {
  it("reports attention for the published five-failed-activity case after reload", () => {
    const cycle = fixture(Array(5).fill("blocked"));
    const before = JSON.stringify(cycle);
    const status = successorPreparationStatus(JSON.parse(before))!;
    expect(status.phase).toBe("needs_attention");
    expect(status.nodes).toHaveLength(5);
    expect(status.nodes[0]).toMatchObject({ nodeId: "node-0", status: "not_ready", reason: "successor_node_failed:human_review_required" });
    expect(JSON.stringify(cycle)).toBe(before);
  });
  it("keeps a partially usable authored board published with truthful unavailable siblings", () => {
    const status = successorPreparationStatus(fixture(["ready", "blocked"]))!;
    expect(status.phase).toBe("successor_published");
    expect(status.nodes).toEqual([
      { nodeId: "node-0", status: "ready" },
      { nodeId: "node-1", status: "not_ready", reason: "successor_node_failed:human_review_required" },
    ]);
  });
  it("does not call an unverified binding playable", () => {
    const cycle = fixture(["ready"]);
    cycle.nodes[0].artifactBinding!.validationStatus = "failed" as never;
    expect(successorPreparationStatus(cycle)?.phase).toBe("needs_attention");
  });
  it("uses the same unavailable-capability rule as launch and projection", () => {
    const cycle = fixture(["ready"]);
    cycle.nodes[0].implementationType = "word-builder";
    expect(successorPreparationStatus(cycle)?.phase).toBe("needs_attention");
  });
  it("does not let an old passed binding override a recorded unavailable reason", () => {
    const cycle = fixture(["ready"]);
    cycle.nodes[0].notReadyReason = "retired_activity";
    expect(successorPreparationStatus(cycle)?.phase).toBe("needs_attention");
  });
  // 2026-10-24 robot catch: while the Planner decides the next board (minutes live), no successor exists
  // yet, so the route fell back to the Teaching board's old "board_ready" job. The kiosk stops watching on
  // board_ready and never learned the next board was published. An instant recorded decision hid it.
  it("reports the next board as preparing while the Planner is still deciding it", () => {
    const cycle = { createdAt: "2026-10-24T20:00:00Z", lifecycle: "baseline_evaluating",
      decisionHistory: [{ decisionId: "d1", fromLifecycle: "baseline_ready", toLifecycle: "baseline_evaluating", createdAt: "2026-10-24T21:00:00Z" }],
      boards: [{ kind: "teaching", boardId: "teaching", publishedAt: "2026-10-24T20:30:00Z", nodeIds: [] }], nodes: [] } as unknown as LearningCycleRecordV2;
    expect(successorPreparationStatus(cycle)).toEqual({ updatedAt: "2026-10-24T21:00:00Z", startedAt: "2026-10-24T21:00:00Z", phase: "successor_preparing", nodes: [] });
  });
});
