# Fresh re-review: Elli capable speech (staged patch on PR14 `69f1d44`)

## Verdict: **Changes requested**

Most first-round blockers are resolved:

- **P1-2 (concurrent rate and replay):** the rate is now stored before any await.
- **P1-3 (lost audio proof):** per-turn counters now reset on playback ownership.
- **P2 issues:** the role-unknown fallback, live per-turn rate context, CONNECTING buffer handling, and pre-response practice help are fixed.

The **P1-1 remedy introduces a new blocking lifecycle defect.** An item, node or launch change now hard-stops all TTS, even when no pace was ever changed. One further evidence-path defect should be fixed with it. Full tests, the hook, and human kiosk usefulness remain unverified. Nothing here authorizes merge.

---

## P0: none found

I traced the following and found no leak:

- **Canonical role gate.** `canonicalSpellingPractice` requires agreement on launch, assessment, node, item and token. It allowlists item roles practice and instruction, but only on baseline and mystery nodes.
- **Private target paths.** Redaction, `companionBoardSnapshot` and the `spokenStimulus` guard all key on `stimulus_only`.
- **Tests.** Evaluation, checkpoint, checkpoint-visible, evaluation-visible and stale-token cases are covered (`spellingDiscoverySupport.test.ts`).

## P1: blocking implementation defects

### P1-A. The rate "reset" is an unconditional `stop()` on every snapshot identity change, which can kill the new item's stimulus

**Where:**
- `session-manager.ts:804` calls `resetSpeechRate()` whenever `itemId`, `nodeId` or `launchToken` differs from the previous snapshot.
- `ws-tts-bridge.ts` `resetSpeechRate()` then does `this.speechRate = 1; this.stop();` regardless of whether the rate was already 1.

**What `stop()` does:** it clears `playbackOwner`, sets `stopped`, and terminates the socket. That tears down any in-flight speech, including:
- the activity's own stimulus for the new item;
- a primed socket at session start, since the first snapshot with a `nodeId` has `previous === undefined`;
- any state carrying a `nodeId` but no `itemId` after an item (for example `config_audit`-style updates, as in `session-excerpts.json` line 129), because `undefined !== previous.itemId`.

**Reproduction (ordering-dependent, untested):**
1. The activity sends `narration_request` for item i2. `beginPlayback(activity)` and `connect()` start.
2. The `game_state_update` for i2 (phase flash or response) arrives.
3. `resetSpeechRate()` calls `stop()`. The stimulus is cancelled and the owner is cleared.
4. The browser acknowledgement never comes. The pending playback times out, and `stimulus.played` records `delivered:false`.
5. On an independent item, the child never hears the word.

**Why this is new and competing:** line 745–751 already owns speech retirement on item change, with defined conditions. This adds a second, broader teardown path.

**The opposite ordering leaks the rate.** If the new item's stimulus finishes synthesis before its state update arrives, it plays at the practice rate (say 0.7). It is recorded, but this contradicts the v40 claim that "a practice setting cannot silently alter a later independent stimulus" in the chart-disabled case (see P2-B).

**Test gap:** the existing test (`spellingDiscoverySupport.test.ts`, "retires it at the next item") mocks `stop: vi.fn()`, so it cannot observe this.

**Minimal remedy:** scope the rate to item identity instead of tearing down audio.
- Store `{rate, itemId, launchToken}` in the bridge.
- In `connect()`, use the stored rate only when `playbackOwner.itemId` matches, otherwise 1.
- `resetSpeechRate` changes configuration only. It must never call `stop()` on owned playback.
- Item-change speech retirement stays solely at line 745.

This makes the reset race-free in both orderings, with no router.

## P2: should fix in this PR

**P2-A. `recordSpellingAudio` throws into the audio-acknowledgement path.**
- Location: `session-manager.ts:~1346` calls `recordSpellingAudio`, which reaches `withOriginalSpellingChart`, which rethrows.
- Any chart error (SQLite busy, a duplicate playback ID with a different `delivered` value, relation failure) aborts the handler. It then skips `audioPlaybacks++` and the `audio_replays` engagement.
- The sibling `recordSpellingEngagement` (L816–820) catches and logs. Do the same here: log `🎮 [spelling-audio] [record] [failed]` and continue.
- Add a test with a throwing chart.

**P2-B. The v40 "each acknowledged spelling stimulus records `stimulus.played`" holds only when the typed chart is active.**
- `recordSpellingAudio` returns early without `chartItemId`, and `withOriginalSpellingChart` no-ops without `SUNNY_CHART_DIR` or in certification runs.
- In legacy-only mode, a slowed independent replay leaves no record in the JSON observation.
- Either qualify the contract sentence or log `[spelling-audio] [record] [unavailable]`.
- At minimum, the README must not claim universal recording.

