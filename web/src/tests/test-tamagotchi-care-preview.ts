import { describe, expect, it } from "vitest";
import {
  applyTamagotchiPreviewAction,
  createTamagotchiPreviewState,
} from "../context/tamagotchiCarePreview";

describe("Storybook Tamagotchi care-loop preview", () => {
  it("moves from steady to visibly hungry when fake time advances", () => {
    const initial = createTamagotchiPreviewState();
    const hungry = applyTamagotchiPreviewAction(initial, {
      type: "advance-time",
    });

    expect(initial.careState).toBe("steady");
    expect(hungry.careState).toBe("hungry");
    expect(hungry.hunger).toBeLessThan(initial.hunger);
    expect(hungry.inventory.apple_bite).toBe(0);
  });

  it("turns assignment completion into an apple without repairing hunger", () => {
    const hungry = applyTamagotchiPreviewAction(
      createTamagotchiPreviewState(),
      { type: "advance-time" },
    );
    const rewarded = applyTamagotchiPreviewAction(hungry, {
      type: "complete-assignment",
    });

    expect(rewarded.assignmentProgress).toBe(100);
    expect(rewarded.inventory.apple_bite).toBe(1);
    expect(rewarded.careState).toBe("hungry");
    expect(rewarded.hunger).toBe(hungry.hunger);
  });

  it("consumes exactly one earned apple and records the factual recovery", () => {
    const hungry = applyTamagotchiPreviewAction(
      createTamagotchiPreviewState(),
      { type: "advance-time" },
    );
    const rewarded = applyTamagotchiPreviewAction(hungry, {
      type: "complete-assignment",
    });
    const restored = applyTamagotchiPreviewAction(rewarded, {
      type: "give-apple",
    });

    expect(restored.inventory.apple_bite).toBe(0);
    expect(restored.hunger).toBe(100);
    expect(restored.careState).toBe("restored");
    expect(restored.feedingEventId).not.toBeNull();
    expect(restored.lastEvent).toMatchObject({
      type: "companion_care_completed",
      careAction: "feed",
      item: "apple_bite",
      beforeState: "hungry",
      afterState: "restored",
    });
  });

  it("cannot feed without inventory or duplicate the same reward", () => {
    const initial = createTamagotchiPreviewState();
    const blocked = applyTamagotchiPreviewAction(initial, {
      type: "give-apple",
    });
    const rewarded = applyTamagotchiPreviewAction(initial, {
      type: "complete-assignment",
    });
    const duplicateReward = applyTamagotchiPreviewAction(rewarded, {
      type: "complete-assignment",
    });

    expect(blocked).toEqual(initial);
    expect(duplicateReward.inventory.apple_bite).toBe(1);
  });

  it("resets the full in-memory fixture without persistence", () => {
    const rewarded = applyTamagotchiPreviewAction(
      applyTamagotchiPreviewAction(
        applyTamagotchiPreviewAction(createTamagotchiPreviewState(), {
          type: "advance-time",
        }),
        { type: "complete-assignment" },
      ),
      { type: "give-apple" },
    );

    const reset = applyTamagotchiPreviewAction(rewarded, { type: "reset" });

    expect(reset).toEqual(createTamagotchiPreviewState());
  });
});
