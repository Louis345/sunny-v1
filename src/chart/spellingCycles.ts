import { openChart, type ChartDatabase } from './db';
import type { ChartOptions } from './guard';
import { appendEvent } from './appendEvent';
import { correctedChartEvents } from './buildChart';
import { exportEvents } from './exportEvents';
import { canonicalJson, eventId } from './eventId';
import type { ChartEvent, EventInput } from './eventTypes';
import {
  reduceLearningCycleCreation, reduceLearningCycleTransition,
  type CreateLearningCycleInput, type LearningCycleEvent, type LearningCycleRecordV2,
} from '../engine/learningCycleRepository';

type Options = ChartOptions & { now?: Date };
type Head = { cycle: LearningCycleRecordV2; event: ChartEvent };

/** Commands, not saved cycle snapshots, are the authoritative facts. */
export function projectChartCycles(events: ChartEvent[]): Map<string, Head> {
  const heads = new Map<string, Head>();
  for (const event of events.filter(e => e.type === 'spelling.cycle_created')) {
    const input = event.payload.input as CreateLearningCycleInput;
    if (input.childId !== event.child_id || input.domain !== 'spelling') throw new Error('chart_cycle_identity');
    if (heads.has(input.homeworkId)) throw new Error('chart_cycle_duplicate_creation');
    heads.set(input.homeworkId, { cycle: reduceLearningCycleCreation(input, event.occurred_at), event });
  }
  // A predecessor revision, not timestamp sorting, determines committed order.
  const commands = events.filter(e => e.type === 'spelling.cycle_transitioned')
    .sort((a, b) => Number(a.payload.expectedRevision) - Number(b.payload.expectedRevision));
  for (const event of commands) {
    const head = heads.get(String(event.payload.homeworkId));
    if (!head || event.child_id !== head.cycle.childId || !event.cites.includes(head.event.event_id)) throw new Error('chart_cycle_predecessor');
    if (event.occurred_at < head.event.occurred_at) throw new Error('chart_cycle_time');
    const cycle = reduceLearningCycleTransition(head.cycle, Number(event.payload.expectedRevision), event.payload.command as LearningCycleEvent, event.occurred_at);
    heads.set(cycle.homeworkId, { cycle, event });
  }
  return heads;
}

export function readChartCycles(childId: string, opts: ChartOptions = {}): LearningCycleRecordV2[] {
  const db = openChart(childId, { ...opts, readonly: true });
  try { return [...projectChartCycles(exportEvents(db)).values()].map(head => head.cycle); }
  finally { db.close(); }
}

function write<T>(childId: string, opts: Options, fn: (db: ChartDatabase, events: ChartEvent[], at: string) => T): T {
  const db = openChart(childId, opts);
  try { return db.sql.transaction(() => fn(db, exportEvents(db), (opts.now ?? new Date()).toISOString())).immediate(); }
  finally { db.close(); }
}

export function createChartCycle(input: CreateLearningCycleInput, opts: Options = {}): LearningCycleRecordV2 {
  if (input.domain !== 'spelling') throw new Error('chart_spelling_only');
  return write(input.childId, opts, (db, events, at) => {
    const assignment = correctedChartEvents(input.childId, events).find(e => e.type === 'assignment.ingested' && e.payload.assignmentId === input.homeworkId);
    if (!assignment) throw new Error('chart_assignment_missing');
    if (canonicalJson(assignment.payload.words) !== canonicalJson(input.assignment.targets) || assignment.payload.sourcePhotoHash !== input.assignment.contentFingerprint) throw new Error('chart_assignment_mismatch');
    if (at < assignment.occurred_at) throw new Error('chart_cycle_time');
    const existing = events.find(e => e.type === 'spelling.cycle_created' && (e.payload.input as CreateLearningCycleInput).homeworkId === input.homeworkId);
    if (existing) {
      if (canonicalJson(existing.payload.input) !== canonicalJson(input)) throw new Error('chart_cycle_creation_conflict');
      return projectChartCycles(events).get(input.homeworkId)!.cycle;
    }
    const cycle = reduceLearningCycleCreation(input, at);
    appendEvent(db, { event_id: eventId('spelling.cycle_created', { homeworkId: input.homeworkId }), child_id: input.childId,
      type: 'spelling.cycle_created', occurred_at: at, actor: 'system', cites: [assignment.event_id, ...events.filter(e => e.type === 'correction.recorded' && e.payload.target_event_id === assignment.event_id).map(e => e.event_id)], payload: { input } });
    return cycle;
  });
}

