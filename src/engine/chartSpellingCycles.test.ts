import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openChart } from '../chart/db';
import { appendEvent } from '../chart/appendEvent';
import { eventId } from '../chart/eventId';
import { exportEvents } from '../chart/exportEvents';
import { createChartCycle, readChartCycles, transitionChartCycle } from '../chart/spellingCycles';
import { buildSpellingRecallItems, createSpellingDiscoveryCycle } from './learningCycleIngest';
import type { CreateLearningCycleInput, LearningCycleEvent } from './learningCycleRepository';

let root: string;
const child = 'synthetic-event-cycle';
const at = new Date('2026-10-02T12:00:00.000Z');
const homeworkId = 'synthetic-week';
let input: CreateLearningCycleInput;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sunny-chart-cycle-'));
  const items = buildSpellingRecallItems({ homeworkId, words: ['night', 'light'], evidenceIds: ['source-photo'], measurementRole: 'fresh_checkpoint' });
  const cycle = createSpellingDiscoveryCycle({ childId: child, homeworkId, title: 'School words', contentFingerprint: 'a'.repeat(64), items }, { rootDir: root, now: at });
  const { schemaVersion: _schema, revision: _revision, lifecycle, evidence: _evidence, decisionHistory: _decisions, evidenceSources: _sources, observations: _observations, predictionEvaluations: _evaluations, createdAt: _created, updatedAt: _updated, ...rest } = cycle;
  input = { ...rest, initialLifecycle: lifecycle };
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  const db = openChart(child, { chartDir: root });
  try {
    appendEvent(db, { event_id: 'profile', child_id: child, type: 'child.profile_set', occurred_at: at.toISOString(), actor: 'parent', cites: [], payload: { displayName: 'Synthetic Child' } });
    appendEvent(db, { event_id: 'assignment', child_id: child, type: 'assignment.ingested', occurred_at: at.toISOString(), actor: 'system', cites: ['profile'], payload: { assignmentId: homeworkId, words: ['night', 'light'], testDate: '2026-10-09', sourcePhotoHash: 'a'.repeat(64) } });
  } finally { db.close(); }
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const options = () => ({ chartDir: root, now: at });
const started = (): LearningCycleEvent => ({ type: 'evaluation_started', evaluationId: `${homeworkId}:discovery` });

