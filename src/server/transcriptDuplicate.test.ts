import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({ runAgent: vi.fn(async () => "") }));

import { runAgent } from "../agents/elli/run";
import { SessionManager } from "./session-manager";

// Human catch (Reina, 2026-11-04): one "Nope. Nope..." was accepted twice 0.2s apart and
// again after a deferral replay. The duplicate guard compared raw lowercase text, so the
// speech service's eager and final copies of one utterance (different punctuation) both
// passed, and a replay never stamped the guard. Labs only replayed byte-identical text.
function session() {
  const s = new SessionManager({ readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket, "Reina");
  const h = s as any;
  h.companionPresence = "summoned";
  h.companionInteractionMode = "conversation";
  return h;
}
const accepted = (log: ReturnType<typeof vi.spyOn>) =>
  log.mock.calls.filter(([line]) => /💬 .*Reina: "/.test(String(line))).length;

describe("one utterance is one turn", () => {
  afterEach(() => { vi.mocked(runAgent).mockClear(); vi.restoreAllMocks(); });

  it("answers the same words once when they arrive again with different punctuation", async () => {
    const log = vi.spyOn(console, "log");
    const h = session();
    await h.handleEndOfTurn("Nope. Nope...");
    await h.handleEndOfTurn("nope, nope");

    expect(runAgent).toHaveBeenCalledOnce();
    expect(accepted(log)).toBe(1);
    expect(log.mock.calls.some(([line]) => String(line).includes("🎮 [transcript] [duplicate-dropped]"))).toBe(true);
  });

  it("still answers the same words said again later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const h = session();
      await h.handleEndOfTurn("Nope.");
      vi.setSystemTime(Date.now() + 4_000);
      await h.handleEndOfTurn("Nope.");
      expect(runAgent).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers a transcript deferred behind narration exactly once", async () => {
    const log = vi.spyOn(console, "log");
    const h = session();
    h.activeGameNarrationRequestId = "narration-1";
    await h.handleEndOfTurn("Nope. Nope...");
    await h.handleEndOfTurn("nope nope.");
    expect(runAgent).not.toHaveBeenCalled();

    h.activeGameNarrationRequestId = null;
    h.playbackDone();
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledOnce());
    await h.handleEndOfTurn("Nope, nope.");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(accepted(log)).toBe(2); // the deferral, then its one replay
  });
});
