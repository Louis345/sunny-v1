import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openChart, type ChartDatabase } from '../chart/db';
import { recordFact } from '../chart/spelling/record';
import { exportEvents } from '../chart/exportEvents';
let root: string;
let db: ChartDatabase;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-load-')); db = openChart('synthetic-load', { chartDir: root }); vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
const assignment = () => recordFact(db, 'assignment.ingested', { assignmentId: 'a', words: ['able'], testDate: '2026-10-09', sourcePhotoHash: 'a'.repeat(64) });
const item = (itemId: string) => recordFact(db, 'item.presented', { assignmentId: 'a', sessionId: 's', itemId, word: 'able', acceptedForms: ['able'], instrument: 'practice', role: 'practice', protocolVersion: 1, shown: { lettersVisible: false, hint: false, companionHelp: false } });
it('two processes append the same session responses without duplication or loss', async () => {
    assignment();
    for (let i = 0; i < 100; i++)
        item(String(i));
    const script = `const {openChart}=require('./src/chart/db');const {recordFact}=require('./src/chart/spelling/record');const {factId}=require('./src/chart/spelling/schemas');const db=openChart('synthetic-load',{chartDir:process.argv[1]});
 for(let i=0;i<100;i++){const p={assignmentId:'a',sessionId:'s',itemId:String(i),attempt:1,rawResponse:'able',status:'answered',support:{audioReplays:0,spellingShown:false,hint:false,companionHelp:false}};recordFact(db,'response.observed',p,{cites:[factId('item.presented',p)]});}db.close();`;
    const run = () => new Promise<void>((resolve, reject) => {
        const proc = spawn(process.execPath, ['--import', 'tsx', '-e', script, root], { stdio: 'ignore' });
        // once listeners end at child exit/error; process timeout prevents a stuck worker.
        const timer = setTimeout(() => { proc.kill(); reject(new Error('writer_timeout')); }, 15000);
        proc.once('error', error => { clearTimeout(timer); reject(error); });
        proc.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('writer_exit:' + code)); });
    });
    await Promise.all([run(), run()]);
    const responses = exportEvents(db).filter(e => e.type === 'response.observed');
    expect(responses).toHaveLength(100);
    expect(new Set(responses.map(e => e.event_id)).size).toBe(100);
    expect(db.sql.pragma('integrity_check', { simple: true })).toBe('ok');
}, 20000);
it('indexed appends remain below 250 ms after 10000 committed events', () => {
    assignment();
    for (let i = 0; i < 10000; i++)
        item(String(i));
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
        const start = performance.now();
        item('tail' + i);
        times.push(performance.now() - start);
    }
    console.info('chart load: 10000 events, append max ms=' + Math.max(...times).toFixed(2));
    expect(Math.max(...times)).toBeLessThan(250);
    const plan = db.sql.prepare("EXPLAIN QUERY PLAN SELECT * FROM events WHERE json_extract(payload,'$.assignmentId')=? AND type=?").all('a', 'response.observed');
    expect(JSON.stringify(plan)).toContain('events_assignment');
    expect(exportEvents(db)).toHaveLength(10021);
}, 30000);
