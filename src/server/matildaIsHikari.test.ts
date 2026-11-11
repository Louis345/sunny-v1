import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanionRegistry } from "../prompts/companions/registry";
import { COMPANIONS_BY_CHILD } from "../companions/loader";
import { canonicalCompanionId } from "../shared/companionAliases";
import { getChildChart } from "../profiles/childChart";
import { loadCompanionCarePlanForChart, saveCompanionCarePlan } from "../profiles/companionCarePlan";
import {
  readCompanionCareMemoryForPrompt,
  readCompanionInteractionEvents,
  recordCompanionGameResult,
} from "./companionInteractionMemory";

// Owner decision 2026-11-10: "Matilda is Hikari." FaceTime showed two entries with one angel look; Reina's homework
// companion Matilda and Ila's FaceTime angel Hikari were split ids for one character (commit 0dce7cdd). Why the
// human caught it: both girls see the picker, and two names on one face is obvious on screen. Why the logs did not:
// every log line carried a valid id (companion=matilda or companion=hikari), so each looked correct on its own. Why
// the lab missed it: tests pinned the split ("keeps Matilda's entry as Reina's Matilda") instead of asking whether one
// look had two names. Invariant: one character, one id (hikari); "matilda" is only an alias, so Reina's saved care
// plan, memory, ledger and closet keep working.
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

/** Reina's saved data as it is on the kiosk today: everything keyed by the old id. Temp fixture, never her real files. */
function seedReinaWithLegacyMatilda(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-matilda-is-hikari-"));
  roots.push(root);
  writeJson(path.join(root, "children.config.json"), JSON.parse(fs.readFileSync("children.config.json", "utf8")));
  writeJson(path.join(root, "src/context/reina/child_profile.json"), {
    childId: "reina",
    identity: { displayName: "Reina", ttsName: "Ray-nah" },
    companion: { companionId: "matilda" },
  });
  writeJson(path.join(root, "src/context/reina/learning_profile.json"), {
    demographics: { age: 8, grade: 3, diagnoses: [], learningStyle: "mixed", attentionSpan: "moderate", iepActive: false },
    sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
    moodHistory: [],
    companionCurrency: 0,
  });
  writeJson(path.join(root, "src/context/reina/companion_care/matilda.json"), {
    version: 1,
    childId: "reina",
    companionId: "matilda",
    state: {},
    memory: { firstMetAt: "2026-03-20T00:00:00.000Z", relationshipFacts: ["Reina wrestles on a team"] },
    inventory: { food: [], careItems: [] },
    economy: { coins: 140, storeUnlocks: [] },
    updatedAt: "2026-11-09T00:00:00.000Z",
  });
  fs.mkdirSync(path.join(root, "src/context/reina/companion_interactions"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src/context/reina/companion_interactions/2026-11-08.ndjson"),
    `${JSON.stringify({
      type: "companion_interaction_event",
      version: 1,
      id: "companion_interaction_old",
      childId: "reina",
      companionId: "matilda",
      callSource: "game_reward",
      relationshipState: "earned_reward",
      eventType: "companion_talk_completed",
      questionText: "Can we play chess?",
      companionText: "Always.",
      commandCount: 0,
      visionUsed: false,
      createdAt: "2026-11-08T20:00:00.000Z",
    })}\n`,
  );
  return root;
}

describe("Matilda is Hikari", () => {
  it("has one companion: hikari is in the registry, matilda only resolves to her", () => {
    expect(CompanionRegistry.getAll().map((c) => c.id)).not.toContain("matilda");
    expect(CompanionRegistry.getById("matilda").id).toBe("hikari");
    expect(CompanionRegistry.getById("hikari").defaultFor).toBe("reina");
    expect(canonicalCompanionId(" Matilda ")).toBe("hikari");
    expect(canonicalCompanionId("elli")).toBe("elli");
  });

  it("points Reina at hikari in children.config.json, with no separate matilda preset", () => {
    const config = JSON.parse(fs.readFileSync("children.config.json", "utf8")) as {
      childCompanionIds: Record<string, string>;
      companions: Record<string, { vrmUrl: string }>;
    };
    expect(config.childCompanionIds.reina).toBe("hikari");
    expect(config.companions.matilda).toBeUndefined();
    expect(config.companions.hikari.vrmUrl).toBe(CompanionRegistry.getById("hikari").vrmPath);
  });

  it("names Reina's homework companion Hikari, still wakes to Matilda, and keeps Reina's own voice", () => {
    const reina = COMPANIONS_BY_CHILD.Reina;
    expect(reina.name).toBe("Hikari");
    expect(reina.wakeNames).toEqual(expect.arrayContaining(["Hikari", "Matilda"]));
    // Homework voice is per child (ELEVENLABS_VOICE_ID_REINA, Gigi fallback), not the FaceTime companion voice.
    expect(reina.voiceId).toBe(process.env.ELEVENLABS_VOICE_ID_REINA || "jBpfuIE2acCO8z3wKNLl");
  });

  it("Reina's chart reads her saved Matilda care plan as Hikari's, and saves land under hikari", () => {
    const rootDir = seedReinaWithLegacyMatilda();
    const chart = getChildChart("reina", { rootDir });
    expect(chart.companion.presetId).toBe("hikari");
    expect(chart.economy.coinBalance).toBe(140);
    expect(chart.companionCare.existed).toBe(true);
    expect(chart.companionCare.plan.companionId).toBe("hikari");
    expect(chart.companionCare.plan.memory.relationshipFacts).toEqual(["Reina wrestles on a team"]);

    const loaded = loadCompanionCarePlanForChart(chart);
    saveCompanionCarePlan(chart, loaded.plan);
    const saved = JSON.parse(fs.readFileSync(path.join(rootDir, "src/context/reina/companion_care/hikari.json"), "utf8"));
    expect(saved.economy.coins).toBe(140);
    // The old file stays as it was: a backup, never rewritten.
    expect(JSON.parse(fs.readFileSync(path.join(rootDir, "src/context/reina/companion_care/matilda.json"), "utf8")).companionId).toBe("matilda");
  });

  it("Hikari remembers what Reina did with Matilda: memory and ledger carry over, new rounds count", () => {
    const rootDir = seedReinaWithLegacyMatilda();
    expect(readCompanionCareMemoryForPrompt("reina", "hikari", { rootDir })?.relationshipFacts).toEqual([
      "Reina wrestles on a team",
    ]);
    expect(readCompanionCareMemoryForPrompt("reina", "matilda", { rootDir })?.firstMetAt).toBe("2026-03-20T00:00:00.000Z");
    expect(readCompanionInteractionEvents("reina", "hikari", { rootDir }).map((e) => e.id)).toEqual([
      "companion_interaction_old",
    ]);

    recordCompanionGameResult({ childId: "reina", companionId: "matilda", activityId: "tic_tac_toe", result: "child_win" }, { rootDir });
    const saved = JSON.parse(fs.readFileSync(path.join(rootDir, "src/context/reina/companion_care/hikari.json"), "utf8"));
    expect(saved.companionId).toBe("hikari");
    expect(saved.economy.coins).toBe(140);
    expect(saved.memory.gameRecord.tic_tac_toe.childWins).toBe(1);
    expect(fs.existsSync(path.join(rootDir, "src/context/reina/companion_relationships/hikari.json"))).toBe(false);
  });
});
