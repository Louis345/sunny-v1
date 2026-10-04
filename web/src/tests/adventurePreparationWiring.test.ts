import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// Regression guard: only the full-screen hold between Discovery and the targeted
// board changes; the on-board overlay and the hold decision stay as they were.
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

it("renders the new preparation screen only for the full-screen hold", () => {
  const hold = app.slice(app.indexOf(") : targetedBoardHeldForPreparation ? ("), app.indexOf("<AdventureBoardExperience"));
  expect(hold).toContain("<AdventurePreparationScreen");
  expect(hold).not.toContain("<LearningPreparationStatus");
});

it("keeps the small on-board overlay unchanged", () => {
  expect(app).toContain("targetedMathGenerationPending && !plannerBoardLaunch && !postActivityEngagement && <div className=\"absolute left-4 top-4 z-20 max-w-sm\"><LearningPreparationStatus");
});
