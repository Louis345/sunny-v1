import { z } from 'zod';
import { eventId } from '../eventId';
import { PATTERN_IDS } from './patterns';
const text = z.string().trim().min(1).max(4096);
const word = text.refine(s => s === s.trim() && s === s.toLowerCase(), 'canonical lowercase word');
const date = z.iso.date();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const probability = z.number().min(0).max(1);
const strings = z.array(text).max(1000).refine(a => new Set(a).size === a.length);
const uniqueWords = z.array(word).min(1).max(1000).refine(a => new Set(a).size === a.length);
const aid = { assignmentId: text };
export const teachingProgram = z.strictObject({title:text,cards:z.array(z.strictObject({word,instruction:text})).min(1).max(100).refine(a=>new Set(a.map(c=>c.word)).size===a.length)});
export const schemas = {
    'stimulus.played': z.strictObject({...aid,sessionId:text,itemId:text,playbackId:text,speechRates:z.array(z.number().min(0.7).max(1.2)).min(1).max(100).nullable(),delivered:z.boolean()}),
    'activity.limited': z.strictObject({...aid,sessionId:text,nodeId:text,launchId:text,sourceEventId:text,reason:z.enum(['non_spelling_response','per_word_results_unavailable']),rawChoice:z.string().max(4096).nullable(),aggregateAccuracy:probability.nullable()}),
    'test_schedule.set': z.discriminatedUnion('kind',[z.strictObject({changeId:text,kind:z.literal('weekday'),weekday:z.number().int().min(0).max(6).nullable()}),z.strictObject({changeId:text,kind:z.literal('assignment'),assignmentId:text,testDate:date.nullable()})]),
    'engagement.observed': z.strictObject({ ...aid, sessionId: text, nodeId: text, itemId: text.nullable(), observationId: text, metric: z.enum(['first_input_ms', 'idle_gap_ms', 'audio_replays', 'erase_burst', 'rapid_wrong_attempts', 'skipped', 'not_sure', 'quit_mid_node', 'help_requests', 'session_duration_ms', 'returned_later_day']), value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
    'child.profile_set': z.strictObject({ displayName: text, interests: strings.optional(), supportNeeds: strings.optional(), companion: text.optional(), readingLevel: text.optional() }),
    'assignment.ingested': z.strictObject({ ...aid, words: uniqueWords, testDate: date.nullable(), sourcePhotoHash: hash, sourceKind: z.enum(['image','parent_transcription']).optional() }),
    'words.tagged': z.strictObject({ ...aid, taxonomyVersion: z.literal(1), tags: z.array(z.strictObject({ word, patterns: z.array(z.enum(PATTERN_IDS)).min(1).refine(a => new Set(a).size === a.length) })).min(1).max(1000) }),
    'prediction.prior': z.strictObject({ ...aid, word, pCorrect: probability, expectedError: text, confidence: probability, provenance:z.strictObject({asOfSequence:z.number().int().min(0),modelId:text}).optional() }),
    'item.presented': z.strictObject({ ...aid, provenance: z.strictObject({nodeId:text,launchId:text,sourceItemId:text}).optional(), sessionId: text, itemId: text, word, acceptedForms: uniqueWords, instrument: z.enum(['discovery', 'practice', 'recall_check']), role: z.enum(['measure', 'practice']), protocolVersion: z.literal(1), shown: z.strictObject({ lettersVisible: z.boolean().nullable(), hint: z.boolean().nullable(), companionHelp: z.boolean().nullable() }) }),
    'response.observed': z.strictObject({ ...aid, sourceResponseId:text.optional(), sessionId: text, itemId: text, attempt: z.number().int().min(1), rawResponse: z.string().max(4096).nullable(), status: z.enum(['answered', 'unknown', 'skipped', 'ambiguous']), support: z.strictObject({ audioReplays: z.number().int().min(0).nullable(), spellingShown: z.boolean().nullable(), hint: z.boolean().nullable(), companionHelp: z.boolean().nullable() }) }).refine(p => p.status !== 'answered' || p.rawResponse !== null, 'answered response requires captured text'),
    'plan.decided': z.strictObject({ ...aid, decisionIndex: z.number().int().min(1), action: z.enum(['targeted_practice', 'collect_evidence', 'await_calibration']), evaluationIds: strings.min(1), responseIds: strings.min(1), program: teachingProgram.optional() }),
    'readiness.forecast': z.strictObject({ ...aid, scheduledTestDate:date.nullable().optional(), scheduleFactId:text.nullable().optional(), probabilities: z.array(z.strictObject({ word, pCorrect: probability })).min(1).max(1000), uncertainty: text, missingEvidence: strings, responseIds: strings.min(1) }),
    // A cross-week claim about how she learns (teaching-record spec, Phase 2). The evidence query is closed and
    // code-owned: words and/or frozen pattern tags, one metric, an expected range. Code scores it; the claim never changes.
    'learner.hypothesis': z.strictObject({ hypothesisId: text, claim: text, decisionIds: strings, formedInAssignmentId: text,
        scope: z.strictObject({ patterns: z.array(z.enum(PATTERN_IDS)).max(PATTERN_IDS.length).refine(a => new Set(a).size === a.length), words: z.array(word).max(200).refine(a => new Set(a).size === a.length) })
            .refine(s => s.patterns.length + s.words.length > 0, 'a claim names words or patterns'),
        metric: z.enum(['first_try_unassisted', 'school_test']),
        expected: z.strictObject({ min: probability, max: probability }).refine(e => e.min <= e.max, 'expected min <= max'),
        falsifier: text, horizonDays: z.number().int().min(7).max(365) }),
    // Her living profile (2026-11-11): something she said about herself in a call she opened, with her exact words.
    // The newest fact on a topic is what companions and the Planner read; a parent can retract a wrong one.
    'child.fact_learned': z.strictObject({ factId: text, topic: z.string().trim().min(1).max(80), statement: text,
        kind: z.enum(['like', 'dislike', 'life_event', 'school', 'friends', 'family', 'feeling', 'health', 'other']),
        quote: z.string().trim().min(1).max(600), speaker: z.literal('caller_child'), sessionId: text, companionId: text, sourceEventIds: strings.min(1) }),
    'child.fact_retracted': z.strictObject({ factId: text, reason: text }),
    'school_test.recorded': z.strictObject({ ...aid, testDate: date, photoHash: hash, sourceKind: z.enum(['image','parent_transcription']).optional(), results: z.array(z.strictObject({ word, correct: z.boolean(), writtenResponse: z.string().max(4096).nullable() })).min(1).max(1000) }),
    // Replacement schema is validated against the target type inside the transaction.
    'correction.recorded': z.strictObject({ target_event_id: text, reason: text, replacement_payload: z.record(z.string(), z.unknown()) }),
} as const;
export type FactType = keyof typeof schemas;
export type Payloads = {
    [K in FactType]: z.infer<(typeof schemas)[K]>;
};
export const actors: Record<FactType, readonly string[]> = {
    'stimulus.played': ['system'],
    'activity.limited': ['system'],
    'test_schedule.set': ['parent'],
    'engagement.observed': ['room', 'system'],
    'child.profile_set': ['parent'], 'assignment.ingested': ['system'], 'words.tagged': ['planner'],
    'prediction.prior': ['planner'], 'item.presented': ['system'], 'response.observed': ['system'],
    'plan.decided': ['planner'], 'readiness.forecast': ['planner'], 'school_test.recorded': ['parent'],
    'learner.hypothesis': ['planner'],
    'child.fact_learned': ['system'], 'child.fact_retracted': ['parent'],
    'correction.recorded': ['parent', 'system'],
};
/** Profiles retain caller IDs so a parent can record multiple distinct profile revisions. */
export function factId(type: FactType, p: Record<string, unknown>): string {
    let key: unknown;
    switch (type) {
        case 'stimulus.played': key=[p.sessionId,p.itemId,p.playbackId]; break;
        case 'activity.limited': key=[p.sessionId,p.launchId,p.sourceEventId]; break;
        case 'test_schedule.set': key=p.changeId; break;
        case 'engagement.observed':
            key = [p.sessionId, p.observationId];
            break;
        case 'assignment.ingested':
        case 'words.tagged':
        case 'readiness.forecast':
        case 'school_test.recorded':
            key = p.assignmentId;
            break;
        case 'prediction.prior':
            key = [p.assignmentId, p.word];
            break;
        case 'item.presented':
            key = [p.sessionId, p.itemId];
            break;
        case 'response.observed':
            key = [p.sessionId, p.itemId, p.attempt];
            break;
        case 'plan.decided':
            key = [p.assignmentId, p.decisionIndex];
            break;
        case 'correction.recorded':
            key = [p.target_event_id, p.replacement_payload];
            break;
        case 'learner.hypothesis':
            key = p.hypothesisId;
            break;
        case 'child.fact_learned':
        case 'child.fact_retracted':
            key = p.factId;
            break;
        case 'child.profile_set':
            key = p;
            break;
    }
    return eventId(type, key);
}
