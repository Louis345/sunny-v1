import { describe, expect, it, vi } from "vitest";

vi.mock("./learningAttemptEvents", () => ({
  recordLearningAttempt: vi.fn(() => ({
    attempt: { domain: "spelling", word: "sun", correct: true },
    skipped: false,
  })),
}));

import { handleGameEventForSession } from "./game-event-handler";

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
});
