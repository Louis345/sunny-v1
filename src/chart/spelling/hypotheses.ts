import type { ChartEvent } from '../eventTypes';
import { orderedFacts, projectAssignment } from './projections';
import type { Payloads } from './schemas';

export type HypothesisStatus = 'proposed' | 'supported' | 'contradicted' | 'expired';
export type HypothesisWeek = { assignmentId: string; right: number; total: number };
export type LearnerHypothesisView = Payloads['learner.hypothesis'] & {
    eventId: string; madeAt: string; status: HypothesisStatus;
    evidence: { weeks: HypothesisWeek[]; right: number; total: number; rate: number | null };
};

/** Evidence from this many later weeks before a claim reads as supported or contradicted (spec revision 2). */
export const WEEKS_NEEDED = 2;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Every cross-week claim with its score, computed from the record on each read. Evidence counts only from weeks
 * other than the one the claim came from, and only facts recorded after the claim. Status changes what is shown,
 * always with counts; it never gates anything.
 */
export function projectLearnerHypotheses(input: readonly ChartEvent[], opts: { now?: Date } = {}): LearnerHypothesisView[] {
    const events = orderedFacts(input);
    const now = (opts.now ?? new Date()).getTime();
    const assignments = events.filter(e => e.type === 'assignment.ingested').map(e => String(e.payload.assignmentId));
    const views = new Map<string, ReturnType<typeof projectAssignment> | null>();
    const view = (id: string) => {
        if (!views.has(id)) {
            try { views.set(id, projectAssignment(input, id)); }
            catch (error) { console.error(` 🎮 [learner-hypotheses] [assignment-skip] assignment=${id} reason=${error instanceof Error ? error.message : String(error)}`); views.set(id, null); }
        }
        return views.get(id)!;
    };
    return events.filter(e => e.type === 'learner.hypothesis').map(e => {
        const h = e.payload as Payloads['learner.hypothesis'];
        const weeks: HypothesisWeek[] = [];
        for (const id of assignments) {
            if (id === h.formedInAssignmentId) continue;
            const v = view(id);
            if (!v) continue;
            const patternsOf = new Map(v.patterns.map(t => [t.word, t.patterns as string[]]));
            const inScope = (word: string) => h.scope.words.includes(word) || (patternsOf.get(word) ?? []).some(p => (h.scope.patterns as string[]).includes(p));
            const rows = h.metric === 'first_try_unassisted'
                ? v.responses.filter(r => r.eligible && r.sequence > e.sequence && inScope(r.word)).map(r => r.result === 'correct')
                : v.schoolResult && events.find(x => x.event_id === v.schoolResult!.eventId)!.sequence > e.sequence
                    ? v.schoolResult.results.filter(r => inScope(r.word)).map(r => r.correct) : [];
            if (rows.length) weeks.push({ assignmentId: id, right: rows.filter(Boolean).length, total: rows.length });
        }
        const right = weeks.reduce((s, w) => s + w.right, 0), total = weeks.reduce((s, w) => s + w.total, 0);
        const rate = total ? round3(right / total) : null;
        const expired = now > Date.parse(e.occurred_at) + h.horizonDays * 86_400_000;
        const status: HypothesisStatus = weeks.length >= WEEKS_NEEDED && rate !== null
            ? (rate >= h.expected.min && rate <= h.expected.max ? 'supported' : 'contradicted')
            : expired ? 'expired' : 'proposed';
        return { ...h, eventId: e.event_id, madeAt: e.occurred_at, status, evidence: { weeks, right, total, rate } };
    });
}
