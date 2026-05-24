import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";

describe("SessionManager game narration", () => {
  it("records playback proof after game narration enters the audio path", async () => {
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
    expect(recordEvent).toHaveBeenCalledWith("game_narration", "playback_done", expect.objectContaining({
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    }));
    expect(send).toHaveBeenCalledWith("audio_done");
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
