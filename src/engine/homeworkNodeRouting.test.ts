import { describe, expect, it } from "vitest";
import { buildNodeLaunchAction } from "../shared/homeworkNodeRouting";

describe("generated Probe Board routing", () => {
  it("preserves the probeActivity query while routing the shared HTML artifact", () => {
    const action = buildNodeLaunchAction({
      id: "probe-arrays",
      type: "generated-baseline",
      difficulty: 1,
      date: "hw-math-1",
      gameHtmlPath: "/api/homework/game/reina/hw-math-1/discovery.html?probeActivity=probe-arrays",
    }, {
      childId: "reina",
      childName: "Reina",
      companion: "elli",
      companionName: "Elli",
      isDiagMode: false,
    });

    expect(action.kind).toBe("iframe");
    if (action.kind !== "iframe") return;
    const url = new URL(action.url, "http://sunny.local");
    expect(url.pathname).toBe("/api/homework/game/reina/hw-math-1/discovery.html");
    expect(url.searchParams.get("probeActivity")).toBe("probe-arrays");
    expect(url.searchParams.get("childId")).toBe("reina");
  });

  it("launches a Planner-selected speed-catcher activity", () => {
    const action = buildNodeLaunchAction({
      id: "long-a-practice",
      type: "speed-catcher",
      difficulty: 2,
      date: "hw-spelling-1",
      words: ["safe", "late"],
    }, {
      childId: "test-child",
      childName: "Test Child",
      companion: "elli",
      companionName: "Elli",
      isDiagMode: false,
    });

    expect(action.kind).toBe("iframe");
    if (action.kind !== "iframe") return;
    const url = new URL(action.url, "http://sunny.local");
    expect(url.pathname).toBe("/games/speed-catcher.html");
    expect(url.searchParams.get("nodeId")).toBe("long-a-practice");
    expect(url.searchParams.get("words")).toBe("safe,late");
  });
});
