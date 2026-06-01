import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";

export type CompanionTicTacToeMark = "X" | "O";
type Player = CompanionTicTacToeMark;
type Square = Player | null;
type RoundResult = "child_win" | "companion_win" | "draw";
type TicTacToeSfx = "child_move" | "companion_move" | "round_complete";
export type CompanionTicTacToeTurn = {
  square: number;
  line?: string;
};
export type CompanionTicTacToeBanter = {
  phase:
    | "child_move"
    | "companion_thinking"
    | "companion_move"
    | "round_complete";
  line?: string;
  square?: number;
  result?: RoundResult;
};
export type CompanionTicTacToeGameEvent = {
  type:
    | "companion_tic_tac_toe_started"
    | "companion_tic_tac_toe_child_move"
    | "companion_tic_tac_toe_companion_move"
    | "companion_tic_tac_toe_round_complete"
    | "companion_tic_tac_toe_reset";
  activityId: "tic_tac_toe";
  surface: "video_call_overlay";
  companionName: string;
  timestamp: number;
  board: Array<CompanionTicTacToeMark | null>;
  square?: number;
  mark?: CompanionTicTacToeMark;
  result?: RoundResult;
  decisionStartedAt?: number;
  plannedDecisionDelayMs?: number;
  decisionLatencyMs?: number;
};

export type CompanionTicTacToeProps = {
  companionId?: string;
  companionName: string;
  onClose: () => void;
  onBanter?: (banter: CompanionTicTacToeBanter) => void;
  onCompanionTurn?: (turn: CompanionTicTacToeTurn) => void;
  onRoundComplete?: (result: RoundResult) => void;
  onGameEvent?: (event: CompanionTicTacToeGameEvent) => void;
};

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

function getCompanionTicTacToeThinkDelay(): number {
  return (
    COMPANION_TIC_TAC_TOE_THINK_MS +
    Math.round(Math.random() * COMPANION_TIC_TAC_TOE_THINK_JITTER_MS)
  );
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function playTicTacToeSfx(kind: TicTacToeSfx): void {
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const context = new AudioContextCtor();
    const now = context.currentTime;
    const gain = context.createGain();
    const frequencies: Record<TicTacToeSfx, number> = {
      child_move: 520,
      companion_move: 740,
      round_complete: 880,
    };
    const oscillator = context.createOscillator();
    oscillator.type = kind === "round_complete" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequencies[kind], now);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequencies[kind] * (kind === "companion_move" ? 1.18 : 1.06),
      now + 0.11,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "round_complete" ? 0.075 : 0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "round_complete" ? 0.28 : 0.16));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + (kind === "round_complete" ? 0.3 : 0.18));
    oscillator.onended = () => {
      void context.close().catch((err: unknown) => {
        console.warn(" 🎮 [companion-tic-tac-toe] [sfx_close] [error]", err);
      });
    };
  } catch (err: unknown) {
    console.warn(" 🎮 [companion-tic-tac-toe] [sfx] [error]", err);
  }
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
}: CompanionTicTacToeProps) {
  const [board, setBoard] = useState<Square[]>(EMPTY_BOARD);
  const [companionThinking, setCompanionThinking] = useState(false);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const didEmitStartedRef = useRef(false);
  const emittedRoundCompleteRef = useRef<string | null>(null);
  const decisionStartedAtRef = useRef<number | null>(null);
  const plannedDecisionDelayMsRef = useRef<number | null>(null);
  const result = useMemo(() => resultFromBoard(board), [board]);
  const emitGameEvent = useCallback(
    (
      event: Omit<
        CompanionTicTacToeGameEvent,
        "activityId" | "surface" | "companionName" | "timestamp" | "board"
      > & { board?: Array<CompanionTicTacToeMark | null> },
    ) => {
      onGameEvent?.({
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName,
        timestamp: Date.now(),
        board: event.board ?? board,
        ...event,
      });
    },
    [board, companionName, onGameEvent],
  );

  useEffect(() => {
    if (didEmitStartedRef.current) return;
    didEmitStartedRef.current = true;
    playTicTacToeSfx("companion_move");
    onGameEvent?.({
      type: "companion_tic_tac_toe_started",
      activityId: "tic_tac_toe",
      surface: "video_call_overlay",
      companionName,
      timestamp: Date.now(),
      board: EMPTY_BOARD,
    });
  }, [companionName, onGameEvent]);

  useEffect(() => {
    if (!result) return;
    const completionKey = `${result}:${boardSignature(board)}`;
    if (emittedRoundCompleteRef.current === completionKey) return;
    emittedRoundCompleteRef.current = completionKey;
    playTicTacToeSfx("round_complete");
    console.log(` 🎮 [companion-tic-tac-toe] [round_complete] [${result}]`);
    emitGameEvent({
      type: "companion_tic_tac_toe_round_complete",
      result,
      board,
    });
    onBanter?.({
      phase: "round_complete",
      result,
    });
    onRoundComplete?.(result);
  }, [board, emitGameEvent, onBanter, onRoundComplete, result]);

  useEffect(() => {
    if (!companionThinking || result) return;
    const decisionStartedAt = decisionStartedAtRef.current ?? Date.now();
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
      const next = [...board];
      next[move] = "O";
      const movedAt = Date.now();
      const decisionLatencyMs = Math.max(0, movedAt - decisionStartedAt);
      playTicTacToeSfx("companion_move");
      console.log(
        ` 🎮 [companion-tic-tac-toe] [companion_move] [square_${move + 1}] planned_ms=${plannedDecisionDelayMs} actual_ms=${decisionLatencyMs}`,
      );
      setLastMove(move);
      setBoard(next);
      emitGameEvent({
        type: "companion_tic_tac_toe_companion_move",
        square: move + 1,
        mark: "O",
        board: next,
        decisionStartedAt,
        plannedDecisionDelayMs,
        decisionLatencyMs,
      });
      onBanter?.({
        phase: "companion_move",
        square: move + 1,
      });
      onCompanionTurn?.({
        square: move + 1,
      });
      setCompanionThinking(false);
      decisionStartedAtRef.current = null;
      plannedDecisionDelayMsRef.current = null;
    }, plannedDecisionDelayMs);
    return () => window.clearTimeout(timer);
  }, [board, companionThinking, emitGameEvent, onBanter, onCompanionTurn, result]);

  const resetRound = () => {
    emittedRoundCompleteRef.current = null;
    setBoard(EMPTY_BOARD);
    setCompanionThinking(false);
    setLastMove(null);
    decisionStartedAtRef.current = null;
    plannedDecisionDelayMsRef.current = null;
    console.log(" 🎮 [companion-tic-tac-toe] [reset] [ok]");
    emitGameEvent({ type: "companion_tic_tac_toe_reset", board: EMPTY_BOARD });
  };

  const playSquare = (index: number) => {
    if (board[index] || result || companionThinking) return;
    const next = [...board];
    next[index] = "X";
    playTicTacToeSfx("child_move");
    console.log(` 🎮 [companion-tic-tac-toe] [child_move] [square_${index + 1}]`);
    setLastMove(index);
    setBoard(next);
    emitGameEvent({
      type: "companion_tic_tac_toe_child_move",
      square: index + 1,
      mark: "X",
      board: next,
    });
    onBanter?.({
      phase: "child_move",
      square: index + 1,
    });
    if (!resultFromBoard(next)) {
      decisionStartedAtRef.current = Date.now();
      plannedDecisionDelayMsRef.current = getCompanionTicTacToeThinkDelay();
      onBanter?.({
        phase: "companion_thinking",
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
