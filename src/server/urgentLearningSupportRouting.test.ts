import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { runAgent } from "../agents/elli/run";
import { getChildChart } from "../profiles/childChart";
import { SessionManager } from "./session-manager";
import { TurnStateMachine } from "./session-state";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn() }));

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function peekPending(sm: TurnStateMachine): string | null {
  return (sm as unknown as { pendingTranscript: string | null }).pendingTranscript;
}

describe("urgent learning support routing", () => {
  const prevStateless = process.env.SUNNY_STATELESS;

  beforeEach(() => {
    process.env.SUNNY_STATELESS = "true";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.SUNNY_STATELESS = prevStateless;
  });

  it("interrupts stale processing and gives current-word help instead of queueing", async () => {
    const ws = mockWs();
    const session = new SessionManager(ws, "Ila");
    const turnSM = (session as unknown as { turnSM: TurnStateMachine }).turnSM;
    const handleCompanionTurn = vi
      .spyOn(
        session as unknown as { handleCompanionTurn: (text: string) => Promise<void> },
        "handleCompanionTurn",
      )
      .mockResolvedValue(undefined);

    session.injectGameContext({
      game: "pronunciation",
      currentWord: "able",
      wordIndex: 0,
      totalWords: 10,
      phase: "approaching",
    });
    turnSM.onStartCompanionFromIdle();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(turnSM.getState()).toBe("PROCESSING");

    session.injectTranscript("Can you help me, Ellie?");

    await vi.waitFor(() => {
      expect(handleCompanionTurn).toHaveBeenCalledWith(expect.stringContaining("a-ble"));
    });
    expect(peekPending(turnSM)).toBeNull();
    expect(turnSM.getState()).toBe("IDLE");
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"game_message"'),
    );
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"pronunciation_support"'),
    );
  });

  it("keeps ordinary room speech out of Elli while the canonical spelling assessment owns the turn", async () => {
    // Human catch: Ila's self-talk repeatedly triggered model responses during Discovery.
    // Logs recorded valid STT and model turns, so they did not identify the ownership bug.
    // The old lab used injected transcripts without a live assessment snapshot.
    vi.mocked(getChildChart).mockReturnValue({
      learningCycle: {
        homeworkId: "hw-lab",
        domain: "spelling",
        nodes: [{
          nodeId: "opening",
          role: "evaluation",
          artifactBinding: { contractFingerprint: "frozen" },
          evidenceContract: {
            spellingItems: { "item-1": { id: "item-1", word: "sample" } },
          },
        }],
      },
    } as never);
    const ws = mockWs();
    const session = new SessionManager(ws, "Ila");

    session.updateCurrentBoardSnapshot({
      assessmentMode: true,
      game: "word-radar",
      nodeId: "opening",
      itemId: "item-1",
      phase: "response",
      answerVisibility: "hidden",
      speechCaptureArmed: false,
    });
    session.injectTranscript("I think I forgot where my pencil is");

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(runAgent).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalledWith(
      expect.stringContaining('"type":"response_text"'),
    );
  });
});
