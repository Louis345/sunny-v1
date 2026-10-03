import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spellingKioskEnvironment } from './chartSpellingLaunch';
it('declares one external chart directory and reuses private parent settings across launches', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-launch-'));
    try {
        const first = spellingKioskEnvironment({ HOME: root }, root);
        const second = spellingKioskEnvironment({ HOME: root }, root);
        expect(first.SUNNY_CHART_DIR).toBe(path.join(root, 'SunnyData'));
        expect(first.SUNNY_SPELLING_CHART).toBe('1');
        expect(first.SUNNY_PARENT_PIN).toMatch(/^\d{6}$/);
        expect(second.SUNNY_PARENT_PIN).toBe(first.SUNNY_PARENT_PIN);
        expect(fs.readdirSync(path.join(root, 'SunnyData'))).toEqual(['kiosk-settings.json']);
        expect(fs.statSync(path.join(root, 'SunnyData/kiosk-settings.json')).mode & 0o777).toBe(0o600);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
