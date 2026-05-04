import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { getChildChart } from "../profiles/childChart";
import { loadCompanionCarePlanForChart } from "../profiles/companionCarePlan";
import { reconcileCompanionCareCurrencyAward } from "./currencyAward";

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
