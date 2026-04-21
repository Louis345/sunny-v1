export type SessionEventType =
  | "game_started"
  | "correct_answer"
  | "wrong_answer"
  | "streak_3"
  | "streak_5"
  | "node_complete"
  | "reading_complete"
  | "idle_10s"
  | "session_end";

export type SessionEvent = {
  type: SessionEventType;
  childId: string;
  sessionId: string;
  data?: Record<string, unknown>;
  timestamp: number;
};

export type SessionEventHandler = (event: SessionEvent) => void;

class SessionEventBus {
  private handlers = new Map<SessionEventType, Set<SessionEventHandler>>();

  subscribe(
    type: SessionEventType,
    handler: SessionEventHandler,
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  fire(event: SessionEvent): void {
    console.log(`  [EventBus] ${event.type} childId=${event.childId}`);
    this.handlers.get(event.type)?.forEach((h) => {
      try {
        h(event);
      } catch (e) {
        console.error("[EventBus] handler error:", e);
      }
    });
  }
}

export const sessionEventBus = new SessionEventBus();
