import { describe, it, expect, vi, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { buildGameContextSummary } from "../server/gameContextSummary";
import { handleGameEventForSession } from "../server/game-event-handler";
import { TurnStateMachine } from "../server/session-state";

const PROJECT_ROOT = process.cwd();

function makeSession(overrides: Record<string, unknown> = {}) {
  const turnSM = new TurnStateMachine(
    () => {},
    () => {},
    () => {},
  );
  return {
    childName: "Ila",
    ctx: null,
    turnSM,
    send: vi.fn(),
    gameBridge: { startGame: () => {}, handleGameEvent: () => {} },
    pendingGameStart: null,
    currentCanvasRevision: 0,
    broadcastContext: () => {},
    spellCheckSessionActive: false,
    activeSpellCheckWord: "",
    clearActiveCanvasActivity: () => {},
    wbActive: false,
    wbRound: 0,
    wbWord: "",
    wbLastProcessedRound: 0,
    pendingRoundComplete: null,
    runCompanionResponse: async () => {},
    activeCanvasActivity: { snapshot: null },
    worksheetProblemIndex: 0,
    currentCanvasState: null,
    setActiveCanvasActivity: () => {},
    spaceInvadersRewardActive: false,
    suppressTranscripts: false,
    sessionTtsLabel: "Ila",
    noteExternalEvent: vi.fn(),
    injectGameContext: vi.fn(),
    ...overrides,
  };
}

// ─── 1. buildGameContextSummary — new fields ─────────────────────────────────

describe("buildGameContextSummary new structured extras", () => {
  it("includes boardState when present", () => {
    const s = buildGameContextSummary({ boardState: "F A _ M E R" });
    expect(s).toContain("Board: F A _ M E R");
  });

  it("phase already included (regression guard)", () => {
    const s = buildGameContextSummary({ phase: "playing" });
    expect(s).toContain("Phase: playing");
  });

  it("correct renders as 'correct'", () => {
    const s = buildGameContextSummary({ correct: true });
    expect(s).toContain("Result: correct");
  });

  it("correct false renders as 'incorrect'", () => {
    const s = buildGameContextSummary({ correct: false });
    expect(s).toContain("Result: incorrect");
  });
});

// ─── 2. handleGameEventForSession — companion_event path ─────────────────────

describe("handleGameEventForSession companion_event server routing", () => {
  it("routes correct_answer to s.send and noteExternalEvent", () => {
    const session = makeSession();
    handleGameEventForSession(session, {
      type: "companion_event",
      payload: { trigger: "correct_answer", childId: "ila", timestamp: 1 },
    });
    expect(session.send).toHaveBeenCalledWith(
      "companion_event",
      expect.objectContaining({
        payload: expect.objectContaining({ trigger: "correct_answer" }),
      }),
    );
    expect(session.noteExternalEvent).toHaveBeenCalled();
  });

  it("routes wrong_answer to s.send", () => {
    const session = makeSession();
    handleGameEventForSession(session, {
      type: "companion_event",
      payload: { trigger: "wrong_answer", childId: "ila", timestamp: 1 },
    });
    expect(session.send).toHaveBeenCalled();
  });

  it("routes session_complete to s.send (server-whitelisted)", () => {
    const session = makeSession();
    handleGameEventForSession(session, {
      type: "companion_event",
      payload: { trigger: "session_complete", childId: "ila", timestamp: 1 },
    });
    expect(session.send).toHaveBeenCalled();
  });

  it("keeps companion_care_event as VFX/context instead of starting spoken Elli during games", async () => {
    const runCompanionResponse = vi.fn(async (_message: string) => {});
    const session = makeSession({
      runCompanionResponse,
      currentActivityState: {
        game: "pronunciation",
        phase: "response",
        currentWord: "able",
        itemIndex: 5,
        totalItems: 10,
      },
    });
    handleGameEventForSession(session, {
      type: "companion_care_event",
      itemId: "apple_bite",
      animation: { reference: "animation-a", itemId: "apple_bite" },
      companionCare: { moodLabel: "bright" },
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(runCompanionResponse).not.toHaveBeenCalled();
    expect(session.noteExternalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "companion_care_event",
        summary: expect.stringContaining("Word: able"),
      }),
    );
  });

  it("does not start a second spoken companion turn for companion_care_event while a turn is already in flight", async () => {
    const runCompanionResponse = vi.fn(async (_message: string) => {});
    const session = makeSession({ runCompanionResponse });
    session.turnSM.onStartCompanionFromIdle();

    handleGameEventForSession(session, {
      type: "companion_care_event",
      itemId: "apple_bite",
      animation: { reference: "animation-a", itemId: "apple_bite" },
      companionCare: { moodLabel: "bright" },
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(runCompanionResponse).not.toHaveBeenCalled();
    expect(session.noteExternalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "companion_care_event",
      }),
    );
  });
});

// ─── 3. useSession iframe allowlist includes companion_event ─────────────────

describe("useSession iframe message forwarding allowlist", () => {
  let handleGameMessageBody: string;

  beforeAll(() => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, "web/src/hooks/useSession.ts"),
      "utf-8",
    );
    // Extract just the handleGameMessage function body
    const start = src.indexOf("function handleGameMessage");
    const end = src.indexOf("\n  }", start) + 4;
    handleGameMessageBody = src.slice(start, end);
  });

  it("allowlist includes companion_event", () => {
    expect(handleGameMessageBody).toContain('"companion_event"');
  });

  it("allowlist still includes game_state_update (regression guard)", () => {
    expect(handleGameMessageBody).toContain('"game_state_update"');
  });
});

