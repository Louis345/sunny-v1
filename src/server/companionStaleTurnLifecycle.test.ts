import { afterEach, describe, expect, it, vi } from "vitest";
const { runAgent } = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock("../agents/elli/run", () => ({ runAgent }));
import { runCompanionResponseForSession } from "./companion-response-runner";
import { TurnStateMachine } from "./session-state";

afterEach(() => vi.clearAllMocks());

function harness() {
  let audio: { requestId: string } | undefined;
  const session: any = {
    sessionId: "stale-lab", companion: { name: "Elli", systemPrompt: "Teach naturally from the current activity." },
    conversationHistory: [], gamePendingRevision: null,
    currentBoardSnapshot: { nodeId: "practice", itemId: "word-1", launchToken: "live" },
    buildAgentToolkit: () => ({}), send: vi.fn(), flushPendingRoundComplete: vi.fn(),
    recordDebugEvent: vi.fn(), recordDebugError: vi.fn(), handleEndOfTurn: vi.fn(async () => {}),
    ttsBridge: {
      beginPlayback: (requestId: string) => { audio = { requestId }; },
      currentPlaybackIdentity: () => audio, connect: async () => {}, stop: vi.fn(), finish: vi.fn(),
    },
  };
  session.turnSM = new TurnStateMachine(vi.fn(), vi.fn());
  return { session, replaceAudio: (requestId: string) => { audio = { requestId }; } };
}

// Oct 20 human catch: stale output was correctly rejected, but PROCESSING
// survived and every later help request queued. Earlier labs asserted only
// that stale text was suppressed, not that a child could get the next reply.
describe("retiring a stale companion turn", () => {
  it.each(["token", "completion", "error"].flatMap(action => [false, true].map(spoken => [action, spoken] as const)))("releases stale %s with playback=%s", async (action, spoken) => {
    const { session } = harness();
    let signal: AbortSignal;
    runAgent.mockImplementationOnce(async options => {
      signal = options.signal;
      await new Promise(resolve => setImmediate(resolve));
      expect(session.turnSM.getState()).toBe("PROCESSING");
      if (spoken) options.onToken("A current reply.");
      session.currentBoardSnapshot = { game: "adventure-preparation", phase: "ready" };
      session.turnSM.setPendingTranscript("Elli, can you help me now?");
      if (action === "token") options.onToken("An obsolete reply.");
      if (action === "error") throw new Error("late provider failure");
    });

    await runCompanionResponseForSession(session, "Help me with the word");

    expect(session.turnSM.getState()).toBe("IDLE");
    expect(session.currentAbort).toBeNull();
    expect(signal!.aborted).toBe(true);
    expect(session.ttsBridge.stop).toHaveBeenCalledTimes(spoken ? 1 : 0);
    if (spoken) expect(session.send).toHaveBeenCalledWith("audio_cancel", expect.anything());
    else expect(session.send).not.toHaveBeenCalledWith("audio_cancel", expect.anything());
    expect(session.send).not.toHaveBeenCalledWith("response_text", { chunk: "An obsolete reply." });
    expect(session.handleEndOfTurn).toHaveBeenCalledExactlyOnceWith("Elli, can you help me now?", true);
  });

  it("leaves a newer companion turn and its audio untouched", async () => {
    const { session, replaceAudio } = harness();
    const newer = new AbortController();
    runAgent.mockImplementationOnce(async () => {
      await new Promise(resolve => setImmediate(resolve));
      session.companionResponseTurnId++;
      session.currentAbort = newer;
      replaceAudio("newer-companion");
    });
    await runCompanionResponseForSession(session, "Old help request");
    expect(session.currentAbort).toBe(newer);
    expect(newer.signal.aborted).toBe(false);
    expect(session.turnSM.getState()).toBe("PROCESSING");
    expect(session.ttsBridge.stop).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalledWith("audio_cancel", expect.anything());
  });

  it("releases stale processing without cancelling another audio owner", async () => {
    const { session, replaceAudio } = harness();
    runAgent.mockImplementationOnce(async () => {
      await new Promise(resolve => setImmediate(resolve));
      session.currentBoardSnapshot.itemId = "word-2";
      replaceAudio("native-word-2");
    });
    await runCompanionResponseForSession(session, "Old help request");
    expect(session.turnSM.getState()).toBe("IDLE");
    expect(session.ttsBridge.stop).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalledWith("audio_cancel", expect.anything());
  });

  it("can deliver the next help reply in the same session without reconnecting", async () => {
    const { session } = harness();
    runAgent.mockImplementationOnce(async () => {
      await new Promise(resolve => setImmediate(resolve));
      session.currentBoardSnapshot.itemId = "word-2";
    });
    await runCompanionResponseForSession(session, "Previous word");
    expect(session.turnSM.getState()).toBe("IDLE");

    runAgent.mockImplementationOnce(async options => {
      await new Promise(resolve => setImmediate(resolve));
      options.onToken("Let's try my, then self.");
    });
    await runCompanionResponseForSession(session, "Can you help with this one?");

    expect(session.send).toHaveBeenCalledWith("response_text", { chunk: "Let's try my, then self." });
    expect(session.send).toHaveBeenCalledWith("audio_done", expect.objectContaining({ itemId: "word-2" }));
    expect(session.conversationHistory.at(-1).content).toBe("Let's try my, then self.");
    expect(session.ttsBridge.finish).toHaveBeenCalledOnce();
  });

  it("cannot revive retired output if the same item is shown again", async () => {
    const { session } = harness();
    const original = session.currentBoardSnapshot;
    let lateToken: (text: string) => void;
    runAgent.mockImplementationOnce(async options => {
      lateToken = options.onToken;
      session.currentBoardSnapshot = { ...original, itemId: "word-2" };
    });
    await runCompanionResponseForSession(session, "Old help request");
    session.currentBoardSnapshot = original;
    lateToken!("A late obsolete reply.");
    expect(session.send).not.toHaveBeenCalledWith("response_text", expect.anything());
  });
});
