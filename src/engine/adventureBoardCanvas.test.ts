import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect,vi} from 'vitest';
import {reportAuthoredBoardArtwork,verifyAuthoredBoardCanvas,verifyBoardArtworkReady} from './adventureBoardCanvas';
import type {AdventureBoardDefinition} from '../shared/adventureBoardDefinition';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
it('offline canvas audit diagnoses geometry independently of production publication',async()=>{
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
it('offline artwork audit reports missing required files',async()=>{
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

// Trial 9 died on overlap the Creator could not see; the old proof render also aborted
// every request, so its screenshots never showed the illustrated world.
it('previews the real board with its artwork loaded and measured portal boxes, without judging layout',async()=>{
 const canvas=await import('./adventureBoardCanvas');
 const {existsSync}=await import('node:fs');
 expect(canvas).toHaveProperty('renderBoardPreview');
 const directory=mkdtempSync(join(tmpdir(),'sunny-canvas-preview-'));
 const definition=linearJourneyFixture(['learn','check']) as AdventureBoardDefinition;
 definition.theme={...definition.theme,background:{type:'image',value:'/generated/adventure-board-demo/silent-letter-world.jpeg'}};
 definition.portals[1].position=structuredClone(definition.portals[0].position);
 try {
  const preview=await (canvas as any).renderBoardPreview({definition,directory,rootDir:process.cwd()}) as {screenshots:Array<{viewport:string;file:string}>;portals:Array<{viewport:string;id:string;width:number;height:number}>;artworkLoaded:boolean};
  expect(preview.screenshots.map(shot=>shot.viewport)).toEqual(['1280x720','768x1024']);
  expect(preview.screenshots.every(shot=>existsSync(shot.file))).toBe(true);
  expect(preview.artworkLoaded).toBe(true);
  for(const viewport of ['1280x720','768x1024'])expect(preview.portals.filter(box=>box.viewport===viewport).map(box=>box.id).sort()).toEqual(definition.portals.map(portal=>portal.id).sort());
  expect(preview.portals.every(box=>box.width>0&&box.height>0)).toBe(true);
 }finally{rmSync(directory,{recursive:true,force:true});}
},30000);

// Oct 19 demo: the Grok world was missing from the demo checkout, and the
// as-authored publish path (which never rejects a map) skipped the artwork
// check, so the board published blank with only "artwork=missing" in a log.
// The older guard above covered the strict path, not this one.
it('publishes an as-authored map with missing artwork but reports the missing file loudly',async()=>{
 const rootDir=mkdtempSync(join(tmpdir(),'sunny-authored-artwork-'));
 const definition:AdventureBoardDefinition=linearJourneyFixture(['learn']);definition.theme.background={type:'image',value:'/generated/world.jpeg'};
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  expect(reportAuthoredBoardArtwork({definition,rootDir})).toBe(false);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('🔴 [board-canvas] [artwork] [missing] /generated/world.jpeg'));
  const {mkdirSync,writeFileSync}=await import('node:fs');
  mkdirSync(join(rootDir,'web/public/generated'),{recursive:true});writeFileSync(join(rootDir,'web/public/generated/world.jpeg'),Buffer.from([0xff,0xd8,0xff,0xd9]));
  error.mockClear();
  expect(reportAuthoredBoardArtwork({definition,rootDir})).toBe(true);
  expect(error).not.toHaveBeenCalled();
 } finally {error.mockRestore();rmSync(rootDir,{recursive:true,force:true});}
});
