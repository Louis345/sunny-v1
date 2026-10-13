import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import {verifyAuthoredBoardCanvas,verifyBoardArtworkReady} from './adventureBoardCanvas';
import type {AdventureBoardDefinition} from '../shared/adventureBoardDefinition';
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

// The real recovered board passed geometry while a symbolic gradient was
// silently discarded by CSS. Logs proved publication, not visual fidelity;
// prior lab cases only exercised positions on valid CSS themes.
it('reports an unrenderable authored background without silently substituting a theme',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sunny-canvas-theme-'));
 const definition=linearJourneyFixture(['learn','check']);
 definition.theme.background={type:'gradient',value:'sky-meadow-dawn'} as never;
 const authored=JSON.stringify(definition);
 try {
  await expect(verifyAuthoredBoardCanvas({definition,directory,rootDir:process.cwd()})).rejects.toThrow(/board_canvas_invalid:.*background_css_invalid/);
  expect(JSON.stringify(definition)).toBe(authored);
 }finally{rmSync(directory,{recursive:true,force:true});}
},20000);

// Human saw a blank world although geometry passed. Geometry logs never loaded
// assets; the lab used gradients, so it did not exercise a missing illustration.
it('keeps an authored illustration unpublished until its required file exists',async()=>{
 const rootDir=mkdtempSync(join(tmpdir(),'sunny-required-artwork-'));
 const definition:AdventureBoardDefinition=linearJourneyFixture(['learn']);definition.theme.background={type:'image',value:'/generated/world.jpeg'};
 const authored=JSON.stringify(definition);
 try {
  expect(()=>verifyBoardArtworkReady({definition,rootDir})).toThrow('board_artwork_not_ready');
  const {mkdirSync,writeFileSync}=await import('node:fs');
  mkdirSync(join(rootDir,'web/public/generated'),{recursive:true});writeFileSync(join(rootDir,'web/public/generated/world.jpeg'),Buffer.from([0xff,0xd8,0xff,0xd9]));
  expect(()=>verifyBoardArtworkReady({definition,rootDir})).not.toThrow();
  expect(JSON.stringify(definition)).toBe(authored);
  const query=structuredClone(definition);query.theme.background.value+='?v=1';
  expect(()=>verifyBoardArtworkReady({definition:query,rootDir})).not.toThrow();
  const remote=structuredClone(definition);remote.theme.background.value='https://example.test/world.jpeg';
  expect(()=>verifyBoardArtworkReady({definition:remote,rootDir})).not.toThrow();
  remote.theme.background.value='//cdn.example.test/world.jpeg';
  expect(()=>verifyBoardArtworkReady({definition:remote,rootDir})).not.toThrow();
 }finally{rmSync(rootDir,{recursive:true,force:true});}
});
