import {it,expect} from 'vitest';
import * as lineage from './spellingCheckpointLineage';
import {spellingCheckpointLineageIssues} from './spellingCheckpointLineage';
it('preserves post-checkpoint practice without manufacturing another checkpoint',()=>{
 const nodes=[{id:'teach',type:'visual-explainer',targets:['piece']},{id:'check',type:'word-radar',targets:['piece']},{id:'reward',type:'wheel-of-fortune',targets:['piece']}];
 const measurements=[{id:'measure-teach',spelling:{role:'instruction',interventionNodeIds:[]}},{id:'measure-check',spelling:{role:'fresh_checkpoint',interventionNodeIds:['teach']}},{id:'measure-reward',spelling:{role:'practice',interventionNodeIds:[]}}];
 expect(spellingCheckpointLineageIssues(nodes,measurements)).toEqual([]);
 measurements[1].spelling.interventionNodeIds=[];
 expect(spellingCheckpointLineageIssues(nodes,measurements)).toEqual([{code:'planner_checkpoint_lineage_missing',nodeId:'check',measurementId:'measure-check',interventionNodeIds:['teach']}]);
});

// Code already knows the path order, so the Planner no longer authors exposure lineage.
it('derives checkpoint lineage from journey order and target words',()=>{
 expect(lineage).toHaveProperty('deriveCheckpointLineage');
 const nodes=[{id:'learn',targets:['piece'],role:'instruction'},{id:'play',targets:['Piece','medium'],role:'practice'},{id:'other',targets:['guard'],role:'practice'},{id:'check',targets:['piece','medium'],role:'fresh_checkpoint'},{id:'after',targets:['piece'],role:'practice'}];
 // A checkpoint after a choice cites the candidate exposures of every option; an
 // activity for a different word, or one that comes after it, is not an exposure.
 expect((lineage as any).deriveCheckpointLineage(nodes,[['learn','other','check','after'],['play','other','check','after']])).toEqual({learn:[],play:[],other:[],check:['learn','play'],after:[]});
});
it('starts a new exposure window after each checkpoint',()=>{
 const nodes=[{id:'teach',targets:['piece'],role:'instruction'},{id:'first',targets:['piece'],role:'fresh_checkpoint'},{id:'again',targets:['piece'],role:'practice'},{id:'final',targets:['piece'],role:'fresh_checkpoint'}];
 expect((lineage as any).deriveCheckpointLineage(nodes,[['teach','first','again','final']])).toMatchObject({first:['teach'],final:['again']});
});
