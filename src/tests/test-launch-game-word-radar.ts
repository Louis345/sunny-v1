/**
 * BUG 5 — launchGame must not be used for word-radar.
 * The tool description must explicitly exclude word-radar and direct to canvasShow.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const launchGameSrc = readFileSync(
  resolve(__dirname, "../../src/agents/elli/tools/launchGame.ts"),
  "utf8",
);

const sixToolsSrc = readFileSync(
  resolve(__dirname, "../../src/agents/tools/six-tools.ts"),
  "utf8",
);

describe("launchGame tool description (BUG 5)", () => {
  it("launchGame description says Do NOT use for word-radar", () => {
    expect(launchGameSrc).toMatch(/Do NOT use for word-radar/i);
  });

  it("canvasShow description mentions word-radar explicitly", () => {
    expect(sixToolsSrc).toContain("word-radar");
  });
});
