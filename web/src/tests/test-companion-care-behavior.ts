import { describe, expect, it } from "vitest";
import type {
  CompanionCareAnimationIntent,
  CompanionCareView,
} from "../../../src/shared/companionCareTypes";
import { deriveCompanionBehavior } from "../context/companionCareBehavior";

function care(moodLabel: CompanionCareView["moodLabel"]): CompanionCareView {
  return {
    childId: "child_fixture_001",
    companionId: "companion_fixture_001",
    displayName: "Companion Fixture",
    vitals: {
      hunger: moodLabel === "hungry" ? 0.18 : 0.8,
      mood: moodLabel === "moody" ? 0.2 : 0.8,
      bond: 0.8,
      energy: moodLabel === "tired" ? 0.18 : 0.8,
      usefulness: 0.8,
      thoughtClarity: 0.8,
      lastSeenAt: "2026-05-04T00:00:00.000Z",
    },
    economy: { coins: 25, storeUnlocks: [] },
    inventory: { food: [], careItems: [] },
    readiness: {
      hungry: moodLabel === "hungry",
      lowEnergy: moodLabel === "tired",
      lowBond: false,
      lowThoughtClarity: false,
      highEnergyReluctance: moodLabel === "tired",
      canContinueTired: true,
      suggestedRepair: moodLabel === "hungry" ? "feed" : "warmup",
    },
    moodLabel,
    lastSeenLabel: "today",
  };
}

describe("deriveCompanionBehavior", () => {
  it("maps bright and happy care to upbeat visible behavior", () => {
    expect(deriveCompanionBehavior(care("bright"))).toMatchObject({
      mood: "bright",
      presentationState: "bright",
      emote: "excited",
      low: false,
    });
    expect(deriveCompanionBehavior(care("happy"))).toMatchObject({
      mood: "happy",
      presentationState: "steady",
      emote: "happy",
      low: false,
    });
  });

  it("maps tired and hungry care to low-state visible behavior", () => {
    expect(deriveCompanionBehavior(care("tired"))).toMatchObject({
      mood: "tired",
      presentationState: "needs-care",
      emote: "sad",
      low: true,
      animation: "defeated",
      visualTreatment: expect.objectContaining({ opacity: 0.84 }),
    });
    expect(deriveCompanionBehavior(care("hungry"))).toMatchObject({
      mood: "hungry",
      presentationState: "needs-care",
      emote: "thinking",
      low: true,
      animation: "think",
      visualTreatment: expect.objectContaining({ opacity: 0.88 }),
    });
  });

  it("maps feed animation intents to normal and rare recovery animations", () => {
    const normal: CompanionCareAnimationIntent = {
      kind: "normal-feed",
      reference: "animation-a",
      itemId: "apple_bite",
    };
    const rare: CompanionCareAnimationIntent = {
      kind: "rare-reward",
      reference: "animation-b",
      itemId: "mystery_snack",
    };

    expect(deriveCompanionBehavior(care("happy"), normal)).toMatchObject({
      feedAnimation: normal,
      presentationState: "feeding",
      emote: "happy",
      animation: "silly_laugh",
    });
    expect(deriveCompanionBehavior(care("happy"), rare)).toMatchObject({
      feedAnimation: rare,
      presentationState: "celebrating",
      emote: "celebrating",
      animation: "dance_victory",
    });
  });
});
