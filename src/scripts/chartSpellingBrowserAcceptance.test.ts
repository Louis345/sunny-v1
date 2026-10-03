import { afterEach, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openChart, type ChartDatabase } from '../chart/db';
import { exportEvents } from '../chart/exportEvents';
import { setupChartSpellingRoutes } from '../server/chartSpellingRoutes';
let browser: Browser | undefined, server: ReturnType<ReturnType<typeof express>['listen']> | undefined, db: ChartDatabase | undefined, root: string;
afterEach(async () => { await browser?.close(); if (server)
    await new Promise<void>((r, j) => server!.close(e => e ? j(e) : r())); db?.close(); if (root)
    fs.rmSync(root, { recursive: true, force: true }); });
it.each([{ width: 1280, height: 800, exhaust:false }, { width: 390, height: 844, exhaust:false }, {width:1280,height:800,exhaust:true}])('verifies the kiosk journey and bounded recovery at %j', async (viewport) => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-browser-'));
    db = openChart('synthetic-browser', { chartDir: root });
    let audioCalls = 0, plannerCalls = 0;
    const app = express();
    app.use(express.json());
    setupChartSpellingRoutes(app, { children: ['synthetic-browser'], get: () => db!, token: 'browser-token', parentPin: '123456', voice: { key: 'synthetic-recorded-audio', speak: async () => { audioCalls++; await new Promise(resolve=>setTimeout(resolve,250)); return Buffer.from('audio fixture'); } }, provider: async (stage, packet) => {
            if (++plannerCalls <= (viewport.exhaust ? 3 : 1)) throw new Error('synthetic provider failure');
            const a = packet.assignment.assignment!;
            // Hand-authored recorded-provider fixture; no model executes in this test.
            if (stage === 'prior')
                return { tags: { assignmentId: a.assignmentId, taxonomyVersion: 1, tags: a.words.map(word => ({ word, patterns: ['spelling.silent_letters'] })) }, priors: a.words.map(word => ({ assignmentId: a.assignmentId, word, pCorrect: .5, confidence: .2, expectedError: 'Synthetic fixture' })) };
            if (stage === 'plan')
                return { action: 'targeted_practice', title: 'Silent-letter detective', cards: a.words.map(word => ({ word, instruction: `Notice the silent letter in ${word}. Say the letters, then try.` })) };
            return { assignmentId: a.assignmentId, probabilities: a.words.map(word => ({ word, pCorrect: .6 })), uncertainty: 'Synthetic immediate recall only', missingEvidence: ['delayed recall'], responseIds: packet.assignment.recallChecks.map(r => r.eventId) };
        } });
    app.use(express.static(path.resolve('web/dist')));
    app.get('/spelling', (_req, res) => res.sendFile(path.resolve('web/dist/index.html')));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server!.once('listening', r));
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
    const page = await browser.newPage({ viewport:{width:viewport.width,height:viewport.height} });
    await page.addInitScript("window.__plays = 0; HTMLMediaElement.prototype.play = function() { window.__plays++; setTimeout(() => this.onended && this.onended(), 0); return Promise.resolve(); }");
    await page.goto(`http://127.0.0.1:${(server.address() as any).port}/spelling?sunnyKioskToken=browser-token`);
    await page.getByRole('heading', { name: 'Your spelling journey' }).waitFor({ timeout: 5000 });
    expect(await page.getByRole('button', { name: 'Parent area' }).count()).toBe(1);
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    for (let week = 1; week <= 3; week++) {
        await page.getByRole('button', { name: 'Parent area', exact: true }).click();
        await page.getByLabel('Parent PIN').fill('123456');
        await page.getByLabel('Words, one per line').fill('knee\nknow');
        const date = `2026-10-${10 + week}`;
        await page.getByLabel('Scheduled school test').fill(date);
        await page.getByRole('button', { name: 'Save confirmed list' }).click();
        await page.getByRole('button', { name: new RegExp(date) }).waitFor();
        await page.getByRole('button', { name: 'Back to child view' }).click();
        await page.getByRole('button', { name: new RegExp(date) }).click();
        await page.getByRole('button', { name: 'Prepare next step' }).click();
        if (week === 1) {
            await page.getByRole('alert').waitFor();
            await page.getByRole('button',{name:'Parent area',exact:true}).click();
            await page.getByLabel('Parent PIN').fill('123456');
            await page.getByRole('button',{name:new RegExp(date)}).click();
            await page.getByText('Recover an interrupted step',{exact:true}).click();
            await page.getByLabel('I acknowledge the previous request may have completed').check();
            await page.getByRole('button',{name:'Try Planner again',exact:true}).click();
            if(viewport.exhaust){
                await page.getByRole('alert').waitFor();
                await page.getByRole('button',{name:'Try Planner again',exact:true}).click();
                await page.getByText('Three attempts failed. This step needs repair before more requests can run.',{exact:true}).waitFor();
                expect(await page.getByRole('button',{name:'Try Planner again',exact:true}).isDisabled()).toBe(true);
                expect(plannerCalls).toBe(3);
                expect(exportEvents(db).filter(e=>e.type==='prediction.prior')).toHaveLength(0);
                return;
            }
            await page.getByRole('button',{name:'Back to child view'}).click();
            await page.getByRole('button',{name:new RegExp(date)}).click();
        }
        for (const stage of ['Discovery', 'Practice', 'Recall check']) {
            if (stage === 'Practice')
                await page.getByRole('button', { name: 'Prepare next step' }).click();
            for (let word = 0; word < 2; word++) {
                await page.getByRole('button', { name: word ? 'Continue' : 'Start', exact: true }).click();
                if (stage !== 'Practice')
                    expect(await page.locator('.spelling-target').count()).toBe(0);
                if(week===1 && stage==='Discovery' && word===0){
                    await page.getByRole('button', {name:'Hear the word',exact:true}).click();
                    await page.getByRole('button', {name:'Save my place & leave'}).click();
                    await page.waitForTimeout(600);
                    expect(await page.evaluate('window.__plays')).toBe(0);
                    await page.getByRole('button',{name:new RegExp(date)}).click();
                    await page.getByRole('button',{name:'Start',exact:true}).click();
                }
                await page.getByRole('button', { name: 'Hear the word', exact: true }).click();
                if (week === 1 && stage === 'Discovery' && word === 1) await page.getByRole('button', {name:'Hear it again',exact:true}).click();
                await page.getByLabel('Your spelling', { exact: true }).fill(word ? 'know' : 'knee');
                await page.getByRole('button', { name: 'Save answer', exact: true }).click();
            }
        }
        await page.getByRole('button', { name: 'Prepare next step' }).click();
        await page.getByRole('heading', { name: 'All done for now' }).waitFor();
        await page.getByRole('button', { name: 'Parent area', exact: true }).click();
        await page.getByLabel('Parent PIN').fill('123456');
        await page.getByRole('button', { name: new RegExp(date) }).click();
        await page.getByRole('button', { name: 'View words and forecast' }).click();
        await page.getByLabel('knee', { exact: true }).selectOption('correct');
        await page.getByLabel('know', { exact: true }).selectOption('incorrect');
        await page.getByRole('button', { name: 'Confirm school results' }).click();
        await page.getByRole('heading', { name: 'School result recorded' }).waitFor();
        await page.getByRole('button', { name: 'Save my place & leave' }).click();
        await page.getByRole('button', { name: 'View report', exact: true }).click();
        await page.locator('tbody tr').nth(week - 1).waitFor();
        expect(await page.locator('tbody tr').count()).toBe(week);
        await page.getByRole('heading', { name: 'Patterns across weeks' }).waitFor({timeout:3000});
        expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
        if (week === 3)
            await page.screenshot({ path: path.join(os.tmpdir(), `sunny-spelling-report-${viewport.width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Back to child view' }).click();
    }
    expect(audioCalls).toBe(2);
    const replayCounts=exportEvents(db).filter(e=>e.type==='response.observed').map(e=>(e.payload.support as {audioReplays:number}).audioReplays);
    expect(replayCounts.filter(n=>n===1)).toHaveLength(1);
    expect(replayCounts.filter(n=>n===0)).toHaveLength(17);
}, 90000);
