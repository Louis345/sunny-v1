import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openKioskCharts } from '../chart/kioskLifecycle';
import { openChart } from '../chart/db';
import { appendEvent } from '../chart/appendEvent';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sunny-chart-startup-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
const real = (extra: NodeJS.ProcessEnv = {}) => ({ SUNNY_KIOSK_TOKEN: 'test-kiosk', SUNNY_MODE: 'real', ...extra });

it('requires an explicitly declared directory for the real kiosk', () => {
  expect(() => openKioskCharts(real())).toThrow('chart_dir_required');
});
it('opens both selectable family charts before readiness and closes each once', () => {
  const handles = [0, 1].map(() => ({ close: vi.fn() }));
  const open = vi.fn().mockReturnValueOnce(handles[0]).mockReturnValueOnce(handles[1]);
  const charts = openKioskCharts(real({ SUNNY_CHART_DIR: root }), open);
  expect(open.mock.calls.map(call => call[0])).toEqual(['ila', 'reina']);
  expect(charts.status()).toEqual({ connection: 'open', children: ['ila', 'reina'], learningEventsConnected: false });
  charts.close(); charts.close();
  expect(handles.map(handle => handle.close.mock.calls.length)).toEqual([1, 1]);
  expect(charts.status().connection).toBe('closed');
});
it('respects the resolved launch child rather than a stale environment child', () => {
  const open = vi.fn((_child: string) => ({ close: vi.fn() }));
  openKioskCharts(real({ SUNNY_CHART_DIR: root, SUNNY_CHILD: 'ila', SUNNY_RUNTIME_CONFIG: JSON.stringify({childId:'reina'}) }), open).close();
  expect(open.mock.calls.map(call => call[0])).toEqual(['reina']);
});
it.each([
  { SUNNY_MODE: 'as-child' }, { SUNNY_MODE: 'diag' }, { SUNNY_PREVIEW_MODE: 'free' },
  { SUNNY_CERTIFICATION_RUN_ID: 'synthetic-run' },
  { SUNNY_STATELESS: 'true' }, { SUNNY_TEST_MODE: 'true' }, { DEMO_MODE: 'true' },
])('never opens a family database for preview or simulation: %j', overrides => {
  const open = vi.fn();
  const charts = openKioskCharts(real({SUNNY_CHILD:'reina', SUNNY_CHART_DIR:root,...overrides}), open);
  expect(open).not.toHaveBeenCalled();
  expect(charts.status().connection).toBe('disabled');
});
it('leaves unconfigured non-kiosk servers alone', () => {
  const open = vi.fn(); expect(openKioskCharts({}, open).status().connection).toBe('disabled');
  expect(open).not.toHaveBeenCalled();
});
it('closes earlier connections and refuses startup when a later open fails', () => {
  const close = vi.fn(); const open = vi.fn().mockReturnValueOnce({ close }).mockImplementationOnce(() => { throw new Error('broken-db'); });
  expect(() => openKioskCharts(real({SUNNY_CHART_DIR:root}),open)).toThrow('broken-db');
  expect(close).toHaveBeenCalledTimes(1);
});
it('refuses a real chart inside a checkout before opening SQLite', () => {
  fs.mkdirSync(path.join(root,'.git'));
  expect(() => openKioskCharts(real({SUNNY_CHILD:'reina',SUNNY_CHART_DIR:root}))).toThrow('chart_checkout_refused');
  expect(fs.existsSync(path.join(root,'reina.db'))).toBe(false);
});
it('opens and reopens a synthetic chart without adding or rewriting events', () => {
  const child = 'synthetic-kiosk';
  const db = openChart(child,{chartDir:root});
  appendEvent(db,{event_id:'original',child_id:child,type:'child.profile_set',occurred_at:'2026-10-02T12:00:00.000Z',actor:'parent',cites:[],payload:{displayName:'Practice Child'}});
  db.close();
  const env=real({SUNNY_CHILD:child,SUNNY_CHART_DIR:root});
  for (let run=0;run<2;run++) {
    const lifecycle=openKioskCharts(env);expect(lifecycle.status().children).toEqual([child]);lifecycle.close();
  }
  const check=openChart(child,{chartDir:root,readonly:true});
  expect(check.sql.prepare('SELECT event_id FROM events').all()).toEqual([{event_id:'original'}]); check.close();
});
it('attempts every close and reports a failed connection when cleanup fails', () => {
  const second = vi.fn();
  const open = vi.fn().mockReturnValueOnce({close: () => { throw new Error('close-broken'); }}).mockReturnValueOnce({close:second});
  const charts = openKioskCharts(real({SUNNY_CHART_DIR:root}),open);
  expect(() => charts.close()).toThrow('chart_close_failed');
  expect(second).toHaveBeenCalledTimes(1);
  expect(charts.status().connection).toBe('failed');
});
