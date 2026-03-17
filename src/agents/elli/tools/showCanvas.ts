import { tool } from "ai";
import { z } from "zod";

const showCanvasSchema = z.object({
  mode: z
    .enum(["teaching", "reward", "riddle", "championship", "place_value"])
    .describe(
      "Canvas display mode. teaching = show word/problem. reward = celebration drawing. riddle = riddle text. championship = level-up ceremony. place_value = hundreds/tens/ones table for multi-digit addition or subtraction."
    ),
  svg: z
    .string()
    .optional()
    .describe(
      "Raw SVG markup to render on the canvas. Claude generates this. Used for reward and championship modes. Keep SVG under 2000 characters for fast rendering."
    ),
  label: z
    .string()
    .optional()
    .describe(
      "Text label shown below the SVG. e.g. 'You earned a fire-breathing dragon!' or 'Championship round!'."
    ),
  content: z
    .string()
    .optional()
    .describe(
      "For teaching mode: the word, phoneme, or math problem to display. For riddle mode: the riddle text."
    ),
  phonemeBoxes: z
    .array(
      z.object({
        position: z.enum(["first", "middle", "last"]),
        value: z.string(),
        highlighted: z.boolean(),
      })
    )
    .optional()
    .describe(
      "For Ila phoneme segmentation: the three sound boxes. Mark the one being asked about as highlighted."
    ),
  lottieData: z.record(z.string(), z.unknown()).optional().describe(
    "Pre-parsed Lottie animation JSON. Used by test panel for celebration preset. Agent should use svg instead."
  ),
  placeValueData: z
    .object({
      operandA: z.number().describe("First number, e.g. 743"),
      operandB: z.number().describe("Second number, e.g. 124"),
      operation: z
        .enum(["addition", "subtraction"])
        .optional()
        .describe("Default: addition"),
      layout: z
        .enum(["expanded", "column"])
        .optional()
        .describe(
          "expanded = break-apart rows (700+40+3). column = stacked digits with dividers. Default: column."
        ),
      activeColumn: z
        .enum(["hundreds", "tens", "ones"])
        .optional()
        .describe("Which column to highlight in amber — the one currently being asked about."),
      scaffoldLevel: z
        .enum(["full", "partial", "minimal", "hint"])
        .optional()
        .describe(
          "full = labels + dividers + highlight (Ila starting state). partial = dividers + highlight, no labels. minimal = just numbers, no labels or dividers (Reina default). hint = full scaffold shown after a wrong answer."
        ),
      revealedColumns: z
        .array(z.enum(["hundreds", "tens", "ones"]))
        .optional()
        .describe("Columns already answered correctly — show their sum values filled in."),
    })
    .optional()
    .describe(
      "REQUIRED when mode=place_value. Renders a hundreds/tens/ones table for multi-digit addition or subtraction homework. All fields (operandA, operandB, etc.) go INSIDE this object, not as top-level params."
    ),
}).refine(
  (data) => data.mode !== "place_value" || data.placeValueData !== undefined,
  { message: "placeValueData is required when mode is 'place_value'. Put operandA, operandB, operation, layout, scaffoldLevel, activeColumn, and revealedColumns inside placeValueData.", path: ["placeValueData"] }
);

export type ShowCanvasArgs = z.infer<typeof showCanvasSchema>;

export const showCanvas = tool({
  description:
    "Draw on the child's screen. Call this tool immediately and in parallel with other tools. Never wait for logAttempt or mathProblem to resolve first. Use 'teaching' mode to display words, phonemes, or math problems. Use 'reward' mode after correct answers to draw something fun and unique (the child sees your SVG). Use 'riddle' mode at 3 correct to show a riddle. Use 'championship' mode at 5 correct for a level-up ceremony. For reward/championship: generate a unique, fun SVG drawing related to the conversation — animals, rockets, silly faces, anything the child would love. Never draw the same thing twice. Keep SVG under 2000 characters.",
  inputSchema: showCanvasSchema,
  execute: async (args) => {
    const input = { ...args };
    if (input.svg) {
      input.svg = input.svg
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
    // Guard: empty phonemeBox values render as blank on screen — replace with "?"
    // so the child always has something to look at.
    const phonemeBoxes = input.phonemeBoxes?.map((box) => ({
      ...box,
      value: box.value.trim() === "" ? "?" : box.value,
    }));
    return {
      mode: input.mode,
      content: input.content,
      svg: input.svg,
      label: input.label,
      phonemeBoxes,
      lottieData: input.lottieData,
      placeValueData: input.placeValueData,
    };
  },
});
