import { describe, expect, it } from 'vitest';
import { validateEvent, validatePayload, EVENT_TYPES } from '../chart/eventTypes';
import { actors, factId, schemas, type FactType } from '../chart/spelling/schemas';
const samples: Record<FactType, Record<string, unknown>> = {
    'test_schedule.set': {changeId:'schedule-1',kind:'weekday',weekday:5},
    'engagement.observed': { assignmentId:'a', sessionId:'s', nodeId:'n', itemId:null, observationId:'o', metric:'audio_replays', value:1 },
    'child.profile_set': { displayName: 'Synthetic' },
    'assignment.ingested': { assignmentId: 'a', words: ['able'], testDate: '2026-10-09', sourcePhotoHash: 'a'.repeat(64) },
    'words.tagged': { assignmentId: 'a', taxonomyVersion: 1, tags: [{ word: 'able', patterns: ['spelling.irregular'] }] },
    'prediction.prior': { assignmentId: 'a', word: 'able', pCorrect: 0.5, confidence: 0.5, expectedError: 'unknown' },
    'item.presented': { assignmentId: 'a', sessionId: 's', itemId: 'i', word: 'able', acceptedForms: ['able'], instrument: 'discovery', role: 'measure', protocolVersion: 1, shown: { lettersVisible: false, hint: false, companionHelp: false } },
    'response.observed': { assignmentId: 'a', sessionId: 's', itemId: 'i', attempt: 1, rawResponse: 'able', status: 'answered', support: { audioReplays: 0, spellingShown: false, hint: false, companionHelp: false } },
    'plan.decided': { assignmentId: 'a', decisionIndex: 1, action: 'collect_evidence', evaluationIds: ['eval'], responseIds: ['response'] },
    'readiness.forecast': { assignmentId: 'a', probabilities: [{ word: 'able', pCorrect: 0.5 }], uncertainty: 'unknown', missingEvidence: [], responseIds: ['response'] },
    'school_test.recorded': { assignmentId: 'a', testDate: '2026-10-09', photoHash: 'a'.repeat(64), results: [{ word: 'able', correct: true, writtenResponse: null }] },
    'correction.recorded': { target_event_id: 'target', reason: 'typo', replacement_payload: { displayName: 'New' } },
};
describe.each(Object.entries(samples) as [
    FactType,
    Record<string, unknown>
][])('%s strict fact schema', (type, payload) => {
    const event = () => ({ event_id: factId(type, payload), child_id: 'synthetic-schema', type, actor: actors[type][0] as any, occurred_at: '2026-10-03T12:00:00.000Z', cites: [], payload });
    it('accepts valid shape and actor', () => expect(() => validateEvent(event())).not.toThrow());
    it('rejects extra fields, wrong actor and bad values', () => {
        expect(() => validateEvent({ ...event(), actor: actors[type].includes('room') ? 'planner' : 'room' })).toThrow('actor');
        expect(() => validatePayload(type, { ...payload, correctness: 'invented' })).toThrow();
        for (const key of Object.keys(payload))
            expect(() => validatePayload(type, { ...payload, [key]: false })).toThrow();
    });
    it('rejects every missing required field', () => {
        for (const key of Object.keys(payload)) {
            const copy = { ...payload };
            delete copy[key];
            expect(() => validatePayload(type, copy)).toThrow();
        }
    });
});
it('unimplemented registered types cannot smuggle arbitrary spelling facts', () => {
    for (const type of EVENT_TYPES.filter(t => !(t in schemas)))
        expect(() => validatePayload(type, { assignmentId: 'a', mastered: true })).toThrow('not_implemented');
});
it('nested extras, unknown patterns, protocol versions and bad probabilities are rejected', () => {
    expect(() => validatePayload('words.tagged', { ...samples['words.tagged'], tags: [{ word: 'able', patterns: ['invented'] }] })).toThrow();
    expect(() => validatePayload('item.presented', { ...samples['item.presented'], protocolVersion: 99 })).toThrow();
    for (const p of [-0.1, 1.1, NaN, Infinity])
        expect(() => validatePayload('prediction.prior', { ...samples['prediction.prior'], pCorrect: p })).toThrow();
    expect(() => validatePayload('response.observed', { ...samples['response.observed'], support: { audioReplays: 1, spellingShown: false, hint: false, companionHelp: false, correct: true } })).toThrow();
});
it('reference lists cannot repeat evidence to inflate coverage', () => {
    expect(() => validatePayload('readiness.forecast', { ...samples['readiness.forecast'], responseIds: ['same', 'same'] })).toThrow();
    expect(() => validatePayload('plan.decided', { ...samples['plan.decided'], evaluationIds: ['same', 'same'] })).toThrow();
});
