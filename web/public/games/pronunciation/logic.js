// logic.js
//
// Pure, testable functions for the pronunciation game.
// No DOM, no audio, no window, no timers. Every import here runs in Node.
// This is the module that vitest exercises and that the HTML consumes as
// an ES module via <script type="module">.
//
// When this migrates to Project Sunny, this file moves to
// web/public/games/pronunciation/logic.js and the HTML imports it from
// there. URL params already flow through; nothing else changes.

// ---------------------------------------------------------------------------
// Config: difficulty curves
// ---------------------------------------------------------------------------
// Belts move at a fixed speed for the whole session — do not tie travelMs to
// streak. Flow state requires predictability. Difficulty is the one knob
// that changes the feel, set once per session from URL params.

export const DIFFICULTY_CURVES = {
  1: { travelMs: 3800, cadenceMs: 1800, maxActive: 2 },
  2: { travelMs: 3200, cadenceMs: 1400, maxActive: 3 },
  3: { travelMs: 2600, cadenceMs: 1100, maxActive: 3 },
};

export function curveFor(difficulty) {
  const d = Number(difficulty);
  if (d === 1 || d === 2 || d === 3) return DIFFICULTY_CURVES[d];
  return DIFFICULTY_CURVES[2];
}

export const XP_PER_HIT = 10;

// ---------------------------------------------------------------------------
// Levenshtein distance
// ---------------------------------------------------------------------------
// Classic two-row DP. Good enough for sub-20-char words.

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost,    // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// ---------------------------------------------------------------------------
// Kid pronunciation normalization
// ---------------------------------------------------------------------------
// Common substitutions kids with speech or reading challenges make:
//   - th → f  ("thirteen" → "firteen")
//   - r → w   ("rabbit" → "wabbit")
//   - m ↔ n   (nasal confusion)
//   - b ↔ d   (classic letter reversal)
//   - p ↔ q
//
// Substitutions are unidirectional in the string — we collapse both sides of
// each pair to a single canonical letter, so 'band' and 'dand' both map to
// 'dand'. That means kidNorm is a lossy equivalence class, and the matcher
// must refuse to resolve it when multiple active words share the same class.

export function kidNorm(word) {
  return String(word)
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/th/g, 'f')
    .replace(/r/g, 'w')
    .replace(/m/g, 'n')
    .replace(/b/g, 'd')
    .replace(/p/g, 'q');
}

// Given a list of words, return groups of words that collapse to the same
// kidNorm value. Used both as a static sanity check for the word list and
// at runtime to guard against ambiguous matches.
export function findKidNormCollisions(words) {
  const buckets = new Map();
  for (const w of words) {
    const n = kidNorm(w);
    if (!buckets.has(n)) buckets.set(n, []);
    buckets.get(n).push(w);
  }
  const out = [];
  for (const [normalized, ws] of buckets) {
    if (ws.length > 1) out.push({ normalized, words: ws });
  }
  return out;
}

// ---------------------------------------------------------------------------
// matchWord
// ---------------------------------------------------------------------------
// Decide whether a heard utterance should count as a successful say of the
// expected word. Tiered leniency:
//   1. Exact match after lowercase + strip non-letters.
//   2. Levenshtein <= 1 if expected.length > 4.
//   3. Levenshtein <= 2 if expected.length > 6.
//   4. kidNorm equivalence — but ONLY when no other active word also
//      kidNorm-matches the heard utterance. Ambiguity = no match.
//
// The activeWords array is the set of words currently on the belt. Default
// to just [expected] so tests can pass two args and still get sensible
// behavior.

