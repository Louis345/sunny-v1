import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCompanionVideoTraceUrl,
  detectCompanionVideoCallLoop,
  emitCompanionVideoCallTrace,
  sanitizeCompanionVideoCallTracePayload,
} from "../utils/companionVideoCallTrace";

describe("companion video call trace adapter", () => {
  afterEach(() => {
    delete (window as typeof window & { GameBridge?: unknown }).GameBridge;
    vi.restoreAllMocks();
  });

  it("prefers the wrapper hook when GameBridge is available", async () => {
    const reportAction = vi.fn();
    (window as typeof window & { GameBridge?: { reportAction: typeof reportAction } }).GameBridge = {
      reportAction,
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    await emitCompanionVideoCallTrace({
      traceId: "trace123",
      eventName: "speech_result",
      childId: "ila",
      companionId: "elli",
      timestamp: 1000,
      payload: { transcript: "look at this" },
    });

    expect(reportAction).toHaveBeenCalledWith(
      "companion_video_call_trace",
      "speech_result",
      expect.objectContaining({
        traceId: "trace123",
        eventName: "speech_result",
        origin: "client",
        transcriptPreview: "look at this",
        transcriptHash: expect.any(String),
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the trace POST endpoint in standalone preview", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    await emitCompanionVideoCallTrace({
      traceId: "trace123",
      turnId: "turn_1",
      eventName: "activity_context_changed",
      childId: "ila",
      companionId: "elli",
      timestamp: 1000,
      payload: {
        activeActivity: {
          activityId: "tic_tac_toe",
          board: ["X", null, null, null, "O", null, null, null, null],
          turn: "child",
        },
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/companions/video-call-traces/trace123/events",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      traceId: "trace123",
      eventName: "activity_context_changed",
      origin: "client",
      payload: {
        activeActivity: {
          activityId: "tic_tac_toe",
          board: ["X", null, null, null, "O", null, null, null, null],
        },
      },
    });
  });

  it("removes raw screenshots, audio, and provider payloads from client trace events", () => {
    const payload = sanitizeCompanionVideoCallTracePayload({
      transcript: "This is my full transcript.",
      responseText: "That was a lovely move.",
      visualSnapshot: {
        base64: "raw-camera-frame",
        mimeType: "image/jpeg",
        width: 512,
        height: 384,
      },
      audioBase64: "raw-audio",
      providerPayload: { secret: "nope" },
    });
    const text = JSON.stringify(payload);

    expect(payload).toMatchObject({
      transcriptPreview: "This is my full transcript.",
      transcriptHash: expect.any(String),
      responsePreview: "That was a lovely move.",
      responseHash: expect.any(String),
      visualSnapshot: {
        mimeType: "image/jpeg",
        width: 512,
        height: 384,
      },
    });
    expect(text).not.toContain("raw-camera-frame");
    expect(text).not.toContain("raw-audio");
    expect(text).not.toContain("providerPayload");
  });

  it("detects repeated echo loops before they become invisible walkie-talkie bugs", () => {
    expect(
      detectCompanionVideoCallLoop({
        transcript: "What would you like to do today?",
        lastCompanionResponse: "What would you like to do today?",
        previousTranscriptHash: undefined,
      }),
    ).toMatchObject({
      suspected: true,
      reason: "transcript_echoed_last_companion_response",
    });
    const first = detectCompanionVideoCallLoop({
      transcript: "Can we play?",
      lastCompanionResponse: "",
    });

    expect(
      detectCompanionVideoCallLoop({
        transcript: "Can we play?",
        lastCompanionResponse: "",
        previousTranscriptHash: first.transcriptHash,
      }),
    ).toMatchObject({
      suspected: true,
      reason: "repeated_transcript",
    });
  });

  it("builds a copyable endpoint link for the current trace", () => {
    expect(buildCompanionVideoTraceUrl("trace123", "http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173/api/companions/video-call-traces/trace123",
    );
  });
});
