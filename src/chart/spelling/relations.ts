import type { ChartDatabase } from '../db';
import type { EventInput, ChartEvent } from '../eventTypes';
import { validatePayload } from '../eventTypes';
import { decodeRow } from '../exportEvents';
import { canonicalJson } from '../eventId';
import { factId, type FactType, type Payloads } from './schemas';
import { evaluatePriors } from './projections';
function fail(message: string): never { throw new Error('chart_' + message); }
export function validateRelations(db: ChartDatabase, e: EventInput): void {
    const get = (id: string): ChartEvent | undefined => { const row = db.sql.prepare('SELECT * FROM events WHERE event_id=?').get(id); return row ? decodeRow(row) : undefined; };
    const effective = (event: ChartEvent): ChartEvent => {
        const row = db.sql.prepare("SELECT * FROM events WHERE type='correction.recorded' AND json_extract(payload,'$.target_event_id')=? ORDER BY sequence DESC LIMIT 1").get(event.event_id);
        return row ? { ...event, payload: decodeRow(row).payload.replacement_payload as Record<string, unknown> } : event;
    };
    let p = e.payload;
    let replacing = false;
    if (e.type === 'child.profile_set' || e.type === 'assignment.ingested' || (e.type === 'test_schedule.set' && e.payload.kind === 'weekday'))
        return;
    if (e.type === 'correction.recorded') {
        const target = get(String(p.target_event_id));
        if (!target || !e.cites.includes(target.event_id) || target.type === 'correction.recorded')
            fail('correction_target');
        if (target.type === 'plan.decided' || target.type === 'test_schedule.set')
            fail('correction_immutable_decision');
        if (target.type === 'readiness.forecast')
            fail('correction_immutable_prediction');
        validatePayload(target.type, p.replacement_payload);
        const replacement = p.replacement_payload as Record<string, unknown>;
        for (const key of ['provenance', 'sourceResponseId']) {
            if ((key in target.payload) !== (key in replacement)) fail('correction_identity');
        }
        for (const key of ['assignmentId', 'word', 'sessionId', 'itemId', 'attempt', 'protocolVersion', 'instrument', 'role', 'provenance', 'sourceResponseId']) {
            if (key in target.payload && canonicalJson(target.payload[key]) !== canonicalJson(replacement[key]))
                fail('correction_identity');
        }
        if (target.type !== 'child.profile_set' && factId(target.type as FactType, replacement) !== target.event_id)
            fail('correction_identity');
        const dependency = db.sql.prepare('SELECT 1 FROM event_citations WHERE target_id=? LIMIT 1').get(target.event_id);
        if (dependency)
            fail('correction_has_dependents');
        // Assignment membership is an implicit dependency even when callers omit a citation.
        if (target.type === 'assignment.ingested' && db.sql.prepare("SELECT 1 FROM events WHERE json_extract(payload,'$.assignmentId')=? AND type!='assignment.ingested' LIMIT 1").get(target.payload.assignmentId))
            fail('correction_has_dependents');
        if (target.type === 'response.observed') {
            const before = target.payload as Payloads['response.observed'];
            const after = replacement as Payloads['response.observed'];
            if ((after.rawResponse !== null && after.rawResponse !== before.rawResponse) ||
                (after.status !== before.status && !['unknown', 'ambiguous'].includes(after.status)) ||
                (before.support.audioReplays === null ? after.support.audioReplays !== null : after.support.audioReplays !== null && after.support.audioReplays < before.support.audioReplays) ||
                (['spellingShown', 'hint', 'companionHelp'] as const).some(key => (before.support[key] === true && after.support[key] !== true) || (before.support[key] === null && after.support[key] === false)))
                fail('correction_response_upgrade');
        }
        // Reuse the ordinary fact rules after checking correction identity/dependencies.
        e = { ...target, payload: replacement };
        p = replacement;
        replacing = true;
    }
    if (e.type === 'child.profile_set' || e.type === 'assignment.ingested' || (e.type === 'test_schedule.set' && e.payload.kind === 'weekday'))
        return;
    const a = get(factId('assignment.ingested', { assignmentId: p.assignmentId }));
    if (!a)
        fail('assignment_missing');
    const assignment = effective(a).payload as Payloads['assignment.ingested'];
    const sameWords = (given: string[]) => given.length === assignment.words.length && new Set(given).size === given.length && given.every(w => assignment.words.includes(w));
    if ('word' in p && !assignment.words.includes(String(p.word)))
        fail('assignment_word');
    const has = (type: string) => !!db.sql.prepare("SELECT 1 FROM events WHERE json_extract(payload,'$.assignmentId')=? AND type=? LIMIT 1").get(p.assignmentId, type);
    if (e.type === 'words.tagged') {
        if (has('prediction.prior')) fail('tags_after_prior');
        if (!sameWords((p as Payloads['words.tagged']).tags.map(t => t.word)))
            fail('tag_coverage');
    }
    if (e.type === 'prediction.prior') {
        const found = db.sql.prepare(`SELECT 1 FROM events r JOIN events i ON i.type='item.presented'
   AND json_extract(i.payload,'$.sessionId')=json_extract(r.payload,'$.sessionId') AND json_extract(i.payload,'$.itemId')=json_extract(r.payload,'$.itemId')
   WHERE json_extract(r.payload,'$.assignmentId')=? AND r.type='response.observed' AND json_extract(i.payload,'$.instrument')='discovery' LIMIT 1`).get(p.assignmentId);
        if (found)
            fail('prior_after_discovery');
    }
    if (e.type === 'item.presented') {
        const item = p as Payloads['item.presented'];
        // Protocol 1's single accepted spelling is frozen by the assignment, not the room.
        if (item.acceptedForms.length !== 1 || item.acceptedForms[0] !== item.word)
            fail('accepted_forms_assignment');
        if ((item.instrument === 'practice') !== (item.role === 'practice'))
            fail('instrument_role');
    }
    if (e.type === 'response.observed') {
        if (e.cites.map(get).filter(r => r?.type === 'item.presented').length !== 1)
            fail('presentation_ambiguous');
        const presentation = get(factId('item.presented', p));
        if (!presentation || !e.cites.includes(presentation.event_id) || presentation.payload.assignmentId !== p.assignmentId)
            fail('presentation_missing');
        const prior = db.sql.prepare("SELECT count(*) AS n FROM events WHERE json_extract(payload,'$.sessionId')=? AND json_extract(payload,'$.itemId')=? AND type='response.observed'").get(p.sessionId, p.itemId) as {
            n: number;
        };
        if (!replacing && p.attempt !== prior.n + 1)
            fail('attempt_sequence');
    }
    if (e.type === 'school_test.recorded') {
        if (!sameWords((p as Payloads['school_test.recorded']).results.map(r => r.word)))
            fail('school_coverage');
    }
    if (e.type === 'readiness.forecast') {
        if (has('school_test.recorded'))
            fail('forecast_after_result');
        const f = p as Payloads['readiness.forecast'];
        if (!sameWords(f.probabilities.map(r => r.word)))
            fail('forecast_coverage');
        for (const id of f.responseIds) {
            const r = get(id);
            if (!r || r.type !== 'response.observed' || r.payload.assignmentId !== p.assignmentId || !e.cites.includes(id))
                fail('forecast_response');
            const presentation = get(factId('item.presented', r.payload));
            if (presentation?.payload.instrument !== 'recall_check')
                fail('forecast_recall_required');
        }
    }
    if (e.type === 'plan.decided') {
        const previous = db.sql.prepare("SELECT count(*) AS n FROM events WHERE json_extract(payload,'$.assignmentId')=? AND type='plan.decided'").get(p.assignmentId) as { n: number };
        if (p.decisionIndex !== previous.n + 1) fail('decision_sequence');
        // Bounded to this assignment, not the child's entire history. Evaluation reference is a pure content hash.
        const rows = db.sql.prepare("SELECT * FROM events WHERE json_extract(payload,'$.assignmentId')=? ORDER BY sequence").all(p.assignmentId).map(decodeRow);
        const corrections = rows.flatMap(r => db.sql.prepare("SELECT * FROM events WHERE type='correction.recorded' AND json_extract(payload,'$.target_event_id')=?").all(r.event_id).map(decodeRow));
        const evaluation = evaluatePriors([...rows, ...corrections], String(p.assignmentId));
        const plan = p as Payloads['plan.decided'];
        if (plan.program?.cards.some(card => !assignment.words.includes(card.word))) fail('plan_word');
        if (plan.evaluationIds.length !== 1 || plan.evaluationIds[0] !== evaluation.id)
            fail('plan_evaluation');
        for (const id of plan.responseIds)
            if (!e.cites.includes(id) || !rows.some(r => r.type === 'response.observed' && r.event_id === id))
                fail('plan_response');
        for (const row of evaluation.rows)
            if (!plan.responseIds.includes(row.responseId))
                fail('plan_evaluation_dependency');
    }
}
