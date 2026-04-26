import type { CompanionTrigger } from "../../../src/shared/companionTypes";

export type FlowGameSendMessage = (
  type: string,
  payload?: Record<string, unknown>,
) => void;

export interface FlowGameEventBridge {
  reportState: (progress: string, extras?: Record<string, unknown>) => void;
  fireCompanionEvent: (
    trigger: CompanionTrigger,
    payload?: Record<string, unknown>,
  ) => void;
  complete: (result: Record<string, unknown>) => void;
}

export function createFlowGameEvents(args: {
  game: string;
  childId: string;
  sendMessage: FlowGameSendMessage;
}): FlowGameEventBridge {
  const { game, childId, sendMessage } = args;

  return {
    reportState(progress, extras = {}) {
      const trimmed = progress.trim();
      if (!trimmed) return;
      sendMessage("game_event", {
        event: {
          type: "game_state_update",
          payload: {
            game,
            progress: trimmed,
            childId,
            ...extras,
          },
          version: "1.0",
        },
      });
    },

    fireCompanionEvent(trigger, payload = {}) {
      sendMessage("game_event", {
        event: {
          type: "companion_event",
          payload: {
            trigger,
            timestamp: Date.now(),
            childId,
            metadata: payload,
          },
          version: "1.0",
        },
      });
    },

    complete(result) {
      sendMessage("game_event", {
        event: {
          type: "game_complete",
          payload: {
            game,
            childId,
            ...result,
          },
          version: "1.0",
        },
      });
    },
  };
}
