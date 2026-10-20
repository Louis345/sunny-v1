# Independent review: Elli capable speech (staged patch on PR14 `69f1d44`)

## Verdict: **Changes requested**

There are no P0 secrecy leaks in the paths I traced. However, three P1 defects mean the patch does not faithfully execute the AI's choices. The patch also contradicts the contract it adds in v40, so it is not ready for human acceptance testing.

The capability-first direction is correct. Supplying `setSpeechRate`, deriving teaching permission from frozen item role, and removing the hint ladder and two-sentence cap all fit `AI_DESIGN_PRINCIPLES.md`.

The core diagnosis is supported by the frozen excerpt. Items `act-radar-all-recall` are `measurementRole: "practice"` with `hideWordDuringResponse: true`. Snapshot mode was then inferred from visibility. That context projection is the earliest wrong layer for the "clues" and "sound it out" turns.

---

## P0
None found.

- `canonicalSpellingPractice` uses an allowlist on item role (`practice | instruction`).
- It requires launch, assessment, state and token agreement.
- Redaction is unchanged for `stimulus_only`.

## P1: blocking implementation defects

### P1-1. Speech rate leaks into independent measurement and is never recorded as a presentation condition

**Where:**
- `companionSpeechTools.ts:8–19`: the tool is offered in every mode.
- `session-manager.ts:2061`: it is added unconditionally.
- `ws-tts-bridge.ts` (`setSpeechRate`, around L83–101): the rate persists "until changed".

**Contract conflict:** v40 permits "set supported speech pace" only for frozen instruction/practice items. Evaluation, fresh checkpoints, Quest and Boss "retain their independent-answer conditions". The contract also says "Assistance is per response, including presentation support."

**Reproduction (from your own probe):** `conversation-probe.json`, `independent_check`, turn 1 shows `setSpeechRate 0.75` followed by `replayWord`. So a hidden independent stimulus is re-elicited at 0.75.

In production the failure is worse:
1. Elli sets 0.7 on a practice item.
2. The child advances to a fresh checkpoint.
3. The activity's stimulus and replays play at 0.7.
4. No companion turn occurs on that item, so `markSpellingAssessmentSupport` never fires.
5. The presentation fact (`session-manager.ts:779–782`) records nothing about rate.

**Result:** independent evidence is collected under altered, unrecorded elicitation conditions.

**Minimal remedy (capability-first, no router):**
- Make the effective rate a recorded fact of each presentation and replay. Attach it to the item, like `lettersVisible`.
- Expose the current rate in the live board context every turn.
- Whether a slowed whole-word stimulus counts as assistance or remains permitted elicitation is a contract decision for the human. Until it is made, either:
  - do not advertise the tool when `spellingSupportMode === "stimulus_only"` on a bound item, or
  - scope the rate to the item where it was chosen, so it resets on item or launch change and Elli re-chooses.

### P1-2. "Say it slower" plus replay in one model step does not execute the AI's choice

**Where:** `ws-tts-bridge.ts` `setSpeechRate` branch 1 (`await this.finish(); if (this.stopped || this.playbackOwner !== owner) throw "speech_rate_cancelled"`), interacting with `beginPlayback()` (`if (owner differs) this.stop()`).

The AI SDK executes the tool calls of a single step concurrently. Your probe shows exactly this pattern: spoken preface, then `setSpeechRate` and `replayWord` in the same turn.

**Reproduction:**
1. Elli streams "Here it comes nice and slow!", so `hasFlushedThisTurn` is true.
2. She calls `setSpeechRate(0.75)` and `replayWord` in the same step.
3. `setSpeechRate` enters `finish()` to drain.
4. The replay's `beginPlayback(newId)` calls `stop()`.
5. The rate call rejects with `speech_rate_cancelled`, so the rate is never set.
6. The replay plays at 1.0.

If the model orders `replayWord` first, a different failure occurs. Branch 1 drains the replay socket at the old rate, and only the next utterance is slow.

Either ordering fails the child's actual request. No test covers concurrent or interleaved tool calls.

Separately, nothing shows that `narration_request` audio goes through this bridge at all. The tool description claims "including … activity word replays" without evidence.

