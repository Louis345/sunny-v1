import type { NodeConfig, NodeResult } from "../../shared/adventureTypes";

/**
 * Structured payload for `SessionManager.queueNodeCompletionHandoff` after
 * `applyNodeResult` — merged into the next `takePendingGameContextMessages`
 * **before** the latest iframe `game_state_update` summary so the companion
 * keeps node-level outcomes (e.g. Word Radar misses) across rapid game updates.
 */
export function buildNodeCompletionHandoffState(
  node: NodeConfig,
  result: NodeResult,
): Record<string, unknown> {
  const missed = normalizeWordList(result.missedWords);
  const correct = normalizeWordList(result.correctWords);
  const accPct = Math.round(result.accuracy * 100);
  let progress = `${node.type} finished: ${accPct}% accuracy over ${result.wordsAttempted} item(s).`;
  if (missed.length) {
    progress += ` Focus spelling / listening on: ${missed.join(", ")}.`;
  }
  if (correct.length) {
    const shown = correct.slice(0, 20).join(", ");
    progress += ` Confident on: ${shown}${correct.length > 20 ? " …" : ""}.`;
  }
  return {
    phase: "node_complete",
    game: node.type,
    nodeId: result.nodeId,
    accuracy: result.accuracy,
    completed: result.completed,
    missedWords: missed,
    correctWords: correct,
    targetResults: result.targetResults ?? [],
    wordsAttempted: result.wordsAttempted,
    progress,
  };
}

function normalizeWordList(raw: string[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((w) => String(w).trim()).filter(Boolean))];
}
