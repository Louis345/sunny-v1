import { tool } from "ai";
import { z } from "zod";

/** Shown to the model and client when a second launch is rejected. */
export const WB_ALREADY_ACTIVE =
  "Word Builder is already active. Call canvasClear first if you want to restart it.";

export const WB_WORD_TOO_SHORT = "Word must be at least 3 letters.";

export type StartWordBuilderOptions = {
  /** True when an iframe Word Builder round is already in progress (server authority). */
  isWordBuilderSessionActive: () => boolean;
  /**
   * Reserve a single successful launch per agent step when the SDK runs multiple
   * tool executes before any handleToolCall (prevents two ok:true in one step).
   */
  tryClaimWordBuilderToolSlot: () => boolean;
  /** When set, word must pass this check (session spelling homework gate). */
  isHomeworkSpellingWordAllowed?: (normalizedWord: string) => boolean;
  /** Shown to the model when `isHomeworkSpellingWordAllowed` returns false. */
  getHomeworkSpellingRejectMessage?: (normalizedWord: string) => string;
};

/**
 * Per-session tool so execute() matches canvas side effects (AI SDK tool result
 * is what the model sees — must not claim success when the server will block).
 */
export function createStartWordBuilderTool(options: StartWordBuilderOptions) {
  return tool({
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
          "The secret word the child has chosen. Must be from today's spelling list and already spelled correctly this session.",
        ),
    }),

    execute: async (args: { word: string }) => {
      const word = args.word.toLowerCase().trim();
      if (word.length < 3) {
        return {
          ok: false as const,
          error: WB_WORD_TOO_SHORT,
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
      if (options.isWordBuilderSessionActive()) {
        return {
          ok: false as const,
          error: WB_ALREADY_ACTIVE,
          launched: false as const,
        };
      }
      if (!options.tryClaimWordBuilderToolSlot()) {
        return {
          ok: false as const,
          error: WB_ALREADY_ACTIVE,
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
