import { appendEvent } from '../appendEvent';
import type { ChartDatabase } from '../db';
import type { Actor, ChartEvent } from '../eventTypes';
import { actors, factId, type FactType, type Payloads } from './schemas';
export type RecordOptions = {
    occurred_at?: string;
    cites?: string[];
    actor?: Actor;
};
/** All structural and cross-fact validation is owned by appendEvent's transaction. */
export function recordFact<K extends FactType>(db: ChartDatabase, type: K, payload: Payloads[K], options: RecordOptions = {}): ChartEvent {
    return appendEvent(db, { event_id: factId(type, payload), child_id: db.childId, type, actor: options.actor ?? actors[type][0] as Actor, occurred_at: options.occurred_at ?? new Date().toISOString(), cites: options.cites ?? [], payload });
}
export const recordAssignment = (db: ChartDatabase, p: Payloads['assignment.ingested'], o?: RecordOptions) => recordFact(db, 'assignment.ingested', p, o);
export const recordTags = (db: ChartDatabase, p: Payloads['words.tagged'], o?: RecordOptions) => recordFact(db, 'words.tagged', p, o);
export function recordPriors(db: ChartDatabase, priors: Payloads['prediction.prior'][], o?: RecordOptions) {
    const nested = db.sql.inTransaction;
    try {
        const events = db.sql.transaction(() => priors.map(p => recordFact(db, 'prediction.prior', p, o))).immediate();
        console.error(` 🎮 [chart] [priors] [${nested ? 'staged' : 'committed'}] count=${events.length}`);
        return events;
    } catch (error) {
        console.error(' 🎮 [chart] [priors] [rolled_back]');
        throw error;
    }
}

export const recordPresentation = (db: ChartDatabase, p: Payloads['item.presented'], o?: RecordOptions) => recordFact(db, 'item.presented', p, o);
export const recordResponse = (db: ChartDatabase, p: Payloads['response.observed'], o?: RecordOptions) => recordFact(db, 'response.observed', p, o);
export const recordPlan = (db: ChartDatabase, p: Payloads['plan.decided'], o?: RecordOptions) => recordFact(db, 'plan.decided', p, o);
export const recordForecast = (db: ChartDatabase, p: Payloads['readiness.forecast'], o?: RecordOptions) => recordFact(db, 'readiness.forecast', p, o);
export const recordSchoolTest = (db: ChartDatabase, p: Payloads['school_test.recorded'], o?: RecordOptions) => recordFact(db, 'school_test.recorded', p, o);
export const recordCorrection = (db: ChartDatabase, p: Payloads['correction.recorded'], o?: RecordOptions) => recordFact(db, 'correction.recorded', p, o);
