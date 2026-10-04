import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openChart, type ChartDatabase } from '../chart/db';
import { appendEvent } from '../chart/appendEvent';
import { exportEvents } from '../chart/exportEvents';
import { projectChart } from '../chart/buildChart';
let root: string;
let db: ChartDatabase;
const profile = (id: string, at: string) => ({ event_id: id, child_id: 'synthetic-order', type: 'child.profile_set' as const, actor: 'parent' as const, occurred_at: at, cites: [], payload: { displayName: id } });
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-order-')); db = openChart('synthetic-order', { chartDir: root }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
it('exports durable commit sequence despite backwards caller clocks', () => {
    appendEvent(db, profile('first', '2099-01-01T00:00:00.000Z'));
    appendEvent(db, profile('second', '2000-01-01T00:00:00.000Z'));
    const events = exportEvents(db);
    expect(events.map(e => e.event_id)).toEqual(['first', 'second']);
    expect(events.map(e => (e as any).sequence)).toEqual([1, 2]);
    db.sql.exec('VACUUM');
    expect(exportEvents(db)).toEqual(events);
    expect(projectChart(db.childId, events.reverse()).profile).toEqual({ displayName: 'second' });
});
it('ignores retry clock changes but preserves the original fact', () => {
    const first = appendEvent(db, profile('one', '2099-01-01T00:00:00.000Z'));
    expect(appendEvent(db, profile('one', '2000-01-01T00:00:00.000Z'))).toEqual(first);
});
it('rejects unspecified payload and envelope fields', () => {
    expect(() => appendEvent(db, { ...profile('one', '2000-01-01T00:00:00.000Z'), payload: { displayName: 'one', correct: true } })).toThrow();
    expect(() => appendEvent(db, { ...profile('one', '2000-01-01T00:00:00.000Z'), sequence: 55 } as any)).toThrow();
});
