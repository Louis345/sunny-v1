import { describe, expect, it } from "vitest";
import {
  applyCompanionAbsenceDecay,
  applyCompanionFeedItem,
  purchaseCompanionStoreItem,
  awardHomeworkBonusCoins,
  grantVideoCallTicket,
  markVideoCallTicketOpened,
  createStarterCompanionCarePlan,
  getCompanionReadiness,
  grantNodeChest,
  nodeChestKind,
  purchaseWithCoins,
  spendCallMinute,
} from "./companionCareEngine";
import type { CompanionCarePlan } from "../shared/companionCareTypes";
import { CALL_RULES, CHEST_TABLE, PRICE_LIST, REWARD_CATALOG } from "../shared/rewardCatalog";

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

  it("purchases a persistent companion item once and deducts canonical coins", () => {
    const first = purchaseCompanionStoreItem(
      plan(),
      "star_candy",
      "purchase-1",
      "2026-05-03T12:00:00.000Z",
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.plan.economy.coins).toBe(50);
    expect(first.plan.inventory.food.find((item) => item.id === "star_candy")?.quantity).toBe(2);

    const duplicate = purchaseCompanionStoreItem(
      first.plan,
      "star_candy",
      "purchase-1",
      "2026-05-03T12:01:00.000Z",
    );
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.plan.economy.coins).toBe(50);
    expect(duplicate.plan.inventory.food.find((item) => item.id === "star_candy")?.quantity).toBe(2);
  });

  it("rejects store purchases with insufficient funds without mutation", () => {
    const before = { ...plan(), economy: { ...plan().economy, coins: 20 } };
    const result = purchaseCompanionStoreItem(
      before,
      "apple_bite",
      "purchase-2",
      "2026-05-03T12:00:00.000Z",
    );
    expect(result).toEqual({ ok: false, reason: "insufficient_funds", plan: before });
  });

  it("grants and opens one video-call ticket per homework without duplication", () => {
    const granted = grantVideoCallTicket(
      plan(),
      "hw-fractions",
      "2026-05-03T12:00:00.000Z",
      "/api/homework/game/reina/hw-fractions/bonus.html",
    );
    expect(granted.granted).toBe(true);
    expect(granted.plan.economy.videoCallTickets?.[0]?.bonusUrl).toContain("bonus.html");
    const duplicate = grantVideoCallTicket(granted.plan, "hw-fractions", "2026-05-03T12:01:00.000Z");
    expect(duplicate.granted).toBe(false);
    const opened = markVideoCallTicketOpened(duplicate.plan, "hw-fractions", "2026-05-03T12:02:00.000Z");
    expect(opened.ok).toBe(true);
    expect(opened.plan.economy.videoCallTickets?.[0]?.openedAt).toBe("2026-05-03T12:02:00.000Z");
  });

  it("computes bounded bonus coins from server facts and cannot award twice", () => {
    const first = awardHomeworkBonusCoins(plan(), {
      homeworkId: "hw-fractions",
      independentlyCorrectFreshItems: 3,
      freshItemCount: 4,
      completed: true,
      nowIso: "2026-05-03T12:00:00.000Z",
    });
    expect(first.awarded).toBe(true);
    expect(first.amount).toBe(21);
    expect(first.plan.economy.coins).toBe(121);
    const replay = awardHomeworkBonusCoins(first.plan, {
      homeworkId: "hw-fractions",
      independentlyCorrectFreshItems: 4,
      freshItemCount: 4,
      completed: true,
      nowIso: "2026-05-03T12:05:00.000Z",
    });
    expect(replay.awarded).toBe(false);
    expect(replay.amount).toBe(21);
    expect(replay.plan.economy.coins).toBe(121);
  });
});

