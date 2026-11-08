import { describe, expect, it } from "vitest";
import { CREATURE_CATALOG, LUMIPUFF_MONSTER } from "../../../src/shared/capturedMonsterCatalog";
import {
  CHARGES_BY_RARITY,
  ENCOUNTERS_PER_BOARD,
  WEEKLY_LOCKOUT_DAYS,
  creatureAppearsNow,
  creatureDexView,
  rollCreatureEncounter,
  type CreatureEncounterHistory,
} from "../../../src/shared/creatureEncounters";

const AUTUMN_NIGHT = { season: "autumn" as const, timeOfDay: "night" as const };
const now = "2026-11-08T21:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.parse(now) - days * 86_400_000).toISOString();
const seq = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};
const history = (overrides: Partial<CreatureEncounterHistory> = {}): CreatureEncounterHistory => ({
  seenIds: ["lumipuff"],
  caughtIds: ["lumipuff"],
  boardsCompleted: 2,
  encountersThisBoard: 0,
  lastTryAt: {},
  ...overrides,
});
const speciesOf = (id: string) => CREATURE_CATALOG.find((species) => species.id === id)!;

describe("creature catalog (WoW model)", () => {
  it("numbers every species, uses the economy's rarity ladder, and says how each one is found", () => {
    expect(CREATURE_CATALOG[0]).toBe(LUMIPUFF_MONSTER);
    expect(LUMIPUFF_MONSTER.source.kind).toBe("starter");
    CREATURE_CATALOG.forEach((species, index) => {
      expect(species.dexNumber).toBe(index + 1);
      expect(["common", "rare", "epic", "legendary"]).toContain(species.rarity);
      expect(["starter", "milestone", "weekly_drop", "seasonal"]).toContain(species.source.kind);
    });
    expect(speciesOf("dewbun").source).toMatchObject({ kind: "milestone" });
    expect(speciesOf("pumpkit").source).toMatchObject({ kind: "seasonal" });
    expect(speciesOf("starwhal").source).toMatchObject({ kind: "weekly_drop" });
  });
});

