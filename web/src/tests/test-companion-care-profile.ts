import { describe, expect, it } from "vitest";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";
import { getCompanionCareFromProfile } from "../utils/companionCareProfile";

const legacyCare = {
  childId: "child_fixture_001",
  companionId: "companion_fixture_001",
  displayName: "Companion Fixture",
  moodLabel: "happy",
} as CompanionCareView;

const chartCare = {
  childId: "child_fixture_001",
  companionId: "companion_fixture_001",
  displayName: "Companion Fixture",
  moodLabel: "tired",
} as CompanionCareView;

describe("getCompanionCareFromProfile", () => {
  it("prefers hospital-chart care_plan companion care over the legacy mirror", () => {
    expect(
      getCompanionCareFromProfile({
        companionCare: legacyCare,
        care_plan: { companion_care: chartCare },
      }),
    ).toBe(chartCare);
  });

  it("falls back to the legacy companionCare mirror during migration", () => {
    expect(getCompanionCareFromProfile({ companionCare: legacyCare })).toBe(legacyCare);
  });
});
