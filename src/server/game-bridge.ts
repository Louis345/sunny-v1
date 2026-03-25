import { getReward, getTool, type GameDefinition } from "./games/registry";

/**
 * Thin bridge: post outbound messages to a game iframe and normalize inbound events.
 * Game-agnostic — no embedded titles or modes.
 */
export class GameBridge {
  onEvent: (type: string, data: unknown) => void = () => {};
  onComplete: (data: unknown) => void = () => {};

  constructor(
    private readonly postMessage?: (payload: Record<string, unknown>) => void,
    private readonly onVoiceFromGame?: (voiceEnabled: boolean) => void,
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

  /**
   * Resolve URL + default config from the games registry, then start.
   */
  launchByName(
    name: string,
    type: "tool" | "reward",
    childName: string,
    config?: Record<string, unknown>,
  ): void {
    const entry: GameDefinition | null =
      type === "tool" ? getTool(name) : getReward(name);
    if (!entry) return;
    this.onVoiceFromGame?.(entry.voiceEnabled);
    const merged = { ...entry.defaultConfig, ...(config ?? {}) };
    this.startGame(entry.url, childName, merged);
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
