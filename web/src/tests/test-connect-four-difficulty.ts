import { describe, expect, it } from "vitest";
import {
  CONNECT_FOUR_CHILD_DISC,
  CONNECT_FOUR_COMPANION_DISC,
  CONNECT_FOUR_DIFFICULTIES,
  CONNECT_FOUR_EMPTY_BOARD,
  availableColumns,
  connectFourResult,
  dropDisc,
  findConnectFourWinner,
  getConnectFourMove,
  selectConnectFourDifficulty,
  type ConnectFourCell,
  type ConnectFourDifficulty,
} from "../components/companionActivities/connectFourEngine";

/** Stand-in for a beginner: usually spots her own win, often misses a block. */
function childMove(board: ConnectFourCell[], rnd: () => number): number {
  const open = availableColumns(board);
  if (rnd() < 0.75) {
    for (const c of open) {
      const d = dropDisc(board, c, CONNECT_FOUR_CHILD_DISC);
      if (d && findConnectFourWinner(d.board)) return c;
    }
  }
  if (rnd() < 0.45) {
    for (const c of open) {
      const d = dropDisc(board, c, CONNECT_FOUR_COMPANION_DISC);
      if (d && findConnectFourWinner(d.board)) return c;
    }
  }
  const weighted = open.flatMap((c) => Array(Math.max(1, 4 - Math.abs(3 - c))).fill(c));
  return weighted[Math.floor(rnd() * weighted.length)];
}

function childWinRate(difficulty: ConnectFourDifficulty, games = 300): number {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let wins = 0;
  for (let g = 0; g < games; g += 1) {
    let board = [...CONNECT_FOUR_EMPTY_BOARD];
    let turn: "child" | "companion" = "child";
    for (let ply = 0; ply < 42; ply += 1) {
      if (connectFourResult(board)) break;
      const col =
        turn === "child"
          ? childMove(board, rnd)
          : getConnectFourMove(board, { difficulty, random: rnd });
      if (col == null) break;
      const dropped = dropDisc(
        board,
        col,
        turn === "child" ? CONNECT_FOUR_CHILD_DISC : CONNECT_FOUR_COMPANION_DISC,
      );
      if (!dropped) break;
      board = dropped.board;
      turn = turn === "child" ? "companion" : "child";
    }
    if (connectFourResult(board) === "child_win") wins += 1;
  }
  return wins / games;
}

describe("connect four difficulty", () => {
  it("gives a beginner a fair fight on the default preset", () => {
    // The point of the feature: a child who plays the only plan they know
    // (build three, complete it) should win a real share of games. Measured
    // bands, not exact values, so noise cannot make this flaky.
    expect(childWinRate(CONNECT_FOUR_DIFFICULTIES.playful)).toBeGreaterThan(0.33);
    expect(childWinRate(CONNECT_FOUR_DIFFICULTIES.gentle)).toBeGreaterThan(0.5);
  }, 20_000);

  it("keeps the sharp preset genuinely challenging", () => {
    expect(childWinRate(CONNECT_FOUR_DIFFICULTIES.sharp, 100)).toBeLessThan(0.32);
  }, 20_000);

  it("gets easier as the presets soften", () => {
    const sharp = childWinRate(CONNECT_FOUR_DIFFICULTIES.sharp, 120);
    const playful = childWinRate(CONNECT_FOUR_DIFFICULTIES.playful, 250);
    const gentle = childWinRate(CONNECT_FOUR_DIFFICULTIES.gentle, 250);
    expect(playful).toBeGreaterThan(sharp);
    expect(gentle).toBeGreaterThan(playful);
  }, 20_000);

  it("eases off after back-to-back losses and sharpens on a winning run", () => {
    expect(selectConnectFourDifficulty(-2)).toBe("gentle");
    expect(selectConnectFourDifficulty(-5)).toBe("gentle");
    expect(selectConnectFourDifficulty(-1)).toBe("playful");
    expect(selectConnectFourDifficulty(0)).toBe("playful");
    expect(selectConnectFourDifficulty(1)).toBe("playful");
    expect(selectConnectFourDifficulty(2)).toBe("sharp");
  });

  it("still never returns an illegal column at any difficulty", () => {
    for (const difficulty of Object.values(CONNECT_FOUR_DIFFICULTIES)) {
      let seed = 99;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      let board = [...CONNECT_FOUR_EMPTY_BOARD];
      for (let ply = 0; ply < 42; ply += 1) {
        if (connectFourResult(board)) break;
        const col = getConnectFourMove(board, { difficulty, random: rnd });
        if (col == null) break;
        expect(availableColumns(board)).toContain(col);
        board = dropDisc(board, col, ply % 2 ? "R" : "Y")!.board;
      }
    }
  });
});
