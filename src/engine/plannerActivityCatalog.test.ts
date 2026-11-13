import { describe, expect, it } from "vitest";
import {
  buildPlannerActivityCatalog,
  plannerLaunchableActivityIds,
  validatePlannerActivityId,
} from "./plannerActivityCatalog";

describe("planner activity catalog", () => {
  it("derives planner-launchable activity ids from the catalog and runtime registry", () => {
    const catalog = buildPlannerActivityCatalog();
    const launchableIds = plannerLaunchableActivityIds(catalog);

    expect(launchableIds).toContain("spell-check");
    expect(launchableIds).toContain("word-radar");
    expect(launchableIds).toContain("pronunciation");
    expect(launchableIds).toContain("karaoke");
    expect(launchableIds).not.toContain("spark-orb-charge");
    expect(launchableIds).not.toContain("mystery");
    expect(launchableIds).not.toContain("quest");
    expect(launchableIds).not.toContain("boss");
  });

  it("validates planner activity ids against the single source of truth", () => {
    const catalog = buildPlannerActivityCatalog();

    expect(validatePlannerActivityId("karaoke", catalog)).toEqual({ ok: true });
    expect(validatePlannerActivityId("spark-orb-charge", catalog)).toEqual({
      ok: false,
      reason: "not_launchable_intervention",
    });
    expect(validatePlannerActivityId("made-up-game", catalog)).toEqual({
      ok: false,
      reason: "unknown_activity",
    });
  });
});
