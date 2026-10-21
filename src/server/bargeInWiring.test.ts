import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { FluxCallbacks } from "../deepgram-turn";

const flux = vi.hoisted(() => ({ callbacks: null as FluxCallbacks | null }));
vi.mock("../deepgram-turn", () => ({
  connectFlux: vi.fn(async (callbacks: FluxCallbacks) => {
    flux.callbacks = callbacks;
    return { sendAudio: vi.fn(), close: vi.fn() };
  }),
}));
vi.mock("../agents/elli/run", () => ({ runAgent: vi.fn().mockResolvedValue("") }));

import { SessionManager } from "./session-manager";
import type { TurnStateMachine } from "./session-state";

function mockWs(): WebSocket {
  return { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
}

async function speakingSession(opts: { conversationOpen?: boolean } = {}) {
  const session = new SessionManager(mockWs(), "Ila");
  if (opts.conversationOpen !== false) {
    (session as unknown as { companionPresence: string }).companionPresence = "summoned";
    (session as unknown as { companionInteractionMode: string }).companionInteractionMode = "conversation";
  }
  await session.connectDeepgram();
  const turnSM = (session as unknown as { turnSM: TurnStateMachine }).turnSM;
  turnSM.onStartCompanionFromIdle();
  await new Promise<void>((r) => setImmediate(r));
  turnSM.onToken("Great job on that word! Now let's look at science. ");
  turnSM.onAgentComplete();
  expect(turnSM.getState()).toBe("SPEAKING");
  (session as unknown as { speakingStartedAt: number }).speakingStartedAt = Date.now() - 900;
  const bargeIn = vi.spyOn(session, "bargeIn");
  return { session, bargeIn };
}

describe("barge-in wiring", () => {
  beforeEach(() => {
    flux.callbacks = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it("stops Elli when the live transcript shows the child talking", async () => {
    const { bargeIn } = await speakingSession();
    flux.callbacks!.onInterim("wait can I");
    expect(bargeIn).toHaveBeenCalledOnce();
  });

  it("does not stop Elli for a backchannel or her own echo", async () => {
    const { bargeIn } = await speakingSession();
    flux.callbacks!.onInterim("uh-huh");
    flux.callbacks!.onInterim("now let's look at science");
    expect(bargeIn).not.toHaveBeenCalled();
  });

  it("does not stop Elli for speech Sunny would ignore anyway (companion not in conversation)", async () => {
    // Review catch: live-transcript barge-in skipped the presence/wake gate, so a
    // TV or Ila spelling for a game cut Elli off and nothing answered.
    const { bargeIn } = await speakingSession({ conversationOpen: false });
    flux.callbacks!.onInterim("and now the weather");
    expect(bargeIn).not.toHaveBeenCalled();
  });

  it("does not stop Elli when transcripts are suppressed for the game", async () => {
    const { session, bargeIn } = await speakingSession();
    session.suppressTranscripts = true;
    flux.callbacks!.onInterim("b e c a u s e");
    expect(bargeIn).not.toHaveBeenCalled();
  });

  it("no longer stops Elli on a bare start-of-speech sound", async () => {
    const { bargeIn } = await speakingSession();
    flux.callbacks!.onStartOfTurn();
    expect(bargeIn).not.toHaveBeenCalled();
  });
});
