import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openChart, type ChartDatabase } from '../chart/db';
import { appendEvent } from '../chart/appendEvent';
import type { ChartEvent, EventInput } from '../chart/eventTypes';
import { recordFact } from '../chart/spelling/record';
import { exportEvents } from '../chart/exportEvents';
import { evaluatePriors, projectAssignment } from '../chart/spelling/projections';
import fixture from '../chart/spelling/fixtures/week1.events.json';
let root: string; let db: ChartDatabase;
const assignmentId = 'fixture-week1';
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-review-')); db = openChart('synthetic-review', { chartDir: root }); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); db.close(); fs.rmSync(root, { recursive: true, force: true }); });
function loadThrough(type: string) {
    for (const fact of fixture) {
        const { recorded_at, sequence, ...input } = fact;
        appendEvent(db, { ...input, child_id: db.childId } as EventInput);
        if (fact.type === type) break;
    }
}
function correct(target: ChartEvent, replacement: Record<string, unknown>) {
    return recordFact(db, 'correction.recorded', { target_event_id: target.event_id, reason: 'review regression', replacement_payload: replacement }, { cites: [target.event_id] });
}
it('refuses a forecast correction after the test but before returned results', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
    loadThrough('readiness.forecast');
    const forecast = exportEvents(db).find(e => e.type === 'readiness.forecast')!;
    vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
    expect(() => correct(forecast, { ...forecast.payload, probabilities: [{ word: 'able', pCorrect: 1 }, { word: 'knee', pCorrect: 1 }, { word: 'know', pCorrect: 1 }, { word: 'write', pCorrect: 1 }] })).toThrow('correction_immutable_prediction');
    expect(exportEvents(db).filter(e => e.type === 'correction.recorded')).toHaveLength(0);
});
it('cannot remove support or upgrade uncertain response status', () => {
    loadThrough('readiness.forecast');
    const assisted = exportEvents(db).find(e => e.type === 'response.observed' && (e.payload.support as any).hint)!;
    expect(() => correct(assisted, { ...assisted.payload, support: { ...(assisted.payload.support as object), hint: false } })).toThrow('correction_response_upgrade');
    const presented = exportEvents(db).find(e => e.type === 'item.presented')!;
    const uncertain = recordFact(db, 'response.observed', { assignmentId, sessionId: 'discovery', itemId: 'able', attempt: 2, rawResponse: 'able', status: 'ambiguous', support: { audioReplays: 0, spellingShown: false, hint: false, companionHelp: false } }, { cites: [presented.event_id] });
    expect(() => correct(uncertain, { ...uncertain.payload, status: 'answered' })).toThrow('correction_response_upgrade');
});
it('permits nulling an unreliable reading and adding previously missing assistance', () => {
    loadThrough('response.observed');
    const r = exportEvents(db).find(e => e.type === 'response.observed')!;
    correct(r, { ...r.payload, rawResponse: null, status: 'unknown', support: { ...(r.payload.support as object), companionHelp: true } });
    expect(projectAssignment(exportEvents(db), assignmentId).responses[0]).toMatchObject({ rawResponse: null, result: 'unknown', assistance: 'assisted', eligible: false });
});
it('cannot remove support added by an earlier correction', () => {
    loadThrough('response.observed');
    const r = exportEvents(db).find(e => e.type === 'response.observed')!;
    correct(r, { ...r.payload, support: { ...(r.payload.support as object), hint: true } });
    expect(() => correct(r, { ...r.payload, support: { ...(r.payload.support as object), audioReplays: 1 } })).toThrow('correction_has_dependents');
    expect(projectAssignment(exportEvents(db), assignmentId).responses[0]).toMatchObject({ assistance: 'assisted', eligible: false });
});
it('cannot restore a reading downgraded by an earlier correction', () => {
    loadThrough('response.observed');
    const r = exportEvents(db).find(e => e.type === 'response.observed')!;
    correct(r, { ...r.payload, rawResponse: null, status: 'unknown' });
    expect(() => correct(r, { ...r.payload, support: { ...(r.payload.support as object), audioReplays: 1 } })).toThrow('correction_has_dependents');
    expect(projectAssignment(exportEvents(db), assignmentId).responses[0]).toMatchObject({ rawResponse: null, result: 'unknown', eligible: false });
});
function plan(decisionIndex = 1) {
    const evaluation = evaluatePriors(exportEvents(db), assignmentId);
    const ids = evaluation.rows.map(r => r.responseId);
    return recordFact(db, 'plan.decided', { assignmentId, decisionIndex, action: 'collect_evidence', evaluationIds: [evaluation.id], responseIds: ids }, { cites: ids });
}
it('preserves original Planner decisions and requires the next decision index', () => {
    loadThrough('response.observed');
    const decision = plan();
    expect(() => correct(decision, { ...decision.payload, action: 'targeted_practice' })).toThrow('correction_immutable_decision');
    expect(() => plan(5)).toThrow('decision_sequence');
    expect(plan(2).payload.decisionIndex).toBe(2);
});
it('freezes pattern tags as soon as priors exist', () => {
    loadThrough('prediction.prior');
    const tags = exportEvents(db).find(e => e.type === 'words.tagged')!;
    expect(() => correct(tags, { ...tags.payload, tags: ['able', 'knee', 'know', 'write'].map(word => ({ word, patterns: ['spelling.irregular'] })) })).toThrow('tags_after_prior');
});
it('permits correcting draft pattern tags before priors', () => {
    loadThrough('words.tagged');
    const tags = exportEvents(db).find(e => e.type === 'words.tagged')!;
    correct(tags, { ...tags.payload, tags: ['able', 'knee', 'know', 'write'].map(word => ({ word, patterns: ['spelling.irregular'] })) });
    expect(projectAssignment(exportEvents(db), assignmentId).patterns[0].patterns).toEqual(['spelling.irregular']);
});
it('uses the assigned canonical word as the fixed accepted form in every presentation', () => {
    loadThrough('assignment.ingested');
    const presentation = fixture.find(e => e.type === 'item.presented')!.payload as any;
    expect(() => recordFact(db, 'item.presented', { ...presentation, acceptedForms: ['able', 'abl'] })).toThrow('accepted_forms_assignment');
    const recorded = recordFact(db, 'item.presented', presentation);
    expect(() => correct(recorded, { ...presentation, acceptedForms: ['able', 'abl'] })).toThrow('accepted_forms_assignment');
});
it.each(['audio_only', 'letters', 'hint', 'companion', 'practice', 'answered'] as const)('resumed Discovery preserves the evidence boundary after %s', prior => {
    loadThrough('prediction.prior');
    const base = fixture.find(e => e.type === 'item.presented')!.payload as any;
    const original = recordFact(db, 'item.presented', { ...base, instrument: prior === 'practice' ? 'practice' : 'discovery', role: prior === 'practice' ? 'practice' : 'measure', shown: { lettersVisible: prior === 'letters', hint: prior === 'hint', companionHelp: prior === 'companion' } });
    const resumed = recordFact(db, 'item.presented', { ...base, itemId: 'resumed' });
    const answer = fixture.find(e => e.type === 'response.observed')!.payload as any;
    // Also covers a late answer to the original prompt, committed after resume opened.
    if (prior === 'answered') recordFact(db, 'response.observed', answer, { cites: [original.event_id] });
    const r = recordFact(db, 'response.observed', { ...answer, itemId: 'resumed' }, { cites: [resumed.event_id] });
    const reading = projectAssignment(exportEvents(db), assignmentId).responses.find(x => x.eventId === r.event_id)!;
    expect(reading.eligible).toBe(prior === 'audio_only');
    if (prior === 'audio_only') expect(evaluatePriors(exportEvents(db), assignmentId).coverage.matched).toBe(1);
});
it('protects citation dependencies against direct SQL edits', () => {
    loadThrough('response.observed');
    const before = db.sql.prepare('SELECT * FROM event_citations ORDER BY source_id,target_id').all();
    expect(() => db.sql.exec('DELETE FROM event_citations')).toThrow('chart_citations_immutable');
    expect(() => db.sql.exec("UPDATE event_citations SET target_id='missing'")).toThrow('chart_citations_immutable');
    expect(db.sql.prepare('SELECT * FROM event_citations ORDER BY source_id,target_id').all()).toEqual(before);
});
it('refuses the earlier schema without silently adding new triggers', () => {
    db.sql.exec('UPDATE schema SET version=2'); db.close();
    const before = fs.readFileSync(db.path);
    let opened: ChartDatabase | undefined;
    try { expect(() => { opened = openChart('synthetic-review', { chartDir: root }); }).toThrow('chart_schema_unsupported'); }
    finally { opened?.close(); }
    expect(fs.readFileSync(db.path)).toEqual(before);
});
