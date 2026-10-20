import { openChart } from './db';
import type { ChartOptions } from './guard';
import type { ChartEvent } from './eventTypes';
import { exportEvents } from './exportEvents';

export function projectChart(childId: string, input: ChartEvent[]) {
  if (input.some(event => event.child_id !== childId)) throw new Error('chart_child_mismatch');
  const events = [...input].sort((a,b) => a.sequence - b.sequence);
  const corrections = new Map<string, Record<string, unknown>>();
  for (const event of events) if (event.type === 'correction.recorded') corrections.set(String(event.payload.target_event_id), event.payload.replacement_payload as Record<string, unknown>);
  let profile: Record<string, unknown> | null = null;
  const assignments = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    const payload = corrections.get(event.event_id) ?? event.payload;
    if (event.type === 'child.profile_set') profile = payload;
    if (event.type === 'assignment.ingested') assignments.set(String(payload.assignmentId), payload);
  }
  return structuredClone({ childId, eventCount: events.length, profile, assignments: [...assignments.values()], lastEventTime: events.at(-1)?.occurred_at ?? null });
}
export function buildChart(childId: string, opts: ChartOptions = {}) {
  const db = openChart(childId, { ...opts, readonly: true });
  try { return projectChart(childId, exportEvents(db)); } finally { db.close(); }
}

/** Subject-neutral chart doorway for the activated typed-fact departments. */
export function readTypedChildChart(childId: string, opts: { database: import('./db').ChartDatabase }) {
  if (opts.database.childId !== childId) throw new Error('chart_child_mismatch');
  const events = exportEvents(opts.database);
  return { ...projectChart(childId, events), events };
}
