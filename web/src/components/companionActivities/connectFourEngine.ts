/**
 * Connect Four rules + opponent. Kept separate from the component so the
 * engine's legality invariant can be tested directly — that test is what
 * replaces the server-side move validation the generic contract gave up.
 */

export type ConnectFourDisc = "R" | "Y";
export type ConnectFourCell = ConnectFourDisc | null;

export const CONNECT_FOUR_COLUMNS = 7;
export const CONNECT_FOUR_ROWS = 6;
export const CONNECT_FOUR_CHILD_DISC: ConnectFourDisc = "R";
export const CONNECT_FOUR_COMPANION_DISC: ConnectFourDisc = "Y";

/** Beatability dial. Higher = stronger. Tuned down after watching a child play. */
export const CONNECT_FOUR_DEFAULT_DEPTH = 4;

export const CONNECT_FOUR_EMPTY_BOARD: ConnectFourCell[] = Array.from(
  { length: CONNECT_FOUR_COLUMNS * CONNECT_FOUR_ROWS },
  () => null,
);

/** Row 0 is the top row; index = row * COLUMNS + column. */
export function cellIndex(row: number, column: number): number {
  return row * CONNECT_FOUR_COLUMNS + column;
}

/** Generated once rather than hand-listed: every 4-in-a-row window. */
function buildWindows(): number[][] {
  const windows: number[][] = [];
  for (let row = 0; row < CONNECT_FOUR_ROWS; row += 1) {
    for (let column = 0; column < CONNECT_FOUR_COLUMNS; column += 1) {
      if (column + 3 < CONNECT_FOUR_COLUMNS) {
        windows.push([0, 1, 2, 3].map((i) => cellIndex(row, column + i)));
      }
      if (row + 3 < CONNECT_FOUR_ROWS) {
        windows.push([0, 1, 2, 3].map((i) => cellIndex(row + i, column)));
      }
      if (row + 3 < CONNECT_FOUR_ROWS && column + 3 < CONNECT_FOUR_COLUMNS) {
        windows.push([0, 1, 2, 3].map((i) => cellIndex(row + i, column + i)));
      }
      if (row + 3 < CONNECT_FOUR_ROWS && column - 3 >= 0) {
        windows.push([0, 1, 2, 3].map((i) => cellIndex(row + i, column - i)));
      }
    }
  }
  return windows;
}

export const CONNECT_FOUR_WINDOWS = buildWindows();

/** Lowest empty slot in a column, or null when the column is full. */
export function landingIndex(
  board: readonly ConnectFourCell[],
  column: number,
): number | null {
  if (column < 0 || column >= CONNECT_FOUR_COLUMNS) return null;
  for (let row = CONNECT_FOUR_ROWS - 1; row >= 0; row -= 1) {
    const index = cellIndex(row, column);
    if (board[index] == null) return index;
  }
  return null;
}

export function availableColumns(board: readonly ConnectFourCell[]): number[] {
  const columns: number[] = [];
  for (let column = 0; column < CONNECT_FOUR_COLUMNS; column += 1) {
    if (landingIndex(board, column) != null) columns.push(column);
  }
  return columns;
}

export function dropDisc(
  board: readonly ConnectFourCell[],
  column: number,
  disc: ConnectFourDisc,
): { board: ConnectFourCell[]; index: number } | null {
  const index = landingIndex(board, column);
  if (index == null) return null;
  const next = [...board];
  next[index] = disc;
  return { board: next, index };
}

export function findConnectFourWinner(
  board: readonly ConnectFourCell[],
): { disc: ConnectFourDisc; window: number[] } | null {
  for (const window of CONNECT_FOUR_WINDOWS) {
    const first = board[window[0]];
    if (!first) continue;
    if (window.every((index) => board[index] === first)) {
      return { disc: first, window: [...window] };
    }
  }
  return null;
}

export function isBoardFull(board: readonly ConnectFourCell[]): boolean {
  return board.every((cell) => cell != null);
}

