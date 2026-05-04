import { describe, expect, it } from "vitest";
import { getCompanionReadinessNudge } from "../utils/companionReadinessNudge";
import type { CompanionReadiness } from "../../../src/shared/companionCareTypes";

const lowCare: CompanionReadiness = {
  hungry: true,
  lowEnergy: true,
  lowBond: false,
  lowThoughtClarity: false,
  highEnergyReluctance: true,
  canContinueTired: true,
  suggestedRepair: "feed",
};

describe("companion readiness nudge", () => {
  it("nudges high-energy two-player activities without blocking continue", () => {
    const nudge = getCompanionReadinessNudge({
      nodeType: "wheel-of-fortune",
      companionName: "Matilda",
      readiness: lowCare,
    });

    expect(nudge).toMatchObject({
      show: true,
      canContinueTired: true,
      primaryAction: "feed",
      secondaryAction: "warmup",
    });
    expect(nudge.message).toMatch(/wheel of fortune/i);
    expect(nudge.message).not.toMatch(/you made me|abandoned|disappointed/i);
  });

  it("does not nudge calm activities", () => {
    const nudge = getCompanionReadinessNudge({
      nodeType: "karaoke",
      companionName: "Matilda",
      readiness: lowCare,
    });

    expect(nudge.show).toBe(false);
  });
});
