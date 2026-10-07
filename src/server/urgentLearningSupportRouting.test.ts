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

  it("forwards spoken letters to Word Radar while its response capture is armed", async () => {
    // Human catch: microphone and STT health were green, but the collapsed
    // companion gate discarded letters because the game never claimed them.
    const ws = mockWs();
    const session = new SessionManager(ws, "Ila");

    session.updateCurrentBoardSnapshot({
      game: "word-radar",
      nodeId: "practice",
      itemId: "item-1",
      phase: "response",
      answerVisibility: "hidden",
      speechCaptureArmed: true,
    });
    session.injectTranscript("s");

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(runAgent).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"interim"'),
    );
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"text":"s"'));
  });

  it("lets a child ask Elli for help during armed Word Radar capture", async () => {
    // Human catch: the live session identified a help request, then recorded
    // word-radar_active_game suppression. Earlier tests covered letters and
    // help separately, so neither crossed both live routing gates.
    const ws = mockWs();
    const session = new SessionManager(ws, "Ila");
    session.companionWakeGateEnabled = true;
    const respond = vi.spyOn(session as unknown as { runCompanionResponse: (text: string) => Promise<void> }, "runCompanionResponse")
      .mockResolvedValue(undefined);
    session.injectGameContext({
      game: "word-radar", nodeId: "practice", phase: "response",
      currentWord: "broken", speechCaptureArmed: true,
    });

    session.injectTranscript("Can you help me with this word?");

    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith("Can you help me with this word?"));
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining('"type":"interim"'));
  });

  it("opens Elli when the child calls only her name during spelling capture", async () => {
    const ws = mockWs();
    const session = new SessionManager(ws, "Ila");
    session.companionWakeGateEnabled = true;
    const respond = vi.spyOn(session as unknown as { runCompanionResponse: (text: string) => Promise<void> }, "runCompanionResponse")
      .mockResolvedValue(undefined);
    session.injectGameContext({ game: "word-radar", nodeId: "practice", phase: "response", speechCaptureArmed: true });

    session.injectTranscript("Elli");

    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith("Elli"));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"state":"summoned"'));
  });

  it("rechecks a queued transcript against the live assessment before replaying it", async () => {
    // Human catch: stale room speech received during audio later became an Elli
    // turn. Logs called it a replay but skipped the wake gate entirely.
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
    const session = new SessionManager(mockWs(), "Ila");
    session.updateCurrentBoardSnapshot({
      assessmentMode: true,
      game: "word-radar",
      nodeId: "opening",
      itemId: "item-1",
      phase: "response",
      answerVisibility: "hidden",
    });

    await (session as unknown as {
      handleEndOfTurn: (text: string, isReplay: boolean) => Promise<void>;
    }).handleEndOfTurn("I was talking to someone else", true);

    expect(runAgent).not.toHaveBeenCalled();
  });
});
