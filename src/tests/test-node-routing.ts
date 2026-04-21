import { describe, expect, it } from "vitest";
import { pendingHomeworkToNodeConfigs } from "../server/map-coordinator";
import {
  buildNodeLaunchAction,
  buildNodeLaunchParams,
} from "../shared/homeworkNodeRouting";
import { NODE_REGISTRY, NODE_REGISTRY_KEYS } from "../shared/nodeRegistry";

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
    expect(action.url).toContain("preview=free");
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

  it("preview=free when isDiagMode", () => {
    const params = buildNodeLaunchParams(
      { id: "n4", words: [], difficulty: 1 },
      { childId: "ila", companion: "elli", isDiagMode: true },
    );
    expect(params.get("preview")).toBe("free");
  });

  it("companion param comes from children.config.json", () => {
    const params = buildNodeLaunchParams(
      { id: "n5", words: [], difficulty: 1 },
      { childId: "ila", companion: "matilda", isDiagMode: false },
    );
    expect(params.get("companion")).toBe("matilda");
  });

  it("adds companionVrmUrl and companionMuted to game URL params", () => {
    const params = buildNodeLaunchParams(
      { id: "n6", words: [], difficulty: 1 },
      {
        childId: "ila",
        companion: "elli",
        isDiagMode: false,
        vrmUrl: "/companions/sample.vrm",
        companionMuted: true,
      },
    );
    expect(params.get("companionVrmUrl")).toBe("/companions/sample.vrm");
    expect(params.get("companionMuted")).toBe("true");
  });

  it("NODE_REGISTRY has handler for all homework launch node types", () => {
    const required = [
      "pronunciation",
      "karaoke",
      "word-builder",
      "spell-check",
      "quest",
      "boss",
      "dopamine",
    ].sort();
    expect([...NODE_REGISTRY_KEYS].sort()).toEqual(required);
    for (const key of required) {
      expect(NODE_REGISTRY[key]).toBeDefined();
    }
  });

  it("spell-check node builds iframe URL to spell-check.html", () => {
    const action = buildNodeLaunchAction(
      {
        id: "sc1",
        type: "spell-check",
        words: ["farmer", "field"],
        difficulty: 2,
      } as const,
      { childId: "ila", companion: "elli", isDiagMode: true },
    );
    expect(action.kind).toBe("iframe");
    if (action.kind !== "iframe") throw new Error("expected iframe action");
    expect(action.url).toContain("/games/spell-check.html");
    expect(action.url).toContain("farmer");
  });

  it("karaoke handler returns storyText from node", () => {
    const payload = NODE_REGISTRY.karaoke.canvasMessage?.({
      id: "k1",
      type: "karaoke",
      words: ["cat"],
      difficulty: 2,
      storyText: "The cat sat.",
      date: "2026-04-21",
    });
    expect(payload?.type).toBe("karaoke");
    expect(payload?.storyText).toBe("The cat sat.");
    expect(payload?.words).toEqual(["cat"]);
    const action = buildNodeLaunchAction(
      {
        id: "k1",
        type: "karaoke",
        words: ["cat"],
        difficulty: 2,
        storyText: "The cat sat.",
      },
      { childId: "ila", companion: "elli", isDiagMode: false },
    );
    expect(action.kind).toBe("canvas");
    if (action.kind !== "canvas") throw new Error("expected canvas");
    expect(action.payload.storyText).toBe("The cat sat.");
  });

  it("boss with no gameFile returns skip without throwing", () => {
    expect(() =>
      buildNodeLaunchAction(
        {
          id: "b1",
          type: "boss",
          words: ["x"],
          difficulty: 3,
          date: "2026-04-21",
        },
        { childId: "ila", companion: "elli", isDiagMode: false },
      ),
    ).not.toThrow();
    const action = buildNodeLaunchAction(
      {
        id: "b1",
        type: "boss",
        words: ["x"],
        difficulty: 3,
        date: "2026-04-21",
      },
      { childId: "ila", companion: "elli", isDiagMode: false },
    );
    expect(action.kind).toBe("skip");
    if (action.kind !== "skip") throw new Error("expected skip");
    expect(action.reason).toBe("missing-homework-file");
  });

  it("SM-2 dueWords injected into node words at session start (map payload)", () => {
    const hw = {
      weekOf: "2026-04-21",
      testDate: null as string | null,
      wordList: ["a", "b"],
      generatedAt: new Date().toISOString(),
      nodes: [
        {
          id: "n1",
          type: "word-builder",
          words: ["static"],
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "n2",
          type: "quest",
          words: ["static"],
          difficulty: 2,
          gameFile: "quest-2026-04-21.html",
          storyFile: null,
        },
        {
          id: "n3",
          type: "coin-counter",
          words: ["static"],
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
      ],
    };
    const due = ["due1", "due2"];
    const out = pendingHomeworkToNodeConfigs(hw, due);
    expect(out.length).toBe(3);
    expect(out[0]?.words).toEqual(due);
    expect(out[1]?.words).toEqual(due);
    expect(out[2]?.words).toEqual([]);
  });
});
