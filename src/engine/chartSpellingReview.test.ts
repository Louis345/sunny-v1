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
