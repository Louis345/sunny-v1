/**
 * Shared logic for the six-tool canvas/session surface (tests + SessionManager).
 * Server renders; Claude decides — these helpers only mutate a small in-memory draw model.
 */

export type CanvasShowingKind = "idle" | "text" | "svg" | "worksheet" | "game" | string;

export interface PlaceValueDrawData {
  operandA: number;
  operandB: number;
  operation: "addition" | "subtraction";
  layout?: "expanded" | "column";
  activeColumn?: "hundreds" | "tens" | "ones";
  scaffoldLevel?: "full" | "partial" | "minimal" | "hint";
  revealedColumns?: Array<"hundreds" | "tens" | "ones">;
}

export interface SixToolDrawState {
  mode: string;
  content?: string;
  svg?: string;
  label?: string;
  gameUrl?: string;
  activeProblemId?: string;
  placeValueData?: PlaceValueDrawData;
  spellingWord?: string;
  spellingRevealed?: string[];
  revision: number;
}

export interface SixToolsApplyResult {
  dispatched?: boolean;
  canvasShowing?: CanvasShowingKind;
  logged?: boolean;
  canvasState?: SixToolDrawState;
}

export function applyCanvasShow(
  args: Record<string, unknown>,
  prev: SixToolDrawState,
): { state: SixToolDrawState; result: SixToolsApplyResult } {
  const type = String(args.type ?? "");
  const nextRev = prev.revision + 1;
  if (type === "text") {
    const content = String(args.content ?? "");
    const state: SixToolDrawState = {
      mode: "teaching",
      content,
      revision: nextRev,
    };
    return {
      state,
      result: { dispatched: true, canvasShowing: "text", canvasState: state },
    };
  }
  if (type === "svg" || type === "svg_raw") {
    const svg = String(args.svg ?? "");
    const state: SixToolDrawState = {
      mode: "teaching",
      svg,
      label: args.label != null ? String(args.label) : undefined,
      revision: nextRev,
    };
    return {
      state,
      result: { dispatched: true, canvasShowing: "svg", canvasState: state },
    };
  }
  if (type === "worksheet") {
    const problemId = String(args.problemId ?? "");
    const state: SixToolDrawState = {
      mode: "worksheet_pdf",
      activeProblemId: problemId,
      revision: nextRev,
    };
    return {
      state,
      result: { dispatched: true, canvasShowing: "worksheet", canvasState: state },
    };
  }
  if (type === "game") {
    const name = String(args.name ?? "");
    const state: SixToolDrawState = {
      mode: "game",
      content: name,
      revision: nextRev,
    };
    return {
      state,
      result: { dispatched: true, canvasShowing: "game", canvasState: state },
    };
  }
  if (type === "place_value") {
    const placeValueData: PlaceValueDrawData = {
      operandA: Number(args.operandA),
      operandB: Number(args.operandB),
      operation:
        args.operation === "subtraction" ? "subtraction" : "addition",
      layout:
        args.layout === "expanded" || args.layout === "column"
          ? args.layout
          : "column",
      ...(args.activeColumn != null
        ? { activeColumn: args.activeColumn as PlaceValueDrawData["activeColumn"] }
        : {}),
      ...(args.scaffoldLevel != null
        ? { scaffoldLevel: args.scaffoldLevel as PlaceValueDrawData["scaffoldLevel"] }
        : {}),
      ...(Array.isArray(args.revealedColumns)
        ? {
            revealedColumns: args.revealedColumns as PlaceValueDrawData["revealedColumns"],
          }
        : {}),
    };
    const state: SixToolDrawState = {
      mode: "place_value",
      placeValueData,
      revision: nextRev,
    };
    return {
      state,
      result: {
        dispatched: true,
        canvasShowing: "place_value",
        canvasState: state,
      },
    };
  }
  if (type === "spelling") {
    const spellingWord = String(args.spellingWord ?? args.word ?? "");
    const spellingRevealed = Array.isArray(args.spellingRevealed)
      ? (args.spellingRevealed as string[])
      : undefined;
    const state: SixToolDrawState = {
      mode: "spelling",
      spellingWord,
      spellingRevealed,
      revision: nextRev,
    };
    return {
      state,
      result: {
        dispatched: spellingWord.length > 0,
        canvasShowing: "spelling",
        canvasState: state,
      },
    };
  }
  const state: SixToolDrawState = { mode: "idle", revision: nextRev };
  return {
    state,
    result: { dispatched: false, canvasShowing: "idle", canvasState: state },
  };
}

export function applyCanvasClear(prev: SixToolDrawState): {
  state: SixToolDrawState;
  result: { canvasShowing: "idle" };
} {
  return {
    state: { mode: "idle", revision: prev.revision + 1 },
    result: { canvasShowing: "idle" },
  };
}

/** In-memory harness for unit tests (no WebSocket / SessionManager). */
export class SixToolsMemoryHarness {
  draw: SixToolDrawState = { mode: "idle", revision: 0 };
  logs: Array<Record<string, unknown>> = [];
  lastLatencyMs: number | null = null;

  async canvasShow(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const t0 = performance.now();
    const { state, result } = applyCanvasShow(args, this.draw);
    this.draw = state;
    this.lastLatencyMs = performance.now() - t0;
    return { ...result };
  }

  async canvasClear(): Promise<Record<string, unknown>> {
    const { state, result } = applyCanvasClear(this.draw);
    this.draw = state;
    return { ...result };
  }

  async canvasStatus(): Promise<Record<string, unknown>> {
    return {
      canvasShowing:
        this.draw.mode === "idle"
          ? "idle"
          : this.draw.mode === "worksheet_pdf"
            ? "worksheet"
            : (this.draw.mode as CanvasShowingKind),
      revision: this.draw.revision,
    };
  }

  async sessionLog(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.logs.push({ ...args });
    return { logged: true };
  }

  async sessionStatus(): Promise<Record<string, unknown>> {
    return { ok: true };
  }

  async sessionEnd(): Promise<Record<string, unknown>> {
    return { ended: true };
  }
}
