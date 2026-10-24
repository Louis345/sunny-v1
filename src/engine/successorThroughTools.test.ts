import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
import {seedSpellingLab} from '../scripts/fixtures/spellingEvidenceFirst';
import {plainDraw,successorToolReply} from '../scripts/fixtures/successorToolConversation';
import {buildSpellingRecallItems} from './learningCycleIngest';
import {createLearningCycle} from './learningCycleRepository';
import {currentBoardInstance} from './learningBoardInstances';
import {prepareSuccessorBoard} from './canonicalProgressionGenerator';
import {resolveAdaptiveMathDraftDir} from './adaptiveMathDiscovery';
import {resolveChildContextDir} from '../utils/contextRoot';
import {strictBudget} from './plannerTransport';
import * as runtime from './learningCycleRuntime';
import * as canvas from './adventureBoardCanvas';

// Board 3 is the feedback loop: after she plays, the Planner decides and orders the next board.
// It now works through small locked tools, like Discovery and Teaching; nothing is sent back.
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const childId='tools-lab',homeworkId='lab-assignment',words=['write','island'];
const wordRadarConfig={recallMode:'hidden_word_recall',inputMode:'keyboard'};
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture(){
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'sunny-successor-tools-'));roots.push(rootDir);
 vi.stubEnv('SUNNY_CONTEXT_ROOT',path.join(rootDir,'src/context'));
 vi.stubGlobal('fetch',()=>{throw Error('lab_forbids_network');});
 seedSpellingLab(rootDir,words,'',childId);
 const items=buildSpellingRecallItems({homeworkId,words,evidenceIds:['school:lab'],measurementRole:'practice',exposure:'practiced',occasionId:'radar-check'});
 const evidenceContract={academic:true,engagement:true,companionObservations:true,spellingItems:Object.fromEntries(items.map(item=>[item.id,item])),nativeConfig:{activityId:'word-radar',wordRadarConfig}};
 const configFile=path.join(resolveAdaptiveMathDraftDir(childId,homeworkId,{rootDir}),'native-instruments','radar-check.json');
 const configuration={version:1,node:{id:'radar-check',type:'word-radar',activityId:'word-radar',targets:words,difficulty:1,title:'Radar Check',wordRadarConfig},evidenceContract};
 fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify(configuration));
 const localArtifactPath=`/${path.relative(resolveChildContextDir(childId,{rootDir}),configFile).split(path.sep).join('/')}`;
 createLearningCycle({childId,homeworkId,domain:'spelling',assignment:{title:'Lab assignment',contentFingerprint:'lab',capturedEvidenceIds:['school:lab'],targets:words},academicTheory:{theoryId:'lab-theory',revision:1,hypothesis:'Recall needs practice',supportCriteria:[],reviseCriteria:[],falsifyCriteria:[]},engagementTheory:null,boardDefinition:linearJourneyFixture(['radar-check']),initialLifecycle:'board_ready',nodes:[{
  nodeId:'radar-check',role:'baseline',title:'Radar Check',state:'ready',implementationType:'word-radar',academicTarget:{domain:'spelling',skill:'spelling',targets:words},algorithmOwner:'ai_tutor',theoryId:'lab-theory',experimentId:'radar-check',mechanic:'word-radar',theme:'world',openingScreen:{title:'Radar Check',purpose:'Check'},generationPrompt:null,
  artifactBinding:{contentId:`${homeworkId}:radar-check`,artifactId:`${homeworkId}:radar-check:native`,localArtifactPath,localArtworkPath:'/generated/world.jpeg',contractFingerprint:sha(configuration),validationStatus:'passed'},
  artwork:{status:'ready',localPath:'/generated/world.jpeg',prompt:null},sfxContract:[],companionContract:{events:[]},evidenceContract,evidenceIds:[],
 }]},{rootDir});
 runtime.recordCanonicalNodeCompletion({childId,homeworkId,nodeId:'radar-check',sessionId:'first-session',result:{completed:true,accuracy:0,timeSpent_ms:100,targetResults:items.map(item=>({target:item.id,correct:false,attemptedValue:'rite'}))}},{rootDir});
 // The recorded decision re-runs the proven radar and also asks for a brand-new game.
 const instrument=(nodeId:string)=>({nodeId,title:nodeId.split(':')[1],academicTarget:'Spelling',mechanic:'word-radar',theme:'world',openingPurpose:'Practice',spelling:{wordIds:items.map(item=>item.wordId),measurementRole:'practice',responseMode:'spelling_letters'}});
 const decision={status:'revised',reason:'Re-check with the proven radar.',progressionAction:'generate_support',preserve:[],change:[],testNext:[],nextEvidenceRequired:['Independent evidence'],predictionEvaluationIds:[],
  nextInstruments:[instrument(`${homeworkId}:radar-check`),instrument(`${homeworkId}:treasure-dig`)],boardDefinition:linearJourneyFixture([`${homeworkId}:radar-check`,`${homeworkId}:treasure-dig`])};
 const requests:any[]=[];
 const stream=vi.fn((payload:any)=>{requests.push(structuredClone(payload));return {finalMessage:async()=>successorToolReply(decision,payload)};});
 return {rootDir,items,requests,stream,request:{childId,homeworkId,client:{messages:{stream}} as never,draw:plainDraw}};
}

it('builds the next board through small locked tools, re-running only built-ins, with no correction stage',async()=>{
 const f=fixture(),opts={rootDir:f.rootDir};
 await runtime.advanceCanonicalCycleFromEvidence(f.request,opts);
 // A short conversation of locked tools, never the old single form.
 expect(f.stream).toHaveBeenCalledTimes(2);
 const tools=f.requests[0].tools;
 expect(tools.map((tool:any)=>tool.name)).toEqual(['decide','add_step','remove_step','set_order','add_choice','finish_board']);
 expect(tools.every((tool:any)=>tool.strict===true)).toBe(true);
 expect(strictBudget(tools).unsupported).toEqual([]);
 expect(f.requests[0].tool_choice).toEqual({type:'auto'});
 // The only built-in on offer is the proven radar; a brand-new game cannot be ordered at all.
 expect(tools.find((tool:any)=>tool.name==='add_step').input_schema.properties.built_in.enum).toEqual(['radar-check']);
 vi.spyOn(canvas,'verifyPreparingBoardCanvas').mockResolvedValue(undefined);
 const generateHtml=vi.fn(async()=>'<html></html>');
 const after=await prepareSuccessorBoard({childId,homeworkId,generateHtml,generateArtwork:async()=>'/generated/world.jpeg',validate:async()=>({passed:true,failures:[]})},opts);
 const board=currentBoardInstance(after);
 expect(board.kind).toBe('successor');
 const nodes=after.nodes.filter(node=>board.nodeIds.includes(node.nodeId));
 expect(nodes).toHaveLength(1);
 expect(nodes[0]).toMatchObject({implementationType:'word-radar',state:'ready'});
 expect(generateHtml).not.toHaveBeenCalled();
 // Every turn is a saved receipt; no correction or patch stage exists.
 const stages=fs.readdirSync(path.join(resolveChildContextDir(childId,{rootDir:f.rootDir}),'homework','cycles','.planner',homeworkId),{recursive:true}).map(String).filter(name=>name.endsWith('.stage.json'));
 expect(stages.some(name=>/-tools-turn-1\.stage\.json$/.test(name))).toBe(true);
 expect(stages.filter(name=>/correction|patch/.test(name))).toEqual([]);
});