// Owner, 2026-11-06: a treasure chest after every finished node. Its colour shows the rarity; it is rolled
// once, saved, and pays coins plus a chance of bonus call minutes, with a pity counter raising that chance.
describe("node treasure chests", () => {
  const plan = () => createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" });
  const at = "2026-11-06T20:00:00.000Z";

  it("picks the chest from the node: practice wooden, check rare, Quest epic, Mystery mystery", () => {
    expect(nodeChestKind({ role: "baseline" })).toBe("common");
    expect(nodeChestKind({ role: "evaluation" })).toBe("rare");
    expect(nodeChestKind({ role: "quest" })).toBe("epic");
    expect(nodeChestKind({ role: "mystery" })).toBe("mystery");
  });

  it("pays coins once, saves the chest, and shows the same chest again", () => {
    // Rolls: rarity 0.1 (stays common), coins 0 (low end of the range), bonus 0.99 (no bonus).
    const noBonus = [0.1, 0, 0.99];
    const first = grantNodeChest(plan(), { homeworkId: "hw", nodeId: "n1", kind: "common", nowIso: at, roll: () => noBonus.shift() ?? 0.99 });
    expect(first.granted).toBe(true);
    expect(first.chest).toMatchObject({ kind: "common", rarity: "common", coins: CHEST_TABLE.common.coinRange[0], bonusChance: CHEST_TABLE.common.bonusChance });
    expect(first.chest.bonus).toBeUndefined();
    expect(first.plan.economy.coins).toBe(plan().economy.coins + CHEST_TABLE.common.coinRange[0]);
    const again = grantNodeChest(first.plan, { homeworkId: "hw", nodeId: "n1", kind: "common", nowIso: at, roll: () => 0 });
    expect(again.granted).toBe(false);
    expect(again.chest).toEqual(first.chest);
    expect(again.plan.economy.coins).toBe(first.plan.economy.coins);
  });

  it("adds bonus call minutes on a lucky roll, and the pity counter raises the chance after each miss", () => {
    let current = plan();
    const miss = () => { const values = [0.1, 0, 0.99]; return () => values.shift() ?? 0.99; };
    current = grantNodeChest(current, { homeworkId: "hw", nodeId: "a", kind: "common", nowIso: at, roll: miss() }).plan;
    const second = grantNodeChest(current, { homeworkId: "hw", nodeId: "b", kind: "common", nowIso: at, roll: miss() });
    expect(second.chest.bonusChance).toBeCloseTo(0.2);
    // A lucky roll (0.25 under the 30% chance), then 0.9 picks call minutes over an item.
    const luckyRolls = [0.1, 0, 0.25, 0.9];
    const lucky = grantNodeChest(second.plan, { homeworkId: "hw", nodeId: "c", kind: "common", nowIso: at, roll: () => luckyRolls.shift()! });
    expect(lucky.chest.bonusChance).toBeCloseTo(0.3);
    expect(lucky.chest.bonus).toEqual({ kind: "call_minutes", minutes: CHEST_TABLE.common.minutes });
    expect(lucky.plan.economy.callMinutes).toBe(CHEST_TABLE.common.minutes);
    expect(lucky.plan.economy.chestsSinceBonus).toBe(0);
  });

  it("rolls a mystery chest's rarity and pays that rarity's chest", () => {
    const rolls = [0.9, 0, 0.99];
    const mystery = grantNodeChest(plan(), { homeworkId: "hw", nodeId: "m", kind: "mystery", nowIso: at, roll: () => rolls.shift()! });
    expect(mystery.chest).toMatchObject({ kind: "mystery", rarity: "epic", coins: CHEST_TABLE.epic.coinRange[0] });
  });
});

// Owner, 2026-11-07: a chest's bonus can be something from her collection; it goes into her inventory.
describe("chests drop collection items", () => {
  const plan = () => createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" });
  const at = "2026-11-07T20:00:00.000Z";
  const rolls = (...values: number[]) => () => values.shift() ?? 0;

  it("drops an item she does not own into her inventory when the bonus is an item", () => {
    // bonus roll 0 (lucky), item-or-minutes roll 0 (item), pick roll 0 (first eligible item)
    const opened = grantNodeChest(plan(), { homeworkId: "hw", nodeId: "n1", kind: "rare", nowIso: at, roll: rolls(0, 0, 0) });
    expect(opened.chest.bonus).toMatchObject({ kind: "item" });
    const itemId = (opened.chest.bonus as { itemId: string }).itemId;
    expect(opened.plan.inventory.rewards).toEqual([itemId]);
    expect(opened.plan.economy.callMinutes ?? 0).toBe(0);
  });

  it("never drops something she owns, and gives call minutes once a chest has nothing left to find", () => {
    let current = plan();
    for (let i = 0; i < 40; i += 1) current = grantNodeChest(current, { homeworkId: "hw", nodeId: `n${i}`, kind: "common", nowIso: at, roll: rolls(0, 0, 0) }).plan;
    const owned = current.inventory.rewards ?? [];
    expect(new Set(owned).size).toBe(owned.length);
    const last = grantNodeChest(current, { homeworkId: "hw", nodeId: "last", kind: "common", nowIso: at, roll: rolls(0, 0, 0) });
    expect(last.chest.bonus).toEqual({ kind: "call_minutes", minutes: CHEST_TABLE.common.minutes });
  });
});

