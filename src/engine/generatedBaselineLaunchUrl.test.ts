import { describe, expect, it } from "vitest";
import { NODE_REGISTRY } from "../shared/nodeRegistry";

describe("generated baseline launch URL", () => {
  it("preserves the homework cycle directory in the real server URL", () => {
    const url = NODE_REGISTRY["generated-baseline"]?.getUrl?.(
      {
        id: "gear-lock",
        type: "generated-baseline",
        gameHtmlPath: "/tmp/hw-math-2/gear-lock.html",
        date: "hw-math-2",
        words: ["5x2"],
        difficulty: 1,
      },
      { childId: "reina", companion: "elli", previewParam: "" },
    );
    expect(url).toContain("/api/homework/game/reina/hw-math-2/gear-lock.html");
  });
});
