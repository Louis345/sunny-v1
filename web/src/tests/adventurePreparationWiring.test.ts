import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: only the full-screen hold between Discovery and the targeted
// board changes; the on-board overlay and the hold decision stay as they were.
describe("App integration", () => {
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

it("renders the preparation screen for the spelling Discovery chapter end and the held board", () => {
  const surfaces = app.slice(app.indexOf("main = directDiscoveryMode ? ("), app.indexOf("<AdventureBoardExperience"));
  // Spelling uses the new screen at both points; it is checked before the old surfaces.
  expect(surfaces).toContain("effectiveDiscoveryCompletionHandoff ? preparation.screen ?? (");
  expect(surfaces).toContain(") : preparation.screen ? preparation.screen : targetedBoardHeldForPreparation ? (");
  // Previews and math keep the existing chapter ending and status card.
  expect(surfaces).toContain("<DiscoveryCompletionChapter");
  expect(surfaces).toContain("<LearningPreparationStatus");
});

it("keeps the small on-board overlay unchanged", () => {
  expect(app).toContain("targetedMathGenerationPending && !plannerBoardLaunch && !postActivityEngagement && <div className=\"absolute left-4 top-4 z-20 max-w-sm\"><LearningPreparationStatus");
});
});