**Remedy:**
- Apply the rate at the next stream initialization without cancelling or draining in-flight work. Record the pending rate and use it on the next `connect()`.
- Have `replayWord` report the rate it was synthesized at, so the model and the record see the real outcome.
- Add a test that runs both tools concurrently, plus a test proving the replay path uses the configured rate.

### P1-3. A mid-turn reconnect erases this turn's audio proof

**Where:** `ws-tts-bridge.ts` `connect()` resets `audioChunksThisTurn = 0` and `hasFlushedThisTurn = false`. `setSpeechRate` calls `connect()` after draining.

**Reproduction:**
1. Elli speaks a sentence, so chunks are greater than 0.
2. She calls `setSpeechRate`, which drains and reconnects.
3. She emits no further text.
4. `hadAudioThisTurn()` now returns false, even though PCM was delivered.

Any caller that uses this as delivery proof (its doc comment says it is "Proof that this turn emitted playable PCM") will misreport or trigger fallback.

**Remedy:** keep per-turn counters across rate reconnects. Reset them on turn ownership, not on socket replacement. Add a test.

---

## P2

1. **Regression in visible teaching for bound items without a frozen role.**
   - `canonicalSpellingPractice` returns `false` (not `undefined`) when the item has no `lineage.measurementRole`.
   - `currentBoardSnapshot.ts` around L211–214 then ignores `answerVisibility: "visible"`, producing `stimulus_only` and replay-only help.
   - Affected: legacy cycles and visible practice games bound via `practiceCapture`.
   - The README claim "Existing visible teaching remains supported" is only tested with `canonicalPractice` undefined (`currentBoardSnapshot.test.ts:240`).
   - Remedy: return `undefined` for "role unknown". Reserve `false` for a frozen independent role.

2. **Node-role check is a denylist** (`!["evaluation","quest","boss"].includes(node.role)`).
   - Probe/Discovery node role names are not checked. The item-role allowlist is probably sufficient.
   - Either rely on item role alone or allowlist node roles, with a test per existing role value.

3. **Introspection is snapshot-at-build-time.**
   - "Current configured speed: …" is baked into the tool description when the toolkit is built (`companionSpeechTools.ts:11`).
   - If the toolkit is cached across turns, Elli is told a stale rate.
   - The receipt omits the previous rate.
   - The live board context, which Elli reads every turn, never shows the rate.
   - Remedy: put the current rate in the per-turn context, and return `{previous, speed}`.

4. **Rate change while the socket is still connecting with buffered text.**
   - Branch 1 calls `finish()`. `flushBuffer` no-ops because the socket is not open, and EOS is skipped because the socket is not OPEN.
   - When the socket opens, its handler flushes the buffer, but EOS is never sent.
   - Expected outcome: a `tts_stream_timeout` after 10 s, a rejected tool call, and truncated speech.
   - Needs a test.

5. **The receipt can fabricate success.**
   - Branch 1 compares `playbackOwner !== owner` by identity. If both are `undefined` (unowned companion speech) and a new turn's `connect()` reopened the socket at the old rate during the drain, the code still sets `speechRate` and returns `applied: true`.
   - `connect()` returns early on the already-open socket, so audio continues at the old rate.

6. **Prompt contradiction on letters in hidden practice.**
   - `companion-base.md` CHILD_AUTHORITY allows letter-by-letter spelling "if the child explicitly asks".
   - The context says "Hidden written letters remain hidden", and GAME_REVEAL says "Written hidden answers … remain protected".
   - `findCompanionTruthContradictions` only checks `stimulus_only`, so letter disclosure in `pronunciation_model` is unmonitored.
   - The contract requires "hearing its letters" to be recorded separately from other support, but support is a single boolean `supportIds`.
   - Remedy: one consistent statement of what hidden practice permits, and a support/exposure kind on the item record. No keyword detection.

7. **Evidence gap for table row 1.**
   - "Can I say slower?" is at 02:59:26. The Word Radar config and target traces are at 03:12.
   - The excerpts do not show which node or measurement role was active at 02:59.
   - If it was Discovery or evaluation, the requested capability lands in exactly the P1-1 conflict.

8. **Assistance only counts in phase `response`** (`session-manager.ts:941–951`).
   - Teaching during `flash` or feedback on a practice item is unrecorded.
   - This is pre-existing, but this patch widens teaching.

## P3 (deferred or minor)

