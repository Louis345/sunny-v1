import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

import { SessionManager } from "../server/session-manager";
import { TurnStateMachine } from "../server/session-state";
import { WsTtsBridge } from "../server/ws-tts-bridge";

function mockBrowserWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function peekPending(sm: TurnStateMachine): string | null {
  return (sm as unknown as { pendingTranscript: string | null })
    .pendingTranscript;
}

describe("TurnStateMachine queue", () => {
  it("setPendingTranscript stores value", () => {
    const sm = new TurnStateMachine(() => {}, () => {});
    sm.setPendingTranscript("hello");
    expect(peekPending(sm)).toBe("hello");
  });

  it("consumePendingTranscript returns it and clears", () => {
    const sm = new TurnStateMachine(() => {}, () => {});
    sm.setPendingTranscript("hello");
    expect(sm.consumePendingTranscript()).toBe("hello");
    expect(sm.consumePendingTranscript()).toBeNull();
  });

  it("second setPendingTranscript overwrites first", () => {
    const sm = new TurnStateMachine(() => {}, () => {});
    sm.setPendingTranscript("first");
    sm.setPendingTranscript("second");
    expect(sm.consumePendingTranscript()).toBe("second");
  });

  it("consumePendingTranscript returns null when empty", () => {
    const sm = new TurnStateMachine(() => {}, () => {});
    expect(sm.consumePendingTranscript()).toBeNull();
  });

  it("onInterrupt clears pending transcript", () => {
    const sm = new TurnStateMachine(() => {}, () => {});
    sm.setPendingTranscript("queued");
    sm.onInterrupt();
    expect(peekPending(sm)).toBeNull();
    expect(sm.consumePendingTranscript()).toBeNull();
  });
});

describe("Correct consumption point", () => {
  it("transcript queued during PROCESSING; not consumed by onAgentComplete; consumed after playbackDone; handleEndOfTurn replay", async () => {
    const ws = mockBrowserWs();
    const session = new SessionManager(ws, "Ila");
    const turnSM = (session as unknown as { turnSM: TurnStateMachine }).turnSM;

    turnSM.onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));
    expect(turnSM.getState()).toBe("PROCESSING");

    const spy = vi.spyOn(
      session as unknown as { handleEndOfTurn: (t: string, r?: boolean) => Promise<void> },
      "handleEndOfTurn",
    );

    session.injectTranscript("seven");
    expect(peekPending(turnSM)).toBe("seven");

    turnSM.onAgentComplete();
    expect(turnSM.getState()).toBe("SPEAKING");
    expect(peekPending(turnSM)).toBe("seven");

    session.playbackDone();
    // onPlaybackComplete moved SPEAKING → IDLE; consume cleared pending; replay
    // handleEndOfTurn starts immediately (LOADING before first await).
    expect(peekPending(turnSM)).toBeNull();
    expect(turnSM.getState()).toBe("LOADING");

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith("seven", true);
    });
    spy.mockRestore();
  });
});

describe("TTS off path", () => {
  const prevTts = process.env.TTS_ENABLED;

  beforeEach(() => {
    process.env.TTS_ENABLED = "false";
  });

  afterEach(() => {
    process.env.TTS_ENABLED = prevTts;
  });

  it("WsTtsBridge.finish resolves immediately when TTS disabled (no ElevenLabs wait)", async () => {
    const ws = mockBrowserWs();
    const bridge = new WsTtsBridge(ws, "voice");
    const t0 = Date.now();
    await bridge.finish();
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("pending transcript consumed after playbackDone when TTS disabled (same as client synthetic playback_done)", async () => {
    const ws = mockBrowserWs();
    const session = new SessionManager(ws, "Ila");
    const turnSM = (session as unknown as { turnSM: TurnStateMachine }).turnSM;

    turnSM.onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));
    session.injectTranscript("eight");
    expect(peekPending(turnSM)).toBe("eight");

    turnSM.onAgentComplete();
    session.playbackDone();

    await vi.waitFor(() => {
      expect(peekPending(turnSM)).toBeNull();
    });
  });

  it("pending is not left set after full turn cycle when TTS disabled", async () => {
    const ws = mockBrowserWs();
    const session = new SessionManager(ws, "Ila");
    const turnSM = (session as unknown as { turnSM: TurnStateMachine }).turnSM;

    turnSM.onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));
    session.injectTranscript("nine");
    turnSM.onAgentComplete();
    session.playbackDone();

    await vi.waitFor(() => {
      expect(peekPending(turnSM)).toBeNull();
    });
  });
});
