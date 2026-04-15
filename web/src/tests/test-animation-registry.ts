import { describe, it, expect } from "vitest";
import {
  ANIMATION_REGISTRY,
  assertAnimationRegistryComplete,
  getAnimationEntry,
} from "../companion/animationRegistry";
import { COMPANION_ANIMATION_IDS } from "../../../src/shared/companions/companionContract";

describe("animationRegistry (COMPANION-MOTOR)", () => {
  it("has a row for every contract AnimationName", () => {
    expect(() => assertAnimationRegistryComplete()).not.toThrow();
    for (const id of COMPANION_ANIMATION_IDS) {
      expect(id in ANIMATION_REGISTRY).toBe(true);
    }
  });

  it("getAnimationEntry returns registry row", () => {
    expect(getAnimationEntry("wave")).toBe(ANIMATION_REGISTRY.wave);
  });
});
