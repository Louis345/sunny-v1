import { describe, expect, it, vi } from "vitest";

vi.mock("./learningAttemptEvents", () => ({
  recordLearningAttempt: vi.fn(() => ({
    attempt: { domain: "spelling", word: "sun", correct: true },
    skipped: false,
  })),
}));

vi.mock("./companionVideoCallTrace", () => ({
  recordCompanionVideoCallTraceEvent: vi.fn(),
}));

import { handleGameEventForSession } from "./game-event-handler";
import { recordCompanionVideoCallTraceEvent } from "./companionVideoCallTrace";

describe("game event handler companion events", () => {
  it("keeps correct/wrong companion events visual-only while recording context", () => {
    const fakeSession = {
      send: vi.fn(),
      noteExternalEvent: vi.fn(),
    };

    handleGameEventForSession(fakeSession, {
      type: "companion_event",
      payload: {
        trigger: "correct_answer",
        childId: "reina",
        timestamp: 123,
      },
    });

    expect(fakeSession.send).toHaveBeenCalledWith("companion_event", {
      payload: {
        trigger: "correct_answer",
        childId: "reina",
        timestamp: 123,
      },
    });
    expect(fakeSession.noteExternalEvent).toHaveBeenCalledWith({
      source: "companion_event",
      summary: "Companion VFX event: correct_answer.",
    });
  });

  it("appends attempt_event to the session game trace stream", () => {
    const fakeSession = {
      recordDebugEvent: vi.fn(),
      recordGameTrace: vi.fn(),
      noteExternalEvent: vi.fn(),
    };

    handleGameEventForSession(fakeSession, {
      type: "attempt_event",
      game: "word-radar",
      activityId: "word-radar",
      domain: "spelling",
      childId: "reina",
      target: "sun",
      correct: true,
      attempts: 1,
    });

    expect(fakeSession.recordGameTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "attempt_event",
        source: "game_event_handler",
        game: "word-radar",
        activityId: "word-radar",
        target: "sun",
        correct: true,
        attempts: 1,
      }),
    );
  });

  it("appends companion video-call activity events to the same session game trace stream", () => {
    const fakeSession = {
      recordDebugEvent: vi.fn(),
      recordGameTrace: vi.fn(),
      noteExternalEvent: vi.fn(),
    };

    handleGameEventForSession(fakeSession, {
      type: "game_state_update",
      version: "1.0",
      payload: {
        type: "companion_tic_tac_toe_child_move",
        childId: "ila",
        companionId: "elli",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        square: 1,
        mark: "X",
        callSource: "showroom",
        relationshipState: "previewing",
      },
    });

    expect(fakeSession.recordDebugEvent).toHaveBeenCalledWith(
      "flow_game",
      "companion_tic_tac_toe_child_move",
      expect.objectContaining({
        activityId: "tic_tac_toe",
        companionId: "elli",
        square: 1,
      }),
    );
    expect(fakeSession.recordGameTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "companion_tic_tac_toe_child_move",
        source: "game_event_handler",
        activityId: "tic_tac_toe",
        companionId: "elli",
        square: 1,
        mark: "X",
        callSource: "showroom",
        relationshipState: "previewing",
      }),
    );
  });

  it("persists wrapped companion video-call trace events into linkable trace folders", () => {
    const fakeSession = {
      recordDebugEvent: vi.fn(),
      recordGameTrace: vi.fn(),
      noteExternalEvent: vi.fn(),
    };

    handleGameEventForSession(fakeSession, {
      type: "companion_video_call_trace",
      version: "1.0",
      payload: {
        traceId: "trace123",
        turnId: "trace123_turn_1",
        eventName: "speech_result",
        childId: "ila",
        companionId: "elli",
        callSource: "showroom",
        relationshipState: "previewing",
        timestamp: 1000,
        payload: {
          transcript: "Can you see this?",
          visualSnapshot: { base64: "raw-frame", width: 512, height: 384 },
        },
      },
    });

    expect(recordCompanionVideoCallTraceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace123",
        turnId: "trace123_turn_1",
        eventName: "speech_result",
        childId: "ila",
        companionId: "elli",
        payload: expect.objectContaining({
          transcript: "Can you see this?",
        }),
      }),
    );
  });
});
