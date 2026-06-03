import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeepgramVideoCallStt } from "../useDeepgramVideoCallStt";

const OPEN = 1;
const CONNECTING = 0;

describe("useDeepgramVideoCallStt", () => {
  let wsInstances: MockWebSocket[];
  let processors: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onaudioprocess: ((event: AudioProcessingEvent) => void) | null;
  }>;
  let OriginalWebSocket: typeof WebSocket;
  let OriginalAudioContext: typeof AudioContext;

  class MockWebSocket {
    static OPEN = OPEN;
    static CONNECTING = CONNECTING;
    readyState = CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = 3;
      this.onclose?.();
    });

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
    processors = [];
    OriginalWebSocket = globalThis.WebSocket;
    OriginalAudioContext = globalThis.AudioContext;

    class TestAudioContext {
      state: AudioContextState = "running";
      sampleRate = 16000;
      destination = {} as AudioDestinationNode;
      constructor(options?: AudioContextOptions) {
        this.sampleRate = options?.sampleRate ?? 16000;
      }
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      createScriptProcessor() {
        const processor = {
          connect: vi.fn(),
          disconnect: vi.fn(),
          onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
        };
        processors.push(processor);
        return processor;
      }
      createGain() {
        return {
          gain: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      resume = vi.fn(() => Promise.resolve());
      close = vi.fn(() => Promise.resolve());
    }

    globalThis.AudioContext = TestAudioContext as unknown as typeof AudioContext;
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { protocol: "http:", host: "127.0.0.1:5173" },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getAudioTracks: () => [{ enabled: true, stop: vi.fn() }],
          getTracks: () => [{ stop: vi.fn() }],
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

  function deliverJson(ws: MockWebSocket, payload: Record<string, unknown>) {
    ws.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  function audioEventWithRms(value: number): AudioProcessingEvent {
    return {
      inputBuffer: {
        getChannelData: () => new Float32Array(4096).fill(value),
      },
    } as unknown as AudioProcessingEvent;
  }

  it("starts a Deepgram STT-only Sunny session for video calls", async () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() =>
      useDeepgramVideoCallStt({
        assistantAudioPlaying: false,
        onFinalTranscript,
      }),
    );

    await act(async () => {
      await result.current.start({
        childName: "Ila",
        chartChildId: "ila",
      });
      await Promise.resolve();
    });

    const ws = wsInstances[0]!;
    const startPayload = ws.send.mock.calls
      .map((call) => JSON.parse(String(call[0])))
      .find((payload) => payload.type === "start_session");

    expect(startPayload).toMatchObject({
      type: "start_session",
      child: "Ila",
      chartChildId: "ila",
      silentTts: true,
      sttOnly: true,
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: true,
      }),
    });

    act(() => {
      deliverJson(ws, { type: "final", text: "let's play again" });
    });

    expect(onFinalTranscript).toHaveBeenCalledWith("let's play again");
  });

  it("uses the live mic stream for barge-in while companion audio is playing", async () => {
    const onBargeIn = vi.fn();
    const { result, rerender } = renderHook(
      ({ playing }) =>
        useDeepgramVideoCallStt({
          assistantAudioPlaying: playing,
          onFinalTranscript: vi.fn(),
          onBargeIn,
        }),
      { initialProps: { playing: true } },
    );

    await act(async () => {
      await result.current.start({
        childName: "Ila",
        chartChildId: "ila",
      });
      await Promise.resolve();
    });

    const ws = wsInstances[0]!;
    ws.send.mockClear();

    act(() => {
      processors[0]!.onaudioprocess?.(audioEventWithRms(0.2));
      processors[0]!.onaudioprocess?.(audioEventWithRms(0.2));
    });

    expect(onBargeIn).toHaveBeenCalledTimes(1);
    expect(
      ws.send.mock.calls.some((call) => JSON.parse(String(call[0])).type === "barge_in"),
    ).toBe(true);
    expect(
      ws.send.mock.calls.some((call) => JSON.parse(String(call[0])).type === "audio"),
    ).toBe(true);

    rerender({ playing: false });
  });

  it("reports a kid-safe voice connection message when the Deepgram websocket fails", async () => {
    class FailingWebSocket {
      static OPEN = OPEN;
      static CONNECTING = CONNECTING;
      readyState = CONNECTING;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn(() => {
        this.readyState = 3;
        this.onclose?.();
      });

      constructor(_url: string) {
        wsInstances.push(this as unknown as MockWebSocket);
        queueMicrotask(() => {
          this.readyState = 3;
          this.onerror?.();
        });
      }
    }
    vi.stubGlobal("WebSocket", FailingWebSocket as unknown as typeof WebSocket);
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useDeepgramVideoCallStt({
        assistantAudioPlaying: false,
        onFinalTranscript: vi.fn(),
        onError,
      }),
    );

    await act(async () => {
      await result.current.start({
        childName: "Ila",
        chartChildId: "ila",
      });
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith("Voice connection is having trouble. You can still type.");
    expect(onError).not.toHaveBeenCalledWith("deepgram_video_call_ws_error");
  });

  it("reports a kid-safe typed fallback instead of raw microphone permission errors", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useDeepgramVideoCallStt({
        assistantAudioPlaying: false,
        onFinalTranscript: vi.fn(),
        onError,
      }),
    );

    await act(async () => {
      await result.current.start({
        childName: "Ila",
        chartChildId: "ila",
      });
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith(
      "Microphone permission is blocked. You can still type to Elli.",
    );
    expect(onError).not.toHaveBeenCalledWith("Permission denied");
    expect(result.current.status).toBe("blocked");
  });
});
