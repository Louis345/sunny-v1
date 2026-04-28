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
    expect(s).toContain("[Game state update]");
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
});

describe("SessionManager game context injection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("injectGameContext stores summary consumed by takePendingGameContextMessages", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({ phase: "spin", wheelValue: "Jackpot" });
    const msgs = sm.takePendingGameContextMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(String(msgs[0].content)).toContain("Phase: spin");
    expect(String(msgs[0].content)).toContain("Wheel landed on: Jackpot");
    expect(msgs[1].role).toBe("assistant");
    expect(sm.takePendingGameContextMessages()).toEqual([]);
  });

  it("last inject wins — take returns latest only", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({ phase: "first" });
    sm.injectGameContext({ phase: "second" });
    const msgs = sm.takePendingGameContextMessages();
    expect(String(msgs[0].content)).toContain("Phase: second");
    expect(String(msgs[0].content)).not.toContain("Phase: first");
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
      currentWord: "inventor",
      boardState: "I N V E N _ O R",
      wheelValue: "300",
    });
  });
});

describe("takePendingGameContextMessages", () => {
  it("returns [] when no context queued", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    expect(sm.takePendingGameContextMessages()).toEqual([]);
  });

  it("returns 2 messages when context queued", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({ phase: "play" });
    const msgs = sm.takePendingGameContextMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  it("returns [] on second call (consumed)", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    sm.injectGameContext({ score: 10 });
    expect(sm.takePendingGameContextMessages().length).toBe(2);
    expect(sm.takePendingGameContextMessages()).toEqual([]);
  });
});

describe("handleGameEventForSession game_state_update", () => {
  it("calls injectGameContext with merged payload fields", () => {
    const injectGameContext = vi.fn();
    const turnSM = new TurnStateMachine(() => {}, () => {}, () => {});
    const session = {
      childName: "Ila",
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
      injectGameContext,
    };

    handleGameEventForSession(session, {
      type: "game_state_update",
      payload: {
        progress: "Letter A revealed",
        game: "WheelOfFortune",
        wheelValue: "300",
      },
    });

    expect(injectGameContext).toHaveBeenCalledTimes(1);
    const arg = injectGameContext.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.progress).toBe("Letter A revealed");
    expect(arg.game).toBe("WheelOfFortune");
    expect(arg.wheelValue).toBe("300");
    expect(session.noteExternalEvent).toHaveBeenCalled();
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
