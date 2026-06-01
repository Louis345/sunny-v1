import { describe, expect, it } from "vitest";
import type { CompanionTicTacToeGameEvent } from "../components/CompanionTicTacToe";
import {
  createCompanionActivityThinkingCommand,
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

  it("keeps ordinary companion moves local and reserves AI speech for authored beats", () => {
    const companionMove: CompanionTicTacToeGameEvent = {
      type: "companion_tic_tac_toe_companion_move",
      activityId: "tic_tac_toe",
      surface: "video_call_overlay",
      companionName: "Elli",
      timestamp: 1000,
      board: ["X", null, null, null, "O", null, null, null, null],
      square: 5,
      mark: "O",
    };
    const roundComplete: CompanionTicTacToeGameEvent = {
      type: "companion_tic_tac_toe_round_complete",
      activityId: "tic_tac_toe",
      surface: "video_call_overlay",
      companionName: "Elli",
      timestamp: 2000,
      board: ["X", "O", "X", "X", "O", "O", "O", "X", "X"],
      result: "draw",
    };

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

  it("creates a non-looping thinking cue through the validated command contract", () => {
    const command = createCompanionActivityThinkingCommand({
      childId: "showroom",
      now: 1234,
    });

    expect(command).toMatchObject({
      apiVersion: "1.0",
      childId: "showroom",
      source: "diag",
      type: "animate",
      payload: {
        animation: "think",
        loop: false,
      },
    });
  });
});
