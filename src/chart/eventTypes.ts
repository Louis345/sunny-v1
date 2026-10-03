import { canonicalJson } from './eventId';

export const EVENT_TYPES = [
  'spelling.cycle_created', 'spelling.cycle_transitioned',
  'child.profile_set', 'assignment.ingested', 'words.tagged', 'prediction.prior',
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
export type ChartEvent = EventInput & { recorded_at: string };

export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function date(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validatePayload(type: EventType, payload: unknown): asserts payload is Record<string, unknown> {
  if (!object(payload)) throw new Error('chart_payload_object');
  canonicalJson(payload);
  if (type === 'spelling.cycle_created' && (!object(payload.input) || payload.input.domain !== 'spelling' || !text(payload.input.homeworkId))) throw new Error('chart_cycle_creation_invalid');
  if (type === 'spelling.cycle_transitioned' && (!text(payload.homeworkId) || !Number.isInteger(payload.expectedRevision) || Number(payload.expectedRevision) < 1 || !object(payload.command) || !['evaluation_started', 'evaluation_attempted', 'evaluation_completed', 'targeted_planning_started', 'board_design_started', 'targeted_board_revealed', 'plan_reconciled', 'route_selected', 'instrument_observed', 'prediction_evaluations_recorded', 'artifact_bound', 'artifact_rejected', 'artifact_generation_attention_required', 'engagement_theory_updated', 'graded_work_received', 'returned_work_confirmed', 'theory_decided', 'block'].includes(String(payload.command.type)))) throw new Error('chart_cycle_command_invalid');
  if (type === 'child.profile_set') {
    if (!text(payload.displayName)) throw new Error('chart_profile_display_name');
    for (const key of ['interests', 'supportNeeds']) {
      if (key in payload && (!Array.isArray(payload[key]) || !(payload[key] as unknown[]).every(text))) throw new Error('chart_profile_' + key);
    }
    for (const key of ['companion', 'readingLevel']) if (key in payload && !text(payload[key])) throw new Error('chart_profile_' + key);
  }
  if (type === 'assignment.ingested') {
    if (!text(payload.assignmentId) || !Array.isArray(payload.words) || !payload.words.length ||
        !payload.words.every(text) || new Set(payload.words.map(word => word.trim().toLowerCase())).size !== payload.words.length ||
        !date(payload.testDate) || typeof payload.sourcePhotoHash !== 'string' || !/^[a-f0-9]{64}$/.test(payload.sourcePhotoHash)) {
      throw new Error('chart_assignment_invalid');
    }
  }
  if (type === 'correction.recorded' && (!text(payload.target_event_id) || !text(payload.reason) || !object(payload.replacement_payload))) {
    throw new Error('chart_correction_invalid');
  }
}
export function validateEvent(event: EventInput): void {
  if (!object(event) || !text(event.event_id) || event.event_id.length > 256 || !text(event.child_id) ||
      !EVENT_TYPES.includes(event.type) || !['child', 'parent', 'planner', 'creator', 'system', 'room'].includes(event.actor) ||
      typeof event.occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.occurred_at) ||
      !Number.isFinite(Date.parse(event.occurred_at)) || new Date(event.occurred_at).toISOString() !== event.occurred_at ||
      !Array.isArray(event.cites) || !event.cites.every(text) || new Set(event.cites).size !== event.cites.length) {
    throw new Error('chart_event_invalid');
  }
  validatePayload(event.type, event.payload);
  if (['child.profile_set', 'school_test.recorded'].includes(event.type) && event.actor !== 'parent') throw new Error('chart_actor_for_type');
  if (event.type.startsWith('spelling.cycle_') && event.actor !== 'system') throw new Error('chart_actor_for_type');
  if (event.type === 'assignment.ingested' && event.actor !== 'system') throw new Error('chart_actor_for_type');
  if (event.type === 'correction.recorded' && !['parent', 'system'].includes(event.actor)) throw new Error('chart_actor_for_type');
}