**P2-C. A frozen independent role is honored only when binding succeeds.**
- `canonicalSpellingPractice` returns `undefined` on any launch, item or token mismatch. Snapshot permission then falls back to browser `answerVisibility`.
- Consequence: a bound-but-mismatched `fresh_checkpoint` item reported as `visible` with `practiceCapture` gets `pronunciation_model`.
- Granting teaching should require binding; denying it should not. Look up `state.nodeId` and `state.itemId` in the cycle and return `false` for a known non-teaching role even when unbound.
- This matches v40: "browser practice or visibility flags cannot reclassify a frozen measurement role."

**P2-D. Rate provenance in `pending.speechRates` is unproven end-to-end.**
- `session-manager.ts:~1138` reads `getAudioRatesThisTurn()` when constructing the pending playback.
- The only test stubs that getter (`spellingDiscoverySupport.test.ts`: `getAudioRatesThisTurn=()=>[0.7]`).
- If the pending playback is created before atomic-word delivery, the rates are empty (recorded as `null`, "unknown"), or come from a prior owner.
- Needs a real-bridge test through `speakGameNarration` → acknowledgement → `stimulus.played`.

**P2-E. The production replay path is not exercised.** The concurrency test calls `narrateGameStimulus` directly from a synchronous `requestNarration`. Production goes through `handleGameEvent({type:"narration_request"})` and the `playbackBusy` guard. Add one SessionManager-level test in both tool orders.

## P3: deferred or minor

- **Stale comments and README text:**
  - The bridge doc comment says "retained until she changes it", which contradicts the item reset.
  - The README still says the cancellation green "asserts rejection". The code now resolves with the current configuration.
- **Monitoring and exposure granularity:** letter disclosure in `pronunciation_model` is unmonitored, and there is no exposure kind beyond a boolean. This is acknowledged and non-blocking, since the item is already assisted practice.
- **Pre-existing evidence gap:** help during flash or presentation on a recall-check item is still unrecorded.
- **History carries the target:** conversation history from hidden practice contains the spoken target. A later same-word recall item relies on prompt boundaries, not redaction. Only sounds were given, so the risk is low.
- **Leftover length-capping instructions:** `elli.md` still says "one plain sentence" (Screen Awareness) and "one analogous example".
- **Governance bundling:** the AGENTS and AI_DESIGN_PRINCIPLES changes are still in this staged diff. The response promised a separate commit.

---

## Missing tests

1. Item advance while the next item's activity stimulus is connecting or streaming (real bridge, not a mocked `stop`). Assert the stimulus is delivered and its rate is the item-scoped default.
2. Item advance with the rate already 1. Assert no teardown of in-flight speech.
3. A state update with a `nodeId` but no `itemId` mid-item. Assert no reset or stop.
4. A chart write failure during playback acknowledgement. Assert playback counters still update and the failure is logged.
5. Real-bridge `speechRates` flows into `stimulus.played` (not a stubbed getter).
6. SessionManager `replayWord` → `handleGameEvent` → narration at the selected rate, in both orders.
7. An unbound or mismatched `fresh_checkpoint` reported as visible stays `stimulus_only`.
8. The slim adventure-map toolkit, if it is the real kiosk branch (beyond L2070), includes `setSpeechRate`. This was raised before and is still not shown.

## Principle audit

| Principle | Status |
|---|---|
| Capability before prescription | **Follows.** Real provider rate control, frozen-role context, and a delivered-rate receipt. |
| Grounded introspection | **Improved.** Per-turn configured rate, previous speed, and last acknowledged stimulus rates. Still configuration, not heard audio, which is correctly labelled. |
| Less scripting | **Follows.** The hint ladder and two-sentence cap are removed, and the letter rule is consolidated. No routers or templates were added. |
| Faithful execution | **Regressed by P1-A.** A runtime teardown that Elli never chose can cancel audio. |
| Evidence meaning | Mostly preserved. Assisted hidden practice is proven in both stores. P2-B and P2-C are gaps. "Slowed whole-word replay = elicitation" is a contract choice that needs explicit human sign-off. |
| Process | Diagnosis approval and paid-probe authorization are recorded. The hook and full tests are pending. |

## What human kiosk testing must still prove

**Human acceptance gates (not implementation blockers):**

- **Stimulus delivery on item advance.** Every new item's stimulus is heard after a pace change and without one. This tests P1-A directly.
- **Audible pace and latency.** Pace changes are audible for both companion speech and activity replay, with request-to-audible latency measured. Return to normal pace when asked, with no slow audio on later items.
- **Teaching quality.** Useful, correct spoken syllables for all four words (especially dissatisfied, tonight, title), with no silent-letter sounds. The explanation actually changes after "that didn't help"; both probes repeated "my… self".
- **Hidden independent checks.** Only whole-word replay is used. Accepting slowed replay as elicitation there requires explicit human agreement.
- **Records.** Inspect the canonical records at the tested commit:
  - assisted practice versus independent results, in both the JSON cycle and SQLite;
  - `stimulus.played` rates and delivery.
- **Lifecycle.** Barge-in, mid-explanation item advance, and exit/resume.
- **Adult usefulness rating (1–5)** and record inspection. Tool invocation alone passes nothing.

Merge still requires explicit human approval naming the tested revision, plus manager approval if required.
