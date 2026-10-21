import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({ runAgent: vi.fn().mockResolvedValue("") }));

import { SessionManager } from "./session-manager";
import { TurnStateMachine } from "./session-state";

async function processing(sm: TurnStateMachine) {
  sm.onStartCompanionFromIdle();
  await new Promise<void>((r) => setImmediate(r));
}

describe("early speech review fixes", () => {
  it("still enters Word Builder when Elli launches it after her first sentence", async () => {
    // Review catch: "Let's build a word!" then launchGame(word-builder) left the
    // machine in SPEAKING, so playback returned to IDLE instead of WORD_BUILDER.
    const flushed: string[] = [];
    const sm = new TurnStateMachine((t) => flushed.push(t), () => {});
    await processing(sm);
    sm.onToken("Let's build a word together! ");
    expect(sm.getState()).toBe("SPEAKING");
    sm.onWordBuilderStart();
    expect(sm.getState()).toBe("WORD_BUILDER");
    sm.onAgentComplete();
    expect(sm.getState()).toBe("SPEAKING");
    sm.onPlaybackComplete();
    expect(sm.getState()).toBe("WORD_BUILDER");
  });

  it("does not split a decimal answer across the early first sentence", async () => {
    // Review catch: "The answer is 2." flushed before ".5" -> "two. five".
    const flushed: string[] = [];
    const sm = new TurnStateMachine((t) => flushed.push(t), () => {});
    await processing(sm);
    sm.onToken("The answer is 2.");
    expect(flushed).toEqual([]);
    sm.onToken("5 pounds. ");
    expect(flushed).toEqual(["The answer is 2.5 pounds."]);
  });

  it("never drops what the child says while Elli is speaking her first sentence: it interrupts her", async () => {
    // Review catch: early SPEAKING made the session drop child speech as
    // "assistant_owns_turn". Since newest-wins (Oct 20 human decision), the
    // child's words stop Elli and are answered instead of queued.
    const ws = { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
    const session = new SessionManager(ws, "Ila");
    const turnSM = (session as unknown as { turnSM: TurnStateMachine }).turnSM;
    (session as unknown as { companionPresence: string }).companionPresence = "summoned";
    await processing(turnSM);
    turnSM.onToken("Hey Ila, good to see you. ");
    expect(turnSM.getState()).toBe("SPEAKING");
    const bargeIn = vi.spyOn(session, "bargeIn");

    session.injectTranscript("seven");

    await vi.waitFor(() => expect(bargeIn).toHaveBeenCalledOnce());
  });
});
