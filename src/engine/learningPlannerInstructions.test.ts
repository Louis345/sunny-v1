import {describe,it,expect} from 'vitest';
import * as instructions from './learningPlannerInstructions';
import {buildAssignmentPlannerPrompt} from './assignmentPlanner';

describe('versioned domain instructions with one Planner persona',()=>{
 it('keeps identity stable while specializing reviewed expertise',()=>{
  const math=instructions.learningPlannerInstructions('math');
  const spelling=instructions.learningPlannerInstructions('spelling');
  expect(math.persona).toBe(spelling.persona);
  expect(math.version).toBe(1);expect(spelling.version).toBe(1);
  expect(math.text).toContain('mathematics');expect(spelling.text).toContain('spelling');
  expect(math.text).toContain('child chart');expect(spelling.text).toContain('child chart');
  expect(spelling.text).not.toContain('at least');
 });
 it('preserves an uncertain domain instead of quietly choosing spelling',()=>{
  const ambiguous=instructions.learningPlannerInstructions('generic');
  expect(ambiguous.domain).toBe('generic');
  expect(ambiguous.text).toContain('uncertain');
  expect(ambiguous.text).not.toContain('expert reading and spelling');
 });
 it('loads domain expertise from captured evidence even before Discovery',()=>{
  const packet:any={capturedHomework:{contentProfile:{practiceDomain:'spelling'}},childChart:{},activityCatalog:[],plannerInstruction:''};
  const spelling=buildAssignmentPlannerPrompt(packet);
  packet.capturedHomework.contentProfile.practiceDomain='math';
  const math=buildAssignmentPlannerPrompt(packet);
  expect(spelling).toContain(instructions.learningPlannerInstructions('spelling').text);
  expect(math).toContain(instructions.learningPlannerInstructions('math').text);
 });
});
