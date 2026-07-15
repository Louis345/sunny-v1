import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeSpeakerRecord = {
  sent: string[];
  finished: boolean;
  stopped: boolean;
};

const anthropicState = vi.hoisted(() => ({
  streamCalls: [] as Array<Record<string, unknown>>,
  createCalls: [] as Array<Record<string, unknown>>,
  textDeltas: ["Hi ", "friend! ", "Let's chat."],
  finalContent: [{ type: "text", text: "Hi friend! Let's chat." }] as unknown[],
}));

const speakerState = vi.hoisted(() => ({
  created: [] as FakeSpeakerRecord[],
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      stream: (params: Record<string, unknown>) => {
        anthropicState.streamCalls.push(params);
        const handlers: Record<string, Array<(arg: string) => void>> = {};
        return {
          on(event: string, cb: (arg: string) => void) {
            (handlers[event] ??= []).push(cb);
            return this;
          },
          async finalMessage() {
            for (const delta of anthropicState.textDeltas) {
              for (const cb of handlers.text ?? []) cb(delta);
            }
            return { content: anthropicState.finalContent };
          },
        };
      },
      create: async (params: Record<string, unknown>) => {
        anthropicState.createCalls.push(params);
        return { content: [{ type: "text", text: "Follow-up line." }] };
      },
    },
  })),
}));

vi.mock("./companionTalkStream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./companionTalkStream")>();
  const createFake: typeof actual.createElevenLabsPcmSpeaker = (opts) => {
    const record: FakeSpeakerRecord = { sent: [], finished: false, stopped: false };
    speakerState.created.push(record);
    return {
      connect: async () => {},
      sendText: (chunk: string) => {
        record.sent.push(chunk);
      },
      finish: async () => {
        record.finished = true;
        opts.onAudioChunk("ZmFrZS1wY20=");
      },
      stop: () => {
        record.stopped = true;
      },
    };
  };
  return { ...actual, createElevenLabsPcmSpeaker: createFake };
});

import { setupRoutes } from "./routes";

type SseFrame = { event: string; data: Record<string, unknown> };

function parseSseFrames(body: string): SseFrame[] {
  return body
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const eventLine = block.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      return {
        event: eventLine?.slice("event: ".length) ?? "",
        data: dataLine
          ? (JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>)
          : {},
      };
    });
}

describe("POST /api/companions/:companionId/talk/stream", () => {
  const servers: Array<{ close: () => void }> = [];
  const roots: string[] = [];
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.TTS_ENABLED = "true";
    delete process.env.SUNNY_COMPANION_TALK_MODEL;
    delete process.env.SUNNY_COMPANION_GAME_MODEL;
    anthropicState.streamCalls.length = 0;
    anthropicState.createCalls.length = 0;
    anthropicState.textDeltas = ["Hi ", "friend! ", "Let's chat."];
    anthropicState.finalContent = [{ type: "text", text: "Hi friend! Let's chat." }];
    speakerState.created.length = 0;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-talk-stream-route-"));
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

  async function postStream(body: Record<string, unknown>) {
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/companions/elli/talk/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return { status: res.status, contentType: res.headers.get("content-type"), body: await res.text() };
  }

  it("streams text deltas, audio chunks, and a done frame with latency spans", async () => {
    const result = await postStream({
      childId: "ila",
      question: "hi elli, how are you?",
      mode: "video_call",
      showroomTheme: "crystal",
      callSource: "dev_preview",
      relationshipState: "selected",
      conversationIntent: "social",
    });

    expect(result.status).toBe(200);
    expect(result.contentType).toContain("text/event-stream");
    const frames = parseSseFrames(result.body);
    const events = frames.map((frame) => frame.event);
    expect(events[0]).toBe("meta");
    expect(events).toContain("text_delta");
    expect(events).toContain("audio");
    expect(events).toContain("audio_done");
    expect(events[events.length - 1]).toBe("done");

    const meta = frames.find((frame) => frame.event === "meta")?.data;
    expect(meta?.model).toBe("claude-sonnet-4-5");
    expect(meta?.pcmSampleRate).toBe(24000);

    const done = frames.find((frame) => frame.event === "done")?.data;
    expect(done?.ok).toBe(true);
    expect(done?.text).toBe("Hi friend! Let's chat.");
    const spans = done?.latencySpans as Record<string, unknown>;
    expect(typeof spans.firstTokenMs).toBe("number");
    expect(typeof spans.requestToResponseMs).toBe("number");
    expect(spans.toolFollowupMs).toBe(0);

    expect(anthropicState.streamCalls).toHaveLength(1);
    expect(anthropicState.streamCalls[0]?.model).toBe("claude-sonnet-4-5");
    expect(anthropicState.createCalls).toHaveLength(0);
    expect(speakerState.created).toHaveLength(1);
    expect(speakerState.created[0]?.sent.join("")).toContain("Hi friend!");
    expect(speakerState.created[0]?.finished).toBe(true);
  });

  it("runs the follow-up fallback and speaks its text when the stream is tool-only", async () => {
    anthropicState.textDeltas = [];
    anthropicState.finalContent = [
      {
        type: "tool_use",
        id: "tu_1",
        name: "companionAct",
        input: { type: "animate", payload: { animation: "wave", loop: false } },
      },
    ];

    const result = await postStream({
      childId: "ila",
      question: "hello!",
      mode: "video_call",
      showroomTheme: "crystal",
      conversationIntent: "social",
    });

    expect(result.status).toBe(200);
    const frames = parseSseFrames(result.body);
    const done = frames.find((frame) => frame.event === "done")?.data;
    expect(done?.text).toBe("Follow-up line.");
    expect(anthropicState.createCalls).toHaveLength(1);
    expect(speakerState.created[0]?.sent.join("")).toContain("Follow-up line.");
    const commands = done?.companionCommands as unknown[];
    expect(commands.length).toBe(1);
  });
});
