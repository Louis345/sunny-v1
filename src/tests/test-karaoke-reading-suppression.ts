import { describe, it, expect, vi, beforeEach } from "vitest";
import WebSocket from "ws";

const recordAttemptMock = vi.hoisted(() => vi.fn());

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

vi.mock("../engine/learningEngine", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../engine/learningEngine")>();
  return { ...mod, recordAttempt: recordAttemptMock };
});

import { SessionManager } from "../server/session-manager";
import { createSessionContext } from "../server/session-context";

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe("karaoke reading transcript suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suppresses child STT during karaoke reading before story complete", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Ila", sessionType: "reading" });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };
    const shouldSuppress = (
      sm as unknown as {
        shouldSuppressTranscriptDuringKaraoke: (t: string) => boolean;
      }
    ).shouldSuppressTranscriptDuringKaraoke.bind(sm);
    expect(shouldSuppress("hello")).toBe(true);
  });

  it("does not suppress after reading_progress event=complete (lift flag)", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Ila", sessionType: "reading" });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };
    sm.receiveReadingProgress({
      wordIndex: 3,
      totalWords: 3,
      accuracy: 1,
      hesitations: 0,
      flaggedWords: [],
      spelledWords: ["a", "b", "c"],
      event: "complete",
    });
    const shouldSuppress = (
      sm as unknown as {
        shouldSuppressTranscriptDuringKaraoke: (t: string) => boolean;
      }
    ).shouldSuppressTranscriptDuringKaraoke.bind(sm);
    expect(shouldSuppress("comprehension answer")).toBe(false);
  });

  it("suppresses again after a new karaoke canvas is dispatched", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Ila", sessionType: "reading" });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };
    sm.receiveReadingProgress({
      wordIndex: 1,
      totalWords: 1,
      accuracy: 1,
      hesitations: 0,
      flaggedWords: [],
      spelledWords: ["x"],
      event: "complete",
    });
    sm.handleToolCall(
      "canvasShow",
      {
        type: "karaoke",
        storyText: "New story.",
        words: ["New", "story"],
      },
      {},
    );
    const shouldSuppress = (
      sm as unknown as {
        shouldSuppressTranscriptDuringKaraoke: (t: string) => boolean;
      }
    ).shouldSuppressTranscriptDuringKaraoke.bind(sm);
    expect(shouldSuppress("noise")).toBe(true);
  });
});
