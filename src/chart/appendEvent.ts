import type { ChartDatabase } from './db';
import { canonicalJson } from './eventId';
import { type ChartEvent, type EventInput, validateEvent, validatePayload } from './eventTypes';
import { decodeRow } from './exportEvents';
import { validateRelations } from './spelling/relations';

export function appendEvent(db: ChartDatabase, event: EventInput): ChartEvent {
  try {
    if (db.readonly) throw new Error('chart_readonly');
    validateEvent(event);
    if (event.child_id !== db.childId) throw new Error('chart_child_mismatch');
    // Recorded time belongs to the server and is deliberately excluded from retry identity.
    const input: EventInput = { event_id: event.event_id, child_id: event.child_id, type: event.type,
      occurred_at: event.occurred_at, actor: event.actor, cites: [...event.cites].sort(), payload: event.payload };
    const nested = db.sql.inTransaction;
    const result = db.sql.transaction(() => {
      const lookup = db.sql.prepare('SELECT * FROM events WHERE event_id=?');
      const existing = lookup.get(input.event_id);
      if (existing) {
        const stored = decodeRow(existing);
        const { recorded_at: _recorded, sequence: _sequence, occurred_at: _time, ...comparable } = stored;
        const { occurred_at: _inputTime, ...retry } = input;
        if (canonicalJson(comparable) !== canonicalJson(retry)) throw new Error('chart_event_conflict');
        return { stored, duplicate: true };
      }
      for (const citation of input.cites) if (!lookup.get(citation)) throw new Error('chart_citation_missing:' + citation);
      validateRelations(db, input);
      const stored = { ...input, recorded_at: new Date().toISOString() };
      const inserted = db.sql.prepare('INSERT INTO events (event_id,child_id,type,occurred_at,recorded_at,actor,cites,payload) VALUES (?,?,?,?,?,?,?,?)')
        .run(stored.event_id, stored.child_id, stored.type, stored.occurred_at, stored.recorded_at, stored.actor,
          canonicalJson(stored.cites), canonicalJson(stored.payload));
      const cite = db.sql.prepare('INSERT INTO event_citations (source_id,target_id) VALUES (?,?)');
      for (const id of stored.cites) cite.run(stored.event_id,id);
      return { stored: JSON.parse(canonicalJson({ ...stored, sequence: Number(inserted.lastInsertRowid) })) as ChartEvent, duplicate: false };
    }).immediate();
    console.error(` 🎮 [chart] [append] [${nested ? 'staged' : result.duplicate ? 'duplicate' : 'ok'}] child=${db.childId} type=${input.type} id=${JSON.stringify(input.event_id)}`);
    return result.stored;
  } catch (error) {
    console.error(` 🎮 [chart] [append] [rejected] child=${db.childId} reason=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
