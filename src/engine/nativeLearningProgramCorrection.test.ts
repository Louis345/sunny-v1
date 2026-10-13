import {expect,it} from 'vitest';
import * as planner from './assignmentPlanner';
import {z} from 'zod';
const original={domain:'spelling',planId:'preserved',journey:{paths:[{id:'root',portalIds:['start','choice','end']}],choices:[{id:'choice',purpose:'Preserve this choice'}]},activities:[{id:'wheel',targets:['piece'],measurement:null},{id:'practice',targets:['medium'],measurement:{spelling:{evidenceIds:['saved-observation']}}}],planTheory:{hypothesis:'Preserve the hypothesis'}};
const defect=Object.assign(new Error('assignment_planner_relationship_invalid'),{issues:[{code:'planner_missing_measurement',nodeId:'wheel',measurementId:'measure-wheel'}]});
const measurement={evidenceType:'practice',spelling:{role:'practice',evidenceIds:['existing-evidence'],interventionNodeIds:[]}};
it('asks for only the diagnosed measurement rather than a whole replacement program',()=>{
 expect(planner).toHaveProperty('nativeLearningProgramCorrectionTool');
 const tool=(planner as any).nativeLearningProgramCorrectionTool(original,defect);
 expect(tool.name).toBe('repair_learning_program_fields');
 expect(tool.input_schema.properties.patches.items.properties.path.enum).toEqual(['/activities/0/measurement']);
 expect(tool.input_schema.properties.journey).toBeUndefined();expect(tool.input_schema.properties.activities).toBeUndefined();
});
it('applies the explicit correction without changing the original, choices or sibling evidence',()=>{
 expect(planner).toHaveProperty('applyNativeLearningProgramCorrection');
 const fixed=(planner as any).applyNativeLearningProgramCorrection(original,{patches:[{path:'/activities/0/measurement',value:measurement}]},defect);
 expect(original.activities[0].measurement).toBeNull();expect(fixed.activities[0].measurement).toEqual(measurement);
 expect(fixed.journey).toEqual(original.journey);expect(fixed.activities[1]).toEqual(original.activities[1]);expect(fixed.planTheory).toEqual(original.planTheory);
});
it('refuses unsolicited evidence or journey edits rather than allowing correction drift',()=>{
 expect(planner).toHaveProperty('applyNativeLearningProgramCorrection');
 const apply=(planner as any).applyNativeLearningProgramCorrection;
 expect(()=>apply(original,{patches:[{path:'/activities/1/measurement/spelling/evidenceIds',value:['invented']}]},defect)).toThrow('learning_program_correction_changed_protected_fields');
 expect(()=>apply(original,{patches:[{path:'/journey/paths/0/portalIds',value:['end']}]},defect)).toThrow('learning_program_correction_changed_protected_fields');
 expect(()=>apply(original,{patches:[{path:'/activities/0/measurement',value:measurement},{path:'/activities/0/measurement',value:null}]},defect)).toThrow('learning_program_correction_duplicate_field');
});

it('removes only diagnosed unrecognized keys so strict schema recovery is executable',()=>{
 const schema=z.object({domain:z.literal('spelling')}).strict(),raw={domain:'spelling',unexpected:'invalid'};
 const parsed=schema.safeParse(raw);expect(parsed.success).toBe(false);if(parsed.success)throw new Error('expected unknown key');
 const corrected=planner.applyNativeLearningProgramCorrection(raw,{patches:[{path:'/unexpected',remove:true}]},parsed.error);
 expect(schema.parse(corrected)).toEqual({domain:'spelling'});expect(raw.unexpected).toBe('invalid');
 expect(()=>planner.applyNativeLearningProgramCorrection(original,{patches:[{path:'/activities/0/measurement',remove:true}]},defect)).toThrow('learning_program_correction_changed_protected_fields');
});
