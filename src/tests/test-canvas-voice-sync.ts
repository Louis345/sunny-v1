import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import WebSocket from "ws";
import { SessionManager } from "../server/session-manager";
import { TurnStateMachine } from "../server/session-state";
import { createSessionContext } from "../server/session-context";
import { resolveContextRoot } from "../utils/contextRoot";
import {
  initializeLearningProfile,
  writeLearningProfile,
} from "../utils/learningProfileIO";

vi.mock("../agents/elli/run", () => ({
  runAgent: vi.fn().mockResolvedValue(""),
}));

let isolatedContextRoot = "";
const TEST_CHART_ID = "canvas-voice-lab";
const sessionManagers: SessionManager[] = [];

beforeAll(() => {
  isolatedContextRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "sunny-canvas-voice-sync-"),
  );
});

beforeEach(() => {
  vi.stubEnv("SUNNY_CONTEXT_ROOT", isolatedContextRoot);
  vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  fs.rmSync(path.join(isolatedContextRoot, TEST_CHART_ID), {
    recursive: true,
    force: true,
  });
  writeLearningProfile(
    TEST_CHART_ID,
    initializeLearningProfile({
      childId: TEST_CHART_ID,
      age: 9,
      grade: 3,
      diagnoses: [],
      learningGoals: ["spelling"],
    }),
  );
});

afterEach(() => {
  for (const manager of sessionManagers.splice(0)) {
    if (manager.gameTtsFallbackTimer) {
      clearTimeout(manager.gameTtsFallbackTimer);
      manager.gameTtsFallbackTimer = null;
    }
    if (manager.wbActivityTimeout) {
      clearTimeout(manager.wbActivityTimeout);
      manager.wbActivityTimeout = null;
    }
    getTurnSM(manager).onInterrupt();
  }
});

afterAll(() => {
  vi.unstubAllEnvs();
  if (isolatedContextRoot) {
    fs.rmSync(isolatedContextRoot, { recursive: true, force: true });
  }
});

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function createTestSessionManager(): SessionManager {
  const manager = new SessionManager(mockWs(), "Ila", false, {
    chartChildId: TEST_CHART_ID,
    silentTts: true,
  });
  sessionManagers.push(manager);
  return manager;
}

function getTurnSM(sm: SessionManager): TurnStateMachine {
  return (sm as unknown as { turnSM: TurnStateMachine }).turnSM;
}

function peek(sm: SessionManager, key: string): unknown {
  return (sm as unknown as Record<string, unknown>)[key];
}

function callHandleToolCall(
  sm: SessionManager,
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
  (
    sm as unknown as {
      handleToolCall: (t: string, a: Record<string, unknown>, r: unknown) => void;
    }
  ).handleToolCall(tool, args, result);
}

function attachMinimalSession(sm: SessionManager): void {
  const ctx = createSessionContext({
    childName: "Ila",
    sessionType: "spelling",
    companionName: "Elli",
  });
  (sm as unknown as { ctx: typeof ctx }).ctx = ctx;
  const sendText = vi.fn();
  (sm as unknown as { ttsBridge: Record<string, unknown> }).ttsBridge = {
    sendText,
    finish: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("canvas voice-sync storage isolation", () => {
  it("never records simulated Ila rounds in canonical family data", () => {
    expect(resolveContextRoot()).not.toBe(
      path.resolve(process.cwd(), "src", "context"),
    );
  });
});

describe("Suite 1 — TTS gate (Word Builder / Spell Check / Launch / canvasShow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("launchGame(word-builder): no TTS until game ready for revision", async () => {
    const sm = createTestSessionManager();
    attachMinimalSession(sm);
    (sm as unknown as { spellingHomeworkWordsByNorm: string[] }).spellingHomeworkWordsByNorm =
      ["add"];
    (sm as unknown as { refreshSpellingHomeworkGate: () => void }).refreshSpellingHomeworkGate();

    const sendText = (
      sm as unknown as { ttsBridge: { sendText: ReturnType<typeof vi.fn> } }
    ).ttsBridge.sendText;

    getTurnSM(sm).onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));

    callHandleToolCall(
      sm,
      "launchGame",
      { name: "word-builder", type: "tool", word: "add" },
      {
        ok: true,
        canonicalName: "word-builder",
        word: "add",
        launched: true,
        type: "tool",
        requestedName: "word-builder",
        availableGames: [],
      },
    );

    getTurnSM(sm).onToken("Fill in the word on the board please.");
    getTurnSM(sm).onAgentComplete();

    expect(sendText).not.toHaveBeenCalled();

    (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
      type: "ready",
    });

    expect(sendText).toHaveBeenCalled();
  });

  it("launchGame(spell-check): no TTS until game ready", async () => {
    const sm = createTestSessionManager();
    attachMinimalSession(sm);
    (sm as unknown as { spellingHomeworkWordsByNorm: string[] }).spellingHomeworkWordsByNorm =
      ["go"];
    (sm as unknown as { refreshSpellingHomeworkGate: () => void }).refreshSpellingHomeworkGate();

    const sendText = (
      sm as unknown as { ttsBridge: { sendText: ReturnType<typeof vi.fn> } }
    ).ttsBridge.sendText;

    getTurnSM(sm).onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));

    callHandleToolCall(
      sm,
      "launchGame",
      { name: "spell-check", type: "tool", word: "go" },
      {
        ok: true,
        canonicalName: "spell-check",
        word: "go",
        launched: true,
        type: "tool",
        requestedName: "spell-check",
        availableGames: [],
      },
    );

    getTurnSM(sm).onToken("Type the word on the keyboard.");
    getTurnSM(sm).onAgentComplete();

    expect(sendText).not.toHaveBeenCalled();

    (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
      type: "ready",
    });

    expect(sendText).toHaveBeenCalled();
  });

  it("launchGame: no TTS until game ready", async () => {
    const sm = createTestSessionManager();
    attachMinimalSession(sm);

    const sendText = (
      sm as unknown as { ttsBridge: { sendText: ReturnType<typeof vi.fn> } }
    ).ttsBridge.sendText;

    getTurnSM(sm).onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));

    callHandleToolCall(sm, "launchGame", { name: "asteroid", type: "reward" }, {
      ok: true,
      requestedName: "asteroid",
      canonicalName: "asteroid",
    });

    getTurnSM(sm).onToken("Have fun with the game.");
    getTurnSM(sm).onAgentComplete();

    expect(sendText).not.toHaveBeenCalled();

    (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
      type: "ready",
    });

    expect(sendText).toHaveBeenCalled();
  });

  it("canvasShow (game): no TTS until game ready (same gate as iframe tools)", async () => {
    const sm = createTestSessionManager();
    attachMinimalSession(sm);

    const sendText = (
      sm as unknown as { ttsBridge: { sendText: ReturnType<typeof vi.fn> } }
    ).ttsBridge.sendText;

    getTurnSM(sm).onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));

    callHandleToolCall(
      sm,
      "canvasShow",
      {
        type: "game",
        name: "bd-reversal",
        gameWord: "test",
        gamePlayerName: "Ila",
      },
      { ok: true },
    );

    getTurnSM(sm).onToken("Play the reversal game.");
    getTurnSM(sm).onAgentComplete();

    expect(sendText).not.toHaveBeenCalled();

    (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
      type: "ready",
    });

    expect(sendText).toHaveBeenCalled();
  });
});

