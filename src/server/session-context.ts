import { getSessionTypeConfig } from "./session-type-registry";

export type SessionType = "freeform" | "worksheet" | "spelling" | "wordle" | "game";
export type CanvasOwner = "server" | "companion";

export interface CanvasState {
  mode: "idle" | "teaching" | "reward" | "riddle" | "championship";
  svg?: string;
  label?: string;
  content?: string;
  phonemeBoxes?: { position: string; value: string; highlighted: boolean }[];
  /** Plain-text description of the visual scene the child sees (e.g. "Cookie shop. Oatmeal 10¢, Chocolate chip 15¢, Sugar 10¢.") */
  sceneDescription?: string;
  /** The correct answer for the current problem — so the companion knows what to grade toward. */
  problemAnswer?: string;
  /** A hint to offer when the child is stuck. */
  problemHint?: string;
}

export interface AssignmentQuestion {
  index: number;
  text: string;
  answerType: "multiple_choice" | "open" | "numeric" | "syllable_division";
  options?: string[];
  correctAnswer?: string;
}

export interface AssignmentManifest {
  childName: string;
  title: string;
  questions: AssignmentQuestion[];
  source: string;
  createdAt: string;
}

export interface AttemptRecord {
  questionIndex: number;
  answer: string;
  correct: boolean;
  timestamp: string;
}

export interface SessionContext {
  childName: string;
  companionName: string;
  sessionType: SessionType;

  canvas: {
    owner: CanvasOwner;
    current: CanvasState;
    locked: boolean;
  };

  assignment?: {
    questions: AssignmentQuestion[];
    currentIndex: number;
    attempts: AttemptRecord[];
  };

  correctStreak: number;
  sessionPhase: string;
  roundNumber: number;
  availableToolNames: string[];

  isToolCallAllowed: (toolName: string) => boolean;
  updateCanvas: (state: Partial<CanvasState>) => void;
  serialize: () => SerializedSessionContext;
}

export interface SerializedSessionContext {
  childName: string;
  sessionType: SessionType;
  canvasOwner: CanvasOwner;
  canvasState: CanvasState;
  correctStreak: number;
  sessionPhase: string;
  roundNumber: number;
  assignmentProgress?: { currentIndex: number; total: number; completed: number };
}

export function createSessionContext(opts: {
  childName: string;
  sessionType: SessionType;
  companionName?: string;
  assignment?: AssignmentManifest;
  /** When set, overrides registry canvas ownership (e.g. tests). */
  canvasOwner?: CanvasOwner;
  /** When set, overrides registry tool list (e.g. tests). */
  availableToolNames?: string[];
}): SessionContext {
  const config = getSessionTypeConfig(opts.sessionType);
  const canvasOwner = opts.canvasOwner ?? config.canvasOwner;
  const availableToolNames = opts.availableToolNames ?? Object.keys(config.tools);

  const canvas: SessionContext["canvas"] = {
    owner: canvasOwner,
    current: { mode: "idle" },
    locked: canvasOwner === "server",
  };

  const ctx: SessionContext = {
    childName: opts.childName,
    companionName: opts.companionName ?? (opts.childName === "Ila" ? "Elli" : "Matilda"),
    sessionType: opts.sessionType,
    canvas,
    correctStreak: 0,
    sessionPhase: "warmup",
    roundNumber: 0,
    availableToolNames,

    isToolCallAllowed(toolName: string): boolean {
      if (this.canvas.locked && (toolName === "showCanvas" || toolName === "show_canvas")) {
        return false;
      }
      return this.availableToolNames.includes(toolName);
    },

    updateCanvas(state: Partial<CanvasState>): void {
      this.canvas.current = { ...this.canvas.current, ...state };
    },

    serialize(): SerializedSessionContext {
      return {
        childName: this.childName,
        sessionType: this.sessionType,
        canvasOwner: this.canvas.owner,
        canvasState: this.canvas.current,
        correctStreak: this.correctStreak,
        sessionPhase: this.sessionPhase,
        roundNumber: this.roundNumber,
        assignmentProgress: this.assignment
          ? {
              currentIndex: this.assignment.currentIndex,
              total: this.assignment.questions.length,
              completed: this.assignment.attempts.filter((a) => a.correct).length,
            }
          : undefined,
      };
    },
  };

  if (opts.assignment) {
    ctx.assignment = {
      questions: opts.assignment.questions,
      currentIndex: 0,
      attempts: [],
    };
  }

  return ctx;
}

/**
 * Build a context injection string that tells Claude what's on the canvas.
 * Appended to the user message on every turn so Claude stays in sync.
 *
 * This is THE hook that keeps the companion aware of what the child sees.
 * Every canvas-relevant field (scene, answer, hint) must flow through here.
 */
export function buildCanvasContextMessage(ctx: SessionContext): string {
  const lines: string[] = [];
  const c = ctx.canvas.current;

  lines.push("[Canvas State]");
  lines.push(`Mode: ${c.mode}`);

  if (c.sceneDescription) {
    lines.push(`Scene on screen: ${c.sceneDescription}`);
  }
  if (c.content) {
    lines.push(`Question: ${c.content}`);
  }
  if (c.label) {
    lines.push(`Label: ${c.label}`);
  }
  if (c.svg) {
    lines.push("SVG: (visual rendered on screen — the child can see the scene described above)");
  }

  if (c.problemAnswer) {
    lines.push(`Correct answer: ${c.problemAnswer}`);
  }
  if (c.problemHint) {
    lines.push(`Hint (if child is stuck): ${c.problemHint}`);
  }

  lines.push(`Canvas control: ${ctx.canvas.owner === "server" ? "server-driven" : "companion-driven"}`);

  if (ctx.canvas.owner === "server") {
    lines.push(
      `IMPORTANT: Canvas is server-driven for this ${ctx.sessionType} session. Do not call showCanvas — the server controls what the child sees.`
    );
  }

  if (ctx.assignment) {
    const { currentIndex, questions, attempts } = ctx.assignment;
    const total = questions.length;
    const completed = attempts.filter((a) => a.correct).length;
    lines.push(`Assignment: Question ${currentIndex + 1} of ${total} (${completed} correct so far)`);
    if (questions[currentIndex]) {
      lines.push(`Current question: ${questions[currentIndex].text}`);
    }
  }

  return lines.join("\n");
}
