// @vitest-environment happy-dom
//
// prefs.test.js
//
// Tests that depend on window.localStorage. Split from logic.test.js so the
// pure tests stay Node-only (fast) and only this file pays the DOM boot cost.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pickStyle,
  getAudioPrefs,
  setAudioPref,
  __todayISO,
} from './prefs.js';
import { SUNNY_FEEDBACK, SUNNY_STORAGE } from './constants.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ============================================================================
// pickStyle — child-day persistence + parent override
// ============================================================================

describe('pickStyle', () => {
  it('picks one of the four allowed styles for a new child-day', () => {
    const s = pickStyle('ila', '2026-04-19');
    expect(SUNNY_FEEDBACK.ALLOWED_STYLES).toContain(s);
  });

  it('persists the pick under sunny.style.${childId}.${date}', () => {
    pickStyle('ila', '2026-04-19');
    const key = SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('ila', '2026-04-19');
    expect(SUNNY_FEEDBACK.ALLOWED_STYLES).toContain(localStorage.getItem(key));
  });

  it('returns the same style when called twice on the same child-day', () => {
    const a = pickStyle('ila', '2026-04-19');
    const b = pickStyle('ila', '2026-04-19');
    expect(a).toBe(b);
  });

  it('picks a fresh style on a new date for the same child', () => {
    // Force a specific first pick by pre-seeding storage.
    const key = SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('ila', '2026-04-19');
    localStorage.setItem(key, 'stamp');
    expect(pickStyle('ila', '2026-04-19')).toBe('stamp');

    // New day → no stored value → fresh pick (still in allowed set,
    // may or may not equal previous day).
    const next = pickStyle('ila', '2026-04-20');
    expect(SUNNY_FEEDBACK.ALLOWED_STYLES).toContain(next);
    expect(localStorage.getItem(
      SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('ila', '2026-04-20')
    )).toBe(next);
  });

  it('isolates different children on the same date', () => {
    const aKey = SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('ila', '2026-04-19');
    const bKey = SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('reina', '2026-04-19');
    localStorage.setItem(aKey, 'stamp');
    localStorage.setItem(bKey, 'glow');
    expect(pickStyle('ila', '2026-04-19')).toBe('stamp');
    expect(pickStyle('reina', '2026-04-19')).toBe('glow');
  });

  it('parent override wins when valid', () => {
    localStorage.setItem(SUNNY_FEEDBACK.PARENT_OVERRIDE_KEY, 'glow');
    expect(pickStyle('ila', '2026-04-19')).toBe('glow');
    expect(pickStyle('reina', '2026-05-01')).toBe('glow');
  });

  it('parent override does NOT overwrite the child-day storage', () => {
    // Otherwise removing the override later would trap the child on the
    // overridden style for the rest of that day.
    localStorage.setItem(SUNNY_FEEDBACK.PARENT_OVERRIDE_KEY, 'glow');
    pickStyle('ila', '2026-04-19');
    const key = SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('ila', '2026-04-19');
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('invalid parent override is ignored with a console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(SUNNY_FEEDBACK.PARENT_OVERRIDE_KEY, 'gentle');
    const s = pickStyle('ila', '2026-04-19');
    expect(SUNNY_FEEDBACK.ALLOWED_STYLES).toContain(s);
    expect(s).not.toBe('gentle');
    expect(warn).toHaveBeenCalled();
  });

  it('ignores a stored child-day value that is not an allowed style', () => {
    // Defensive — stale values from an old build shouldn't poison the session.
    const key = SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('ila', '2026-04-19');
    localStorage.setItem(key, 'rainbow');
    const s = pickStyle('ila', '2026-04-19');
    expect(SUNNY_FEEDBACK.ALLOWED_STYLES).toContain(s);
    expect(s).not.toBe('rainbow');
    expect(localStorage.getItem(key)).toBe(s); // repaired
  });

  it('defaults the date to today when not provided', () => {
    const s = pickStyle('ila');
    expect(SUNNY_FEEDBACK.ALLOWED_STYLES).toContain(s);
    expect(localStorage.getItem(
      SUNNY_FEEDBACK.STYLE_PERSISTENCE_KEY('ila', __todayISO())
    )).toBe(s);
  });
});

// ============================================================================
// getAudioPrefs / setAudioPref
// ============================================================================

describe('getAudioPrefs', () => {
  it('defaults both sfx and music to ON when never set', () => {
    const p = getAudioPrefs();
    expect(p.sfx).toBe(true);
    expect(p.music).toBe(true);
  });

  it('reads false when explicitly set false', () => {
    localStorage.setItem(SUNNY_STORAGE.SFX_KEY, 'false');
    localStorage.setItem(SUNNY_STORAGE.MUSIC_KEY, 'false');
    const p = getAudioPrefs();
    expect(p.sfx).toBe(false);
    expect(p.music).toBe(false);
  });

  it('treats any value other than "false" as true (including empty)', () => {
    // A bug-report shape: we never want silent-by-default.
    localStorage.setItem(SUNNY_STORAGE.SFX_KEY, '');
    expect(getAudioPrefs().sfx).toBe(true);
    localStorage.setItem(SUNNY_STORAGE.SFX_KEY, 'true');
    expect(getAudioPrefs().sfx).toBe(true);
  });
});

describe('setAudioPref', () => {
  it('persists SFX independent of music', () => {
    setAudioPref(SUNNY_STORAGE.SFX_KEY, false);
    expect(getAudioPrefs()).toEqual({ sfx: false, music: true });
  });

  it('persists music independent of SFX', () => {
    setAudioPref(SUNNY_STORAGE.MUSIC_KEY, false);
    expect(getAudioPrefs()).toEqual({ sfx: true, music: false });
  });

  it('supports both off independently', () => {
    setAudioPref(SUNNY_STORAGE.SFX_KEY, false);
    setAudioPref(SUNNY_STORAGE.MUSIC_KEY, false);
    expect(getAudioPrefs()).toEqual({ sfx: false, music: false });
  });

  it('round-trips true correctly (no accidental "true" string sticking)', () => {
    setAudioPref(SUNNY_STORAGE.MUSIC_KEY, false);
    setAudioPref(SUNNY_STORAGE.MUSIC_KEY, true);
    expect(getAudioPrefs().music).toBe(true);
  });

  it('rejects unknown keys rather than writing them silently', () => {
    expect(() => setAudioPref('sunny.bogus', false)).toThrow();
  });
});
