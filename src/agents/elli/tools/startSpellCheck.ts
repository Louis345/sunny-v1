import { tool } from "ai";
import { z } from "zod";

export const SC_ALREADY_ACTIVE =
  "Spell-check typing is already active. Call canvasClear first if you want to restart it.";

export const SC_WORD_TOO_SHORT = "Word must be at least 2 letters.";

export type StartSpellCheckOptions = {
  isSpellCheckSessionActive: () => boolean;
  tryClaimSpellCheckToolSlot: () => boolean;
  isHomeworkSpellingWordAllowed?: (normalizedWord: string) => boolean;
  getHomeworkSpellingRejectMessage?: (normalizedWord: string) => string;
};

/**
 * Per-session tool so execute() matches canvas side effects (AI SDK tool result
 * is what the model sees — must not claim success when the server will block).
 */
export function createStartSpellCheckTool(options: StartSpellCheckOptions) {
  return tool({
    description: `Launch the spell-check typing game when voice spelling is creating confusion. Use this on the 3rd failed attempt of the same word, OR when the child's voice attempts contain the right letters but in wrong order — suggesting Deepgram mishearing rather than spelling confusion.

The child will type the word on the canvas keyboard. Clean signal. No voice ambiguity.

Say: "Let me put it on the board — type it for me this time!"

Never use this as the first attempt. Voice spelling is always tried first.`,

    inputSchema: z.object({
      word: z
        .string()
        .describe(
          "The word to type. Must be from today's spelling homework / active word.",
        ),
    }),

    execute: async (args: { word: string }) => {
      const word = args.word.toLowerCase().trim();
      if (word.length < 2) {
        return {
          ok: false as const,
          error: SC_WORD_TOO_SHORT,
          launched: false as const,
        };
      }
      if (
        options.isHomeworkSpellingWordAllowed &&
        !options.isHomeworkSpellingWordAllowed(word)
      ) {
        return {
          ok: false as const,
          error:
            options.getHomeworkSpellingRejectMessage?.(word) ??
            `Word "${word}" is not on today's extracted spelling homework list.`,
          launched: false as const,
        };
      }
      if (options.isSpellCheckSessionActive()) {
        return {
          ok: false as const,
          error: SC_ALREADY_ACTIVE,
          launched: false as const,
        };
      }
      if (!options.tryClaimSpellCheckToolSlot()) {
        return {
          ok: false as const,
          error: SC_ALREADY_ACTIVE,
          launched: false as const,
        };
      }
      return {
        ok: true as const,
        word,
        launched: true as const,
      };
    },
  });
}

/** Docs / imports that expect a static tool — permissive homework check. */
export const startSpellCheck = createStartSpellCheckTool({
  isSpellCheckSessionActive: () => false,
  tryClaimSpellCheckToolSlot: () => true,
});
