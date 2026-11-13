import fs from "node:fs";
import { expect, it } from "vitest";

// Owner 2026-11-09: the food/mood strip under the companion is annoying; it is hidden (kept, not deleted).
it("hides the companion care strip on the map", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  expect(app).toContain("const SHOW_CARE_STRIP = false;");
  expect(app).toContain("{SHOW_CARE_STRIP ? (\n      <TamagotchiStrip");
});
