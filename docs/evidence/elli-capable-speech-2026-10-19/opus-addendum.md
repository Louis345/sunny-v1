# Addendum: follow-up delta review (contract marker, narration pace scope, hidden-practice letter trace)

## Verdict: **No new P0/P1 found in this delta. Still conditional; not an approval.**

The prior conditions are unchanged:
- the full repository suite must pass on the frozen revision;
- the unmodified hook must pass on that same revision.

Neither has run green on the frozen source yet. Nothing here authorizes merge or establishes human usefulness.

## What the delta does

| Change | Assessment |
|---|---|
| **Prior P2-1:** hidden-practice letter trace (`currentBoardSnapshot.ts` `findCompanionTruthContradictions`) | **Faithful to scope.** Operator precedence is correct: `stimulus_only` OR (`pronunciation_model` AND `hidden`). The existing `stimulus_only` code and behaviour are unchanged. The new kind is distinct: `hidden_practice_letters_in_response_text`. It is detection only, with no muting, rewriting or hearing claim. The comment states this honestly. |
| **Prior P2-2:** narration launch token (`session-manager.ts:1113`) | **Fixed.** Precedence is metadata token, then snapshot token, then spelling launch. A stale or mismatched metadata token fails safe to normal pace. It cannot apply a rate to the wrong owner. |
| **Trace provenance** (`session-manager.ts:963–964`) | **Additive.** It adds node, item, support mode and visibility to the trace. Existing fields are unchanged. |
| **Contract marker 39 → 40** (`adaptiveMathDiscovery.test.ts:989`) | **Not weakened.** Only the version string changed. All Probe Board assertions are retained. |
| **Prior P2-3 audit** | **Accepted as inspection evidence.** It shows a single production consumer, and that consumer's sole caller begins ownership. It is not a test, and the audit correctly says so. |

## Findings (P2/P3 only)

### P2-a. The detector is gated on a browser visibility flag, but practice is granted by canonical role
- **Where:** the new condition requires `answerVisibility === "hidden"`. `normalizeAnswerVisibility` defaults to `"visible"` when the game omits the field (Wheel games excepted). It never yields `"unknown"`.
- **Gap:** canonical practice (`canonicalPractice === true`) gets `pronunciation_model` regardless of visibility. If a spelling game hides letters but omits `answerVisibility`, letter runs go untraced.
- **Coverage:** the new test passes an explicit `'hidden'`, so it does not cover this case.
- **Academic impact:** none, because the item is already practice and assisted. This is measurement granularity only.
- **Remedy:** gate on the explicit raw visibility being absent or hidden for canonical practice. Alternatively, record this limitation in `BUGS.md`.

### P2-b. Check that the new trace does not reach a later independent check's context
- **Concern:** the trace stores `response.slice(0,240)`, which here contains the practice word's letters. That word may later be checked under `stimulus_only` (the same path as prior P2-4).
- **Before this delta:** such traces existed only for the word currently under `stimulus_only`.
- **Needed:** confirm that `recordGameTrace` output never enters model history, context or tool results.
- **If it does:** redact the response or drop it from the projection. That would raise this to P1 for independent secrecy.
- I could not verify this from the diff.

### P2-c. Check downstream consumers of `companion_truth_contradiction`
- **What to check:** whether any consumer treats any contradiction code (not just `hidden_spelling_letters_disclosed`) as an assessment invalidation, contamination mark, or corrective instruction injected into the next turn.
- **If one does:** hidden practice would gain new behaviour, either a scripted correction or an evidence mutation. That contradicts the "measurement only" claim.
- **Remedy:** grep for consumers of the `type`/`code`. A test asserting that the new code changes no evidence state and adds no prompt text would settle it.

### P3. Test gaps (not weakened tests, but missing coverage)
- **Launch-token test** (`ws-tts-playback-ownership.test.ts`) has no negative case. Missing: narration under a *different* launch token, or a stale metadata token, should stay at speed 1.
- **Launch-token test** also does not assert `stimulus.played`/`speechRates:[0.7]` after `playbackDone`. The final call is unasserted.
- **Hidden-practice test** does not assert the fallback cases: visible practice produces no trace, and `stimulus_only` still emits the original code.
- **Contract marker:** `toContain("Contract version: 40")` would also match `400`. This is trivial.

### Deferred as stated (keep in `BUGS.md`, not marked fixed)
- **Prior P2-4:** history projection of syllabified practice speech into same-word checks.
- **Prior P3:** a transient provider failure during `setSpeechRate` drops later speech.
- **Prior P3:** no log for unbound narration acknowledgements.
- **New:** P2-a above, if not fixed.

## Remaining gates
1. Full suite and the unmodified hook, both green on the frozen revision, named by commit.
2. The P2-b and P2-c consumer checks, resolved or recorded.
3. All human kiosk gates from the prior review, unchanged:
   - stimulus delivery after advance;
   - audible pace for both Elli and replay, and reset on the next item;
   - syllable correctness;
   - no letters in hidden practice, now also observable through the new trace;
   - strategy change after strategy-neutral feedback;
   - explicit acceptance or rejection of slowed replay as elicitation;
   - records in both stores across exit and resume;
   - an adult usefulness rating.
4. Explicit human merge approval naming the tested revision, plus manager approval if required.
