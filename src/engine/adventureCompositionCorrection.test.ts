import {it,expect} from 'vitest';
import * as board from '../shared/adventureBoardDefinition';
const composition={portals:[{id:'start',position:{landscape:{x:.1,y:.5},portrait:{x:.3,y:.1}}},{id:'teach',icon:'book',thumbnailUrl:'/world.jpeg',position:{landscape:{x:.4,y:.5},portrait:{x:.3,y:.3}}},{id:'check',position:{landscape:{x:.8,y:.5},portrait:{x:.3,y:.5}}}],edges:[{id:'first',style:'glow',controlPoints:{landscape:[{x:.2,y:.4}],portrait:[{x:.3,y:.2}]}},{id:'last',style:'dashed',controlPoints:{landscape:[],portrait:[]}}],theme:{background:{type:'image',value:'/world.jpeg'},palette:{path:'#fff',completed:'#fff',available:'#fff',locked:'#fff',current:'#fff',preview:'#fff',text:'#fff',panel:'#fff'}}};
const journey={portals:composition.portals.map(p=>({id:p.id})),edges:[{id:'first',from:'start',to:'teach'},{id:'last',from:'teach',to:'check'}]};
const failure=new Error('board_canvas_invalid:["768x1024:teach:overlaps:check:normalized_center_separation current_x=0 current_y=0.2 required_x=0.2 OR required_y=0.26"]');
it('repairs only diagnosed portrait geometry against the received composition',()=>{
 expect(board).toHaveProperty('adventureCompositionCorrectionTool');
 const tool=(board as any).adventureCompositionCorrectionTool(composition,journey,failure);
 expect(tool.input_schema.properties.patches.items.properties.path.enum).toEqual(['/portals/1/position/portrait','/portals/2/position/portrait','/edges/0/controlPoints/portrait','/edges/1/controlPoints/portrait']);
 const patches=[{path:'/portals/1/position/portrait',value:{x:.3,y:.25}},{path:'/portals/2/position/portrait',value:{x:.3,y:.6}}];
 const fixed=(board as any).applyAdventureCompositionCorrection(composition,journey,{patches},failure);
 expect(fixed.portals[1].position.portrait.y).toBe(.25);expect(composition.portals[1].position.portrait.y).toBe(.3);
 expect(fixed.theme).toEqual(composition.theme);expect(fixed.portals[1].icon).toBe('book');expect(fixed.portals.map((p:any)=>p.position.landscape)).toEqual(composition.portals.map(p=>p.position.landscape));
 expect(()=> (board as any).applyAdventureCompositionCorrection(composition,journey,{patches:[{path:'/theme/background',value:{type:'solid',value:'#000'}}]},failure)).toThrow('composition_correction_changed_protected_fields');
 expect(()=> (board as any).applyAdventureCompositionCorrection(composition,journey,{patches:[{path:'/portals/0/position/portrait',value:{x:.5,y:.5}}]},failure)).toThrow('composition_correction_changed_protected_fields');
 expect(()=> (board as any).applyAdventureCompositionCorrection(composition,journey,{patches:[{path:'/portals/1/position/landscape',value:{x:.5,y:.5}}]},failure)).toThrow('composition_correction_changed_protected_fields');
 expect(()=> (board as any).applyAdventureCompositionCorrection(composition,journey,{patches:[{path:'/portals/1/position/portrait',value:{x:2,y:.3}}]},failure)).toThrow();
});
it('does not invent correction permissions for an unknown canvas failure',()=>{
 expect(()=> (board as any).adventureCompositionCorrectionTool(composition,journey,new Error('unknown defect'))).toThrow('composition_correction_scope_unavailable');
});
it('does not grant geometry permission to a namespaced portal prefix sibling',()=>{
 const namespaced={...composition,portals:[...composition.portals,{...composition.portals[1],id:'teach:extra'},{...composition.portals[2],id:'check:extra'}]};
 const defect=new Error('board_canvas_invalid:["768x1024:teach:extra:overlaps:check:extra:normalized_center_separation current_x=0 current_y=0 required_x=.2 OR required_y=.3"]');
 const tool=(board as any).adventureCompositionCorrectionTool(namespaced,journey,defect);
 const allowed=tool.input_schema.properties.patches.items.properties.path.enum;
 expect(allowed).not.toContain('/portals/1/position/portrait');expect(allowed).not.toContain('/portals/2/position/portrait');
 expect(allowed).toContain('/portals/3/position/portrait');expect(allowed).toContain('/portals/4/position/portrait');
});
