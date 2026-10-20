import type {ChartDatabase} from '../db';
import {getLearningCycle,type LearningCycleRepositoryOptions} from '../../engine/learningCycleRepository';
import {prepareSpellingChartAssignment} from './intakeBridge';
import type {SpellingProvider} from './journey';
/** Low-level captured-assignment adapter for installation at an idle boundary, before the original host starts. */
export async function prepareExistingOriginalSpelling(db:ChartDatabase,homeworkId:string,provider:SpellingProvider,options:LearningCycleRepositoryOptions={}){
 const cycle=getLearningCycle(db.childId,homeworkId,options);
 if(!cycle||cycle.domain!=='spelling')throw Error('original_spelling_assignment_missing');
 if(cycle.lifecycle!=='evaluation_ready'||cycle.observations.length||cycle.calibrations?.length||cycle.evidence.academic.length||cycle.nodes.some(n=>n.state==='active'||n.state==='completed'))throw Error('original_preparation_requires_unstarted_discovery');
 const items=Object.values(cycle.nodes.find(n=>n.role==='evaluation')?.evidenceContract.spellingItems??{});
 const words=items.map(item=>item.word.normalize('NFC').toLowerCase());
 if(!words.length||new Set(words).size!==words.length||JSON.stringify(words)!==JSON.stringify(cycle.assignment.targets.map(word=>word.normalize('NFC').toLowerCase())))throw Error('original_spelling_assignment_contract_mismatch');
 await prepareSpellingChartAssignment(db,{assignmentId:homeworkId,words,testDate:null,sourcePhotoHash:cycle.assignment.contentFingerprint},provider);
 console.log(` 🎮 [spelling-chart] [existing-assignment] [prepared] homework=${homeworkId}`);
 return {assignmentId:homeworkId};
}
