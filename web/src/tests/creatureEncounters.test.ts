import { describe, expect, it } from "vitest";
import { CREATURE_CATALOG, LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";
import {
  CHARGES_BY_RARITY,
  ENCOUNTER_CHANCE_BY_STOP,
  WEEKLY_GUARANTEE_DAYS,
  creatureAppearsNow,
  creatureDexView,
  rollCreatureEncounter,
} from "../components/creatureEncounters";

const NOV_NIGHT = { season: "autumn" as const, timeOfDay: "night" as const };
const at = "2026-11-08T21:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.parse(at) - days * 86_400_000).toISOString();
const seq = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

describe("creature catalog", () => {
  it("numbers every species like a dex, uses the economy's rarity ladder, and starts with Lumipuff", () => {
    expect(CREATURE_CATALOG[0]).toBe(LUMIPUFF_MONSTER);
    CREATURE_CATALOG.forEach((species, index) => {
      expect(species.dexNumber).toBe(index + 1);
      expect(["common", "rare", "epic", "legendary"]).toContain(species.rarity);
    });
    expect(new Set(CREATURE_CATALOG.map((species) => species.id)).size).toBe(CREATURE_CATALOG.length);
  });
});

describe("rollCreatureEncounter", () => {
  const recent = { lastSightingAt: daysAgo(1), sightingsThisBoard: 0 };

  it("appears only when the roll beats the stop's chance; a miss never raises the next chance (no pity)", () => {
    const chance = ENCOUNTER_CHANCE_BY_STOP.common;
    const miss = rollCreatureEncounter({ stopKind: "common", scene: NOV_NIGHT, nowIso: at, history: recent, roll: seq(chance + 0.001) });
    expect(miss).toMatchObject({ appeared: false, reason: "no_luck" });
    const afterTenMisses = rollCreatureEncounter({
      stopKind: "common",
      scene: NOV_NIGHT,
      nowIso: at,
      history: { ...recent, missesSinceSighting: 10 } as never,
      roll: seq(chance + 0.001),
    });
    expect(afterTenMisses.appeared).toBe(false);
    const hit = rollCreatureEncounter({ stopKind: "common", scene: NOV_NIGHT, nowIso: at, history: recent, roll: seq(0, 0, 0) });
    expect(hit).toMatchObject({ appeared: true, reason: "rolled" });
    expect(hit.charges).toBe(CHARGES_BY_RARITY[hit.creature!.rarity]);
  });

  it("guarantees one sighting when a week has passed without one", () => {
    const quiet = { lastSightingAt: daysAgo(WEEKLY_GUARANTEE_DAYS), sightingsThisBoard: 0 };
    const result = rollCreatureEncounter({ stopKind: "common", scene: NOV_NIGHT, nowIso: at, history: quiet, roll: seq(0.999, 0, 0) });
    expect(result).toMatchObject({ appeared: true, reason: "weekly_guarantee" });
  });

  it("allows at most one encounter per board, even with the guarantee due", () => {
    const result = rollCreatureEncounter({
      stopKind: "legendary",
      scene: NOV_NIGHT,
      nowIso: at,
      history: { lastSightingAt: daysAgo(30), sightingsThisBoard: 1 },
      roll: seq(0),
    });
    expect(result).toMatchObject({ appeared: false, reason: "board_limit" });
  });

  it("only picks species that are out right now (time of day, season, stop)", () => {
    for (let index = 0; index < 40; index += 1) {
      const value = index / 40;
      const result = rollCreatureEncounter({
        stopKind: "common",
        scene: { season: "summer", timeOfDay: "day" },
        nowIso: at,
        history: recent,
        roll: seq(0, value, value),
      });
      expect(creatureAppearsNow(result.creature!, { season: "summer", timeOfDay: "day", stopKind: "common" })).toBe(true);
    }
  });
});

describe("creatureDexView", () => {
  it("shows every species: caught in colour, seen greyed, unknown as ???, each with where to find it", () => {
    const view = creatureDexView({ seenIds: ["lumipuff", "glowmoth"], caughtIds: ["lumipuff"], scene: NOV_NIGHT });
    expect(view.entries).toHaveLength(CREATURE_CATALOG.length);
    expect(view.caught).toBe(1);
    expect(view.seen).toBe(2);
    const byId = Object.fromEntries(view.entries.map((entry) => [entry.species.id, entry]));
    expect(byId.lumipuff.status).toBe("caught");
    expect(byId.glowmoth.status).toBe("seen");
    expect(byId.glowmoth.displayName).toBe("Glowmoth");
    expect(byId.frostkit.status).toBe("unknown");
    expect(byId.frostkit.displayName).toBe("???");
    view.entries.forEach((entry) => expect(entry.where.length).toBeGreaterThan(0));
  });

  it("flags who is out right now so she has a goal for tonight", () => {
    const night = creatureDexView({ seenIds: [], caughtIds: [], scene: NOV_NIGHT });
    const day = creatureDexView({ seenIds: [], caughtIds: [], scene: { season: "autumn", timeOfDay: "day" } });
    const glowNight = night.entries.find((entry) => entry.species.id === "glowmoth")!;
    const glowDay = day.entries.find((entry) => entry.species.id === "glowmoth")!;
    expect(glowNight.outNow).toBe(true);
    expect(glowDay.outNow).toBe(false);
  });
});
