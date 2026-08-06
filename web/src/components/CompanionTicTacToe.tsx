import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  COMPANION_ACTIVITY_MIN_REVEAL_MS,
  runCompanionActivityTurn,
} from "./companionActivities/activityTurnGate";
import { playCompanionActivitySfx } from "./companionActivities/companionActivitySfx";
import type {
  CompanionActivityComponentProps,
  CompanionActivityGameEvent,
  CompanionActivityMoment,
} from "./companionActivities/types";

export type CompanionTicTacToeMark = "X" | "O";
type Player = CompanionTicTacToeMark;
type Square = Player | null;
type RoundResult = "child_win" | "companion_win" | "draw";

export type CompanionTicTacToeProps = CompanionActivityComponentProps;

const CHILD_LABEL = "X";
const COMPANION_LABEL = "O";

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const EMPTY_BOARD: Square[] = Array.from({ length: 9 }, () => null);
export const COMPANION_TIC_TAC_TOE_THINK_MS = 2200;
export const COMPANION_TIC_TAC_TOE_THINK_JITTER_MS = 650;
export const COMPANION_TIC_TAC_TOE_MIN_REVEAL_MS = 1100;

function getCompanionTicTacToeThinkDelay(): number {
  return (
    COMPANION_TIC_TAC_TOE_THINK_MS +
    Math.round(Math.random() * COMPANION_TIC_TAC_TOE_THINK_JITTER_MS)
  );
}

/** Board rendering handed to Claude, e.g. "1=X, 2=empty, 3=O, …". */
function renderBoardText(board: readonly Square[]): string {
  return board.map((mark, index) => `${index + 1}=${mark ?? "empty"}`).join(", ");
}

/** Past-tense phrase: "placed X on square 5". */
function describeMove(mark: Player, square: number): string {
  return `placed ${mark} on square ${square}`;
}

/** Present-tense phrase for the gate: "place your O on square 5". */
function describePlannedMove(square: number): string {
  return `place your ${COMPANION_LABEL} on square ${square}`;
}

function summarizeRound(input: {
  result: RoundResult | null;
  turn: "child" | "companion" | "none";
  lastMoveDescription?: string;
  by?: "child" | "companion";
}): string {
  if (input.result === "child_win") return "The child won the tic-tac-toe round.";
  if (input.result === "companion_win") return "The companion won the tic-tac-toe round.";
  if (input.result === "draw") return "The tic-tac-toe round ended in a draw.";
  if (input.lastMoveDescription && input.by) {
    return `The ${input.by} ${input.lastMoveDescription}. It is now the ${input.turn}'s turn.`;
  }
  return `A tic-tac-toe round is in progress. It is the ${input.turn}'s turn.`;
}

/**
 * Did placing `mark` at `index` block an opponent line that already had two?
 */
function moveBlockedOpponent(
  before: readonly Square[],
  index: number,
  blockedMark: Player,
): boolean {
  return WIN_LINES.some(
    (line) =>
      line.some((lineIndex) => lineIndex === index) &&
      before[index] == null &&
      line.filter((lineIndex) => before[lineIndex] === blockedMark).length === 2,
  );
}

/** Did placing `mark` at `index` create an open two-in-a-row threat? */
function moveCreatedThreat(after: readonly Square[], index: number, mark: Player): boolean {
  return WIN_LINES.some(
    (line) =>
      line.some((lineIndex) => lineIndex === index) &&
      line.filter((lineIndex) => after[lineIndex] === mark).length === 2 &&
      line.some((lineIndex) => after[lineIndex] == null),
  );
}

/**
 * Emotional tone for the companion's reaction. Tone only — the companion does
 * not coach strategy during play.
 */
function getTicTacToeMoment(input: {
  type: CompanionActivityGameEvent["type"];
  before?: readonly Square[];
  after?: readonly Square[];
  index?: number;
  mark?: Player;
  result?: RoundResult;
}): CompanionActivityMoment | undefined {
  if (
    input.type === "companion_activity_started" ||
    input.type === "companion_activity_reset"
  ) {
    return {
      momentType: "game_started",
      salience: "medium",
      desiredTone: "warm_playful",
      suggestedGesture: "wave",
    };
  }
  if (input.type === "companion_activity_round_complete") {
    return {
      momentType: "round_complete",
      salience: "high",
      desiredTone:
        input.result === "child_win"
          ? "celebrate_child"
          : input.result === "companion_win"
            ? "playful_confidence"
            : "friendly_draw",
      suggestedGesture:
        input.result === "child_win"
          ? "wave"
          : input.result === "companion_win"
            ? "silly_laugh"
            : "shrug",
    };
  }
  if (input.before == null || input.after == null || input.index == null || !input.mark) {
    return undefined;
  }
  if (
    input.type === "companion_activity_companion_move" &&
    moveBlockedOpponent(input.before, input.index, "X")
  ) {
    return {
      momentType: "companion_blocked_child",
      salience: "medium",
      desiredTone: "playful_strategic",
      suggestedGesture: "think",
    };
  }
  if (
    input.type === "companion_activity_child_move" &&
    moveBlockedOpponent(input.before, input.index, "O")
  ) {
    return {
      momentType: "child_blocked_companion",
      salience: "medium",
      desiredTone: "impressed_playful",
      suggestedGesture: "surprise_jump",
    };
  }
  if (
    input.type === "companion_activity_child_move" &&
    moveCreatedThreat(input.after, input.index, input.mark)
  ) {
    return {
      momentType: "child_created_threat",
      salience: "low",
      desiredTone: "curious",
      suggestedGesture: "think",
    };
  }
  return undefined;
}

