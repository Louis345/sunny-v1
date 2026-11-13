import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { REWARD_CATALOG } from "../shared/rewardCatalog";
import { getChildChart } from "../profiles/childChart";
import { loadCompanionCarePlanForChart } from "../profiles/companionCarePlan";
import { arcadeClockForChild, callClockForChild, purchaseForChild, spendArcadeMinuteForChild, reconcileCompanionCareCurrencyAward, showroomCallClockFacts, spendCallMinuteForChild, walletForChild } from "./currencyAward";

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function setupRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-care-currency-"));
  writeJson(path.join(rootDir, "children.config.json"), {
    defaultCompanionId: "matilda",
    childCompanionIds: { reina: "matilda" },
    childProfiles: {},
    companions: {
      matilda: {
        name: "Matilda",
        vrmUrl: "/companions/matilda.vrm",
        expressions: {},
        faceCamera: { position: [0, 1.4, 0.8], target: [0, 1.4, 0] },
        dopamineGames: [],
      },
    },
  });
  writeJson(path.join(rootDir, "src/context/reina/learning_profile.json"), {
    demographics: {
      age: 9,
      grade: "3",
      dyslexia: false,
      adhd: false,
      languages: ["en"],
    },
    name: "Reina",
    interests: [],
    goals: [],
    sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
    moodHistory: [],
    companionCurrency: 10,
  });
  return rootDir;
}

describe("companion care currency", () => {
  it("updates source-of-truth care economy and legacy companionCurrency mirror", () => {
    const rootDir = setupRoot();
    const out = reconcileCompanionCareCurrencyAward({
      childId: "reina",
      amount: 25,
      dryRun: false,
      rootDir,
      reason: "node_complete",
    });

    expect(out).toEqual({ ok: true, balance: 35 });
    const chart = getChildChart("reina", { rootDir });
    const care = loadCompanionCarePlanForChart(chart, {
      nowIso: "2026-05-03T00:00:00.000Z",
    });
    expect(care.plan.economy.coins).toBe(35);
    const profile = JSON.parse(
      fs.readFileSync(
        path.join(rootDir, "src/context/reina/learning_profile.json"),
        "utf8",
      ),
    );
    expect(profile.companionCurrency).toBe(35);
  });
});

// Owner, 2026-11-07 (PR #59 ticket 3.2): one coin balance. The companion plan's coins are the truth; the chart
// and the learning profile only read or mirror them, and every purchase charges the plan.
describe("one coin balance", () => {
  function planWithCoins(rootDir: string, coins: number) {
    reconcileCompanionCareCurrencyAward({ childId: "reina", amount: 0, dryRun: false, rootDir, reason: "seed" });
    const chart = getChildChart("reina", { rootDir });
    const file = chart.companionCare.filePath;
    const plan = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...plan, economy: { ...plan.economy, coins } }));
  }

  it("the chart's balance is the companion plan's, not an older copy", () => {
    const rootDir = setupRoot();
    planWithCoins(rootDir, 80);
    expect(getChildChart("reina", { rootDir }).economy.coinBalance).toBe(80);
  });

  it("a purchase charges the companion plan and mirrors the new balance, or refuses when she is short", () => {
    const rootDir = setupRoot();
    planWithCoins(rootDir, 40);
    const bought = purchaseForChild("reina", { receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 } }, { rootDir });
    expect(bought).toMatchObject({ ok: true, balance: 10 });
    const chart = getChildChart("reina", { rootDir });
    expect(chart.companionCare.plan.economy.coins).toBe(10);
    expect(chart.learningProfile.companionCurrency).toBe(10);
    expect(purchaseForChild("reina", { receiptId: "r2", offer: { kind: "call_minutes", minutes: 5 } }, { rootDir })).toMatchObject({ ok: false, reason: "not_enough_coins", balance: 10 });
  });

  // Owner, 2026-11-07: the call clock burns saved minutes; bought minutes land in the same saved count.
  it("the call clock reads and spends her saved minutes, and bought minutes add to them", () => {
    const rootDir = setupRoot();
    planWithCoins(rootDir, 40);
    expect(callClockForChild("reina", { rootDir })).toMatchObject({ minutesLeft: 0, coins: 40, price: 30, minutes: 5 });
    expect(spendCallMinuteForChild("reina", "call:m1", { rootDir })).toMatchObject({ ok: false, reason: "no_minutes", coins: 40 });
    expect(purchaseForChild("reina", { receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 } }, { rootDir })).toMatchObject({ ok: true, balance: 10, callMinutes: 5, callSeconds: 300 });
    expect(spendCallMinuteForChild("reina", "call:m1", { rootDir })).toMatchObject({ ok: true, minutesLeft: 4, secondsLeft: 240, secondsGranted: 60, coins: 10 });
    expect(callClockForChild("reina", { rootDir })).toMatchObject({ minutesLeft: 4 });
  });

  // Owner, 2026-11-08: reward games run on the same meter; 25 coins buys 3 arcade minutes.
  it("the arcade clock reads and spends arcade minutes bought with a game play", () => {
    const rootDir = setupRoot();
    planWithCoins(rootDir, 40);
    expect(arcadeClockForChild("reina", { rootDir })).toMatchObject({ minutesLeft: 0, coins: 40, price: 25, minutes: 3 });
    expect(spendArcadeMinuteForChild("reina", "arcade:g1:1", { rootDir })).toMatchObject({ ok: false, reason: "no_minutes", coins: 40 });
    expect(purchaseForChild("reina", { receiptId: "g1", offer: { kind: "game_play", itemId: "game:asteroid", trial: true } }, { rootDir })).toMatchObject({ ok: true, balance: 15, arcadeMinutes: 3 });
    expect(spendArcadeMinuteForChild("reina", "arcade:g1:1", { rootDir })).toMatchObject({ ok: true, minutesLeft: 2, coins: 15 });
    expect(callClockForChild("reina", { rootDir })).toMatchObject({ minutesLeft: 0 });
  });

  // Owner, 2026-11-07: the outfit shop in the call spends the same coins and shows what she really owns.
  it("the shop wallet is her saved coins and the rewards she owns", () => {
    const rootDir = setupRoot();
    planWithCoins(rootDir, 100);
    expect(walletForChild("reina", { rootDir })).toEqual({ coins: 100, ownedRewardIds: [] });
    purchaseForChild("reina", { receiptId: "r1", offer: { kind: "outfit", itemId: "outfit:cat-ears" } }, { rootDir });
    expect(walletForChild("reina", { rootDir })).toEqual({ coins: 100 - REWARD_CATALOG.find(item => item.id === "outfit:cat-ears")!.price!, ownedRewardIds: ["outfit:cat-ears"] });
  });

  it("gives Elli the saved clock facts, and nothing when the chart cannot be read", () => {
    const rootDir = setupRoot();
    planWithCoins(rootDir, 40);
    expect(showroomCallClockFacts("reina", "time_up", { rootDir })).toEqual({ event: "time_up", minutesLeft: 0, secondsLeft: 0, coins: 40, price: 30, minutes: 5 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(showroomCallClockFacts("reina", "time_up", { rootDir: path.join(rootDir, "missing") })).toBeUndefined();
    error.mockRestore();
  });
});
