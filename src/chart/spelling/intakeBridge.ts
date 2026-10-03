import type {ChartDatabase} from '../db';
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
        await journey.advance(assignment.assignmentId);
    }
    console.log(` 🎮 [spelling-chart] [intake] [priors-ready] assignment=${assignment.assignmentId}`);
}
