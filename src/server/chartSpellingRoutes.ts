import path from 'node:path';
import { exportEvents } from '../chart/exportEvents';
import { cachedSpellingAudio, type SpellingVoice } from '../chart/spelling/audio';
import type { Express, Request, Response, NextFunction } from 'express';
import type { ChartDatabase } from '../chart/db';
import { createSpellingJourney, type SpellingProvider } from '../chart/spelling/journey';
type Options = {
    children: string[];
    get: (child: string) => ChartDatabase;
    token: string;
    parentPin: string;
    provider: SpellingProvider;
    voice?: SpellingVoice;
};
export function setupChartSpellingRoutes(app: Express, opts: Options) {
    if (!opts.token || opts.parentPin.length < 6)
        throw new Error('spelling_kiosk_token_and_parent_pin_required');
    const safe = (s: ReturnType<ReturnType<typeof createSpellingJourney>['state']>) => ({ assignmentId: s.assignmentId, stage: s.stage, completed: s.completed, total: s.total, title: s.title, testDate: s.testDate });
    app.get('/api/spelling/config', (_req, res) => res.json({ enabled: true, children: opts.children }));
    app.use('/api/spelling/:child', (req: Request, res: Response, next: NextFunction) => {
        if (req.headers['x-sunny-kiosk-token'] !== opts.token) {
            res.status(401).json({ error: 'kiosk_identity_required' });
            return;
        }
        if (!opts.children.includes(String(req.params.child))) {
            res.status(404).json({ error: 'child_not_active' });
            return;
        }
        next();
    });
    app.post('/api/spelling/:child/audio', (req, res) => {
        Promise.resolve().then(async () => {
            if (!opts.voice)
                throw new Error('audio_unavailable');
            const db = opts.get(String(req.params.child));
            const item = exportEvents(db).find(e => e.type === 'item.presented' && e.payload.itemId === req.body?.itemId);
            if (!item)
                throw new Error('presentation_missing');
            const bytes = await cachedSpellingAudio(path.join(path.dirname(db.path), db.childId, 'audio'), opts.voice)(String(item.payload.word));
            res.setHeader('content-type', 'audio/mpeg');
            res.setHeader('cache-control', 'no-store');
            res.send(bytes);
        }).catch(error => { console.error(' 🎮 [spelling] [audio] [failed]', error); res.status(409).json({ error: error instanceof Error ? error.message : 'audio_unavailable' }); });
    });
    const parent = (req: Request) => { if (req.headers['x-sunny-parent-pin'] !== opts.parentPin)
        throw new Error('parent_access_required'); };
    const route = (method: 'get' | 'post', suffix: string, handler: (j: ReturnType<typeof createSpellingJourney>, req: Request) => unknown | Promise<unknown>, parentOnly = false) => {
        app[method]('/api/spelling/:child/' + suffix, (req, res) => {
            Promise.resolve().then(() => { if (parentOnly)
                parent(req); return handler(createSpellingJourney(opts.get(String(req.params.child)), opts.provider), req); })
                .then(value => res.json(value)).catch(error => { const message = error instanceof Error ? error.message : 'spelling_request_failed'; console.error(' 🎮 [spelling] [request] [rejected]', message); res.status(message === 'parent_access_required' ? 403 : 409).json({ error: message }); });
        });
    };
    route('get', 'assignments', j => j.assignments().map(safe));
    route('post', 'assignments', (j, r) => j.ingest(r.body), true);
    route('post', 'profile', (j, r) => j.profile(r.body), true);
    route('get', 'report', j => j.report(), true);
    route('get', 'assignments/:assignment', (j, r) => safe(j.state(String(r.params.assignment))));
    route('get', 'assignments/:assignment/parent', (j, r) => j.state(String(r.params.assignment)).view, true);
    route('post', 'assignments/:assignment/advance', async (j, r) => safe(await j.advance(String(r.params.assignment))));
    route('post', 'assignments/:assignment/present', (j, r) => { const item = j.present(String(r.params.assignment)); const { word, ...hidden } = item; return item.instrument === 'practice' ? item : hidden; });
    route('post', 'assignments/:assignment/respond', (j, r) => { const e = j.respond(String(r.params.assignment), r.body); return { eventId: e.event_id, state: safe(j.state(String(r.params.assignment))) }; });
    route('post', 'assignments/:assignment/school', (j, r) => j.school(String(r.params.assignment), r.body), true);
}
