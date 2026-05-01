/**
 * BUG 2 — quest.html must not fire node_complete immediately.
 * The nodeRegistry quest entry must route to /games/quest.html when no gameFile is set,
 * rather than the generated placeholder that auto-completes.
 */
import { describe, it, expect } from "vitest";
import { NODE_REGISTRY } from "../shared/nodeRegistry";

const ctx = {
  childId: "reina",
  companion: "elli",
  previewParam: "",
};

describe("quest node routing (BUG 2)", () => {
  it("quest with no gameFile or gameHtmlPath falls back to /games/quest.html", () => {
    const handler = NODE_REGISTRY.quest;
    expect(handler?.getUrl).toBeDefined();
    const url = handler!.getUrl!(
      { id: "q1", type: "quest", words: ["fast", "jump"], difficulty: 2 },
      ctx,
    );
    expect(url).toContain("/games/quest.html");
  });

  it("quest with gameFile still uses the explicit gameFile", () => {
    const handler = NODE_REGISTRY.quest;
    const url = handler!.getUrl!(
      {
        id: "q2",
        type: "quest",
        words: ["cat"],
        difficulty: 2,
        gameFile: "custom-quest.html",
      },
      ctx,
    );
    expect(url).toContain("custom-quest.html");
    expect(url).not.toContain("/games/quest.html?");
  });

  it("quest URL contains words from node config", () => {
    const handler = NODE_REGISTRY.quest;
    const url = handler!.getUrl!(
      { id: "q3", type: "quest", words: ["run", "hop"], difficulty: 2 },
      ctx,
    );
    expect(url).toContain("words=run%2Chop");
  });
});
