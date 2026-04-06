import type { VoiceAudition } from "./pick-voice";

/**
 * ElevenLabs premade "Charlotte" — default when `SUNNY_SUBJECT=diag` if
 * `ELEVENLABS_VOICE_ID_DIAG` is unset (see session-manager). Child sessions
 * unchanged unless env points at this id.
 */
export const CHARLOTTE_DIAG_DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa";

/**
 * Female premade voices with British or UK-adjacent accents from ElevenLabs premade catalog
 * (see https://elevenlabs-sdk.mintlify.app/voices/premade-voices — accent column).
 * Use with `npm run voice-creator` to pick ELEVENLABS_VOICE_ID_DIAG.
 */
export const britishFemaleDiagVoices: VoiceAudition[] = [
  {
    name: "Alice",
    id: "Xb7hH8MSUJpSbSDYk0k2",
    emoji: "📰",
    pitch:
      "British, confident, news-adjacent — excellent when you want diagnostics to sound clear and authoritative without being cold.",
  },
  {
    name: "Dorothy",
    id: "ThT5KcBeYPX3keUQqHPh",
    emoji: "📚",
    pitch:
      "British, young, pleasant — tuned for children's stories, so warm and approachable for demoing Sunny to a creator.",
  },
  {
    name: "Lily",
    id: "pFZP5JQG7iQjIQuC4Bku",
    emoji: "🎭",
    pitch:
      "British, middle-aged, slightly raspy narration — distinctive and memorable for walkthroughs.",
  },
  {
    name: "Charlotte",
    id: CHARLOTTE_DIAG_DEFAULT_VOICE_ID,
    emoji: "👑",
    pitch:
      "English–Swedish blend (not pure RP) — velvety, game-trailer energy; good if you want a slightly theatrical diag host.",
  },
  {
    name: "Mimi",
    id: "zrHiDhphv9ZnVXBqCLjz",
    emoji: "🌈",
    pitch:
      "English–Swedish, bright and child-adjacent — high energy; try if you want diagnostics to feel playful.",
  },
];
