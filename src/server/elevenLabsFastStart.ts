/**
 * How soon ElevenLabs starts speaking a streamed reply. Its default schedule waits for 120 characters before the first
 * audio (about half of a companion's first sentence); 50 is the smallest it accepts. A finished sentence is flushed so
 * a short "Oh wow!" is spoken at once instead of waiting for more text (owner, 2026-11-21, after a Nuance Labs call).
 */
export const FAST_START_GENERATION_CONFIG = { chunk_length_schedule: [50, 90, 160, 250] } as const;

/** True when the text sent so far ends a sentence, so ElevenLabs may speak it now without hurting her flow. */
export function endsSentence(text: string): boolean {
  return /[.!?]["'’”)\]]?\s*$/.test(text);
}
