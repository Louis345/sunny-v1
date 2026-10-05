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

// Human-caught 2026-10-05: on Saori the waiting screen sat under Elli's bookbag,
// economy controls and her full-screen figure. Source tests only checked which
// screen rendered, not what else stayed on top of it.
describe("only the preparation UI and Elli's portrait while it is up", () => {
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  it("hides the bookbag, economy and level-path controls", () => {
    expect(app).toContain("const preparationScreenActive = preparation.screen != null;");
    expect(app).toMatch(/<CompanionEconomyControls\s+visible=\{[^}]*!preparationScreenActive/);
    expect(app).toMatch(/showTrigger=\{[^}]*!preparationScreenActive/s);
  });
  it("shows Elli as her portrait, without a second speech bubble", () => {
    const portrait = app.slice(app.indexOf("const companionPortraitMode ="), app.indexOf("const voiceGameCompanionSpeechMuted"));
    expect(portrait).toContain("preparationScreenActive");
    expect(app).toContain("speechBubbleText={preparationScreenActive ? null : companionBubbleText}");
  });
});
