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

it('advertises the runtime configuration types during field repair, including supported keyboard input',()=>{
 const configDefect=Object.assign(new Error('learning_program_invalid'),{issues:[{code:'word_radar_config_invalid',nodeId:'wheel'}]});
 const tool=planner.nativeLearningProgramCorrectionTool(original,configDefect);
 const value=(tool.input_schema.properties.patches.items.properties.value as any).anyOf[0];
 expect(value.anyOf[0].properties.inputMode.enum).toEqual(['whole-word','letter-by-letter','keyboard']);
});

it('lets the author bind an omitted activity without rewriting existing portals or paths',()=>{
 const program={...original,journey:{version:2,rootPathId:'root',portals:[{id:'start',kind:'start',label:'Start'},{id:'practice',kind:'activity',label:'Practice',activityNodeId:'practice'},{id:'end',kind:'endpoint',label:'Done'}],paths:[{id:'root',portalIds:['start','practice','end']}],choices:[]}};
 const omitted=Object.assign(new Error('assignment_planner_relationship_invalid'),{issues:[{code:'activity_portal_missing',id:'wheel'}]});
 const tool=planner.nativeLearningProgramCorrectionTool(program,omitted);
 expect(tool.input_schema.properties.patches.items.properties.path.enum).toEqual(['/journey/portals','/journey/paths/0/portalIds']);
 const portals=[...program.journey.portals,{id:'wheel-portal',kind:'activity',label:'Spin',activityNodeId:'wheel'}];
 const patches=[{path:'/journey/portals',value:portals},{path:'/journey/paths/0/portalIds',value:['start','practice','wheel-portal','end']}];
 const fixed=planner.applyNativeLearningProgramCorrection(program,{patches},omitted) as typeof program;
 expect(fixed.activities).toEqual(program.activities);expect(fixed.journey.paths[0].portalIds).toEqual(['start','practice','wheel-portal','end']);expect(program.journey.portals).toHaveLength(3);
 expect(()=>planner.applyNativeLearningProgramCorrection(program,{patches:[patches[0],{path:'/journey/paths/0/portalIds',value:['start','wheel-portal','end']}]},omitted)).toThrow('learning_program_correction_changed_protected_fields');
 expect(()=>planner.applyNativeLearningProgramCorrection(program,{patches:[{path:'/journey/portals',value:[...portals.slice(0,1),{...portals[1],label:'Changed'},...portals.slice(2)]},patches[1]]},omitted)).toThrow('learning_program_correction_changed_protected_fields');
 expect(()=>planner.applyNativeLearningProgramCorrection(program,{patches:[{path:'/journey/portals',value:[...program.journey.portals,{id:'extra',kind:'activity',label:'Extra',activityNodeId:'practice'}]}]},omitted)).toThrow('learning_program_correction_changed_protected_fields');
});

it('lets the Planner attach its disconnected common closing path while preserving both alternatives',()=>{
 const program={...original,journey:{rootPathId:'root',paths:[{id:'root',portalIds:['start','choice']},{id:'learn',portalIds:['teach']},{id:'play',portalIds:['wheel']},{id:'root-close',portalIds:['check','reward','end']}],choices:[{id:'choice',portalId:'choice',options:[{id:'a',pathId:'learn'},{id:'b',pathId:'play'}]}]}};
 const disconnected=Object.assign(new Error('assignment_planner_relationship_invalid'),{issues:[{code:'path_unreachable',id:'root-close'}]});
 const tool=planner.nativeLearningProgramCorrectionTool(program,disconnected);expect(tool.input_schema.properties.patches.items.properties.path.enum).toEqual(['/journey/paths']);
 const paths=[{id:'root',portalIds:['start','choice','check','reward','end']},...program.journey.paths.slice(1,3)];
 const fixed=planner.applyNativeLearningProgramCorrection(program,{patches:[{path:'/journey/paths',value:paths}]},disconnected) as typeof program;
 expect(fixed.journey.choices).toEqual(program.journey.choices);expect(fixed.activities).toEqual(program.activities);expect(fixed.journey.paths.slice(1)).toEqual(program.journey.paths.slice(1,3));
 expect(()=>planner.applyNativeLearningProgramCorrection(program,{patches:[{path:'/journey/paths',value:[paths[0],{id:'learn',portalIds:['wheel']},paths[2]]}]},disconnected)).toThrow('learning_program_correction_changed_protected_fields');
 expect(()=>planner.applyNativeLearningProgramCorrection(program,{patches:[{path:'/journey/paths',value:[{id:'root',portalIds:['start','choice','reward','end']},...paths.slice(1)]}]},disconnected)).toThrow('learning_program_correction_changed_protected_fields');
 expect(()=>planner.applyNativeLearningProgramCorrection(program,{patches:[{path:'/journey/paths',value:[{id:'root',portalIds:['start','check','choice','reward','end']},...paths.slice(1)]}]},disconnected)).toThrow('learning_program_correction_changed_protected_fields');
});
