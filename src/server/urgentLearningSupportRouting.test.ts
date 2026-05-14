import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { SessionManager } from "./session-manager";
import { TurnStateMachine } from "./session-state";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function peekPending(sm: TurnStateMachine): string | null {
  return (sm as unknown as { pendingTranscript: string | null }).pendingTranscript;
}

describe("urgent learning support routing", () => {
  const prevStateless = process.env.SUNNY_STATELESS;

  beforeEach(() => {
    process.env.SUNNY_STATELESS = "true";
  });

  afterEach(() => {
    process.env.SUNNY_STATELESS = prevStateless;
  });

  it("interrupts stale processing and gives current-word help instead of queueing", async () => {
    const ws = mockWs();
    const session = new SessionManager(ws, "Ila");
    const turnSM = (session as unknown as { turnSM: TurnStateMachine }).turnSM;
    const handleCompanionTurn = vi
      .spyOn(
        session as unknown as { handleCompanionTurn: (text: string) => Promise<void> },
        "handleCompanionTurn",
      )
      .mockResolvedValue(undefined);

    session.injectGameContext({
      game: "pronunciation",
      currentWord: "able",
      wordIndex: 0,
      totalWords: 10,
      phase: "approaching",
    });
    turnSM.onStartCompanionFromIdle();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(turnSM.getState()).toBe("PROCESSING");

    session.injectTranscript("Can you help me, Ellie?");

    await vi.waitFor(() => {
      expect(handleCompanionTurn).toHaveBeenCalledWith(expect.stringContaining("a-ble"));
    });
    expect(peekPending(turnSM)).toBeNull();
    expect(turnSM.getState()).toBe("IDLE");
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"game_message"'),
    );
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"pronunciation_support"'),
    );
  });
});
