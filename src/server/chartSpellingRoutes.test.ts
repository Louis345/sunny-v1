import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openChart, type ChartDatabase } from '../chart/db';
import { setupChartSpellingRoutes } from './chartSpellingRoutes';
let root: string, db: ChartDatabase, server: ReturnType<ReturnType<typeof express>['listen']>, base: string;
beforeEach(async () => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-http-')); db = openChart('synthetic-http', { chartDir: root }); const app = express(); app.use(express.json()); setupChartSpellingRoutes(app, { children: ['synthetic-http'], get: () => db, token: 'test-token', parentPin: '123456', provider: async () => { throw new Error('not requested'); } }); server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r)); base = `http://127.0.0.1:${(server.address() as any).port}`; });
afterEach(async () => { await new Promise<void>((r, j) => server.close(e => e ? j(e) : r())); db.close(); fs.rmSync(root, { recursive: true, force: true }); });
const headers = { 'content-type': 'application/json', 'x-sunny-kiosk-token': 'test-token', 'x-sunny-parent-pin': '123456' };
it('requires kiosk identity and explicit parent access; never accepts another child', async () => {
    expect((await fetch(base + '/api/spelling/synthetic-http/assignments')).status).toBe(401);
    expect((await fetch(base + '/api/spelling/synthetic-http/assignments', { method: 'POST', headers: { ...headers, 'x-sunny-parent-pin': '' }, body: '{}' })).status).toBe(403);
    expect((await fetch(base + '/api/spelling/reina/assignments', { headers })).status).toBe(404);
});
it('persists a confirmed assignment through the route and exposes truthful pending status', async () => {
    const r = await fetch(base + '/api/spelling/synthetic-http/assignments', { method: 'POST', headers, body: JSON.stringify({ words: ['knee', 'know'], testDate: '2026-10-10', sourceText: 'knee\nknow' }) });
    expect(r.status).toBe(200);
    const lists: any = await fetch(base + '/api/spelling/synthetic-http/assignments', { headers }).then(r => r.json());
    expect(lists[0]).toMatchObject({ stage: 'prior', total: 2 });
    expect(lists[0]).not.toHaveProperty('view');
    const legacy = await fetch(base + '/api/spelling/synthetic-http/facts', { method: 'POST', headers, body: JSON.stringify({ type: 'response.observed', correct: true }) });
    expect(legacy.status).toBe(404);
});
it('does not send the hidden canonical spelling to the measurement screen',async()=>{
 const {recordFact}=await import('../chart/spelling/record');
 recordFact(db,'assignment.ingested',{assignmentId:'hidden',words:['knee'],testDate:'2026-10-10',sourcePhotoHash:'a'.repeat(64)});
 recordFact(db,'words.tagged',{assignmentId:'hidden',taxonomyVersion:1,tags:[{word:'knee',patterns:['spelling.silent_letters']}]});
 recordFact(db,'prediction.prior',{assignmentId:'hidden',word:'knee',pCorrect:.5,confidence:.2,expectedError:'Unknown'});
 const r=await fetch(base+'/api/spelling/synthetic-http/assignments/hidden/present',{method:'POST',headers,body:'{}'});const item=await r.json();expect(r.status).toBe(200);expect(item).not.toHaveProperty('word');
});
