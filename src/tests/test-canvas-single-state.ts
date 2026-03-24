/**
 * BUG-024: Canvas must show only one primary state at a time (no teaching + Word Builder).
 * Mirrors web useSession message handling + Canvas.tsx useEffect/runAnimation behavior.
 *
 * Run: npm run test:canvas-single-state
 */
import assert from "node:assert";
import { canvasHasRenderableContent } from "../shared/canvasRenderability";

type CanvasMode =
  | "idle"
  | "teaching"
  | "reward"
  | "riddle"
  | "championship"
  | "place_value"
  | "spelling"
  | "word-builder"
  | "spell-check";

interface CanvasState {
  mode: CanvasMode;
  svg?: string;
  lottieData?: Record<string, unknown>;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
  pendingAnswer?: string;
  animationKey?: number;
  placeValueData?: unknown;
  spellingWord?: string;
  spellingRevealed?: string[];
  showWord?: "hidden" | "hint" | "always";
  compoundBreak?: number;
  streakCount?: number;
  personalBest?: number;
  gameUrl?: string;
  gameWord?: string;
  gamePlayerName?: string;
  wordBuilderRound?: number;
  wordBuilderMode?: string;
}

interface ClientState {
  canvas: CanvasState;
  sessionState: string;
}

const VALID_MODES: CanvasMode[] = [
  "idle",
  "teaching",
  "reward",
  "riddle",
  "championship",
  "place_value",
  "spelling",
  "word-builder",
  "spell-check",
];

/** Modes whose updates flow through runAnimation in Canvas.tsx */
const ANIMATION_MODES: CanvasMode[] = [
  "teaching",
  "riddle",
  "reward",
  "championship",
  "place_value",
  "spelling",
];

function parseShowCanvasPayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw ?? {}) as Record<string, unknown>;
}

function applyShowCanvasFromToolCall(
  prev: ClientState,
  result: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): ClientState {
  const rawOutput = result?.output ?? result ?? args;
  const data = parseShowCanvasPayload(rawOutput);
  const mode = data.mode as CanvasMode;
  const isSpelling = mode === "spelling";
  const isWordBuilder = mode === "word-builder";
  const isSpellCheck = mode === "spell-check";
  const isGameIframe = isWordBuilder || isSpellCheck;

  const canvas: CanvasState = {
    mode: mode && VALID_MODES.includes(mode) ? mode : "idle",
    svg: data.svg as string | undefined,
    lottieData: data.lottieData as Record<string, unknown> | undefined,
    label: data.label as string | undefined,
    content: data.content as string | undefined,
    phonemeBoxes: data.phonemeBoxes as CanvasState["phonemeBoxes"],
    placeValueData: data.placeValueData,
    spellingWord: isSpelling ? (data.spellingWord as string | undefined) : undefined,
    spellingRevealed: isSpelling ? (data.spellingRevealed as string[] | undefined) : undefined,
    compoundBreak: isSpelling ? (data.compoundBreak as number | undefined) : undefined,
    streakCount: isSpelling ? (data.streakCount as number | undefined) : undefined,
    personalBest: isSpelling ? (data.personalBest as number | undefined) : undefined,
    showWord: isSpelling ? (data.showWord as CanvasState["showWord"]) : undefined,
    gameUrl: isGameIframe ? (data.gameUrl as string | undefined) : undefined,
    gameWord: isGameIframe ? (data.gameWord as string | undefined) : undefined,
    gamePlayerName: isGameIframe ? (data.gamePlayerName as string | undefined) : undefined,
    wordBuilderRound: isWordBuilder ? (data.wordBuilderRound as number | undefined) : undefined,
    wordBuilderMode: isWordBuilder ? (data.wordBuilderMode as string | undefined) : undefined,
    pendingAnswer: undefined,
    animationKey: (prev.canvas.animationKey ?? 0) + 1,
  };

  return { ...prev, canvas };
}

