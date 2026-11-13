import type { ChartEvent } from '../eventTypes';
import { orderedFacts } from './projections';
import type { Payloads } from './schemas';

/**
 * Owner 2026-11-12: the Planner's locked predictions and the graded school test, bonded word by word, so any model
 * reading her chart months later sees what was predicted, by which model, when, and what she actually wrote.
 * Pure arithmetic over facts already in the chart; no AI, no thresholds, nothing summarized.
 */
type Locked = ChartEvent & { payload: Payloads['prediction.locked'] };
type School = ChartEvent & { payload: Payloads['school_test.recorded'] };
type Scored = Payloads['prediction.scored'];

const round = (value: number) => Math.round(value * 100) / 100;

/** The bond code would write now for this week's school test, or null when no test is recorded. */
export function scoreLockedPredictions(events: readonly ChartEvent[], assignmentId: string): Scored | null {
  const facts = orderedFacts(events).filter(e => e.payload.assignmentId === assignmentId);
  const school = facts.find(e => e.type === 'school_test.recorded') as School | undefined;
  if (!school) return null;
  // Only predictions locked before the test entered her chart count (the chart refuses later ones anyway).
  const locks = facts.filter(e => e.type === 'prediction.locked' && e.sequence < school.sequence) as Locked[];
  const rows = school.payload.results.map(result => ({
    word: result.word, correct: result.correct, writtenResponse: result.writtenResponse,
    predictions: locks.filter(lock => lock.payload.word === result.word)
      .sort((a, b) => a.payload.lockedAt.localeCompare(b.payload.lockedAt) || a.sequence - b.sequence)
      .map(lock => ({ predictionEventId: lock.event_id, predictionId: lock.payload.predictionId, metric: lock.payload.metric, expected: lock.payload.expected,
        confidence: lock.payload.confidence, modelId: lock.payload.modelId, lockedAt: lock.payload.lockedAt })),
  }));
  const right = rows.filter(row => row.correct).length;
  // The list-level call: each word's latest lock, summed. A word without one leaves the list call unmade. Code's
  // baseline forecast is shown beside it, never as the call (2026-11-13).
  const latest = rows.map(row => row.predictions.filter(prediction => !String(prediction.modelId ?? "").startsWith("code-baseline")).at(-1));
  const predictedRight = latest.every(Boolean) && rows.length
    ? { min: round(latest.reduce((sum, row) => sum + row!.expected.min, 0)), max: round(latest.reduce((sum, row) => sum + row!.expected.max, 0)) }
    : null;
  return { assignmentId, version: 1, schoolTestEventId: school.event_id, testDate: school.payload.testDate, rows,
    summary: { words: rows.length, right, predictedRight, inRange: predictedRight ? right >= predictedRight.min && right <= predictedRight.max : null } };
}

const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const percent = (value: number) => String(Math.round(value * 100));
const day = (iso: string) => iso.slice(0, 10);

/** Her weeks (or one week), oldest first, as plain lines: the list call, then each word's latest locked prediction and her answer. */
export function predictionHistoryLines(events: readonly ChartEvent[], onlyAssignmentId?: string): string[] {
  const facts = orderedFacts(events);
  const weeks = [...new Set(facts.filter(e => e.type === 'prediction.locked' || e.type === 'school_test.recorded').map(e => String(e.payload.assignmentId)))]
    .filter(id => !onlyAssignmentId || id === onlyAssignmentId);
  return weeks.flatMap(assignmentId => {
    const stored = facts.find(e => e.type === 'prediction.scored' && e.payload.assignmentId === assignmentId);
    const scored = (stored?.payload as Scored | undefined) ?? scoreLockedPredictions(facts, assignmentId);
    if (!scored) {
      const locks = facts.filter(e => e.type === 'prediction.locked' && e.payload.assignmentId === assignmentId).length;
      return [`${assignmentId}: no graded school test yet; ${locks} prediction${locks === 1 ? '' : 's'} locked`];
    }
    const s = scored.summary;
    // Code's baseline beside the call, so the AI can be compared with plain arithmetic (2026-11-13).
    const baseline = scored.rows.map(row => row.predictions.filter(prediction => String(prediction.modelId ?? "").startsWith("code-baseline")).at(-1));
    const baselineLine = baseline.length && baseline.every(Boolean)
      ? [`- code baseline (no AI) predicted ${number(baseline.reduce((sum, row) => sum + row!.expected.min, 0))} right`] : [];
    const call = s.predictedRight ? `predicted ${number(s.predictedRight.min)} to ${number(s.predictedRight.max)} right; ${s.inRange ? 'inside the prediction' : 'outside the prediction'}` : 'no prediction for every word';
    return [`${assignmentId}: school test ${scored.testDate}: ${s.right} of ${s.words} right; ${call}${stored ? '' : ' (not yet bonded)'}`,
      ...baselineLine,
      ...scored.rows.map(row => {
        const p = row.predictions.filter(prediction => !String(prediction.modelId ?? "").startsWith("code-baseline")).at(-1);
        const predicted = p ? `predicted ${percent(p.expected.min)}-${percent(p.expected.max)}% right on her own (confidence ${p.confidence ?? 'not stated'}, model ${p.modelId ?? 'not recorded'}, locked ${day(p.lockedAt)})${row.predictions.length > 1 ? `; ${row.predictions.length - 1} earlier` : ''}` : 'no locked prediction';
        return `- ${row.word}: ${predicted}; school test: ${row.correct ? 'right' : `missed${row.writtenResponse ? `, wrote "${row.writtenResponse}"` : ''}`}`;
      }),
      // A teacher may test part of the list: the rest stay unknown, said plainly (2026-11-13).
      ...(() => {
        const tested = new Set(scored.rows.map(row => row.word));
        const untested = [...new Set(facts.filter(e => e.type === 'prediction.locked' && e.payload.assignmentId === assignmentId).map(e => String(e.payload.word)))].filter(word => !tested.has(word));
        return untested.length ? [`- not on the school test, still unknown: ${untested.join(', ')}`] : [];
      })()];
  });
}
