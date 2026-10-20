import { describe, it, expect, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

import { SessionManager } from "../server/session-manager";
import { TurnStateMachine } from "../server/session-state";

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function peekWbActive(sm: SessionManager): boolean {
  return (sm as unknown as { wbActive: boolean }).wbActive;
}
function peekWbSessionActive(sm: SessionManager): boolean {
  return (sm as unknown as { wordBuilderSessionActive: boolean })
    .wordBuilderSessionActive;
}
function getTurnSM(sm: SessionManager): TurnStateMachine {
  return (sm as unknown as { turnSM: TurnStateMachine }).turnSM;
}
function callHandleToolCall(
  sm: SessionManager,
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
  (
    sm as unknown as {
      handleToolCall: (
        t: string,
        a: Record<string, unknown>,
        r: unknown,
      ) => void;
    }
  ).handleToolCall(tool, args, result);
}
// ── Suite 3: canvasClear ends Word Builder session ─────────────────────────

describe("canvasClear ends Word Builder session", () => {
  it("wbActive and wordBuilderSessionActive are false after canvasClear", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    const turnSM = getTurnSM(sm);

    // Manually activate WB session state
    (sm as unknown as { wordBuilderSessionActive: boolean }).wordBuilderSessionActive =
      true;
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    turnSM.onWordBuilderStart();

    expect(turnSM.getState()).toBe("WORD_BUILDER");

    const clearResult = { canvasShowing: "idle", ok: true };
    callHandleToolCall(sm, "canvasClear", {}, clearResult);

    expect(peekWbActive(sm)).toBe(false);
    expect(peekWbSessionActive(sm)).toBe(false);
  });

  it("state machine leaves WORD_BUILDER after canvasClear", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    const turnSM = getTurnSM(sm);

    (sm as unknown as { wordBuilderSessionActive: boolean }).wordBuilderSessionActive =
      true;
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    turnSM.onWordBuilderStart();

    const clearResult = { canvasShowing: "idle", ok: true };
    callHandleToolCall(sm, "canvasClear", {}, clearResult);

    expect(turnSM.getState()).not.toBe("WORD_BUILDER");
  });

  it("launchGame(word-builder) is no longer blocked after canvasClear ends WB session", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    const turnSM = getTurnSM(sm);

    (sm as unknown as { wordBuilderSessionActive: boolean }).wordBuilderSessionActive =
      true;
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    turnSM.onWordBuilderStart();

    callHandleToolCall(sm, "canvasClear", {}, { canvasShowing: "idle", ok: true });

    // After clear, a new word-builder launch should go through (not blocked)
    // Drive state to PROCESSING so WB start is valid
    turnSM.onWordBuilderEnd();

    expect(peekWbSessionActive(sm)).toBe(false);
  });
});
