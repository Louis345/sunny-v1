import { canonicalJson } from './eventId';
import { schemas, actors, factId, type FactType } from './spelling/schemas';

export const EVENT_TYPES = [
  'activity.limited', 'test_schedule.set', 'child.profile_set', 'assignment.ingested', 'words.tagged', 'prediction.prior',
  'session.started', 'session.ended', 'item.presented', 'response.observed',
  'prediction.evaluated', 'plan.decided', 'board.published', 'node.started', 'node.completed',
  'engagement.observed', 'engagement.prediction', 'engagement.evaluated',
  'learner.hypothesis', 'learner.hypothesis_evaluated', 'readiness.forecast',
  'school_test.recorded', 'forecast.evaluated', 'correction.recorded',
] as const;
export type EventType = typeof EVENT_TYPES[number];
export type Actor = 'child' | 'parent' | 'planner' | 'creator' | 'system' | 'room';
export type EventInput = {
  event_id: string; child_id: string; type: EventType; occurred_at: string;
  actor: Actor; cites: string[]; payload: Record<string, unknown>;
};
export type ChartEvent = EventInput & { recorded_at: string; sequence: number };

export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
export function validatePayload(type: EventType, payload: unknown): asserts payload is Record<string, unknown> {
  if (!object(payload)) throw new Error('chart_payload_object');
  canonicalJson(payload);
  if (!(type in schemas)) throw new Error('chart_type_not_implemented:' + type);
  const result = schemas[type as FactType].safeParse(payload);
  if (!result.success) throw new Error('chart_payload_invalid:' + result.error.message);
  // Validation must never silently trim or otherwise rewrite the submitted fact.
  if (canonicalJson(result.data) !== canonicalJson(payload)) throw new Error('chart_payload_not_canonical');
}
export function validateEvent(event: EventInput): void {
  if (!object(event) || Object.keys(event).some(k => !['event_id','child_id','type','occurred_at','actor','cites','payload'].includes(k)) || !text(event.event_id) || event.event_id.length > 256 || !text(event.child_id) ||
      !EVENT_TYPES.includes(event.type) || !['child', 'parent', 'planner', 'creator', 'system', 'room'].includes(event.actor) ||
      typeof event.occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.occurred_at) ||
      !Number.isFinite(Date.parse(event.occurred_at)) || new Date(event.occurred_at).toISOString() !== event.occurred_at ||
      !Array.isArray(event.cites) || !event.cites.every(text) || new Set(event.cites).size !== event.cites.length) {
    throw new Error('chart_event_invalid');
  }
  validatePayload(event.type, event.payload);
  const type = event.type as FactType;
  if (!actors[type].includes(event.actor)) throw new Error('chart_actor_for_type');
  if (type !== 'child.profile_set' && event.event_id !== factId(type,event.payload)) throw new Error('chart_natural_key');
}
