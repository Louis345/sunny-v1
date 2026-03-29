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
    ]),
    content: z.string().optional().describe("type=text: text to display."),
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
        "Log a graded interaction (worksheet answer or observation). For worksheets, server maps this to the active problem.",
      inputSchema: z.object({
        correct: z.boolean(),
        childSaid: z.string(),
        observation: z.string().optional(),
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
