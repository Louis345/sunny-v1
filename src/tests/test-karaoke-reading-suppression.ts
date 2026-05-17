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

  it("suppresses pronunciation target words while allowing clear companion commands", () => {
    const sm = new SessionManager(mockWs(), "Reina");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Reina", sessionType: "homework" });
    (sm as unknown as { currentActivityState: Record<string, unknown> }).currentActivityState =
      { game: "pronunciation", currentWord: "government", progress: "Word 2/10" };
    const shouldSuppress = (
      sm as unknown as {
        shouldSuppressTranscriptDuringKaraoke: (t: string) => boolean;
      }
    ).shouldSuppressTranscriptDuringKaraoke.bind(sm);

    expect(shouldSuppress("government")).toBe(true);
    expect(shouldSuppress("Matilda are you there")).toBe(false);
  });

  it("suppresses active map game target words while allowing clear companion commands", () => {
    const sm = new SessionManager(mockWs(), "Reina");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Reina", sessionType: "homework" });
    (sm as unknown as { currentActivityState: Record<string, unknown> }).currentActivityState =
      { game: "word-radar", currentWord: "about", progress: "Word 3/10" };
    const shouldSuppress = (
      sm as unknown as {
        shouldSuppressTranscriptDuringKaraoke: (t: string) => boolean;
      }
    ).shouldSuppressTranscriptDuringKaraoke.bind(sm);

    expect(shouldSuppress("about")).toBe(true);
    expect(shouldSuppress("Matilda are you there")).toBe(false);
  });

  it("does not suppress misheard session-end commands during an active game", () => {
    const sm = new SessionManager(mockWs(), "Ila");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Ila", sessionType: "homework" });
    (sm as unknown as { currentActivityState: Record<string, unknown> }).currentActivityState =
      { game: "monster-stampede", phase: "playing" };
    const shouldSuppress = (
      sm as unknown as {
        shouldSuppressTranscriptDuringKaraoke: (t: string) => boolean;
      }
    ).shouldSuppressTranscriptDuringKaraoke.bind(sm);

    expect(shouldSuppress("Ellie, n session. Ellie, n session.")).toBe(false);
  });

  it("suppresses homework karaoke transcripts that end with repeated story words like bye", () => {
    const sm = new SessionManager(mockWs(), "Reina");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Reina", sessionType: "homework" });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };
    sm.receiveReadingProgress({
      wordIndex: 68,
      totalWords: 123,
      accuracy: 0.55,
      hesitations: 29,
      flaggedWords: [],
      spelledWords: [],
      event: "progress",
    });
    const shouldSuppress = (
      sm as unknown as {
        shouldSuppressTranscriptDuringKaraoke: (t: string) => boolean;
      }
    ).shouldSuppressTranscriptDuringKaraoke.bind(sm);
    expect(shouldSuppress("by explaining why the... bye. Bye. Bye.")).toBe(true);
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

  it("records skipped reading words as incorrect evidence when the story completes", () => {
    const sm = new SessionManager(mockWs(), "Reina");
    (sm as unknown as { ctx: ReturnType<typeof createSessionContext> }).ctx =
      createSessionContext({ childName: "Reina", sessionType: "homework" });
    (sm as unknown as { currentCanvasState: Record<string, unknown> }).currentCanvasState =
      { mode: "karaoke" };

    sm.receiveReadingProgress({
      wordIndex: 3,
      totalWords: 3,
      accuracy: 1,
      hesitations: 2,
      flaggedWords: [],
      skippedWords: ["evidence"],
      spelledWords: ["moved", "soil", "shifted"],
      event: "complete",
    });

    expect(recordAttemptMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        word: "evidence",
        domain: "reading",
        correct: false,
      }),
    );
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
