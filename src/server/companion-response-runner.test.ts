import { describe, expect, it, vi } from "vitest";
import {
  claimCompanionResponseTurn,
  deferCompanionUntilNarrationFinishes,
} from "./companion-response-runner";

describe("companion response audio ownership", () => {
  it("revokes an older model turn as soon as a newer child turn begins", () => {
    // Human catch: three rapid help requests produced interleaved words in one
    // spoken reply. The log showed separate model starts but a shared TTS
    // buffer; the lab had tested barge-in state, not late provider callbacks.
    const session: { companionResponseTurnId?: number } = {};
    const first = claimCompanionResponseTurn(session);
    expect(first.isCurrent()).toBe(true);

    const second = claimCompanionResponseTurn(session);

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(second.turnId).toBe(first.turnId + 1);
  });

  it("queues Elli's turn while a game narration owns the shared audio channel", () => {
    // Human catch: Elli and the spelling word could overlap because each path
    // believed it owned the same TTS stream and browser completion signal.
    const setPendingTranscript = vi.fn();
    const onInterrupt = vi.fn();
    const recordDebugEvent = vi.fn();
    const session = {
      activeGameNarrationRequestId: "request-1",
      pendingGameNarrationPlayback: null,
      turnSM: {
        setPendingTranscript,
        getState: vi.fn(() => "LOADING"),
        onInterrupt,
      },
      recordDebugEvent,
    };

    expect(
      deferCompanionUntilNarrationFinishes(session, "Elli, can you help me?"),
    ).toBe(true);
    expect(setPendingTranscript).toHaveBeenCalledWith("Elli, can you help me?");
    expect(onInterrupt).toHaveBeenCalledTimes(1);
    expect(recordDebugEvent).toHaveBeenCalledWith(
      "companion",
      "deferred_for_game_narration",
      expect.objectContaining({ requestId: "request-1" }),
    );
  });

  it("allows Elli to speak when no game narration owns audio", () => {
    const setPendingTranscript = vi.fn();
    const session = {
      activeGameNarrationRequestId: null,
      pendingGameNarrationPlayback: null,
      turnSM: {
        setPendingTranscript,
        getState: vi.fn(() => "IDLE"),
        onInterrupt: vi.fn(),
      },
      recordDebugEvent: vi.fn(),
    };

    expect(deferCompanionUntilNarrationFinishes(session, "Hello")).toBe(false);
    expect(setPendingTranscript).not.toHaveBeenCalled();
  });
});