// ─── 4. _contract.js exposes GameBridge.startHeartbeat ───────────────────────

describe("_contract.js GameBridge.startHeartbeat", () => {
  let contractSrc: string;

  beforeAll(() => {
    contractSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, "web/public/games/_contract.js"),
      "utf-8",
    );
  });

  it("GameBridge.startHeartbeat is a function after loading the contract", () => {
    const mockDoc = {
      addEventListener: (_event: string, cb: () => void) => cb(),
      title: "Test Game",
      createElement: () => ({ style: { cssText: "" }, textContent: "" }),
      body: { appendChild: () => {} },
    };
    const mockWindow = {
      parent: { postMessage: () => {} },
      GAME_PARAMS: null,
      GameBridge: undefined as unknown,
      sendNodeComplete: undefined as unknown,
      fireCompanionEvent: undefined as unknown,
      showPreviewBanner: undefined as unknown,
      addEventListener: () => {},
    };
    const context = {
      window: mockWindow,
      document: mockDoc,
      location: { search: "?childId=ila&nodeId=n1" },
      URLSearchParams,
      setInterval: (fn: () => void, _ms: number) => { fn(); return 1; },
      clearInterval: () => {},
    };
    vm.runInNewContext(contractSrc, context);
    const gb = context.window.GameBridge as Record<string, unknown> | undefined;
    expect(typeof gb?.startHeartbeat).toBe("function");
  });

  it("exposes chrome mode for generated visual learner child/parent views", () => {
    const mockDoc = {
      addEventListener: (_event: string, cb: () => void) => cb(),
      title: "Test Game",
      createElement: () => ({ style: { cssText: "" }, textContent: "" }),
      body: { appendChild: () => {} },
    };
    const mockWindow = {
      parent: { postMessage: () => {} },
      GAME_PARAMS: null,
      GameBridge: undefined as unknown,
      sendNodeComplete: undefined as unknown,
      fireCompanionEvent: undefined as unknown,
      showPreviewBanner: undefined as unknown,
      addEventListener: () => {},
    };
    const context = {
      window: mockWindow,
      document: mockDoc,
      location: { search: "?childId=ila&nodeId=n1&chrome=child" },
      URLSearchParams,
      setInterval: (fn: () => void, _ms: number) => {
        fn();
        return 1;
      },
      clearInterval: () => {},
    };
    vm.runInNewContext(contractSrc, context);

    expect((context.window.GAME_PARAMS as unknown as { chrome?: string }).chrome).toBe(
      "child",
    );
  });

  it("startHeartbeat calls reportState via setInterval", () => {
    const calls: string[] = [];
    const mockDoc = {
      addEventListener: (_event: string, cb: () => void) => cb(),
      title: "Test Game",
      createElement: () => ({ style: { cssText: "" }, textContent: "" }),
      body: { appendChild: () => {} },
    };
    const captured: { fn: (() => void) | null } = { fn: null };
    const context = {
      window: {
        parent: { postMessage: () => {} },
        GAME_PARAMS: null,
        GameBridge: undefined as unknown,
        addEventListener: () => {},
      },
      document: mockDoc,
      location: { search: "" },
      URLSearchParams,
      setInterval: (fn: () => void, _ms: number) => {
        captured.fn = fn;
        return 42;
      },
      clearInterval: () => {},
    };
    vm.runInNewContext(contractSrc, context);
    const gb = context.window.GameBridge as {
      startHeartbeat: (
        getState: () => string,
        getExtras?: () => Record<string, unknown>,
      ) => number;
      reportState: (p: string, e?: unknown) => void;
    };
    // Patch reportState so we can spy
    gb.reportState = (p: string) => calls.push(p);
    gb.startHeartbeat(
      () => "spelling farmer",
      () => ({ phase: "playing" }),
    );
    // Fire the interval callback manually
    captured.fn?.();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("spelling farmer");
  });

  it("startHeartbeat returns an intervalId (number)", () => {
    const mockDoc = {
      addEventListener: (_event: string, cb: () => void) => cb(),
      title: "Test Game",
      createElement: () => ({ style: { cssText: "" }, textContent: "" }),
      body: { appendChild: () => {} },
    };
    const context = {
      window: {
        parent: { postMessage: () => {} },
        GAME_PARAMS: null,
        GameBridge: undefined as unknown,
        addEventListener: () => {},
      },
      document: mockDoc,
      location: { search: "" },
      URLSearchParams,
      setInterval: (_fn: () => void, _ms: number) => 99,
      clearInterval: () => {},
    };
    vm.runInNewContext(contractSrc, context);
    const gb = context.window.GameBridge as {
      startHeartbeat: (getState: () => string) => unknown;
    };
    const id = gb.startHeartbeat(() => "state");
    expect(id).toBe(99);
  });

  it("GameBridge.reportAction posts a structured game_state_update", () => {
    const posts: unknown[] = [];
    const mockDoc = {
      title: "Contract Test Game",
      addEventListener: (_name: string, fn: () => void) => fn(),
      createElement: () => ({ style: {}, textContent: "" }),
      body: { appendChild: () => {} },
    };
    const context = {
      window: {
        parent: {
          postMessage: (msg: unknown) => posts.push(msg),
        },
        GAME_PARAMS: null,
        GameBridge: undefined as unknown,
        addEventListener: () => {},
      },
      document: mockDoc,
      location: { search: "?childId=creator&preview=go-live" },
      URLSearchParams,
      setInterval: () => 1,
      clearInterval: () => {},
    };
    vm.runInNewContext(contractSrc, context);
    const gb = context.window.GameBridge as {
      reportAction: (
        action: string,
        progress: string,
        snapshot: Record<string, unknown>,
      ) => void;
    };

    gb.reportAction("letter_selected", "Letter I selected", {
      phase: "idle",
      boardState: "I _ _ _ _ _ _ _",
      guessedLetters: ["I"],
    });

    expect(posts).toContainEqual(
      expect.objectContaining({
        type: "game_state_update",
        payload: expect.objectContaining({
          action: "letter_selected",
          lastAction: "letter_selected",
          boardState: "I _ _ _ _ _ _ _",
          guessedLetters: ["I"],
        }),
      }),
    );
  });

  it("GameBridge.reportCompanionAnchor posts visual learner context for the outer companion", () => {
    const posts: unknown[] = [];
    const mockDoc = {
      title: "Visual Learner",
      addEventListener: (_name: string, fn: () => void) => fn(),
      createElement: () => ({ style: {}, textContent: "" }),
      body: { appendChild: () => {} },
    };
    const context = {
      window: {
        parent: {
          postMessage: (msg: unknown) => posts.push(msg),
        },
        GAME_PARAMS: null,
        GameBridge: undefined as unknown,
        addEventListener: () => {},
      },
      document: mockDoc,
      location: {
        search:
          "?childId=reina&childName=Reina&companion=matilda&companionName=Matilda&nodeId=visual-learner-centimeters&preview=go-live",
      },
      URLSearchParams,
      setInterval: () => 1,
      clearInterval: () => {},
      Date,
    };
    vm.runInNewContext(contractSrc, context);
    const gb = context.window.GameBridge as {
      reportCompanionAnchor: (anchor: Record<string, unknown>) => void;
    };

    gb.reportCompanionAnchor({
      artifactId: "centimeters-vs-inches-1778454253669",
      concept: "centimeters vs inches",
      phase: "prediction",
      question: "Same pencil. Which number will be bigger?",
      selectedAnswer: null,
      allowedRole: "hint_only",
    });

    expect(posts).toContainEqual(
      expect.objectContaining({
        type: "companion_anchor",
        payload: expect.objectContaining({
          artifactId: "centimeters-vs-inches-1778454253669",
          childId: "reina",
          childName: "Reina",
          companion: "matilda",
          companionName: "Matilda",
          nodeId: "visual-learner-centimeters",
          concept: "centimeters vs inches",
          phase: "prediction",
          allowedRole: "hint_only",
          source: "visual_learner_artifact",
        }),
      }),
    );
  });

  it("fireAttemptEvent posts a normalized attempt_event with contract params", () => {
    const posts: unknown[] = [];
    const log = vi.fn();
    const mockDoc = {
      addEventListener: (_event: string, cb: () => void) => cb(),
      title: "Attempt Contract Test",
      createElement: () => ({ style: { cssText: "" }, textContent: "" }),
      body: { appendChild: () => {} },
    };
    const context = {
      window: {
        parent: { postMessage: (msg: unknown) => posts.push(msg) },
        GAME_PARAMS: null,
        GameBridge: undefined as unknown,
        fireAttemptEvent: undefined as unknown,
        addEventListener: () => {},
      },
      document: mockDoc,
      location: { search: "?childId=ila&nodeId=n1&sessionId=s1" },
      URLSearchParams,
      setInterval: () => 1,
      clearInterval: () => {},
      Date: { now: () => 123 },
      console: { log },
    };

    vm.runInNewContext(contractSrc, context);
    const fireAttemptEvent = context.window.fireAttemptEvent as (
      attempt: Record<string, unknown>,
    ) => void;
    fireAttemptEvent({
      domain: "spelling",
      target: "blister",
      attemptedValue: "blster",
      correct: false,
      quality: 1,
      scaffoldLevel: 0,
    });

    expect(posts).toContainEqual(
      expect.objectContaining({
        type: "attempt_event",
        version: "1.0",
        payload: expect.objectContaining({
          childId: "ila",
          nodeId: "n1",
          sessionId: "s1",
          domain: "spelling",
          target: "blister",
          word: "blister",
          attemptedValue: "blster",
          correct: false,
          quality: 1,
          scaffoldLevel: 0,
          timestamp: 123,
        }),
      }),
    );
    expect(log).toHaveBeenCalledWith(
      "🎮 [game-contract] [post] type=attempt_event child=ila node=n1",
    );
  });
});