// Owner, 2026-11-07: coins must mean something. Buying refuses when she is short, never goes below zero,
// and a double tap pays once.
describe("spending coins", () => {
  const at = "2026-11-07T21:00:00.000Z";
  const rich = (coins: number) => { const plan = createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" }); return { ...plan, economy: { ...plan.economy, coins } }; };

  it("buys call minutes, takes the price, and keeps a receipt", () => {
    const bought = purchaseWithCoins(rich(100), { receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 }, nowIso: at });
    expect(bought).toMatchObject({ ok: true, price: PRICE_LIST.callMinutes5 });
    if (!bought.ok) throw Error("expected purchase");
    expect(bought.plan.economy.coins).toBe(100 - PRICE_LIST.callMinutes5);
    expect(bought.plan.economy.callMinutes).toBe(5);
    expect(bought.plan.economy.coinPurchases?.map(row => row.receiptId)).toEqual(["r1"]);
  });

  it("refuses when she is short and says how short", () => {
    const short = purchaseWithCoins(rich(10), { receiptId: "r1", offer: { kind: "game_play", itemId: "game:asteroid", trial: true }, nowIso: at });
    expect(short).toEqual({ ok: false, reason: "not_enough_coins", price: PRICE_LIST.gamePlay, balance: 10 });
  });

  it("pays once for a double tap", () => {
    const first = purchaseWithCoins(rich(100), { receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 }, nowIso: at });
    if (!first.ok) throw Error("expected purchase");
    const again = purchaseWithCoins(first.plan, { receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 }, nowIso: at });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    if (!again.ok) throw Error("expected purchase");
    expect(again.plan.economy.coins).toBe(first.plan.economy.coins);
  });

  it("plays only games she has unlocked, unless it is a trial offer", () => {
    expect(purchaseWithCoins(rich(100), { receiptId: "r1", offer: { kind: "game_play", itemId: "game:asteroid" }, nowIso: at })).toMatchObject({ ok: false, reason: "not_owned" });
    expect(purchaseWithCoins(rich(100), { receiptId: "r2", offer: { kind: "game_play", itemId: "game:asteroid", trial: true }, nowIso: at })).toMatchObject({ ok: true });
  });

  it("buys an outfit into her collection at its catalog price, once", () => {
    const crown = REWARD_CATALOG.find(item => item.id === "outfit:royal-crown")!;
    const bought = purchaseWithCoins(rich(100), { receiptId: "r1", offer: { kind: "outfit", itemId: crown.id }, nowIso: at });
    if (!bought.ok) throw Error("expected purchase");
    expect(bought.price).toBe(crown.price);
    expect(bought.plan.inventory.rewards).toEqual([crown.id]);
    expect(purchaseWithCoins(bought.plan, { receiptId: "r2", offer: { kind: "outfit", itemId: crown.id }, nowIso: at })).toMatchObject({ ok: false, reason: "already_owned" });
  });
});

