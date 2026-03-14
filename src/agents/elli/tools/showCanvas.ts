import { tool } from "ai";
import { z } from "zod";

const showCanvasSchema = z.object({
  mode: z
    .enum(["teaching", "reward", "riddle", "championship"])
    .describe(
      "Canvas display mode. teaching = show word/problem. reward = celebration drawing. riddle = riddle text. championship = level-up ceremony."
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
});

export type ShowCanvasArgs = z.infer<typeof showCanvasSchema>;

export const showCanvas = tool({
  description:
    "Draw on the child's screen. Use 'teaching' mode to display words, phonemes, or math problems. Use 'reward' mode after correct answers to draw something fun and unique (the child sees your SVG). Use 'riddle' mode at 3 correct to show a riddle. Use 'championship' mode at 5 correct for a level-up ceremony. For reward/championship: generate a unique, fun SVG drawing related to the conversation — animals, rockets, silly faces, anything the child would love. Never draw the same thing twice. Keep SVG under 2000 characters.",
  inputSchema: showCanvasSchema,
  execute: async (args) => args,
});
