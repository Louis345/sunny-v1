/**
 * Web SessionManager must never register logAttempt — worksheet + spelling
 * use sessionLog only. Fails if buildAgentToolkit() ever adds logAttempt.
 */
import { describe, it, expect, vi } from "vitest";
import WebSocket from "ws";
import { SessionManager } from "../server/session-manager";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as WebSocket;
}

function toolkitKeys(sm: SessionManager): string[] {
  const t = (
    sm as unknown as { buildAgentToolkit(): Record<string, unknown> }
  ).buildAgentToolkit();
  return Object.keys(t);
}

describe("Web buildAgentToolkit — logAttempt must be absent", () => {
  it("spelling session toolkit has no logAttempt", () => {
    const sm = new SessionManager(mockWs(), "Reina");
    (sm as unknown as { isSpellingSession: boolean }).isSpellingSession = true;
    expect(toolkitKeys(sm)).not.toContain("logAttempt");
  });

  it("non-spelling default toolkit has no logAttempt", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    (sm as unknown as { isSpellingSession: boolean }).isSpellingSession = false;
    expect(toolkitKeys(sm)).not.toContain("logAttempt");
  });

  it("spelling toolkit includes sessionLog", () => {
    const sm = new SessionManager(mockWs(), "Reina");
    (sm as unknown as { isSpellingSession: boolean }).isSpellingSession = true;
    expect(toolkitKeys(sm)).toContain("sessionLog");
  });
});