function findWinner(board: readonly Square[]): Player | null {
  for (const [a, b, c] of WIN_LINES) {
    const mark = board[a];
    if (mark && mark === board[b] && mark === board[c]) return mark;
  }
  return null;
}

function findWinningMove(board: readonly Square[], player: Player): number | null {
  for (const [a, b, c] of WIN_LINES) {
    const line = [a, b, c];
    const marks = line.map((index) => board[index]);
    if (marks.filter((mark) => mark === player).length !== 2) continue;
    const emptyIndex = line.find((index) => board[index] == null);
    if (emptyIndex != null) return emptyIndex;
  }
  return null;
}

function getCompanionMove(board: readonly Square[]): number | null {
  const winningMove = findWinningMove(board, "O");
  if (winningMove != null) return winningMove;
  const blockingMove = findWinningMove(board, "X");
  if (blockingMove != null) return blockingMove;
  if (board[4] == null) return 4;
  for (const index of [0, 2, 6, 8, 1, 3, 5, 7]) {
    if (board[index] == null) return index;
  }
  return null;
}

function resultFromBoard(board: readonly Square[]): RoundResult | null {
  const winner = findWinner(board);
  if (winner === "X") return "child_win";
  if (winner === "O") return "companion_win";
  return board.every(Boolean) ? "draw" : null;
}

function boardSignature(board: readonly Square[]): string {
  return board.map((mark) => mark ?? "-").join("");
}

function statusCopy(result: RoundResult | null, companionName: string, thinking: boolean) {
  if (result === "child_win") return "You won. Nice move.";
  if (result === "companion_win") return `${companionName} got three in a row.`;
  if (result === "draw") return "Draw game. That was close.";
  if (thinking) return `${companionName} is choosing a square.`;
  return "Your move. Click a square.";
}

