import {it,expect} from 'vitest';
import {spellingCheckpointLineageIssues} from './spellingCheckpointLineage';
it('preserves post-checkpoint practice without manufacturing another checkpoint',()=>{
 const nodes=[{id:'teach',type:'visual-explainer',targets:['piece']},{id:'check',type:'word-radar',targets:['piece']},{id:'reward',type:'wheel-of-fortune',targets:['piece']}];
 const measurements=[{id:'measure-teach',spelling:{role:'instruction',interventionNodeIds:[]}},{id:'measure-check',spelling:{role:'fresh_checkpoint',interventionNodeIds:['teach']}},{id:'measure-reward',spelling:{role:'practice',interventionNodeIds:[]}}];
 expect(spellingCheckpointLineageIssues(nodes,measurements)).toEqual([]);
 measurements[1].spelling.interventionNodeIds=[];
 expect(spellingCheckpointLineageIssues(nodes,measurements)).toEqual([{code:'planner_checkpoint_lineage_missing',nodeId:'check',measurementId:'measure-check',interventionNodeIds:['teach']}]);
});
