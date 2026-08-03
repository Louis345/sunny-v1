import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  COMPANION_ACTIVITY_MIN_REVEAL_MS,
  runCompanionActivityTurn,
} from "./companionActivities/activityTurnGate";
import { playCompanionActivitySfx } from "./companionActivities/companionActivitySfx";
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
  type ConnectFourResult,
} from "./companionActivities/connectFourEngine";
import type {
  CompanionActivityComponentProps,
  CompanionActivityGameEvent,
  CompanionActivityMoment,
} from "./companionActivities/types";

export type CompanionConnectFourProps = CompanionActivityComponentProps;

const CHILD_LABEL = "red discs";
const COMPANION_LABEL = "yellow discs";
/** Long enough to read as a falling disc, short enough to stay inside the reveal. */
const DROP_ANIMATION_MS = 300;

function describeMove(disc: ConnectFourDisc, column: number): string {
  const colour = disc === CONNECT_FOUR_CHILD_DISC ? "red" : "yellow";
  return `dropped a ${colour} disc into column ${column + 1}`;
}

function describePlannedMove(column: number): string {
  return `drop your yellow disc into column ${column + 1}`;
}

function summarizeRound(input: {
  result: ConnectFourResult | null;
  turn: "child" | "companion" | "none";
  lastMoveDescription?: string;
  by?: "child" | "companion";
}): string {
  if (input.result === "child_win") return "The child won the Connect Four round.";
  if (input.result === "companion_win") return "The companion won the Connect Four round.";
  if (input.result === "draw") return "The Connect Four round ended in a draw.";
  if (input.lastMoveDescription && input.by) {
    return `The ${input.by} ${input.lastMoveDescription}. It is now the ${input.turn}'s turn.`;
  }
  return `A Connect Four round is in progress. It is the ${input.turn}'s turn.`;
}

/** Did this landing deny an opponent window that already held three discs? */
function moveBlockedOpponent(
  before: readonly ConnectFourCell[],
  index: number,
  opponent: ConnectFourDisc,
): boolean {
  return CONNECT_FOUR_WINDOWS.some(
    (window) =>
      window.includes(index) &&
      before[index] == null &&
      window.filter((i) => before[i] === opponent).length === 3,
  );
}

/** Did this landing create a live three-in-a-row? */
function moveCreatedThreat(
  after: readonly ConnectFourCell[],
  index: number,
  disc: ConnectFourDisc,
): boolean {
  return CONNECT_FOUR_WINDOWS.some(
    (window) =>
      window.includes(index) &&
      window.filter((i) => after[i] === disc).length === 3 &&
      window.some((i) => after[i] == null),
  );
}

