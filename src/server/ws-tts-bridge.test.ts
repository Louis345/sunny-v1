import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { WsTtsBridge } from "./ws-tts-bridge";

describe("WsTtsBridge turn ownership", () => {
  it("does not erase an active turn when a second caller reuses the open socket", async () => {
    // Human catch: Ila heard repeated/overlapping words while game narration and
    // Elli shared one bridge. Logs showed successful calls, but connect() silently
    // reset the first caller's text/audio counters. Prior tests mocked the bridge.
    const bridge = Object.assign(Object.create(WsTtsBridge.prototype), {
      stopped: false,
      disabled: false,
      buffer: "first owner text",
      hasFlushedThisTurn: true,
      audioChunksThisTurn: 3,
      flushTimer: null,
      wsReady: true,
      connectingPromise: null,
      elevenWs: { readyState: WebSocket.OPEN },
    }) as WsTtsBridge;

    await bridge.connect("another caller");

    expect((bridge as unknown as { buffer: string }).buffer).toBe("first owner text");
    expect((bridge as unknown as { hasFlushedThisTurn: boolean }).hasFlushedThisTurn).toBe(true);
    expect((bridge as unknown as { audioChunksThisTurn: number }).audioChunksThisTurn).toBe(3);
  });
});