// ─── 5. HTML games have structured extras (phase) in reportState ─────────────

describe("HTML game structured-extras contract", () => {
  const GAMES_DIR = path.join(PROJECT_ROOT, "web/public/games");
  const GAMES_REQUIRING_PHASE = [
    "spell-check.html",
    "WheelOfFortune.html",
    "clock-game.html",
    "coin-counter.html",
    "word-builder.html",
  ];

  for (const name of GAMES_REQUIRING_PHASE) {
    it(`${name} passes structured extras with phase to GameBridge.reportState`, () => {
      const html = fs.readFileSync(path.join(GAMES_DIR, name), "utf-8");
      // After implementation every game passes an extras object with phase:.
      // WheelOfFortune wraps the call in reportGameState(); both patterns count.
      expect(html).toMatch(/(?:reportGameState|reportState)\s*\([^;]*phase\s*:/s);
    });
  }

  it("WheelOfFortune listens for companion wheel_spin commands", () => {
    const html = fs.readFileSync(
      path.join(GAMES_DIR, "WheelOfFortune.html"),
      "utf-8",
    );
    expect(html).toContain("wheel_spin");
    expect(html).toMatch(/addEventListener\(\s*['"]message['"]/);
  });

  it("WheelOfFortune reports board snapshots with guessed letters and screen text", () => {
    const html = fs.readFileSync(
      path.join(GAMES_DIR, "WheelOfFortune.html"),
      "utf-8",
    );
    expect(html).toContain("getSnapshot");
    expect(html).toContain("guessedLetters");
    expect(html).toContain("screenText");
    expect(html).toContain("wrongGuesses");
  });

  it("WheelOfFortune does not expose the hidden answer in live companion snapshots", () => {
    const html = fs.readFileSync(
      path.join(GAMES_DIR, "WheelOfFortune.html"),
      "utf-8",
    );
    expect(html).toContain("companionVisibleWord");
    expect(html).toContain("hiddenWordLength");
    expect(html).toContain("...(companionVisibleWord ? { currentWord: companionVisibleWord } : {})");
    expect(html).not.toMatch(/currentWord:\s*WORD_RAW,\s*\n\s*category:\s*CATEGORY/);
    expect(html).toMatch(/snapPhase\s*===\s*['"]won['"]/);
    expect(html).toMatch(/snapPhase\s*===\s*['"]lost['"]/);
  });

  it("WheelOfFortune exposes exact coin balance but not coinsEarned during live snapshots", () => {
    const html = fs.readFileSync(
      path.join(GAMES_DIR, "WheelOfFortune.html"),
      "utf-8",
    );
    const snapshotBody = html.slice(
      html.indexOf("const getSnapshot = useCallback"),
      html.indexOf("// Companion heartbeat"),
    );
    expect(snapshotBody).toContain("coins: snapScore");
    expect(snapshotBody).not.toContain("coinsEarned");
  });

  it("WheelOfFortune listens for keyboard letter guesses", () => {
    const html = fs.readFileSync(
      path.join(GAMES_DIR, "WheelOfFortune.html"),
      "utf-8",
    );
    expect(html).toContain("keydown");
    expect(html).toContain("letter_attempt_ignored");
  });
});
