import {it,expect} from 'vitest';
import {buildDirectActiveSessionPlan} from './directMathExperience';
import {plan} from '../scripts/fixtures/adaptiveMathRelease';
import {authoredJourney} from '../scripts/fixtures/authoredJourney';

// Fixed-slot combinatorics belonged to the deleted renderer policy. Geometry is
// now checked by adventureBoardCanvas.test using the real component at all sizes.
it('preserves a math Planner shared-instrument fork through the Creator projection',()=>{
 const designed=plan(3);
 const definition=authoredJourney();
 const ids={learn:'activity-1',play:'activity-2',check:'activity-3'};
 definition.portals.forEach(portal=>{if(portal.activityNodeId)portal.activityNodeId=ids[portal.activityNodeId as keyof typeof ids];});
 designed.boardDefinition=definition;
 const artifacts=designed.activities.map((a:any)=>({childId:'synthetic',homeworkId:'hw',nodeId:a.id,title:a.title,htmlPath:'/a.html',artworkUrl:'',creatorPrompt:'fixture',promptHash:'fixture',plannerModel:'recorded',creatorModel:'recorded'}));
 const projected=buildDirectActiveSessionPlan({childId:'synthetic',homeworkId:'hw',plan:designed,artifacts,backgroundUrl:'/different-art.png',report:{passed:true,failures:[],screenshots:[]}});
 expect(projected.nodePlan.every(node=>!('locked' in node))).toBe(true);
 expect(projected.boardDefinition).toEqual(definition);
 expect(projected.adventureBoard!.definition).toEqual(definition);
 expect(projected.adventureBoard!.nodes.map(node=>[node.id,node.label,node.position])).toEqual(definition.portals.map(portal=>[portal.id,portal.label,portal.position.landscape]));
 expect(projected.adventureBoard!.choiceSets![0].options.map(option=>option.launchNodeId)).toEqual(['activity-1','activity-2']);
});
