import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicCreate = vi.hoisted(() =>
  vi.fn(async (_request: Record<string, unknown>) => ({
    content: [{ type: "text", text: "Hi friend, great move!" }],
  })),
);

const elevenLabsConvert = vi.hoisted(() =>
  vi.fn(async (_voiceId: string, _options: Record<string, unknown>) =>
    Buffer.from("mp3-bytes"),
  ),
);

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: anthropicCreate },
  })),
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: vi.fn().mockImplementation(() => ({
    textToSpeech: { convert: elevenLabsConvert },
  })),
}));

import { setupRoutes } from "./routes";

const GAME_MODEL = "claude-haiku-4-5-20251001";
const SOCIAL_MODEL = "claude-sonnet-4-5";
const FLASH_TTS_MODEL = "eleven_flash_v2_5";

const companionActToolUse = {
  type: "tool_use",
  id: "tu_1",
  name: "companionAct",
  input: { type: "animate", payload: { animation: "wave", loop: false } },
};

function companionMoveReaction(overrides: Record<string, unknown> = {}) {
  return {
    activityId: "tic_tac_toe",
    eventType: "companion_move",
    board: ["X", null, null, null, null, null, null, null, null],
    childMark: "X",
    companionMark: "O",
    turn: "companion",
    plannedMove: 5,
    ...overrides,
  };
}

describe("POST /api/companions/:companionId/talk model + TTS routing", () => {
  const servers: Array<{ close: () => void }> = [];
  const roots: string[] = [];
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_PRONUNCIATION_DICT_ID = "dict_1";
    process.env.ELEVENLABS_PRONUNCIATION_DICT_VERSION = "v_1";
    delete process.env.SUNNY_COMPANION_GAME_MODEL;
    delete process.env.SUNNY_COMPANION_TALK_MODEL;
    delete process.env.SUNNY_VIDEO_CALL_TTS_MODEL;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-companion-talk-route-"));
    roots.push(root);
    process.chdir(root);
  });

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    process.chdir(originalCwd);
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  async function postTalk(body: Record<string, unknown>) {
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/companions/elli/talk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  }

  it("routes activity reactions to the fast game model with flash TTS and no pronunciation locators", async () => {
    const result = await postTalk({
      childId: "ila",
      question: "You are about to place your O on square 5.",
      mode: "video_call",
      showroomTheme: "crystal",
      callSource: "dev_preview",
      relationshipState: "selected",
      conversationIntent: "game",
      activityReaction: companionMoveReaction(),
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(anthropicCreate.mock.calls[0]?.[0]).toMatchObject({ model: GAME_MODEL });
    expect(elevenLabsConvert).toHaveBeenCalledTimes(1);
    const ttsOptions = elevenLabsConvert.mock.calls[0]?.[1] ?? {};
    expect(ttsOptions.modelId).toBe(FLASH_TTS_MODEL);
    expect(ttsOptions.pronunciationDictionaryLocators).toBeUndefined();
  });

  it("keeps social video-call turns on the sonnet model with flash TTS", async () => {
    const result = await postTalk({
      childId: "ila",
      question: "What is your favorite color?",
      mode: "video_call",
      showroomTheme: "crystal",
      callSource: "dev_preview",
      relationshipState: "selected",
      conversationIntent: "social",
    });

    expect(result.status).toBe(200);
    expect(anthropicCreate.mock.calls[0]?.[0]).toMatchObject({ model: SOCIAL_MODEL });
    const ttsOptions = elevenLabsConvert.mock.calls[0]?.[1] ?? {};
    expect(ttsOptions.modelId).toBe(FLASH_TTS_MODEL);
  });

  it("keeps showroom turns on the companion voice model with pronunciation locators", async () => {
    const result = await postTalk({
      childId: "ila",
      question: "Say hello.",
      showroomTheme: "crystal",
    });

    expect(result.status).toBe(200);
    const ttsOptions = elevenLabsConvert.mock.calls[0]?.[1] ?? {};
    expect(ttsOptions.modelId).toBe("eleven_multilingual_v2");
    expect(ttsOptions.pronunciationDictionaryLocators).toEqual([
      { pronunciationDictionaryId: "dict_1", versionId: "v_1" },
    ]);
  });

  it("uses one Claude call when speech and gestures arrive in the same response", async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Center square, mine!" },
        companionActToolUse,
      ],
    } as never);

    const result = await postTalk({
      childId: "ila",
      question: "You are about to place your O on square 5.",
      mode: "video_call",
      showroomTheme: "crystal",
      conversationIntent: "game",
      activityReaction: companionMoveReaction(),
    });

    expect(result.status).toBe(200);
    expect(result.body.text).toBe("Center square, mine!");
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("falls back to a follow-up call when a speech-required reaction returns tool-only content", async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [companionActToolUse],
    } as never);
    anthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Sneaky corner time!" }],
    } as never);

    const result = await postTalk({
      childId: "ila",
      question: "You are about to place your O on square 5.",
      mode: "video_call",
      showroomTheme: "crystal",
      conversationIntent: "game",
      activityReaction: companionMoveReaction(),
    });

    expect(result.status).toBe(200);
    expect(result.body.text).toBe("Sneaky corner time!");
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    expect(anthropicCreate.mock.calls[1]?.[0]).toMatchObject({ model: GAME_MODEL });
  });
});
