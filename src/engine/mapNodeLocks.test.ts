import { describe, expect, it } from "vitest";
import { hasPlayableMasteryArtifact } from "../shared/mapNodeLocks";
import type { NodeConfig } from "../shared/adventureTypes";

function masteryNode(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    id: "n-quest",
    type: "quest",
    isLocked: true,
    isCompleted: false,
    isGoal: false,
    words: ["above"],
    difficulty: 3,
    gameFile: "quest.html",
    adaptiveArtifact: {
      artifactId: "artifact-quest",
      contentId: "content-quest",
      homeworkId: "hw-1",
      theoryId: "theory-1",
      generationStage: "quest",
      targetGroupIds: ["spell-from-memory"],
      homeworkWordIds: ["hw-1:spell-from-memory:above:0"],
      baselineEvidenceIds: ["word-radar"],
      validationStatus: "passed",
    },
    ...overrides,
  };
}

describe("mastery artifact locks", () => {
  it("does not make a validated-but-unreviewed Quest artifact playable", () => {
    const node = masteryNode({
      artifactStatus: "ready_for_review",
      adaptiveArtifact: {
        ...masteryNode().adaptiveArtifact!,
        artifactStatus: "ready_for_review",
      },
    });

    expect(hasPlayableMasteryArtifact(node)).toBe(false);
  });

  it("makes an approved Quest artifact playable after validation passes", () => {
    const node = masteryNode({
      artifactStatus: "approved_ready",
      adaptiveArtifact: {
        ...masteryNode().adaptiveArtifact!,
        artifactStatus: "approved_ready",
      },
    });

    expect(hasPlayableMasteryArtifact(node)).toBe(true);
  });
});
