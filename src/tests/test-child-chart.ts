import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyWordBank } from "../context/schemas/wordBank";
import { getChildChart } from "../profiles/childChart";
import { initializeLearningProfile } from "../utils/learningProfileIO";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-child-chart-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

describe("getChildChart", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("assembles Reina's chart from the child_profile cover sheet and attached records", () => {
    const chart = getChildChart("reina");

    expect(chart.childId).toBe("reina");
    expect(chart.identity.displayName).toBe("Reina");
    expect(chart.identity.ttsName).toBe("Ray-nah");
    expect(chart.companion.presetId).toBe("matilda");
    expect(chart.learningProfile.childId).toBe("reina");
    expect(chart.wordBankSummary.totalWords).toBeGreaterThanOrEqual(0);
    expect(chart.attention.currentWindow_ms).toBeGreaterThan(0);
    expect(chart.economy.coinBalance).toBeGreaterThanOrEqual(0);
    expect(chart.links.learningProfile).toContain("learning_profile.json");
    expect(chart.links.wordBank).toContain("word_bank.json");
    expect(chart.links.carePlans).toContain("care_plans");
    expect(chart.links.vitals).toContain("vitals");
  });

  it("falls back safely when child_profile.json is missing", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "fallbackkid";
    const profile = initializeLearningProfile({
      childId,
      age: 7,
      grade: 1,
      diagnoses: [],
      learningGoals: [],
    });
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.childId).toBe(childId);
    expect(chart.manifestSource).toBe("fallback");
    expect(chart.identity.displayName).toBe("Fallbackkid");
    expect(chart.identity.ttsName).toBe("Fallbackkid");
    expect(chart.demographics.age).toBe(7);
    expect(chart.links.learningProfile).toContain("learning_profile.json");
  });

  it("uses the configured default companion instead of child-name fallback branches", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "newchild";
    const profile = initializeLearningProfile({
      childId,
      age: 7,
      grade: 1,
      diagnoses: [],
      learningGoals: [],
    });
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));
    writeJson(root, "children.config.json", {
      defaultCompanionId: "matilda",
      childCompanionIds: {},
      companions: {
        matilda: {
          id: "matilda",
          vrmUrl: "/companions/matilda.vrm",
          expressions: {
            idle: "neutral",
            happy: "happy",
            thinking: "lookDown",
            celebrating: "happy",
            concerned: "sad",
            winking: "blinkLeft",
            surprised: "surprised",
            angry: "angry",
            blink: "blink",
          },
          faceCamera: {
            position: [0, 1.4, 0.8],
            target: [0, 1.4, 0],
          },
          dopamineGames: ["space-frogger"],
        },
      },
    });

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.companion.presetId).toBe("matilda");
  });

  it("falls back to a neutral default companion when no child config exists", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = initializeLearningProfile({
      childId,
      age: 7,
      grade: 1,
      diagnoses: [],
      learningGoals: [],
    });
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.companion.presetId).toBe("elli");
  });

  it("uses chart identity ahead of legacy child config when a cover sheet exists", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "chartkid";
    const profile = initializeLearningProfile({
      childId,
      age: 9,
      grade: 3,
      diagnoses: [],
      learningGoals: [],
    });
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, createEmptyWordBank(childId));
    writeJson(root, `src/context/${childId}/child_profile.json`, {
      childId,
      identity: {
        displayName: "Chart Kid",
        ttsName: "Chartie",
        avatarImagePath: "/characters/chart-kid.png",
      },
      demographics: {
        age: 9,
        grade: 3,
        diagnoses: [],
        iepActive: false,
      },
      companion: {
        companionId: "elli",
      },
      economy: {
        coinBalance: 42,
      },
      links: {
        learningProfile: "learning_profile.json",
        wordBank: "word_bank.json",
        homework: "homework/",
        attempts: "attempts/",
        vitals: "vitals/",
        carePlans: "care_plans/",
      },
    });

    const chart = getChildChart(childId, { rootDir: root });

    expect(chart.manifestSource).toBe("manifest");
    expect(chart.identity.ttsName).toBe("Chartie");
    expect(chart.identity.avatarImagePath).toBe("/characters/chart-kid.png");
    expect(chart.companion.presetId).toBe("elli");
    expect(chart.economy.coinBalance).toBe(42);
  });
});
