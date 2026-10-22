import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { successorPreparationStatus } from "../../../src/engine/learningBoardInstances";
import { LearningPreparationStatus } from "../components/LearningPreparationStatus";

// Human catch: status code and presentation tests separately passed while the
// published-but-unplayable saved board told the family to return to a ready map.
// Exercise that exact server projection -> screen boundary, including reload.
it("does not promise a ready adventure from a published all-unavailable saved board", () => {
  const saved = JSON.stringify({
    createdAt: "2026-10-21T20:28:40Z", lifecycle: "baseline_ready", decisionHistory: [],
    boards: [{ kind: "successor", publishedAt: "2026-10-21T21:48:19Z", nodeIds: ["one", "two"] }],
    nodes: ["one", "two"].map(nodeId => ({ nodeId, state: "blocked", artifactBinding: null, notReadyReason: "recorded_generation_failure" })),
  });
  const status = successorPreparationStatus(JSON.parse(saved))!;
  render(<LearningPreparationStatus status={status} onCheck={vi.fn()} onFinish={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Some activities need attention");
  expect(screen.getByRole("status")).toHaveTextContent("0 of 2 activities prepared");
  expect(screen.getByRole("status")).not.toHaveTextContent("Your next adventure is ready");
  expect(screen.getByRole("status")).not.toHaveTextContent("The new map opens when you come back");
  expect(screen.queryByRole("button", { name: "Check progress" })).toBeNull();
  expect(screen.getByRole("button", { name: "Finish for now" })).toBeEnabled();
});