- The reconnect drops `previousText` prosody context.
- There is no `🎮 [tts] [rate] [applied|cancelled]` console log (Law 5).
- With `TTS_ENABLED=false`, the tool returns `applied: true` although no audio exists.
- `getChildChart` is called twice per snapshot update (L774 and L802).
- The probe's `sourceHash` predates the final bridge.
- The latency figure is a single pair (acknowledged).
- Remaining canned scripts are untouched, which is acceptable and out of scope:
  - companion-base Tangents ("That's a big thought…", "you're the teacher…")
  - elli.md "one plain sentence"
  - elli.md "one analogous example"
- Governance doctrine (AGENTS.md, new AI_DESIGN_PRINCIPLES.md) is bundled with a feature fix. Split it per "one problem per commit".

---

## Missing tests

1. A rate set on a practice item, then advance to a bound fresh_checkpoint. Assert either:
   - the tool is absent or the rate resets, or
   - the presentation/replay record carries the rate.
2. Concurrent `setSpeechRate` + `replayWord` in one step, in both orders. Assert the replay is synthesized at the chosen rate, or the tool reports truthfully.
3. The `narration_request` replay path actually uses the bridge's configured rate.
4. `hadAudioThisTurn()` stays true after a mid-turn rate reconnect.
5. Rate change while CONNECTING with buffered text: no 10 s timeout and no lost text.
6. The real kiosk session type (adventure-map slim toolkit, after L2070) actually includes `setSpeechRate`. The shown code does not prove the slim branch merges `screenshotTools`.
7. `canonicalSpellingPractice` unit cases for each mismatch branch:
   - `launchId`
   - `itemId`
   - token (the `"unverified"` case is short-circuited earlier by the stale guard at L737, so the function's own token check is untested)
   - quest/boss
   - `instruction` role
   - missing lineage combined with visible letters
8. Teaching on hidden practice yields an attempt in **both** the legacy cycle and the typed SQLite record marked assisted. The test currently checks only `getDiscoveryAttemptContext`.
9. Tool description or context reflects a rate changed by a previous turn when the toolkit is reused.

## Principle audit

| Principle | Status |
|---|---|
| Capability before prescription | **Follows.** Adds a real provider capability and real frozen-role context instead of more instructions. |
| Grounded introspection | **Partial.** The rate is visible only in a possibly stale tool description and absent from live context. Outcomes report configuration, not synthesis, and replay rate is unreported. |
| Less scripting | **Follows** for the hint ladder and length cap. The letter rule contradiction (P2-6) is a new conflict, not a consolidation. |
| Faithful execution / no fabricated success | **Violated** by P1-2, P1-3 and P2-5. |
| Evidence meaning preserved | **Violated** by P1-1, the patch's own v40 text. |
| Diagnose-before-fix | Diagnosis is posted, but **human confirmation before edits is not recorded**. |
| Paid calls | Paid calls were made, but **human approval is not recorded**. |

## What human kiosk testing must still prove (after the fixes)

Not one of these is verified by unit tests or the isolated probe:

- **Audible rate change.**
  - Measure request-to-first-audible latency and whether 0.7 is actually more intelligible for this child.
  - Confirm a slowed *activity replay* is heard, not just slowed companion speech.
- **Explanation quality across all four words**, especially `dissatisfied` (dis-sat-is-fied), `tonight` and `title`.
  - Check for correct spoken syllables and no silent-letter sounds.
  - Check whether the explanation *changes* after "that didn't help". The probe repeated "my… self" both times.
- **Return to normal pace** when asked, and no unexpected slow speech on later items or nodes.
- **Hidden independent checks:**
  - no syllables or letters are given;
  - the replay is the activity's own audio;
  - the record shows the rate and support conditions truthfully.
- **Brevity and pacing.** Ordinary turns stay short without the hard cap, and Elli does not talk over game audio.
- **Lifecycle.**
  - Barge-in during a rate drain.
  - Item advance mid-explanation retires stale speech.
  - Exit and resume preserve assisted vs independent records in both the JSON cycle and SQLite.
- **Adult usefulness rating (1–5).** This and canonical record inspection at the tested commit are the acceptance gates. Tool invocation is not.

Nothing here authorizes merge. Human acceptance and any required manager approval must name the tested revision.
