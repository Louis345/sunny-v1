import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { ELLI } from '../../companions/loader';
import type { SpellingVoice } from './audio';
/** Uses Sunny's existing Elli voice. No request runs until the child asks to hear a word. */
export const spellingVoice: SpellingVoice = { key: `${ELLI.voiceId}:eleven_flash_v2_5`, async speak(word) {
        if (!process.env.ELEVENLABS_API_KEY)
            throw new Error('elevenlabs_key_missing');
        const audio = await new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }).textToSpeech.convert(ELLI.voiceId, { text: word, modelId: 'eleven_flash_v2_5' }, { maxRetries: 0, timeoutInSeconds: 60 });
        const chunks: Buffer[] = [];
        let count = 0;
        for await (const chunk of audio) {
            if (++count > 10000)
                throw new Error('audio_size_limit');
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    } };
