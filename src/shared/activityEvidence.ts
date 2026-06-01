export const ACTIVITY_EVIDENCE_EVENT_TYPE = "activity_evidence" as const;

export type ActivityEvidenceEventName =
  | "activity_started"
  | "target_presented"
  | "audio_requested"
  | "audio_played"
  | "attempt_recorded"
  | "target_completed"
  | "activity_completed";

export type ActivityEvidenceContext = {
  activityId: string;
  childId?: string;
  sessionId?: string;
  planId?: string;
  nodeId?: string;
  targetLane?: string;
  activityMode?: string;
  activityConfig?: Record<string, unknown>;
};

export type ActivityEvidenceEvent = ActivityEvidenceContext & {
  type: typeof ACTIVITY_EVIDENCE_EVENT_TYPE;
  eventName: ActivityEvidenceEventName;
  ts: string;
  target?: string;
  itemIndex?: number;
  attemptNumber?: number;
  visibleState?: Record<string, unknown>;
  childAction?: Record<string, unknown>;
  audio?: Record<string, unknown>;
  result?: Record<string, unknown>;
  latencyMs?: number;
  targetResults?: unknown[];
  [key: string]: unknown;
};

const TARGET_EVENTS: ReadonlySet<ActivityEvidenceEventName> = new Set([
  "target_presented",
  "audio_requested",
  "audio_played",
  "attempt_recorded",
  "target_completed",
]);

function nonEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireField(name: string, value: unknown): void {
  if (!nonEmpty(value)) throw new Error(`activity evidence missing ${name}`);
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (typeof value[key] === "undefined") delete value[key];
  }
  return value;
}

export function createActivityEvidenceEvent(
  eventName: ActivityEvidenceEventName,
  context: ActivityEvidenceContext,
  fields: Record<string, unknown> = {},
): ActivityEvidenceEvent {
  requireField("activityId", context.activityId);
  if (TARGET_EVENTS.has(eventName)) {
    requireField("target", fields.target);
  }
  return pruneUndefined({
    ...context,
    ...fields,
    type: ACTIVITY_EVIDENCE_EVENT_TYPE,
    eventName,
    ts: typeof fields.ts === "string" && fields.ts.trim() ? fields.ts : new Date().toISOString(),
    activityId: context.activityId.trim(),
    ...(context.childId ? { childId: context.childId.trim() } : {}),
    ...(context.sessionId ? { sessionId: context.sessionId.trim() } : {}),
    ...(context.planId ? { planId: context.planId.trim() } : {}),
    ...(context.nodeId ? { nodeId: context.nodeId.trim() } : {}),
    ...(context.targetLane ? { targetLane: context.targetLane.trim() } : {}),
    ...(context.activityMode ? { activityMode: context.activityMode.trim() } : {}),
  }) as ActivityEvidenceEvent;
}

export function isActivityEvidenceEvent(value: unknown): value is ActivityEvidenceEvent {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.type === ACTIVITY_EVIDENCE_EVENT_TYPE && typeof row.eventName === "string";
}
