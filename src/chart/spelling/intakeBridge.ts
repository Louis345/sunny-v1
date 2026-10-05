import {openChart,type ChartDatabase} from '../db';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {exportEvents} from '../exportEvents';
import {projectAssignment} from './projections';
import {isCheckpointAttemptActive} from './checkpointedAttempt';
import {spellingPlanner} from './provider';
import {shouldPersistSessionData} from '../../utils/runtimeMode';
import {recordAssignment} from './record';
import {createSpellingJourney, type SpellingProvider} from './journey';
import type {Payloads} from './schemas';

/** Called before the original Discovery is published; no replacement UI or plan. */
export async function prepareSpellingChartAssignment(
    db: ChartDatabase,
    assignment: Payloads['assignment.ingested'],
    provider: SpellingProvider,
): Promise<void> {
    recordAssignment(db, assignment);
    const journey = createSpellingJourney(db, provider);
    if (journey.state(assignment.assignmentId).stage === 'prior') {
        if(originalPriorStatus(db,assignment.assignmentId).needsAttention)throw Error('prior_needs_attention');
        await journey.advance(assignment.assignmentId);
    }
    console.log(` 🎮 [spelling-chart] [intake] [priors-ready] assignment=${assignment.assignmentId}`);
}

export function originalPriorStatus(db:ChartDatabase,id:string){
 const view=projectAssignment(exportEvents(db),id);
 const ready=!!view.assignment && view.priors.length===view.assignment.words.length && view.patterns.length===view.assignment.words.length;
 const base=path.join(path.dirname(db.path),db.childId,'requests',createHash('sha256').update(`${id}:prior`).digest('hex'));
 const dir=path.dirname(base),prefix=path.basename(base)+'.';
 const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.startsWith(prefix)):[];
 return {ready,pending:isCheckpointAttemptActive(base),attempted:files.some(f=>f.endsWith('.request.json')),needsAttention:files.some(f=>f.endsWith('.error.json'))};
}
/** Recovery reuses the captured assignment and the intake checkpoint, never re-ingests a source. */
export async function recoverOriginalSpellingPrior(db:ChartDatabase,id:string,provider:SpellingProvider){
 const status=originalPriorStatus(db,id);
 if(status.ready)return {ready:true};
 if(!status.attempted)throw Error('prior_recovery_not_started');
 const view=projectAssignment(exportEvents(db),id);
 if(view.responses.length||view.schoolResult)throw Error('prior_after_observation');
 const journey=createSpellingJourney(db,provider);
 if(journey.state(id).stage!=='prior')throw Error('prior_stage_required');
 await journey.advance(id,true);
 return {ready:true};
}
export async function runOriginalSpellingPriorRecovery(child:string,id:string,provider:SpellingProvider=spellingPlanner){
 if(!process.env.SUNNY_CHART_DIR?.trim()||!shouldPersistSessionData()||process.env.SUNNY_CERTIFICATION_RUN_ID)return;
 const db=openChart(child);
 try{return await recoverOriginalSpellingPrior(db,id,provider);}finally{db.close();}
}
