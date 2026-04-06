import { tool } from "ai";
import { z } from "zod";
import { REWARD_CHARACTER_SVG } from "../../server/canvas/registry";

/** Implemented by SessionManager (or test harness). */
export interface SixToolsHost {
  canvasShow(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  canvasClear(): Promise<Record<string, unknown>>;
  canvasStatus(): Promise<Record<string, unknown>>;
  sessionLog(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  sessionStatus(): Promise<Record<string, unknown>>;
  sessionEnd(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const placeValueColumn = z.enum(["hundreds", "tens", "ones"]);

/**
 * Single root object schema (not z.union / discriminatedUnion) so JSON Schema
 * sent to Anthropic has input_schema.type === "object". Unions at the root
 * omit that field and the API returns tools.N.custom.input_schema.type: Field required.
 */
const canvasShowSchema = z
  .object({
    type: z.enum([
      "text",
      "svg",
      "svg_raw",
      "worksheet",
      "game",
      "place_value",
      "spelling",
      "riddle",
      "math_inline",
      "reward",
      "championship",
      "blackboard",
      "karaoke",
      "sound_box",
      "clock",
      "score_meter",
    ]),
    content: z.string().optional().describe("type=text: text to display."),
    phonemeBoxes: z
      .array(
        z.object({
          position: z.string(),
          value: z.string(),
          highlighted: z.boolean(),
        }),
      )
      .optional()
      .describe("type=text: optional phoneme tiles for spelling."),
    text: z.string().optional().describe("type=riddle: riddle body."),
    expression: z
      .string()
      .optional()
      .describe("type=math_inline: math line to show as teaching content."),
    problemId: z.string().optional().describe("type=worksheet: problem id."),
    name: z.string().optional().describe("type=game: registered game id."),
    svg: z.string().optional().describe("type=svg or svg_raw: raw SVG markup."),
    label: z.string().optional().describe("Label under SVG or celebration line."),
    character: z
      .string()
      .optional()
      .describe("type=reward: built-in character id (e.g. hitodama) — resolved to SVG."),
    operandA: z.number().optional().describe("type=place_value: first operand (e.g. 743)."),
    operandB: z.number().optional().describe("type=place_value: second operand (e.g. 124)."),
    operation: z
      .enum(["addition", "subtraction"])
      .optional()
      .describe("type=place_value: operation."),
    layout: z
      .enum(["expanded", "column"])
      .optional()
      .describe("type=place_value: layout."),
    activeColumn: placeValueColumn
      .optional()
      .describe("type=place_value: column to highlight (hundreds | tens | ones)."),
    scaffoldLevel: z
      .enum(["full", "partial", "minimal", "hint"])
      .optional()
      .describe("type=place_value: visual scaffold density."),
    revealedColumns: z
      .array(placeValueColumn)
      .optional()
      .describe("type=place_value: columns already solved."),
    spellingWord: z.string().optional().describe("type=spelling: full word on the board."),
    word: z.string().optional().describe("type=spelling: alias for spellingWord (registry)."),
    spellingRevealed: z
      .array(z.string())
      .optional()
      .describe("type=spelling: letters confirmed so far."),
    revealed: z
      .array(z.string())
      .optional()
      .describe("type=spelling: alias for spellingRevealed."),
    showWord: z.enum(["hidden", "hint", "always"]).optional(),
    compoundBreak: z.number().optional(),
    streakCount: z.number().optional(),
    personalBest: z.number().optional(),
    lottieData: z.record(z.string(), z.any()).optional(),
    style: z.record(z.string(), z.any()).optional(),
    riveAction: z
      .string()
      .optional()
      .describe("Optional Rive state machine trigger name (e.g. celebrate)."),
    gesture: z
      .enum(["flash", "reveal", "mask", "clear"])
      .optional()
      .describe("type=blackboard: gesture."),
    maskedWord: z.string().optional().describe("type=blackboard: masked display."),
    duration: z.number().optional().describe("type=blackboard: gesture duration ms."),
    storyText: z.string().optional().describe("type=karaoke: full story text."),
    words: z.array(z.string()).optional().describe("type=karaoke: ordered words for highlighting."),
    fontSize: z.number().optional().describe("type=karaoke: optional font size."),
    targetWord: z.string().optional().describe("type=sound_box: word being decomposed."),
    phonemes: z
      .array(
        z.object({
          label: z.string(),
          sound: z.string(),
        }),
      )
      .optional()
      .describe("type=sound_box: phoneme boxes."),
    highlightIndex: z.number().optional().describe("type=sound_box: highlighted box index."),
    hour: z.number().optional().describe("type=clock: hour 1–12."),
    minute: z.number().optional().describe("type=clock: minute 0–59."),
    display: z
      .enum(["analog", "digital", "both"])
      .optional()
      .describe("type=clock: display mode."),
    score: z.number().optional().describe("type=score_meter: current score."),
    max: z.number().optional().describe("type=score_meter: max score."),
  })
  .superRefine((data, ctx) => {
    if (data.type === "place_value") {
      if (typeof data.operandA !== "number" || Number.isNaN(data.operandA)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "operandA is required when type is place_value",
          path: ["operandA"],
        });
      }
      if (typeof data.operandB !== "number" || Number.isNaN(data.operandB)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "operandB is required when type is place_value",
          path: ["operandB"],
        });
      }
      if (data.operation !== "addition" && data.operation !== "subtraction") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "operation must be addition or subtraction when type is place_value",
          path: ["operation"],
        });
      }
    }
    if (data.type === "spelling") {
      const w = (data.spellingWord ?? data.word ?? "").trim();
      if (w.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "spellingWord or word is required when type is spelling",
          path: ["spellingWord"],
        });
      }
    }
    if (data.type === "text") {
      const c = data.content?.trim() ?? "";
      if (c.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "content is required when type is text",
          path: ["content"],
        });
      }
    }
    if (data.type === "riddle") {
      const t = data.text?.trim() ?? "";
      if (t.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "text is required when type is riddle",
          path: ["text"],
        });
      }
    }
    if (data.type === "math_inline") {
      const e = data.expression?.trim() ?? "";
      if (e.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "expression is required when type is math_inline",
          path: ["expression"],
        });
      }
    }
    if (data.type === "svg" || data.type === "svg_raw") {
      const s = data.svg?.trim() ?? "";
      if (s.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "svg is required for svg / svg_raw",
          path: ["svg"],
        });
      }
    }
    if (data.type === "reward") {
      const lab = data.label?.trim() ?? "";
      if (lab.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "label is required when type is reward",
          path: ["label"],
        });
      }
    }
    if (data.type === "championship") {
      const lab = data.label?.trim() ?? "";
      if (lab.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "label is required when type is championship",
          path: ["label"],
        });
      }
    }
    if (data.type === "blackboard") {
      if (!data.gesture) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "gesture is required when type is blackboard",
          path: ["gesture"],
        });
      }
    }
    if (data.type === "karaoke") {
      const st = data.storyText?.trim() ?? "";
      if (st.length === 0 || !data.words || data.words.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "storyText and non-empty words are required for karaoke",
          path: ["storyText"],
        });
      }
    }
    if (data.type === "sound_box") {
      const tw = data.targetWord?.trim() ?? "";
      if (tw.length === 0 || !data.phonemes || data.phonemes.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "targetWord and non-empty phonemes are required for sound_box",
          path: ["targetWord"],
        });
      }
    }
    if (data.type === "clock") {
      if (
        typeof data.hour !== "number" ||
        typeof data.minute !== "number" ||
        !data.display
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "hour, minute, and display are required for clock",
          path: ["hour"],
        });
      }
    }
    if (data.type === "score_meter") {
      if (typeof data.score !== "number" || typeof data.max !== "number" || !data.label?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "score, max, and label are required for score_meter",
          path: ["score"],
        });
      }
    }
  });

