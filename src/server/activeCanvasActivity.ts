import type {
  ActivityMode,
  ActivityPauseState,
} from "./session-context";

export type CanvasActivitySnapshot = {
  mode: ActivityMode;
  canvasState: Record<string, unknown> | null;
  contextCanvas?: Record<string, unknown>;
  worksheet?: {
    problemIndex: number;
    wrongForCurrent: number;
    question: string;
  };
  wordBuilder?: {
    word: string;
    round: number;
  };
  spellCheck?: {
    word: string;
  };
};

export type ActiveCanvasActivityState = {
  mode: ActivityMode;
  pauseState: ActivityPauseState;
  resumable: boolean;
  snapshot: CanvasActivitySnapshot | null;
  reason?: string;
};

type ActiveCanvasActivityHost = {
  readCanvasState: () => Record<string, unknown> | null;
  clearCanvasState: () => void;
  restoreCanvasState: (state: Record<string, unknown>) => void;
  readContextCanvas: () => Record<string, unknown> | undefined;
  updateContextCanvas: (state: Record<string, unknown>) => void;
  readWorksheet: () => { problemIndex: number; question: string } | undefined;
  restoreWorksheetProblemIndex: (problemIndex: number) => void;
  readWordBuilder: () => { word: string; round: number };
  readSpellCheck: () => { word: string };
  clearPendingGameStart: () => void;
  syncActivity: (state: ActiveCanvasActivityState) => void;
  sendCanvas: (payload: Record<string, unknown>) => void;
  broadcastContext: () => void;
  replayWorksheetQuestion: (question: string) => Promise<void>;
};

const initialState = (): ActiveCanvasActivityState => ({
  mode: "none",
  pauseState: "active",
  resumable: false,
  snapshot: null,
});

export class ActiveCanvasActivityController {
  private current: ActiveCanvasActivityState = initialState();

  constructor(private readonly host: ActiveCanvasActivityHost) {}

  get state(): ActiveCanvasActivityState {
    return this.current;
  }

  set(
    mode: ActivityMode,
    opts: {
      resumable?: boolean;
      reason?: string;
      snapshot?: CanvasActivitySnapshot | null;
    } = {},
  ): void {
    this.current = {
      mode,
      pauseState: "active",
      resumable: opts.resumable ?? mode !== "none",
      snapshot: opts.snapshot ?? null,
      reason: opts.reason,
    };
    this.host.syncActivity(this.current);
  }

  clear(): void {
    this.host.clearPendingGameStart();
    this.current = initialState();
    this.host.syncActivity(this.current);
  }

  isPauseRequest(transcript: string): boolean {
    const text = transcript.toLowerCase().trim();
    if (!text) return false;
    if (/(clear|hide|turn off).*(canvas|screen)/i.test(text)) return true;
    return /(talk about my day|tell you about my day|tell you something|need to talk|bad experience)/i.test(text)
      && /(can i|can we|i want to|i need to|could we|just|really quickly|before)/i.test(text);
  }

  isResumeRequest(transcript: string): boolean {
    const text = transcript.toLowerCase().trim();
    return Boolean(text) && /(\bi'?m ready\b|\blet'?s go back\b|\bgo back to\b|\bresume\b|\bcontinue\b|\bback to (math|the problem|the worksheet)\b)/i.test(text);
  }

  capture(): CanvasActivitySnapshot | null {
    const mode = this.current.mode;
    if (mode === "none") return null;
    const canvasState = this.host.readCanvasState();
    const contextCanvas = this.host.readContextCanvas();
    if (mode === "worksheet") {
      const worksheet = this.host.readWorksheet();
      return {
        mode,
        canvasState: canvasState ? { ...canvasState } : null,
        contextCanvas: contextCanvas ? { ...contextCanvas } : undefined,
        worksheet: {
          problemIndex: worksheet?.problemIndex ?? 0,
          wrongForCurrent: 0,
          question: worksheet?.question ?? "",
        },
      };
    }
    if (mode === "word-builder") {
      return {
        mode,
        canvasState: canvasState ? { ...canvasState } : null,
        contextCanvas: contextCanvas ? { ...contextCanvas } : undefined,
        wordBuilder: this.host.readWordBuilder(),
      };
    }
    if (mode === "spell-check") {
      return {
        mode,
        canvasState: canvasState ? { ...canvasState } : null,
        contextCanvas: contextCanvas ? { ...contextCanvas } : undefined,
        spellCheck: this.host.readSpellCheck(),
      };
    }
    return {
      mode,
      canvasState: canvasState ? { ...canvasState } : null,
      contextCanvas: contextCanvas ? { ...contextCanvas } : undefined,
    };
  }

  async pause(reason: string): Promise<boolean> {
    if (
      this.current.mode === "none" ||
      !this.current.resumable ||
      this.current.pauseState === "paused_for_checkin"
    ) return false;
    const snapshot = this.capture();
    if (!snapshot) return false;
    this.current = {
      ...this.current,
      pauseState: "paused_for_checkin",
      snapshot,
      reason,
    };
    this.host.syncActivity(this.current);
    this.host.clearCanvasState();
    this.host.updateContextCanvas({
      mode: "idle",
      svg: undefined,
      label: undefined,
      content: undefined,
      sceneDescription: undefined,
      problemAnswer: undefined,
      problemHint: undefined,
    });
    this.host.broadcastContext();
    this.host.sendCanvas({ mode: "idle" });
    return true;
  }

  async resume(replayQuestion = true): Promise<boolean> {
    if (this.current.pauseState !== "paused_for_checkin" || !this.current.snapshot) return false;
    const snapshot = this.current.snapshot;
    this.current = { ...this.current, pauseState: "resuming" };
    this.host.syncActivity(this.current);
    if (snapshot.mode === "worksheet" && snapshot.worksheet) {
      this.host.restoreWorksheetProblemIndex(snapshot.worksheet.problemIndex);
      if (snapshot.canvasState) this.host.restoreCanvasState({ ...snapshot.canvasState });
      if (snapshot.contextCanvas) this.host.updateContextCanvas({ ...snapshot.contextCanvas });
      this.host.broadcastContext();
      if (snapshot.canvasState) {
        this.host.sendCanvas({ args: snapshot.canvasState, result: snapshot.canvasState });
      }
      if (replayQuestion) await this.host.replayWorksheetQuestion(snapshot.worksheet.question);
    } else if (snapshot.canvasState) {
      this.host.restoreCanvasState({ ...snapshot.canvasState });
      if (snapshot.contextCanvas) this.host.updateContextCanvas({ ...snapshot.contextCanvas });
      this.host.sendCanvas(snapshot.canvasState);
    }
    this.current = {
      ...this.current,
      pauseState: "active",
      snapshot: null,
      reason: undefined,
    };
    this.host.syncActivity(this.current);
    this.host.broadcastContext();
    return true;
  }
}
