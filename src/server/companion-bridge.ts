import { sessionEventBus, type SessionEvent } from "./session-event-bus";
import { broadcastCompanionEventToMapChild } from "./map-coordinator";
import type { CompanionEventPayload } from "../shared/companionTypes";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { scheduleCompanionCheckIn } from "./companionCheckIn";
import { getActiveVoiceSessionManagerForChild } from "./voice-session-registry";
import { validateCompanionCommand } from "../shared/companions/validateCompanionCommand";
import { isCompanionEmote } from "../shared/companionEmotes";

const EVENT_TO_EMOTE: Partial<Record<SessionEvent["type"], string>> = {
  game_started: "excited",
  correct_answer: "happy",
  wrong_answer: "concerned",
  streak_3: "celebrating",
  node_complete: "celebrating",
  reading_complete: "happy",
  idle_10s: "winking",
  session_end: "happy",
  session_complete: "happy",
};

function routeEventToCompanion(event: SessionEvent): void {
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
  "game_started",
  "correct_answer",
  "wrong_answer",
  "streak_3",
  "node_complete",
  "reading_complete",
  "idle_10s",
  "session_end",
  "session_complete",
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
      console.warn(
        `  🎮 [companion] [companionAct] [rejected] type=${String(args.type)} payload=${JSON.stringify(args.payload ?? null)} childId=${childId}`,
      );
      return { ok: false, error: "invalid_or_unknown_companion_command" };
    }
    const send = this.send;
    const deliver = (command: typeof cmd) => {
      if (send) send("companion_command", { command });
      broadcastCompanionEventToMapChild(childId, { type: "companion_command", command });
    };
    // Her companion's own check-in: code keeps the appointment, the companion chose when and how (2026-11-10).
    if (cmd.type === "check_back_in") {
      const payload = cmd.payload as { after_seconds: number; how: "raise_hand" | "ask"; words?: string; why: string };
      const manager = getActiveVoiceSessionManagerForChild(childId);
      scheduleCompanionCheckIn({ childId, afterSeconds: payload.after_seconds, how: payload.how, words: payload.words ?? "", why: payload.why }, {
        send: () => deliver({ ...cmd, timestamp: Date.now() }),
        speak: words => { if (words.trim()) void Promise.resolve(manager?.speakGameNarration?.(words, { reason: "companion_check_in" })).catch(error => console.error(" 🎮 [companion-checkin] [speak-failed]", error)); },
        trace: row => manager?.recordGameTrace?.(row),
      });
      return { ok: true, type: cmd.type, scheduled: true };
    }
    deliver(cmd);
    console.log(`  [companion] companionAct type=${cmd.type} childId=${childId}`);
    return { ok: true, type: cmd.type };
  }
}
