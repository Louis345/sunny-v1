import { describe, expect, it } from "vitest";
import { NODE_REGISTRY } from "../shared/nodeRegistry";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";

describe("generated-baseline node", () => {
  it("is registered in ALL_NODE_TYPES and NODE_REGISTRY", () => {
    expect(ALL_NODE_TYPES).toContain("generated-baseline");
    expect(NODE_REGISTRY["generated-baseline"]?.getUrl).toBeTypeOf("function");
  });

  it("launches via gameHtmlPath with config injection", () => {
    const url = NODE_REGISTRY["generated-baseline"]?.getUrl?.(
      {
        id: "n-generated-baseline-1",
        type: "generated-baseline",
        gameHtmlPath: "/tmp/demo-shell.html",
        date: "hw-math-2",
        words: ["5x2"],
        difficulty: 1,
      },
      {
        childId: "demo-pashley",
        companion: "elli",
        previewParam: "free",
      },
    );
    expect(url).toContain("/api/homework/game/demo-pashley/hw-math-2/demo-shell.html");
    expect(url).toContain("config=");
    expect(url).toContain("/api/activity-config/demo-pashley/hw-math-2/generated-baseline.json");
  });

  it("generated-baseline node completion uses the shared coin award path", async () => {
    const { reconcileCompanionCurrencyAward } = await import("../server/currencyAward");
    const out = reconcileCompanionCurrencyAward({
      childId: "demo-pashley",
      amount: 25,
      dryRun: true,
      reason: "node_complete",
    });
    expect(out.ok).toBe(true);
  });
});
