import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CompanionCarePlan } from "../shared/companionCareTypes";
import {
  maybeCompactCompanionInteractionMemory,
  readCompanionInteractionEvents,
  recordCompanionInteractionEvent,
} from "./companionInteractionMemory";

let root: string;

function writeCarePlan(childId: string, companionId: string): void {
  const dir = path.join(root, "src", "context", childId, "companion_care");
  fs.mkdirSync(dir, { recursive: true });
  const plan: CompanionCarePlan = {
    version: 1,
    childId,
    companionId,
    state: {
      hunger: 0.8,
      mood: 0.8,
      bond: 0.4,
      energy: 0.8,
      usefulness: 0.8,
      thoughtClarity: 0.7,
      lastSeenAt: "2026-05-27T12:00:00.000Z",
    },
    memory: {
      firstMetAt: "2026-05-01T12:00:00.000Z",
    },
    inventory: { food: [], careItems: [] },
    economy: { coins: 0, storeUnlocks: [] },
    updatedAt: "2026-05-27T12:00:00.000Z",
  };
  fs.writeFileSync(
    path.join(dir, `${companionId}.json`),
    JSON.stringify(plan, null, 2),
    "utf8",
  );
}

describe("companion interaction memory", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-companion-memory-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("records append-only interaction events without raw screenshot data", () => {
    const result = recordCompanionInteractionEvent(
      {
        childId: "Ila",
        companionId: "Elli",
        callSource: "showroom",
        relationshipState: "previewing",
        eventType: "companion_talk_completed",
        questionText: "Look at this drawing.",
        companionText: "Those colors feel brave.",
        commandCount: 2,
        visionUsed: true,
        visualSnapshot: {
          base64: "raw-image-data-must-not-be-written",
          mimeType: "image/jpeg",
          reason: "look_button",
          capturedAt: 1_765_000_000_000,
          width: 512,
          height: 384,
        },
        createdAt: "2026-05-27T12:05:00.000Z",
      },
      { rootDir: root },
    );

    expect(result.persisted).toBe(true);
    expect(result.record).toMatchObject({
      type: "companion_interaction_event",
      version: 1,
      childId: "ila",
      companionId: "elli",
      callSource: "showroom",
      relationshipState: "previewing",
      visionUsed: true,
      visual: {
        mimeType: "image/jpeg",
        reason: "look_button",
        width: 512,
        height: 384,
      },
    });
    expect(JSON.stringify(result.record)).not.toContain("raw-image-data-must-not-be-written");
    expect(readCompanionInteractionEvents("ila", "elli", { rootDir: root })).toHaveLength(1);

    const fileText = fs.readFileSync(
      path.join(root, "src", "context", "ila", "companion_interactions", "2026-05-27.ndjson"),
      "utf8",
    );
    expect(fileText).not.toContain("raw-image-data-must-not-be-written");
  });

  it("compacts recent events into companion care memory with a fake Haiku provider", async () => {
    writeCarePlan("ila", "elli");
    for (const [idx, questionText] of [
      "Can we talk?",
      "Look at my drawing.",
      "Can you dance?",
    ].entries()) {
      recordCompanionInteractionEvent(
        {
          childId: "ila",
          companionId: "elli",
          callSource: idx === 0 ? "showroom" : "mystery_box",
          relationshipState: idx === 0 ? "previewing" : "earned_reward",
          eventType: "companion_talk_completed",
          questionText,
          companionText: idx === 2 ? "" : "That was a fun moment.",
          commandCount: idx === 2 ? 1 : 0,
          visionUsed: idx === 1,
          createdAt: `2026-05-27T12:0${idx}:00.000Z`,
        },
        { rootDir: root },
      );
    }

    const result = await maybeCompactCompanionInteractionMemory(
      { childId: "ila", companionId: "elli" },
      {
        rootDir: root,
        summarize: async ({ events, existingMemory }) => {
          expect(events).toHaveLength(3);
          expect(existingMemory.firstMetAt).toBe("2026-05-01T12:00:00.000Z");
          return {
            lastSessionSummary:
              "Ila met Elli in the showroom, then earned a playful call after a mystery reward.",
            lastEmotionalMoment: "Ila was proud to show a drawing.",
            reunionLineSeed: "Ask whether Ila wants another brave-color art check.",
            relationshipFacts: ["Ila likes video calls with Elli"],
            favoriteMoments: ["Elli dancing after Ila asked for a move"],
            emotionalTone: "playful, proud, and connected",
          };
        },
      },
    );

    expect(result).toMatchObject({ compacted: true, eventCount: 3 });
    const plan = JSON.parse(
      fs.readFileSync(
        path.join(root, "src", "context", "ila", "companion_care", "elli.json"),
        "utf8",
      ),
    ) as CompanionCarePlan;
    expect(plan.memory).toMatchObject({
      lastSessionSummary:
        "Ila met Elli in the showroom, then earned a playful call after a mystery reward.",
      lastEmotionalMoment: "Ila was proud to show a drawing.",
      reunionLineSeed: "Ask whether Ila wants another brave-color art check.",
      relationshipFacts: ["Ila likes video calls with Elli"],
      favoriteMoments: ["Elli dancing after Ila asked for a move"],
      emotionalTone: "playful, proud, and connected",
      lastCompanionInteractionCompactedAt: "2026-05-27T12:02:00.000Z",
    });
  });

  it("ships a dev inspection script for ledger rows and compacted memory", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../scripts/inspectCompanionInteractions.ts"),
      "utf8",
    );

    expect(source).toContain("readCompanionInteractionEvents");
    expect(source).toContain("readCompanionCareMemoryForPrompt");
    expect(source).toContain("--child=ila --companion=elli");
  });
});
