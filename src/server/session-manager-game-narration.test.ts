import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";

describe("SessionManager game narration", () => {
  it("does not call provider completion browser playback proof", async () => {
    const recordEvent = vi.fn();
    const send = vi.fn();
    const fakeSession = {
      childName: "Reina",
      sessionTtsLabel: "Ray-nah",
      debugRecorder: { recordEvent },
      noteExternalEvent: vi.fn(),
      ttsBridge: {
        connect: vi.fn().mockResolvedValue(undefined),
        sendText: vi.fn(),
        finish: vi.fn().mockResolvedValue(undefined),
      },
      send,
      turnSM: { onPlaybackComplete: vi.fn(), consumePendingTranscript: vi.fn() },
      flushPendingRoundComplete: vi.fn(),
      handleEndOfTurn: vi.fn(),
    };

    await SessionManager.prototype.speakGameNarration.call(fakeSession, "know.", {
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    });

    expect(recordEvent).toHaveBeenCalledWith("game_narration", "speak", expect.objectContaining({
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    }));
    expect(recordEvent).toHaveBeenCalledWith("game_narration", "tts_stream_done", expect.objectContaining({
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    }));
    expect(recordEvent).not.toHaveBeenCalledWith("game_narration", "playback_done", expect.anything());
    expect(send).toHaveBeenCalledWith("audio_done");

    SessionManager.prototype.playbackDone.call(fakeSession);

    expect(recordEvent).toHaveBeenCalledWith("game_narration", "playback_done", expect.objectContaining({
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    }));
  });

  it("does not append narration proof into companion conversation history", async () => {
    const recordEvent = vi.fn();
    const fakeSession = {
      childName: "Reina",
      sessionTtsLabel: "Ray-nah",
      debugRecorder: { recordEvent },
      noteExternalEvent: vi.fn(),
      ttsBridge: {
        connect: vi.fn().mockResolvedValue(undefined),
        sendText: vi.fn(),
        finish: vi.fn().mockResolvedValue(undefined),
      },
      send: vi.fn(),
    };

    await SessionManager.prototype.speakGameNarration.call(fakeSession, "know.", {
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    });

    expect(fakeSession.noteExternalEvent).not.toHaveBeenCalled();
  });

  it("does not count interrupted spelling narration as completed playback", () => {
    const recordEvent = vi.fn();
    const fakeSession = {
      pendingGameNarrationPlayback: {
        activityId: "word-radar",
        assessmentItemId: "item-1",
      },
      pendingRoundComplete: null,
      gamePendingRevision: null,
      gameTtsFallbackTimer: null,
      deferredTtsFinish: false,
      currentAbort: null,
      currentCanvasState: null,
      childName: "Lab",
      roundNumber: 1,
      debugRecorder: { recordEvent },
      turnSM: {
        getState: vi.fn(() => "SPEAKING"),
        onInterrupt: vi.fn(),
        clearGameTtsHold: vi.fn(),
      },
      ttsBridge: { stop: vi.fn() },
      send: vi.fn(),
    };

    SessionManager.prototype.bargeIn.call(fakeSession);

    expect(fakeSession.pendingGameNarrationPlayback).toBeNull();
    expect(recordEvent).toHaveBeenCalledWith(
      "game_narration",
      "playback_interrupted",
      expect.objectContaining({ assessmentItemId: "item-1" }),
    );
  });
});
