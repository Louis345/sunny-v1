import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openChart, type ChartDatabase } from '../chart/db';
import { exportEvents } from '../chart/exportEvents';
import { createSpellingJourney, type SpellingProvider } from '../chart/spelling/journey';
let root: string;
let db: ChartDatabase;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-journey-')); db = openChart('synthetic-journey', { chartDir: root }); });
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
const provider: SpellingProvider = async (stage, packet) => {
    const a = packet.assignment.assignment!;
    if (stage === 'prior')
        return { tags: { assignmentId: a.assignmentId, taxonomyVersion: 1, tags: a.words.map(word => ({ word, patterns: ['spelling.silent_letters'] })) }, priors: a.words.map(word => ({ assignmentId: a.assignmentId, word, pCorrect: .5, confidence: .2, expectedError: 'No measured history yet' })) };
    if (stage === 'plan')
        return { action: 'targeted_practice', title: 'Word detective', cards: a.words.map(word => ({ word, instruction: `Look closely at ${word}. Say its letters, then try it.` })) };
    return { assignmentId: a.assignmentId, probabilities: a.words.map(word => ({ word, pCorrect: .65 })), uncertainty: 'One immediate recall only', missingEvidence: ['delayed recall'], responseIds: packet.assignment.recallChecks.map(r => r.eventId) };
};
function setup(p = provider) { return createSpellingJourney(db, p); }
async function measure(j: ReturnType<typeof setup>, id: string) {
    for (let i = 0; i < 2; i++) {
        const item = j.present(id);
        j.respond(id, { itemId: item.itemId, rawResponse: i ? '' : 'knee', status: i ? 'unknown' : 'answered', audioReplays: 0 });
    }
}
it('closes three synthetic weeks and resumes without repeating an answer', async () => {
    const calls = vi.fn(provider);
    const j = setup(calls);
    for (let week = 1; week <= 3; week++) {
        const a = j.ingest({ words: ['knee', 'know'], testDate: `2026-10-${10 + week}`, sourceText: 'knee\nknow' });
        expect(a).toMatchObject({ sourceKind: 'parent_transcription' });
        expect(j.state(a.assignmentId).stage).toBe('prior');
        expect(() => j.present(a.assignmentId)).toThrow('stage');
        await j.advance(a.assignmentId);
        expect(calls.mock.calls.at(-1)![1].accuracy).toHaveLength(week);
        const first = j.present(a.assignmentId);
        const body = { itemId: first.itemId, rawResponse: 'knee', status: 'answered' as const, audioReplays: 0 };
        j.respond(a.assignmentId, body);
        j.respond(a.assignmentId, body);
        expect(j.state(a.assignmentId).completed).toBe(1);
        const restarted = setup(calls);
        const second = restarted.present(a.assignmentId);
        expect(second.itemId).not.toBe(first.itemId);
        restarted.respond(a.assignmentId, { itemId: second.itemId, rawResponse: null, status: 'unknown', audioReplays: 0 });
        expect(j.state(a.assignmentId).stage).toBe('plan');
        await j.advance(a.assignmentId);
        await measure(j, a.assignmentId);
        expect(j.state(a.assignmentId).stage).toBe('recall_check');
        await measure(j, a.assignmentId);
        expect(j.state(a.assignmentId).stage).toBe('forecast');
        await j.advance(a.assignmentId);
        j.school(a.assignmentId, { testDate: `2026-10-${10 + week}`, sourceText: 'graded paper confirmed by parent', results: [{ word: 'knee', correct: true, writtenResponse: 'knee' }, { word: 'know', correct: false, writtenResponse: 'no' }] });
        expect(j.state(a.assignmentId).stage).toBe('complete');
    }
    expect(j.report().weeks).toHaveLength(3);
    expect(j.report().weeks.every(w => w.prior.coverage.matched === 1 && w.forecast.coverage.matched === 2)).toBe(true);
    expect(exportEvents(db).filter(e => e.type === 'response.observed')).toHaveLength(18);
});
it('cannot submit another item, caller correctness, or school results with incomplete coverage', async () => {
    const j = setup();
    const a = j.ingest({ words: ['knee', 'know'], testDate: '2026-10-10', sourceText: 'knee know' });
    await j.advance(a.assignmentId);
    expect(() => j.respond(a.assignmentId, { itemId: 'forged', rawResponse: 'knee', status: 'answered', audioReplays: 0 })).toThrow();
    const item = j.present(a.assignmentId);
    expect(() => j.respond(a.assignmentId, { itemId: item.itemId, rawResponse: 'knee', status: 'answered', audioReplays: 0, correct: true } as any)).toThrow();
    expect(() => j.school(a.assignmentId, { testDate: '2026-10-10', sourceText: 'result', results: [] })).toThrow();
});
it('does not repeat an uncertain provider request after restart', async () => {
    const broken = vi.fn(async () => { throw new Error('connection lost'); });
    const j = setup(broken);
    const a = j.ingest({ words: ['knee', 'know'], testDate: '2026-10-10', sourceText: 'knee know' });
    await expect(j.advance(a.assignmentId)).rejects.toThrow('connection lost');
    await expect(setup(broken).advance(a.assignmentId)).rejects.toThrow('needs_attention');
    expect(broken).toHaveBeenCalledTimes(1);
    expect(exportEvents(db).filter(e => e.type === 'prediction.prior')).toHaveLength(0);
});
it('invalid proposals write neither partial tags nor partial priors and are not repurchased', async () => {
    const bad = vi.fn(async () => ({ tags: {}, priors: [] }));
    const j = setup(bad);
    const a = j.ingest({ words: ['knee'], testDate: '2026-10-10', sourceText: 'knee' });
    await expect(j.advance(a.assignmentId)).rejects.toThrow();
    await expect(j.advance(a.assignmentId)).rejects.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(exportEvents(db)).toHaveLength(1);
});
it('refuses a saved Planner proposal if its input chart changed while the request ran', async () => {
    let release!: (p: unknown) => void;
    const waiting: SpellingProvider = async () => new Promise(r => { release = r; });
    const j = setup(waiting);
    const a = j.ingest({ words: ['knee'], testDate: '2026-10-10', sourceText: 'knee' });
    const pending = j.advance(a.assignmentId);
    j.profile({ displayName: 'Synthetic', interests: ['mysteries'] });
    release({ tags: { assignmentId: a.assignmentId, taxonomyVersion: 1, tags: [{ word: 'knee', patterns: ['spelling.silent_letters'] }] }, priors: [{ assignmentId: a.assignmentId, word: 'knee', pCorrect: .5, confidence: .2, expectedError: 'Unknown' }] });
    await expect(pending).rejects.toThrow('planner_stale_chart');
    expect(exportEvents(db).filter(e => e.type === 'prediction.prior')).toHaveLength(0);
});
it('cites the chart facts supplied to a new prior, including the child profile', async () => {
    const j = setup();
    const profile = j.profile({ displayName: 'Synthetic', interests: ['mysteries'] });
    const a = j.ingest({ words: ['knee'], testDate: '2026-10-10', sourceText: 'knee' });
    await j.advance(a.assignmentId);
    expect(exportEvents(db).find(e => e.type === 'prediction.prior')!.cites).toContain(profile.event_id);
});
it('uses the existing child-chart doorway without reading legacy learning files', async () => {
    const { getChildChart } = await import('../profiles/childChart');
    const read = fs.readFileSync;
    const guard = vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, ...args: any[]) => { if (/word_bank|learning_profile|homework\/cycles/.test(String(file)))
        throw new Error('legacy_read'); return (read as any)(file, ...args); }) as any);
    try {
        const chart = getChildChart(db.childId, { department: 'spelling', database: db } as any) as any;
        expect(chart.events).toEqual([]);
        expect(chart.profile).toBe(null);
    }
    finally {
        guard.mockRestore();
    }
});
it('catalogs the instrument and cites the captured assignment before it is playable',async()=>{
 const j=setup();const a=j.ingest({words:['knee'],testDate:'2026-10-10',sourceText:'knee'});await j.advance(a.assignmentId);const item=j.present(a.assignmentId);
 expect(item).toHaveProperty('catalog.algorithmTargets',['retrieval practice']);
 const assignment=exportEvents(db).find(e=>e.type==='assignment.ingested')!;
 expect(exportEvents(db).find(e=>e.event_id===item.presentationId)!.cites).toContain(assignment.event_id);
});
