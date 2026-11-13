import { expect, it } from "vitest";
import { requiredSettingsReport } from "./requiredSettings";

// BUGS.md 2026-11-07 (AI-caught before Ila's session): Saori's chart folder and Planner model lived only in one
// Terminal window, so a remote restart and an ingest ran without them; the ingest skipped her chart silently.
it("names every missing required setting in one line", () => {
  const missing = requiredSettingsReport({});
  expect(missing.missing).toEqual(["SUNNY_CHART_DIR", "SUNNY_EXPERIENCE_PLANNER_MODEL"]);
  expect(missing.line).toBe(" 🎮 [startup] [settings] [missing] SUNNY_CHART_DIR, SUNNY_EXPERIENCE_PLANNER_MODEL (add them to .env)");
  const ready = requiredSettingsReport({ SUNNY_CHART_DIR: "/charts", SUNNY_EXPERIENCE_PLANNER_MODEL: "claude-sonnet-5" });
  expect(ready.missing).toEqual([]);
  expect(ready.line).toBe(" 🎮 [startup] [settings] [ready] chart_dir=/charts planner_model=claude-sonnet-5");
});
