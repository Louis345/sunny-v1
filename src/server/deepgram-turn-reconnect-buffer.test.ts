import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deepgramMock = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    readyState: 1,
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    }),
    connect: vi.fn(),
    waitForOpen: vi.fn(async () => undefined),
    sendMedia: vi.fn(),
    close: vi.fn(),
  };
  return { handlers, socket };
});

vi.mock("@deepgram/sdk", () => ({
  DeepgramClient: class {
    listen = {
      v2: {
        connect: vi.fn(async () => deepgramMock.socket),
      },
    };
  },
}));

import { connectFlux } from "../deepgram-turn";

describe("Deepgram reconnect audio handoff", () => {
  const originalApiKey = process.env.DEEPGRAM_API_KEY;

  beforeEach(() => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    deepgramMock.socket.readyState = 1;
    for (const key of Object.keys(deepgramMock.handlers)) delete deepgramMock.handlers[key];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = originalApiKey;
  });

  it("delivers speech captured while Flux is reconnecting after a spoken spelling prompt", async () => {
    const handle = await connectFlux({
      onStartOfTurn: vi.fn(),
      onEndOfTurn: vi.fn(),
      onInterim: vi.fn(),
      onError: vi.fn(),
      onOpen: vi.fn(),
    });
    const firstSpokenLetters = Buffer.from([1, 2, 3, 4]);

    deepgramMock.socket.readyState = 0;
    handle.sendAudio(firstSpokenLetters);
    expect(deepgramMock.socket.sendMedia).not.toHaveBeenCalled();

    deepgramMock.socket.readyState = 1;
    deepgramMock.handlers.open?.();

    expect(deepgramMock.socket.sendMedia).toHaveBeenCalledTimes(1);
    expect(deepgramMock.socket.sendMedia).toHaveBeenCalledWith(firstSpokenLetters);
  });

  it("preserves a complete multi-letter response instead of evicting its first sounds", async () => {
    const handle = await connectFlux({
      onStartOfTurn: vi.fn(),
      onEndOfTurn: vi.fn(),
      onInterim: vi.fn(),
      onError: vi.fn(),
      onOpen: vi.fn(),
    });
    const spokenChunks = Array.from({ length: 6 }, (_, index) => Buffer.from([index]));

    deepgramMock.socket.readyState = 0;
    spokenChunks.forEach((chunk) => handle.sendAudio(chunk));
    deepgramMock.socket.readyState = 1;
    deepgramMock.handlers.open?.();

    expect(deepgramMock.socket.sendMedia.mock.calls.map(([chunk]) => chunk)).toEqual(spokenChunks);
  });
});
