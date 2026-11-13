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
  it("maps bright and happy care to restored and steady persistent demeanor", () => {
    expect(deriveCompanionBehavior(care("bright"))).toMatchObject({
      mood: "bright",
      presentationState: "restored",
      emote: "excited",
      low: false,
      baseAnimation: "happy_idle",
      baseAnimationLoop: true,
      playbackRate: 1.12,
      movementIntensity: 1,
      visualTreatment: { filter: "none", opacity: 1 },
    });
    expect(deriveCompanionBehavior(care("happy"))).toMatchObject({
      mood: "happy",
      presentationState: "steady",
      emote: "happy",
      low: false,
      baseAnimation: "idle",
      baseAnimationLoop: true,
      playbackRate: 1,
      visualTreatment: { filter: "none", opacity: 1 },
    });
  });

  it("keeps tired visibly sleepy without defeated or guilt-coded treatment", () => {
    expect(deriveCompanionBehavior(care("tired"))).toMatchObject({
      mood: "tired",
      presentationState: "tired",
      emote: "thinking",
      low: true,
      baseAnimation: "sitting",
      baseAnimationLoop: true,
      animation: "yawn",
      animationPlaybackRate: 2,
      playbackRate: 0.58,
      movementIntensity: 0.35,
      visualTreatment: { filter: "none", opacity: 1 },
    });
    expect(deriveCompanionBehavior(care("tired")).animation).not.toBe("defeated");
    expect(deriveCompanionBehavior(care("tired")).emote).not.toBe("sad");
  });

  it("keeps hungry distinct from tired through posture and motion", () => {
    expect(deriveCompanionBehavior(care("hungry"))).toMatchObject({
      mood: "hungry",
      presentationState: "hungry",
      emote: "sad",
      low: true,
      baseAnimation: "rejected",
      baseAnimationLoop: true,
      playbackRate: 1,
      movementIntensity: 0.5,
      visualTreatment: { filter: "none", opacity: 1 },
    });
    expect(deriveCompanionBehavior(care("hungry")).baseAnimation).not.toBe(
      deriveCompanionBehavior(care("tired")).baseAnimation,
    );
  });

  it("uses the human-approved rejected mannerism only for hungry care", () => {
    expect(deriveCompanionBehavior(care("hungry"))).toMatchObject({
      baseAnimation: "rejected",
      emote: "sad",
    });

    for (const mood of ["tired", "happy", "bright"] as const) {
      const behavior = deriveCompanionBehavior(care(mood));
      expect(behavior.baseAnimation).not.toBe("rejected");
      expect(behavior.animation).not.toBe("rejected");
    }

    for (const mood of ["hungry", "tired", "happy", "bright"] as const) {
      const behavior = deriveCompanionBehavior(care(mood));
      expect(behavior.baseAnimation).not.toBe("sad_idle");
      expect(behavior.animation).not.toBe("sad_idle");
    }
  });

  it("maps feeding to a visible recovery transition with restored return demeanor", () => {
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
      baseAnimation: "happy_idle",
      baseAnimationLoop: true,
      playbackRate: 1.12,
    });
    expect(deriveCompanionBehavior(care("happy"), rare)).toMatchObject({
      feedAnimation: rare,
      presentationState: "feeding",
      emote: "celebrating",
      animation: "dance_victory",
      baseAnimation: "happy_idle",
      baseAnimationLoop: true,
      playbackRate: 1.12,
    });
  });
});
