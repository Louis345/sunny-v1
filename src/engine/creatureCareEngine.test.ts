import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { loadCompanionCarePlanForChart, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import { DEN_FOOD_BOND, DEN_STARTING_BOND, RECALL_BOND, RUNAWAY_BOND } from "../shared/creatureDenRules";
import type { CompanionCarePlan } from "../shared/companionCareTypes";
import { createStarterCompanionCarePlan } from "./companionCareEngine";
import {
  FAMILIAR_CATCH_BOND,
  creatureHistoryOf,
  creatureStateOf,
  denStateOf,
  dismissPlanSidekick,
  feedPlanCreature,
  recallPlanSidekick,
  recordBoardFinishedForCreatures,
  renamePlanCreature,
  resolveCreatureEncounter,
  rollPlacedCreatureEncounter,
  startCreatureSession,
} from "./creatureCareEngine";

const at = "2026-11-08T21:00:00.000Z";
const night = { season: "autumn" as const, timeOfDay: "night" as const };
const later = (days: number) => new Date(Date.parse(at) + days * 86_400_000).toISOString();

function starter(): CompanionCarePlan {
  return createStarterCompanionCarePlan({ childId: "lab-child", companionId: "elli" });
}

function withLumi(plan = starter()): CompanionCarePlan {
  const rolled = rollPlacedCreatureEncounter(plan, { boardId: "board-1", stopId: "s1", plannerPlaced: true, stopKind: "common", scene: night, nowIso: at });
  if (!rolled.encounter) throw Error("expected the starter");
  return resolveCreatureEncounter(rolled.plan, { encounterId: rolled.encounter.encounterId, outcome: "caught", nowIso: at }).plan;
}

describe("creatures saved in her companion plan", () => {
  it("a stop the Planner did not mark rolls nothing and changes nothing", () => {
    const plan = starter();
    const result = rollPlacedCreatureEncounter(plan, { boardId: "board-1", stopId: "s1", plannerPlaced: false, stopKind: "common", scene: night, nowIso: at });
    expect(result.encounter).toBeNull();
    expect(result.plan).toBe(plan);
  });

  it("a placed encounter is rolled once per board: the first is Lumipuff, and asking again returns the same one", () => {
    const first = rollPlacedCreatureEncounter(starter(), { boardId: "board-1", stopId: "s1", plannerPlaced: true, stopKind: "common", scene: night, nowIso: at });
    expect(first.encounter).toMatchObject({ creatureId: "lumipuff", isNew: true, reason: "starter", charges: 3 });
    expect(creatureHistoryOf(first.plan).seenIds).toContain("lumipuff");
    const again = rollPlacedCreatureEncounter(first.plan, { boardId: "board-1", stopId: "s1", plannerPlaced: true, stopKind: "common", scene: night, nowIso: at, roll: () => 0 });
    expect(again.encounter?.encounterId).toBe(first.encounter!.encounterId);
    const otherStop = rollPlacedCreatureEncounter(first.plan, { boardId: "board-1", stopId: "s2", plannerPlaced: true, stopKind: "common", scene: night, nowIso: at });
    expect(otherStop.encounter).toBeNull();
  });

  it("caught adds her new friend once; let go keeps it seen but not caught", () => {
    const rolled = rollPlacedCreatureEncounter(starter(), { boardId: "board-1", stopId: "s1", plannerPlaced: true, stopKind: "common", scene: night, nowIso: at });
    const caught = resolveCreatureEncounter(rolled.plan, { encounterId: rolled.encounter!.encounterId, outcome: "caught", nowIso: at });
    expect(denStateOf(caught.plan).creatures).toEqual([
      expect.objectContaining({ creatureId: "lumipuff", nickname: "Lumi", bond: DEN_STARTING_BOND, caughtAt: at }),
    ]);
    const twice = resolveCreatureEncounter(caught.plan, { encounterId: rolled.encounter!.encounterId, outcome: "caught", nowIso: at });
    expect(twice.duplicate).toBe(true);
    expect(denStateOf(twice.plan).creatures).toHaveLength(1);

    const letGo = resolveCreatureEncounter(rolled.plan, { encounterId: rolled.encounter!.encounterId, outcome: "let_go", nowIso: at });
    expect(denStateOf(letGo.plan).creatures).toHaveLength(0);
    expect(creatureHistoryOf(letGo.plan).seenIds).toContain("lumipuff");
  });

  it("catching a familiar friend again builds bond instead of a duplicate", () => {
    const plan = withLumi();
    const rolled = rollPlacedCreatureEncounter(plan, { boardId: "board-2", stopId: "s1", plannerPlaced: true, stopKind: "common", scene: { season: "summer", timeOfDay: "day" }, nowIso: at, roll: () => 0.999 });
    expect(rolled.encounter).toMatchObject({ creatureId: "lumipuff", isNew: false, reason: "familiar" });
    const caught = resolveCreatureEncounter(rolled.plan, { encounterId: rolled.encounter!.encounterId, outcome: "caught", nowIso: at });
    expect(denStateOf(caught.plan).creatures).toEqual([expect.objectContaining({ creatureId: "lumipuff", bond: DEN_STARTING_BOND + FAMILIAR_CATCH_BOND })]);
  });

  it("each board counts once toward milestones", () => {
    let plan = starter();
    plan = recordBoardFinishedForCreatures(plan, "board-1");
    plan = recordBoardFinishedForCreatures(plan, "board-1");
    plan = recordBoardFinishedForCreatures(plan, "board-2");
    expect(creatureHistoryOf(plan).boardsCompleted).toBe(2);
  });

  it("feeding spends her real food and raises bond; with none left nothing changes", () => {
    const plan = withLumi();
    const apples = plan.inventory.food.find((item) => item.id === "apple_bite")!.quantity;
    const fed = feedPlanCreature(plan, { creatureId: "lumipuff", foodId: "apple_bite", nowIso: at });
    expect(fed.ok).toBe(true);
    if (!fed.ok) return;
    expect(fed.plan.inventory.food.find((item) => item.id === "apple_bite")!.quantity).toBe(apples - 1);
    expect(denStateOf(fed.plan).creatures[0].bond).toBe(DEN_STARTING_BOND + DEN_FOOD_BOND.apple_bite);
    const empty = { ...plan, inventory: { ...plan.inventory, food: plan.inventory.food.map((item) => ({ ...item, quantity: 0 })) } };
    expect(feedPlanCreature(empty, { creatureId: "lumipuff", foodId: "apple_bite", nowIso: at })).toMatchObject({ ok: false, reason: "no_food" });
  });

  it("recall, send home and rename are saved; a shy creature cannot be recalled", () => {
    const plan = withLumi();
    const recalled = recallPlanSidekick(plan, "lumipuff");
    expect(denStateOf(recalled).sidekickId).toBe("lumipuff");
    expect(denStateOf(dismissPlanSidekick(recalled)).sidekickId).toBeNull();
    expect(denStateOf(renamePlanCreature(plan, "lumipuff", " Bubbles ")).creatures[0].nickname).toBe("Bubbles");
    const shy = { ...plan, creatures: { ...creatureStateOf(plan), den: { ...creatureStateOf(plan).den, creatures: [{ ...denStateOf(plan).creatures[0], bond: RECALL_BOND - 1 }] } } };
    expect(denStateOf(recallPlanSidekick(shy, "lumipuff")).sidekickId).toBeNull();
  });

  it("a session start fades bond after days away and sends a neglected sidekick home", () => {
    let plan = recallPlanSidekick(withLumi(), "lumipuff");
    plan = startCreatureSession(plan, at).plan;
    const result = startCreatureSession(plan, later(8));
    expect(denStateOf(result.plan).creatures[0].bond).toBeLessThan(RUNAWAY_BOND);
    expect(result.ranAwayId).toBe("lumipuff");
    expect(denStateOf(result.plan).sidekickId).toBeNull();
  });

  it("everything survives a save and a load", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-creatures-roundtrip-"));
    const chart = {
      childId: "lab-child",
      links: { companionCareDir: dir, learningProfile: path.join(dir, "profile.json") },
      companion: { presetId: "elli" },
      learningProfile: { childId: "lab-child" } as never,
      economy: { coinBalance: 0 },
    };
    try {
      let plan = recallPlanSidekick(withLumi(), "lumipuff");
      plan = recordBoardFinishedForCreatures(plan, "board-1");
      plan = startCreatureSession(plan, at).plan;
      saveCompanionCarePlan(chart as never, plan);
      const loaded = loadCompanionCarePlanForChart(chart as never).plan;
      expect(creatureStateOf(loaded)).toEqual(creatureStateOf(plan));
      expect(denStateOf(loaded).sidekickId).toBe("lumipuff");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
