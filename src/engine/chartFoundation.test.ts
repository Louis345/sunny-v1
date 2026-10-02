import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { openChart, type ChartDatabase } from '../chart/db';
import { appendEvent } from '../chart/appendEvent';
import { eventId } from '../chart/eventId';
import { buildChart, projectChart } from '../chart/buildChart';
import { exportEvents } from '../chart/exportEvents';
import { snapshotChart } from '../chart/snapshot';

const child = 'synthetic-chart';
const at = '2026-10-02T12:00:00.000Z';
const profile = (id = 'profile-1', displayName = 'Practice Child') => ({
  event_id: id, child_id: child, type: 'child.profile_set' as const,
  occurred_at: at, actor: 'parent' as const, cites: [], payload: { displayName },
});
let root: string;
let db: ChartDatabase;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sunny-chart-')); db = openChart(child, { chartDir: root }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe('isolated append-only chart', () => {
  it('exports factual events and derives profile and assignment', () => {
    appendEvent(db, profile());
    appendEvent(db, { ...profile('assignment'), type: 'assignment.ingested', actor: 'system', cites: ['profile-1'],
      payload: { assignmentId: 'week-1', words: ['able', 'again'], testDate: '2026-10-09', sourcePhotoHash: 'a'.repeat(64) } });
    expect(exportEvents(db)).toHaveLength(2);
    const chart = buildChart(child, { chartDir: root });
    expect(chart.eventCount).toBe(2);
    expect(chart.profile).toEqual({ displayName: 'Practice Child' });
    expect(chart.assignments[0].words).toEqual(['able', 'again']);
    expect(db.sql.pragma('journal_mode', { simple: true })).toBe('wal');
  });
  it('identical retry preserves the original recorded timestamp and rejects conflicting content', () => {
    const first = appendEvent(db, profile());
    expect(appendEvent(db, profile())).toEqual(first);
    expect(() => appendEvent(db, profile('profile-1', 'Changed'))).toThrow('chart_event_conflict');
    expect(exportEvents(db)).toHaveLength(1);
  });
  it('rejects SQL UPDATE, DELETE and INSERT OR REPLACE', () => {
    appendEvent(db, profile());
    expect(() => db.sql.exec("UPDATE events SET payload='{}'")).toThrow();
    expect(() => db.sql.exec('DELETE FROM events')).toThrow();
    expect(() => db.sql.exec('INSERT OR REPLACE INTO events SELECT * FROM events')).toThrow();
    expect(exportEvents(db).find(event => event.event_id === 'profile-1')?.payload).toEqual({ displayName: 'Practice Child' });
  });
  it.each([
    { cites: ['missing'] }, { type: 'invented' }, { actor: 'intruder' },
    { child_id: 'other-child' }, { occurred_at: 'not-a-date' }, { payload: [] },
    { payload: { displayName: '' } }, { payload: { displayName: 'x', bad: Number.NaN } },
  ])('rejects invalid or wrongly attributed event %j', (change) => {
    expect(() => appendEvent(db, { ...profile(), ...change } as any)).toThrow();
    expect(exportEvents(db)).toHaveLength(0);
  });
  it('validates assignment words, test date and source identity', () => {
    expect(() => appendEvent(db, { ...profile(), type: 'assignment.ingested', actor: 'system',
      payload: { assignmentId: 'w', words: [], testDate: '2026-02-30', sourcePhotoHash: 'bad' } })).toThrow();
  });
  it('records a correction without editing the original and applies it on replay', () => {
    appendEvent(db, profile());
    appendEvent(db, { ...profile('fix'), type: 'correction.recorded', cites: ['profile-1'],
      payload: { target_event_id: 'profile-1', reason: 'Typo', replacement_payload: { displayName: 'Corrected Child' } } });
    expect(exportEvents(db).find(event => event.event_id === 'profile-1')?.payload).toEqual({ displayName: 'Practice Child' });
    expect(buildChart(child, { chartDir: root }).profile).toEqual({ displayName: 'Corrected Child' });
    expect(() => appendEvent(db, { ...profile('bad-fix'), type: 'correction.recorded', cites: [],
      payload: { target_event_id: 'profile-1', reason: 'Missing citation', replacement_payload: {} } })).toThrow();
  });
  it('replays deterministically from event time and identity, independent of input order', () => {
    const first = appendEvent(db, profile('a'));
    const second = appendEvent(db, { ...profile('b', 'Later'), occurred_at: '2026-10-03T12:00:00.000Z' });
    expect(projectChart(child, [second, first])).toEqual(projectChart(child, [first, second]));
    expect(projectChart(child, [second, first]).profile).toEqual({ displayName: 'Later' });
  });
  it('stable IDs ignore object key order and bound recursive JSON depth', () => {
    expect(eventId('test', { a: 1, b: 2 })).toBe(eventId('test', { b: 2, a: 1 }));
    let value: any = 'leaf';
    for (let i = 0; i < 11; i++) value = { next: value };
    expect(() => eventId('test', value)).toThrow('chart_json_depth');
  });
  it('rejects sparse arrays instead of silently giving them empty-array identities', () => {
    expect(() => eventId('test', new Array(1))).toThrow('chart_json_invalid');
    expect(() => appendEvent(db, { ...profile(), payload: { displayName: 'Synthetic', evidence: new Array(1) } })).toThrow('chart_json_invalid');
    expect(exportEvents(db)).toHaveLength(0);
  });
  it('does not create a database when reading a missing chart', () => {
    expect(() => buildChart('absent', { chartDir: root })).toThrow();
    expect(fs.existsSync(path.join(root, 'absent.db'))).toBe(false);
  });
  it('binds a database to its child even when copied under another name', () => {
    appendEvent(db, profile());
    db.sql.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(db.path, path.join(root, 'other.db'));
    expect(() => openChart('other', { chartDir: root })).toThrow('chart_child_mismatch');
  });
  it('guards real children, git worktree files, symlink directories, and database symlinks', () => {
    expect(() => openChart('reina', { chartDir: root, env: {} })).toThrow('chart_dir_required');
    const repo = path.join(root, 'repo'); fs.mkdirSync(repo); fs.writeFileSync(path.join(repo, '.git'), 'gitdir: elsewhere');
    expect(() => openChart('reina', { env: { SUNNY_CHART_DIR: repo } })).toThrow('chart_checkout_refused');
    const alias = path.join(root, 'alias'); fs.symlinkSync(repo, alias);
    expect(() => openChart('reina', { env: { SUNNY_CHART_DIR: alias } })).toThrow('chart_checkout_refused');
    fs.symlinkSync(db.path, path.join(root, 'reina.db'));
    expect(() => openChart('reina', { env: { SUNNY_CHART_DIR: root } })).toThrow('chart_database_symlink');
    fs.unlinkSync(path.join(root, 'reina.db'));
    const allowed = openChart('reina', { env: { SUNNY_CHART_DIR: root } }); allowed.close();
    expect(() => openChart('../escape', { chartDir: root })).toThrow('chart_child_id');
  });
  it('takes a consistent read-only snapshot with matching metadata and refuses overwrite', async () => {
    appendEvent(db, profile());
    const out = path.join(root, 'snapshot.db');
    await snapshotChart(db, out);
    const snapshot = openChart(child, { snapshot: out });
    try {
      expect(exportEvents(snapshot)).toEqual(exportEvents(db));
      expect(() => appendEvent(snapshot, profile('no-write'))).toThrow('chart_readonly');
      expect(() => snapshot.sql.exec('CREATE TABLE unwanted (id)')).toThrow();
    } finally { snapshot.close(); }
    const metadata = JSON.parse(fs.readFileSync(out + '.meta.json', 'utf8'));
    expect(metadata.eventCount).toBe(1);
    expect(metadata.sourcePath).toBe(db.path);
    expect(metadata.sourceHost).toBe(os.hostname());
    await expect(snapshotChart(db, out)).rejects.toThrow('chart_snapshot_exists');
  });
  it('two separate processes commit all 400 events exactly once', async () => {
    const script = `const {openChart}=require('./src/chart/db'); const {appendEvent}=require('./src/chart/appendEvent');
      const db=openChart('${child}',{chartDir:process.argv[1]});
      for(let i=0;i<200;i++) appendEvent(db,{event_id:process.argv[2]+i,child_id:'${child}',type:'session.started',occurred_at:'${at}',actor:'system',cites:[],payload:{}});db.close();`;
    const run = (prefix: string) => new Promise<void>((resolve, reject) => {
      const proc = spawn(process.execPath, ['--import', 'tsx', '-e', script, root, prefix], { stdio: 'ignore' });
      // once listeners terminate on the child's single error/exit; no persistent listener loop.
      proc.once('error', reject);
      proc.once('exit', (code) => code === 0 ? resolve() : reject(new Error('writer_exit:' + code)));
    });
    await Promise.all([run('left-'), run('right-')]);
    expect(exportEvents(db)).toHaveLength(400);
    expect(db.sql.pragma('integrity_check', { simple: true })).toBe('ok');
  }, 20_000);

  it('an interrupted transaction leaves no partial event and the database remains usable', () => {
    appendEvent(db, profile());
    const script = `const {openChart}=require('./src/chart/db'); const {appendEvent}=require('./src/chart/appendEvent');
      const db=openChart('${child}',{chartDir:process.argv[1]}); db.sql.exec('BEGIN IMMEDIATE');
      appendEvent(db,{event_id:'interrupted',child_id:'${child}',type:'session.started',occurred_at:'${at}',actor:'system',cites:[],payload:{}});
      process.exit(17);`;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script, root], { timeout: 10_000 });
    expect(result.status).toBe(17);
    expect(exportEvents(db).map(event => event.event_id)).toEqual(['profile-1']);
    appendEvent(db, profile('after-crash'));
    expect(exportEvents(db)).toHaveLength(2);
    expect(db.sql.pragma('integrity_check', { simple: true })).toBe('ok');
  });
});