// Owner, 2026-11-07: the call is earned at the end of a board and burns time; when time runs out she
// spends coins for more, so she wants to come back and earn again. The server owns the clock.
describe("call clock", () => {
  const at = "2026-11-07T22:00:00.000Z";
  const earned = () => grantVideoCallTicket(createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" }), "hw-1", at).plan;

  it("opening an earned call adds the free minutes once", () => {
    const opened = markVideoCallTicketOpened(earned(), "hw-1", at);
    expect(opened.plan.economy.callMinutes).toBe(CALL_RULES.freeMinutesPerBoard);
    const again = markVideoCallTicketOpened(opened.plan, "hw-1", at);
    expect(again.plan.economy.callMinutes).toBe(CALL_RULES.freeMinutesPerBoard);
  });

  it("spends one minute per receipt, once, and stops at zero", () => {
    const start = { ...earned(), economy: { ...earned().economy, callMinutes: 2 } };
    const first = spendCallMinute(start, { receiptId: "m1", nowIso: at });
    expect(first).toMatchObject({ ok: true, minutesLeft: 1, duplicate: false });
    if (!first.ok) throw Error("expected a minute");
    expect(spendCallMinute(first.plan, { receiptId: "m1", nowIso: at })).toMatchObject({ ok: true, minutesLeft: 1, duplicate: true });
    const second = spendCallMinute(first.plan, { receiptId: "m2", nowIso: at });
    if (!second.ok) throw Error("expected a minute");
    expect(second.minutesLeft).toBe(0);
    expect(spendCallMinute(second.plan, { receiptId: "m3", nowIso: at })).toEqual({ ok: false, reason: "no_minutes" });
  });
});

// Owner, 2026-11-07, after Ila's session: every chest is a surprise. Each chest rolls its rarity (a stop's kind is
// only the floor) and its coins within that rarity's range, so no two openings feel the same. Rewards never pick
// a learning step; they only follow one.
describe("variable chests", () => {
  const at2 = "2026-11-08T12:00:00.000Z";
  const grant = (kind: "common" | "rare" | "epic" | "legendary", values: number[]) =>
    grantNodeChest(plan(), { homeworkId: "hw", nodeId: `n-${values.join("-")}`, kind, nowIso: at2, roll: () => values.shift() ?? 0.99 }).chest;

  it("rolls a practice chest's rarity from the odds table, with coins inside that rarity's range", () => {
    expect(grant("common", [0.1, 0, 0.99]).rarity).toBe("common");
    expect(grant("common", [0.8, 0, 0.99]).rarity).toBe("rare");
    expect(grant("common", [0.95, 0, 0.99]).rarity).toBe("epic");
    expect(grant("common", [0.999, 0, 0.99]).rarity).toBe("legendary");
    for (const rarity of ["common", "rare", "epic", "legendary"] as const) {
      const [min, max] = CHEST_TABLE[rarity].coinRange;
      expect(min).toBeLessThan(max);
    }
    const low = grant("common", [0.1, 0, 0.99]);
    const high = grant("common", [0.1, 0.9999, 0.99]);
    expect(low.coins).toBe(CHEST_TABLE.common.coinRange[0]);
    expect(high.coins).toBe(CHEST_TABLE.common.coinRange[1]);
  });

  it("never rolls below a stop's floor", () => {
    expect(grant("rare", [0.1, 0, 0.99]).rarity).toBe("rare");
    expect(grant("epic", [0.1, 0, 0.99]).rarity).toBe("epic");
    expect(grant("epic", [0.999, 0, 0.99]).rarity).toBe("legendary");
  });

  it("keeps a practice chest worth about the same on average", () => {
    let total = 0;
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 4000; i += 1) {
      total += grantNodeChest(plan(), { homeworkId: "hw", nodeId: `avg-${i}`, kind: "common", nowIso: at2, roll: random }).chest.coins;
    }
    expect(total / 4000).toBeGreaterThan(9);
    expect(total / 4000).toBeLessThan(15);
  });
});

// Owner, 2026-11-07: "at the end of the board they can use FaceTime." Every completed board earns a call, not only
// the first board of a list; opening a call uses the newest unopened ticket and adds its free minutes.
describe("a call after every completed board", () => {
  const at3 = "2026-11-08T13:00:00.000Z";
  it("grants one ticket per board, never twice for the same board", () => {
    let current = createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" });
    current = grantVideoCallTicket(current, "hw-1", at3, undefined, "hw-1:board:2").plan;
    const again = grantVideoCallTicket(current, "hw-1", at3, undefined, "hw-1:board:2");
    expect(again.granted).toBe(false);
    const next = grantVideoCallTicket(again.plan, "hw-1", at3, undefined, "hw-1:board:3");
    expect(next.granted).toBe(true);
    expect(next.plan.economy.videoCallTickets?.map(ticket => ticket.boardId)).toEqual(["hw-1:board:2", "hw-1:board:3"]);
  });

  it("opens each board's call once, adding free minutes each time", () => {
    let current = createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" });
    current = grantVideoCallTicket(current, "hw-1", at3, undefined, "hw-1:board:2").plan;
    current = markVideoCallTicketOpened(current, "hw-1", at3).plan;
    expect(current.economy.callMinutes).toBe(CALL_RULES.freeMinutesPerBoard);
    current = grantVideoCallTicket(current, "hw-1", at3, undefined, "hw-1:board:3").plan;
    const second = markVideoCallTicketOpened(current, "hw-1", at3);
    expect(second.alreadyOpened).toBe(false);
    expect(second.plan.economy.callMinutes).toBe(2 * CALL_RULES.freeMinutesPerBoard);
    expect(markVideoCallTicketOpened(second.plan, "hw-1", at3).alreadyOpened).toBe(true);
  });
});
