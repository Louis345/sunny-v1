import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { MutableRefObject } from "react";

vi.mock("../../components/Canvas", () => ({
  gameIframeRef: { current: null },
}));

import { useSession } from "../useSession";

/** Minimal valid base64 for one Int16 sample (2 bytes) — PCM silence. */
const ONE_SAMPLE_PCM_BASE64 = "AAA=";

const OPEN = 1;
const CONNECTING = 0;

let createBufferSourceCallCount = 0;

describe("useSession companion audio gate", () => {
  let wsInstances: MockWebSocket[];
  let OriginalWebSocket: typeof WebSocket;
  let OriginalAudioContext: typeof AudioContext;

  class MockWebSocket {
    static OPEN = OPEN;
    static CONNECTING = CONNECTING;
    readyState = CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    send = vi.fn();
    close = vi.fn();

    constructor(_url: string) {
      wsInstances.push(this);
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      });
    }
  }

  beforeEach(() => {
    wsInstances = [];
    createBufferSourceCallCount = 0;
    OriginalWebSocket = globalThis.WebSocket;
    OriginalAudioContext = globalThis.AudioContext;

    class TestAudioContext {
      state: AudioContextState = "running";
      sampleRate = 24000;
      destination = {} as AudioDestinationNode;
      createAnalyser() {
        return {
          context: this,
          fftSize: 2048,
          connect: () => this as unknown as AudioNode,
          disconnect: () => {},
          getByteTimeDomainData: () => {},
        } as unknown as AnalyserNode;
      }
      createBufferSource() {
        createBufferSourceCallCount += 1;
        const src = {
          buffer: null as AudioBuffer | null,
          connect: () => src as unknown as AudioNode,
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        return src as unknown as AudioBufferSourceNode;
      }
      createBuffer(_ch: number, len: number, sr: number) {
        return {
          sampleRate: sr,
          length: len,
          duration: len / sr,
          getChannelData: () => new Float32Array(len),
        } as unknown as AudioBuffer;
      }
      resume = vi.fn(() => Promise.resolve());
      close = vi.fn();
    }

    globalThis.AudioContext = TestAudioContext as unknown as typeof AudioContext;

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getAudioTracks: () => [{ enabled: true, stop: vi.fn() }],
        } as unknown as MediaStream),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.WebSocket = OriginalWebSocket;
    globalThis.AudioContext = OriginalAudioContext;
    vi.restoreAllMocks();
    cleanup();
  });

  function deliverJson(ws: MockWebSocket, obj: Record<string, unknown>) {
    const ev = { data: JSON.stringify(obj) } as MessageEvent;
    ws.onmessage?.(ev);
  }

  it("queues first audio and does not start playback while gate is closed", async () => {
    const gateRef: MutableRefObject<boolean> = { current: true };

    const { result } = renderHook(() =>
      useSession({
        gateCompanionAudioUntilCurtainRef: gateRef,
      }),
    );

    act(() => {
      result.current.startSession("ila");
    });

    const ws = wsInstances[0]!;
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      deliverJson(ws, {
        type: "session_started",
        childName: "Ila",
        child: "ila",
        companionName: "Elli",
        companion: "elli",
        emoji: "🌟",
        accentColor: "#7C3AED",
        accentBg: "#F3E8FF",
        voiceId: "v1",
        openingLine: "Hi!",
        goodbye: "Bye",
      });
    });

    act(() => {
      deliverJson(ws, { type: "session_boot_ready" });
    });

    act(() => {
      deliverJson(ws, { type: "audio", data: ONE_SAMPLE_PCM_BASE64 });
    });

    expect(result.current.state.firstAudioChunkReceived).toBe(true);
    expect(createBufferSourceCallCount).toBe(0);

    act(() => {
      result.current.releaseCompanionAudioPlayback();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(createBufferSourceCallCount).toBeGreaterThan(0);
  });

  it("resets firstAudioChunkReceived on session_started", async () => {
    const gateRef: MutableRefObject<boolean> = { current: false };
    const { result } = renderHook(() =>
      useSession({ gateCompanionAudioUntilCurtainRef: gateRef }),
    );

    act(() => {
      result.current.startSession("ila");
    });
    const ws = wsInstances[0]!;
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      deliverJson(ws, {
        type: "session_started",
        childName: "Ila",
        child: "ila",
        companionName: "Elli",
        companion: "elli",
        emoji: "🌟",
        accentColor: "#7C3AED",
        accentBg: "#F3E8FF",
        voiceId: "v1",
        openingLine: "Hi!",
        goodbye: "Bye",
      });
    });
    expect(result.current.state.firstAudioChunkReceived).toBe(false);

    act(() => {
      deliverJson(ws, { type: "audio", data: ONE_SAMPLE_PCM_BASE64 });
    });
    expect(result.current.state.firstAudioChunkReceived).toBe(true);

    act(() => {
      deliverJson(ws, {
        type: "session_started",
        childName: "Ila",
        child: "ila",
        companionName: "Elli",
        companion: "elli",
        emoji: "🌟",
        accentColor: "#7C3AED",
        accentBg: "#F3E8FF",
        voiceId: "v1",
        openingLine: "Hi!",
        goodbye: "Bye",
      });
    });
    expect(result.current.state.firstAudioChunkReceived).toBe(false);
  });
});