export type ConnectFourResult = "child_win" | "companion_win" | "draw";

export function connectFourResult(
  board: readonly ConnectFourCell[],
): ConnectFourResult | null {
  const winner = findConnectFourWinner(board);
  if (winner) {
    return winner.disc === CONNECT_FOUR_CHILD_DISC ? "child_win" : "companion_win";
  }
  return isBoardFull(board) ? "draw" : null;
}

export function connectFourBoardSignature(board: readonly ConnectFourCell[]): string {
  return board.map((cell) => cell ?? "-").join("");
}

/** LLM-readable rendering: a column header plus one line per row, top-down. */
export function renderConnectFourBoardText(board: readonly ConnectFourCell[]): string {
  const header = `cols ${Array.from({ length: CONNECT_FOUR_COLUMNS }, (_, i) => i + 1).join("")}`;
  const rows = Array.from({ length: CONNECT_FOUR_ROWS }, (_, row) =>
    Array.from({ length: CONNECT_FOUR_COLUMNS }, (_, column) =>
      board[cellIndex(row, column)] ?? ".",
    ).join(""),
  );
  return `${header}; top-to-bottom ${rows.join(" / ")}; R=child, Y=companion, .=empty`;
}

const CENTER_COLUMN = Math.floor(CONNECT_FOUR_COLUMNS / 2);

function scoreWindow(
  board: readonly ConnectFourCell[],
  window: number[],
  disc: ConnectFourDisc,
): number {
  const opponent: ConnectFourDisc = disc === "R" ? "Y" : "R";
  let own = 0;
  let foe = 0;
  let empty = 0;
  for (const index of window) {
    const cell = board[index];
    if (cell === disc) own += 1;
    else if (cell === opponent) foe += 1;
    else empty += 1;
  }
  if (own > 0 && foe > 0) return 0;
  if (own === 4) return 10_000;
  if (own === 3 && empty === 1) return 50;
  if (own === 2 && empty === 2) return 10;
  if (foe === 4) return -10_000;
  if (foe === 3 && empty === 1) return -80;
  if (foe === 2 && empty === 2) return -8;
  return 0;
}

function evaluate(board: readonly ConnectFourCell[], disc: ConnectFourDisc): number {
  let score = 0;
  for (const window of CONNECT_FOUR_WINDOWS) score += scoreWindow(board, window, disc);
  for (let row = 0; row < CONNECT_FOUR_ROWS; row += 1) {
    if (board[cellIndex(row, CENTER_COLUMN)] === disc) score += 6;
  }
  return score;
}

function otherDisc(disc: ConnectFourDisc): ConnectFourDisc {
  return disc === "R" ? "Y" : "R";
}

/**
 * Standard negamax: the returned score is always from `player`'s perspective
 * (the side whose turn it is on `board`).
 */
function negamax(
  board: readonly ConnectFourCell[],
  depth: number,
  alpha: number,
  beta: number,
  player: ConnectFourDisc,
): number {
  // A winner on the board was made by the previous mover, so it is a loss for
  // whoever is to move now. Deeper remaining depth = a faster loss = worse.
  if (findConnectFourWinner(board)) return -(100_000 + depth);
  const columns = availableColumns(board);
  if (columns.length === 0) return 0;
  if (depth === 0) return evaluate(board, player);

  let best = -Infinity;
  let currentAlpha = alpha;
  for (const column of columns) {
    const dropped = dropDisc(board, column, player);
    if (!dropped) continue;
    const score = -negamax(
      dropped.board,
      depth - 1,
      -beta,
      -currentAlpha,
      otherDisc(player),
    );
    if (score > best) best = score;
    currentAlpha = Math.max(currentAlpha, best);
    if (currentAlpha >= beta) break;
  }
  return best;
}

/**
 * Picks the companion's column. Always takes an immediate win and always
 * blocks an immediate loss; otherwise searches to `depth` and breaks ties at
 * random so play does not feel robotic.
 *
 * Invariant (asserted in tests): never returns a full or out-of-range column.
 */
