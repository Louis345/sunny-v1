import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

// Reina, 2026-11-22: "it talks too much and doesn't follow up." Why the human caught it: the game's lines ("Ray-nah,
// first puzzle is up…") came out in Matilda's voice on top of Matilda's own replies, so one mouth had two minds. Why
// logs missed it: game narration and companion replies were both logged as speech from the same bridge, and nothing
// recorded whose voice spoke. Why the lab missed it: the bridge was only ever tested with one voice id.
const fixtures = vi.hoisted(() => ({ urls: [] as string[], sockets: [] as any[] }));
vi.mock("ws", () => ({
  default: class extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    send = vi.fn();
    constructor(url: string) { super(); fixtures.urls.push(url); fixtures.sockets.push(this); }
    close() { this.readyState = 3; this.emit("close"); }
    terminate() { this.close(); }
  },
}));
import { WsTtsBridge } from "./ws-tts-bridge";
import { NARRATOR_VOICE_ID } from "./narratorVoice";

afterEach(() => { vi.unstubAllEnvs(); fixtures.urls = []; fixtures.sockets = []; });

async function open(bridge: WsTtsBridge) {
  const connected = bridge.connect();
  const socket = fixtures.sockets.at(-1);
  socket.readyState = 1;
  socket.emit("open");
  await connected;
}

describe("the narrator has her own voice", () => {
  it("game speech uses the announcer voice; the companion's replies keep hers", async () => {
    vi.stubEnv("TTS_ENABLED", "true");
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const bridge = new WsTtsBridge({ readyState: 1, OPEN: 1, send: vi.fn() } as never, "companion-voice");
    bridge.useNarratorVoice(NARRATOR_VOICE_ID);
    bridge.beginPlayback("companion:s:1");
    await open(bridge);
    bridge.beginPlayback("narration-1", "item", false, true);
    await open(bridge);
    bridge.beginPlayback("companion:s:2");
    await open(bridge);
    expect(fixtures.urls.map(url => url.split("/").at(-2))).toEqual(["companion-voice", NARRATOR_VOICE_ID, "companion-voice"]);
  });

  it("a socket warmed in her voice is never reused for the narrator", async () => {
    vi.stubEnv("TTS_ENABLED", "true");
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const bridge = new WsTtsBridge({ readyState: 1, OPEN: 1, send: vi.fn() } as never, "companion-voice");
    bridge.useNarratorVoice(NARRATOR_VOICE_ID);
    await open(bridge);
    bridge.beginPlayback("narration-1", "item", true, true);
    await open(bridge);
    expect(fixtures.urls.at(-1)).toContain(`/${NARRATOR_VOICE_ID}/`);
  });

  it("the session gives every bridge the narrator voice", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/session-bootstrap.ts"), "utf8");
    expect(source).toMatch(/useNarratorVoice\(NARRATOR_VOICE_ID\)/);
    expect(NARRATOR_VOICE_ID).toBe("cgSgspJ2msm6clMCkdW9");
  });
});