export function createSixTools(host: SixToolsHost) {
  return {
    canvasShow: tool({
      description:
        "Render on the child's canvas. See session manifest [Canvas Capabilities] for types: text, svg, svg_raw, worksheet, game, place_value, spelling (spellingWord/word, spellingRevealed/revealed), riddle (text), math_inline (expression), reward (label, optional character/svg), championship (label). Each call replaces whatever was showing (mutex).",
      inputSchema: canvasShowSchema,
      execute: async (args) => {
        const a = { ...(args as Record<string, unknown>) };
        if (a.type === "spelling") {
          if (a.spellingWord == null && a.word != null) a.spellingWord = a.word;
          if (a.spellingRevealed == null && a.revealed != null) {
            a.spellingRevealed = a.revealed;
          }
        }
        if (a.type === "reward") {
          const svgStr =
            typeof a.svg === "string" ? a.svg.trim() : "";
          const ch =
            typeof a.character === "string" ? a.character.trim() : "";
          if (!svgStr && ch && REWARD_CHARACTER_SVG[ch]) {
            a.svg = REWARD_CHARACTER_SVG[ch];
          }
        }
        return host.canvasShow(a);
      },
    }),
    canvasClear: tool({
      description: "Clear the canvas to idle.",
      inputSchema: z.object({}),
      execute: async () => host.canvasClear(),
    }),
    canvasStatus: tool({
      description: "Return current canvas mode and revision.",
      inputSchema: z.object({}),
      execute: async () => host.canvasStatus(),
    }),
    sessionLog: tool({
      description:
        "Log a graded interaction (worksheet answer or observation). For worksheets, server maps this to the active problem. For spelling homework or post–Word Builder dictation, pass word (normalized on server) so progress and rewards stay in sync with sessionStatus. When an activity is skipped due to child state, call sessionLog({ skipped: true, reason: '...', activity?: '...' }) so the Psychologist knows what happened and why. Do not skip logging — even skips are data.",
      inputSchema: z
        .object({
          action: z
            .string()
            .optional()
            .describe(
              'Diagnostic image: use "generate_image" with observation = full scene to illustrate.',
            ),
          scene: z
            .string()
            .optional()
            .describe("Alias for observation when action is generate_image."),
          skipped: z
            .boolean()
            .optional()
            .describe("When true, record a deferral for the psychologist (no correct/incorrect)."),
          reason: z.string().optional().describe("Required when skipped is true."),
          activity: z
            .string()
            .optional()
            .describe("Short label for what was deferred (optional; defaults if omitted)."),
          correct: z.boolean().optional(),
          childSaid: z.string().optional(),
          word: z
            .string()
            .optional()
            .describe(
              "Spelling: the word being graded (must match the word on canvas when applicable).",
            ),
          observation: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          if (data.action === "generate_image") {
            const scene = (data.observation ?? data.scene ?? "").trim();
            if (!scene) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  "observation or scene is required when action is generate_image",
                path: ["observation"],
              });
            }
            return;
          }
          if (data.skipped === true) {
            if (!data.reason?.trim()) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "reason is required when skipped is true",
                path: ["reason"],
              });
            }
            return;
          }
          if (data.correct !== true && data.correct !== false) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "correct is required unless skipped is true",
              path: ["correct"],
            });
          }
          if (typeof data.childSaid !== "string") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "childSaid is required unless skipped is true",
              path: ["childSaid"],
            });
          }
        }),
      execute: async (args) =>
        host.sessionLog(args as Record<string, unknown>),
    }),
    sessionStatus: tool({
      description: "Session summary for the model (streak, phase, worksheet progress when applicable).",
      inputSchema: z.object({}),
      execute: async () => host.sessionStatus(),
    }),
    sessionEnd: tool({
      description:
        "End the session only when the child or parent says exactly 'end session' or 'end the session'.",
      inputSchema: z.object({
        childName: z.string(),
        reason: z.enum(["child_requested", "session_complete", "goodbye"]),
      }),
      execute: async (args) => host.sessionEnd(args as Record<string, unknown>),
    }),
  } as const;
}
