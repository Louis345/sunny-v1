import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {getLearningCycle} from '../engine/learningCycleRepository';
import {currentBoardInstance} from '../engine/learningBoardInstances';
import {prepareSuccessorBoard} from '../engine/canonicalProgressionGenerator';
import * as runtime from '../engine/learningCycleRuntime';
import * as canvas from '../engine/adventureBoardCanvas';
import {DEMO_CHILD_ID,DEMO_HOMEWORK_ID,freeDemoPlannerFor,seedQuestBossDemo} from './questBossDemo';
import {getChildChart} from '../profiles/childChart';
import {seedSpellingLab} from './fixtures/spellingEvidenceFirst';

// Owner, 2026-11-05: "I want to see it before the kids see it", without paying for generation. The demo
// child gets a Quest board on filler words, and every Planner decision after it is answered by code,
// exactly the way the kiosk route asks (no client passed), so the ceremony, Quest, Boss and drop can be
// played on the real kiosk for free.
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});

function lab(){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-demo-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubEnv('ANTHROPIC_API_KEY','');
 vi.stubGlobal('fetch',()=>{throw Error('demo_forbids_network');});
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 // The demo child's profile, as it already exists in the repo.
 seedSpellingLab(rootDir,['rocket'],'',DEMO_CHILD_ID);
 return {rootDir,opts:{rootDir}};
}
const play=(opts:{rootDir:string},nodeId:string,session:string)=>{
 const cycle=getLearningCycle(DEMO_CHILD_ID,DEMO_HOMEWORK_ID,opts)!;
 const own=Object.values(cycle.nodes.find(row=>row.nodeId===nodeId)!.evidenceContract.spellingItems!);
 own.forEach((item,index)=>runtime.recordSpellingDiscoveryAttempt({childId:DEMO_CHILD_ID,homeworkId:DEMO_HOMEWORK_ID,attempt:{attemptId:`${session}-${index}`,itemId:item.id,attemptedValue:item.word,observedAt:new Date().toISOString()},support:{status:'unassisted',scaffolds:[]}},opts));
 return runtime.recordCanonicalNodeCompletion({childId:DEMO_CHILD_ID,homeworkId:DEMO_HOMEWORK_ID,nodeId,sessionId:session,result:{completed:true,accuracy:1,timeSpent_ms:100,targetResults:own.map(item=>({target:item.id,correct:true,attemptedValue:item.word}))}},opts)!;
};
const encounter=(cycle:any,role:string)=>cycle.nodes.find((row:any)=>currentBoardInstance(cycle).nodeIds.includes(row.nodeId)&&row.role===role)!;

it('seeds the demo child a Quest board and plays it through Boss for free',async()=>{
 const {rootDir,opts}=lab();
 const seeded=await seedQuestBossDemo({rootDir});
 expect(seeded.lifecycle).toBe('quest_ready');
 // The kiosk opens this homework for her.
 const current=JSON.parse(fs.readFileSync(path.join(rootDir,'src/context',DEMO_CHILD_ID,'homework','current.json'),'utf8'));
 expect(current.current.homeworkId).toBe(DEMO_HOMEWORK_ID);
 expect(getChildChart(DEMO_CHILD_ID,{rootDir}).learningCycle?.homeworkId).toBe(DEMO_HOMEWORK_ID);
 // The route asks with no client: the demo answers in code.
 expect(play(opts,encounter(seeded,'quest').nodeId,'quest').lifecycle).toBe('quest_evaluating');
 await runtime.advanceCanonicalCycleFromEvidence({childId:DEMO_CHILD_ID,homeworkId:DEMO_HOMEWORK_ID},opts);
 const boss=await prepareSuccessorBoard({childId:DEMO_CHILD_ID,homeworkId:DEMO_HOMEWORK_ID},opts);
 expect(boss.lifecycle).toBe('boss_ready');
 expect(play(opts,encounter(boss,'boss').nodeId,'boss').lifecycle).toBe('boss_evaluating');
 const done=await runtime.advanceCanonicalCycleFromEvidence({childId:DEMO_CHILD_ID,homeworkId:DEMO_HOMEWORK_ID},opts);
 expect(done.lifecycle).toBe('awaiting_calibration');
 // Resetting starts the demo over at the Quest board.
 expect((await seedQuestBossDemo({rootDir})).lifecycle).toBe('quest_ready');
});

it('never answers for a real child',()=>{
 for(const child of ['ila','reina']) expect(freeDemoPlannerFor(child,DEMO_HOMEWORK_ID)).toBeUndefined();
});
