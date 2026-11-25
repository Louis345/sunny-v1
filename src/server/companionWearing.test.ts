import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, expect, it } from "vitest";
import { getChildChart } from "../profiles/childChart";
import { loadCompanionCarePlanForChart, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import { setWearingForChild, walletForChild } from "./currencyAward";

// Owner-reported 2026-11-25: "When they change their clothes, they should be wearing their clothes throughout the
// entire experience." Why the human caught it: she dresses Elli in the closet and then sees her in starter clothes in
// a 3D game. Why logs did not: the closet saved the look only in the kiosk browser, and no line said where a room got
// its look. Why the lab missed it: the lab tested the closet, board and call inside one browser, never a room that asks
// the server. Rule now: her chart holds what each companion wears; every room reads the chart.

const tempRoots: string[] = [];
afterAll(() => { for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function rootOwning(rewardIds: string[]): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-wearing-"));
  tempRoots.push(rootDir);
  writeJson(path.join(rootDir, "children.config.json"), {
    defaultCompanionId: "matilda",
    childCompanionIds: { reina: "matilda" },
    childProfiles: {},
    companions: { matilda: { name: "Matilda", vrmUrl: "/companions/matilda.vrm", expressions: {}, faceCamera: { position: [0, 1.4, 0.8], target: [0, 1.4, 0] }, dopamineGames: [] } },
  });
  writeJson(path.join(rootDir, "src/context/reina/learning_profile.json"), {
    demographics: { age: 9, grade: "3", dyslexia: false, adhd: false, languages: ["en"] },
    name: "Reina", interests: [], goals: [], sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 }, moodHistory: [], companionCurrency: 10,
  });
  const chart = getChildChart("reina", { rootDir });
  const { plan } = loadCompanionCarePlanForChart(chart);
  saveCompanionCarePlan(chart, { ...plan, inventory: { ...plan.inventory, rewards: rewardIds } });
  return rootDir;
}

it("saves what she put on her companion to her chart, and every later read gets it (S1, S6)", () => {
  const rootDir = rootOwning(["outfit:comet-hoodie", "outfit:cat-ears"]);
  const saved = setWearingForChild("reina", { companionId: "matilda", outfitItemId: "comet-hoodie", accessoryItemId: "cat-ears" }, { rootDir, nowIso: "2026-11-25T18:00:00.000Z" });
  expect(saved).toEqual({ ok: true });
  // A fresh read from disk, as a restarted kiosk would do.
  expect(walletForChild("reina", { rootDir }).wearing).toEqual({
    matilda: { outfitItemId: "comet-hoodie", accessoryItemId: "cat-ears", changedAt: "2026-11-25T18:00:00.000Z" },
  });
});

it("refuses to put on something she does not own, and leaves her look as it was (F3)", () => {
  const rootDir = rootOwning(["outfit:cat-ears"]);
  setWearingForChild("reina", { companionId: "matilda", accessoryItemId: "cat-ears" }, { rootDir, nowIso: "2026-11-25T18:00:00.000Z" });
  expect(setWearingForChild("reina", { companionId: "matilda", outfitItemId: "comet-hoodie" }, { rootDir })).toEqual({ ok: false, reason: "not_owned" });
  expect(walletForChild("reina", { rootDir }).wearing?.matilda).toEqual({ accessoryItemId: "cat-ears", changedAt: "2026-11-25T18:00:00.000Z" });
});

it("keeps each companion's look her own, and records taking everything off (S9)", () => {
  const rootDir = rootOwning(["outfit:comet-hoodie"]);
  setWearingForChild("reina", { companionId: "elli", outfitItemId: "comet-hoodie" }, { rootDir, nowIso: "2026-11-25T18:00:00.000Z" });
  setWearingForChild("reina", { companionId: "matilda" }, { rootDir, nowIso: "2026-11-25T18:05:00.000Z" });
  const wearing = walletForChild("reina", { rootDir }).wearing ?? {};
  expect(wearing.elli).toEqual({ outfitItemId: "comet-hoodie", changedAt: "2026-11-25T18:00:00.000Z" });
  // Her own clothes is a saved choice, so an old browser look can never come back over it.
  expect(wearing.matilda).toEqual({ changedAt: "2026-11-25T18:05:00.000Z" });
});

it("drops a damaged look entry on load instead of failing her whole plan", () => {
  const rootDir = rootOwning(["outfit:cat-ears"]);
  const chart = getChildChart("reina", { rootDir });
  const { plan } = loadCompanionCarePlanForChart(chart);
  saveCompanionCarePlan(chart, { ...plan, inventory: { ...plan.inventory, wearing: { matilda: { accessoryItemId: "cat-ears", changedAt: "2026-11-25T18:00:00.000Z" }, broken: "x" } } } as never);
  expect(walletForChild("reina", { rootDir }).wearing).toEqual({ matilda: { accessoryItemId: "cat-ears", changedAt: "2026-11-25T18:00:00.000Z" } });
});

it("says when the child chose her companion's look, for the call (S10)", async () => {
  const { lookChosenAt } = await import("./currencyAward");
  const rootDir = rootOwning(["outfit:cat-ears"]);
  setWearingForChild("reina", { companionId: "matilda", accessoryItemId: "cat-ears" }, { rootDir, nowIso: "2026-11-24T15:00:00.000Z" });
  expect(lookChosenAt("reina", "matilda", { rootDir })).toBe("2026-11-24T15:00:00.000Z");
  expect(lookChosenAt("reina", "elli", { rootDir })).toBeUndefined();
});