function applyCanvasDraw(
  prev: ClientState,
  msg: Record<string, unknown>
): ClientState {
  const mode = (msg.mode ??
    (msg.args as Record<string, unknown>)?.mode) as CanvasMode;
  const content = (msg.content ??
    (msg.args as Record<string, unknown>)?.content) as string | undefined;
  const label = (msg.label ??
    (msg.args as Record<string, unknown>)?.label) as string | undefined;
  if (!mode || !VALID_MODES.includes(mode)) return prev;

  const data = (msg.args ?? msg) as Record<string, unknown>;
  const isSpelling = mode === "spelling";
  const isWordBuilder = mode === "word-builder";
  const isSpellCheck = mode === "spell-check";
  const isGameIframe = isWordBuilder || isSpellCheck;

  const canvas: CanvasState = {
    mode,
    content,
    label,
    svg: data.svg as string | undefined,
    lottieData: data.lottieData as Record<string, unknown> | undefined,
    phonemeBoxes: data.phonemeBoxes as CanvasState["phonemeBoxes"],
    placeValueData: data.placeValueData,
    spellingWord: isSpelling ? (data.spellingWord as string | undefined) : undefined,
    spellingRevealed: isSpelling ? (data.spellingRevealed as string[] | undefined) : undefined,
    compoundBreak: isSpelling ? (data.compoundBreak as number | undefined) : undefined,
    streakCount: isSpelling ? (data.streakCount as number | undefined) : undefined,
    personalBest: isSpelling ? (data.personalBest as number | undefined) : undefined,
    showWord: isSpelling ? (data.showWord as CanvasState["showWord"]) : undefined,
    gameUrl: isGameIframe ? (data.gameUrl as string | undefined) : undefined,
    gameWord: isGameIframe ? (data.gameWord as string | undefined) : undefined,
    gamePlayerName: isGameIframe ? (data.gamePlayerName as string | undefined) : undefined,
    wordBuilderRound: isWordBuilder ? (data.wordBuilderRound as number | undefined) : undefined,
    wordBuilderMode: isWordBuilder ? (data.wordBuilderMode as string | undefined) : undefined,
    pendingAnswer: undefined,
    animationKey: (prev.canvas.animationKey ?? 0) + 1,
  };

  return { ...prev, canvas };
}

function applySessionState(
  prev: ClientState,
  state: string | undefined
): ClientState {
  const next = state ?? prev.sessionState;
  // Canvas is NOT cleared on IDLE — it persists until an explicit
  // canvas_draw:idle message is received. IDLE means "waiting for child
  // input," not "blank screen." The child needs to see the problem/word.
  return { ...prev, sessionState: next };
}

/**
 * Mirrors Canvas.tsx useEffect([canvas]) + runAnimation branches relevant to teaching / idle.
 * Stale display when switching to word-builder without clearing is intentional (BUG-024).
 */
class CanvasDisplaySimulator {
  displayMode: CanvasMode = "idle";
  displayContent = "";
  riddleLabel = "";

  private runAnimation(canvas: CanvasState): void {
    const { mode, content, label } = canvas;
    const text = content ?? label ?? "";

    switch (mode) {
      case "teaching": {
        this.displayContent = text;
        this.displayMode = "teaching";
        this.riddleLabel = "";
        break;
      }
      case "riddle": {
        this.displayMode = "riddle";
        this.displayContent = text;
        this.riddleLabel = (label ?? "") as string;
        break;
      }
      case "reward": {
        this.displayContent = (label ?? text) as string;
        this.displayMode = "reward";
        this.riddleLabel = "";
        break;
      }
      case "championship": {
        this.displayContent = (label ?? text) as string;
        this.displayMode = "championship";
        this.riddleLabel = "";
        break;
      }
      case "place_value": {
        this.displayMode = "place_value";
        this.displayContent = "";
        this.riddleLabel = "";
        break;
      }
      case "spelling": {
        this.displayMode = "spelling";
        this.displayContent = "";
        this.riddleLabel = "";
        break;
      }
      default: {
        this.displayContent = "";
        this.displayMode = "idle";
        this.riddleLabel = "";
      }
    }
  }

  onCanvasChange(canvas: CanvasState): void {
    const hasContent = canvasHasRenderableContent(canvas);
    if (canvas.mode === "word-builder" || canvas.mode === "spell-check") {
      this.displayContent = "";
      this.displayMode = "idle";
      this.riddleLabel = "";
      return;
    }
    if (
      canvas.mode !== "idle" &&
      hasContent &&
      ANIMATION_MODES.includes(canvas.mode)
    ) {
      this.runAnimation(canvas);
    } else if (canvas.mode === "idle") {
      this.displayContent = "";
      this.displayMode = "idle";
      this.riddleLabel = "";
    }
  }
}