describe("Suite 2 — round_complete during SPEAKING", () => {
  it("pendingRoundComplete set, wbPendingEvent null; playbackDone re-enters handleGameEvent", async () => {
    const sm = createTestSessionManager();
    attachMinimalSession(sm);
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    (sm as unknown as { wbWord: string }).wbWord = "add";
    (sm as unknown as { wbRound: number }).wbRound = 2;

    const gameSpy = vi.spyOn(
      sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void },
      "handleGameEvent",
    );

    getTurnSM(sm).onWordBuilderStart();
    getTurnSM(sm).onAgentComplete();
    expect(getTurnSM(sm).getState()).toBe("SPEAKING");

    gameSpy.mockClear();

    (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
      type: "round_complete",
      round: 2,
      attempts: 1,
    });

    expect(peek(sm, "pendingRoundComplete")).toBeTruthy();
    expect(peek(sm, "wbPendingEvent")).toBeUndefined();

    sm.playbackDone();
    expect(gameSpy).toHaveBeenCalled();
  });
});

describe("Suite 3 — round_complete during PROCESSING", () => {
  it("pending set; flushPendingRoundComplete runs handleGameEvent", async () => {
    const sm = createTestSessionManager();
    attachMinimalSession(sm);
    (sm as unknown as { wbActive: boolean }).wbActive = true;
    (sm as unknown as { wbWord: string }).wbWord = "add";

    getTurnSM(sm).onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));
    expect(getTurnSM(sm).getState()).toBe("PROCESSING");

    (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
      type: "round_complete",
      round: 1,
      attempts: 1,
    });

    expect(peek(sm, "pendingRoundComplete")).toBeTruthy();

    const gameSpy = vi.spyOn(
      sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void },
      "handleGameEvent",
    );
    gameSpy.mockClear();

    getTurnSM(sm).onAgentComplete();
    (sm as unknown as { flushPendingRoundComplete: () => void }).flushPendingRoundComplete();

    expect(gameSpy).toHaveBeenCalled();
  });
});

describe("Suite 4 — round 4 forces IDLE; game_complete ignored", () => {
  it("after round 4 not WORD_BUILDER; onWordBuilderEnd once; game_complete no second end", async () => {
    const sm = createTestSessionManager();
    attachMinimalSession(sm);
    (sm as unknown as { spellingHomeworkWordsByNorm: string[] }).spellingHomeworkWordsByNorm = [
      "add",
    ];
    (sm as unknown as { refreshSpellingHomeworkGate: () => void }).refreshSpellingHomeworkGate();

    (sm as unknown as { runCompanionResponse: () => Promise<void> }).runCompanionResponse =
      vi.fn().mockResolvedValue(undefined);

    getTurnSM(sm).onStartCompanionFromIdle();
    await new Promise<void>((r) => setImmediate(r));
    callHandleToolCall(
      sm,
      "launchGame",
      { name: "word-builder", type: "tool", word: "add" },
      {
        ok: true,
        canonicalName: "word-builder",
        word: "add",
        launched: true,
        type: "tool",
        requestedName: "word-builder",
        availableGames: [],
      },
    );

    const turn = getTurnSM(sm);
    const endSpy = vi.spyOn(turn, "onWordBuilderEnd");

    for (const r of [1, 2, 3, 4]) {
      (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
        type: "round_complete",
        round: r,
        attempts: 1,
      });
      await Promise.resolve();
    }

    expect(turn.getState()).not.toBe("WORD_BUILDER");
    expect(endSpy.mock.calls.length).toBe(1);

    endSpy.mockClear();
    (sm as unknown as { handleGameEvent: (e: Record<string, unknown>) => void }).handleGameEvent({
      type: "game_complete",
      word: "add",
    });

    expect(endSpy).not.toHaveBeenCalled();
  });
});
