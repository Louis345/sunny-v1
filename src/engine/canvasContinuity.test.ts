import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {it,expect,vi} from 'vitest';
import * as canvas from './adventureBoardCanvas';
import {linearJourneyFixture} from '../scripts/fixtures/authoredJourney';
it('reports missing artwork and overlapping geometry without changing or rejecting the artist',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'canvas-report-'));
 const definition=linearJourneyFixture(['learn']);definition.portals[1].position=structuredClone(definition.portals[0].position);definition.theme.background={type:'image',value:'/generated/missing.png'} as any;
 const before=structuredClone(definition),error=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  expect(canvas).toHaveProperty('reportAuthoredBoardCanvas');
  await expect((canvas as any).reportAuthoredBoardCanvas({definition,directory:root,rootDir:root})).resolves.not.toThrow();
  expect(definition).toEqual(before);
  expect(error.mock.calls.flat().join(' ')).toContain('[artwork] [missing]');
 }finally{error.mockRestore();fs.rmSync(root,{recursive:true,force:true});}
},20000);
it.each(['assignmentPlanner.ts','learningCycleIngest.ts','directMathExperience.ts','adaptiveMathDiscovery.ts','../scripts/runAdaptiveMathGeneration.ts','canonicalProgressionGenerator.ts'])('tripwire: %s cannot invoke a presentation veto or buy its correction',file=>{
 const source=fs.readFileSync(path.join(__dirname,file),'utf8');
 expect(source).not.toMatch(/\b(?:verifyAuthoredBoardCanvas|verifyBoardArtworkReady)\s*\(/);
 expect(source).not.toMatch(/code:\s*['"]board_canvas_invalid['"]/);
 expect(source).not.toContain('canvasCorrectionPrompt');
});

it('reads a partial Creator drawing without changing the frozen academic journey',async()=>{
 const board=linearJourneyFixture(['learn']);
 const module=await import('../shared/adventureBoardDefinition');
 const journey=module.journeyFromBoardDefinition(board);
 expect(module).toHaveProperty('assembleAuthoredBoardDefinition');
 const partial={theme:board.theme,portals:board.portals.map(portal=>({id:portal.id,position:{landscape:portal.position.landscape}})),edges:[]};
 const result=(module as any).assembleAuthoredBoardDefinition(journey,partial);
 expect(module.journeyExecutions(result)).toEqual(module.journeyExecutions(journey));
 expect(result.portals[1].position.landscape).toEqual(board.portals[1].position.landscape);
 expect(Number.isFinite(result.portals[1].position.portrait.x)).toBe(true);
});

it('reports invalid CSS without repairing the authored theme',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'canvas-css-report-')),definition=linearJourneyFixture(['learn']);
 definition.theme.background={type:'gradient',value:'symbolic-not-css'} as any;
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  await expect(canvas.reportAuthoredBoardCanvas({definition,directory:root,rootDir:root})).resolves.toBeDefined();
  expect(error.mock.calls.flat().join(' ')).toContain('[background-css] [invalid]');
  expect(definition.theme.background.value).toBe('symbolic-not-css');
 }finally{error.mockRestore();fs.rmSync(root,{recursive:true,force:true});}
},20000);
