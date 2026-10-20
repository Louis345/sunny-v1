# Re-review: PR #18, `912ed90` → `e761028`

**Basis:** the committed diff, plus the current `urgentLearningSupport.ts`, `session-state.ts`, the test file and runner lines 580–820.

**Not established:** reviewer approval, GitHub approval, human acceptance or learning benefit. No test pass is assumed, because the build and suite were still running when this was written.

**Scope:** artist → canvas is preserved. No Planner, board, lock, readiness or latency path is touched.

## Fix-by-fix assessment

### F1. Guarded chart read: resolved, one small gap

**What is now correct:**
- There is a single `getChildChart` call per context build, in `readCompanionCycle`, wrapped in try/catch.
- On failure it logs ` 🎮 [companion] [recorded-status] [unavailable]` with the error message.
- Status and observations share one cycle, which fixes the double assembly. The new test asserts one call.
- Unavailable status is omitted. History is reported as `recordedHistoryAvailable:false` rather than a misleading `lastSubmittedResponse:null`.
- Bound teaching facts survive a chart failure. The test confirms the target, absent status and the warning.
- The snapshot is no longer mutated. Status is projected onto a copy, which removes the persisted, stale `recordedActivityStatus` on `currentBoardSnapshot`. This is an improvement.
- Removing the read from SessionManager also relieves the size budget.

**Remaining gap (Low):**
- The cycle is read only when `snapshot.nodeId` is set.
- If a spelling assessment is bound and `snapshot.itemId` matches, but the snapshot has no `nodeId`, history is reported as unavailable even though no read was attempted.
- **Fix:** gate the read on `snapshot.nodeId || assessment bound`, or confirm that snapshots with a bound assessment always carry `nodeId`.
- Not a blocker for the human test.

**Check needed:** confirm nothing else read the previously persisted `currentBoardSnapshot.recordedActivityStatus`, such as debug traces or client sends. A grep is sufficient.

### F2. Tool-only release: resolved for the reported path

**What is now correct:**
- A stale check (`rejectStaleOutput("tool_only_completion")`) runs before any side effect.
- Only owned audio is stopped. Foreign audio is untouched, and `finish` is not called.
- `onSpeakingDone` now runs unconditionally. From SPEAKING it goes to IDLE, or back to WORD_BUILDER via the guard. This is correct for both entry states.
- The new test uses a real `TurnStateMachine` for both `owned` values. It asserts IDLE and that a subsequent turn can start, which addresses the earlier mock-only concern.

**Residual (hypothesis, likely pre-existing, not a blocker):**
- Consider a tool-only turn that calls `showCanvas`, so the state is CANVAS_PENDING at completion.
- `onSpeakingDone` is a no-op in CANVAS_PENDING. The later `onCanvasDone` moves to SPEAKING with an empty buffer.
- Nothing then sends PLAYBACK_COMPLETE, so the machine may remain in SPEAKING.
- **Suggested check:** add a real-state-machine test with a canvas tool and no text. Log a BUGS entry if it reproduces.

**Behavioral note:**
- The turn state machine now returns to IDLE while native or narration audio may still be playing.
- This is consistent with "preserve foreign audio", but it means a new child turn can begin over native audio.
- Watch for this in the human test.

### F4. Wheel conditions: resolved

- The restored line is factual: "The child chooses Wheel letters; hidden puzzle letters and answers remain private in independent play."
- It contains no scripted dialogue. The test now asserts its presence.
- The supported-teaching clause defers to live assistance conditions, which is appropriate.
- **Verify:** no remaining assertion still enshrines the earlier removal. If the old negative assertion on "Never suggest which letter to pick" is still present, it is harmless, but it should be checked.

### F7. Status vocabulary: resolved

- The definition line is added and tested. It appears only when a status is present.
- **Minor:** if the cycle can contain other states (for example locked or skipped), they are undefined to Elli. Extend the line only if those states can reach this path.

### F3, F5, F8 and the BUGS deferrals: not verifiable from the supplied diff

- The committed diff contains no README, BUGS.md or evidence files.
- I therefore cannot confirm any of the following:
  - the F3 overcount documentation
  - the explicit Matilda deferral
  - the sanitized `setup-correction.json`
  - the 16:03 lab invariants
  - the diagnosis-confirmation record
- If these exist in earlier commits between `912ed90` and `e761028`, or are uncommitted, link them.
- **Exposure tracking:** it is correctly left intact. Tool-only teaching is still recorded as exposure, with no inference that help was delivered.

## Remaining blockers

**Before the final human test:**
1. The exact clean-clone build and targeted suite must be green at `e761028`. They are currently running, so the result is not yet known.
2. The F3/F5/F8 documentation must be present in the PR at the tested revision, or the human must be told explicitly that it is pending.

**Before merge:**
1. A full regression pass at the final revision.
2. A final human test at the exact revision, judging:
   - delivered help
   - audible pace
   - truthful "Did I finish?" answers
   - correct item attribution
   - no Wheel or hidden-target leakage
   - behavior when native audio overlaps a new turn
3. Explicit human merge approval.

## Deferrals (acceptable if documented)

| Item | Status |
|---|---|
| F1 | `nodeId`-gating edge case |
| F2 | CANVAS_PENDING tool-only hypothesis |
| F3 | Support overcount, documented and not reinterpreted |
| F5 | Matilda conflict, deferred in BUGS |
| F6 | Output-length and latency measurement, out of scope |
| F7 | Additional state definitions, if any exist |
| F9 | Hidden-assessment leakage, to be observed in the human test |
| F10 | Queued-transcript and deferred-TTS residuals |

## Verdict

**Code:** the fixes for F1, F2, F4 and F7 are correct, minimal and appropriately tested. No new blocking code defects were found.

**Readiness for the final human test:** ready, conditional on the targeted suite passing at `e761028` and the F8/BUGS records being confirmed in the PR.

**Merge:** not ready. It requires a full regression pass, final human acceptance at the exact revision and explicit human merge approval. None of these is claimed here.