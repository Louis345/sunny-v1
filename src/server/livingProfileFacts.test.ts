import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openChart } from "../chart/db";
import { exportEvents } from "../chart/exportEvents";
import { maybeCompactCompanionInteractionMemory, recordCompanionInteractionEvent } from "./companionInteractionMemory";
import { buildCompanionCallContext } from "./companionChildFacts";
import { readLivingProfile } from "./livingProfileFacts";

// 2026-11-11 owner: companions draw her out; what she says about herself grows her profile; every companion knows it.
// Speaker rule (owner, same day): the child who opened the call is the speaker; each fact keeps her exact words; when
// the conversation shows someone else talking, no fact.
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "living-facts-"));
  vi.stubEnv("SUNNY_CHART_DIR", path.join(root, "charts"));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function talk(childId: string, companionId: string, questionText: string, minute: number) {
  recordCompanionInteractionEvent({ childId, companionId, callSource: "showroom", relationshipState: "earned_reward", eventType: "companion_talk_completed",
    questionText, companionText: "Oh no, that sounds like it hurt.", commandCount: 0, visionUsed: false, createdAt: `2026-11-11T22:0${minute}:00.000Z` }, { rootDir: root });
}

it("records only facts whose quote is her own words in the call, from her, and every companion then knows them", async () => {
  talk("lab-reina", "hikari", "I don't like wrestling anymore, I got hurt at practice", 0);
  talk("lab-reina", "hikari", "Daddy here, she also loves sushi", 1);
  await maybeCompactCompanionInteractionMemory({ childId: "lab-reina", companionId: "hikari" }, { rootDir: root, minEvents: 1,
    summarize: async () => ({
      lastSessionSummary: "Reina told Hikari about wrestling.", lastEmotionalMoment: "She got hurt.", relationshipFacts: [], favoriteMoments: [], companionSelfNotes: [],
      childFacts: [
        { topic: "wrestling", kind: "dislike", statement: "Reina doesn't like wrestling anymore; she got hurt at practice.", quote: "I don't like wrestling anymore, I got hurt", speaker: "child" },
        { topic: "sushi", kind: "like", statement: "Reina loves sushi.", quote: "she also loves sushi", speaker: "someone_else" },
        { topic: "ponies", kind: "like", statement: "Reina loves ponies.", quote: "I love ponies so much", speaker: "child" },
      ],
    }) as never });

  const profile = readLivingProfile("lab-reina")!;
  expect(profile.current.map(fact => fact.topic)).toEqual(["wrestling"]);
  expect(profile.current[0]).toMatchObject({ speaker: "caller_child", companionId: "hikari", quote: "I don't like wrestling anymore, I got hurt" });

  // Elli has never talked with her, and still knows.
  const elli = buildCompanionCallContext({ childId: "lab-reina", companionId: "elli" }, { rootDir: root })!;
  expect(elli).toContain("Reina doesn't like wrestling anymore; she got hurt at practice.");
});

it("a summary without facts, or no chart database, changes nothing and still saves the companion's memory", async () => {
  vi.stubEnv("SUNNY_CHART_DIR", "");
  talk("lab-ila", "elli", "I love space", 0);
  const result = await maybeCompactCompanionInteractionMemory({ childId: "lab-ila", companionId: "elli" }, { rootDir: root, minEvents: 1,
    summarize: async () => ({ lastSessionSummary: "Space talk.", lastEmotionalMoment: "Excited.", relationshipFacts: [], favoriteMoments: [], companionSelfNotes: [],
      childFacts: [{ topic: "space", kind: "like", statement: "Ila loves space.", quote: "I love space", speaker: "child" }] }) as never });
  expect(result).toMatchObject({ compacted: true });
  expect(readLivingProfile("lab-ila")).toBeNull();
  vi.stubEnv("SUNNY_CHART_DIR", path.join(root, "charts"));
  const db = openChart("lab-ila"); expect(exportEvents(db)).toHaveLength(0); db.close();
});
