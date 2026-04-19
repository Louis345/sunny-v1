# MIGRATION.md — pronunciation-game → Sunny

This prototype now emits the **new `NodeResult` contract** (spec §1).
The Sunny repo needs four coordinated changes to accept it. Do them in the
same PR — a half-migrated system silently drops `xpEarned` / `flaggedWords`
and you won't see it until the Psychologist runs.

---

## Contract change summary

**Old shape** (currently in `src/shared/adventureTypes.ts`):

```ts
{
  type: 'node_result',
  nodeId: string,
  completed: boolean,
  accuracy: number,
  timeSpent_ms: number,
  wordsAttempted: string[],   // list of words
}
```

**New shape** (emitted by this game now):

```ts
{
  type: 'node_complete',      // renamed
  nodeId: string,
  childId: string,            // new — from URL param
  completed: boolean,
  accuracy: number,
  timeSpent_ms: number,
  wordsHit: number,           // new — count of successes
  wordsAttempted: number,     // changed: count (was list)
  flaggedWords: string[],     // new — missed 2+ times
  xpEarned: number,           // new — game computes
}
```

Three behavioral changes baked in:

1. **`completed: false` is no longer a separate `node_abandon` message.**
   When the child hits "back to map," we post `node_complete` with
   `completed: false`. One shape, one handler.
2. **`wordsAttempted` excludes in-flight-at-timeout.** Pills still
   traveling when the 60s timer fires don't count. Accuracy reflects
   what the child actually had a chance to say.
3. **Flagged words are computed client-side.** The game knows the miss
   count per word; server doesn't need to re-derive.

---

## Sunny-side diff (apply in one PR)

### 1. `src/shared/adventureTypes.ts`

Replace the existing `NodeResult` type:

```ts
// Before
export type NodeResult = {
  nodeId: string;
  completed: boolean;
  accuracy: number;
  timeSpent_ms: number;
  wordsAttempted: string[];
};

// After
export type NodeResult = {
  type: 'node_complete';
  nodeId: string;
  childId: string;
  completed: boolean;
  accuracy: number;             // 0–1
  timeSpent_ms: number;
  wordsHit: number;
  wordsAttempted: number;       // COUNT, not array
  flaggedWords: string[];       // words missed 2+ times
  xpEarned: number;
};
```

### 2. `src/server/map-coordinator.ts`

In the WebSocket `node_result` handler:

```ts
// Before
ws.on('node_result', async (result: NodeResult) => {
  const missTotal = /* ... */;
  const attempted = result.wordsAttempted.length;
  const flagged = /* re-derived server-side */;
  await recordNodeComplete(childId, { ...result, flagged });
});

// After — rename handler to match new type field
ws.on('node_complete', async (result: NodeResult) => {
  await recordNodeComplete(childId, result);
  // result already contains flaggedWords and xpEarned —
  // remove any server-side re-derivation logic.
});
```

If you also listen for `node_abandon` as a separate message: delete that
handler. `completed: false` on a `node_complete` payload replaces it.

### 3. TASK-014 post-node pipeline (`src/server/post-node.ts` or wherever
    the 6-step pipeline lives)

The pipeline's step 3 currently calls `recordAttempt(word, correct, domain)`
per word in `wordsAttempted: string[]`. That loop no longer has a word list
to iterate — the game emits a count, not words.

Two options:

- **(a) Preferred:** have the game emit per-attempt logs during play via
  WebSocket (a new `word_attempt` message), and let the pipeline subscribe
  to those. Flagged words in the final payload are still the truth for
  SM-2 flagging.
- **(b) Quick:** have the game include a `wordAttempts: Array<{word, correct}>`
  field in `NodeResult` so the pipeline can still iterate. Adds payload size;
  acceptable for now.

I'd start with (b) (one-line addition), plan (a) for later if payload size
ever matters. If you take (b), add it to the contract:

```ts
  wordAttempts?: Array<{ word: string; correct: boolean }>;
```

and I'll add the tracking to `game.js` in a follow-up.

### 4. Delete existing test assertions on the old shape

Find any test that asserts `wordsAttempted.length` or references
`type: 'node_result'`. Update to the new shape. Likely candidates:

- `src/tests/test-map-coordinator.ts`
- `src/tests/test-post-node-pipeline.ts`
- any e2e that exercises a node completion

---

## Rollback plan

If this breaks in integration, revert the single game commit that updated
`game.js` + `logic.js` to emit the new shape. The four Sunny-side changes
above will still compile (types are stricter, not broken); they just won't
receive any matching messages until the game is re-promoted.

---

## What's NOT changing in this migration

- Game launch URL params (`?words`, `?difficulty`, `?nodeId`, `?childId`)
- `beltMode` vs `mode` — `beltMode` is now canonical but `mode` still
  works with a deprecation warning. Remove `mode` support after one
  Sunny release.
- Per-child `learning_profile.json` structure
- `buildProfile(childId).dueWords` contract
- Bandit reward formula — bandit still sees `{rating, completed, accuracy}`,
  which are all still present

---

## Validation checklist

Before merging the Sunny-side PR, verify:

- [ ] `npm test` in `pronunciation-game/` is green (94/94 at time of writing)
- [ ] Sunny `npm run test:system` is green after the four changes above
- [ ] A manual Ila session round-trips: launch node → complete → verify
      `word_bank.json` updated, `ratings/*.ndjson` appended, XP incremented
      in profile API response
- [ ] `flaggedWords` from a deliberately-bad session appear in SM-2 as due
      for reading domain
- [ ] A deliberate `back to map` click records a `completed: false` node
      without crashing the coordinator
