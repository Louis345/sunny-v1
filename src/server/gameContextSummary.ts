/**
 * Compact text summary of iframe / flow game `game_state_update` payloads for Claude context.
 */
export function buildGameContextSummary(state: Record<string, unknown>): string {
  const lines: string[] = ["[Game state update]"];

  if (typeof state.phase === "string" && state.phase.length > 0) {
    lines.push(`Phase: ${state.phase}`);
  }
  const action =
    typeof state.action === "string" && state.action.length > 0
      ? state.action
      : typeof state.lastAction === "string" && state.lastAction.length > 0
        ? state.lastAction
        : "";
  if (action) {
    lines.push(`Action: ${action}`);
  }
  if (typeof state.currentWord === "string" && state.currentWord.length > 0) {
    lines.push(`Word: ${state.currentWord}`);
  }
  if (Array.isArray(state.screenText) && state.screenText.length > 0) {
    const text = state.screenText
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(" | ");
    if (text) lines.push(`Screen text: ${text}`);
  }
  if (state.timerRemaining !== undefined && state.timerRemaining !== null) {
    lines.push(`Timer: ${String(state.timerRemaining)}s remaining`);
  }
  if (state.matchRatio !== undefined && state.matchRatio !== null) {
    const n = Number(state.matchRatio);
    if (!Number.isNaN(n)) {
      lines.push(`STT match: ${Math.round(n * 100)}%`);
    }
  }
  if (typeof state.lastHeard === "string" && state.lastHeard.length > 0) {
    lines.push(`Heard: "${state.lastHeard}"`);
  }
  if (state.itemIndex !== undefined && state.itemIndex !== null) {
    const idx = Number(state.itemIndex);
    const total =
      state.totalItems !== undefined && state.totalItems !== null
        ? String(state.totalItems)
        : "?";
    if (!Number.isNaN(idx)) {
      lines.push(`Item ${idx + 1} of ${total}`);
    }
  }
  if (state.score !== undefined && state.score !== null) {
    lines.push(`Score: ${String(state.score)}`);
  }
  if (typeof state.wheelValue === "string" && state.wheelValue.length > 0) {
    lines.push(`Wheel landed on: ${state.wheelValue}`);
  }
  if (typeof state.letter === "string" && state.letter.length > 0) {
    lines.push(`Letter guessed: ${state.letter}`);
  }
  if (Array.isArray(state.guessedLetters) && state.guessedLetters.length > 0) {
    lines.push(
      `Guessed letters: ${state.guessedLetters.map((x) => String(x)).join(", ")}`,
    );
  }
  if (state.wrongGuesses !== undefined && state.wrongGuesses !== null) {
    const max =
      state.maxWrongGuesses !== undefined && state.maxWrongGuesses !== null
        ? ` of ${String(state.maxWrongGuesses)}`
        : "";
    lines.push(`Wrong guesses: ${String(state.wrongGuesses)}${max}`);
  }
  if (state.correct !== undefined && state.correct !== null) {
    lines.push(`Result: ${state.correct === true ? "correct" : "incorrect"}`);
  }
  if (typeof state.boardState === "string" && state.boardState.length > 0) {
    lines.push(`Board: ${state.boardState}`);
  }
  if (typeof state.progress === "string" && state.progress.trim().length > 0) {
    lines.push(`Progress: ${state.progress.trim()}`);
  }
  if (typeof state.game === "string" && state.game.length > 0) {
    lines.push(`Game: ${state.game}`);
  }

  return lines.join("\n");
}
