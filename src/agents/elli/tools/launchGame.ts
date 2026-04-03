import { tool } from "ai";
import { z } from "zod";
import {
  resolveLaunchGameRequest,
  type ResolvedLaunchGameRequest,
} from "../../../server/games/resolveLaunchGameRequest";

/** Shown to the model and client when a second Word Builder launch is rejected. */
export const WB_ALREADY_ACTIVE =
  "Word Builder is already active. Call canvasClear first if you want to restart it.";

export const WB_WORD_TOO_SHORT = "Word must be at least 3 letters.";

/** Shown when spell-check is already running. */
export const SC_ALREADY_ACTIVE =
  "Spell-check typing is already active. Call canvasClear first if you want to restart it.";

export const SC_WORD_TOO_SHORT = "Word must be at least 2 letters.";

export type LaunchGameSpellingOptions = {
  isWordBuilderSessionActive: () => boolean;
  tryClaimWordBuilderToolSlot: () => boolean;
  isSpellCheckSessionActive: () => boolean;
  tryClaimSpellCheckToolSlot: () => boolean;
  isHomeworkSpellingWordAllowed?: (normalizedWord: string) => boolean;
  getHomeworkSpellingRejectMessage?: (normalizedWord: string) => string;
};

export type LaunchGameExecuteResult =
  | ResolvedLaunchGameRequest
  | {
      ok: true;
      requestedName: string;
      canonicalName: string;
      type: "tool" | "reward";
      availableGames: string[];
      word?: string;
      launched?: boolean;
    }
  | {
      ok: false;
      error: string;
      launched: false;
      requestedName?: string;
      type?: "tool" | "reward";
      availableGames?: string[];
    };

const defaultDescription =
  "Launch any game by name. Use live game ids from the manifest. Spelling sessions: for **word-builder** or **spell-check**, pass `word` (homework list). Other sessions: same tool without `word`.";

const spellingDescription =
  "Launch a teaching tool or reward game by id from the manifest. " +
  "For `word-builder` or `spell-check`, pass `word` (homework list, normalized). " +
  "Other games use the same ids as the non-spelling session.";

const inputSchema = z.object({
  name: z
    .string()
    .describe(
      "Exact game id from the Canvas Capabilities manifest (Teaching Tools or Reward Games), e.g. word-builder, spell-check, bd-reversal.",
    ),
  type: z
    .enum(["tool", "reward"])
    .describe("Whether this is a teaching tool or a reward game."),
  word: z
    .string()
    .optional()
    .describe(
      "Required when name is word-builder (min 3 letters) or spell-check (min 2 letters) in spelling sessions.",
    ),
});

export async function executeLaunchGame(
  args: { name: string; type: "tool" | "reward"; word?: string },
  spelling?: LaunchGameSpellingOptions,
): Promise<LaunchGameExecuteResult> {
  if (!spelling) {
    return resolveLaunchGameRequest({
      name: args.name,
      type: args.type,
    });
  }

  const resolved = resolveLaunchGameRequest({
    name: args.name,
    type: args.type,
  });
  if (!resolved.ok || !resolved.canonicalName) {
    return resolved;
  }
  const cn = resolved.canonicalName;

  if (cn === "word-builder") {
    const word = String(args.word ?? "")
      .toLowerCase()
      .trim();
    if (word.length < 3) {
      return {
        ok: false,
        error: WB_WORD_TOO_SHORT,
        launched: false,
      };
    }
    if (
      spelling.isHomeworkSpellingWordAllowed &&
      !spelling.isHomeworkSpellingWordAllowed(word)
    ) {
      return {
        ok: false,
        error:
          spelling.getHomeworkSpellingRejectMessage?.(word) ??
          `Word "${word}" is not on today's extracted spelling homework list.`,
        launched: false,
      };
    }
    if (spelling.isWordBuilderSessionActive()) {
      return { ok: false, error: WB_ALREADY_ACTIVE, launched: false };
    }
    if (!spelling.tryClaimWordBuilderToolSlot()) {
      return { ok: false, error: WB_ALREADY_ACTIVE, launched: false };
    }
    return {
      ...resolved,
      word,
      launched: true,
    };
  }

  if (cn === "spell-check") {
    const word = String(args.word ?? "")
      .toLowerCase()
      .trim();
    if (word.length < 2) {
      return {
        ok: false,
        error: SC_WORD_TOO_SHORT,
        launched: false,
      };
    }
    if (
      spelling.isHomeworkSpellingWordAllowed &&
      !spelling.isHomeworkSpellingWordAllowed(word)
    ) {
      return {
        ok: false,
        error:
          spelling.getHomeworkSpellingRejectMessage?.(word) ??
          `Word "${word}" is not on today's extracted spelling homework list.`,
        launched: false,
      };
    }
    if (spelling.isSpellCheckSessionActive()) {
      return { ok: false, error: SC_ALREADY_ACTIVE, launched: false };
    }
    if (!spelling.tryClaimSpellCheckToolSlot()) {
      return { ok: false, error: SC_ALREADY_ACTIVE, launched: false };
    }
    return {
      ...resolved,
      word,
      launched: true,
    };
  }

  return resolved;
}

/** Default tool: resolve only. Spelling sessions pass options for word-builder / spell-check validation. */
export function buildLaunchGameTool(spelling?: LaunchGameSpellingOptions) {
  const isSpelling = Boolean(spelling);
  return tool({
    description: isSpelling ? spellingDescription : defaultDescription,
    inputSchema,
    execute: async (args: {
      name: string;
      type: "tool" | "reward";
      word?: string;
    }) => executeLaunchGame(args, spelling),
  });
}

export const launchGame = buildLaunchGameTool();
