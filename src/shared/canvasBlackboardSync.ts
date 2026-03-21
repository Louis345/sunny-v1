/**
 * Pure helpers for canvas ↔ blackboard mutual exclusion (see ARCHITECTURE.md).
 * Used by web useSession and by src/tests/test-canvas-sync.ts.
 */

export type BlackboardGesture = "flash" | "reveal" | "mask" | "clear";

export interface BlackboardSyncState {
  gesture: BlackboardGesture | null;
  word?: string;
  maskedWord?: string;
  duration?: number;
  flashKey?: number;
}

/** Server blackboard tool args / blackboard WebSocket payload */
export interface BlackboardMessagePayload {
  gesture: string;
  word?: string;
  maskedWord?: string;
  duration?: number;
}

/**
 * When a blackboard gesture arrives, canvas must go idle so showCanvas and
 * blackboard never display the same word surface at once.
 */
export function applyBlackboardMessage(
  prev: BlackboardSyncState,
  msg: BlackboardMessagePayload,
): { canvasIdle: { mode: "idle" }; blackboard: BlackboardSyncState } {
  const g = msg.gesture as BlackboardGesture;
  return {
    canvasIdle: { mode: "idle" },
    blackboard: {
      gesture: g,
      word: msg.word,
      maskedWord: msg.maskedWord,
      duration: msg.duration ?? 3000,
      flashKey:
        g === "flash" ? (prev.flashKey ?? 0) + 1 : prev.flashKey,
    },
  };
}

/** When showCanvas runs, blackboard must yield (gesture cleared). */
export function clearedBlackboardState(): BlackboardSyncState {
  return { gesture: null };
}
