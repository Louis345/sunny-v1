import type { CompanionActivityId } from "./types";

/**
 * The "add a game" surface. Adding an activity should mean: one entry here,
 * one client component in the client registry, and nothing else.
 */
export type CompanionActivityDescriptor = {
  id: CompanionActivityId;
  /** Child-facing name used in prompts, e.g. "tic-tac-toe". */
  displayName: string;
  /** What a single move targets, e.g. "square" / "column" / "move". */
  moveNoun: string;
  /** Rules Claude needs to react coherently. Omit for universally known games. */
  promptHints: string[];
  /** Names a child might say to ask for this game. */
  aliases: string[];
  /** Game-specific nouns that signal the child is talking about this game. */
  vocabulary: string[];
  /**
   * Width the activity tray should aim for. Wide boards (Connect Four's 7
   * columns, chess's 8 files) are unreadable at the 3x3 default.
   */
  trayWidthPx?: number;
};

export const COMPANION_ACTIVITY_DESCRIPTORS: Record<
  CompanionActivityId,
  CompanionActivityDescriptor
> = {
  tic_tac_toe: {
    id: "tic_tac_toe",
    displayName: "tic-tac-toe",
    moveNoun: "square",
    promptHints: [],
    aliases: ["tic tac toe", "tic-tac-toe", "tictactoe", "noughts and crosses"],
    vocabulary: ["square", "three in a row", "corner", "center", "centre"],
  },
  connect_four: {
    id: "connect_four",
    displayName: "Connect Four",
    moveNoun: "column",
    promptHints: [
      "Connect Four rules: players drop discs into one of seven columns and each disc falls to the lowest empty slot; the first to line up four in a row horizontally, vertically, or diagonally wins.",
    ],
    aliases: ["connect four", "connect 4", "connect-four", "four in a row"],
    vocabulary: ["column", "disc", "drop", "four in a row", "stack"],
    trayWidthPx: 420,
  },
};

/** Derived from the descriptor keys — never hand-maintain a second list. */
export const COMPANION_ACTIVITY_IDS = Object.keys(
  COMPANION_ACTIVITY_DESCRIPTORS,
) as CompanionActivityId[];

export function isCompanionActivityId(value: unknown): value is CompanionActivityId {
  return typeof value === "string" && value in COMPANION_ACTIVITY_DESCRIPTORS;
}

export function getCompanionActivityDescriptor(
  id: CompanionActivityId,
): CompanionActivityDescriptor {
  return COMPANION_ACTIVITY_DESCRIPTORS[id];
}

/**
 * Vocabulary that means "the child is talking about the open game" regardless
 * of which game it is. Combined with each descriptor's own vocabulary.
 */
export const COMPANION_ACTIVITY_SHARED_VOCABULARY = [
  "move",
  "turn",
  "board",
  "win",
  "block",
] as const;

export function getCompanionActivityIntentWords(): string[] {
  const words = new Set<string>(COMPANION_ACTIVITY_SHARED_VOCABULARY);
  for (const descriptor of Object.values(COMPANION_ACTIVITY_DESCRIPTORS)) {
    for (const word of descriptor.vocabulary) words.add(word);
  }
  return [...words];
}

export function getCompanionActivityAliases(): string[] {
  return Object.values(COMPANION_ACTIVITY_DESCRIPTORS).flatMap(
    (descriptor) => descriptor.aliases,
  );
}

/** Human-readable list for prompt lines, e.g. "tic-tac-toe or Connect Four". */
export function describeCompanionActivityChoices(): string {
  const names = Object.values(COMPANION_ACTIVITY_DESCRIPTORS).map(
    (descriptor) => descriptor.displayName,
  );
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
