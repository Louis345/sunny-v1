import { describe, it, expect, vi, beforeEach } from "vitest";
import WebSocket from "ws";
import { runAgent } from "../agents/elli/run";
import { SessionManager } from "../server/session-manager";
import { TurnStateMachine } from "../server/session-state";
import { createSessionContext } from "../server/session-context";

const recordAttemptMock = vi.hoisted(() => vi.fn());

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

vi.mock("../engine/learningEngine", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../engine/learningEngine")>();
  return { ...mod, recordAttempt: recordAttemptMock };
});

vi.mock("../utils/generateStoryImage", () => ({
  generateStoryImage: vi.fn().mockResolvedValue(null),
}));

/** Profile key from the ChildName union — avoids embedding real names in assertions. */
const PROFILE_KEY = "creator" as const;

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function getTurnSM(sm: SessionManager): TurnStateMachine {
  return (sm as unknown as { turnSM: TurnStateMachine }).turnSM;
}

function attachTtsBridge(sm: SessionManager): void {
  (sm as unknown as { ttsBridge: Record<string, unknown> }).ttsBridge = {
    sendText: vi.fn(),
    finish: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("reading_progress complete vs CANVAS_PENDING", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not leave turn machine in CANVAS_PENDING when runAgent runs after story complete", async () => {
    const sm = new SessionManager(mockWs(), PROFILE_KEY);
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({
        childName: PROFILE_KEY,
        sessionType: "reading",
      });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };
    attachTtsBridge(sm);

    const turnSM = getTurnSM(sm);
    turnSM.onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));
    expect(turnSM.getState()).toBe("PROCESSING");
    turnSM.onShowCanvas();
    expect(turnSM.getState()).toBe("CANVAS_PENDING");

    const statesWhenRunAgentStarts: string[] = [];
    vi.mocked(runAgent).mockImplementation(async () => {
      statesWhenRunAgentStarts.push(turnSM.getState());
      return "";
    });

    sm.receiveReadingProgress({
      wordIndex: 2,
      totalWords: 2,
      accuracy: 1,
      hesitations: 0,
      flaggedWords: [],
      spelledWords: [],
      event: "complete",
    });

    await vi.waitFor(
      () => {
        expect(vi.mocked(runAgent).mock.calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    expect(statesWhenRunAgentStarts[0]).not.toBe("CANVAS_PENDING");
  });

  it("sets karaokeReadingComplete after event=complete", () => {
    const sm = new SessionManager(mockWs(), PROFILE_KEY);
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({
        childName: PROFILE_KEY,
        sessionType: "reading",
      });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };
    attachTtsBridge(sm);

    const turnSM = getTurnSM(sm);
    turnSM.onStartCompanionFromIdle();
    sm.receiveReadingProgress({
      wordIndex: 1,
      totalWords: 1,
      accuracy: 1,
      hesitations: 0,
      flaggedWords: [],
      spelledWords: [],
      event: "complete",
    });

    expect(
      (sm as unknown as { karaokeReadingComplete: boolean }).karaokeReadingComplete,
    ).toBe(true);
  });

  it("handles event=complete at most once per karaoke story (runAgent not doubled)", async () => {
    const sm = new SessionManager(mockWs(), PROFILE_KEY);
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({
        childName: PROFILE_KEY,
        sessionType: "reading",
      });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };
    attachTtsBridge(sm);

    const turnSM = getTurnSM(sm);
    turnSM.onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));
    turnSM.onShowCanvas();

    const payload = {
      wordIndex: 1,
      totalWords: 1,
      accuracy: 1,
      hesitations: 0,
      flaggedWords: [] as string[],
      spelledWords: [] as string[],
      event: "complete" as const,
    };

    sm.receiveReadingProgress(payload);
    sm.receiveReadingProgress(payload);

    await vi.waitFor(
      () => {
        expect(vi.mocked(runAgent).mock.calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    expect(vi.mocked(runAgent).mock.calls.length).toBe(1);
  });
});
