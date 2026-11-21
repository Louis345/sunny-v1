import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Owner, 2026-11-21, after a call with Nuance Labs' Emma: Sunny's companion takes ~2.2–2.9 s from her words to the
// first sound, and 0.7–0.9 s of that sits between Claude's first word and ElevenLabs' first audio. Why the human caught
// it: only a person comparing two live calls feels the frozen gap. Why logs missed it: the traces show the gap but no
// check says it is too long. Why the lab missed it: no test pinned how much text ElevenLabs waits for before speaking
// (its default chunk_length_schedule waits for 120 characters, about half of her first sentence).

const { sockets, FakeElevenSocket } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("events") as typeof import("events");
  const sockets: Array<InstanceType<typeof FakeElevenSocket>> = [];
  class FakeElevenSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = FakeElevenSocket.OPEN;
    OPEN = FakeElevenSocket.OPEN;
    sent: string[] = [];
    constructor(public url: string) {
      super();
      sockets.push(this);
    }
    send(data: string) {
      this.sent.push(data);
    }
    terminate() {}
    close() {}
  }
  return { sockets, FakeElevenSocket };
});

vi.mock("ws", () => ({ default: FakeElevenSocket }));

import { WsTtsBridge } from "./ws-tts-bridge";
import { createElevenLabsPcmSpeaker } from "./companionTalkStream";

const messages = (index: number) => sockets[index].sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);

async function homeworkBridge() {
  const bridge = new WsTtsBridge({ readyState: 1, OPEN: 1, send: vi.fn() } as never, "voice-1");
  const connecting = bridge.connect();
  sockets[0].emit("open");
  await connecting;
  return bridge;
}

async function faceTimeSpeaker() {
  const speaker = createElevenLabsPcmSpeaker({ voiceId: "voice-1", apiKey: "test-key", onAudioChunk: () => undefined });
  const connecting = speaker.connect();
  sockets[0].emit("open");
  await connecting;
  return speaker;
}

describe("the companion's voice starts on her first short phrase", () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("TTS_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("homework: ElevenLabs is told to start after 50 characters, not its 120 default", async () => {
    await homeworkBridge();
    const schedule = (messages(0)[0].generation_config as { chunk_length_schedule?: number[] } | undefined)?.chunk_length_schedule;
    expect(schedule?.[0]).toBe(50);
  });

  it("FaceTime: ElevenLabs is told to start after 50 characters, not its 120 default", async () => {
    await faceTimeSpeaker();
    const schedule = (messages(0)[0].generation_config as { chunk_length_schedule?: number[] } | undefined)?.chunk_length_schedule;
    expect(schedule?.[0]).toBe(50);
  });

  it("homework: a finished sentence is spoken now, even when it is short", async () => {
    const bridge = await homeworkBridge();
    bridge.sendText("Great job!");
    expect(messages(0).at(-1)).toMatchObject({ flush: true });
  });

  it("FaceTime: a finished sentence is spoken now, even when it is short", async () => {
    const speaker = await faceTimeSpeaker();
    speaker.sendText("Oh wow!");
    expect(messages(0).at(-1)).toMatchObject({ flush: true });
  });

  it("FaceTime: half a sentence is not forced out, so her voice keeps its flow", async () => {
    const speaker = await faceTimeSpeaker();
    speaker.sendText("I love that, ");
    expect(messages(0).slice(1).some((message) => message.flush === true)).toBe(false);
  });
});