function applyOneMessage(prev: ClientState, msg: unknown): ClientState {
  const m = msg as Record<string, unknown>;
  const type = m.type as string;
  if (type === "tool_call") {
    const tool = m.tool as string;
    const args = (m.args ?? {}) as Record<string, unknown>;
    const result = m.result as Record<string, unknown> | undefined;
    if (tool === "showCanvas" || tool === "show_canvas") {
      return applyShowCanvasFromToolCall(prev, result, args);
    }
    return prev;
  }
  if (type === "canvas_draw") {
    return applyCanvasDraw(prev, m);
  }
  if (type === "session_state") {
    return applySessionState(prev, m.state as string | undefined);
  }
  return prev;
}

function foldMessages(initial: ClientState, messages: unknown[]): ClientState {
  let s = initial;
  for (const msg of messages) {
    s = applyOneMessage(s, msg);
  }
  return s;
}

/**
 * After each server message, apply the same canvas updates as React useEffect([canvas])
 * would see in order — required so teaching → word-builder leaves stale displayMode.
 */
function foldMessagesWithSimulator(
  initial: ClientState,
  messages: unknown[]
): { client: ClientState; sim: CanvasDisplaySimulator } {
  const sim = new CanvasDisplaySimulator();
  let s = initial;
  for (const msg of messages) {
    s = applyOneMessage(s, msg);
    sim.onCanvasChange(s.canvas);
  }
  return { client: s, sim };
}

function teachingLayerVisible(
  canvas: CanvasState,
  sim: CanvasDisplaySimulator
): boolean {
  const showAnimated =
    sim.displayMode === "teaching" ||
    sim.displayMode === "riddle" ||
    sim.displayMode === "reward" ||
    sim.displayMode === "championship" ||
    sim.displayMode === "place_value" ||
    sim.displayMode === "spelling";

  if (!showAnimated) return false;
  if (sim.displayMode === "place_value" && canvas.placeValueData) return true;
  if (sim.displayMode === "spelling" && canvas.spellingWord) return true;
  if (
    sim.displayMode === "teaching" &&
    (canvas.phonemeBoxes?.length || sim.displayContent)
  ) {
    return true;
  }
  if (sim.displayMode === "riddle" || sim.displayMode === "reward" || sim.displayMode === "championship") {
    return true;
  }
  return false;
}

function wordBuilderIframeVisible(canvas: CanvasState): boolean {
  return canvas.mode === "word-builder" && Boolean(canvas.gameUrl);
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (e) {
    console.error(`  ❌ ${name}`);
    throw e;
  }
}

console.log("\n  test-canvas-single-state (BUG-024)\n");

const base: ClientState = {
  canvas: { mode: "idle" },
  sessionState: "PROCESSING",
};

test("Test 1: startWordBuilder clears previous canvas — only Word Builder iframe, not teaching + iframe", () => {
  const messages = [
    {
      type: "tool_call",
      tool: "showCanvas",
      args: {},
      result: {
        output: JSON.stringify({
          mode: "teaching",
          content: "7+3=?",
        }),
      },
    },
    {
      type: "canvas_draw",
      mode: "word-builder",
      gameUrl: "/games/wordd-builder.html",
      gameWord: "train",
      gamePlayerName: "Ila",
      wordBuilderRound: 1,
      wordBuilderMode: "fill_blanks",
    },
  ];
  const { client, sim } = foldMessagesWithSimulator(base, messages);

  const wb = wordBuilderIframeVisible(client.canvas);
  const teach = teachingLayerVisible(client.canvas, sim);
  assert.strictEqual(wb, true, "Word Builder iframe should be requested");
  assert.strictEqual(
    teach,
    false,
    "Teaching layer must not show alongside Word Builder (stale displayMode cleared)"
  );
});

