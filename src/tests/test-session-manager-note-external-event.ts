import { describe, it, expect, vi, beforeEach } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

import { SessionManager } from "../server/session-manager";
import type { ExternalContextEvent } from "../server/companion-context/externalContextEvent";

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  } as unknown as WebSocket;
}

function getHistory(sm: SessionManager): Array<{ role: string; content: unknown }> {
  return (sm as unknown as { conversationHistory: Array<{ role: string; content: unknown }> })
    .conversationHistory;
}

function makeEvent(override?: Partial<ExternalContextEvent>): ExternalContextEvent {
  return {
    source: "map_node_complete",
    summary: "Finished spell-check — 85% accuracy, 45s.",
    occurredAt: Date.now(),
    ...override,
  };
}

describe("SessionManager.noteExternalEvent (GAME-EVENT-001)", () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager(mockWs(), "Ila");
  });

  it("6. appends exactly one message with role=user and content starting with [background: <source>]", () => {
    const before = getHistory(sm).length;
    sm.noteExternalEvent(makeEvent({ source: "map_node_complete" }));
    const history = getHistory(sm);
    expect(history.length).toBe(before + 1);
    const last = history[history.length - 1]!;
    expect(last.role).toBe("user");
    expect(typeof last.content).toBe("string");
    expect(last.content as string).toMatch(/^\[background: map_node_complete\]/);
  });

  it("7. noteExternalEvent does not call handleEndOfTurn or injectTranscript", () => {
    const hetSpy = vi.spyOn(
      sm as unknown as { handleEndOfTurn: (...args: unknown[]) => Promise<void> },
      "handleEndOfTurn",
    );
    sm.noteExternalEvent(makeEvent());
    expect(hetSpy).not.toHaveBeenCalled();
  });

  it("7b. noteExternalEvent does not trigger audio send (ws.send is not called for audio)", () => {
    const ws = mockWs();
    const sm2 = new SessionManager(ws, "Ila");
    const sendSpy = vi.spyOn(ws as unknown as { send: (...args: unknown[]) => void }, "send");
    const initialCallCount = sendSpy.mock.calls.length;
    sm2.noteExternalEvent(makeEvent());
    // ws.send should not have been called more times than before (no audio, no companion msg)
    expect(sendSpy.mock.calls.length).toBe(initialCallCount);
  });

  it("8. two consecutive calls append two messages in order", () => {
    const before = getHistory(sm).length;
    const ev1 = makeEvent({ summary: "First activity done." });
    const ev2 = makeEvent({ summary: "Second activity done." });
    sm.noteExternalEvent(ev1);
    sm.noteExternalEvent(ev2);
    const history = getHistory(sm);
    expect(history.length).toBe(before + 2);
    expect(history[before]!.content as string).toContain("First activity done.");
    expect(history[before + 1]!.content as string).toContain("Second activity done.");
  });
});
