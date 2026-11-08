import { describe, expect, it } from "vitest";
import {
  DEN_FOOD_BOND,
  MAX_BOND,
  denRoster,
  dismissSidekick,
  feedDenCreature,
  recallSidekick,
  type DenState,
} from "../components/creatureDenRules";

function den(overrides: Partial<DenState> = {}): DenState {
  return {
    creatures: [
      { creatureId: "glowmoth", nickname: "Glow", bond: 20, caughtAt: "2026-11-08T21:00:00.000Z" },
      { creatureId: "lumipuff", nickname: "Lumi", bond: 40, caughtAt: "2026-11-01T18:00:00.000Z" },
    ],
    sidekickId: null,
    food: { apple_bite: 2, star_candy: 0, mystery_snack: 1 },
    ...overrides,
  };
}

describe("creature den rules", () => {
  it("lists her creatures in dex order and marks the sidekick", () => {
    const roster = denRoster(recallSidekick(den(), "glowmoth"));
    expect(roster.map((entry) => entry.species.id)).toEqual(["lumipuff", "glowmoth"]);
    expect(roster.find((entry) => entry.species.id === "glowmoth")?.isSidekick).toBe(true);
    expect(roster.find((entry) => entry.species.id === "lumipuff")?.isSidekick).toBe(false);
  });

  it("recalls one sidekick at a time; recalling another sends the first home", () => {
    const first = recallSidekick(den(), "lumipuff");
    expect(first.sidekickId).toBe("lumipuff");
    const swapped = recallSidekick(first, "glowmoth");
    expect(swapped.sidekickId).toBe("glowmoth");
  });

  it("dismiss sends the sidekick home; a creature she has not caught cannot be recalled", () => {
    expect(dismissSidekick(recallSidekick(den(), "lumipuff")).sidekickId).toBeNull();
    expect(recallSidekick(den(), "starwhal").sidekickId).toBeNull();
  });

  it("feeding uses one store food from her inventory and raises bond, capped", () => {
    const fed = feedDenCreature(den(), "glowmoth", "apple_bite");
    expect(fed.ok).toBe(true);
    if (!fed.ok) return;
    expect(fed.state.food.apple_bite).toBe(1);
    expect(fed.state.creatures.find((c) => c.creatureId === "glowmoth")?.bond).toBe(20 + DEN_FOOD_BOND.apple_bite);

    const nearFull = den({ creatures: [{ creatureId: "lumipuff", nickname: "Lumi", bond: MAX_BOND - 1, caughtAt: "x" }] });
    const capped = feedDenCreature(nearFull, "lumipuff", "mystery_snack");
    expect(capped.ok && capped.state.creatures[0].bond).toBe(MAX_BOND);
  });

  it("no food means no feeding: nothing is free, and nothing changes", () => {
    const state = den();
    const result = feedDenCreature(state, "glowmoth", "star_candy");
    expect(result).toEqual({ ok: false, reason: "no_food", state });
  });
});
