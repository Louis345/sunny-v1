import { describe, it, expect, vi, beforeEach } from "vitest";
import WebSocket from "ws";
import { buildGameContextSummary } from "../server/gameContextSummary";
import {
  createThinkingEmoteOnFirstToolInStep,
  fireThinkingEmoteBeforeTools,
} from "../server/companionThinkingEmote";
import { compressGameScreenshotBase64 } from "../server/compressGameScreenshot";
import { handleGameEventForSession } from "../server/game-event-handler";
import { hostSessionStatus } from "../server/host-tool-handlers";
import { SessionManager } from "../server/session-manager";
import { buildCanvasContextMessage, createSessionContext } from "../server/session-context";
import { TurnStateMachine } from "../server/session-state";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmWQQAAAABJRU5ErkJggg==";

function mockWs() {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe("buildGameContextSummary", () => {
  it("includes phase when present", () => {
    const s = buildGameContextSummary({ phase: "response" });
    expect(s).toContain("[Internal game state]");
    expect(s).toContain("not child speech");
    expect(s).toContain("Phase: response");
  });

  it("includes wheelValue when present", () => {
    const s = buildGameContextSummary({ wheelValue: "500" });
    expect(s).toContain("Wheel landed on: 500");
  });

  it("omits lines for undefined fields", () => {
    const s = buildGameContextSummary({ game: "test" });
    expect(s).not.toContain("Phase:");
    expect(s).not.toContain("Word:");
    expect(s).toContain("Game: test");
  });

  it("formats matchRatio as percent", () => {
    const s = buildGameContextSummary({ matchRatio: 0.42 });
    expect(s).toContain("STT match: 42%");
  });

  it("includes itemIndex 0-based display as 1-based", () => {
    const s = buildGameContextSummary({ itemIndex: 2, totalItems: 5 });
    expect(s).toContain("Item 3 of 5");
  });

  it("includes node_complete handoff fields (missed / correct words)", () => {
    const s = buildGameContextSummary({
      phase: "node_complete",
      game: "word-radar",
      nodeId: "n-wr",
      accuracy: 0.65,
      completed: true,
      wordsAttempted: 20,
      missedWords: ["coldest", "figure"],
      correctWords: ["faster", "slower"],
      progress: "word-radar finished: 65% accuracy — focus coldest, figure",
    });
    expect(s).toContain("Phase: node_complete");
    expect(s).toContain("Game: word-radar");
    expect(s).toContain("Missed words: coldest, figure");
    expect(s).toContain("Correct words: faster, slower");
    expect(s).toContain("Session accuracy: 65%");
    expect(s).toContain("Items attempted: 20");
  });

  it("includes action, guessedLetters, wrongGuesses, and screenText when present", () => {
    const s = buildGameContextSummary({
      action: "letter_selected",
      guessedLetters: ["I", "N"],
      wrongGuesses: 1,
      maxWrongGuesses: 6,
      screenText: ["BONUS ROUND", "GUESS THE WORD"],
    });
    expect(s).toContain("Action: letter_selected");
    expect(s).toContain("Guessed letters: I, N");
    expect(s).toContain("Wrong guesses: 1 of 6");
    expect(s).toContain("Screen text: BONUS ROUND | GUESS THE WORD");
  });

  it("keeps activity identity explicit so companion cannot rename pronunciation as word-radar", () => {
    const s = buildGameContextSummary({
      game: "pronunciation",
      activityId: "pronunciation",
      phase: "node_complete",
      currentWord: "ahead",
      lastOutcomeWord: "away",
      accuracy: 0.59,
      completed: true,
      wordsAttempted: 8,
      missedWords: ["ahead", "away"],
      correctWords: ["above", "ago"],
    });
    expect(s).toContain("Game: pronunciation");
    expect(s).toContain("Activity: pronunciation");
    expect(s).toContain("Word: ahead");
    expect(s).toContain("Last outcome word: away");
    expect(s).toContain("Session accuracy: 59%");
    expect(s).not.toContain("Word Radar");
    expect(s).not.toContain("word-radar");
  });

  it("ignores unknown fields but includes explicit score and coin fields", () => {
    const s = buildGameContextSummary({
      game: "Wheel of Fortune",
      score: 140,
      coins: 140,
      coinsEarned: 40,
      inventedTotal: 12000,
      secretEnv: "ANTHROPIC_API_KEY=never",
    });
    expect(s).toContain("Score: 140");
    expect(s).toContain("Coins: 140");
    expect(s).toContain("Coins earned: 40");
    expect(s).not.toContain("12000");
    expect(s).not.toContain("ANTHROPIC_API_KEY");
  });

  it("warns the companion when no exact coin amount is available", () => {
    const s = buildGameContextSummary({
      game: "Wheel of Fortune",
      phase: "picking",
      wheelValue: "500",
    });
    expect(s).toContain("No exact coin amount is available");
    expect(s).not.toContain("Coins: 500");
    expect(s).not.toContain("Coins earned: 500");
  });

  it("hides unrevealed Wheel answers from companion context", () => {
    const s = buildGameContextSummary({
      game: "Wheel of Fortune",
      phase: "playing",
      currentWord: "above",
      answerVisibility: "hidden",
      boardState: "_ B _ V E",
    });

    expect(s).toContain("Game: Wheel of Fortune");
    expect(s).toContain("Board: _ B _ V E");
    expect(s).toContain("Answer visibility: hidden");
    expect(s).not.toContain("Word: above");
    expect(s).not.toContain("above");
  });

  it("allows revealed Wheel answers after game completion", () => {
    const s = buildGameContextSummary({
      game: "Wheel of Fortune",
      phase: "complete",
      currentWord: "above",
      answerVisibility: "revealed",
      boardState: "A B O V E",
    });

    expect(s).toContain("Answer visibility: revealed");
    expect(s).toContain("Word: above");
  });
});

describe("SessionManager game context injection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("broadcasts session context through chartChildId when voice name differs from sandbox chart id", () => {
    const previousRoot = process.env.SUNNY_CONTEXT_ROOT;
    process.env.SUNNY_CONTEXT_ROOT = `${process.cwd()}/.sunny-sandbox/context`;
    try {
      const ws = mockWs();
      const sm = new SessionManager(ws, "Ila", false, { chartChildId: "demo_adaptive" });
      (sm as unknown as { ctx: { serialize: () => unknown } }).ctx = {
        serialize: () => ({ sessionId: "sandbox-context" }),
      };

      expect(() =>
        (sm as unknown as { broadcastContext: () => void }).broadcastContext(),
      ).not.toThrow();

      const sent = vi.mocked(ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)));
      expect(sent).toContainEqual(
        expect.objectContaining({
          type: "session_context",
          sessionId: "sandbox-context",
          readingCanvas: expect.any(Object),
        }),
      );
    } finally {
      if (previousRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
      else process.env.SUNNY_CONTEXT_ROOT = previousRoot;
    }
  });

  it("builds per-turn learning context through chartChildId when voice name differs from sandbox chart id", () => {
    const previousRoot = process.env.SUNNY_CONTEXT_ROOT;
    process.env.SUNNY_CONTEXT_ROOT = `${process.cwd()}/.sunny-sandbox/context`;
    try {
      const ctx = createSessionContext({
        childName: "Ila",
        chartChildId: "demo_adaptive",
        sessionType: "homework",
        companionName: "Elli",
      });

      expect(() => buildCanvasContextMessage(ctx, { lastChildUtterance: "help" })).not.toThrow();
    } finally {
      if (previousRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
      else process.env.SUNNY_CONTEXT_ROOT = previousRoot;
    }
  });

  it("injectGameContext updates board state without queuing a companion heartbeat", async () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({ phase: "spin", wheelValue: "Jackpot" });
    expect(sm.takePendingGameContextMessages()).toEqual([]);

    const status = await hostSessionStatus(sm as never);
    expect(status.currentActivityState).toMatchObject({
      phase: "spin",
      wheelValue: "Jackpot",
    });
  });

  it("last inject wins in the current board snapshot", async () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({ phase: "first" });
    sm.injectGameContext({ phase: "second" });
    expect(sm.takePendingGameContextMessages()).toEqual([]);

    const status = await hostSessionStatus(sm as never);
    expect(status.currentActivityState).toMatchObject({ phase: "second" });
  });

  it("queues node completion handoff without merging stale iframe heartbeat context", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.queueNodeCompletionHandoff({
      phase: "node_complete",
      game: "word-radar",
      nodeId: "n-wr",
      progress: "Focus next: coldest, figure",
      missedWords: ["coldest", "figure"],
      accuracy: 0.65,
      completed: true,
      wordsAttempted: 20,
    });
    sm.injectGameContext({
      phase: "launched",
      game: "spell-check",
      progress: "Spell check on screen",
    });
    expect(sm.takePendingGameContextMessages()).toEqual([]);
    const body = sm.buildCurrentBoardContextForTurn("What happened?");
    expect(body).toContain("word-radar");
    expect(body).not.toContain("Spell check on screen");
  });

  it("node completion handoff clears stale previous iframe context", async () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({
      phase: "playing",
      game: "word-radar",
      progress: "Old heartbeat says Word Radar",
    });
    sm.queueNodeCompletionHandoff({
      phase: "node_complete",
      game: "pronunciation",
      activityId: "pronunciation",
      progress: "Pronunciation finished: 59% accuracy",
      accuracy: 0.59,
      completed: true,
      wordsAttempted: 8,
    });
    expect(sm.takePendingGameContextMessages()).toEqual([]);
    const body = sm.buildCurrentBoardContextForTurn("What happened?");
    expect(body).toContain("pronunciation");
    expect(body).toContain("59%");
    expect(body).not.toContain("Old heartbeat");
    expect(body).not.toContain("word-radar");

    const status = await hostSessionStatus(sm as never);
    expect(status.currentActivityState).toMatchObject({
      game: "pronunciation",
      activityId: "pronunciation",
      phase: "node_complete",
      completed: true,
    });
  });

  it("sessionStatus exposes the latest structured game state after injection is consumed", async () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({
      game: "Wheel of Fortune",
      phase: "picking",
      currentWord: "inventor",
      boardState: "I N V E N _ O R",
      wheelValue: "300",
    });
    sm.takePendingGameContextMessages();

    const status = await hostSessionStatus(sm as never);

    expect(status.currentActivityState).toMatchObject({
      game: "Wheel of Fortune",
      phase: "picking",
      answerVisibility: "hidden",
      boardState: "I N V E N _ O R",
      wheelValue: "300",
    });
    expect(JSON.stringify(status.currentActivityState)).not.toContain("inventor");
  });
});

