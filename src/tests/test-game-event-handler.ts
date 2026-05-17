import { describe, expect, it } from "vitest";
import { TurnStateMachine } from "../server/session-state";
import { handleGameEventForSession } from "../server/game-event-handler";

describe("GameEventHandler", () => {
  it("processes clock_answer via clock tracker path without throw", () => {
    const turnSM = new TurnStateMachine(
      () => {},
      () => {},
      () => {},
    );
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
    };
    expect(() =>
      handleGameEventForSession(session, {
        type: "clock_answer",
        correct: true,
        hour: 3,
        minute: 0,
      }),
    ).not.toThrow();
  });

  it("voice_control suppresses organic companion speech only for mic-owned flow games", () => {
    const turnSM = new TurnStateMachine(
      () => {},
      () => {},
      () => {},
    );
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
    };

    handleGameEventForSession(session, {
      type: "voice_control",
      voiceEnabled: false,
      game: "word-radar",
    });

    expect(session.suppressTranscripts).toBe(false);

    handleGameEventForSession(session, {
      type: "voice_control",
      voiceEnabled: false,
      game: "pronunciation",
    });

    expect(session.suppressTranscripts).toBe(true);
  });
});
