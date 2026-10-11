import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import {verifyAuthoredBoardCanvas} from './adventureBoardCanvas';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
it('requires real rendered geometry before publishing an authored candidate',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sunny-canvas-gate-'));
 try {
  const definition=linearJourneyFixture(['learn','check']);
  const proof=await verifyAuthoredBoardCanvas({definition,directory,rootDir:process.cwd()});
  expect(proof.viewports).toContain('768x1024');expect(proof.screenshots).toHaveLength(3);
  expect((await verifyAuthoredBoardCanvas({definition,directory,rootDir:process.cwd()})).definitionHash).toBe(proof.definitionHash);
  definition.portals[1].position=structuredClone(definition.portals[2].position);
  await expect(verifyAuthoredBoardCanvas({definition,directory,rootDir:process.cwd()})).rejects.toThrow('board_canvas_invalid');
 }finally{rmSync(directory,{recursive:true,force:true});}
},20000);

it('refuses to publish the initial Discovery canvas when authored controls overlap',async()=>{
 const {publishDiscoveryExperience}=await import('./adaptiveMathDiscovery');
 const {existsSync}=await import('node:fs');
 const rootDir=mkdtempSync(join(tmpdir(),'sunny-initial-canvas-'));
 const definition=linearJourneyFixture(['eval']);
 definition.portals[1].position=structuredClone(definition.portals[0].position);
 try {
  await expect(publishDiscoveryExperience({rootDir,childId:'synthetic',homeworkId:'h',spellingItems:[] as never,activeSessionPlan:{boardDefinition:definition,nodePlan:[{id:'eval'}],domain:'spelling'} as never,assignment:{} as never})).rejects.toThrow('board_canvas_invalid');
  expect(existsSync(join(rootDir,'src/context/synthetic/plans/active_session_plan.json'))).toBe(false);
 }finally{rmSync(rootDir,{recursive:true,force:true});}
},20000);

it('returns measured normalized separation to the author without moving the portals',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sunny-canvas-correction-'));
 const definition=linearJourneyFixture(['learn','check']);
 definition.portals[1].position=structuredClone(definition.portals[0].position);
 const authored=JSON.stringify(definition);
 try {
  await expect(verifyAuthoredBoardCanvas({definition,directory,rootDir:process.cwd()})).rejects.toThrow(/overlaps:.*normalized_center_separation.*required_x=.*required_y=/);
  expect(JSON.stringify(definition)).toBe(authored);
 }finally{rmSync(directory,{recursive:true,force:true});}
},20000);
