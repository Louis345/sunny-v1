import { describe, expect, it } from "vitest";
import {
  createCompanionActivityThinkingCue,
  resolveCompanionActivityPhase,
  resolveCompanionConversationMode,
  selectCompanionActivityContextForTalk,
  shouldRequestCompanionActivityAiReaction,
} from "../components/CompanionActivityRuntime";

const activeTicTacToe = {
  activityId: "tic_tac_toe",
  surface: "video_call_overlay",
  status: "active",
  board: ["X", null, null, null, "O", null, null, null, null],
  childMark: "X",
  companionMark: "O",
  turn: "child",
  updatedAt: 1000,
} as const;

const completedTicTacToe = {
  ...activeTicTacToe,
  status: "complete",
  result: "draw",
  summary: "The last tic-tac-toe round ended in a draw.",
  updatedAt: 2000,
} as const;

describe("CompanionActivityRuntime", () => {
  it("keeps repeat-after active across short utterances until the child exits it", () => {
    expect(
      resolveCompanionConversationMode({
        question: "repeat after me",
        currentMode: "social",
        activeActivity: activeTicTacToe,
      }),
    ).toBe("repeat_after");
    expect(
      resolveCompanionConversationMode({
        question: "Ten",
        currentMode: "repeat_after",
        activeActivity: activeTicTacToe,
      }),
    ).toBe("repeat_after");
    expect(
      resolveCompanionConversationMode({
        question: "Nine",
        currentMode: "repeat_after",
        activeActivity: completedTicTacToe,
      }),
    ).toBe("repeat_after");
    expect(
      resolveCompanionConversationMode({
        question: "back to the game",
        currentMode: "repeat_after",
        activeActivity: activeTicTacToe,
      }),
    ).toBe("game");
    expect(
      resolveCompanionConversationMode({
        question: "stop repeating",
        currentMode: "repeat_after",
        activeActivity: activeTicTacToe,
      }),
    ).toBe("social");
  });

  it("does not send completed tic-tac-toe context into social or repeat-after turns", () => {
    expect(
      selectCompanionActivityContextForTalk({
        activeActivity: completedTicTacToe,
        conversationMode: "social",
      }),
    ).toBeUndefined();
    expect(
      selectCompanionActivityContextForTalk({
        activeActivity: completedTicTacToe,
        conversationMode: "repeat_after",
      }),
    ).toBeUndefined();
    expect(
      selectCompanionActivityContextForTalk({
        activeActivity: completedTicTacToe,
        conversationMode: "game",
      }),
    ).toBe(completedTicTacToe);
  });

  it("keeps post-move events nonverbal; companion-move speech arrives via the gated move packet instead", () => {
    // The predicate only needs the event type; the full envelope is the
    // game's business.
    const companionMove = { type: "companion_activity_companion_move" } as const;
    const roundComplete = { type: "companion_activity_round_complete" } as const;
    const childMove = { type: "companion_activity_child_move" } as const;
    const started = { type: "companion_activity_started" } as const;

    expect(shouldRequestCompanionActivityAiReaction(childMove)).toBe(false);
    expect(shouldRequestCompanionActivityAiReaction(started)).toBe(true);
    expect(shouldRequestCompanionActivityAiReaction(companionMove)).toBe(false);
    expect(shouldRequestCompanionActivityAiReaction(roundComplete)).toBe(true);
  });

  it("maps tic-tac-toe callbacks into reusable activity phases", () => {
    expect(resolveCompanionActivityPhase({ phase: "child_move" })).toBe("child_turn");
    expect(resolveCompanionActivityPhase({ phase: "companion_thinking" })).toBe(
      "companion_thinking",
    );
    expect(resolveCompanionActivityPhase({ phase: "companion_move" })).toBe(
      "companion_move",
    );
    expect(resolveCompanionActivityPhase({ phase: "round_complete" })).toBe(
      "round_complete",
    );
  });

  it("creates a thinking cue without emitting the t-rex-prone think animation", () => {
    const cue = createCompanionActivityThinkingCue({
      now: 1234,
    });

    expect(cue).toEqual({
      emote: "thinking",
      intensity: 0.62,
      durationMs: 1200,
      timestamp: 1234,
    });
    expect(JSON.stringify(cue)).not.toContain('"animation":"think"');
  });
});