test('Test 2: new showCanvas replaces previous — only "hopped" visible', () => {
  const messages = [
    {
      type: "tool_call",
      tool: "showCanvas",
      args: {},
      result: {
        output: JSON.stringify({
          mode: "teaching",
          content: "railroad",
        }),
      },
    },
    {
      type: "tool_call",
      tool: "showCanvas",
      args: {},
      result: {
        output: JSON.stringify({
          mode: "teaching",
          content: "hopped",
        }),
      },
    },
  ];
  const { client, sim } = foldMessagesWithSimulator(base, messages);

  assert.strictEqual(client.canvas.content, "hopped");
  assert.strictEqual(sim.displayContent, "hopped", "display must show latest teaching content only");
  assert.ok(
    !sim.displayContent.includes("railroad"),
    "previous teaching word must not remain visible"
  );
});

test("Test 3: IDLE session state does NOT clear canvas — teaching word persists", () => {
  const messages = [
    {
      type: "tool_call",
      tool: "showCanvas",
      args: {},
      result: {
        output: JSON.stringify({
          mode: "teaching",
          content: "railroad",
        }),
      },
    },
    { type: "session_state", state: "IDLE" },
  ];
  const { client, sim } = foldMessagesWithSimulator(base, messages);

  assert.strictEqual(
    client.sessionState,
    "IDLE",
    "fixture should end in IDLE"
  );
  assert.strictEqual(
    client.canvas.mode,
    "teaching",
    "canvas must persist through IDLE — explicit canvas_draw:idle required to clear"
  );
  assert.strictEqual(
    client.canvas.content,
    "railroad",
    "teaching word must still be visible"
  );
  assert.strictEqual(sim.displayMode, "teaching");
  assert.strictEqual(sim.displayContent, "railroad");
});

// ─── Test 4: Canvas persists through IDLE transition ──────────────────────
// Bug: session_state:IDLE was unconditionally wiping canvas, destroying the
// math problem or word before the child could see or answer it.
// Expected (fixed): IDLE means "waiting for input" — canvas must survive.
test("Test 4: Canvas persists through IDLE transition — math problem survives", () => {
  const messages = [
    {
      type: "tool_call",
      tool: "showCanvas",
      args: {},
      result: {
        output: JSON.stringify({
          mode: "teaching",
          content: "6 + 4 = ?",
        }),
      },
    },
    { type: "session_state", state: "CANVAS_PENDING" },
    { type: "session_state", state: "SPEAKING" },
    { type: "session_state", state: "IDLE" },
  ];
  const { client, sim } = foldMessagesWithSimulator(base, messages);

  assert.strictEqual(
    client.sessionState,
    "IDLE",
    "session must be IDLE"
  );
  assert.strictEqual(
    client.canvas.mode,
    "teaching",
    "canvas must still be in teaching mode — IDLE must not clear it"
  );
  assert.strictEqual(
    client.canvas.content,
    "6 + 4 = ?",
    "math problem must still be visible after IDLE"
  );
  assert.strictEqual(
    sim.displayMode,
    "teaching",
    "display layer must still show teaching content"
  );
  assert.strictEqual(
    sim.displayContent,
    "6 + 4 = ?",
    "display content must not be erased by IDLE"
  );
});

// ─── Test 5: Canvas clears ONLY on explicit canvas_draw:idle signal ────────
// The server must be the intentional source of canvas clearing —
// only a canvas_draw(mode:idle) message should blank the screen.
test("Test 5: Canvas clears only on explicit canvas_draw:idle — not on session state", () => {
  const messages = [
    {
      type: "tool_call",
      tool: "showCanvas",
      args: {},
      result: {
        output: JSON.stringify({
          mode: "teaching",
          content: "6 + 4 = ?",
        }),
      },
    },
    { type: "session_state", state: "IDLE" },
    { type: "canvas_draw", mode: "idle" },
  ];
  const { client, sim } = foldMessagesWithSimulator(base, messages);

  assert.strictEqual(
    client.canvas.mode,
    "idle",
    "canvas must be idle after explicit canvas_draw:idle"
  );
  assert.strictEqual(
    sim.displayMode,
    "idle",
    "display layer must be idle after explicit canvas_draw:idle"
  );
  assert.strictEqual(sim.displayContent, "", "display content must be empty");
});

console.log("\n  All canvas single-state tests passed\n");