describe("rollCreatureEncounter: the Planner chooses the moment, code keeps it scarce", () => {
  it("nothing appears unless the Planner placed an encounter, and never twice on one board", () => {
    expect(rollCreatureEncounter({ plannerPlaced: false, stopKind: "common", scene: AUTUMN_NIGHT, nowIso: now, history: history() })).toMatchObject({ appeared: false, reason: "not_placed" });
    const full = history({ encountersThisBoard: ENCOUNTERS_PER_BOARD });
    expect(rollCreatureEncounter({ plannerPlaced: true, stopKind: "legendary", scene: AUTUMN_NIGHT, nowIso: now, history: full })).toMatchObject({ appeared: false, reason: "board_limit" });
  });

  it("her first encounter is always the starter, Lumipuff", () => {
    const result = rollCreatureEncounter({ plannerPlaced: true, stopKind: "common", scene: AUTUMN_NIGHT, nowIso: now, history: history({ seenIds: [], caughtIds: [] }) });
    expect(result).toMatchObject({ appeared: true, reason: "starter", isNew: true });
    expect(result.creature?.id).toBe("lumipuff");
    expect(result.charges).toBe(CHARGES_BY_RARITY.common);
  });

  it("a milestone creature is guaranteed once she has finished enough boards (effort, not luck)", () => {
    const dewbun = speciesOf("dewbun");
    if (dewbun.source.kind !== "milestone") throw Error("expected a milestone creature");
    const spring = { season: "spring" as const, timeOfDay: "day" as const };
    const early = rollCreatureEncounter({ plannerPlaced: true, stopKind: "common", scene: spring, nowIso: now, history: history({ boardsCompleted: dewbun.source.boards - 1 }), roll: seq(0.99) });
    expect(early.creature?.id).not.toBe("dewbun");
    const earned = rollCreatureEncounter({ plannerPlaced: true, stopKind: "common", scene: spring, nowIso: now, history: history({ boardsCompleted: dewbun.source.boards }), roll: seq(0.99) });
    expect(earned).toMatchObject({ appeared: true, reason: "milestone", isNew: true });
    expect(earned.creature?.id).toBe("dewbun");
  });

  it("a weekly drop gets one try a week: a miss uses the try, and the next one waits for the lockout", () => {
    const missed = rollCreatureEncounter({ plannerPlaced: true, stopKind: "legendary", scene: AUTUMN_NIGHT, nowIso: now, history: history(), roll: () => 0.999 });
    expect(missed.appeared).toBe(true);
    expect(missed.reason).toBe("familiar");
    expect(missed.isNew).toBe(false);
    expect(missed.tries.starwhal).toBe(now);
    expect(missed.tries.glowmoth).toBe(now);

    const lockedOut = rollCreatureEncounter({
      plannerPlaced: true, stopKind: "legendary", scene: AUTUMN_NIGHT, nowIso: now,
      history: history({ lastTryAt: { starwhal: daysAgo(WEEKLY_LOCKOUT_DAYS - 1), glowmoth: daysAgo(1), emberleaf: daysAgo(1) } }),
      roll: () => 0,
    });
    expect(lockedOut.creature?.id).not.toBe("starwhal");
    expect(lockedOut.reason).toBe("familiar");

    const freshWeek = rollCreatureEncounter({
      plannerPlaced: true, stopKind: "legendary", scene: AUTUMN_NIGHT, nowIso: now,
      history: history({ lastTryAt: { starwhal: daysAgo(WEEKLY_LOCKOUT_DAYS), glowmoth: daysAgo(1), emberleaf: daysAgo(1) } }),
      roll: () => 0,
    });
    expect(freshWeek).toMatchObject({ appeared: true, reason: "drop", isNew: true });
    expect(freshWeek.creature?.id).toBe("starwhal");
  });

  it("a seasonal creature only appears in its season, with one try a day", () => {
    const july = rollCreatureEncounter({ plannerPlaced: true, stopKind: "common", scene: { season: "summer", timeOfDay: "day" }, nowIso: now, history: history(), roll: () => 0 });
    expect(july.creature?.id).not.toBe("pumpkit");
    const halloween = { season: "halloween" as const, timeOfDay: "day" as const };
    const caught = rollCreatureEncounter({
      plannerPlaced: true, stopKind: "common", scene: halloween, nowIso: now,
      history: history({ lastTryAt: { emberleaf: daysAgo(1) } }),
      roll: () => 0,
    });
    expect(caught.creature?.id).toBe("pumpkit");
    expect(caught.reason).toBe("seasonal");
    const sameDay = rollCreatureEncounter({
      plannerPlaced: true, stopKind: "common", scene: halloween, nowIso: now,
      history: history({ lastTryAt: { pumpkit: now, emberleaf: now } }),
      roll: () => 0,
    });
    expect(sameDay.creature?.id).not.toBe("pumpkit");
  });

  it("familiar encounters only bring creatures she has caught that are out right now", () => {
    for (let index = 0; index < 20; index += 1) {
      const result = rollCreatureEncounter({
        plannerPlaced: true, stopKind: "common", scene: AUTUMN_NIGHT, nowIso: now,
        history: history({ caughtIds: ["lumipuff", "glowmoth"], seenIds: ["lumipuff", "glowmoth"], lastTryAt: { emberleaf: now, starwhal: now } }),
        roll: () => index / 20,
      });
      expect(["lumipuff", "glowmoth"]).toContain(result.creature?.id);
      expect(creatureAppearsNow(result.creature!, { ...AUTUMN_NIGHT, stopKind: "common" })).toBe(true);
    }
  });
});

describe("creatureDexView: every creature is a goal she can measure", () => {
  it("shows caught, seen and ??? entries, with how each is found and what is left to do", () => {
    const view = creatureDexView({
      history: history({ seenIds: ["lumipuff", "glowmoth"], caughtIds: ["lumipuff"], boardsCompleted: 3, lastTryAt: { glowmoth: daysAgo(2) } }),
      scene: AUTUMN_NIGHT,
      nowIso: now,
    });
    expect(view.entries).toHaveLength(CREATURE_CATALOG.length);
    expect(view.caught).toBe(1);
    const byId = Object.fromEntries(view.entries.map((entry) => [entry.species.id, entry]));
    expect(byId.lumipuff.status).toBe("caught");
    expect(byId.glowmoth.status).toBe("seen");
    expect(byId.frostkit.displayName).toBe("???");
    expect(byId.dewbun.goal).toMatch(/3 of 5 boards/);
    expect(byId.glowmoth.goal).toMatch(/Next try in 5 days/);
    expect(byId.starwhal.goal).toMatch(/1 try this week/);
    expect(byId.pumpkit.goal).toMatch(/Halloween/);
    view.entries.forEach((entry) => expect(entry.where.length).toBeGreaterThan(0));
  });

  it("flags who is out right now", () => {
    const night = creatureDexView({ history: history(), scene: AUTUMN_NIGHT, nowIso: now });
    const day = creatureDexView({ history: history(), scene: { season: "autumn", timeOfDay: "day" }, nowIso: now });
    expect(night.entries.find((entry) => entry.species.id === "glowmoth")!.outNow).toBe(true);
    expect(day.entries.find((entry) => entry.species.id === "glowmoth")!.outNow).toBe(false);
  });
});
