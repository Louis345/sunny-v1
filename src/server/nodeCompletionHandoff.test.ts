import { describe, expect, it } from "vitest";
import { buildNodeCompletionHandoffState } from "./companion-context/nodeCompletionHandoff";
import type { NodeConfig, NodeResult } from "../shared/adventureTypes";

describe("buildNodeCompletionHandoffState", () => {
  it("keeps target-level truth on node_complete traces", () => {
    const node = {
      id: "wr-1",
      type: "word-radar",
      label: "Word Radar",
      x: 0,
      y: 0,
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
    } as NodeConfig;
    const result = {
      nodeId: "wr-1",
      completed: true,
      accuracy: 1,
      timeSpent_ms: 1000,
      wordsAttempted: 1,
      correctWords: ["thumb"],
      missedWords: [],
      targetResults: [
        {
          target: "thumb",
          correct: true,
          attempts: 1,
          attemptedValue: "thumb",
          mode: "partial_visual_recall",
        },
      ],
    } as NodeResult;

    expect(buildNodeCompletionHandoffState(node, result)).toMatchObject({
      targetResults: result.targetResults,
    });
  });
});
