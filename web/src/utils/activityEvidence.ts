import {
  createActivityEvidenceEvent,
  type ActivityEvidenceContext,
  type ActivityEvidenceEvent,
  type ActivityEvidenceEventName,
} from "../../../src/shared/activityEvidence";

export type ActivityEvidenceSendMessage = (
  type: string,
  payload?: Record<string, unknown>,
) => void;

export type ActivityEvidenceClient = {
  activityStarted: (fields?: Record<string, unknown>) => ActivityEvidenceEvent;
  targetPresented: (fields: Record<string, unknown>) => ActivityEvidenceEvent;
  audioRequested: (fields: Record<string, unknown>) => ActivityEvidenceEvent;
  audioPlayed: (fields: Record<string, unknown>) => ActivityEvidenceEvent;
  attemptRecorded: (fields: Record<string, unknown>) => ActivityEvidenceEvent;
  targetCompleted: (fields: Record<string, unknown>) => ActivityEvidenceEvent;
  activityCompleted: (fields?: Record<string, unknown>) => ActivityEvidenceEvent;
};

export function createActivityEvidenceClient(args: {
  context: ActivityEvidenceContext;
  sendMessage: ActivityEvidenceSendMessage;
}): ActivityEvidenceClient {
  const emit = (
    eventName: ActivityEvidenceEventName,
    fields: Record<string, unknown> = {},
  ): ActivityEvidenceEvent => {
    const event = createActivityEvidenceEvent(eventName, args.context, fields);
    args.sendMessage("game_event", {
      event: {
        type: "activity_evidence",
        payload: event,
        version: "1.0",
      },
    });
    return event;
  };

  return {
    activityStarted: (fields = {}) => emit("activity_started", fields),
    targetPresented: (fields) => emit("target_presented", fields),
    audioRequested: (fields) => emit("audio_requested", fields),
    audioPlayed: (fields) => emit("audio_played", fields),
    attemptRecorded: (fields) => emit("attempt_recorded", fields),
    targetCompleted: (fields) => emit("target_completed", fields),
    activityCompleted: (fields = {}) => emit("activity_completed", fields),
  };
}
