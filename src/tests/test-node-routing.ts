import { describe, expect, it } from "vitest";
import {
  buildNodeLaunchAction,
  buildNodeLaunchParams,
} from "../shared/homeworkNodeRouting";

describe("map node routing", () => {
  it("pronunciation node calls canvas_show pronunciation", () => {
    const action = buildNodeLaunchAction(
      {
        id: "n1",
        type: "pronunciation",
        words: ["cat"],
        difficulty: 1,
      } as const,
      { childId: "ila", companion: "elli", isDiagMode: false },
    );
    expect(action.kind).toBe("canvas");
    if (action.kind !== "canvas") throw new Error("expected canvas action");
    expect(action.payload.type).toBe("pronunciation");
  });

  it("quest node builds correct iframe URL with params", () => {
    const action = buildNodeLaunchAction(
      {
        id: "n2",
        type: "quest",
        words: ["cat"],
        difficulty: 2,
        date: "2026-04-21",
        gameFile: "quest-2026-04-21.html",
      } as const,
      { childId: "ila", companion: "elli", isDiagMode: true },
    );
    expect(action.kind).toBe("iframe");
    if (action.kind !== "iframe") throw new Error("expected iframe action");
    expect(action.url).toContain("/homework/ila/2026-04-21/quest-2026-04-21.html");
    expect(action.url).toContain("preview=true");
  });

  it("word-builder node builds correct URL with params", () => {
    const params = buildNodeLaunchParams(
      {
        id: "n3",
        words: ["cat", "dog"],
        difficulty: 2,
      },
      { childId: "ila", companion: "elli", isDiagMode: false },
    );
    expect(params.get("words")).toBe("cat,dog");
    expect(params.get("companion")).toBe("elli");
  });

  it("preview=true when isDiagMode", () => {
    const params = buildNodeLaunchParams(
      { id: "n4", words: [], difficulty: 1 },
      { childId: "ila", companion: "elli", isDiagMode: true },
    );
    expect(params.get("preview")).toBe("true");
  });

  it("companion param comes from children.config.json", () => {
    const params = buildNodeLaunchParams(
      { id: "n5", words: [], difficulty: 1 },
      { childId: "ila", companion: "matilda", isDiagMode: false },
    );
    expect(params.get("companion")).toBe("matilda");
  });
});
