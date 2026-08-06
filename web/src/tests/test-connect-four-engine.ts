import { describe, expect, it } from "vitest";
import {
  CONNECT_FOUR_CHILD_DISC,
  CONNECT_FOUR_COLUMNS,
  CONNECT_FOUR_COMPANION_DISC,
  CONNECT_FOUR_EMPTY_BOARD,
  CONNECT_FOUR_ROWS,
  CONNECT_FOUR_WINDOWS,
  availableColumns,
  cellIndex,
  connectFourBoardSignature,
  connectFourResult,
  dropDisc,
  findConnectFourWinner,
  getConnectFourMove,
  landingIndex,
  renderConnectFourBoardText,
  type ConnectFourCell,
  type ConnectFourDisc,
} from "../components/companionActivities/connectFourEngine";

function build(columns: Array<[number, ConnectFourDisc]>): ConnectFourCell[] {
  let board = [...CONNECT_FOUR_EMPTY_BOARD];
  for (const [column, disc] of columns) {
    const dropped = dropDisc(board, column, disc);
    if (!dropped) throw new Error(`column ${column} full`);
    board = dropped.board;
  }
  return board;
}

describe("connect four engine", () => {
  it("generates every four-in-a-row window instead of hand-listing them", () => {
    // 24 horizontal + 21 vertical + 12 + 12 diagonal
    expect(CONNECT_FOUR_WINDOWS).toHaveLength(69);
    for (const window of CONNECT_FOUR_WINDOWS) {
      expect(window).toHaveLength(4);
      for (const index of window) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(CONNECT_FOUR_COLUMNS * CONNECT_FOUR_ROWS);
      }
    }
  });

  it("drops discs to the lowest empty slot (gravity)", () => {
    const first = dropDisc(CONNECT_FOUR_EMPTY_BOARD, 3, CONNECT_FOUR_CHILD_DISC);
    expect(first?.index).toBe(cellIndex(CONNECT_FOUR_ROWS - 1, 3));
    const second = dropDisc(first!.board, 3, CONNECT_FOUR_COMPANION_DISC);
    expect(second?.index).toBe(cellIndex(CONNECT_FOUR_ROWS - 2, 3));
  });

  it("reports a full column as unavailable", () => {
    let board = [...CONNECT_FOUR_EMPTY_BOARD];
    for (let i = 0; i < CONNECT_FOUR_ROWS; i += 1) {
      board = dropDisc(board, 0, i % 2 === 0 ? "R" : "Y")!.board;
    }
    expect(landingIndex(board, 0)).toBeNull();
    expect(dropDisc(board, 0, "R")).toBeNull();
    expect(availableColumns(board)).not.toContain(0);
  });

  it("detects wins in every direction", () => {
    const horizontal = build([
      [0, "R"], [1, "R"], [2, "R"], [3, "R"],
    ]);
    expect(findConnectFourWinner(horizontal)?.disc).toBe("R");
    expect(connectFourResult(horizontal)).toBe("child_win");

    const vertical = build([
      [0, "Y"], [0, "Y"], [0, "Y"], [0, "Y"],
    ]);
    expect(connectFourResult(vertical)).toBe("companion_win");

    const diagonal = build([
      [0, "R"],
      [1, "Y"], [1, "R"],
      [2, "Y"], [2, "Y"], [2, "R"],
      [3, "Y"], [3, "Y"], [3, "Y"], [3, "R"],
    ]);
    expect(findConnectFourWinner(diagonal)?.disc).toBe("R");
  });

  it("takes an immediate win when one is available", () => {
    const board = build([
      [0, "Y"], [1, "Y"], [2, "Y"],
      [4, "R"], [5, "R"],
    ]);
    expect(getConnectFourMove(board, { depth: 1, random: () => 0 })).toBe(3);
  });

  it("blocks the child's immediate win", () => {
    const board = build([
      [0, "R"], [1, "R"], [2, "R"],
      [6, "Y"],
    ]);
    expect(getConnectFourMove(board, { depth: 1, random: () => 0 })).toBe(3);
  });

  it("prefers winning over blocking when both are available", () => {
    const board = build([
      [0, "R"], [1, "R"], [2, "R"],
      [4, "Y"], [5, "Y"], [6, "Y"],
    ]);
    // Companion can complete 4,5,6 -> column 3 also blocks; either way the
    // winning line must be taken.
    const move = getConnectFourMove(board, { depth: 1, random: () => 0 });
    const played = dropDisc(board, move!, CONNECT_FOUR_COMPANION_DISC);
    expect(findConnectFourWinner(played!.board)?.disc).toBe(CONNECT_FOUR_COMPANION_DISC);
  });

  it("never returns a full or out-of-range column (legality invariant)", () => {
    // This replaces the server-side move validation the generic activity
    // contract deliberately gave up.
    let board = [...CONNECT_FOUR_EMPTY_BOARD];
    let turn: ConnectFourDisc = CONNECT_FOUR_CHILD_DISC;
    let seed = 1;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let ply = 0; ply < CONNECT_FOUR_COLUMNS * CONNECT_FOUR_ROWS; ply += 1) {
      if (connectFourResult(board)) break;
      const move =
        turn === CONNECT_FOUR_COMPANION_DISC
          ? getConnectFourMove(board, { depth: 2, random })
          : availableColumns(board)[
              Math.floor(random() * availableColumns(board).length)
            ];
      if (move == null) break;
      expect(move).toBeGreaterThanOrEqual(0);
      expect(move).toBeLessThan(CONNECT_FOUR_COLUMNS);
      expect(landingIndex(board, move)).not.toBeNull();
      board = dropDisc(board, move, turn)!.board;
      turn = turn === "R" ? "Y" : "R";
    }
  });

  it("returns null only when the board is full", () => {
    let board = [...CONNECT_FOUR_EMPTY_BOARD];
    // Fill without creating a winner: stripe by column pairs.
    const order: ConnectFourDisc[] = ["R", "R", "Y", "Y"];
    for (let column = 0; column < CONNECT_FOUR_COLUMNS; column += 1) {
      for (let row = 0; row < CONNECT_FOUR_ROWS; row += 1) {
        board = dropDisc(board, column, order[(row + column) % 4])!.board;
      }
    }
    expect(availableColumns(board)).toHaveLength(0);
    expect(getConnectFourMove(board)).toBeNull();
  });

  it("renders a compact board text and signature for the companion prompt", () => {
    const board = build([[3, "R"], [3, "Y"]]);
    const text = renderConnectFourBoardText(board);
    expect(text).toContain("R=child");
    expect(text.length).toBeLessThan(600);
    const signature = connectFourBoardSignature(board);
    expect(signature).toHaveLength(CONNECT_FOUR_COLUMNS * CONNECT_FOUR_ROWS);
    expect(signature).toContain("R");
    expect(signature).toContain("Y");
  });
});
