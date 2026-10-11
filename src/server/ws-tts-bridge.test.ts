import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { WsTtsBridge } from "./ws-tts-bridge";

describe("WsTtsBridge turn ownership", () => {
  it("does not let a retired stream completion erase its successor socket", async () => {
    const old = Object.assign(new EventEmitter(), {readyState:WebSocket.OPEN,send:vi.fn()});
    const next = {readyState:WebSocket.OPEN};
    const bridge=Object.assign(Object.create(WsTtsBridge.prototype),{
      stopped:false,disabled:false,buffer:"",flushTimer:null,elevenWs:old,wsReady:true,
    }) as WsTtsBridge;
    const finished=bridge.finish();
    (bridge as any).elevenWs=next;
    old.emit("close");
    await finished;
    expect((bridge as any).elevenWs).toBe(next);
    expect((bridge as any).wsReady).toBe(true);
  });

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
