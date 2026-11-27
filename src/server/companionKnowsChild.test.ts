import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicCreate = vi.hoisted(() =>
  vi.fn(async (_request: Record<string, unknown>) => ({
    content: [{ type: "text", text: "Hi Ila, so good to see you!" }],
  })),
);

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: anthropicCreate },
  })),
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: vi.fn().mockImplementation(() => ({
    textToSpeech: { convert: vi.fn(async () => Buffer.from("mp3-bytes")) },
  })),
}));

import { setupRoutes } from "./routes";
import { getChildChart } from "../profiles/childChart";
import { loadCompanionCarePlanForChart } from "../profiles/companionCarePlan";
import {
  maybeCompactCompanionInteractionMemory,
  readCompanionCareMemoryForPrompt,
} from "./companionInteractionMemory";

// Human-caught 2026-11-10 ~7:26pm: Ila won a FaceTime call with Hikari (callSource game_reward) and Hikari opened
// with "What's your name?". Why the human caught it: Ila heard a friend she had just earned treat her like a
// stranger. Why the logs half-caught it: `[companion-memory] [compact_skip] [missing_care_plan] child=ila
// companion=hikari` was printed, but as a routine skip, not a failure — nothing said the call ran with no facts
// about the child. Why the lab missed it: every companion-talk test used Elli, who already has a care plan for
// Ila; no test called a companion that had never met the child. Invariant: any companion she calls knows her
// chart facts and gets a relationship memory on first contact.
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function seedIlaChart(root: string): void {
  writeJson(path.join(root, "children.config.json"), {
    defaultCompanionId: "elli",
    childCompanionIds: { ila: "elli" },
    childProfiles: { ila: { ttsName: "EYE-lah" } },
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
  writeJson(path.join(root, "src/context/ila/learning_profile.json"), {
    demographics: { age: 8, grade: 3, diagnoses: [], learningStyle: "mixed", attentionSpan: "moderate", iepActive: false },
    rewardPreferences: { favoriteGames: ["tic tac toe"] },
    sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
    moodHistory: [],
    companionCurrency: 10,
  });
  fs.writeFileSync(
    path.join(root, "src/context/ila/soul.md"),
    "# Ila\n\n## Favorite Things\n\n- Food: French toast with syrup\n- Shows: Doraemon\n\n## Her Brain\n\nprivate clinical notes\n",
  );
}

describe("every companion knows the child", () => {
  const servers: Array<{ close: () => void }> = [];
  const roots: string[] = [];
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  let root = "";

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-companion-knows-child-"));
    roots.push(root);
    seedIlaChart(root);
    process.chdir(root);
  });

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    process.chdir(originalCwd);
    for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  async function talkTo(companionId: string, question: string) {
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/companions/${companionId}/talk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        childId: "ila",
        question,
        mode: "video_call",
        showroomTheme: "crystal",
        callSource: "game_reward",
        relationshipState: "earned_reward",
        conversationIntent: "social",
      }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  function systemPromptOf(callIndex: number): string {
    const request = anthropicCreate.mock.calls[callIndex]?.[0] as { system?: unknown } | undefined;
    const system = request?.system;
    if (typeof system === "string") return system;
    return (system as Array<{ text: string }> | undefined)?.map((block) => block.text).join("\n") ?? "";
  }

  it("a companion that has never met her gets her chart facts and a relationship memory", async () => {
    expect(fs.existsSync(path.join(root, "src/context/ila/companion_care/hikari.json"))).toBe(false);

    const result = await talkTo("hikari", "Hi!");
    expect(result.status).toBe(200);

    const system = systemPromptOf(0);
    expect(system).toContain("Ila");
    expect(system).toContain("EYE-lah");
    expect(system).toMatch(/age 8/i);
    expect(system).toMatch(/grade 3/i);
    expect(system).toContain("French toast");
    expect(system).toContain("tic tac toe");
    // Clinical notes stay out of a FaceTime friend's prompt.
    expect(system).not.toContain("private clinical notes");

    const memory = readCompanionCareMemoryForPrompt("ila", "hikari");
    expect(memory?.firstMetAt).toBeTruthy();
  });

  it("compaction builds memory for a first-contact companion instead of skipping it", async () => {
    await talkTo("hikari", "Hi!");
    const summarize = vi.fn(async () => ({
      lastSessionSummary: "Ila and Hikari said hello.",
      lastEmotionalMoment: "Ila was excited.",
      relationshipFacts: ["Ila loves French toast"],
      favoriteMoments: [],
    }));
    const compacted = await maybeCompactCompanionInteractionMemory(
      { childId: "ila", companionId: "hikari" },
      { summarize, minEvents: 1 },
    );
    expect(compacted.compacted).toBe(true);
    expect(readCompanionCareMemoryForPrompt("ila", "hikari")?.relationshipFacts).toEqual(["Ila loves French toast"]);
  });

  it("if she later makes that companion her own, its care plan starts with the memory it already has", async () => {
    await talkTo("hikari", "Hi!");
    const chart = getChildChart("ila", { rootDir: root });
    const loaded = loadCompanionCarePlanForChart(
      { ...chart, companion: { presetId: "hikari" } },
      { persistOnCreate: false },
    );
    expect(loaded.created).toBe(true);
    expect(loaded.plan.memory.firstMetAt).toBe(readCompanionCareMemoryForPrompt("ila", "hikari")?.firstMetAt);
  });
});
