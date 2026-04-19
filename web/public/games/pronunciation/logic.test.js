// logic.test.js
//
// Tests first. Red commit before implementation commit.
// Every exported function from logic.js is pinned here.
// These tests are the spec — if you change the behavior, you change the test
// in the same PR with a clear reason in the commit message.
//
// Run: npx vitest run

import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  kidNorm,
  findKidNormCollisions,
  matchWord,
  beltPosition,
  streakMultiplier,
  scoreForHit,
  shouldSpawn,
  createWordQueue,
  pitchForStreak,
  curveFor,
  DIFFICULTY_CURVES,
  XP_PER_HIT,
  VariationDeck,
  buildNodeResult,
} from './logic.js';

// The hardcoded prototype word list. Lives in the test too so we detect
// accidental drift between the game and the matcher's collision guard.
const DEFAULT_WORDS = [
  'blister', 'carpet', 'thirteen', 'orbit', 'harvest',
  'confirm', 'interrupt', 'perfume', 'hamburger', 'corner',
  'kindergarten', 'chimp', 'inhabit', 'instruments', 'band',
];

// ============================================================================
// levenshtein
// ============================================================================
describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns length of other string when one is empty', () => {
    expect(levenshtein('', 'abcde')).toBe(5);
    expect(levenshtein('abcde', '')).toBe(5);
  });

  it('handles single-character substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('handles insertion and deletion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('handles larger edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

// ============================================================================
// kidNorm
// ============================================================================
describe('kidNorm', () => {
  it('lowercases and strips non-letters', () => {
    expect(kidNorm('Hello!')).toBe('hello');
    expect(kidNorm('  CAT  ')).toBe('cat');
  });

  it('applies th → f', () => {
    // 'th' in 'thirteen' becomes 'f'; then r → w
    expect(kidNorm('thirteen')).toBe('fiwteen');
  });

  it('applies r → w', () => {
    expect(kidNorm('car')).toBe('caw');
  });

  it('applies m → n', () => {
    expect(kidNorm('mat')).toBe('nat');
  });

  it('applies b → d', () => {
    expect(kidNorm('band')).toBe('dand');
  });

  it('applies p → q', () => {
    expect(kidNorm('perfume')).toBe('qewfune');
  });

  it('composes substitutions in declared order', () => {
    // 'hamburger': no th, r→w twice, m→n, b→d
    expect(kidNorm('hamburger')).toBe('handuwgew');
  });
});

// ============================================================================
// findKidNormCollisions
// ============================================================================
describe('findKidNormCollisions', () => {
  it('returns empty array when normalized forms are unique', () => {
    expect(findKidNormCollisions(['cat', 'dog', 'sun'])).toEqual([]);
  });

  it('detects a two-word collision', () => {
    // 'bat' → 'dat' kidNorm-collides with 'dat' → 'dat'
    const coll = findKidNormCollisions(['bat', 'dat']);
    expect(coll).toHaveLength(1);
    expect(coll[0].words.sort()).toEqual(['bat', 'dat']);
    expect(coll[0].normalized).toBe('dat');
  });

  it('detects multiple independent collisions', () => {
    const coll = findKidNormCollisions(['bat', 'dat', 'mop', 'nop']);
    expect(coll.length).toBe(2);
  });

  it('confirms the prototype word list is collision-free', () => {
    // If this ever fails, someone added a word whose kidNorm clashes
    // with an existing one. Either remove the new word or widen the
    // matcher's strict-fallback contract.
    expect(findKidNormCollisions(DEFAULT_WORDS)).toEqual([]);
  });
});

// ============================================================================
// matchWord
// ============================================================================
describe('matchWord', () => {
  it('accepts exact match', () => {
    expect(matchWord('cat', 'cat')).toBe(true);
  });

  it('ignores casing and punctuation', () => {
    expect(matchWord('Cat!', 'cat')).toBe(true);
    expect(matchWord('cat.', 'cat')).toBe(true);
  });

  it('rejects empty input', () => {
    expect(matchWord('', 'cat')).toBe(false);
    expect(matchWord('   ', 'cat')).toBe(false);
  });

  it('accepts Levenshtein ≤ 1 when expected is longer than 4 chars', () => {
    expect(matchWord('carpets', 'carpet')).toBe(true);
    expect(matchWord('carpat', 'carpet')).toBe(true);
  });

  it('does not use Levenshtein leniency for short words', () => {
    // 'cat' has length 3, not > 4 → only exact match allowed.
    expect(matchWord('cot', 'cat')).toBe(false);
    expect(matchWord('bat', 'cat')).toBe(false);
  });

  it('accepts Levenshtein ≤ 2 when expected is longer than 6 chars', () => {
    expect(matchWord('hamburge', 'hamburger')).toBe(true);  // lev 1
    expect(matchWord('hanburge', 'hamburger')).toBe(true);  // lev 2
  });

  it('accepts kid substitutions (b↔d, m↔n, th→f, r→w, p→q)', () => {
    expect(matchWord('dand', 'band')).toBe(true);
    expect(matchWord('nat', 'mat')).toBe(true);
    expect(matchWord('fiwteen', 'thirteen')).toBe(true);
  });

  it('rejects kidNorm match when another active word kid-collides', () => {
    // If 'bat' and 'dat' are both on the belt, and kid says something
    // that kidNorm-matches both, the matcher must refuse to guess.
    expect(matchWord('dat', 'bat', ['bat', 'dat'])).toBe(false);
    expect(matchWord('dat', 'dat', ['bat', 'dat'])).toBe(true); // exact still wins
  });

  it('allows kidNorm match when no other active word collides', () => {
    expect(matchWord('dand', 'band', ['band', 'chimp'])).toBe(true);
  });
});

// ============================================================================
// beltPosition
// ============================================================================
describe('beltPosition — depth mode', () => {
  it('entry point at t=0', () => {
    const p = beltPosition(0, 'depth');
    expect(p.x).toBe(50);
    expect(p.y).toBe(30);
    expect(p.scale).toBeCloseTo(0.35);
  });

  it('exit point at t=1', () => {
    const p = beltPosition(1, 'depth');
    expect(p.x).toBe(50);
    expect(p.y).toBe(70);
    expect(p.scale).toBeCloseTo(1.15);
  });

  it('never leaves center column (x=50) for any t', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(beltPosition(t, 'depth').x).toBe(50);
    }
  });

  it('y increases monotonically with t', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.1) {
      const y = beltPosition(t, 'depth').y;
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('say zone is true only when y is in [55, 75]', () => {
    expect(beltPosition(0, 'depth').inSayZone).toBe(false);    // y=30
    expect(beltPosition(0.5, 'depth').inSayZone).toBe(false);  // y=50
    expect(beltPosition(0.7, 'depth').inSayZone).toBe(true);   // y=58
    expect(beltPosition(1, 'depth').inSayZone).toBe(true);     // y=70
  });
});

describe('beltPosition — horizontal mode', () => {
  it('entry at x=100, exit at x=0', () => {
    expect(beltPosition(0, 'horizontal').x).toBe(100);
    expect(beltPosition(1, 'horizontal').x).toBe(0);
  });

  it('stays on middle row (y=50)', () => {
    for (let t = 0; t <= 1; t += 0.1) {
      expect(beltPosition(t, 'horizontal').y).toBe(50);
    }
  });

  it('scale peaks at center (t=0.5)', () => {
    const mid = beltPosition(0.5, 'horizontal');
    const start = beltPosition(0, 'horizontal');
    const end = beltPosition(1, 'horizontal');
    expect(mid.scale).toBeCloseTo(1.15);
    expect(mid.scale).toBeGreaterThan(start.scale);
    expect(mid.scale).toBeGreaterThan(end.scale);
  });

  it('say zone is true only when x is in [35, 65]', () => {
    expect(beltPosition(0, 'horizontal').inSayZone).toBe(false);   // x=100
    expect(beltPosition(0.5, 'horizontal').inSayZone).toBe(true);  // x=50
    expect(beltPosition(1, 'horizontal').inSayZone).toBe(false);   // x=0
  });
});

describe('beltPosition — safety', () => {
  it('clamps t below 0 and above 1', () => {
    expect(beltPosition(-1, 'depth').y).toBe(30);
    expect(beltPosition(2, 'depth').y).toBe(70);
  });

  it('throws on unknown mode', () => {
    expect(() => beltPosition(0.5, 'diagonal')).toThrow();
  });
});

// ============================================================================
// scoring
// ============================================================================
describe('streakMultiplier', () => {
  it('is 1.0 below streak 5', () => {
    expect(streakMultiplier(0)).toBe(1.0);
    expect(streakMultiplier(4)).toBe(1.0);
  });

  it('is 1.5 from streak 5 to 9', () => {
    expect(streakMultiplier(5)).toBe(1.5);
    expect(streakMultiplier(9)).toBe(1.5);
  });

  it('is 2.0 from streak 10 onward', () => {
    expect(streakMultiplier(10)).toBe(2.0);
    expect(streakMultiplier(100)).toBe(2.0);
  });
});

describe('scoreForHit', () => {
  it('uses XP_PER_HIT as base', () => {
    expect(scoreForHit(1)).toBe(XP_PER_HIT);
  });

  it('applies 1.5× at streak 5', () => {
    expect(scoreForHit(5)).toBe(Math.round(XP_PER_HIT * 1.5));
  });

  it('applies 2.0× at streak 10', () => {
    expect(scoreForHit(10)).toBe(XP_PER_HIT * 2);
  });
});

// ============================================================================
// shouldSpawn
// ============================================================================
describe('shouldSpawn', () => {
  it('true when cadence elapsed and slot free', () => {
    expect(shouldSpawn({
      now: 2000, lastSpawnAt: 0, activeCount: 0,
      maxActive: 3, cadenceMs: 1400,
    })).toBe(true);
  });

  it('false when cadence not elapsed', () => {
    expect(shouldSpawn({
      now: 1000, lastSpawnAt: 0, activeCount: 0,
      maxActive: 3, cadenceMs: 1400,
    })).toBe(false);
  });

  it('false when at max active', () => {
    expect(shouldSpawn({
      now: 10000, lastSpawnAt: 0, activeCount: 3,
      maxActive: 3, cadenceMs: 1400,
    })).toBe(false);
  });

  it('false when over max active', () => {
    expect(shouldSpawn({
      now: 10000, lastSpawnAt: 0, activeCount: 5,
      maxActive: 3, cadenceMs: 1400,
    })).toBe(false);
  });
});

// ============================================================================
// createWordQueue
// ============================================================================
describe('createWordQueue', () => {
  // Deterministic RNG for reproducible tests
  function makeRng(seed = 0.5) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  it('throws when given fewer than 2 words', () => {
    expect(() => createWordQueue(['only'])).toThrow();
    expect(() => createWordQueue([])).toThrow();
  });

  it('never emits the same word twice in a row', () => {
    const q = createWordQueue(['a', 'b', 'c'], makeRng());
    let last = null;
    for (let i = 0; i < 100; i++) {
      const w = q.next();
      expect(w).not.toBe(last);
      last = w;
    }
  });

  it('cycles through all words before repeating any', () => {
    const words = ['a', 'b', 'c', 'd'];
    const q = createWordQueue(words, makeRng());
    const seen = new Set();
    for (let i = 0; i < words.length; i++) seen.add(q.next());
    expect(seen.size).toBe(words.length);
  });

  it('flagged words re-surface within 5 subsequent emits', () => {
    const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const q = createWordQueue(words, makeRng());
    q.next();           // 1 emit to establish state
    q.flag('a');        // re-queue 'a' with a short delay
    const emitted = [];
    for (let i = 0; i < 5; i++) emitted.push(q.next());
    expect(emitted).toContain('a');
  });
});

// ============================================================================
// pitchForStreak
// ============================================================================
describe('pitchForStreak', () => {
  it('base pitch is approximately C5 (523.25 Hz)', () => {
    expect(pitchForStreak(0)).toBeCloseTo(523.25, 1);
  });

  it('monotonic from streak 0 to 10', () => {
    for (let s = 0; s < 10; s++) {
      expect(pitchForStreak(s + 1)).toBeGreaterThan(pitchForStreak(s));
    }
  });

  it('caps at streak 10 (no pitch climb beyond)', () => {
    expect(pitchForStreak(10)).toBeCloseTo(pitchForStreak(20), 1);
  });
});

// ============================================================================
// curveFor
// ============================================================================
describe('curveFor', () => {
  it('defaults to difficulty 2 for unknown values', () => {
    expect(curveFor(undefined)).toEqual(DIFFICULTY_CURVES[2]);
    expect(curveFor(null)).toEqual(DIFFICULTY_CURVES[2]);
    expect(curveFor(99)).toEqual(DIFFICULTY_CURVES[2]);
    expect(curveFor('weird')).toEqual(DIFFICULTY_CURVES[2]);
  });

  it('difficulty 1 travels slowest', () => {
    expect(curveFor(1).travelMs).toBeGreaterThan(curveFor(2).travelMs);
    expect(curveFor(1).travelMs).toBeGreaterThan(curveFor(3).travelMs);
  });

  it('difficulty 3 travels fastest', () => {
    expect(curveFor(3).travelMs).toBeLessThan(curveFor(2).travelMs);
    expect(curveFor(3).travelMs).toBeLessThan(curveFor(1).travelMs);
  });

  it('every curve has the three required fields', () => {
    for (const d of [1, 2, 3]) {
      const c = curveFor(d);
      expect(typeof c.travelMs).toBe('number');
      expect(typeof c.cadenceMs).toBe('number');
      expect(typeof c.maxActive).toBe('number');
    }
  });
});

// ============================================================================
// VariationDeck
// ============================================================================
// "Rotate, don't randomize." Cycles through every item in a shuffled order
// before any item can repeat, AND guarantees the last item of deck N is not
// the first item of deck N+1 — so consecutive next() calls never return the
// same value.

describe('VariationDeck', () => {
  // Deterministic RNG for reproducible tests
  function makeRng(seed = 0.5) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  it('throws on empty input', () => {
    expect(() => new VariationDeck([])).toThrow();
  });

  it('throws on non-array', () => {
    expect(() => new VariationDeck(null)).toThrow();
    expect(() => new VariationDeck('abc')).toThrow();
  });

  it('returns only items from the input list', () => {
    const items = ['a', 'b', 'c'];
    const d = new VariationDeck(items, makeRng());
    for (let i = 0; i < 30; i++) {
      expect(items).toContain(d.next());
    }
  });

  it('cycles through every item before repeating any within a deck', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const d = new VariationDeck(items, makeRng());
    const seen = new Set();
    for (let i = 0; i < items.length; i++) seen.add(d.next());
    expect(seen.size).toBe(items.length);
  });

  it('never returns the same item on two consecutive calls (across deck refills)', () => {
    // This is the core guarantee. Without the consecutive-repeat guard,
    // last-of-deck-N and first-of-deck-N+1 can match ~1/n of the time.
    const items = ['a', 'b', 'c'];
    // Try many seeds to stress the boundary between decks.
    for (let seed = 0.1; seed < 1; seed += 0.07) {
      const d = new VariationDeck(items, makeRng(seed));
      let last = null;
      for (let i = 0; i < 300; i++) {
        const x = d.next();
        expect(x).not.toBe(last);
        last = x;
      }
    }
  });

  it('handles a single-item deck by always returning that item', () => {
    // Degenerate case — the guard cannot enforce "no consecutive repeat"
    // with only one item. Document the behavior rather than throw.
    const d = new VariationDeck(['only'], makeRng());
    expect(d.next()).toBe('only');
    expect(d.next()).toBe('only');
  });

  it('each deck cycle is a permutation (no missing, no duplicates)', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const d = new VariationDeck(items, makeRng());
    const out = [];
    for (let i = 0; i < items.length; i++) out.push(d.next());
    expect([...out].sort()).toEqual([...items].sort());
  });
});

