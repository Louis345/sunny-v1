import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cachedSpellingAudio } from '../chart/spelling/audio';
it('buys a word once across repeated plays and restarts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-audio-'));
    let calls = 0;
    const speak = async () => { calls++; return Buffer.from('audio fixture'); };
    try {
        const a = cachedSpellingAudio(root, { key: 'test-voice', speak });
        expect(await a('able')).toEqual(Buffer.from('audio fixture'));
        expect(await a('able')).toEqual(Buffer.from('audio fixture'));
        expect(await cachedSpellingAudio(root, { key: 'test-voice', speak })('able')).toEqual(Buffer.from('audio fixture'));
        expect(calls).toBe(1);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
it('does not repeat a request after an uncertain audio failure', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-audio-'));
    let calls = 0;
    const speak = async () => { calls++; throw new Error('lost'); };
    try {
        await expect(cachedSpellingAudio(root, { key: 'v', speak })('able')).rejects.toThrow('lost');
        await expect(cachedSpellingAudio(root, { key: 'v', speak })('able')).rejects.toThrow('needs_attention');
        expect(calls).toBe(1);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