export type ConnectFourDifficulty = {
  /** Lookahead for positional play. */
  depth: number;
  /**
   * Chance of noticing an immediate child win and blocking it. This is the
   * real difficulty dial: perfect blocking makes the game unwinnable for a
   * beginner, because building three in a row is the only plan they have.
   */
  blockChance: number;
  /** Chance of playing a plain random legal column instead of a good one. */
  blunderChance: number;
};

/**
 * Tuned by simulation against a beginner-style opponent (see
 * test-connect-four-difficulty). Child win rates are approximate:
 *   gentle ~49% | playful ~40% | sharp ~1%
 * Blunder rate turned out to matter far more than search depth: with perfect
 * blocking a beginner effectively cannot win at any depth.
 */
export const CONNECT_FOUR_DIFFICULTIES = {
  gentle: { depth: 1, blockChance: 0.15, blunderChance: 0.75 },
  playful: { depth: 2, blockChance: 0.4, blunderChance: 0.6 },
  sharp: { depth: 3, blockChance: 0.9, blunderChance: 0.25 },
} as const satisfies Record<string, ConnectFourDifficulty>;

export type ConnectFourDifficultyName = keyof typeof CONNECT_FOUR_DIFFICULTIES;
export const CONNECT_FOUR_DEFAULT_DIFFICULTY: ConnectFourDifficultyName = "playful";

/**
 * Eases off after back-to-back losses and sharpens up when the child is on a
 * roll, so a bad run does not turn into a losing streak they give up on.
 * Streak is positive for child wins, negative for companion wins.
 */
export function selectConnectFourDifficulty(streak: number): ConnectFourDifficultyName {
  if (streak <= -2) return "gentle";
  if (streak >= 2) return "sharp";
  return CONNECT_FOUR_DEFAULT_DIFFICULTY;
}

export function getConnectFourMove(
  board: readonly ConnectFourCell[],
  options: {
    depth?: number;
    random?: () => number;
    difficulty?: ConnectFourDifficulty;
  } = {},
): number | null {
  const difficulty = options.difficulty;
  const depth = options.depth ?? difficulty?.depth ?? CONNECT_FOUR_DEFAULT_DEPTH;
  const blockChance = difficulty?.blockChance ?? 1;
  const blunderChance = difficulty?.blunderChance ?? 0;
  const random = options.random ?? Math.random;
  const columns = availableColumns(board);
  if (columns.length === 0) return null;

  // Always take a win that is on offer: playing on when you could have won
  // reads as broken rather than kind.
  for (const column of columns) {
    const dropped = dropDisc(board, column, CONNECT_FOUR_COMPANION_DISC);
    if (dropped && findConnectFourWinner(dropped.board)) return column;
  }
  if (random() < blunderChance) {
    return columns[Math.floor(random() * columns.length) % columns.length];
  }
  if (random() < blockChance) {
    for (const column of columns) {
      const dropped = dropDisc(board, column, CONNECT_FOUR_CHILD_DISC);
      if (dropped && findConnectFourWinner(dropped.board)) return column;
    }
  }

  let bestScore = -Infinity;
  let bestColumns: number[] = [];
  for (const column of columns) {
    const dropped = dropDisc(board, column, CONNECT_FOUR_COMPANION_DISC);
    if (!dropped) continue;
    // Negate: the child moves next, and negamax scores from their side.
    const score = -negamax(
      dropped.board,
      Math.max(0, depth - 1),
      -Infinity,
      Infinity,
      CONNECT_FOUR_CHILD_DISC,
    );
    if (score > bestScore) {
      bestScore = score;
      bestColumns = [column];
    } else if (score === bestScore) {
      bestColumns.push(column);
    }
  }
  if (bestColumns.length === 0) return columns[0] ?? null;
  return bestColumns[Math.floor(random() * bestColumns.length) % bestColumns.length];
}