describe("takePendingGameContextMessages", () => {
  it("returns [] when no context queued", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    expect(sm.takePendingGameContextMessages()).toEqual([]);
  });

  it("does not emit synthetic companion messages when authoritative completion context is queued", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.queueNodeCompletionHandoff({ phase: "node_complete", game: "spell-check" });
    expect(sm.takePendingGameContextMessages()).toEqual([]);
    expect(sm.buildCurrentBoardContextForTurn("What happened?")).toContain("spell-check");
    expect(sm.buildCurrentBoardContextForTurn("What happened?")).toContain("node_complete");
  });

  it("returns [] on second call (consumed)", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.queueNodeCompletionHandoff({ phase: "node_complete", score: 10 });
    expect(sm.takePendingGameContextMessages()).toEqual([]);
    expect(sm.takePendingGameContextMessages()).toEqual([]);
  });
});

describe("handleGameEventForSession game_state_update", () => {
  it("updates the canonical board snapshot with merged payload fields", () => {
    const updateCurrentBoardSnapshot = vi.fn();
    const turnSM = new TurnStateMachine(() => {}, () => {}, () => {});
    const session = {
      childName: "Ila",
      sessionId: "voice-1",
      ctx: null,
      turnSM,
      send: () => {},
      gameBridge: { startGame: () => {}, handleGameEvent: () => {} },
      pendingGameStart: null,
      currentCanvasRevision: 0,
      broadcastContext: () => {},
      spellCheckSessionActive: false,
      activeSpellCheckWord: "",
      clearActiveCanvasActivity: () => {},
      wbActive: false,
      wbRound: 0,
      wbWord: "",
      wbLastProcessedRound: 0,
      pendingRoundComplete: null,
      runCompanionResponse: async () => {},
      activeCanvasActivity: { snapshot: null },
      worksheetProblemIndex: 0,
      currentCanvasState: null,
      setActiveCanvasActivity: () => {},
      spaceInvadersRewardActive: false,
      suppressTranscripts: false,
      sessionTtsLabel: "Ila",
      noteExternalEvent: vi.fn(),
      updateCurrentBoardSnapshot,
    };

    handleGameEventForSession(session, {
      type: "game_state_update",
      payload: {
        progress: "Letter A revealed",
        game: "WheelOfFortune",
        wheelValue: "300",
      },
    });

    expect(updateCurrentBoardSnapshot).toHaveBeenCalledTimes(1);
    const arg = updateCurrentBoardSnapshot.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.progress).toBe("Letter A revealed");
    expect(arg.game).toBe("WheelOfFortune");
    expect(arg.wheelValue).toBe("300");
    expect(session.noteExternalEvent).not.toHaveBeenCalled();
  });
});

