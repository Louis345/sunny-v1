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
    expect(send).toHaveBeenCalledWith("audio_done", {
      requestId: expect.any(String),
    });

    const requestId = (fakeSession as unknown as {
      pendingGameNarrationPlayback: { requestId: string };
    }).pendingGameNarrationPlayback.requestId;
    SessionManager.prototype.playbackDone.call(fakeSession, { audible: true, requestId });

    expect(recordEvent).toHaveBeenCalledWith("game_narration", "playback_done", expect.objectContaining({
      activityId: "word-radar",
      nodeId: "n-word-radar",
      reason: "word_radar_response_prompt",
    }));
  });

  it("keeps assessment audio unavailable when the browser reports no audible playback", () => {
    // Human catch: the word was never heard, but the server treated stream completion as delivery.
    // Log miss: playback_done had no audible outcome, so the evidence looked successful.
    const recordEvent = vi.fn();
    const assessment = {
      homeworkId: "homework-1",
      itemId: "item-1",
      word: "sample",
      artifactHash: "artifact-1",
      audioDelivered: false,
      supportIds: [],
      ambiguous: false,
    };
    const fakeSession = {
      pendingGameNarrationPlayback: {
        requestId: "request-1",
        activityId: "word-radar",
        assessmentItemId: "item-1",
      },
      spellingAssessment: assessment,
      spellingAssessmentHistory: new Map([[assessment.itemId, assessment]]),
      debugRecorder: { recordEvent },
      turnSM: { onPlaybackComplete: vi.fn(), consumePendingTranscript: vi.fn() },
      flushPendingRoundComplete: vi.fn(),
      handleEndOfTurn: vi.fn(),
    };

    SessionManager.prototype.playbackDone.call(fakeSession, {
      audible: false,
      reason: "required_audio_not_fully_played",
      requestId: "request-1",
      itemId: "item-1",
    });

    expect(assessment.audioDelivered).toBe(false);
    expect(recordEvent).toHaveBeenCalledWith(
      "game_narration",
      "playback_failed",
      expect.objectContaining({
        assessmentItemId: "item-1",
        reason: "required_audio_not_fully_played",
      }),
    );
    expect(recordEvent).not.toHaveBeenCalledWith(
      "game_narration",
      "playback_done",
      expect.anything(),
    );
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

  it("does not start a second word while the first narration still owns playback", async () => {
    // Human catch: one spelling word played two or three times. The old debounce
    // expired after one second and there was no server-side audio owner.
    const recordEvent = vi.fn();
    const bridge = {
      connect: vi.fn().mockResolvedValue(undefined),
      sendText: vi.fn(),
      finish: vi.fn().mockResolvedValue(undefined),
      hadAudioThisTurn: vi.fn(() => true),
    };
    const fakeSession = {
      childName: "Ila",
      sessionTtsLabel: "EYE-lah",
      debugRecorder: { recordEvent },
      ttsBridge: bridge,
      send: vi.fn(),
      activeGameNarrationRequestId: null,
      pendingGameNarrationPlayback: null,
    };

    await SessionManager.prototype.speakGameNarration.call(fakeSession, "sample.", {
      activityId: "word-radar",
      nodeId: "opening",
      itemId: "item-1",
      reason: "word_radar_listen_phase",
    });
    await SessionManager.prototype.speakGameNarration.call(fakeSession, "sample.", {
      activityId: "word-radar",
      nodeId: "opening",
      itemId: "item-1",
      reason: "word_radar_listen_phase",
    });

    expect(bridge.connect).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith(
      "game_narration",
      "request_suppressed",
      expect.objectContaining({ reason: "playback_in_progress", itemId: "item-1" }),
    );
  });

  it("ignores a stale playback acknowledgement from a different narration request", () => {
    // Human catch: Elli and the game drifted to different words. Browser acks had
    // no request/item identity, so the server credited whichever word was current.
    const recordEvent = vi.fn();
    const assessment = {
      homeworkId: "homework-1",
      itemId: "item-2",
      word: "sample",
      artifactHash: "artifact-1",
      audioDelivered: false,
      supportIds: [],
      ambiguous: false,
    };
    const fakeSession = {
      activeGameNarrationRequestId: "request-current",
      pendingGameNarrationPlayback: {
        requestId: "request-current",
        activityId: "word-radar",
        assessmentItemId: "item-2",
      },
      spellingAssessment: assessment,
      spellingAssessmentHistory: new Map([[assessment.itemId, assessment]]),
      debugRecorder: { recordEvent },
      turnSM: { onPlaybackComplete: vi.fn(), consumePendingTranscript: vi.fn() },
      flushPendingRoundComplete: vi.fn(),
      handleEndOfTurn: vi.fn(),
    };

    SessionManager.prototype.playbackDone.call(fakeSession, {
      audible: true,
      requestId: "request-old",
      itemId: "item-1",
    });

    expect(assessment.audioDelivered).toBe(false);
    expect(fakeSession.pendingGameNarrationPlayback).not.toBeNull();
    expect(fakeSession.turnSM.onPlaybackComplete).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(
      "game_narration",
      "playback_ack_ignored",
      expect.objectContaining({ reason: "request_identity_mismatch" }),
    );
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

  it("does not resurrect narration whose synthesis finishes after barge-in", async () => {
    // Human catch: a canceled spelling word could return after Elli or the child
    // interrupted because synthesis completed after ownership had been cleared.
    let finishSynthesis!: () => void;
    const synthesisPending = new Promise<void>((resolve) => {
      finishSynthesis = resolve;
    });
    const send = vi.fn();
    const fakeSession = {
      childName: "Ila",
      sessionTtsLabel: "EYE-lah",
      debugRecorder: { recordEvent: vi.fn() },
      ttsBridge: {
        connect: vi.fn().mockResolvedValue(undefined),
        sendText: vi.fn(),
        finish: vi.fn(() => synthesisPending),
        stop: vi.fn(),
        hadAudioThisTurn: vi.fn(() => true),
      },
      send,
      activeGameNarrationRequestId: null,
      pendingGameNarrationPlayback: null,
      pendingRoundComplete: null,
      gamePendingRevision: null,
      gameTtsFallbackTimer: null,
      deferredTtsFinish: false,
      currentAbort: null,
      currentCanvasState: null,
      roundNumber: 1,
      turnSM: {
        getState: vi.fn(() => "SPEAKING"),
        onInterrupt: vi.fn(),
        clearGameTtsHold: vi.fn(),
      },
    };

    const narration = SessionManager.prototype.speakGameNarration.call(
      fakeSession,
      "sample.",
      { activityId: "word-radar", itemId: "item-1" },
    );
    await vi.waitFor(() => expect(fakeSession.ttsBridge.finish).toHaveBeenCalled());

    SessionManager.prototype.bargeIn.call(fakeSession);
    finishSynthesis();
    await narration;

    expect(fakeSession.activeGameNarrationRequestId).toBeNull();
    expect(fakeSession.pendingGameNarrationPlayback).toBeNull();
    expect(send).not.toHaveBeenCalledWith(
      "audio_done",
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});
