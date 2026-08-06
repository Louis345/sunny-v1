/**
 * Shared contract for companion activities (two-player games played with the
 * companion inside the video call).
 *
 * Design rule: the server never computes on a board — it only renders it into
 * the prompt for Claude, and it could never validate chess legality anyway.
 * So each game authors its own board rendering and move phrasing; the server
 * validates shape and safety, not game semantics.
 */

export type CompanionActivityId = "tic_tac_toe" | "connect_four";
export type CompanionActivitySurface = "video_call_overlay";
export type CompanionActivityStatus = "active" | "completed";
export type CompanionActivityTurn = "child" | "companion" | "none";
export type CompanionActivityResult = "child_win" | "companion_win" | "draw";

export type CompanionActivityReactionEventType =
  | "game_started"
  | "child_move"
  | "companion_move"
  | "round_complete";

export type CompanionActivityMomentType =
  | "game_started"
  | "companion_blocked_child"
  | "child_blocked_companion"
  | "child_created_threat"
  | "round_complete";

export type CompanionActivityMomentSalience = "low" | "medium" | "high";

/**
 * A game-authored rendering of the board.
 * `text` goes straight into the Claude prompt (tic-tac-toe: "1=X, 2=empty, …";
 * Connect Four: a column/row grid; chess: FEN). `signature` is a compact stable
 * string used only for staleness comparison.
 */
export type CompanionActivityBoardView = {
  text: string;
  signature: string;
};

/**
 * Move phrasing is a full verb phrase authored by the game, never a bare label.
 * That is what lets the server render prompt lines generically:
 *   `Last move: ${by} ${description}.`        → "…companion placed O on square 5."
 *   `You are about to ${plannedMove}; …`      → "…place your O on square 5; …"
 * Connect Four: "dropped a red disc into column 4" / "drop your yellow disc into column 4".
 * Chess: "played knight to f3" / "play knight to f3".
 */
export type CompanionActivityMove = {
  by: "child" | "companion";
  description: string;
  timestamp?: number;
};

export const MAX_ACTIVITY_BOARD_TEXT_LENGTH = 600;
export const MAX_ACTIVITY_BOARD_SIGNATURE_LENGTH = 128;
export const MAX_ACTIVITY_LABEL_LENGTH = 32;
export const MAX_ACTIVITY_MOVE_DESCRIPTION_LENGTH = 120;
