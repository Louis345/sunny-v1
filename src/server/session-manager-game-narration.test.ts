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

    SessionManager.prototype.playbackDone.call(fakeSession, { audible: true });

    expect(recordEvent).toHaveBeenCalledWith("game_narration", "playback_done", expect.objectContaining({
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    }));
  });

  it("records an empty browser delivery as playback_failed instead of playback_done", async () => {
    const recordEvent = vi.fn();
    const fakeSession = {
      childName: "Ila", sessionTtsLabel: "EYE-lah", debugRecorder: { recordEvent }, noteExternalEvent: vi.fn(),
      ttsBridge: { connect: vi.fn().mockResolvedValue(undefined), sendText: vi.fn(), finish: vi.fn().mockResolvedValue(undefined) }, send: vi.fn(),
      turnSM: { onPlaybackComplete: vi.fn(), consumePendingTranscript: vi.fn() }, flushPendingRoundComplete: vi.fn(), handleEndOfTurn: vi.fn(),
    };
    await SessionManager.prototype.speakGameNarration.call(fakeSession, "able.", { activityId: "word-radar", itemId: "i1" });
    SessionManager.prototype.playbackDone.call(fakeSession, { audible: false, reason: "no_audio_chunks" });
    expect(recordEvent).toHaveBeenCalledWith("game_narration", "playback_failed", expect.objectContaining({ reason: "no_audio_chunks" }));
    expect(recordEvent).not.toHaveBeenCalledWith("game_narration", "playback_done", expect.anything());
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
});
