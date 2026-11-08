import { describe, expect, it } from "vitest";
import {
  BOND_DECAY_GRACE_DAYS,
  BOND_DECAY_PER_DAY,
  DEN_FOOD_BOND,
  DEN_STARTING_BOND,
  MAX_BOND,
  RECALL_BOND,
  RUNAWAY_BOND,
  renameDenCreature,
  startDenSession,
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
    const roster = denRoster(recallSidekick(den(), "lumipuff"));
    expect(roster.map((entry) => entry.species.id)).toEqual(["lumipuff", "glowmoth"]);
    expect(roster.find((entry) => entry.species.id === "lumipuff")?.isSidekick).toBe(true);
    expect(roster.find((entry) => entry.species.id === "glowmoth")?.isSidekick).toBe(false);
  });

  it("recalls one sidekick at a time; recalling another sends the first home", () => {
    const bonded = den({
      creatures: den().creatures.map((creature) => ({ ...creature, bond: Math.max(creature.bond, RECALL_BOND) })),
    });
    const first = recallSidekick(bonded, "lumipuff");
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

describe("bond has stakes", () => {
  const day = 86_400_000;
  const visited = "2026-11-08T18:00:00.000Z";
  const later = (days: number) => new Date(Date.parse(visited) + days * day).toISOString();

  it("new catches start above the runaway line", () => {
    expect(DEN_STARTING_BOND).toBeGreaterThanOrEqual(RECALL_BOND);
  });

  it("bond fades only after a couple of days away, the same rule as Elli's bond", () => {
    const base = den({ lastVisitAt: visited });
    const soon = startDenSession(base, later(BOND_DECAY_GRACE_DAYS));
    expect(soon.state.creatures.map((c) => c.bond)).toEqual([20, 40]);
    const away = startDenSession(base, later(5));
    expect(away.state.creatures.map((c) => c.bond)).toEqual([20 - 5 * BOND_DECAY_PER_DAY, 40 - 5 * BOND_DECAY_PER_DAY]);
    expect(away.state.lastVisitAt).toBe(later(5));
    const again = startDenSession(away.state, later(5));
    expect(again.state.creatures).toEqual(away.state.creatures);
  });

  it("a neglected sidekick runs home at the start of a session", () => {
    const base = den({ lastVisitAt: visited, sidekickId: "glowmoth" });
    const result = startDenSession(base, later(4));
    expect(result.state.creatures.find((c) => c.creatureId === "glowmoth")!.bond).toBeLessThan(RUNAWAY_BOND);
    expect(result.state.sidekickId).toBeNull();
    expect(result.state.ranAwayId).toBe("glowmoth");
    expect(result.ranAwayId).toBe("glowmoth");
  });

  it("a creature below the recall bond cannot be recalled until she wins it back", () => {
    const shy = den({ creatures: [{ creatureId: "glowmoth", nickname: "Glow", bond: RECALL_BOND - 1, caughtAt: "x" }] });
    expect(recallSidekick(shy, "glowmoth").sidekickId).toBeNull();
    const fed = feedDenCreature(shy, "glowmoth", "apple_bite");
    expect(fed.ok && recallSidekick(fed.state, "glowmoth").sidekickId).toBe("glowmoth");
  });
});

describe("renameDenCreature", () => {
  it("trims, keeps names short, and ignores an empty name", () => {
    expect(renameDenCreature(den(), "glowmoth", "  Sparkle  ").creatures[0].nickname).toBe("Sparkle");
    expect(renameDenCreature(den(), "glowmoth", "A".repeat(40)).creatures[0].nickname).toHaveLength(16);
    expect(renameDenCreature(den(), "glowmoth", "   ").creatures[0].nickname).toBe("Glow");
  });
});