export function matchWord(heard, expected, activeWords) {
  const h = String(heard).toLowerCase().replace(/[^a-z]/g, '');
  const e = String(expected).toLowerCase().replace(/[^a-z]/g, '');
  if (!h) return false;
  if (h === e) return true;
  if (e.length > 4 && levenshtein(h, e) <= 1) return true;
  if (e.length > 6 && levenshtein(h, e) <= 2) return true;

  const hN = kidNorm(h);
  const eN = kidNorm(e);
  if (hN === eN) {
    const pool = Array.isArray(activeWords) && activeWords.length > 0
      ? activeWords
      : [expected];
    const colliders = pool.filter(w => w !== expected && kidNorm(w) === hN);
    if (colliders.length > 0) return false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// beltPosition
// ---------------------------------------------------------------------------
// Deterministic mapping from belt progress t ∈ [0, 1] to screen-space layout.
// Returns percentages so the HTML can use them directly in CSS left/top.
// No randomness, no jitter. Flow state requires the child's eye to lock onto
// the lane within 3 words.

export function beltPosition(t, mode = 'depth') {
  const clamped = Math.max(0, Math.min(1, t));

  if (mode === 'depth') {
    const x = 50;
    const y = 30 + 40 * clamped;                 // 30% → 70%
    const scale = 0.35 + (1.15 - 0.35) * clamped; // 0.35 → 1.15
    // Opacity: 0.5 at start, full by ~t=0.75, remain 1.0 after that.
    const opacity = Math.min(1.0, 0.5 + (0.5 * clamped) / 0.75);
    const inSayZone = y >= 55 && y <= 75;
    return { x, y, scale, opacity, inSayZone };
  }

  if (mode === 'horizontal') {
    const x = 100 - 100 * clamped;               // 100% → 0%
    const y = 50;
    // Scale peaks at t=0.5 to give perspective even in a flat lane.
    let scale;
    if (clamped <= 0.5) {
      scale = 0.5 + (1.15 - 0.5) * (clamped / 0.5);
    } else {
      scale = 1.15 - (1.15 - 0.7) * ((clamped - 0.5) / 0.5);
    }
    const opacity = 1.0;
    const inSayZone = x >= 35 && x <= 65;
    return { x, y, scale, opacity, inSayZone };
  }

  throw new Error(`Unknown belt mode: ${mode}`);
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

export function streakMultiplier(streak) {
  if (streak >= 10) return 2.0;
  if (streak >= 5) return 1.5;
  return 1.0;
}

export function scoreForHit(streak) {
  return Math.round(XP_PER_HIT * streakMultiplier(streak));
}

// ---------------------------------------------------------------------------
// shouldSpawn
// ---------------------------------------------------------------------------
// Spawn gate. The caller owns the clock (so tests don't need fake timers).

export function shouldSpawn({ now, lastSpawnAt, activeCount, maxActive, cadenceMs }) {
  if (activeCount >= maxActive) return false;
  if (now - lastSpawnAt < cadenceMs) return false;
  return true;
}

// ---------------------------------------------------------------------------
// word queue
// ---------------------------------------------------------------------------
// Emits words in shuffled order, never the same one twice in a row, with
// flagged (missed) words re-surfacing within 3–5 subsequent emits. When the
// queue empties it reshuffles and continues.

export function createWordQueue(words, rng = Math.random) {
  if (!Array.isArray(words) || words.length < 2) {
    throw new Error('createWordQueue requires at least 2 words');
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let queue = shuffle(words);
  let lastEmitted = null;
  const flagged = []; // [{ word, dueAtEmit }]
  let emitCount = 0;

  function drainDueFlagged() {
    for (let i = 0; i < flagged.length; i++) {
      if (emitCount >= flagged[i].dueAtEmit) {
        const { word } = flagged[i];
        if (word !== lastEmitted) {
          flagged.splice(i, 1);
          return word;
        }
      }
    }
    return null;
  }

  return {
    next() {
      emitCount++;
      const due = drainDueFlagged();
      if (due !== null) {
        lastEmitted = due;
        return due;
      }
      if (queue.length === 0) queue = shuffle(words);
      let w = queue.shift();
      if (w === lastEmitted && queue.length > 0) {
        const next = queue.shift();
        queue.unshift(w);
        w = next;
      }
      lastEmitted = w;
      return w;
    },

    flag(word) {
      // re-surface in 3–5 emits
      const delay = 3 + Math.floor(rng() * 3);
      flagged.push({ word, dueAtEmit: emitCount + delay });
    },

    remaining() {
      return queue.length + flagged.length;
    },
  };
}

// ---------------------------------------------------------------------------
// pitchForStreak
// ---------------------------------------------------------------------------
// C5 rising one semitone per streak, capped at streak 10 so the pop never
// climbs off the top of the usable range. Caller owns the audio context.

const SEMITONE = Math.pow(2, 1 / 12);

export function pitchForStreak(streak, baseHz = 523.25) {
  const semis = Math.max(0, Math.min(10, streak));
  return baseHz * Math.pow(SEMITONE, semis);
}

// ---------------------------------------------------------------------------
// VariationDeck
// ---------------------------------------------------------------------------
// "Rotate, don't randomize." Shuffles the item list, pops one at a time until
// empty, then reshuffles. Two guarantees:
//
//   1. Within one deck cycle, every item appears exactly once.
//   2. Across deck boundaries, next() never returns the same value twice in
//      a row — the last-popped value is held and, if it happens to land at
//      the top of the next shuffled deck, we swap it into a random non-top
//      position.
//
// Caller passes in an RNG for tests. Default is Math.random.

export class VariationDeck {
  constructor(items, rng = Math.random) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('VariationDeck requires a non-empty array');
    }
    this._items = items;
    this._rng = rng;
    this._deck = [];
    this._lastPopped = null;
  }

  next() {
    if (this._deck.length === 0) this._refill();
    const item = this._deck.pop();
    this._lastPopped = item;
    return item;
  }

  _refill() {
    this._deck = [...this._items];
    // Fisher–Yates
    for (let i = this._deck.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1));
      [this._deck[i], this._deck[j]] = [this._deck[j], this._deck[i]];
    }
    // Consecutive-repeat guard: the NEXT pop is this._deck[last index].
    // If it equals the value we just popped from the previous deck, swap
    // it with any other position. Single-item decks can't be guarded.
    const top = this._deck.length - 1;
    if (
      this._lastPopped !== null &&
      this._deck.length > 1 &&
      this._deck[top] === this._lastPopped
    ) {
      const swap = Math.floor(this._rng() * (this._deck.length - 1));
      [this._deck[top], this._deck[swap]] = [this._deck[swap], this._deck[top]];
    }
  }
}

