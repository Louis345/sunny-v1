import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({ runAgent: vi.fn(async () => "") }));

import { runAgent } from "../agents/elli/run";
import { isSelfEcho } from "./companionTurnTaking";
import { SessionManager } from "./session-manager";
import { WsTtsBridge } from "./ws-tts-bridge";

// Human catch (Reina, 2026-11-04): game narration ("Ray-nah, Matilda needs her co-pilot!
// Pick a gate to read the clues, skywrite the word.") came back through the room mic and was
// accepted as her turn. Logs showed it as a normal accepted transcript; the only echo guard
// compared against Matilda's own in-flight reply, and labs never fed narration back as speech.
const NARRATION = "Ray-nah, Matilda needs her co-pilot! Pick a gate to read the clues, skywrite the word.";

describe("Sunny does not answer its own voice", () => {
  afterEach(() => vi.mocked(runAgent).mockClear());

  it("recognizes a multi-word transcript that is mostly recent Sunny speech", () => {
    expect(isSelfEcho("Pick a gate to read the clues, skywrite the word.", [NARRATION])).toBe(true);
    expect(isSelfEcho("Matilda needs her co-pilot. Pick a gate", [NARRATION])).toBe(true);
  });

  it("keeps the child's real answers that share words with recent speech", () => {
    expect(isSelfEcho("plane", ["Spell the word plane."])).toBe(false);
    expect(isSelfEcho("Plane.", ["plane."])).toBe(false);
    expect(isSelfEcho("Is it plane?", ["Is it plane or plain?"])).toBe(false);
    expect(isSelfEcho("Can you say the word again?", ["Say the word again."])).toBe(false);
    expect(isSelfEcho("I want the red gate", [NARRATION])).toBe(false);
    expect(isSelfEcho("p l a n e", ["p. l. a. n. e."])).toBe(false);
    expect(isSelfEcho("Pick a gate to read the clues, skywrite the word.", [])).toBe(false);
  });

  it("the voice bridge remembers what it spoke for 15 seconds, one entry per playback", () => {
    vi.useFakeTimers();
    try {
      const prev = process.env.TTS_ENABLED;
      process.env.TTS_ENABLED = "false";
      const bridge = new WsTtsBridge({ readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket, "voice");
      process.env.TTS_ENABLED = prev;
      bridge.beginPlayback("narration-1");
      void bridge.connect();
      bridge.sendText("Pick a gate ");
      bridge.sendText("to read the clues.");
      bridge.beginPlayback("companion:s:1");
      void bridge.connect();
      bridge.sendText("Nice pick!");
      expect(bridge.recentlySpoken(15_000)).toEqual(["Pick a gate to read the clues.", "Nice pick!"]);
      vi.advanceTimersByTime(16_000);
      expect(bridge.recentlySpoken(15_000)).toEqual([]);
      bridge.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  function session(recent: string[]) {
    const s = new SessionManager({ readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket, "Reina");
    const h = s as any;
    h.companionPresence = "summoned";
    h.companionInteractionMode = "conversation";
    h.ttsBridge = { recentlySpoken: () => recent, connect: async () => {}, beginPlayback: vi.fn(), stop: vi.fn(),
      finish: async () => {}, sendText: vi.fn(), currentPlaybackIdentity: () => null };
    return h;
  }

  it("drops narration heard back through the mic instead of answering it", async () => {
    const log = vi.spyOn(console, "log");
    const h = session([NARRATION]);
    await h.handleEndOfTurn("Pick a gate to read the clues, skywrite the word.");
    expect(runAgent).not.toHaveBeenCalled();
    expect(log.mock.calls.some(([line]) => String(line).includes("🎮 [transcript] [self-echo-dropped]"))).toBe(true);
    log.mockRestore();
  });

  it("still answers the child repeating the spelling word Sunny just said", async () => {
    const h = session(["Spell the word plane."]);
    await h.handleEndOfTurn("plane");
    expect(runAgent).toHaveBeenCalledOnce();
  });
});
