import { describe, expect, it } from "vitest";
import { buildNodeBriefGap, generationCandidateAttempts, generationWaitMode } from "./baselineShellIngestPipeline";

describe("baseline shell ingestion wait mode", () => {
  it("waits for every artifact during a one-shot full ingestion", () => {
    expect(generationWaitMode({ waitForCompletion: true })).toBe("complete");
  });

  it("keeps the bounded mode available for non-blocking callers", () => {
    expect(generationWaitMode({ waitForCompletion: false })).toBe("budget");
  });

  it("uses every AI-authored candidate before blocking a node", () => {
    expect(generationCandidateAttempts([{}, {}, {}])).toBe(3);
  });

  it("asks AI for a specification from the exact node contract", () => {
    const gap = buildNodeBriefGap({
      baseGap: { childId: "reina", homeworkId: "hw-1", domain: "math", skillTarget: "multiplication", title: "Math", reason: "gap", matchedShells: [], needsGeneration: true },
      request: { id: "story", domain: "math", skillTarget: "multiplication", mechanicConstraints: "equal groups", reason: "test story transfer" },
      node: { title: "Story Transfer", mechanic: "equal-groups-story", theme: "story-solver" },
    });
    expect(gap.title).toBe("Story Transfer");
    expect(gap.reason).toContain("equal-groups-story");
    expect(gap.reason).toContain("story-solver");
  });
});
