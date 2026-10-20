import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { prepareMondayPractice } from './prepareMondayPractice';
import { openChart } from '../chart/db';
import { exportEvents } from '../chart/exportEvents';

it('prepares only a fresh practice identity with no recorded answers and refuses overwrites',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'monday-practice-'));
 const chartDir=path.join(root,'charts');
 await prepareMondayPractice(root,chartDir);
 expect(Object.keys(JSON.parse(fs.readFileSync(path.join(root,'children.config.json'),'utf8')).childProfiles)).toEqual(['practice']);
 expect(fs.readdirSync(path.join(root,'src/context')).sort()).toEqual(['practice']);
 const db=openChart('practice',{chartDir});
 const events=exportEvents(db);db.close();
 expect(events.filter(e=>e.type==='assignment.ingested')).toHaveLength(1);
 expect(events.filter(e=>e.type==='response.observed')).toHaveLength(0);
 expect(events.filter(e=>e.type==='prediction.prior')).toHaveLength(6);
 await expect(prepareMondayPractice(root,chartDir)).rejects.toThrow('practice_setup_requires_fresh_directory');
});
