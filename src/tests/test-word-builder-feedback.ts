import { describe, it, expect, vi } from "vitest";
import WebSocket from "ws";
import { createStartWordBuilderTool } from "../agents/elli/tools/startWordBuilder";

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
function getSentMessages(sm: SessionManager): Array<Record<string, unknown>> {
  const ws = (sm as unknown as { ws: WebSocket }).ws;
  return (ws.send as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
    JSON.parse(c[0] as string),
  );
}

// ── Suite 1: startWordBuilder.execute() honest return ──────────────────────

describe("startWordBuilder.execute honest return", () => {
  function freshTool() {
    let claimed = false;
    return createStartWordBuilderTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => {
        if (claimed) return false;
        claimed = true;
        return true;
      },
    });
  }

  it("returns ok:true and launched:true with the word", async () => {
    const t = freshTool();
    const result = await (
      t as unknown as { execute: (a: { word: string }) => Promise<unknown> }
    ).execute({ word: "add" });
    expect(result).toEqual({ ok: true, word: "add", launched: true });
  });

  it("returns normalized word (lowercase trim)", async () => {
    const t = freshTool();
    const result = await (
      t as unknown as { execute: (a: { word: string }) => Promise<unknown> }
    ).execute({ word: "  Moving " });
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(true);
    expect(r.launched).toBe(true);
    expect(r.word).toBe("moving");
  });
});

// ── Suite 2: blocked startWordBuilder returns ok:false to client ───────────

describe("startWordBuilder blocked → ok:false wire result", () => {
  it("when WB already active, tool_call sent to browser has ok:false (wire correction)", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    const turnSM = getTurnSM(sm);

    // Manually activate WB session
    (sm as unknown as { wordBuilderSessionActive: boolean }).wordBuilderSessionActive =
      true;
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    turnSM.onWordBuilderStart();

    const fakeResult = { ok: true, word: "add", launched: true };
    callHandleToolCall(sm, "startWordBuilder", { word: "add" }, fakeResult);

    const sent = getSentMessages(sm);
    const toolCallMsg = sent.find((m) => m.type === "tool_call");
    expect(toolCallMsg).toBeDefined();
    const result = toolCallMsg!.result as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("when execute already returned ok:false, wire passes rejection through", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    const turnSM = getTurnSM(sm);
    (sm as unknown as { wordBuilderSessionActive: boolean }).wordBuilderSessionActive =
      true;
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    turnSM.onWordBuilderStart();

    const failResult = {
      ok: false,
      error: "Word Builder is already active. Call canvasClear first if you want to restart it.",
      launched: false,
    };
    callHandleToolCall(sm, "startWordBuilder", { word: "add" }, failResult);

    const sent = getSentMessages(sm);
    const toolCallMsg = sent.find((m) => m.type === "tool_call");
    expect(toolCallMsg).toBeDefined();
    expect((toolCallMsg!.result as Record<string, unknown>).ok).toBe(false);
  });
});

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

  it("startWordBuilder is no longer blocked after canvasClear ends WB session", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    const turnSM = getTurnSM(sm);

    (sm as unknown as { wordBuilderSessionActive: boolean }).wordBuilderSessionActive =
      true;
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    turnSM.onWordBuilderStart();

    callHandleToolCall(sm, "canvasClear", {}, { canvasShowing: "idle", ok: true });

    // After clear, a new startWordBuilder should go through (not blocked)
    // Drive state to PROCESSING so WB start is valid
    turnSM.onWordBuilderEnd();

    expect(peekWbSessionActive(sm)).toBe(false);
  });
});
