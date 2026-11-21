import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropic = vi.hoisted(() => ({
  createCalls: [] as Array<Record<string, unknown>>,
  streamCalls: [] as Array<Record<string, unknown>>,
  nextContent: [] as unknown[][],
}));

function nextContent(): unknown[] {
  return anthropic.nextContent.shift() ?? [{ type: "text", text: "Hi Ila!" }];
}

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: async (params: Record<string, unknown>) => {
        anthropic.createCalls.push(params);
        return { content: nextContent() };
      },
      stream: (params: Record<string, unknown>) => {
        anthropic.streamCalls.push(params);
        const content = nextContent();
        const handlers: Record<string, Array<(arg: string) => void>> = {};
        return {
          on(event: string, cb: (arg: string) => void) {
            (handlers[event] ??= []).push(cb);
            return this;
          },
          async finalMessage() {
            for (const block of content as Array<{ type: string; text?: string }>) {
              if (block.type === "text" && block.text) for (const cb of handlers.text ?? []) cb(block.text);
            }
            return { content };
          },
        };
      },
    },
  })),
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: vi.fn().mockImplementation(() => ({
    textToSpeech: { convert: vi.fn(async () => Buffer.from("mp3-bytes")) },
  })),
}));

vi.mock("./companionTalkStream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./companionTalkStream")>();
  const createFake: typeof actual.createElevenLabsPcmSpeaker = () => ({
    connect: async () => {},
    sendText: () => {},
    finish: async () => {},
    stop: () => {},
  });
  return { ...actual, createElevenLabsPcmSpeaker: createFake };
});

import { setupRoutes } from "./routes";
import {
  maybeCompactCompanionInteractionMemory,
  readCompanionCareMemoryForPrompt,
} from "./companionInteractionMemory";

// Human-caught 2026-11-10 ~7:26pm, Ila's FaceTime call with Hikari: "So you are aerospace princess, right?" and
// Hikari answered "I'm actually Hikari… not quite a princess" three times. Why the human caught it: Ila was playing,
// giving her friend a role, and heard her friend argue with her. Why the logs did not: the ledger kept her words as
// ordinary questionText; nothing records a name or role the child gives, so the next call starts over. Why the lab
// missed it: no test had the child shape her companion; the companion had no way to keep what she was called.
// Invariant: the companion can record a nickname or role she gives it (a tool, the companion decides when), it is a
// fact in that companion+child memory, every later turn and call sees it, and a summary can never erase it.
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function seedIla(root: string): void {
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
    sessionStats: { totalSessions: 0, totalWordsMastered: 0, currentStreak: 0 },
    moodHistory: [],
    companionCurrency: 0,
  });
}

const rememberRole = {
  type: "tool_use",
  id: "tu_name",
  name: "rememberWhatChildCallsMe",
  input: { name: "aerospace princess", kind: "role", childWords: "So you are aerospace princess, right?" },
};

function systemOf(params: Record<string, unknown> | undefined): string {
  const system = params?.system;
  if (typeof system === "string") return system;
  return (system as Array<{ text: string }> | undefined)?.map((block) => block.text).join("\n") ?? "";
}

function toolNamesOf(params: Record<string, unknown> | undefined): string[] {
  return ((params?.tools as Array<{ name: string }> | undefined) ?? []).map((tool) => tool.name);
}

describe("the child can name or shape her companion", () => {
  const servers: Array<{ close: () => void }> = [];
  const roots: string[] = [];
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    anthropic.createCalls.length = 0;
    anthropic.streamCalls.length = 0;
    anthropic.nextContent.length = 0;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-child-given-name-"));
    roots.push(root);
    seedIla(root);
    process.chdir(root);
  });

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    process.chdir(originalCwd);
    for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  async function post(route: "talk" | "talk/stream", question: string) {
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/companions/hikari/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        childId: "ila",
        question,
        mode: "video_call",
        showroomTheme: "sky",
        callSource: "game_reward",
        relationshipState: "earned_reward",
        conversationIntent: "social",
      }),
    });
    await res.text();
    return res.status;
  }

  it("the companion can record a role she gives it, and the next call honors it", async () => {
    anthropic.nextContent.push([{ type: "text", text: "Yes! Your aerospace princess, reporting for duty!" }, rememberRole]);
    expect(await post("talk", "So you are aerospace princess, right?")).toBe(200);
    expect(toolNamesOf(anthropic.createCalls[0])).toContain("rememberWhatChildCallsMe");

    expect(readCompanionCareMemoryForPrompt("ila", "hikari")?.childGivenNames).toEqual([
      expect.objectContaining({ name: "aerospace princess", kind: "role" }),
    ]);

    // A later call, a fresh server: the prompt carries what she calls her companion.
    expect(await post("talk", "Hi again!")).toBe(200);
    const later = systemOf(anthropic.createCalls[anthropic.createCalls.length - 1]);
    expect(later).toContain("aerospace princess");
  });

  it("the streaming FaceTime route offers and records it too", async () => {
    anthropic.nextContent.push([{ type: "text", text: "Aerospace princess, ready!" }, rememberRole]);
    expect(await post("talk/stream", "So you are aerospace princess, right?")).toBe(200);
    expect(toolNamesOf(anthropic.streamCalls[0])).toContain("rememberWhatChildCallsMe");
    expect(readCompanionCareMemoryForPrompt("ila", "hikari")?.childGivenNames?.[0]?.name).toBe("aerospace princess");
  });

  it("a memory summary never erases what she calls her companion", async () => {
    anthropic.nextContent.push([{ type: "text", text: "Aerospace princess, ready!" }, rememberRole]);
    await post("talk", "So you are aerospace princess, right?");
    await maybeCompactCompanionInteractionMemory(
      { childId: "ila", companionId: "hikari" },
      {
        minEvents: 1,
        summarize: async () => ({
          lastSessionSummary: "They talked about space.",
          lastEmotionalMoment: "Ila laughed.",
          relationshipFacts: [],
          favoriteMoments: [],
          childGivenNames: [],
        } as never),
      },
    );
    expect(readCompanionCareMemoryForPrompt("ila", "hikari")?.childGivenNames?.[0]?.name).toBe("aerospace princess");
  });
});
