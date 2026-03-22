import { tool } from "ai";
import { z } from "zod";

export const startWordBuilder = tool({
  description: `Launch the Word Builder spelling scaffold on the canvas. Use this in TWO situations:

1. WARM-UP: Before drilling a word, offer Word Builder so the child sees the word shape with some blanks. They fill in the missing letters, then you clear the canvas and ask them to spell it from memory. This builds confidence before the harder dictation step.

2. STUCK: If a child is struggling with a word after one failed attempt, launch Word Builder with that word to give them visual scaffolding.

The word must be from today's spelling homework.
One Word Builder game per session maximum.
Do not use as a reward — Space Invaders is the reward. Word Builder is a teaching tool.
After the game ends, always follow up with full spelling dictation of the same word.`,

  inputSchema: z.object({
    word: z
      .string()
      .describe(
        "The secret word the child has chosen. Must be from today's spelling list and already spelled correctly this session."
      ),
  }),

  execute: async (args: { word: string }) => args,
});
