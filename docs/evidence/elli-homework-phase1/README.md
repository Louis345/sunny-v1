# Elli homework phase one

Base: `1d0883ad49f4d96ed452fa6a25f5b0fc0958d449` (PR #25). Does not include the failed arrival-only commit `45d40e5c`.

## Human failure and earliest responsible layer

The human heard unsolicited praise, an unrelated personal question and a board pitch after arrival. Audio logs established delivery, not usefulness. Earlier tests omitted SessionManager's real context builder, so remembered reunion scripts and imposed tone were absent from their model input. The source chain is `SessionManager.buildCurrentBoardContextForTurn → buildActivityCompanionContext → buildShowroomTalkMemoryPrompt`. Matching remembered direction and delivered wording support this diagnosis without establishing memory as the sole cause.

## Changes

- Remove reunion/tone directions from new compactor output, patch writes, prompt projection and the compactor's legacy input. Existing stored fields remain readable and untouched.
- Remove startup's first-unfinished-lane agenda and greeting task. Source-labelled arrival uses the normal response path and shared brevity default. Explicit silent/none/STT-only settings take precedence.
- Remove canned recovery and brain-busy speech. Successful quiet creates no replacement speech or repair purchase. Failed/truncated terminals produce nonfatal system status.
- Remove the existing empty-length second purchase and disable SDK retries on this voice path. Existing bounded tool execution remains.
- Reduce overlapping persona performance instructions while retaining identity, warmth and humor. Exact source text is in `persona-before-after.md`.
- Preserve interruptions, playback ownership and queued human input. Both direct and deferred completion wait for TTS connection readiness.

Production source: 124 lines added, 229 deleted; net -105 lines (tests/docs/generated files excluded).

No new AI role, behavior router, speech filter or retry loop. No board, grading, termination, pronunciation-support or avatar-policy refactor. Historical child records are not migrated.

## Verification and independent challenge

- Initial phase-one suite: 12 red, then green. Real persona, toolkit and SessionManager context builder; external boundaries stubbed.
- Reviewer found a delayed-handshake/EOS race and lost queued input on failure. Both were reproduced red and fixed. Real local WebSocket tests cover direct and deferred completion; failure tests preserve a distinct queued request.
- Focused suite: 122 passed across 12 files, 13.32 seconds. Build passed.
- Spelling next-board robot: passed, 159.242 seconds (162.06 seconds total), using temporary synthetic data and external network blocked. It traversed Discovery, Teaching and a reused successor; required observations and two Planner handoffs were verified with zero Creator calls.
- The first robot attempt failed in a diagnostic screenshot timeout, which obscured its earlier exception. That result is preserved locally. Diagnostic cleanup now logs screenshot failure rather than replacing the original assertion or skipping cleanup; no loop assertions were removed. The subsequent run passed. Blocked external startup/post-session requests are visible in lab logs and made no provider purchase.
- Independent OpenAI-model source review: no remaining concrete phase-one blocker after fixes. This is not an Opus approval or human acceptance.

`assembled-synthetic-request.json` captures messages and tool descriptions/schemas using synthetic data only. It is an arrival request with no selected activity, not a historical request from the failed session or evidence about a launched activity. Bootstrap still primes voice: lazy quiet playback does not mean zero startup connection work.

## Remaining work and human acceptance

The broader deletion audit remains deferred: call/game scripts, automatic avatar emotions, pronunciation-support speech, session-end intent, legacy/growth/translator paths. The captured request still contains the child-name prefix's ambiguous mandatory-name wording; review separately while preserving identity safeguards.

The existing demo has four playable activities and an explainer already Not ready due to an inherited Creator snapshot mismatch. No retry or repair was purchased. The robot does not establish explainer, Spell Check, Wheel, real listening quality or warmth.

At the deployed commit, a human must open/reopen without speaking, ask for help, request a longer explanation, interrupt, and finish the board. Verify saved observations and successor preparation. If Elli still rants, preserve the first failed request/delivery evidence and stop. No merge or /ship is authorized.
