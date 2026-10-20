# Independent review: PR #18 (`sunny-v1`), head `15bfd2b`, base `001312f`

**Scope:** the full PR diff from base `001312f` to head `15bfd2b`.

**What this review does not establish:** it does not claim reviewer approval, GitHub approval, human acceptance, or any learning improvement. Test counts and simulated or fixture model output are not treated as evidence of usefulness.

## Summary

The direction is sound and faithful to the stated principles:

- It removes scripted praise, turn-count transitions, farewell-word session ending and contradictory practice bans.
- It adds no new model calls for tutoring, no hint ladders and no keyword branches.
- **Artist → canvas:** no violation. No Planner, Experience Creator, board, lock, readiness or "Not ready" path is touched. `recordedActivityStatus` is a read-only projection into Elli's context.

There are still real execution and evidence-integrity gaps. The most concrete one is on the per-turn chart read. There are also two areas where "more freedom" spread beyond spelling practice without being explicitly scoped.

## Findings

### F1. Turn-time chart read is unguarded and fails the whole turn (Medium–High)

**Location:**
- `session-manager.ts`, `buildCurrentBoardContextForTurn`
- `companion-response-runner.ts`, where `boardCtx` is built inside the `try` block

**Verified from source:**
- `getChildChart` is a full, synchronous chart assembly. It can throw in several ways:
  - `Learning profile not found`
  - `assertChildPublicationCommitted`
  - `verified_spelling_artifact_*_mismatch`
  - a re-thrown projection error
- The call is in the runner's `try`. A throw therefore reaches `catch`, and the child hears "I'm having trouble connecting. Please say that again."
- The real failure is a chart or publication-state problem. This repeats on every turn while the condition persists.
- This is the same misleading-recovery pattern already logged in BUGS.md for billing errors.

**Also verified:**
- `buildActivityCompanionContext` calls `getChildChart` again when a spelling assessment is bound, so a practice turn performs two full chart assemblies.
- Latency is unmeasured, which the README correctly states.

**Hypothesis (not demonstrated):** a mid-write read during an evaluation commit could trigger this. No incident was observed in the human session.

**Suggested fix:** wrap only the status lookup in a try/catch. On failure, omit the status and log ` 🎮 [companion] [recorded-status] [unavailable]`. Add a red/green test where `getChildChart` throws and the context still builds.

This is truth routing, not prescription, and is consistent with Law 4.

### F2. Tool-only turn may leave the turn state machine non-idle when another owner holds audio (Medium, hypothesis)

**Location:** `companion-response-runner.ts`, the `!fullResponse.trim()` branch after `onAgentComplete()`.

**What the source shows:**
- `onSpeakingDone` runs only when there is no bridge or the companion owns the audio.
- When native or narration audio owns playback, nothing transitions the state machine out of the post-`onAgentComplete` state.
- The test (`transition-to-work-gate.test.ts`) uses a mocked `turnSM`, so it cannot detect this.
- This is the same class of defect as the stale-PROCESSING bug this PR fixes.

**Suggested check:** add a real `TurnStateMachine` variant with `owned=false`, and assert the state ends IDLE (or that a later request is not queued).

### F3. Assistance is recorded for turns that delivered no help (Low–Medium, learning integrity)

**Location:**
- `recordCompanionHelpTurn`, which is called with empty `fullResponse` on tool-only turns
- `markCurrentSpellingSupport`, which ignores the companion's text entirely

**Effect:**
- Any companion turn during a practice item marks that item `assisted`. Examples: "Wave to me", or "Did I do good job?"
- This PR widens the window by adding the `playing` phase (Monster Stampede).

The error is conservative: it under-claims independence, and practice items are assisted by definition. However, assistance records will over-count delivered help. They must not later be read as "help was given N times" or as evidence that help was useful. At minimum, state this limitation in the evidence README. Ideally, skip support marking when `fullResponse` is empty.

### F4. Wheel of Fortune protection was loosened outside the authorized scope (Medium, scope)

**Location:** `src/souls/companion-base.md`, plus the new assertion in `test-companion-base-rules.ts` that the prompt does **not** contain "Never suggest which letter to pick".

**What changed:**
- The absolute WHEEL_OF_FORTUNE_RULE and CHILD_AUTHORITY_RULE were removed.
- What remains is one sentence: "retains its answer conditions unless live context identifies supported teaching".
- `findCompanionTruthContradictions` only inspects spelling, so there is no trace if Elli suggests Wheel letters.

**Why it matters:** the authorized scope was supported spelling practice. Changing Wheel answer integrity, and child authority over letter choice in non-spelling games, is a separate product decision.

**Recommendation:** have the human explicitly accept this, or restore a concise factual Wheel statement (the child chooses letters; hidden letters stay private). The current test enshrines the removal as intended behavior.

### F5. Matilda now contradicts the shared base for Reina (Medium, unreviewed impact)

**Location:** `src/prompts/companions/matilda/personality.md`. It is unchanged and still contains:
- "She never sounds like a teacher"
- "never explain things you didn't ask about"
- "Two sentences max"

**Conflict:** the shared base now says "Match the amount of speech to the help needed", and the first output budget has tripled (500 → 1500 tokens, retry at 3000).

