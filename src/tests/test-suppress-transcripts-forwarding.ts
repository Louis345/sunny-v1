/**
 * Guard: when suppressTranscripts=true (e.g. word-radar voice_control:false),
 * the server must still forward the "final" transcript to the client so that
 * flow-state games can read it. The LLM must not be invoked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

import { SessionManager } from "../server/session-manager";
import { handleGameEventForSession } from "../server/game-event-handler";

function mockWs() {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe("suppressTranscripts + transcript forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("still sends 'final' to the client when suppressTranscripts=true", async () => {
    const ws = mockWs();
    const sm = new SessionManager(ws, "Ila");

    // Simulate word-radar mounting: voice_control:false sets suppressTranscripts
    handleGameEventForSession(sm as Parameters<typeof handleGameEventForSession>[0], {
      type: "voice_control",
      voiceEnabled: false,
    });

    expect((sm as unknown as { suppressTranscripts: boolean }).suppressTranscripts).toBe(true);

    // Simulate Deepgram finishing a word
    sm.injectTranscript("elephant");

    // Give the async handleEndOfTurn a tick to complete
    await new Promise((r) => setTimeout(r, 0));

    const calls: string[] = (ws.send as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => {
        try {
          return JSON.parse(c[0] as string).type;
        } catch {
          return "";
        }
      },
    );

    expect(calls).toContain("final");
  });

  it("does NOT invoke runAgent when suppressTranscripts=true", async () => {
    const { runAgent } = await import("../agents/elli/run");
    const ws = mockWs();
    const sm = new SessionManager(ws, "Ila");

    handleGameEventForSession(sm as Parameters<typeof handleGameEventForSession>[0], {
      type: "voice_control",
      voiceEnabled: false,
    });

    sm.injectTranscript("elephant");
    await new Promise((r) => setTimeout(r, 0));

    expect(runAgent).not.toHaveBeenCalled();
  });
});
