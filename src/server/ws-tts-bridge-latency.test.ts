import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function browserWs() {
  return { readyState: 1, OPEN: 1, send: vi.fn() } as never;
}

describe("WsTtsBridge latency marks", () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("TTS_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports tts_first_text when text is sent and tts_first_audio when audio arrives", async () => {
    const marks: string[] = [];
    const bridge = new WsTtsBridge(browserWs(), "voice-1");
    bridge.onLatencyMark = (mark) => marks.push(mark);
    const connecting = bridge.connect();
    sockets[0].emit("open");
    await connecting;

    expect(marks).toEqual([]);
    bridge.sendText("Hello there.");
    expect(marks).toEqual(["tts_first_text"]);

    sockets[0].emit("message", Buffer.from(JSON.stringify({ audio: "AAAA" })));
    expect(marks).toEqual(["tts_first_text", "tts_first_audio"]);
  });

  it("does not credit game narration audio to Elli's reply timing", async () => {
    // Human catch (Oct 20 PR #21 session): spelling-chunk narration ("try.")
    // finished an unrelated latency turn and produced a 23s outlier.
    const marks: string[] = [];
    const bridge = new WsTtsBridge(browserWs(), "voice-1");
    bridge.onLatencyMark = (mark) => marks.push(mark);
    const connecting = bridge.connect();
    sockets[0].emit("open");
    await connecting;
    bridge.beginPlayback("b886f3db-ed69-4292-a191-69e9b6a7b5a7");
    bridge.sendText("try.");
    sockets[0].emit("message", Buffer.from(JSON.stringify({ audio: "AAAA" })));
    expect(marks).toEqual([]);
    bridge.beginPlayback("companion:session:7"); // owner change stops the narration stream
    const reconnecting = bridge.connect();
    sockets[1].emit("open");
    await reconnecting;
    bridge.sendText("Nice work on that one.");
    sockets[1].emit("message", Buffer.from(JSON.stringify({ audio: "AAAA" })));
    expect(marks).toEqual(["tts_first_text", "tts_first_audio"]);
  });

  it("does not report audio after the bridge was stopped (barge-in)", async () => {
    const marks: string[] = [];
    const bridge = new WsTtsBridge(browserWs(), "voice-1");
    bridge.onLatencyMark = (mark) => marks.push(mark);
    const connecting = bridge.connect();
    const socket = sockets[0];
    socket.emit("open");
    await connecting;

    bridge.stop();
    socket.emit("message", Buffer.from(JSON.stringify({ audio: "AAAA" })));
    expect(marks).not.toContain("tts_first_audio");
  });
});
