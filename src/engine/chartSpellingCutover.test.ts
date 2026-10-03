import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {writeWordBank} from '../utils/wordBankIO';import {writeLearningProfile} from '../utils/learningProfileIO';import {getChildChart} from '../profiles/childChart';import {createLearningCycle} from './learningCycleRepository';
let root:string;
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'spelling-cutover-'));vi.stubEnv('SUNNY_CONTEXT_ROOT',root);vi.stubEnv('SUNNY_SPELLING_CHART','1');});
afterEach(()=>{vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});});
it('refuses legacy word-bank, profile, cycle and chart paths in the activated kiosk',()=>{
 expect(()=>writeWordBank('synthetic-cutover',{childId:'synthetic-cutover',version:1,words:[]} as any)).toThrow('spelling_chart_legacy_path_disabled');
 expect(()=>writeLearningProfile('synthetic-cutover',{} as any)).toThrow('spelling_chart_legacy_path_disabled');
 expect(()=>createLearningCycle({childId:'synthetic-cutover',homeworkId:'hw-synthetic',domain:'spelling'} as any)).toThrow('spelling_chart_legacy_path_disabled');
 expect(()=>getChildChart('synthetic-cutover')).toThrow('spelling_chart_legacy_path_disabled');
 expect(fs.readdirSync(root)).toEqual([]);
});