// ---------------------------------------------------------------------------
// buildNodeResult
// ---------------------------------------------------------------------------
// Pure builder for the postMessage payload the game emits on completion.
// Contract documented in MIGRATION.md. Keeping this pure means the shape is
// pinned by tests rather than living in untested DOM glue.
//
// Input:
//   config:          { nodeId, childId? }
//   wordsHit:        number — successful pronunciations
//   wordsAttempted:  number — words that RESOLVED on the belt (hit OR missed).
//                    In-flight pills at the timeout are excluded from this
//                    count so accuracy isn't penalized by the kid running
//                    out of time on words they never got to try.
//   missesByWord:    Map<word, count> — misses tallied per word.
//   xpEarned:        total XP accrued from scoreForHit sums.
//   timeSpent_ms:    elapsed play time.
//   completed:       true if the run finished naturally, false if abandoned.

export function buildNodeResult({
  config,
  wordsHit,
  wordsAttempted,
  missesByWord,
  xpEarned,
  timeSpent_ms,
  completed,
}) {
  const flaggedWords = [];
  if (missesByWord instanceof Map) {
    for (const [word, count] of missesByWord.entries()) {
      if (count >= 2) flaggedWords.push(word);
    }
  }
  const accuracy = wordsAttempted > 0 ? wordsHit / wordsAttempted : 0;

  return {
    type: 'node_complete',
    nodeId: config?.nodeId ?? 'unknown',
    childId: config?.childId ?? 'unknown',
    completed: Boolean(completed),
    accuracy,
    timeSpent_ms,
    wordsHit,
    wordsAttempted,
    flaggedWords,
    xpEarned,
  };
}
