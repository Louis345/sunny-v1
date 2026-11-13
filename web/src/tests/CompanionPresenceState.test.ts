import { describe, expect, it } from "vitest";
import {
  COMPANION_LIFE_LAB_MAX_SCRIPT_STEPS,
  COMPANION_LIFE_LAB_SCRIPT,
  COMPANION_SPEECH_GRACE_MS,
  createCompanionPresenceState,
  reduceCompanionPresence,
} from "../companion/companionPresenceState";

describe("companion presence state", () => {
  it("holds the speaking body through short sentence pauses", () => {
    const speaking = reduceCompanionPresence(
      createCompanionPresenceState(),
      { type: "speech_started", atMs: 0 },
    );
    const paused = reduceCompanionPresence(speaking, {
      type: "speech_paused",
      atMs: 100,
    });

    expect(paused.visiblePhase).toBe("speaking");
    expect(paused.speechGraceUntilMs).toBe(100 + COMPANION_SPEECH_GRACE_MS);

    const insideGrace = reduceCompanionPresence(paused, {
      type: "time_advanced",
      atMs: 100 + COMPANION_SPEECH_GRACE_MS - 1,
    });
    expect(insideGrace.visiblePhase).toBe("speaking");

    const graceExpired = reduceCompanionPresence(insideGrace, {
      type: "time_advanced",
      atMs: 100 + COMPANION_SPEECH_GRACE_MS,
    });
    expect(graceExpired.visiblePhase).toBe("listening");
  });

  it("lets a success reaction interrupt speaking and then resume it", () => {
    const speaking = reduceCompanionPresence(
      createCompanionPresenceState(),
      { type: "speech_started", atMs: 0 },
    );
    const celebrating = reduceCompanionPresence(speaking, {
      type: "success_reaction",
      requestId: 1,
      atMs: 200,
    });

    expect(celebrating.visiblePhase).toBe("celebrating");
    expect(celebrating.resumePhase).toBe("speaking");

    const resumed = reduceCompanionPresence(celebrating, {
      type: "one_shot_finished",
      requestId: 1,
      atMs: 900,
    });
    expect(resumed.visiblePhase).toBe("speaking");
    expect(resumed.activeOverrideRequestId).toBeNull();
  });

  it("ignores a stale completion after a newer reaction supersedes it", () => {
    const speaking = reduceCompanionPresence(
      createCompanionPresenceState(),
      { type: "speech_started", atMs: 0 },
    );
    const firstReaction = reduceCompanionPresence(speaking, {
      type: "success_reaction",
      requestId: 1,
      atMs: 100,
    });
    const newerReaction = reduceCompanionPresence(firstReaction, {
      type: "success_reaction",
      requestId: 2,
      atMs: 200,
    });
    const staleFinish = reduceCompanionPresence(newerReaction, {
      type: "one_shot_finished",
      requestId: 1,
      atMs: 300,
    });

    expect(staleFinish.visiblePhase).toBe("celebrating");
    expect(staleFinish.activeOverrideRequestId).toBe(2);
    expect(staleFinish.transitionCount).toBe(newerReaction.transitionCount);
  });

  it("records every visible phase change as a structured transition", () => {
    const listening = reduceCompanionPresence(
      createCompanionPresenceState(),
      { type: "session_listening", atMs: 10 },
    );
    const thinking = reduceCompanionPresence(listening, {
      type: "response_thinking",
      atMs: 20,
    });

    expect(thinking.lastTransition).toEqual({
      component: "companion-presence",
      action: "response_thinking",
      result: "listening->thinking",
      atMs: 20,
    });
    expect(thinking.transitionCount).toBe(2);
  });

  it("keeps the automatic demo sequence bounded", () => {
    expect(COMPANION_LIFE_LAB_SCRIPT).toHaveLength(8);
    expect(COMPANION_LIFE_LAB_SCRIPT.length).toBeLessThanOrEqual(
      COMPANION_LIFE_LAB_MAX_SCRIPT_STEPS,
    );
    expect(COMPANION_LIFE_LAB_SCRIPT.map((step) => step.event.type)).toEqual([
      "session_listening",
      "response_thinking",
      "speech_started",
      "speech_paused",
      "speech_started",
      "success_reaction",
      "one_shot_finished",
      "session_ended",
    ]);
  });
});
