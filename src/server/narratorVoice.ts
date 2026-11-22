/**
 * The game's narrator (owner, 2026-11-22: the ring announcer speaks, the commentators wait). Game speech — the problem,
 * the instruction, the test word — is read in the announcer's ElevenLabs voice, the same one that recorded the Orb
 * announcer bank; the companion's voice belongs only to her own model output.
 */
export const NARRATOR_VOICE_ID = process.env.ELEVENLABS_NARRATOR_VOICE_ID?.trim() || "cgSgspJ2msm6clMCkdW9";
