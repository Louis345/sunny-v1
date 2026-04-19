// prefs.js
//
// Persistent preferences. Reads/writes localStorage.
// Tests live in prefs.test.js under the happy-dom environment.
//
// Three responsibilities:
//   - pickStyle(childId, date?) — returns one of the 4 allowed feedback
//     styles for this child-day. Parent override wins when set.
//   - getAudioPrefs() — { sfx, music } booleans, default both true.
//   - setAudioPref(key, bool) — guarded writer, only accepts known keys.

import {
  SUNNY_FEEDBACK,
  SUNNY_STORAGE,
  SUNNY_AUDIO_PREF_KEYS,
} from './constants.js';

// Exposed for tests; not part of the public API.
export function __todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function pickRandom(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

function isAllowedStyle(s) {
  return typeof s === 'string' && SUNNY_FEEDBACK.ALLOWED_STYLES.includes(s);
}

export function pickStyle(childId, date = __todayISO(), rng = Math.random) {
  // 1. Parent override (locked-in via parent dashboard). Wins unconditionally
  //    when valid. Does NOT overwrite the child-day storage — so removing
  //    the override later reverts to the child-day's own pick, not to a
  //    trapped-for-the-day copy of the override value.
  const override = localStorage.getItem(SUNNY_FEEDBACK.PARENT_OVERRIDE_KEY);
  if (override !== null) {
    if (isAllowedStyle(override)) return override;
    console.warn(
      `[pickStyle] parent override "${override}" is not one of ` +
        `${SUNNY_FEEDBACK.ALLOWED_STYLES.join(', ')} — ignoring`
    );
    // fall through to normal path
  }

  // 2. Child-day storage.
  const key = SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY(childId, date);
  const stored = localStorage.getItem(key);
  if (isAllowedStyle(stored)) return stored;

  // 3. Fresh pick. Persists so a reload within the same day is stable.
  const fresh = pickRandom(SUNNY_FEEDBACK.ALLOWED_STYLES, rng);
  localStorage.setItem(key, fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Audio prefs
// ---------------------------------------------------------------------------
// Default both ON. A child should hear the app on first load. Parents can
// toggle either independently from the settings sheet.

export function getAudioPrefs() {
  return {
    sfx: localStorage.getItem(SUNNY_STORAGE.SFX_KEY) !== 'false',
    music: localStorage.getItem(SUNNY_STORAGE.MUSIC_KEY) !== 'false',
  };
}

export function setAudioPref(key, on) {
  if (!SUNNY_AUDIO_PREF_KEYS.includes(key)) {
    throw new Error(
      `[setAudioPref] unknown key "${key}" — allowed: ` +
        SUNNY_AUDIO_PREF_KEYS.join(', ')
    );
  }
  localStorage.setItem(key, String(Boolean(on)));
}
