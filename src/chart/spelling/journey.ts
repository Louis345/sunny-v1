import {readPlannerToolReceipt} from '../../engine/plannerTransport';
import {checkpointedAttempt} from './checkpointedAttempt';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ChartDatabase } from '../db';
import { getChildChart } from '../../profiles/childChart';
import { exportEvents } from '../exportEvents';
import { buildPlannerPacket, buildReportCard, evaluatePriors, orderedFacts, projectAssignment } from './projections';
import { recordAssignment, recordFact, recordForecast, recordPlan, recordPresentation, recordResponse, recordSchoolTest, recordTags, recordPriors } from './record';
import { schemas, teachingProgram } from './schemas';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const priorProposal = z.strictObject({ tags: schemas['words.tagged'], priors: z.array(schemas['prediction.prior'].omit({provenance:true})).min(1) });
export const planProposal = z.strictObject({ action: z.enum(['targeted_practice', 'collect_evidence']), ...teachingProgram.shape });
export type SpellingStage = 'prior' | 'discovery' | 'plan' | 'practice' | 'recall_check' | 'forecast' | 'await_calibration' | 'complete';
export type SpellingPacket = ReturnType<typeof buildPlannerPacket> & {
    profile: Record<string, unknown> | null;
    schedule?: {testDate:string|null;scheduleFactId:string|null};
};
export type SpellingProvider = ((stage: 'prior' | 'plan' | 'forecast', packet: SpellingPacket) => Promise<unknown>) & {modelId?:string};
function priorInputIds(packet:SpellingPacket,events:ReturnType<typeof exportEvents>):string[]{
 const v=packet.assignment;
 const patternAssignments=new Set([v.assignmentId,...packet.patternHistory.map(h=>h.assignmentId)]);
 const ids=new Set([v.assignmentEventId,...v.priors.map(p=>p.eventId),...v.responses.flatMap(r=>[r.eventId,r.presentationId]),v.forecast?.eventId,v.schoolResult?.eventId,
  ...packet.patternHistory.flatMap(h=>[h.assignmentEventId,h.schoolResult?.eventId,...h.readings.flatMap(r=>[r.eventId,r.presentationId])]),
  ...packet.accuracy.flatMap(w=>[w.forecast.forecastId,w.forecast.schoolResultId,...w.prior.rows.flatMap(r=>[r.priorId,r.responseId])]),
  events.filter(e=>e.type==='child.profile_set').at(-1)?.event_id,
  ...events.filter(e=>e.type==='words.tagged'&&patternAssignments.has(String(e.payload.assignmentId))).map(e=>e.event_id)]);
 for(const e of events)if(e.type==='correction.recorded'&&ids.has(String(e.payload.target_event_id)))ids.add(e.event_id);
 return events.filter(e=>ids.has(e.event_id)).map(e=>e.event_id);
}
const ingestion = z.strictObject({ words: z.array(z.string().min(1).max(80)).min(1).max(100), testDate: z.iso.date(), sourceText: z.string().min(1).max(100000) });
const submission = z.strictObject({ itemId: z.string().min(1), rawResponse: z.string().max(4096).nullable(), status: z.enum(['answered', 'unknown', 'skipped', 'ambiguous']), audioReplays: z.number().int().min(0).max(100) });
const schoolInput = schemas['school_test.recorded'].omit({ assignmentId: true, photoHash: true, sourceKind: true }).extend({ sourceText: z.string().min(1).max(100000) }).strict();
/** Operational files preserve provider outcomes and source artifacts, never learning views. */
function preserve(file: string, text: string) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); const fd = fs.openSync(file, 'wx', 0o600); try {
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
}
finally {
    fs.closeSync(fd);
} }
export function createSpellingJourney(db: ChartDatabase, provider: SpellingProvider) {
    const facts = () => exportEvents(db);
    const source = (text: string) => { const id = hash(text); const file = path.join(path.dirname(db.path), db.childId, 'files', id + '.txt'); if (!fs.existsSync(file))
        preserve(file, text); return id; };
    function state(id: string) {
        const events = facts();
        const view = projectAssignment(events, id);
        if (!view.assignment)
            throw new Error('assignment_missing');
        const plan = orderedFacts(events).filter(e => e.type === 'plan.decided' && e.payload.assignmentId === id).at(-1);
        const program = plan?.payload.program as z.infer<typeof teachingProgram> | undefined;
        const discovery = view.responses.filter(r => r.instrument === 'discovery');
        const practice = view.responses.filter(r => r.instrument === 'practice');
        let stage: SpellingStage;
        if (view.schoolResult)
            stage = 'complete';
        else if (view.forecast)
            stage = 'await_calibration';
        else if (view.priors.length !== view.assignment.words.length || view.patterns.length !== view.assignment.words.length)
            stage = 'prior';
        else if (discovery.length < view.assignment.words.length)
            stage = 'discovery';
        else if (!plan)
            stage = 'plan';
        else if (plan.payload.action === 'targeted_practice' && practice.length < (program?.cards.length ?? 0))
            stage = 'practice';
        else if (view.recallChecks.length < view.assignment.words.length)
            stage = 'recall_check';
        else
            stage = 'forecast';
        const words = stage === 'practice' ? program?.cards.map(c => c.word) ?? [] : view.assignment.words;
        const completed = stage === 'discovery' ? discovery.length : stage === 'practice' ? practice.length : stage === 'recall_check' ? view.recallChecks.length : 0;
        return { assignmentId: id, stage, completed, total: words.length, title: program?.title ?? 'Spelling Discovery', testDate: view.assignment.testDate, words, program, view };
    }
    function present(id: string) {
        return db.sql.transaction(() => {
            const s = state(id);
            if (!['discovery', 'practice', 'recall_check'].includes(s.stage))
                throw new Error('journey_stage_not_presentable');
            const instrument = s.stage as 'discovery' | 'practice' | 'recall_check';
            const word = s.words[s.completed];
            const sessionId = `${id}:${instrument}`;
            const itemId = `${sessionId}:${s.completed}`;
            const plan = facts().find(e => e.type === 'plan.decided' && e.payload.assignmentId === id);
            const evidenceUsed = [s.view.assignmentEventId!, ...(plan ? [plan.event_id] : [])];
            const p = recordPresentation(db, { assignmentId: id, sessionId, itemId, word, acceptedForms: [word], instrument, role: instrument === 'practice' ? 'practice' : 'measure', protocolVersion: 1, shown: { lettersVisible: instrument === 'practice', hint: instrument === 'practice', companionHelp: false } }, {cites:evidenceUsed});
            const catalog = {childId:db.childId, assignmentId:id, contentId:itemId, source:plan?'planner-program':'fixed-instrument', type:instrument, title:s.title, algorithmTargets:instrument==='practice'?['error-pattern remediation']:['retrieval practice'], evidenceUsed, reuseDecision:'candidate', reason:'Outcome evidence is required before claiming effectiveness.'};
            return { catalog, itemId, word, instrument, index: s.completed, total: s.total, presentationId: p.event_id, instruction: instrument === 'practice' ? s.program?.cards[s.completed]?.instruction : null };
        }).immediate();
    }
    function respond(id: string, input: z.infer<typeof submission>) {
        const body = submission.parse(input);
        return db.sql.transaction(() => {
            const events = facts();
            const p = events.find(e => e.type === 'item.presented' && e.payload.itemId === body.itemId && e.payload.assignmentId === id);
            if (!p)
                throw new Error('presentation_missing');
            const old = events.find(e => e.type === 'response.observed' && e.payload.itemId === body.itemId);
            if (!old) {
                const s = state(id);
                if (body.itemId !== `${id}:${s.stage}:${s.completed}`)
                    throw new Error('journey_stale_item');
            }
            return recordResponse(db, { assignmentId: id, sessionId: String(p.payload.sessionId), itemId: body.itemId, attempt: 1, rawResponse: body.rawResponse, status: body.status, support: { audioReplays: body.audioReplays, spellingShown: p.payload.instrument === 'practice', hint: p.payload.instrument === 'practice', companionHelp: false } }, { cites: [p.event_id] });
        }).immediate();
    }
    async function advance(id: string, recover = false) {
        const s = state(id);
        if (!['prior', 'plan', 'forecast'].includes(s.stage))
            return s;
        const stage = s.stage as 'prior' | 'plan' | 'forecast';
        // The chart doorway is the only input to adaptive decisions. No legacy fallback.
        const chart = getChildChart(db.childId, { department: 'spelling', database: db });
        const packet = { ...buildPlannerPacket(chart.events, id), profile: chart.profile };
        const base = path.join(path.dirname(db.path), db.childId, 'requests', hash(`${id}:${stage}`));
        return checkpointedAttempt(base, {stage, packet, model:provider.modelId ?? 'injected-fixture'}, () => provider(stage,packet), (raw, metadata) => {
        let proposal=readPlannerToolReceipt(raw, 'submit_spelling_proposal');
        if(typeof proposal==='string') proposal=JSON.parse(proposal.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
        const request=metadata as {packet:SpellingPacket;model?:string};
        db.sql.transaction(() => {
            if (Math.max(0, ...facts().map(e => e.sequence)) !== request.packet.asOfSequence)
                throw new Error('planner_stale_chart');
            if (state(id).stage !== stage)
                throw new Error('planner_stale_stage');
            if (stage === 'prior') {
                const p = priorProposal.parse(proposal);
                const words = s.view.assignment!.words;
                if (p.tags.assignmentId !== id || p.priors.length !== words.length || new Set(p.priors.map(r => r.word)).size !== words.length || p.priors.some(r => r.assignmentId !== id || !words.includes(r.word)))
                    throw new Error('prior_coverage');
                recordTags(db, p.tags, { cites: [s.view.assignmentEventId!] });
                recordPriors(db, p.priors.map(prior=>({...prior,provenance:{asOfSequence:request.packet.asOfSequence,modelId:request.model ?? 'unrecorded'}})), { cites: priorInputIds(request.packet,chart.events) });
            }
            else if (stage === 'plan') {
                const p = planProposal.parse(proposal);
                const evaluation = evaluatePriors(facts(), id);
                const responseIds = s.view.responses.filter(r => r.instrument === 'discovery').map(r => r.eventId);
                recordPlan(db, { assignmentId: id, decisionIndex: 1, action: p.action, evaluationIds: [evaluation.id], responseIds, program: { title: p.title, cards: p.cards } }, { cites: responseIds });
            }
            else {
                const p = schemas['readiness.forecast'].parse(proposal);
                if (p.assignmentId !== id)
                    throw new Error('forecast_assignment');
                recordForecast(db, p, { cites: p.responseIds });
            }
        }).immediate();
        console.error(` 🎮 [spelling] [planner] [committed] stage=${stage}`);
        return state(id);
        }, recover);
    }
    return { state, present, respond, advance,
        ingest(input: z.infer<typeof ingestion>) { const p = ingestion.parse(input); const words = p.words.map(w => w.normalize('NFC').trim().toLowerCase()); if (new Set(words).size !== words.length)
            throw new Error('duplicate_words'); const assignmentId = 'spelling-' + hash(JSON.stringify([words, p.testDate])).slice(0, 24); return recordAssignment(db, { assignmentId, words, testDate: p.testDate, sourcePhotoHash: source(p.sourceText), sourceKind: 'parent_transcription' }).payload as z.infer<typeof schemas['assignment.ingested']>; },
        school(id: string, input: z.infer<typeof schoolInput>) { const p = schoolInput.parse(input); if (!['await_calibration', 'complete'].includes(state(id).stage))
            throw new Error('school_forecast_required'); return recordSchoolTest(db, { assignmentId: id, testDate: p.testDate, photoHash: source(p.sourceText), sourceKind: 'parent_transcription', results: p.results }); },
        profile(input: unknown) { return recordFact(db, 'child.profile_set', schemas['child.profile_set'].parse(input)); },
        report: () => buildReportCard(facts()),
        assignments: () => getChildChart(db.childId, { department: 'spelling', database: db }).assignments.map(a => state(String(a.assignmentId))),
    };
}
