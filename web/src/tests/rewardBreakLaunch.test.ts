import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

// The board launch asks her which owned game to play before a reward break opens, instead of the fixed fallback.
it("routes a reward break without a chosen game through her picker", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  expect(app).toContain('node.type === "mystery" && !node.gameFile');
  expect(app).toContain("<RewardBreakPicker");
  expect(app).toContain("gameFile: game.file");
});
