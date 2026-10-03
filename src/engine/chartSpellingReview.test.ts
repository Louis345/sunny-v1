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
