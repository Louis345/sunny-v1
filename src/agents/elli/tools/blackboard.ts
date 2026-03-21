import { tool } from "ai";
import { z } from "zod";

export const blackboard = tool({
  description: `Use the blackboard to show a word visually
    during spelling practice. Like a teacher with chalk —
    use it when it helps, ignore it when talking is enough.

    Four gestures:
    - flash: show word large for duration ms then auto-hide
    - reveal: show word, stays visible
    - mask: show word with _ at hidden positions e.g. "ra_lroad"
    - clear: wipe the board blank

    The board does NOT track spelling progress.
    It is purely visual punctuation for the conversation.`,

  inputSchema: z
    .object({
      gesture: z.enum(["flash", "reveal", "mask", "clear"]),
      word: z
        .string()
        .optional()
        .describe("Required for flash and reveal"),
      maskedWord: z
        .string()
        .optional()
        .describe(
          "Required for mask. Use _ for hidden letters. Example: ra_lroad"
        ),
      duration: z
        .number()
        .optional()
        .describe("For flash only. Milliseconds to show word. Default 3000."),
    })
    .refine(
      (d) => {
        if (d.gesture === "flash") return !!d.word;
        if (d.gesture === "reveal") return !!d.word;
        if (d.gesture === "mask") return !!d.maskedWord;
        return true;
      },
      {
        message: "word required for flash/reveal, maskedWord required for mask",
      }
    ),

  execute: async (args) => args,
});