export function transitionChartCycle(childId: string, homeworkId: string, expectedRevision: number, command: LearningCycleEvent, opts: Options = {}): LearningCycleRecordV2 {
  return write(childId, opts, (db, events, at) => {
    const head = projectChartCycles(events).get(homeworkId);
    if (!head) throw new Error('chart_cycle_missing');
    const payload = { homeworkId, expectedRevision, command };
    const id = eventId('spelling.cycle_transitioned', { homeworkId, expectedRevision });
    const existing = events.find(e => e.event_id === id);
    if (existing) {
      if (canonicalJson(existing.payload) !== canonicalJson(payload)) throw new Error('chart_cycle_revision_conflict');
      return head.cycle;
    }
    if (at < head.event.occurred_at) throw new Error('chart_cycle_time');
    const cycle = reduceLearningCycleTransition(head.cycle, expectedRevision, command, at);
    if (cycle === head.cycle) return cycle;
    appendEvent(db, { event_id: id, child_id: childId, type: 'spelling.cycle_transitioned', occurred_at: at,
      actor: 'system', cites: [head.event.event_id], payload });
    return cycle;
  });
}

/** Called by appendEvent inside its write transaction, including direct callers. */
export function validateChartCycleEvent(event: EventInput, events: ChartEvent[]): void {
  const heads = projectChartCycles(events);
  if (event.type === 'spelling.cycle_created') {
    const input = event.payload.input as CreateLearningCycleInput;
    if (input.childId !== event.child_id || input.domain !== 'spelling') throw new Error('chart_cycle_identity');
    const assignment = correctedChartEvents(input.childId, events).find(e => e.type === 'assignment.ingested' && e.payload.assignmentId === input.homeworkId);
    if (!assignment || !event.cites.includes(assignment.event_id)) throw new Error('chart_assignment_missing');
    if (canonicalJson(assignment.payload.words) !== canonicalJson(input.assignment.targets) || assignment.payload.sourcePhotoHash !== input.assignment.contentFingerprint) throw new Error('chart_assignment_mismatch');
    if (event.occurred_at < assignment.occurred_at) throw new Error('chart_cycle_time');
    if (events.some(e => e.type === 'correction.recorded' && e.payload.target_event_id === assignment.event_id && !event.cites.includes(e.event_id))) throw new Error('chart_assignment_correction_citation');
    if (heads.has(input.homeworkId)) throw new Error('chart_cycle_creation_conflict');
    if (event.event_id !== eventId(event.type, { homeworkId: input.homeworkId })) throw new Error('chart_cycle_event_id');
    reduceLearningCycleCreation(input, event.occurred_at);
  } else {
    const homeworkId = String(event.payload.homeworkId);
    const expectedRevision = Number(event.payload.expectedRevision);
    const head = heads.get(homeworkId);
    if (!head || !event.cites.includes(head.event.event_id)) throw new Error('chart_cycle_predecessor');
    if (event.occurred_at < head.event.occurred_at) throw new Error('chart_cycle_time');
    if (event.event_id !== eventId(event.type, { homeworkId, expectedRevision })) throw new Error('chart_cycle_event_id');
    if (reduceLearningCycleTransition(head.cycle, expectedRevision, event.payload.command as LearningCycleEvent, event.occurred_at) === head.cycle) throw new Error('chart_cycle_noop');
  }
}
