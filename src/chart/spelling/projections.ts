import { validatePayload, type ChartEvent } from '../eventTypes';
import { eventId } from '../eventId';
import type { Payloads, FactType } from './schemas';
function payload<K extends FactType>(e: ChartEvent, type: K): Payloads[K] { if (e.type !== type)
    throw new Error('chart_projection_type'); return e.payload as Payloads[K]; }
export function orderedFacts(input: readonly ChartEvent[], through = Infinity): ChartEvent[] {
    const events = input.filter(e => e.sequence <= through).sort((a, b) => a.sequence - b.sequence);
    if (new Set(events.map(e => e.child_id)).size > 1)
        throw new Error('chart_child_mismatch');
    if (events.some(e => !Number.isSafeInteger(e.sequence) || e.sequence < 1) || new Set(events.map(e => e.sequence)).size !== events.length)
        throw new Error('chart_sequence_invalid');
    const replacements = new Map<string, Record<string, unknown>>();
    for (const e of events)
        if (e.type === 'correction.recorded')
            replacements.set(String(e.payload.target_event_id), e.payload.replacement_payload as Record<string, unknown>);
    return events.filter(e => e.type !== 'correction.recorded').map(e => {
        const fact = { ...e, payload: replacements.get(e.event_id) ?? e.payload };
        validatePayload(fact.type, fact.payload);
        return fact;
    });
}
export function projectAssignment(input: readonly ChartEvent[], assignmentId: string, through = Infinity) {
    const all = orderedFacts(input, through);
    const events = all.filter(e => e.payload.assignmentId === assignmentId);
    const a = events.find(e => e.type === 'assignment.ingested');
    const assignment = a ? payload(a, 'assignment.ingested') : null;
    const tagged = events.find(e => e.type === 'words.tagged');
    const priors = events.filter(e => e.type === 'prediction.prior').map(e => ({ eventId: e.event_id, sequence: e.sequence, ...payload(e, 'prediction.prior') }));
    const presentations = new Map(all.filter(e => e.type === 'item.presented').map(e => [e.event_id, e]));
    const responses = events.filter(e => e.type === 'response.observed').map(e => {
        const r = payload(e, 'response.observed');
        const cited = e.cites.map(id => presentations.get(id)).filter((p): p is ChartEvent => !!p);
        const pe = cited[0];
        if (cited.length !== 1 || !pe || pe.sequence >= e.sequence || pe.payload.sessionId !== r.sessionId || pe.payload.itemId !== r.itemId || pe.payload.assignmentId !== r.assignmentId)
            throw new Error('chart_presentation_missing');
        const p = payload(pe, 'item.presented');
        const assisted = p.shown.lettersVisible || p.shown.hint || p.shown.companionHelp || r.support.spellingShown || r.support.hint || r.support.companionHelp;
        const result = r.status === 'answered' ? (p.acceptedForms.includes((r.rawResponse ?? '').normalize('NFC').trim().toLowerCase()) ? 'correct' : 'incorrect') : r.status;
        const earlierResponses = all.some(x => x.sequence < e.sequence && x.type === 'response.observed' && x.payload.sessionId === r.sessionId && x.payload.itemId === r.itemId);
        // Hearing an unanswered audio-only prompt is elicitation, not instruction.
        // Use response commit order so a late answer to a previous item is not erased by resume.
        const answered = new Set(all.filter(x => x.type === 'response.observed' && x.sequence < e.sequence).flatMap(x => x.cites));
        const exposure = all.filter(x => {
            if (x.type !== 'item.presented' || x.sequence >= e.sequence || x.payload.word !== p.word) return false;
            const prior = payload(x, 'item.presented');
            return answered.has(x.event_id) || (x.event_id !== pe.event_id &&
                (prior.instrument === 'practice' || prior.shown.lettersVisible || prior.shown.hint || prior.shown.companionHelp));
        });
        const previouslyExposed = exposure.length > 0;
        const exposedThisAssignment = exposure.some(x => x.payload.assignmentId === assignmentId);
        return { eventId: e.event_id, presentationId: pe.event_id, sequence: e.sequence, recordedAt: e.recorded_at, word: p.word, instrument: p.instrument, role: p.role, rawResponse: r.rawResponse, result, assistance: assisted ? 'assisted' : 'unassisted', firstTry: !earlierResponses, previouslyExposed, eligible: !earlierResponses && !exposedThisAssignment && !assisted && p.instrument === 'discovery' && p.role === 'measure' && (result === 'correct' || result === 'incorrect') };
    });
    const forecastEvent = events.find(e => e.type === 'readiness.forecast');
    const schoolEvent = events.find(e => e.type === 'school_test.recorded');
    return structuredClone({ assignmentId, assignment, assignmentEventId: a?.event_id ?? null, patterns: tagged ? payload(tagged, 'words.tagged').tags : [], priors, responses, recallChecks: responses.filter(r => r.instrument === 'recall_check'), forecast: forecastEvent ? { eventId: forecastEvent.event_id, sequence: forecastEvent.sequence, recordedAt: forecastEvent.recorded_at, ...payload(forecastEvent, 'readiness.forecast') } : null, schoolResult: schoolEvent ? { eventId: schoolEvent.event_id, ...payload(schoolEvent, 'school_test.recorded') } : null, coverage: { assigned: assignment?.words.length ?? 0, discovery: new Set(responses.filter(r => r.instrument === 'discovery').map(r => r.word)).size, eligible: new Set(responses.filter(r => r.eligible).map(r => r.word)).size, recall: new Set(responses.filter(r => r.instrument === 'recall_check').map(r => r.word)).size } });
}
export function evaluatePriors(input: readonly ChartEvent[], assignmentId: string, through = Infinity) {
    const v = projectAssignment(input, assignmentId, through);
    const rows = v.priors.flatMap(p => {
        const r = v.responses.find(r => r.word === p.word && r.eligible && r.sequence > p.sequence);
        if (!r)
            return [];
        const actual = r.result === 'correct' ? 1 : 0;
        const error = p.pCorrect - actual;
        return [{ word: p.word, priorId: p.eventId, responseId: r.eventId, pCorrect: p.pCorrect, actual, error, brier: error ** 2 }];
    });
    const coverage = { assigned: v.coverage.assigned, predicted: v.priors.length, matched: rows.length };
    const inputs = { assignmentId, version: 1, rows, coverage };
    return { id: eventId('prediction.evaluated', inputs), ...inputs, brier: rows.length ? rows.reduce((s, r) => s + r.brier, 0) / rows.length : null };
}
export function evaluateForecast(input: readonly ChartEvent[], assignmentId: string, through = Infinity) {
    const v = projectAssignment(input, assignmentId, through);
    const rows = v.forecast?.probabilities.flatMap(p => {
        const r = v.schoolResult?.results.find(r => r.word === p.word);
        if (!r)
            return [];
        const actual = r.correct ? 1 : 0;
        const error = p.pCorrect - actual;
        return [{ word: p.word, pCorrect: p.pCorrect, actual, error, brier: error ** 2 }];
    }) ?? [];
    return { assignmentId, version: 1, forecastId: v.forecast?.eventId ?? null, schoolResultId: v.schoolResult?.eventId ?? null, rows, brier: rows.length ? rows.reduce((s, r) => s + r.brier, 0) / rows.length : null, coverage: { assigned: v.coverage.assigned, forecast: v.forecast?.probabilities.length ?? 0, matched: rows.length }, prospectiveStatus: v.forecast && v.schoolResult && v.forecast.recordedAt.slice(0, 10) < v.schoolResult.testDate ? 'before_test_date' : 'unverified' };
}
export function projectPatternHistory(input: readonly ChartEvent[], through = Infinity) {
    const events = orderedFacts(input, through);
    return events.filter(e => e.type === 'assignment.ingested').flatMap(e => {
        const v = projectAssignment(input, String(e.payload.assignmentId), through);
        return v.patterns.flatMap(t => t.patterns.map(pattern => ({ pattern, assignmentId: v.assignmentId, word: t.word, assignmentEventId: v.assignmentEventId, readings: v.responses.filter(r => r.word === t.word && r.eligible), schoolResult: v.schoolResult ? { eventId: v.schoolResult.eventId, result: v.schoolResult.results.find(r => r.word === t.word) ?? null } : null })));
    });
}
export function buildReportCard(events: readonly ChartEvent[], through = Infinity) {
    return { version: 1, weeks: orderedFacts(events, through).filter(e => e.type === 'assignment.ingested').map(e => {
            const assignmentId = String(e.payload.assignmentId);
            return { assignmentId, prior: evaluatePriors(events, assignmentId, through), forecast: evaluateForecast(events, assignmentId, through) };
        }), patternHistory: projectPatternHistory(events, through) };
}
export function buildPlannerPacket(events: readonly ChartEvent[], assignmentId: string, through = Infinity) {
    const v = projectAssignment(events, assignmentId, through);
    return { version: 1, asOfSequence: Math.max(0, ...events.filter(e => e.sequence <= through).map(e => e.sequence)), assignment: v, patternHistory: projectPatternHistory(events, through), accuracy: buildReportCard(events, through).weeks, missingEvidence: [...(!v.assignment ? ['assignment'] : []), ...((v.coverage.eligible < v.coverage.assigned) ? ['incomplete_independent_discovery'] : []), ...(!v.forecast ? ['readiness_forecast'] : []), ...(!v.schoolResult ? ['school_test'] : [])] };
}
