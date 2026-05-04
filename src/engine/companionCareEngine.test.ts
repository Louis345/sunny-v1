import { describe, expect, it } from "vitest";
import {
  applyCompanionAbsenceDecay,
  applyCompanionFeedItem,
  createStarterCompanionCarePlan,
  getCompanionReadiness,
} from "./companionCareEngine";
import type { CompanionCarePlan } from "../shared/companionCareTypes";

function plan(overrides: Partial<CompanionCarePlan["state"]> = {}): CompanionCarePlan {
  return {
    ...createStarterCompanionCarePlan({
      childId: "reina",
      companionId: "matilda",
      nowIso: "2026-05-01T12:00:00.000Z",
      seed: {
        hunger: 0.8,
        happiness: 0.8,
        bond: 0.5,
        intellect: 0.2,
        lastSeenAt: "2026-05-01T12:00:00.000Z",
      },
      coinBalance: 100,
    }),
    state: {
      ...createStarterCompanionCarePlan({
        childId: "reina",
        companionId: "matilda",
        nowIso: "2026-05-01T12:00:00.000Z",
        coinBalance: 100,
      }).state,
      ...overrides,
    },
  };
}

describe("companionCareEngine", () => {
  it("creates starter inventory for a new named child-companion care plan", () => {
    const p = plan();
    expect(p.childId).toBe("reina");
    expect(p.companionId).toBe("matilda");
    expect(p.inventory.food.map((item) => [item.id, item.quantity])).toEqual([
      ["apple_bite", 3],
      ["brain_berry", 2],
      ["cozy_soup", 1],
      ["star_candy", 1],
      ["mystery_snack", 1],
    ]);
  });

  it("applies absence decay and stores prior seen context for reunion copy", () => {
    const before = plan({
      hunger: 0.9,
      mood: 0.8,
      energy: 0.85,
      usefulness: 0.7,
      bond: 0.6,
      lastSeenAt: "2026-04-28T12:00:00.000Z",
    });

    const result = applyCompanionAbsenceDecay(
      before,
      "2026-05-03T12:00:00.000Z",
    );

    expect(result.plan.state.hunger).toBeLessThan(before.state.hunger);
    expect(result.plan.state.energy).toBeLessThan(before.state.energy);
    expect(result.plan.state.usefulness).toBeLessThan(before.state.usefulness);
    expect(result.plan.state.bond).toBeLessThan(before.state.bond);
    expect(result.plan.memory.previousSeenAt).toBe("2026-04-28T12:00:00.000Z");
    expect(result.reunion.daysAway).toBe(5);
  });

  it("feeds a normal item, decrements inventory, clamps vitals, and returns animation A", () => {
    const before = plan({ hunger: 0.92, mood: 0.95 });
    const result = applyCompanionFeedItem(
      before,
      "apple_bite",
      "2026-05-03T12:00:00.000Z",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.animation.kind).toBe("normal-feed");
    expect(result.animation.reference).toBe("animation-a");
    expect(result.plan.state.hunger).toBe(1);
    expect(result.plan.state.mood).toBe(1);
    expect(
      result.plan.inventory.food.find((item) => item.id === "apple_bite")?.quantity,
    ).toBe(2);
  });

  it("feeds mystery snack as rare reward animation B", () => {
    const result = applyCompanionFeedItem(
      plan({ hunger: 0.4 }),
      "mystery_snack",
      "2026-05-03T12:00:00.000Z",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.animation.kind).toBe("rare-reward");
    expect(result.animation.reference).toBe("animation-b");
  });

  it("rejects missing or depleted inventory without changing state", () => {
    const before = plan();
    const depleted = {
      ...before,
      inventory: {
        ...before.inventory,
        food: before.inventory.food.map((item) =>
          item.id === "cozy_soup" ? { ...item, quantity: 0 } : item,
        ),
      },
    };

    const result = applyCompanionFeedItem(
      depleted,
      "cozy_soup",
      "2026-05-03T12:00:00.000Z",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("depleted");
    expect(result.plan).toEqual(depleted);
  });

  it("computes gentle but real readiness consequences", () => {
    const readiness = getCompanionReadiness(
      plan({
        hunger: 0.18,
        energy: 0.22,
        bond: 0.19,
        thoughtClarity: 0.25,
      }),
    );

    expect(readiness.hungry).toBe(true);
    expect(readiness.lowEnergy).toBe(true);
    expect(readiness.lowBond).toBe(true);
    expect(readiness.lowThoughtClarity).toBe(true);
    expect(readiness.highEnergyReluctance).toBe(true);
    expect(readiness.canContinueTired).toBe(true);
  });
});
