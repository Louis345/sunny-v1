import { describe, expect, it } from "vitest";
import {
  companionCareFeedShouldPersist,
  previewCompanionCareMirror,
} from "../server/companionCareFeedRoute";
import type { CompanionCarePlan } from "../shared/companionCareTypes";

const plan: CompanionCarePlan = {
  version: 1,
  childId: "child_fixture_001",
  companionId: "companion_fixture_001",
  state: {
    hunger: 0.8,
    mood: 0.7,
    energy: 0.6,
    usefulness: 0.5,
    bond: 0.4,
    thoughtClarity: 0.3,
    lastSeenAt: "2026-05-04T00:00:00.000Z",
  },
  memory: {
    firstMetAt: "2026-05-01T00:00:00.000Z",
    previousSeenAt: "2026-05-03T00:00:00.000Z",
    lastThingTheyWorkedOn: "spelling",
  },
  inventory: { food: [], careItems: [] },
  economy: { coins: 12, storeUnlocks: [] },
  updatedAt: "2026-05-04T00:00:00.000Z",
};

describe("companion care feed route preview rules", () => {
  it("does not persist companion care feed mutations in blocked preview mode", () => {
    expect(companionCareFeedShouldPersist({ persistenceMode: "blocked" })).toBe(false);
  });

  it("persists companion care feed mutations only in live mode", () => {
    expect(companionCareFeedShouldPersist({ persistenceMode: "live" })).toBe(true);
  });

  it("can return mirror fields from the temporary preview plan without writing them", () => {
    const mirror = previewCompanionCareMirror(plan);
    expect(mirror.companionCurrency).toBe(12);
    expect(mirror.tamagotchi).toMatchObject({
      hunger: 0.8,
      happiness: 0.7,
      bond: 0.4,
      intellect: 0.3,
    });
  });
});
