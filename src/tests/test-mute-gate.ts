import { describe, it, expect, vi } from "vitest";
import { createAudioGate } from "../server/audioGate";
import { flushBufferIfUnmuted } from "../shared/flushBuffer";
import { getNodeAudioDefaults } from "../shared/nodeAudioDefaults";

describe("server-side mute gate", () => {
  it("audio chunk is NOT forwarded to Deepgram when muted", () => {
    const sendAudio = vi.fn();
    const handler = createAudioGate({ sendAudio });
    handler.setMute(true);
    handler.receiveChunk(Buffer.alloc(100));
    expect(sendAudio).not.toHaveBeenCalled();
  });

  it("audio chunk IS forwarded when not muted", () => {
    const sendAudio = vi.fn();
    const handler = createAudioGate({ sendAudio });
    handler.setMute(false);
    handler.receiveChunk(Buffer.alloc(100));
    expect(sendAudio).toHaveBeenCalledOnce();
  });

  it("unmuting resumes forwarding", () => {
    const sendAudio = vi.fn();
    const handler = createAudioGate({ sendAudio });
    handler.setMute(true);
    handler.receiveChunk(Buffer.alloc(100));
    handler.setMute(false);
    handler.receiveChunk(Buffer.alloc(100));
    expect(sendAudio).toHaveBeenCalledTimes(1);
  });

  it("muting mid-session drops subsequent chunks immediately", () => {
    const sendAudio = vi.fn();
    const handler = createAudioGate({ sendAudio });
    handler.receiveChunk(Buffer.alloc(100));
    handler.setMute(true);
    handler.receiveChunk(Buffer.alloc(100));
    handler.receiveChunk(Buffer.alloc(100));
    expect(sendAudio).toHaveBeenCalledTimes(1);
  });
});

describe("client-side leak prevention", () => {
  it("barge-in buffer flush respects mute state", () => {
    const frames = ["a1", "a2"];
    const sendMessage = vi.fn();
    flushBufferIfUnmuted(frames, true, sendMessage);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("barge-in buffer flush sends frames when unmuted", () => {
    const frames = ["a1", "a2"];
    const sendMessage = vi.fn();
    flushBufferIfUnmuted(frames, false, sendMessage);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, "audio", { data: "a1" });
    expect(sendMessage).toHaveBeenNthCalledWith(2, "audio", { data: "a2" });
  });

  it("finalizePlayback flush respects mute state", () => {
    const frames = ["a1"];
    const sendMessage = vi.fn();
    flushBufferIfUnmuted(frames, true, sendMessage);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("node-driven audio defaults", () => {
  it("karaoke defaults to mic off and tts off", () => {
    const cfg = getNodeAudioDefaults("karaoke");
    expect(cfg.companionMicDefault).toBe("off");
    expect(cfg.companionTtsDefault).toBe("off");
  });

  it("pronunciation defaults to mic off and tts off", () => {
    const cfg = getNodeAudioDefaults("pronunciation");
    expect(cfg.companionMicDefault).toBe("off");
    expect(cfg.companionTtsDefault).toBe("off");
  });

  it("spell-check defaults to both on", () => {
    const cfg = getNodeAudioDefaults("spell-check");
    expect(cfg.companionMicDefault).toBe("on");
    expect(cfg.companionTtsDefault).toBe("on");
  });

  it("unknown node type defaults to both on — never locks out new games", () => {
    const cfg = getNodeAudioDefaults("future-unknown-node");
    expect(cfg.companionMicDefault).toBe("on");
    expect(cfg.companionTtsDefault).toBe("on");
  });
});
