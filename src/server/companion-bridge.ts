import { sessionEventBus, type SessionEvent } from "./session-event-bus";
import { broadcastCompanionEventToMapChild } from "./map-coordinator";
import type { CompanionEventPayload } from "../shared/companionTypes";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { validateCompanionCommand } from "../shared/companions/validateCompanionCommand";
import { isCompanionEmote } from "../shared/companionEmotes";

const PREVIEW_SESSIONS = new Set<string>();

export function markSessionAsPreview(sessionId: string): void {
  PREVIEW_SESSIONS.add(sessionId);
}

export function clearPreviewSession(sessionId: string): void {
  PREVIEW_SESSIONS.delete(sessionId);
}

const EVENT_TO_EMOTE: Partial<Record<SessionEvent["type"], string>> = {
  correct_answer: "happy",
  wrong_answer: "concerned",
  streak_3: "celebrating",
  node_complete: "celebrating",
  reading_complete: "happy",
  idle_10s: "winking",
  session_end: "happy",
};

function routeEventToCompanion(event: SessionEvent): void {
  if (PREVIEW_SESSIONS.has(event.sessionId)) return;

  const emote = EVENT_TO_EMOTE[event.type];
  if (!emote) return;

  const payload: CompanionEventPayload = {
    emote: emote as CompanionEventPayload["emote"],
    intensity: event.type === "streak_3" ? 1.0 : 0.8,
    timestamp: event.timestamp,
    childId: event.childId,
  };

  broadcastCompanionEventToMapChild(event.childId, {
    type: "companion_event",
    payload,
  });

  console.log(
    `  [CompanionBridge] ${event.type} → emote=${emote}` +
      ` childId=${event.childId}`,
  );
}

const EVENT_TYPES: import("./session-event-bus").SessionEventType[] = [
  "correct_answer",
  "wrong_answer",
  "streak_3",
  "node_complete",
  "reading_complete",
  "idle_10s",
  "session_end",
];

EVENT_TYPES.forEach((type) => {
  sessionEventBus.subscribe(type, routeEventToCompanion);
});

type SendFn = (type: string, data: Record<string, unknown>) => void;

/**
 * Tool-driven companion actions (explicit emote / command). Auto emotes from the
 * global EventBus are handled by `routeEventToCompanion` at module load.
 */
export class ServerCompanionBridge {
  private send: SendFn | null = null;
  private childId = "";
  private previewMode = false;

  attach(
    childId: string,
    send: SendFn,
    previewMode: boolean,
  ): void {
    this.detach();
    this.childId = childId;
    this.send = send;
    this.previewMode = previewMode;
  }

  detach(): void {
    this.send = null;
    this.childId = "";
    this.previewMode = false;
  }

  /** Claude `expressCompanion` tool — not suppressed in preview (explicit companion act). */
  async expressCompanion(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const emoteRaw = args.emote;
    if (!isCompanionEmote(emoteRaw)) {
      return { ok: false, error: "invalid_emote" };
    }
    let intensity = 0.8;
    if (args.intensity != null) {
      const n = Number(args.intensity);
      if (Number.isFinite(n)) {
        intensity = Math.min(1, Math.max(0, n));
      }
    }
    const childId = this.childId || "";
    const payload: CompanionEventPayload = {
      emote: emoteRaw,
      intensity,
      timestamp: Date.now(),
      childId,
    };
    const send = this.send;
    if (send) {
      send("companion_event", { payload });
    }
    const envelope: { type: "companion_event"; payload: CompanionEventPayload } = {
      type: "companion_event",
      payload,
    };
    broadcastCompanionEventToMapChild(childId, envelope);
    console.log(
      `  [companion] expressCompanion emote=${emoteRaw} intensity=${intensity} childId=${childId}`,
    );
    return { ok: true, emote: emoteRaw, intensity };
  }

  /** Claude `companionAct` tool — not suppressed in preview. */
  async companionAct(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const childId = this.childId || "";
    const cmd = validateCompanionCommand(args, COMPANION_CAPABILITIES, {
      childId,
      source: "claude",
    });
    if (!cmd) {
      return { ok: false, error: "invalid_or_unknown_companion_command" };
    }
    const send = this.send;
    if (send) {
      send("companion_command", { command: cmd });
    }
    broadcastCompanionEventToMapChild(childId, {
      type: "companion_command",
      command: cmd,
    });
    console.log(`  [companion] companionAct type=${cmd.type} childId=${childId}`);
    return { ok: true, type: cmd.type };
  }
}
