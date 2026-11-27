import { describe, expect, it } from "vitest";
import {
  createStarterCompanionCarePlan,
  grantNodeChest,
  grantVideoCallTicket,
  markVideoCallTicketOpened,
  purchaseWithCoins,
  spendCallMinute,
} from "./companionCareEngine";
import { CALL_TIME_LOOT, PRICE_LIST } from "../shared/rewardCatalog";

// Bug 2026-11-10 (Ila's session): FaceTime minutes piled up into long calls. Each board added 5 free minutes
// (CALL_RULES.freeMinutesPerBoard) and unspent minutes carried over, so she had two 10-minute calls: about 20 minutes
// of FaceTime against about 17 minutes of learning.
// Why the human caught it: the owner timed the calls against the learning and saw the ratio flip.
// Why the logs did not: `[rewards] [call-minute] [spent]` logged each minute as a correct spend; nothing compared the
// time earned with the time learned, and carry-over is not an error.
// Why the lab missed it: lab scenarios open one call per fresh plan, so the carry-over from board to board never built up.
// Owner decision: no cap, no daily limit; call time is small rolled loot (10-20 s common, a full minute rare/epic),
// in one tunable table, counted in seconds.

const at = "2026-11-10T12:00:00.000Z";
const plan = () => createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli" });
/** Chest rolls in order: rarity, coins, bonus, [item share, item pick when lucky], then call time last. */
const rolls = (...values: number[]) => () => values.shift() ?? 0.99;

describe("call time is rolled loot in seconds", () => {
  it("keeps odds and amounts in one table: 10-20 s common drops and a rare full minute", () => {
    const rows = [...CALL_TIME_LOOT];
    expect(rows.at(-1)?.below).toBe(Infinity);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i]!.below).toBeGreaterThan(rows[i - 1]!.below);
    const commons = rows.filter(row => row.tier === "common");
    expect(commons.length).toBeGreaterThan(0);
    for (const row of commons) { expect(row.seconds).toBeGreaterThanOrEqual(10); expect(row.seconds).toBeLessThanOrEqual(20); }
    const big = rows.filter(row => row.seconds >= 60);
    expect(big.length).toBeGreaterThan(0);
    for (const row of big) expect(["rare", "epic"]).toContain(row.tier);
    // The full minute is rare: well under a quarter of stops.
    let previous = 0;
    let bigChance = 0;
    for (const row of rows) { const share = Math.min(1, row.below) - previous; if (row.seconds >= 60) bigChance += share; previous = Math.min(1, row.below); }
    expect(bigChance).toBeGreaterThan(0);
    expect(bigChance).toBeLessThan(0.25);
  });

  it("every finished stop's chest pays a little call time, never whole free minutes", () => {
    const opened = grantNodeChest(plan(), { homeworkId: "hw", nodeId: "n1", kind: "common", nowIso: at, roll: rolls(0.1, 0, 0.99, 0) });
    expect(opened.chest.callSeconds).toBe(CALL_TIME_LOOT[0]!.seconds);
    expect(opened.plan.economy.callSeconds).toBe(CALL_TIME_LOOT[0]!.seconds);
    expect(opened.plan.economy.callMinutes ?? 0).toBe(0);
    const jackpot = grantNodeChest(opened.plan, { homeworkId: "hw", nodeId: "n2", kind: "common", nowIso: at, roll: rolls(0.1, 0, 0.99, 0.9999) });
    expect(jackpot.chest.callSeconds).toBe(CALL_TIME_LOOT.at(-1)!.seconds);
    expect(jackpot.plan.economy.callSeconds).toBe(CALL_TIME_LOOT[0]!.seconds + CALL_TIME_LOOT.at(-1)!.seconds);
  });

  it("a lucky chest's bonus is an item, never a pile of call minutes", () => {
    // lucky (0), item share 0.9 (not an item) -> no bonus, and the pity counter keeps counting.
    const opened = grantNodeChest(plan(), { homeworkId: "hw", nodeId: "n1", kind: "common", nowIso: at, roll: rolls(0.1, 0, 0, 0.9, 0) });
    expect(opened.chest.bonus).toBeUndefined();
    expect(opened.plan.economy.chestsSinceBonus).toBe(1);
    expect(opened.plan.economy.callSeconds).toBe(CALL_TIME_LOOT[0]!.seconds);
  });

  it("opening a board's call adds no free minutes, so time cannot pile up from board to board", () => {
    const earned = grantVideoCallTicket(plan(), "hw-1", at, undefined, "hw-1:board:2").plan;
    const opened = markVideoCallTicketOpened(earned, "hw-1", at);
    expect(opened.ok).toBe(true);
    expect(opened.plan.economy.callSeconds ?? 0).toBe(0);
    expect(opened.plan.economy.callMinutes ?? 0).toBe(0);
  });

  it("the call meter pays in seconds: up to a minute per receipt, the remainder exactly, once per receipt", () => {
    const start = { ...plan(), economy: { ...plan().economy, callSeconds: 75 } };
    const first = spendCallMinute(start, { receiptId: "c1", nowIso: at });
    expect(first).toMatchObject({ ok: true, secondsGranted: 60, secondsLeft: 15, duplicate: false });
    if (!first.ok) throw Error("expected time");
    expect(spendCallMinute(first.plan, { receiptId: "c1", nowIso: at })).toMatchObject({ ok: true, secondsGranted: 60, secondsLeft: 15, duplicate: true });
    const second = spendCallMinute(first.plan, { receiptId: "c2", nowIso: at });
    expect(second).toMatchObject({ ok: true, secondsGranted: 15, secondsLeft: 0 });
    if (!second.ok) throw Error("expected time");
    expect(spendCallMinute(second.plan, { receiptId: "c3", nowIso: at })).toEqual({ ok: false, reason: "no_minutes" });
  });

  it("reads saved legacy call minutes as seconds", () => {
    const legacy = { ...plan(), economy: { ...plan().economy, callMinutes: 2 } };
    const spent = spendCallMinute(legacy, { receiptId: "c1", nowIso: at });
    expect(spent).toMatchObject({ ok: true, secondsGranted: 60, secondsLeft: 60 });
    if (!spent.ok) throw Error("expected time");
    expect(spent.plan.economy.callSeconds).toBe(60);
    expect(spent.plan.economy.callMinutes ?? 0).toBe(0);
  });

  it("buying call time with coins adds seconds", () => {
    const rich = { ...plan(), economy: { ...plan().economy, coins: 100 } };
    const bought = purchaseWithCoins(rich, { receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 }, nowIso: at });
    if (!bought.ok) throw Error("expected purchase");
    expect(bought.price).toBe(PRICE_LIST.callMinutes5);
    expect(bought.plan.economy.callSeconds).toBe(300);
  });
});