// ============================================================================
// buildNodeResult
// ============================================================================
// Pure builder for the postMessage payload. Keeping this out of game.js lets
// us pin the NodeResult shape in tests without touching window.postMessage.

describe('buildNodeResult', () => {
  const baseInput = {
    config: { nodeId: 'node-abc', childId: 'ila' },
    wordsHit: 12,
    wordsAttempted: 15,
    missesByWord: new Map([['blister', 2], ['kindergarten', 3], ['carpet', 1]]),
    xpEarned: 135,
    timeSpent_ms: 60000,
    completed: true,
  };

  it('emits type "node_complete" (not "node_result")', () => {
    const r = buildNodeResult(baseInput);
    expect(r.type).toBe('node_complete');
  });

  it('carries nodeId and childId through unchanged', () => {
    const r = buildNodeResult(baseInput);
    expect(r.nodeId).toBe('node-abc');
    expect(r.childId).toBe('ila');
  });

  it('accuracy = wordsHit / wordsAttempted', () => {
    const r = buildNodeResult(baseInput);
    expect(r.accuracy).toBeCloseTo(12 / 15);
  });

  it('accuracy is 0 when wordsAttempted is 0 (no divide-by-zero)', () => {
    const r = buildNodeResult({ ...baseInput, wordsHit: 0, wordsAttempted: 0 });
    expect(r.accuracy).toBe(0);
  });

  it('flaggedWords are words missed 2+ times', () => {
    const r = buildNodeResult(baseInput);
    expect(r.flaggedWords.sort()).toEqual(['blister', 'kindergarten']);
  });

  it('flaggedWords excludes single-miss words', () => {
    const r = buildNodeResult({
      ...baseInput,
      missesByWord: new Map([['carpet', 1]]),
    });
    expect(r.flaggedWords).toEqual([]);
  });

  it('wordsAttempted is a number (count), not an array', () => {
    const r = buildNodeResult(baseInput);
    expect(typeof r.wordsAttempted).toBe('number');
    expect(r.wordsAttempted).toBe(15);
  });

  it('wordsHit is a number (count)', () => {
    const r = buildNodeResult(baseInput);
    expect(typeof r.wordsHit).toBe('number');
    expect(r.wordsHit).toBe(12);
  });

  it('includes xpEarned and timeSpent_ms', () => {
    const r = buildNodeResult(baseInput);
    expect(r.xpEarned).toBe(135);
    expect(r.timeSpent_ms).toBe(60000);
  });

  it('includes completed boolean', () => {
    const r = buildNodeResult(baseInput);
    expect(r.completed).toBe(true);
    const r2 = buildNodeResult({ ...baseInput, completed: false });
    expect(r2.completed).toBe(false);
  });

  it('has exactly the expected set of keys (no leakage)', () => {
    const r = buildNodeResult(baseInput);
    expect(Object.keys(r).sort()).toEqual([
      'accuracy',
      'childId',
      'completed',
      'flaggedWords',
      'nodeId',
      'timeSpent_ms',
      'type',
      'wordsAttempted',
      'wordsHit',
      'xpEarned',
    ]);
  });

  it('defaults childId to "unknown" when not provided', () => {
    const r = buildNodeResult({
      ...baseInput,
      config: { nodeId: 'n1' },
    });
    expect(r.childId).toBe('unknown');
  });
});
