import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openChart, type ChartDatabase } from '../chart/db';
import { appendEvent } from '../chart/appendEvent';
import { exportEvents } from '../chart/exportEvents';
import { recordFact, recordPriors } from '../chart/spelling/record';
import { projectAssignment, evaluatePriors, evaluateForecast, buildReportCard, buildPlannerPacket } from '../chart/spelling/projections';
let root: string;
let db: ChartDatabase;
const at = '2026-10-03T12:00:00.000Z';
const support = { audioReplays: 0, spellingShown: false, hint: false, companionHelp: false };
const words = ['able', 'knee', 'know', 'write'];
const assignment = (assignmentId = 'week1') => ({ assignmentId, words, testDate: '2026-10-09', sourcePhotoHash: 'a'.repeat(64) });
const fact = (type: any, payload: any, cites: string[] = [], actor?: any) => recordFact(db, type, payload, { occurred_at: at, cites, ...(actor ? { actor } : {}) });
function setup(id = 'week1') {
    const a = fact('assignment.ingested', assignment(id));
    fact('words.tagged', { assignmentId: id, taxonomyVersion: 1, tags: words.map(word => ({ word, patterns: ['spelling.silent_letters'] })) }, [a.event_id]);
    recordPriors(db, words.map(word => ({ assignmentId: id, word, pCorrect: 0.8, expectedError: 'uncertain', confidence: 0.5 })), { occurred_at: at, cites: [a.event_id] });
    return a;
}
function response(word: string, options: any = {}) {
    const assignmentId = options.assignmentId ?? 'week1';
    const sessionId = options.sessionId ?? assignmentId;
    const itemId = options.itemId ?? word;
    const instrument = options.instrument ?? 'discovery';
    const p = fact('item.presented', { assignmentId, sessionId, itemId, word, acceptedForms: [word], instrument, role: instrument === 'practice' ? 'practice' : 'measure', protocolVersion: 1, shown: { lettersVisible: false, hint: false, companionHelp: false } });
    return fact('response.observed', { assignmentId, sessionId, itemId, attempt: 1, rawResponse: options.rawResponse === undefined ? word : options.rawResponse, status: options.status ?? 'answered', support: { ...support, ...options.support } }, [p.event_id]);
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-core-')); db = openChart('synthetic-spelling', { chartDir: root }); vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
it('scores frozen forms, assistance per response, and separates unknown from wrong', () => {
    setup();
    response('able', { support: { audioReplays: 2 } });
    response('knee', { rawResponse: 'nee' });
    response('know', { support: { companionHelp: true } });
    response('write', { status: 'unknown', rawResponse: null });
    const v = projectAssignment(exportEvents(db), 'week1');
    expect(v.responses.map((r: any) => [r.result, r.assistance])).toEqual([['correct', 'unassisted'], ['incorrect', 'unassisted'], ['correct', 'assisted'], ['unknown', 'unassisted']]);
    const e = evaluatePriors(exportEvents(db), 'week1');
    expect(e.coverage).toEqual({ assigned: 4, predicted: 4, matched: 2 });
    expect(e.brier).toBeCloseTo(0.34);
});
it('rejects caller correctness and any prior after first Discovery response, regardless of client time', () => {
    const a = fact('assignment.ingested', assignment());
    const r = response('able');
    expect(() => fact('prediction.prior', { assignmentId: 'week1', word: 'knee', pCorrect: 0.5, confidence: 0.5, expectedError: 'unknown' }, [a.event_id])).toThrow('prior_after_discovery');
    expect(() => appendEvent(db, { ...r, event_id: 'fake', payload: { ...r.payload, correct: true } } as any)).toThrow();
});
it('retries at a different time are no-ops but natural-key conflicts are rejected', () => {
    const a = fact('assignment.ingested', assignment());
    expect(recordFact(db, 'assignment.ingested', assignment(), { occurred_at: '2099-01-01T00:00:00.000Z' })).toEqual(a);
    expect(() => fact('assignment.ingested', { ...assignment(), words: ['other'] })).toThrow('conflict');
});
it('forbids correction identity changes and changes to assignment after prior dependency', () => {
    const a = setup();
    expect(() => fact('correction.recorded', { target_event_id: a.event_id, reason: 'typo', replacement_payload: { ...assignment(), assignmentId: 'elsewhere' } }, [a.event_id])).toThrow();
    expect(() => fact('correction.recorded', { target_event_id: a.event_id, reason: 'typo', replacement_payload: { ...assignment(), words: ['other'] } }, [a.event_id])).toThrow();
});
it('does not turn a new session into fresh Discovery evidence', () => {
    setup();
    response('able', { instrument: 'practice' });
    response('able', { sessionId: 'new' });
    expect(evaluatePriors(exportEvents(db), 'week1').coverage.matched).toBe(0);
});
it('keeps batched priors atomic when one violates assignment membership', () => {
    fact('assignment.ingested', assignment());
    expect(() => recordPriors(db, ['able', 'absent'].map(word => ({ assignmentId: 'week1', word, pCorrect: 0.5, confidence: 0.5, expectedError: 'unknown' })), { occurred_at: at })).toThrow();
    expect(exportEvents(db).filter(e => e.type === 'prediction.prior')).toHaveLength(0);
});
it('three complete synthetic weeks produce reports and carry pattern history forward', () => {
    for (let week = 1; week <= 3; week++) {
        const id = 'week' + week;
        setup(id);
        response('able', { assignmentId: id });
        response('knee', { assignmentId: id, rawResponse: 'nee' });
        response('know', { assignmentId: id, support: { hint: true } });
        response('write', { assignmentId: id, status: week === 2 ? 'ambiguous' : 'unknown', rawResponse: null });
        const evaluation = evaluatePriors(exportEvents(db), id);
        fact('plan.decided', { assignmentId: id, decisionIndex: 1, action: 'targeted_practice', evaluationIds: [evaluation.id], responseIds: evaluation.rows.map((r: any) => r.responseId) }, evaluation.rows.map((r: any) => r.responseId));
        const recall = words.map(word => response(word, { assignmentId: id, instrument: 'recall_check', sessionId: id + 'recall' }));
        fact('readiness.forecast', { assignmentId: id, probabilities: words.map(word => ({ word, pCorrect: 0.75 })), uncertainty: 'small sample', missingEvidence: ['delayed recall'], responseIds: recall.map(r => r.event_id) }, recall.map(r => r.event_id));
        fact('school_test.recorded', { assignmentId: id, testDate: '2026-10-09', photoHash: 'b'.repeat(64), results: words.map((word, i) => ({ word, correct: i !== week, writtenResponse: null })) });
        expect(evaluateForecast(exportEvents(db), id).brier).toBeCloseTo(0.1875);
    }
    const events = exportEvents(db);
    const report = buildReportCard(events);
    expect(report.weeks).toHaveLength(3);
    expect(buildPlannerPacket(events, 'week2').patternHistory.length).toBeGreaterThan(0);
    const edited = structuredClone(events);
    const school = edited.find(e => e.type === 'school_test.recorded')!;
    (school.payload.results as any[])[0].correct = false;
    expect(buildReportCard(edited)).not.toEqual(report);
    expect(buildPlannerPacket(edited, 'week2')).not.toEqual(buildPlannerPacket(events, 'week2'));
    expect(buildReportCard([...events].reverse())).toEqual(report);
    expect(() => fact('readiness.forecast', { assignmentId: 'week1', probabilities: words.map(word => ({ word, pCorrect: 0.9 })), uncertainty: 'x', missingEvidence: [], responseIds: [] })).toThrow();
});
it('empty chart means no history', () => { expect(buildReportCard([]).weeks).toEqual([]); expect(projectAssignment([], 'absent').assignment).toBeNull(); });
it('plan can use assisted/unknown evidence, and cannot omit evaluated response dependencies', () => {
    setup();
    const unknown = response('able', { status: 'unknown', rawResponse: null });
    const ev = evaluatePriors(exportEvents(db), 'week1');
    expect(() => fact('plan.decided', { assignmentId: 'week1', decisionIndex: 1, action: 'collect_evidence', evaluationIds: [ev.id], responseIds: [unknown.event_id] }, [unknown.event_id])).not.toThrow();
});
it('correction cannot change presentation word identity or bypass response relationships', () => {
    setup();
    const p = fact('item.presented', { assignmentId: 'week1', sessionId: 's', itemId: 'i', word: 'able', acceptedForms: ['able'], instrument: 'discovery', role: 'measure', protocolVersion: 1, shown: { lettersVisible: false, hint: false, companionHelp: false } });
    expect(() => fact('correction.recorded', { target_event_id: p.event_id, reason: 'bad identity', replacement_payload: { ...p.payload, word: 'knee', acceptedForms: ['knee'] } }, [p.event_id])).toThrow('correction_identity');
});
it('corrections preserve decision-time projections and update subsequent reports', () => {
    setup();
    response('able');
    const school = fact('school_test.recorded', { assignmentId: 'week1', testDate: '2026-10-09', photoHash: 'b'.repeat(64), results: words.map(word => ({ word, correct: true, writtenResponse: null })) });
    const events = exportEvents(db);
    const cutoff = events.at(-1)!.sequence;
    const before = buildReportCard(events);
    fact('correction.recorded', { target_event_id: school.event_id, reason: 'parent transcription', replacement_payload: { ...school.payload, results: words.map(word => ({ word, correct: false, writtenResponse: null })) } }, [school.event_id]);
    expect(buildReportCard(exportEvents(db))).not.toEqual(before);
    expect(buildReportCard(exportEvents(db), cutoff)).toEqual(before);
});
it('reads a committed version-1 instrument fixture without a legacy reducer', () => {
    const events = JSON.parse(fs.readFileSync(path.resolve('src/chart/spelling/fixtures/week1.events.json'), 'utf8'));
    const prior = evaluatePriors(events, 'fixture-week1');
    expect(prior.coverage).toEqual({ assigned: 4, predicted: 4, matched: 2 });
    expect(prior.brier).toBeCloseTo(0.34);
    expect(evaluateForecast(events, 'fixture-week1').brier).toBeCloseTo(0.1875);
    expect(buildReportCard(events)).toEqual(buildReportCard(structuredClone(events).reverse()));
});
it('a school correction must still cover the assigned words', () => {
    setup();
    const s = fact('school_test.recorded', { assignmentId: 'week1', testDate: '2026-10-09', photoHash: 'a'.repeat(64), results: words.map(word => ({ word, correct: true, writtenResponse: null })) });
    expect(() => fact('correction.recorded', { target_event_id: s.event_id, reason: 'incomplete', replacement_payload: { ...s.payload, results: [{ word: 'unassigned', correct: true, writtenResponse: null }] } }, [s.event_id])).toThrow('school_coverage');
});
it('a response correction can downgrade reliability but cannot supply a different answer', () => {
    setup(); const r = response('able', { rawResponse: 'abl' });
    expect(() => fact('correction.recorded', { target_event_id: r.event_id, reason: 'transcription', replacement_payload: { ...r.payload, rawResponse: 'able' } }, [r.event_id])).toThrow('correction_response_upgrade');
    expect(() => fact('correction.recorded', { target_event_id: r.event_id, reason: 'capture unreliable', replacement_payload: { ...r.payload, status: 'ambiguous' } }, [r.event_id])).not.toThrow();
    expect(evaluatePriors(exportEvents(db), 'week1').coverage.matched).toBe(0);
    const evaluation = evaluatePriors(exportEvents(db), 'week1');
    expect(() => fact('plan.decided', { assignmentId: 'week1', decisionIndex: 1, action: 'collect_evidence', evaluationIds: [evaluation.id], responseIds: [r.event_id] }, [r.event_id])).not.toThrow();
});
it('a future instrument version is refused rather than rescored using current rules', () => {
    setup();
    response('able');
    const events = exportEvents(db);
    events.find(e => e.type === 'item.presented')!.payload.protocolVersion = 99;
    expect(() => projectAssignment(events, 'week1')).toThrow();
});
it('a response cannot cite a different item before its true presentation', () => {
    setup();
    const other = response('knee');
    const own = response('able');
    const input = exportEvents(db);
    const responseFact = input.find(e => e.event_id === own.event_id)!;
    responseFact.cites = [other.cites[0], own.cites[0]];
    expect(() => projectAssignment(input, 'week1')).toThrow('presentation');
});
it('a failed atomic prior batch never logs partial facts as committed', () => {
    fact('assignment.ingested', assignment());
    vi.mocked(console.error).mockClear();
    expect(() => recordPriors(db, ['able', 'absent'].map(word => ({ assignmentId: 'week1', word, pCorrect: 0.5, confidence: 0.5, expectedError: 'unknown' })), { occurred_at: at })).toThrow();
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).not.toContain('[ok]');
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('[rolled_back]');
});

it('preserves an unknown assignment test date without inventing a school outcome', () => {
    const input = { ...assignment('undated'), testDate: null };
    const first = fact('assignment.ingested', input);
    expect(fact('assignment.ingested', input).event_id).toBe(first.event_id);
    const view = projectAssignment(exportEvents(db), 'undated');
    expect(view.assignment?.testDate).toBeNull();
    expect(view.schoolResult).toBeNull();
    expect(evaluateForecast(exportEvents(db), 'undated').prospectiveStatus).toBe('unverified');
    expect(() => fact('school_test.recorded', { assignmentId:'undated', testDate:null, photoHash:'b'.repeat(64), results:words.map(word => ({word,correct:true,writtenResponse:null})) })).toThrow();
});
