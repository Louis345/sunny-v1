import { describe, expect, it } from "vitest";
import { engagementDimensionsForCanonicalNode } from "./canonicalNodeEngagement";

describe("canonical node engagement dimensions", () => {
  it("derives the controlled presentation variable from the node contract", () => {
    expect(engagementDimensionsForCanonicalNode({ mechanic: "fact-retrieval-speed", theme: "space arcade" }))
      .toEqual(expect.arrayContaining(["speed", "competition"]));
    expect(engagementDimensionsForCanonicalNode({ mechanic: "equal-groups-story", theme: "story-solver" }))
      .toContain("story");
    expect(engagementDimensionsForCanonicalNode({ mechanic: "fact-retrieval-puzzle", theme: "vault" }))
      .toContain("puzzle");
  });
});
