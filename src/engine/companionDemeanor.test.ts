import { describe, expect, it } from "vitest";
import type { CompanionCareView } from "../shared/companionCareTypes";
import {
  deriveCompanionDemeanor,
  voiceSettingsForCompanionDemeanor,
} from "../shared/companionDemeanor";

function care(overrides: Partial<CompanionCareView["vitals"]> = {}): CompanionCareView {
  const vitals = {
    hunger: 0.7,
    mood: 0.6,
    bond: 0.7,
    energy: 0.7,
    usefulness: 0.7,
    thoughtClarity: 0.7,
    lastSeenAt: "2026-07-29T12:00:00.000Z",
    ...overrides,
  };
  return {
    childId: "demo-pashley",
    companionId: "elli",
    displayName: "Elli",
    vitals,
    economy: { coins: 0, storeUnlocks: [] },
    inventory: { food: [], careItems: [] },
    readiness: {
      hungry: vitals.hunger < 0.3,
      lowEnergy: vitals.energy < 0.35,
      lowBond: false,
      lowThoughtClarity: false,
      highEnergyReluctance: vitals.hunger < 0.3 || vitals.energy < 0.35,
      canContinueTired: true,
      suggestedRepair: vitals.hunger < 0.3 ? "feed" : vitals.energy < 0.35 ? "warmup" : "continue",
    },
    moodLabel:
      vitals.hunger < 0.3
        ? "hungry"
        : vitals.energy < 0.35
          ? "tired"
          : vitals.mood >= 0.75
            ? "bright"
            : "happy",
    lastSeenLabel: "today",
  };
}

describe("shared companion demeanor", () => {
  it("uses one deterministic state for steady, hungry, tired, and restored", () => {
    expect(deriveCompanionDemeanor(care()).state).toBe("steady");
    expect(deriveCompanionDemeanor(care({ hunger: 0.2 })).state).toBe("hungry");
    expect(deriveCompanionDemeanor(care({ energy: 0.2 })).state).toBe("tired");
    expect(deriveCompanionDemeanor(care({ mood: 0.9 })).state).toBe("restored");
  });

  it("keeps hungry priority when hunger and energy are both low", () => {
    expect(deriveCompanionDemeanor(care({ hunger: 0.2, energy: 0.2 })).state).toBe("hungry");
  });

  it("bounds ElevenLabs speed and style without changing voice identity settings", () => {
    expect(voiceSettingsForCompanionDemeanor("hungry")).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
      speed: 0.92,
      style: 0.1,
    });
    expect(voiceSettingsForCompanionDemeanor("tired").speed).toBe(0.88);
    expect(voiceSettingsForCompanionDemeanor("restored").speed).toBe(1.03);
  });
});
