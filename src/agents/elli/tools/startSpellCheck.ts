import { tool } from "ai";
import { z } from "zod";

export const startSpellCheck = tool({
  description: `Launch the spell-check typing game when voice spelling is creating confusion. Use this on the 3rd failed attempt of the same word, OR when the child's voice attempts contain the right letters but in wrong order — suggesting Deepgram mishearing rather than spelling confusion.

The child will type the word on the canvas keyboard. Clean signal. No voice ambiguity.

Say: "Let me put it on the board — type it for me this time!"

Never use this as the first attempt. Voice spelling is always tried first.`,

  inputSchema: z.object({
    word: z
      .string()
      .describe(
        "The word to type. Must be from today's spelling homework / active word."
      ),
  }),

  execute: async (args: { word: string }) => args,
});