The Elli conflict was removed as a confirmed defect, but the identical conflict remains for Reina. Opus #6 raised this, and it is not addressed or explicitly deferred. Either:
- document it as a known out-of-scope conflict in BUGS.md, or
- obtain authorization to apply the same fix.

Do not claim the base change is neutral for Matilda sessions.

### F6. Output budget raised without a measurement plan (Low–Medium)

- The 500 → 1500 first-attempt budget (3000 on retry) combines with the removal of "keep ordinary turns brief".
- Voice turns may get longer, increasing time to completion and cost.
- The human feedback was about annoying repetition, and longer default turns could work against that.
- The new length-exhaustion log is good.

**Recommendation:** in the second human test, record response length and time to first audio alongside usefulness.

### F7. Status vocabulary is ambiguous (Low–Medium, still open)

- `Recorded activity status: ready` can read as "done" in ordinary English. This is Opus #4, unaddressed.
- One factual definition line would fix it (e.g., "ready = available, not completed"). That is truth reporting, not dialogue scripting.
- Until fixed, the human test should probe "Did I finish?" after Word Builder reports `complete` while the node is still `ready`.

### F8. Evidence and process gaps (Medium, documentation)

1. **Dangling evidence reference.** `opus-review-source-audit.md` cites `setup-correction.json`, which is not in the diff. Either add it with no private data, or point to the README's isolation statement.
2. **No lab invariant for the purpose/progress defects.** BUGS.md has entries for the 12:35 and Saori sessions, but none for the 16:03 session. That session had two defects: the teacher/withdrawal conflict and the phase-vs-saved-status projection. AGENTS.md requires an invariant entry for each, explaining why the human caught it, why logs did or did not, and why the lab missed it.
3. **Diagnosis confirmation not recorded.** The record shows "authorized changes" but not human confirmation of the diagnosed chain (Opus #9). Record it, or state that it is absent.
4. **No full-suite pass at any revision with the code change.**
   - The first full run had a single failure, the size budget. That is plausibly corrected, but no full run passed after the fix.
   - The size-budget fix left SessionManager just under its 2,500-line limit, so any further fix may hit it again.
   - This is acceptable for human testing under the authorization, but a full pass should precede merge.
5. **Tested revision.**
   - Ila's evaluation test ran `db75fc0` plus local `a8c9970`.
   - Current head `15bfd2b` is docs-only on top of that. This is acceptable provided the PR records that the code is identical to `db75fc0`.
   - Containment is stated: the `children.config.json` diff is empty and `a8c9970` is absent from remote branches. I cannot independently verify the remotes.

### F9. Hidden-assessment integrity is now protected by purpose wording plus structure (Low–Medium, unverified behavior)

**Structurally sound:**
- `stimulus_only` withholds the target and redacts it.
- Monster Stampede's new `currentWord` resolves to `stimulus_only` unless canonical practice is bound.
- `currentActivityState` strips the word.

**Removed:** the explicit "Do not model syllables" rule. The updated test asserts only the new string.

**What would answer it:** a realistic evaluation-phase help request in the next human test (or an approved probe). Watch for any syllable or letter leakage based on audio the model inferred.

### F10. Stale-turn retirement is sound in the cases inspected (no defect found)

**Verified:**
- Ownership checks on turn ID, abort controller and playback request ID.
- Permanent revocation via the turn-ID increment.
- The revival test.
- Newer turns and newer audio are left untouched.

**Residual questions (hypotheses):**
- A replayed queued transcript is processed against the new item. That is correct if the child spoke after the change, but ambiguous if the transcript was captured just before. Note that `updateCurrentBoardSnapshot` already clears pending transcripts on item change, which narrows the window.
- The deferred-TTS path (`pendingCanvas || pendingGame`) does not go through this retirement logic.

## Earlier hypotheses and the user's report

- **Snapshot merging and alternate callers:** the source audit's conclusions match the code. `buildCurrentBoardSnapshot` constructs a fresh object that replaces the old one. The only context caller found is `buildCurrentBoardContextForTurn`. I agree these concerns are unsupported.
- **Ila's evaluation:** qualitative positive acceptance of that part of the session only.
- **Still unverified:** practice help, syllables and slow speech. No delivered sounding-out demonstration and no confirmed rate change were observed.
- **Scope held:** board generation and locked content stay out of scope, correctly. No silent unlocks were found.

## Pushback on "more freedom"

The PR mostly converts prohibitions into purpose and facts, which is the right move. Where freedom needs restraint is not the dialogue but the truth surfaces:

- **F1 and F2:** execution lifecycle.
- **F3:** evidence accounting.
- **F4:** a game outside the authorized scope.

None of these require scripting Elli. They require code to report and execute accurately.

## Readiness verdict

- **Second human test:** ready after F1, which is a small guarded fix with a test. Strongly recommended first: F2 (a real state-machine test) and F8.1.
- **Must be decided explicitly, not silently:**
  - F4: accept or restore Wheel and child letter authority.
  - F5: defer Matilda in BUGS.md or authorize a fix.
- **Merge: not ready.** It still needs:
  - a second human test at the exact revision, judging delivered help, audible pace, truthful status and correct item attribution
  - a full regression pass at the final revision
  - the lab invariants and diagnosis-confirmation record
  - explicit human merge approval