export function CompanionTicTacToe({
  companionName,
  onClose,
  onBanter,
  onCompanionTurn,
  onRoundComplete,
  onGameEvent,
  resolveCompanionTurn,
}: CompanionTicTacToeProps) {
  const [board, setBoard] = useState<Square[]>(EMPTY_BOARD);
  const [companionThinking, setCompanionThinking] = useState(false);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const didEmitStartedRef = useRef(false);
  const emittedRoundCompleteRef = useRef<string | null>(null);
  const decisionStartedAtRef = useRef<number | null>(null);
  const plannedDecisionDelayMsRef = useRef<number | null>(null);
  const roundTokenRef = useRef(0);
  const result = useMemo(() => resultFromBoard(board), [board]);

  /** Builds the full generic envelope so the companion layer stays game-agnostic. */
  const emitGameEvent = useCallback(
    (input: {
      type: CompanionActivityGameEvent["type"];
      board: readonly Square[];
      turn: "child" | "companion" | "none";
      moveDescription?: string;
      moveBy?: "child" | "companion";
      moment?: CompanionActivityMoment;
      result?: RoundResult;
      decisionStartedAt?: number;
      plannedDecisionDelayMs?: number;
      decisionLatencyMs?: number;
    }) => {
      onGameEvent?.({
        type: input.type,
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName,
        timestamp: Date.now(),
        boardView: {
          text: renderBoardText(input.board),
          signature: boardSignature(input.board),
        },
        labels: { child: CHILD_LABEL, companion: COMPANION_LABEL },
        status: input.result ? "completed" : "active",
        turn: input.turn,
        summary: summarizeRound({
          result: input.result ?? null,
          turn: input.turn,
          lastMoveDescription: input.moveDescription,
          by: input.moveBy,
        }),
        ...(input.moveDescription && { moveDescription: input.moveDescription }),
        ...(input.moveBy && { moveBy: input.moveBy }),
        ...(input.moment && { moment: input.moment }),
        ...(input.result && { result: input.result }),
        ...(input.decisionStartedAt !== undefined && {
          decisionStartedAt: input.decisionStartedAt,
        }),
        ...(input.plannedDecisionDelayMs !== undefined && {
          plannedDecisionDelayMs: input.plannedDecisionDelayMs,
        }),
        ...(input.decisionLatencyMs !== undefined && {
          decisionLatencyMs: input.decisionLatencyMs,
        }),
      });
    },
    [companionName, onGameEvent],
  );

  useEffect(() => {
    if (didEmitStartedRef.current) return;
    didEmitStartedRef.current = true;
    playCompanionActivitySfx("companion_move");
    emitGameEvent({
      type: "companion_activity_started",
      board: EMPTY_BOARD,
      turn: "child",
      moment: getTicTacToeMoment({ type: "companion_activity_started" }),
    });
  }, [emitGameEvent]);

  useEffect(() => {
    if (!result) return;
    const completionKey = `${result}:${boardSignature(board)}`;
    if (emittedRoundCompleteRef.current === completionKey) return;
    emittedRoundCompleteRef.current = completionKey;
    playCompanionActivitySfx("round_complete");
    console.log(` 🎮 [companion-tic-tac-toe] [round_complete] [${result}]`);
    emitGameEvent({
      type: "companion_activity_round_complete",
      board,
      turn: "none",
      result,
      moment: getTicTacToeMoment({ type: "companion_activity_round_complete", result }),
    });
    onBanter?.({
      phase: "round_complete",
      activityId: "tic_tac_toe",
      result,
    });
    onRoundComplete?.(result);
  }, [board, emitGameEvent, onBanter, onRoundComplete, result]);

  const applyCompanionMove = useCallback(
    (boardBefore: readonly Square[], move: number) => {
      const decisionStartedAt = decisionStartedAtRef.current ?? Date.now();
      const plannedDecisionDelayMs = plannedDecisionDelayMsRef.current ?? 0;
      const next = [...boardBefore];
      next[move] = "O";
      const movedAt = Date.now();
      const decisionLatencyMs = Math.max(0, movedAt - decisionStartedAt);
      playCompanionActivitySfx("companion_move");
      console.log(
        ` 🎮 [companion-tic-tac-toe] [companion_move] [square_${move + 1}] planned_ms=${plannedDecisionDelayMs} actual_ms=${decisionLatencyMs}`,
      );
      setLastMove(move);
      setBoard(next);
      emitGameEvent({
        type: "companion_activity_companion_move",
        board: next,
        turn: resultFromBoard(next) ? "none" : "child",
        moveDescription: describeMove("O", move + 1),
        moveBy: "companion",
        moment: getTicTacToeMoment({
          type: "companion_activity_companion_move",
          before: boardBefore,
          after: next,
          index: move,
          mark: "O",
        }),
        decisionStartedAt,
        plannedDecisionDelayMs,
        decisionLatencyMs,
      });
      onBanter?.({
        phase: "companion_move",
        activityId: "tic_tac_toe",
      });
      onCompanionTurn?.();
      setCompanionThinking(false);
      decisionStartedAtRef.current = null;
      plannedDecisionDelayMsRef.current = null;
    },
    [emitGameEvent, onBanter, onCompanionTurn],
  );

  useEffect(() => {
    // Gated turns are revealed from playSquare via resolveCompanionTurn.
    if (!companionThinking || result || resolveCompanionTurn) return;
    const plannedDecisionDelayMs =
      plannedDecisionDelayMsRef.current ?? getCompanionTicTacToeThinkDelay();
    const timer = window.setTimeout(() => {
      const move = getCompanionMove(board);
      if (move == null || resultFromBoard(board)) {
        setCompanionThinking(false);
        decisionStartedAtRef.current = null;
        plannedDecisionDelayMsRef.current = null;
        return;
      }
      applyCompanionMove(board, move);
    }, plannedDecisionDelayMs);
    return () => window.clearTimeout(timer);
  }, [applyCompanionMove, board, companionThinking, resolveCompanionTurn, result]);

  useEffect(() => {
    return () => {
      roundTokenRef.current += 1;
    };
  }, []);

  const resetRound = () => {
    emittedRoundCompleteRef.current = null;
    roundTokenRef.current += 1;
    setBoard(EMPTY_BOARD);
    setCompanionThinking(false);
    setLastMove(null);
    decisionStartedAtRef.current = null;
    plannedDecisionDelayMsRef.current = null;
    console.log(" 🎮 [companion-tic-tac-toe] [reset] [ok]");
    emitGameEvent({
      type: "companion_activity_reset",
      board: EMPTY_BOARD,
      turn: "child",
      moment: getTicTacToeMoment({ type: "companion_activity_reset" }),
    });
  };

  const playSquare = (index: number) => {
    if (board[index] || result || companionThinking) return;
    const before = [...board];
    const next = [...board];
    next[index] = "X";
    playCompanionActivitySfx("child_move");
    console.log(` 🎮 [companion-tic-tac-toe] [child_move] [square_${index + 1}]`);
    setLastMove(index);
    setBoard(next);
    const childMoveEndsRound = Boolean(resultFromBoard(next));
    emitGameEvent({
      type: "companion_activity_child_move",
      board: next,
      turn: childMoveEndsRound ? "none" : "companion",
      moveDescription: describeMove("X", index + 1),
      moveBy: "child",
      moment: getTicTacToeMoment({
        type: "companion_activity_child_move",
        before,
        after: next,
        index,
        mark: "X",
      }),
    });
    onBanter?.({
      phase: "child_move",
      activityId: "tic_tac_toe",
    });
    if (!childMoveEndsRound) {
      decisionStartedAtRef.current = Date.now();
      if (resolveCompanionTurn) {
        const plannedMove = getCompanionMove(next);
        if (plannedMove == null) return;
        plannedDecisionDelayMsRef.current = COMPANION_ACTIVITY_MIN_REVEAL_MS;
        onBanter?.({
          phase: "companion_thinking",
          activityId: "tic_tac_toe",
        });
        // Keeps the board locked while the packet is in flight.
        setCompanionThinking(true);
        const token = roundTokenRef.current;
        void runCompanionActivityTurn({
          plan: { move: plannedMove },
          gate: () =>
            resolveCompanionTurn({
              boardView: {
                text: renderBoardText(next),
                signature: boardSignature(next),
              },
              plannedMove: describePlannedMove(plannedMove + 1),
            }),
          isStale: () => roundTokenRef.current !== token,
          onReveal: (plan) => applyCompanionMove(next, plan.move),
          onError: (err) => {
            console.warn(" 🎮 [companion-tic-tac-toe] [turn_gate] [error]", err);
          },
        });
        return;
      }
      plannedDecisionDelayMsRef.current = getCompanionTicTacToeThinkDelay();
      onBanter?.({
        phase: "companion_thinking",
        activityId: "tic_tac_toe",
      });
      setCompanionThinking(true);
    }
  };

  const panelStyle: CSSProperties = {
    width: "100%",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(7, 10, 22, 0.78)",
    boxShadow: "0 28px 90px rgba(0,0,0,0.42)",
    backdropFilter: "blur(18px)",
    padding: 12,
    display: "grid",
    gap: 9,
  };

  return (
    <section aria-label={`Tic-tac-toe with ${companionName}`} style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(248,250,252,0.62)" }}>
            PLAY MODE
          </div>
          <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.05 }}>Tic-tac-toe</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            background: "rgba(255,255,255,0.12)",
            color: "#f8fafc",
            fontWeight: 900,
            padding: "9px 11px",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
      <div
        aria-live="polite"
          style={{ minHeight: 20, color: "rgba(248,250,252,0.78)", fontSize: 13, fontWeight: 800 }}
      >
        {statusCopy(result, companionName, companionThinking)}
      </div>
      <div
        role="grid"
        aria-label="Tic-tac-toe board"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        {board.map((mark, index) => (
          <motion.button
            key={index}
            type="button"
            role="gridcell"
            aria-label={`Square ${index + 1}${mark ? ` ${mark}` : ""}`}
            onClick={() => playSquare(index)}
            disabled={Boolean(mark) || Boolean(result) || companionThinking}
            whileTap={{ scale: 0.96 }}
            animate={{ scale: lastMove === index ? [1, 1.08, 1] : 1 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              aspectRatio: "1",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background:
                mark === "X"
                  ? "linear-gradient(135deg, #7c5cff, #4f46e5)"
                  : mark === "O"
                    ? "linear-gradient(135deg, #f9c74f, #f59e0b)"
                    : "rgba(255,255,255,0.1)",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 950,
              display: "grid",
              placeItems: "center",
              cursor: mark || result || companionThinking ? "default" : "pointer",
              opacity: mark || result || companionThinking ? 0.88 : 1,
            }}
          >
            {mark ?? ""}
          </motion.button>
        ))}
      </div>
      <button
        type="button"
        onClick={resetRound}
        style={{
          border: 0,
          borderRadius: 8,
          background: "rgba(255,255,255,0.92)",
          color: "#27214a",
          minHeight: 42,
          fontSize: 15,
          fontWeight: 950,
          cursor: "pointer",
        }}
      >
        New round
      </button>
    </section>
  );
}
