/**
 * Thin bridge: post outbound messages to a game iframe and normalize inbound events.
 * Game-agnostic — no embedded titles or modes.
 */
export class GameBridge {
  onEvent: (type: string, data: unknown) => void = () => {};
  onComplete: (data: unknown) => void = () => {};

  constructor(
    private readonly postMessage?: (payload: Record<string, unknown>) => void,
  ) {}

  startGame(
    _gameUrl: string,
    childName: string,
    config: Record<string, unknown>,
  ): void {
    this.postMessage?.({
      type: "start",
      childName,
      config,
    });
  }

  sendToGame(type: string, data: Record<string, unknown>): void {
    this.postMessage?.({ type, ...data });
  }

  endGame(): void {
    this.postMessage?.({ type: "clear" });
  }

  handleGameEvent(event: Record<string, unknown>): void {
    const t = event.type;
    if (typeof t !== "string") return;

    if (t === "game_complete") {
      const { type: _drop, ...rest } = event;
      this.onComplete(rest);
      return;
    }

    const { type: _drop, ...data } = event;
    this.onEvent(t, data);
  }
}
