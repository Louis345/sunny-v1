import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export type SpellingVoice = {
    key: string;
    speak: (word: string) => Promise<Buffer>;
};
export function cachedSpellingAudio(directory: string, voice: SpellingVoice) {
    return async (word: string) => {
        const key = createHash('sha256').update(JSON.stringify([voice.key, word])).digest('hex');
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const audio = path.join(directory, key + '.mp3');
        const pending = path.join(directory, key + '.requested');
        if (fs.existsSync(audio))
            return fs.readFileSync(audio);
        if (fs.existsSync(pending))
            throw new Error('audio_needs_attention: request already started');
        const claim = fs.openSync(pending, 'wx', 0o600);
        fs.closeSync(claim);
        console.error(' 🎮 [spelling-audio] [request] [started]');
        try {
            const buffer = await voice.speak(word);
            if (!buffer.length)
                throw new Error('audio_empty');
            const file = fs.openSync(audio + '.partial', 'wx', 0o600);
            try {
                fs.writeFileSync(file, buffer);
                fs.fsyncSync(file);
            }
            finally {
                fs.closeSync(file);
            }
            fs.renameSync(audio + '.partial', audio);
            console.error(' 🎮 [spelling-audio] [request] [saved]');
            return buffer;
        }
        catch (error) {
            console.error(' 🎮 [spelling-audio] [request] [needs_attention]', error);
            throw error;
        }
    };
}
