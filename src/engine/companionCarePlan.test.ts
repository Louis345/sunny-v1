import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import {
  loadCompanionCarePlanForChart,
  saveCompanionCarePlan,
} from "../profiles/companionCarePlan";

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function minimalProfile(): LearningProfile {
  return {
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
    sessionStats: {
      totalSessions: 0,
      totalWordsMastered: 0,
      currentStreak: 0,
    },
    moodHistory: [],
    tamagotchi: {
      hunger: 0.44,
      happiness: 0.55,
      bond: 0.66,
      intellect: 0.77,
      lastSeenAt: "2026-05-01T00:00:00.000Z",
    },
    companionCurrency: 321,
  } as unknown as LearningProfile;
}

describe("companionCarePlan IO", () => {
  it("getChildChart exposes companion care without creating a live care file", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-care-chart-"));
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
          dopamineGames: ["wheel-of-fortune"],
        },
      },
    });
    writeJson(
      path.join(rootDir, "src/context/reina/learning_profile.json"),
      minimalProfile(),
    );

    const chart = getChildChart("reina", { rootDir });
    const careFile = path.join(rootDir, "src/context/reina/companion_care/matilda.json");

    expect(chart.companionCare).toMatchObject({
      filePath: careFile,
      existed: false,
      plan: {
        childId: "reina",
        companionId: "matilda",
        state: expect.objectContaining({
          hunger: 0.44,
          mood: 0.55,
          bond: 0.66,
          thoughtClarity: 0.77,
        }),
      },
      view: expect.objectContaining({
        childId: "reina",
        companionId: "matilda",
        displayName: "Matilda",
      }),
    });
    expect(fs.existsSync(careFile)).toBe(false);
  });

  it("lazy-creates a named companion care plan from child chart and legacy mirrors", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-care-"));
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
          dopamineGames: ["wheel-of-fortune"],
        },
      },
    });
    writeJson(
      path.join(rootDir, "src/context/reina/learning_profile.json"),
      minimalProfile(),
    );

    const chart = getChildChart("reina", { rootDir });
    const loaded = loadCompanionCarePlanForChart(chart, {
      nowIso: "2026-05-03T00:00:00.000Z",
    });

    expect(loaded.plan.childId).toBe("reina");
    expect(loaded.plan.companionId).toBe("matilda");
    expect(loaded.plan.state.hunger).toBe(0.44);
    expect(loaded.plan.state.mood).toBe(0.55);
    expect(loaded.plan.state.bond).toBe(0.66);
    expect(loaded.plan.state.thoughtClarity).toBe(0.77);
    expect(loaded.plan.economy.coins).toBe(321);
    expect(
      fs.existsSync(
        path.join(rootDir, "src/context/reina/companion_care/matilda.json"),
      ),
    ).toBe(true);
  });

  it("treats companion care plan as truth when legacy mirrors disagree", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-care-"));
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
    writeJson(
      path.join(rootDir, "src/context/reina/learning_profile.json"),
      minimalProfile(),
    );
    const chart = getChildChart("reina", { rootDir });
    const first = loadCompanionCarePlanForChart(chart, {
      nowIso: "2026-05-03T00:00:00.000Z",
    });
    saveCompanionCarePlan(chart, {
      ...first.plan,
      state: { ...first.plan.state, hunger: 0.12 },
      economy: { ...first.plan.economy, coins: 999 },
    });

    const second = loadCompanionCarePlanForChart(chart, {
      nowIso: "2026-05-03T00:00:00.000Z",
    });

    expect(second.plan.state.hunger).toBe(0.12);
    expect(second.plan.economy.coins).toBe(999);
  });
});
