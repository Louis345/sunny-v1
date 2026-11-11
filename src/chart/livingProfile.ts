import { familyDay } from '../utils/familyCalendar';
import type { ChartEvent } from './eventTypes';
import { orderedFacts } from './spelling/projections';
import type { Payloads } from './spelling/schemas';

export type LivingFact = Payloads['child.fact_learned'] & { eventId: string; learnedAt: string; learnedOn: string; replaces: string[] };
export type LivingProfile = { current: LivingFact[]; history: LivingFact[]; retracted: Array<{ factId: string; reason: string }> };

/**
 * Her living profile, computed from her chart on every read. Topics compare case-insensitively; the newest fact on a
 * topic is current and names the older ones it replaces. Retracted facts leave every view except `retracted`.
 */
export function projectLivingProfile(input: readonly ChartEvent[]): LivingProfile {
    const events = orderedFacts(input);
    const retracted = events.filter(e => e.type === 'child.fact_retracted').map(e => ({ factId: String(e.payload.factId), reason: String(e.payload.reason) }));
    const gone = new Set(retracted.map(r => r.factId));
    const history: LivingFact[] = events.filter(e => e.type === 'child.fact_learned' && !gone.has(String(e.payload.factId)))
        .map(e => {
            const fact = e.payload as Payloads['child.fact_learned'];
            return { ...fact, topic: fact.topic.trim().toLowerCase(), eventId: e.event_id, learnedAt: e.occurred_at, learnedOn: familyDay(e.occurred_at), replaces: [] as string[], sequence: e.sequence };
        })
        .sort((a, b) => a.learnedAt.localeCompare(b.learnedAt) || a.sequence - b.sequence)
        .map(({ sequence: _sequence, ...fact }) => fact);
    const byTopic = new Map<string, LivingFact[]>();
    for (const fact of history) byTopic.set(fact.topic, [...(byTopic.get(fact.topic) ?? []), fact]);
    const current = [...byTopic.values()].map(list => ({ ...list.at(-1)!, replaces: list.slice(0, -1).map(f => f.factId) }))
        .sort((a, b) => b.learnedAt.localeCompare(a.learnedAt));
    return { current, history, retracted };
}