describe("fireThinkingEmoteBeforeTools", () => {
  it("invokes companionAct with thinking emote", async () => {
    const companionAct = vi.fn().mockResolvedValue({ ok: true });
    await fireThinkingEmoteBeforeTools({ companionAct });
    expect(companionAct).toHaveBeenCalledWith({
      type: "emote",
      payload: { emote: "thinking", intensity: 0.7 },
    });
  });
});

describe("createThinkingEmoteOnFirstToolInStep", () => {
  it("fires at most once before multiple tool executes in the same LLM step", async () => {
    const companionAct = vi.fn().mockResolvedValue({ ok: true });
    const h = createThinkingEmoteOnFirstToolInStep({ companionAct });
    h.onStepStart();
    await h.onToolCallStart();
    await h.onToolCallStart();
    expect(companionAct).toHaveBeenCalledTimes(1);
  });

  it("fires again after onStepStart resets the step", async () => {
    const companionAct = vi.fn().mockResolvedValue({ ok: true });
    const h = createThinkingEmoteOnFirstToolInStep({ companionAct });
    h.onStepStart();
    await h.onToolCallStart();
    h.onStepStart();
    await h.onToolCallStart();
    expect(companionAct).toHaveBeenCalledTimes(2);
  });
});

describe("compressGameScreenshotBase64", () => {
  it("returns valid JPEG base64 for a tiny PNG input", async () => {
    const out = await compressGameScreenshotBase64(PNG_1X1_BASE64);
    expect(out.length).toBeGreaterThan(0);
    const buf = Buffer.from(out, "base64");
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf.length).toBeLessThan(50_000);
  });
});