/** Emotional tone only — the companion never coaches strategy during play. */
function getConnectFourMoment(input: {
  type: CompanionActivityGameEvent["type"];
  before?: readonly ConnectFourCell[];
  after?: readonly ConnectFourCell[];
  index?: number;
  disc?: ConnectFourDisc;
  result?: ConnectFourResult;
}): CompanionActivityMoment | undefined {
  if (input.type === "companion_activity_started" || input.type === "companion_activity_reset") {
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
  if (input.before == null || input.after == null || input.index == null || !input.disc) {
    return undefined;
  }
  if (
    input.type === "companion_activity_companion_move" &&
    moveBlockedOpponent(input.before, input.index, CONNECT_FOUR_CHILD_DISC)
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
    moveBlockedOpponent(input.before, input.index, CONNECT_FOUR_COMPANION_DISC)
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
    moveCreatedThreat(input.after, input.index, input.disc)
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

function statusCopy(
  result: ConnectFourResult | null,
  companionName: string,
  thinking: boolean,
): string {
  if (result === "child_win") return "You won. Four in a row!";
  if (result === "companion_win") return `${companionName} got four in a row.`;
  if (result === "draw") return "Board full. That is a draw.";
  if (thinking) return `${companionName} is choosing a column.`;
  return "Your move. Pick a column.";
}

export function CompanionConnectFour({
  companionName,
  onClose,
  onBanter,
  onCompanionTurn,
  onRoundComplete,
  onGameEvent,
  resolveCompanionTurn,
}: CompanionConnectFourProps) {
  const [board, setBoard] = useState<ConnectFourCell[]>(CONNECT_FOUR_EMPTY_BOARD);
  const [companionThinking, setCompanionThinking] = useState(false);
  const [lastLanding, setLastLanding] = useState<number | null>(null);
  const didEmitStartedRef = useRef(false);
  const emittedRoundCompleteRef = useRef<string | null>(null);
  const decisionStartedAtRef = useRef<number | null>(null);
  const roundTokenRef = useRef(0);
  const result = useMemo(() => connectFourResult(board), [board]);
  const winningWindow = useMemo(
    () => findConnectFourWinner(board)?.window ?? [],
    [board],
  );

  const emitGameEvent = useCallback(
    (input: {
      type: CompanionActivityGameEvent["type"];
      board: readonly ConnectFourCell[];
      turn: "child" | "companion" | "none";
      moveDescription?: string;
      moveBy?: "child" | "companion";
      moment?: CompanionActivityMoment;
      result?: ConnectFourResult;
      decisionStartedAt?: number;
      plannedDecisionDelayMs?: number;
      decisionLatencyMs?: number;
    }) => {
      onGameEvent?.({
        type: input.type,
        activityId: "connect_four",
        surface: "video_call_overlay",
        companionName,
        timestamp: Date.now(),
        boardView: {
          text: renderConnectFourBoardText(input.board),
          signature: connectFourBoardSignature(input.board),
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
      board: CONNECT_FOUR_EMPTY_BOARD,
      turn: "child",
      moment: getConnectFourMoment({ type: "companion_activity_started" }),
    });
  }, [emitGameEvent]);

  useEffect(() => {
    if (!result) return;
    const completionKey = `${result}:${connectFourBoardSignature(board)}`;
    if (emittedRoundCompleteRef.current === completionKey) return;
    emittedRoundCompleteRef.current = completionKey;
    playCompanionActivitySfx("round_complete");
    console.log(` 🎮 [companion-connect-four] [round_complete] [${result}]`);
    emitGameEvent({
      type: "companion_activity_round_complete",
      board,
      turn: "none",
      result,
      moment: getConnectFourMoment({ type: "companion_activity_round_complete", result }),
    });
    onBanter?.({ phase: "round_complete", activityId: "connect_four", result });
    onRoundComplete?.(result);
  }, [board, emitGameEvent, onBanter, onRoundComplete, result]);

  useEffect(() => {
    return () => {
      roundTokenRef.current += 1;
    };
  }, []);

  const applyCompanionMove = useCallback(
    (boardBefore: readonly ConnectFourCell[], column: number) => {
      const dropped = dropDisc(boardBefore, column, CONNECT_FOUR_COMPANION_DISC);
      if (!dropped) {
        setCompanionThinking(false);
        return;
      }
      const decisionStartedAt = decisionStartedAtRef.current ?? Date.now();
      const decisionLatencyMs = Math.max(0, Date.now() - decisionStartedAt);
      // SFX fires at landing, not at decision time, so it matches the reveal.
      playCompanionActivitySfx("companion_move");
      console.log(
        ` 🎮 [companion-connect-four] [companion_move] [column_${column + 1}] actual_ms=${decisionLatencyMs}`,
      );
      setLastLanding(dropped.index);
      setBoard(dropped.board);
      emitGameEvent({
        type: "companion_activity_companion_move",
        board: dropped.board,
        turn: connectFourResult(dropped.board) ? "none" : "child",
        moveDescription: describeMove(CONNECT_FOUR_COMPANION_DISC, column),
        moveBy: "companion",
        moment: getConnectFourMoment({
          type: "companion_activity_companion_move",
          before: boardBefore,
          after: dropped.board,
          index: dropped.index,
          disc: CONNECT_FOUR_COMPANION_DISC,
        }),
        decisionStartedAt,
        plannedDecisionDelayMs: COMPANION_ACTIVITY_MIN_REVEAL_MS,
        decisionLatencyMs,
      });
      onBanter?.({ phase: "companion_move", activityId: "connect_four" });
      onCompanionTurn?.();
      setCompanionThinking(false);
      decisionStartedAtRef.current = null;
    },
    [emitGameEvent, onBanter, onCompanionTurn],
  );

  const resetRound = () => {
    emittedRoundCompleteRef.current = null;
    roundTokenRef.current += 1;
    setBoard(CONNECT_FOUR_EMPTY_BOARD);
    setCompanionThinking(false);
    setLastLanding(null);
    decisionStartedAtRef.current = null;
    console.log(" 🎮 [companion-connect-four] [reset] [ok]");
    emitGameEvent({
      type: "companion_activity_reset",
      board: CONNECT_FOUR_EMPTY_BOARD,
      turn: "child",
      moment: getConnectFourMoment({ type: "companion_activity_reset" }),
    });
  };

  const playColumn = (column: number) => {
    if (result || companionThinking) return;
    const before = [...board];
    const dropped = dropDisc(before, column, CONNECT_FOUR_CHILD_DISC);
    if (!dropped) return;
    playCompanionActivitySfx("child_move");
    console.log(` 🎮 [companion-connect-four] [child_move] [column_${column + 1}]`);
    setLastLanding(dropped.index);
    setBoard(dropped.board);
    const childMoveEndsRound = Boolean(connectFourResult(dropped.board));
    emitGameEvent({
      type: "companion_activity_child_move",
      board: dropped.board,
      turn: childMoveEndsRound ? "none" : "companion",
      moveDescription: describeMove(CONNECT_FOUR_CHILD_DISC, column),
      moveBy: "child",
      moment: getConnectFourMoment({
        type: "companion_activity_child_move",
        before,
        after: dropped.board,
        index: dropped.index,
        disc: CONNECT_FOUR_CHILD_DISC,
      }),
    });
    onBanter?.({ phase: "child_move", activityId: "connect_four" });
    if (childMoveEndsRound) return;

    const plannedColumn = getConnectFourMove(dropped.board);
    if (plannedColumn == null) return;
    decisionStartedAtRef.current = Date.now();
    onBanter?.({ phase: "companion_thinking", activityId: "connect_four" });
    // Locks every column while the packet is in flight.
    setCompanionThinking(true);
    const token = roundTokenRef.current;
    void runCompanionActivityTurn({
      plan: { column: plannedColumn },
      // Without a gate the runner still honours the min-reveal floor, so the
      // game stays playable standalone.
      ...(resolveCompanionTurn && {
        gate: () =>
          resolveCompanionTurn({
            boardView: {
              text: renderConnectFourBoardText(dropped.board),
              signature: connectFourBoardSignature(dropped.board),
            },
            plannedMove: describePlannedMove(plannedColumn),
          }),
      }),
      isStale: () => roundTokenRef.current !== token,
      onReveal: (plan) => applyCompanionMove(dropped.board, plan.column),
      onError: (err) => {
        console.warn(" 🎮 [companion-connect-four] [turn_gate] [error]", err);
      },
    });
  };

  const openColumns = availableColumns(board);
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
    <section aria-label={`Connect Four with ${companionName}`} style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(248,250,252,0.62)" }}>
            PLAY MODE
          </div>
          <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.05 }}>Connect Four</h2>
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
        aria-label="Connect Four board"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${CONNECT_FOUR_COLUMNS}, minmax(0, 1fr))`,
          gap: 4,
          background: "rgba(79, 70, 229, 0.28)",
          borderRadius: 10,
          padding: 6,
        }}
      >
        {Array.from({ length: CONNECT_FOUR_COLUMNS }, (_, column) => {
          const columnFull = landingIndex(board, column) == null;
          const disabled = columnFull || Boolean(result) || companionThinking;
          return (
            <button
              key={column}
              type="button"
              role="gridcell"
              aria-label={columnFull ? `Column ${column + 1} full` : `Column ${column + 1}`}
              onClick={() => playColumn(column)}
              disabled={disabled}
              style={{
                display: "grid",
                gap: 4,
                padding: 0,
                border: 0,
                background: "transparent",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled && !result ? 0.85 : 1,
              }}
            >
              {Array.from({ length: CONNECT_FOUR_ROWS }, (_, row) => {
                const index = cellIndex(row, column);
                const cell = board[index];
                const isWinning = winningWindow.includes(index);
                return (
                  <motion.span
                    key={row}
                    aria-hidden
                    initial={false}
                    animate={
                      lastLanding === index
                        ? { y: [-18 * (row + 1), 0], scale: [0.9, 1] }
                        : { y: 0, scale: 1 }
                    }
                    transition={{ duration: DROP_ANIMATION_MS / 1000, ease: "easeIn" }}
                    style={{
                      display: "block",
                      aspectRatio: "1",
                      borderRadius: "50%",
                      background:
                        cell === CONNECT_FOUR_CHILD_DISC
                          ? "radial-gradient(circle at 35% 30%, #fb7185, #e11d48)"
                          : cell === CONNECT_FOUR_COMPANION_DISC
                            ? "radial-gradient(circle at 35% 30%, #fde047, #f59e0b)"
                            : "rgba(7, 10, 22, 0.72)",
                      boxShadow: isWinning ? "0 0 0 2px #f8fafc inset" : "none",
                    }}
                  />
                );
              })}
            </button>
          );
        })}
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
      <span hidden data-testid="connect-four-open-columns">{openColumns.join(",")}</span>
    </section>
  );
}
