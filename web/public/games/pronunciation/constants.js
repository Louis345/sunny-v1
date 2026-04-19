// constants.js
//
// Single source of truth for every tunable value in the game.
// No magic numbers anywhere else. Parent dashboard overrides will wire in
// here when Sunny migration happens — one patch site, zero scattered edits.

export const SUNNY_AUDIO = {
  HEARTBEAT_BPM: 78,

  // HEARTBEAT_GAIN is the MASTER BUS gain for the heartbeat voices.
  // softKick() and shaker() in game.js use their own per-hit peaks
  // (0.22 on beat 1, 0.14 on beat 3, etc., matching Audio Moodboard v2).
  // Ducking modulates THIS bus, not the per-voice gains.
  HEARTBEAT_GAIN: 0.18,
  HEARTBEAT_DUCK_GAIN: 0.06,

  // Duck window centered on a chime: 200ms down + 200ms bottom + 200ms up
  // = 600ms total. Matches test #8 ("≤600ms then recovers"). Overlapping
  // chimes reschedule; there is no stacking hold.
  HEARTBEAT_DUCK_RAMP_MS: 200,
  HEARTBEAT_DUCK_HOLD_MS: 200,

  CHIME_HIT_PITCH_RANGE_SEMITONES: 2,
  CHIME_MISS_FIXED: true,

  MUSIC_FADE_OUT_MS: 400,
  MUSIC_FADE_IN_MS: 600,
};

export const SUNNY_FEEDBACK = {
  ALLOWED_STYLES: ['stamp', 'shock', 'glow', 'boom'],
  PARENT_OVERRIDE_KEY: 'sunny.styleOverride',

  // Child-day persistence: one style per child per day.
  STYLE_PERSISTENCE_KEY: (childId, date) => `sunny.style.${childId}.${date}`,

  MAX_HUE_SHIFT_BETWEEN_HITS: 120,   // degrees
  MAX_DURATION_JITTER: 0.20,         // fraction of base (±20%)
  MAX_POSITION_JITTER_PX: 10,
};

export const SUNNY_STORAGE = {
  SFX_KEY: 'sunny.sfxOn',
  MUSIC_KEY: 'sunny.musicOn',
  MUSIC_TOOLTIP_SEEN_KEY: 'sunny.tooltipMusicSeen',
};

// Allowed keys for setAudioPref — defense against typo'd writes.
export const SUNNY_AUDIO_PREF_KEYS = [
  SUNNY_STORAGE.SFX_KEY,
  SUNNY_STORAGE.MUSIC_KEY,
];
