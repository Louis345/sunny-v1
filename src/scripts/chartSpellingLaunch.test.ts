import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spellingKioskEnvironment } from './chartSpellingLaunch';
it('declares the chart directory without creating a parent PIN', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-launch-'));
    try {
        const first = spellingKioskEnvironment({ HOME: root }, root);
        const second = spellingKioskEnvironment({ HOME: root }, root);
        expect(first.SUNNY_CHART_DIR).toBe(path.join(root, 'SunnyData'));
        expect(first.SUNNY_SPELLING_CHART).toBe('1');
        expect(second).toEqual(first);
        expect(fs.existsSync(path.join(root, 'SunnyData/kiosk-settings.json'))).toBe(false);

    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
