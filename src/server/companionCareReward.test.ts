import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import { getChildChart } from "../profiles/childChart";
import { loadCompanionCarePlanForChart } from "../profiles/companionCarePlan";
import { awardSpellingCompletionApple } from "./companionCareReward";

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function setupRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-care-reward-"));
  writeJson(path.join(rootDir, "children.config.json"), {
    defaultCompanionId: "elli",
    childCompanionIds: { "demo-pashley": "elli" },
    childProfiles: {},
    companions: {
      elli: {
        name: "Elli",
        vrmUrl: "/companions/elli.vrm",
        expressions: {},
        faceCamera: { position: [0, 1.4, 0.8], target: [0, 1.4, 0] },
        dopamineGames: [],
      },
    },
  });
  writeJson(path.join(rootDir, "src/context/demo-pashley/learning_profile.json"), {
    demographics: {
      age: 9,
      grade: "3",
      dyslexia: false,
      adhd: false,
      languages: ["en"],
    },
    name: "Demo Pashley",
    interests: [],
    goals: [],
    sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
    moodHistory: [],
  });
  return rootDir;
}

function cycle(states: Array<"ready" | "completed">, domain = "spelling"): LearningCycleRecordV2 {
  return {
    homeworkId: "hw-spelling-demo",
    childId: "demo-pashley",
    domain,
    nodes: states.map((state, index) => ({
      nodeId: `baseline-${index + 1}`,
      role: "baseline",
      state,
    })),
  } as LearningCycleRecordV2;
}

function appleQuantity(rootDir: string): number {
  const chart = getChildChart("demo-pashley", { rootDir });
  const loaded = loadCompanionCarePlanForChart(chart, { persistOnCreate: false });
  return loaded.plan.inventory.food.find((item) => item.id === "apple_bite")?.quantity ?? -1;
}

describe("spelling completion companion reward", () => {
  it("does not award for partial completion or a non-spelling assignment", () => {
    const rootDir = setupRoot();
    const initial = appleQuantity(rootDir);

    expect(
      awardSpellingCompletionApple({
        childId: "demo-pashley",
        homeworkId: "hw-spelling-demo",
        cycle: cycle(["completed", "ready"]),
        rootDir,
        persistence: "live",
      }).status,
    ).toBe("not_eligible");
    expect(
      awardSpellingCompletionApple({
        childId: "demo-pashley",
        homeworkId: "hw-spelling-demo",
        cycle: cycle(["completed"], "math"),
        rootDir,
        persistence: "live",
      }).status,
    ).toBe("not_eligible");
    expect(appleQuantity(rootDir)).toBe(initial);
  });

  it("awards exactly one apple after all baseline nodes complete, regardless of accuracy", () => {
    const rootDir = setupRoot();
    const initial = appleQuantity(rootDir);
    const completed = cycle(["completed", "completed"]);

    const first = awardSpellingCompletionApple({
      childId: "demo-pashley",
      homeworkId: "hw-spelling-demo",
      cycle: completed,
      rootDir,
      persistence: "live",
      nowIso: "2026-07-29T12:00:00.000Z",
    });
    const repeated = awardSpellingCompletionApple({
      childId: "demo-pashley",
      homeworkId: "hw-spelling-demo",
      cycle: completed,
      rootDir,
      persistence: "live",
      nowIso: "2026-07-29T12:00:01.000Z",
    });

    expect(first.status).toBe("awarded");
    expect(first.itemId).toBe("apple_bite");
    expect(first.quantity).toBe(1);
    expect(repeated.status).toBe("already_awarded");
    expect(appleQuantity(rootDir)).toBe(initial + 1);
    expect(repeated.companionCare?.inventory.food.find((item) => item.id === "apple_bite")?.quantity).toBe(initial + 1);
  });

  it("never persists preview rewards", () => {
    const rootDir = setupRoot();
    const initial = appleQuantity(rootDir);
    const result = awardSpellingCompletionApple({
      childId: "demo-pashley",
      homeworkId: "hw-spelling-demo",
      cycle: cycle(["completed"]),
      rootDir,
      persistence: "preview",
    });

    expect(result.status).toBe("not_eligible");
    expect(appleQuantity(rootDir)).toBe(initial);
  });
});
