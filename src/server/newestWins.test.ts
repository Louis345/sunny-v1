import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../agents/elli/run", () => ({ runAgent: vi.fn() }));

import { runAgent } from "../agents/elli/run";
import { SessionManager } from "./session-manager";
import type { TurnStateMachine } from "./session-state";

type Harness = {
  companionPresence: string;
  companionInteractionMode: string;
  conversationHistory: Array<{ role: string; content: unknown }>;
  handleEndOfTurn: (text: string) => Promise<void>;
  turnSM: TurnStateMachine;
};

function mockWs(): WebSocket {
  return { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
}

function conversation() {
  const session = new SessionManager(mockWs(), "Ila");
  const h = session as unknown as Harness;
  h.companionPresence = "summoned";
  h.companionInteractionMode = "conversation";
  return { session, h };
}

/** First reply: optionally speaks some text, then hangs until aborted. Later replies answer at once. */
function elliThinksThenAnswers(spokenFirst?: string) {
  let call = 0;
  vi.mocked(runAgent).mockImplementation(async (opts: any) => {
    call += 1;
    await new Promise((r) => setTimeout(r, 5)); // Claude's first token never beats turn start
    if (call === 1) {
      if (spokenFirst) opts.onToken(spokenFirst);
      await new Promise<void>((resolve) => opts.signal?.addEventListener("abort", () => resolve()));
      return spokenFirst ?? "";
    }
    opts.onToken("Yes, I can hear you! ");
    return "Yes, I can hear you! ";
  });
}

function historyText(h: Harness): string {
  return h.conversationHistory.map((m) => `${m.role}: ${String(m.content)}`).join("\n");
}

describe("newest wins", () => {
  afterEach(() => vi.mocked(runAgent).mockReset());

  it("answers what the child just said instead of queueing it behind Elli's reply", async () => {
    // Human catch (Oct 20, both sessions): "Can you hear me" waited 9-27s in a
    // first-in-first-out queue behind Elli's earlier reply.
    elliThinksThenAnswers();
    const { h } = conversation();
    void h.handleEndOfTurn("Hey, Ellie.");
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));

    await h.handleEndOfTurn("Can you hear me?");

    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(2));
    expect((h.turnSM as unknown as { pendingTranscript: string | null }).pendingTranscript).toBeNull();
    const second = vi.mocked(runAgent).mock.calls[1][0] as { userMessage: string; history: Array<{ role: string; content: unknown }> };
    expect(second.userMessage).toContain("Can you hear me?");
    expect(JSON.stringify(second.history)).toContain("Hey, Ellie.");
  });

  it("remembers what Elli had actually said when the child cut in", async () => {
    elliThinksThenAnswers("Great job on that word! ");
    const { h } = conversation();
    void h.handleEndOfTurn("I spelled it right!");
    await vi.waitFor(() => expect(h.turnSM.getState()).toBe("SPEAKING"));

    await h.handleEndOfTurn("Can we take a break now?");

    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledTimes(2));
    const text = historyText(h);
    expect(text).toContain("user: I spelled it right!");
    expect(text).toContain("assistant: Great job on that word!");
    expect(text).toMatch(/interrupted/i);
  });

  it("does not interrupt Elli with story text the child reads aloud during karaoke", async () => {
    // Review catch: karaoke suppression only ran when idle, so reading aloud over
    // Elli stopped her and sent the story to Claude as the child's message.
    elliThinksThenAnswers("Great job on that word! ");
    const { h, session } = conversation();
    void h.handleEndOfTurn("I spelled it right!");
    await vi.waitFor(() => expect(h.turnSM.getState()).toBe("SPEAKING"));
    vi.spyOn(session as unknown as { shouldSuppressTranscriptDuringKaraoke: () => boolean }, "shouldSuppressTranscriptDuringKaraoke").mockReturnValue(true);
    const bargeIn = vi.spyOn(session, "bargeIn");

    await h.handleEndOfTurn("the little fox ran into the forest");

    expect(bargeIn).not.toHaveBeenCalled();
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it("keeps talking through a backchannel instead of starting over", async () => {
    elliThinksThenAnswers("Great job on that word! ");
    const { h, session } = conversation();
    void h.handleEndOfTurn("I spelled it right!");
    await vi.waitFor(() => expect(h.turnSM.getState()).toBe("SPEAKING"));
    const bargeIn = vi.spyOn(session, "bargeIn");

    await h.handleEndOfTurn("uh-huh");

    expect(bargeIn).not.toHaveBeenCalled();
    expect(runAgent).toHaveBeenCalledTimes(1);
    bargeIn.mockRestore();
  });
});
