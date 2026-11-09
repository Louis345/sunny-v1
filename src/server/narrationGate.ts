/**
 * Who speaks first (BUGS.md 2026-11-09): while her companion answers her help request, the game's own word waits
 * and plays when that answer ends. Only the latest held word is kept (the game has moved on past older ones).
 */
export class NarrationGate {
  private answeringHelp = false;
  private held: { text: string; metadata: Record<string, unknown> } | undefined;

  helpAnswerStarted(): void {
    this.answeringHelp = true;
  }

  /** Hold only while a help answer is in flight; an idle companion never delays the game. */
  shouldHold(turnState: string): boolean {
    return this.answeringHelp && turnState !== "IDLE";
  }

  hold(text: string, metadata: Record<string, unknown>): void {
    this.held = { text, metadata };
    console.log(` 🎮 [game-narration] [held] reason=help_answer_in_progress word=${String(metadata.word ?? "")}`);
  }

  /** The turn ended: the help answer is over; returns the word to play now, if one was held. */
  turnEnded(): { text: string; metadata: Record<string, unknown> } | undefined {
    this.answeringHelp = false;
    const held = this.held;
    this.held = undefined;
    if (held) console.log(` 🎮 [game-narration] [released] word=${String(held.metadata.word ?? "")}`);
    return held;
  }
}