describe('event-derived spelling cycles', () => {
  it('rebuilds the native cycle view after reopening, with no cycle JSON or mutable snapshot', () => {
    const created = createChartCycle(input, options());
    expect(created.revision).toBe(1);
    const updated = transitionChartCycle(child, homeworkId, 1, started(), options());
    expect(updated.lifecycle).toBe('evaluation_active');
    expect(readChartCycles(child, options())).toEqual([updated]);
    expect(fs.existsSync(path.join(root, 'src'))).toBe(false);
    const db = openChart(child, options());
    try {
      const events = exportEvents(db);
      expect(events.map(e => e.type).sort()).toEqual(['assignment.ingested', 'child.profile_set', 'spelling.cycle_created', 'spelling.cycle_transitioned'].sort());
      expect(events.find(e => e.type === 'spelling.cycle_transitioned')?.payload).toEqual({ homeworkId, expectedRevision: 1, command: started() });
      expect(events.find(e => e.type === 'spelling.cycle_transitioned')?.cites).toEqual([events.find(e => e.type === 'spelling.cycle_created')?.event_id]);
    } finally { db.close(); }
  });
  it('treats an identical retried command as one event, while rejecting competing writes at that revision', () => {
    createChartCycle(input, options());
    const updated = transitionChartCycle(child, homeworkId, 1, started(), options());
    expect(transitionChartCycle(child, homeworkId, 1, started(), { ...options(), now: new Date(at.getTime() + 5000) })).toEqual(updated);
    expect(() => transitionChartCycle(child, homeworkId, 1, { type: 'block', reason: 'competing delivery' }, options())).toThrow(/conflict/);
    expect(readChartCycles(child, options())[0].revision).toBe(2);
  });
  it('rolls back invalid lifecycle commands instead of appending poison events', () => {
    createChartCycle(input, options());
    expect(() => transitionChartCycle(child, homeworkId, 1, { type: 'evaluation_completed', evaluationId: `${homeworkId}:discovery`, completedAt: at.toISOString() }, options())).toThrow('learning_cycle_evaluation_evidence_missing');
    expect(readChartCycles(child, options())[0].revision).toBe(1);
  });
  it('does not infer event order from timestamp ties or import a legacy JSON cycle', () => {
    createChartCycle(input, options());
    transitionChartCycle(child, homeworkId, 1, started(), options());
    const poison = path.join(root, 'src/context', child, 'homework/cycles');
    fs.mkdirSync(poison, { recursive: true });
    fs.writeFileSync(path.join(poison, 'fake.json'), '{"schemaVersion":2,"domain":"spelling","observations":["invented"]}');
    expect(readChartCycles(child, options())).toHaveLength(1);
    expect(readChartCycles(child, options())[0].observations).toEqual([]);
  });
  it('requires the same confirmed assignment and refuses other domains', () => {
    expect(() => createChartCycle({ ...input, homeworkId: 'missing' }, options())).toThrow('chart_assignment_missing');
    expect(() => createChartCycle({ ...input, domain: 'math' }, options())).toThrow('chart_spelling_only');
    expect(() => createChartCycle({ ...input, assignment: { ...input.assignment, targets: ['invented'] } }, options())).toThrow('chart_assignment_mismatch');
  });
  it('enforces lifecycle validity at the single writer, including direct writes and corrections', () => {
    createChartCycle(input, options());
    const db = openChart(child, options());
    try {
      const created = exportEvents(db).find(e => e.type === 'spelling.cycle_created')!;
      const invalid = { event_id: 'invalid-direct-command', child_id: child, type: 'spelling.cycle_transitioned' as const, occurred_at: at.toISOString(), actor: 'system' as const, cites: [created.event_id], payload: { homeworkId, expectedRevision: 1, command: { type: 'invented', reason: 'Not a valid command' } } };
      expect(() => appendEvent(db, invalid)).toThrow('chart_cycle_command_invalid');
      expect(() => appendEvent(db, { ...invalid, event_id: 'wrong-predecessor', cites: ['assignment'], payload: { ...invalid.payload, command: started() } })).toThrow('chart_cycle_predecessor');
      expect(() => appendEvent(db, { ...invalid, event_id: 'bad-correction', type: 'correction.recorded', payload: { target_event_id: created.event_id, reason: 'Cannot rewrite a registration', replacement_payload: created.payload } })).toThrow('chart_cycle_correction_requires_new_command');
      expect(exportEvents(db)).toHaveLength(3);
    } finally { db.close(); }
  });
  it('does not let a no-op direct completion consume the next revision', () => {
    createChartCycle(input, options());
    const nodeId = `${homeworkId}:discovery`;
    const item = Object.values(input.nodes[0].evidenceContract.spellingItems!)[0];
    transitionChartCycle(child, homeworkId, 1, { type: 'evaluation_attempted', evaluationId: nodeId, nodeId, academicEvidence: [], engagementEvidence: [], companionObservations: [], observations: [{ observationId: 'answer', sourceId: `evaluation:${nodeId}`, itemId: item.id, constructLinks: [{ constructId: item.constructId, role: 'primary', confidence: 1 }], result: { correct: true, score: 1 }, assistance: { status: 'unassisted', scaffolds: [] }, exposure: 'unseen', provenance: 'independent_probe', observedAt: at.toISOString(), confounds: [] }] }, options());
    const complete: LearningCycleEvent = { type: 'evaluation_completed', evaluationId: nodeId, completedAt: at.toISOString() };
    transitionChartCycle(child, homeworkId, 2, complete, options());
    const db = openChart(child, options());
    try {
      const previous = exportEvents(db).find(e => e.type === 'spelling.cycle_transitioned' && e.payload.expectedRevision === 2)!;
      expect(() => appendEvent(db, { event_id: eventId('spelling.cycle_transitioned', { homeworkId, expectedRevision: 3 }), child_id: child, type: 'spelling.cycle_transitioned', occurred_at: at.toISOString(), actor: 'system', cites: [previous.event_id], payload: { homeworkId, expectedRevision: 3, command: complete } })).toThrow('chart_cycle_noop');
    } finally { db.close(); }
    expect(transitionChartCycle(child, homeworkId, 3, { type: 'block', reason: 'Explicit attention required' }, options()).revision).toBe(4);
  });
  it('preserves assignment facts frozen into a launched cycle when rejecting a generic correction', () => {
    createChartCycle(input, options());
    const db = openChart(child, options());
    try {
      const assignment = exportEvents(db).find(e => e.event_id === 'assignment')!;
      expect(() => appendEvent(db, { event_id: 'assignment-rewrite', child_id: child, type: 'correction.recorded', actor: 'parent', occurred_at: at.toISOString(), cites: ['assignment'], payload: { target_event_id: 'assignment', reason: 'Would silently contradict the frozen instrument', replacement_payload: { ...assignment.payload, words: ['different'] } } })).toThrow('chart_bound_assignment_correction');
    } finally { db.close(); }
  });
  it('binds a pre-publication correction consistently and cites the corrected source', () => {
    const db = openChart(child, options());
    try {
      const assignment = exportEvents(db).find(e => e.event_id === 'assignment')!;
      appendEvent(db, { event_id: 'source-correction', child_id: child, type: 'correction.recorded', actor: 'parent', occurred_at: at.toISOString(), cites: ['assignment'], payload: { target_event_id: 'assignment', reason: 'Correct photo identity before publication', replacement_payload: { ...assignment.payload, sourcePhotoHash: 'b'.repeat(64) } } });
    } finally { db.close(); }
    const corrected = { ...input, assignment: { ...input.assignment, contentFingerprint: 'b'.repeat(64) } };
    expect(createChartCycle(corrected, options()).assignment.contentFingerprint).toBe('b'.repeat(64));
    expect(readChartCycles(child, options())[0].assignment.contentFingerprint).toBe('b'.repeat(64));
    const reopened = openChart(child, options());
    try { expect(exportEvents(reopened).find(e => e.type === 'spelling.cycle_created')?.cites).toContain('source-correction'); }
    finally { reopened.close(); }
  });
  it('rejects another event attempting to redefine an existing assignment identity', () => {
    createChartCycle(input, options());
    const db = openChart(child, options());
    try {
      const original = exportEvents(db).find(e => e.event_id === 'assignment')!;
      expect(() => appendEvent(db, { ...original, event_id: 'same-assignment-new-id', payload: { ...original.payload, words: ['invented'] } })).toThrow('chart_assignment_identity_conflict');
    } finally { db.close(); }
    expect(readChartCycles(child, options())[0].assignment.targets).toEqual(['night', 'light']);
  });
  it('does not allow an unbound assignment correction to take over a bound identity', () => {
    createChartCycle(input, options());
    const db = openChart(child, options());
    try {
      const original = exportEvents(db).find(e => e.event_id === 'assignment')!;
      const other = { ...original, event_id: 'another-assignment', payload: { ...original.payload, assignmentId: 'other-week', words: ['other'] } };
      appendEvent(db, other);
      expect(() => appendEvent(db, { event_id: 'identity-takeover', child_id: child, type: 'correction.recorded', actor: 'parent', occurred_at: at.toISOString(), cites: [other.event_id], payload: { target_event_id: other.event_id, reason: 'Cannot rename another assignment', replacement_payload: { ...other.payload, assignmentId: homeworkId } } })).toThrow('chart_assignment_identity_immutable');
    } finally { db.close(); }
    expect(readChartCycles(child, options())[0].assignment.targets).toEqual(['night', 'light']);
  });
  it('does not backdate a transition before its registration chain', () => {
    createChartCycle(input, options());
    expect(() => transitionChartCycle(child, homeworkId, 1, started(), { ...options(), now: new Date(at.getTime() - 1) })).toThrow('chart_cycle_time');
  });
});
