/**
 * Every action the child takes is either sent, held, or reported: never silently lost.
 * While the connection to Sunny is down, the latest "Hear word" tap is held and resent once the
 * session is back, unless it has waited too long. Anything else is reported as dropped.
 */
export type QueuedAction = { type: string; payload: Record<string, unknown>; at: number };

const isNarrationTap = (type: string, payload: Record<string, unknown>) =>
  type === "game_event" && (payload.event as { type?: unknown } | undefined)?.type === "narration_request";

export function createActionOutbox(options: { now?: () => number; maxAgeMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? 8_000;
  let held: QueuedAction | undefined;
  return {
    deliver(type: string, payload: Record<string, unknown>, open: boolean, send: (message: Record<string, unknown>) => void): "sent" | "queued" | "dropped" {
      if (open) {
        send({ ...payload, type });
        return "sent";
      }
      if (isNarrationTap(type, payload)) {
        held = { type, payload, at: now() };
        console.warn(` 🎮 [session-link] [action] [queued] type=${type} reason=reconnecting`);
        return "queued";
      }
      console.warn(` 🎮 [session-link] [action] [dropped] type=${type} reason=not_connected`);
      return "dropped";
    },
    /** The held tap, if it is still fresh; it is handed back only once. */
    take(): QueuedAction | undefined {
      const action = held;
      held = undefined;
      if (!action) return undefined;
      if (now() - action.at > maxAgeMs) {
        console.warn(` 🎮 [session-link] [action] [expired] type=${action.type} ageMs=${now() - action.at}`);
        return undefined;
      }
      console.log(` 🎮 [session-link] [action] [resent] type=${action.type}`);
      return action;
    },
  };
}
