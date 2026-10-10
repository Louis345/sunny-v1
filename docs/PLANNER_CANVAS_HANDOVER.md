# Planner-authored canvas handover — 2026-10-10

## Readiness

Implementation, build and focused automated acceptance pass. The required commit hook runs the build and complete server/browser suites sequentially; its final transcript is `/tmp/sunny-release-commit.txt`. **Live Saori kiosk acceptance is incomplete.** The Mac is locked; the computer-use tool cannot inspect the dedicated kiosk or verify microphone and speakers. The existing isolated sandbox retains its evaluation and provider receipts. It has not been represented as a fresh, fully accepted run.

## Final architecture

- `AdventureBoardDefinition` owns immutable portals, activity bindings, paths, choices and both viewport compositions. Planner tool schemas use this shared schema.
- The canonical board freezes and hashes that definition. Runtime readiness, selections and completion are separate. The same journey interpreter authorizes launches and drives the visible frontier and chapter completion.
- Alternative paths may reuse canonical activities in different orders. Switching preserves completed work; sibling paths are not completion requirements. A fresh measurement requires a distinct declared instrument.
- The shared React canvas renders authored geometry. Geometry verification uses the real renderer and host level control at 1280×720, 768×1024 and 1470×956. Layout defects return to bounded Planner correction before publication; code does not invent a different journey.
- Opening math, targeted planning and successor correction retain provider receipts. Failed correction cannot mutate academic fields or create an unbounded request loop. Publication retry resumes the saved initial candidate. Successor canvas failure persists an explicit blocked state.
- Choice context reaches Elli as an addressed interaction. Idle conversation remains wake-gated; armed activity speech remains available to the activity.
- Legacy saved board presentation has a read-only adapter. Historical records with no saved presentation are not reconstructed from inventory. Compatibility route projections remain only where older consumers require them; new authoring does not independently author a second route representation.

## Verification evidence

- Build: `/tmp/sunny-build-handoff.txt`.
- Initial full root suite: `/tmp/sunny-full5.json`: 4,114/4,122 passed. Seven spelling host failures exposed overlapping direct-Discovery/Probe classification; one catalog fixture used a nonexistent verified artifact. Both causes were corrected and focused reruns passed; the commit hook is the final full verification.
- Initial full web suite: `/tmp/sunny-web-final.json`: 946/947 passed. The remaining test asserted playback before its asynchronous AudioContext step; awaited `act` now checks the same assertion. Final focused launch/audio tests: 41 passed.
- Final server suite: **4,124 passed across 372 files**. Final web suite: **999 passed across 121 files** (`/tmp/sunny-web-release-final.txt`). An old web fixture initially failed during collection because it requested inventory-based topology reconstruction; it now supplies explicit saved legacy presentation. The read-only legacy rendering assertions remain, and the second reviewer found no blocker in this migration.
- Math full-host release: `src/scripts/adaptiveMathBrowserAcceptance.test.ts` passed evaluation, complete Teaching Board, explicit fork, selected activity, support/quest/boss successors and returned-work calibration. Its providers are recorded fixtures.
- Shared-activity browser test: `src/engine/authoredJourneyBrowser.test.ts` passed both orders, route switching, first-unfinished continuation, duplicate completion evidence and reload fidelity. It exercises the real React canvas and canonical interpreter; it does not simulate activity scoring or claim live voice proof.
- Opening/successor correction tests passed valid correction, invalid correction, changed academic fields, durable response receipts and bounded restart behavior.
- Focused spelling host rerun: seven tests passed; one was interrupted by Vite reloading a build-generated shared file. The interrupted scenario passed separately without a concurrent build (`/tmp/sunny-spelling-isolated-final.txt`).
- The source-child snapshot integrity check passed. Real Ila/Reina tracked context files have no task diff.
- Read-only second-agent review found no remaining P0/P1 in the reviewed production changes after the opening math correction fix.

Screenshots are in `outputs/authored-journey-browser/`, `outputs/math-release-acceptance/`, and `outputs/spelling-adaptation-proof/`. The shared-order screenshots use deliberately synthetic labels and artwork, not the final child-facing creative design.

## Timing and deletion accounting

A previously captured sandbox run spent 86.431 seconds on its initial targeted Planner response and 51.570 plus 53.136 seconds on corrections: 191.137 seconds total provider latency. Six native instrument bindings then took less than 0.1 seconds. That is evidence about the older run, **not a timing claim for the finished refactor**. Long wall-clock waits included paused time. A fresh live generation must provide the new stage timings; the UI reports actual phase and elapsed time rather than inventing an ETA.

Production diff against the starting HEAD, including new production files and schemas: **1,128 lines added, 2,251 deleted; net −1,123**. Tests, fixtures, child data and logs are excluded. Detailed accounting: `/tmp/sunny-final-production-accounting.json`. `session-manager.ts` loses its reading handler to the existing game-event module rather than raising its size budget. Retained adapters preserve saved legacy presentation, activity implementations, and canonical evidence/recovery boundaries.

## Remaining live acceptance

1. Unlock the Mac, sync the isolated certification workspace to the verified source, and launch only through the canonical kiosk launcher.
2. Preserve the saved evaluation for recovery verification. Run a separate fresh sandbox evaluation for final acceptance.
3. Inspect the actual kiosk viewport and complete evaluation → loading → full board; ask Elli about the current loading phase and displayed choices.
4. Verify real “Hey Sunny” / “Bye Sunny”, microphone capture and audible TTS. Recorded PCM, fake STT, routing tests and launch logs do not establish this.
5. Complete the chosen chapter, restart the successor worker and verify the next live board uses saved results without changing its predecessor.

These live steps are required before calling the complete user plan done.
