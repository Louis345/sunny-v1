import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, expect, it } from "vitest";
import { getChildChart } from "../profiles/childChart";
import { loadCompanionCarePlanForChart, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import { companionPaceFor, setCompanionPaceForChild } from "./currencyAward";

// Reina, 2026-11-25: "Matilda is speaking too fast, and I do not know what you are saying." Matilda slowed herself to
// 0.85, but the pace lasted one game; the next game, and the next day, started at normal pace again. Why the human
// caught it: she had to ask again. Why logs did not: [companion-speech] [rate] [configured] logged a success each
// time. Why the lab missed it: no lab session spanned two games. Rule: the pace her companion chooses for its own
// talking is saved for her and starts every later game and session; a word a game plays keeps its own pace.

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

it("saves the pace her companion chose and reads it back next time", () => {
  const rootDir = rootOwning([]);
  expect(companionPaceFor("reina", { rootDir })).toBe(1);
  setCompanionPaceForChild("reina", 0.85, { rootDir });
  expect(companionPaceFor("reina", { rootDir })).toBe(0.85);
});

it("never saves a pace outside the voice's range", () => {
  const rootDir = rootOwning([]);
  setCompanionPaceForChild("reina", 3, { rootDir });
  expect(companionPaceFor("reina", { rootDir })).toBe(1);
});
