import type { ChartDatabase } from './db';
import { canonicalJson } from './eventId';
import { type ChartEvent, type EventInput, validateEvent, validatePayload } from './eventTypes';
import { validateChartCycleEvent } from './spellingCycles';
import { decodeRow, exportEvents } from './exportEvents';

export function appendEvent(db: ChartDatabase, event: EventInput): ChartEvent {
  try {
    if (db.readonly) throw new Error('chart_readonly');
    validateEvent(event);
    if (event.child_id !== db.childId) throw new Error('chart_child_mismatch');
    // Recorded time belongs to the server and is deliberately excluded from retry identity.
    const input: EventInput = { event_id: event.event_id, child_id: event.child_id, type: event.type,
      occurred_at: event.occurred_at, actor: event.actor, cites: [...event.cites].sort(), payload: event.payload };
    const result = db.sql.transaction(() => {
      const lookup = db.sql.prepare('SELECT * FROM events WHERE event_id=?');
      const existing = lookup.get(input.event_id);
      if (existing) {
        const stored = decodeRow(existing);
        const { recorded_at: _recorded, ...comparable } = stored;
        if (canonicalJson(comparable) !== canonicalJson(input)) throw new Error('chart_event_conflict');
        return { stored, duplicate: true };
      }
      for (const citation of input.cites) if (!lookup.get(citation)) throw new Error('chart_citation_missing:' + citation);
      if (input.type === 'assignment.ingested' && exportEvents(db).some(event => event.type === 'assignment.ingested' && event.payload.assignmentId === input.payload.assignmentId)) throw new Error('chart_assignment_identity_conflict');
      if (input.type.startsWith('spelling.cycle_')) validateChartCycleEvent(input, exportEvents(db));
      if (input.type === 'correction.recorded') {
        const targetId = String(input.payload.target_event_id);
        if (!input.cites.includes(targetId)) throw new Error('chart_correction_citation');
        const target = decodeRow(lookup.get(targetId));
        if (target.type.startsWith('spelling.cycle_')) throw new Error('chart_cycle_correction_requires_new_command');
        if (target.type === 'assignment.ingested' && (input.payload.replacement_payload as Record<string, unknown>).assignmentId !== target.payload.assignmentId) throw new Error('chart_assignment_identity_immutable');
        if (target.type === 'assignment.ingested' && exportEvents(db).some(event => event.type === 'spelling.cycle_created' && event.cites.includes(targetId))) throw new Error('chart_bound_assignment_correction');
        if (target.type === 'correction.recorded') throw new Error('chart_correction_target');
        if (input.occurred_at < target.occurred_at) throw new Error('chart_correction_time');
        validatePayload(target.type, input.payload.replacement_payload);
      }
      const stored: ChartEvent = { ...input, recorded_at: new Date().toISOString() };
      db.sql.prepare('INSERT INTO events (event_id,child_id,type,occurred_at,recorded_at,actor,cites,payload) VALUES (?,?,?,?,?,?,?,?)')
        .run(stored.event_id, stored.child_id, stored.type, stored.occurred_at, stored.recorded_at, stored.actor,
          canonicalJson(stored.cites), canonicalJson(stored.payload));
      return { stored: JSON.parse(canonicalJson(stored)) as ChartEvent, duplicate: false };
    }).immediate();
    console.error(` 🎮 [chart] [append] [${result.duplicate ? 'duplicate' : 'ok'}] child=${db.childId} type=${input.type} id=${JSON.stringify(input.event_id)}`);
    return result.stored;
  } catch (error) {
    console.error(` 🎮 [chart] [append] [rejected] child=${db.childId} reason=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
