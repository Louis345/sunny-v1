# Planner-authored canvas handover — 2026-10-10

## Manual diagnosis before eval creation

Spelling intake and targeted-generation failures now log `[generation] [failure-diagnostic] [saved] file=...`. The JSON lives in the homework draft's `provider-diagnostics/` directory. It records the failed phase, elapsed worker time, child/homework identity, available certification/session IDs, sandbox build ID, code commit and tracked-change flag, exception, artifact directory, and provider-stage receipt links/timings/hashes. `diagnosis: unassigned` deliberately does not decide whether the Planner, contract, validator, or renderer is wrong.

Each new provider attempt saves a redacted context snapshot; the spelling Planner also captures the exact SDK body (prompt, tool schema, settings and source content) before transport. Request snapshots are separate per attempt. Received responses/tool arguments remain in the original provider receipts; the failure record references them rather than rewriting them. No credentials or SDK headers are added to the new diagnostic files. These remain private local records containing child context and homework, not material to publish in an eval dataset without review.

Inspect the failure record, linked request and receipt together; compare the advertised contract with the arguments and the actual rejection. Only after diagnosis should a human choose a regression assertion or Planner eval. This change adds no repair, retry, eval creation, or child-evidence mutation; existing bounded corrections remain unchanged. Old cached receipts have no reconstructed request snapshot (`requestFile: null`). A diagnostic disk failure is explicitly logged and does not replace the pipeline exception. The tracked-change flag warns when a commit alone is not a complete code identity. Worker elapsed time and provider latency are separate; these records do not estimate remaining loading time or measure the full live session.

## Readiness

The canvas refactor's build and complete tests passed (`/tmp/sunny-release-commit.txt`). The later diagnostic commit gate initially passed 4,126 server tests and failed two legacy-adoption preservation tests (`/tmp/sunny-diagnostic-commit.txt`). Their assertions remain intact; copying receipt-matched request diagnostics resolves both. All 79 focused diagnostic/recovery tests pass (`/tmp/sunny-diagnostic-recovery-green.txt`); the final full diagnostic commit gate remains pending.

**Live Saori kiosk acceptance is in progress, not complete.** The fresh isolated Long e run is `saori-long-e-session-20261010/cert-v3-ila-spelling-f076be75f2-f001b1d0`. Intake captured all ten words in one Sonnet 5 call (38.442 seconds). The canonical kiosk launcher confirmed visibility at port 4592. The user confirms speaking to Elli; live logs show an active evaluation, saved responses and completed TTS playback. Native computer-use inspection currently resolves a different Chrome window, so screenshots and physical audio fidelity remain unverified. The initial session-end event is historical, not the current live state. Broader Planner cleanup and model comparison are deferred in favor of this working session.

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

## Saori live speech synchronization fix — 2026-10-10

Human acceptance found button-triggered audio and Elli replies crossing turn/item boundaries. Playback now has one request/item owner; explicit activity narration cancels pending replies, cancellation retires old packets, and socket/async completion cannot alter successor speech. Canonical spelling privately supplies the current stimulus and saved answer result; legacy conversational scoring is unavailable for that launch. Existing direct-turn execution and context composition were retained in their existing modules. No Planner model, pedagogical branch, generation pipeline, or automatic eval was added.

Validation: build passed; all 380 tests across 63 server files passed; all 1,003 browser tests across 121 files passed; 61 focused server tests cover ownership, grades, context, and provenance; the session-manager size guard passed. Readonly second-agent review found three additional races; their tests failed before correction and passed afterward. The full root suite was not rerun after this voice change. No new commit or push was made for this change.

Production diff: 181 lines added, 94 deleted (net +87); new lines establish playback identity and canonical context. Browser hook itself decreases by one line through shared cancellation. The SessionManager wrapper remains because it is the existing session API; direct-turn execution is now in its existing response runner. Test mocks explicitly model owner identity rather than weakening production guards.

The same isolated Long e sandbox was refreshed and restarted through `npm run sunny:run`. The saved cycle was compared byte-for-byte across refresh: all three evaluation responses preserved. Source child snapshot remains unchanged. Launcher confirmed visible kiosk identity at port 4592, session/assignment bootstrap succeeded, Deepgram connected, and the canonical Discovery node launched. Native visual inspection was blocked by the locked Mac. Live mic/speaker synchronization, companion behavior, and complete evaluation-to-board acceptance remain unverified; do not call the session certified from these tests alone. One assistance-provenance audit finding remains recorded in BUGS.md.


## Loading context and human baseline increment — 2026-10-11

Loading screen text, ready counts, elapsed label and unknown remaining-time status now survive the snapshot projection into Elli's prompt. No provider call or scripted narration was added. New loading snapshots replace rather than accumulate old loading details.

Session finalization writes companion-baseline.md and companion-baseline.json beside events.ndjson. Quiet companion and microphone mute are separate durable events with current server screen/presence context. First browser playback scheduling is correlated by response request ID. Report latency is response-start to receipt of browser scheduling acknowledgement (including return-trip delay), not end-of-speech latency or proof of audible speakers. Report includes samples, p50/p95, mute counts, voice dismissals, ignored ambient transcripts and browser playback failures; it explicitly identifies missing Deepgram/model/TTS stage, synchronization and usefulness coverage. Review raw timestamps/context before interpreting quiet controls as negative feedback. Compare similar tasks and report failures alongside timing, never just a speed improvement.

Validation: 22 focused server tests and 35 browser tests pass, including StrictMode single-press recording and real recorder finalization preserving raw events. Build passes. Second-agent readonly review found no remaining blocker after the StrictMode repair. No live session, sandbox refresh, commit or push performed for this increment; running sandbox still needs refreshed code before acceptance.

Production additions provide observable control/playback events and derived reports; existing snapshot and recorder paths are extended rather than replaced with a parallel runtime. Muting updater side effects were removed. Full latency/synchronization coverage remains follow-up work before calling this a complete baseline.

### 2026-10-11 real intake structural correction
Authoring and execution now share conditional selected-diagnostic requirements. Activity portals require the canonical inventory binding instead of an arbitrary string. Corrections return only diagnostic/board fields and merge into frozen source capture. Historical full corrections and v3 partial corrections are read-only recovery adapters, not parallel generation paths. The provider schema uses a nested object envelope, shared definitions and descriptions for numeric/string constraints; executable validation retains them. Strict tool mode was tried and removed after API grammar compilation rejected it before generation. Production uses its existing ordinary tool transport; schema conformance is not guaranteed by provider decoding.

Verification: 56 focused intake/receipt/diagnostic tests passed before grammar-size projection changes; latest 20 intake tests and production build passed after those changes. Read-only second-agent review found and helped resolve correction routing and paid-receipt reuse gaps. Live ingestion and real kiosk readiness must be recorded separately; unit results do not establish child-session readiness.

Live outcome: ordinary tool transport accepted the corrected response. Real Ila intake `hw-spelling-f076be75` saved all ten Long e words without unresolved capture uncertainty. Opening canvas passed 1280×720,768×1024,1470×956. Chart priors and canonical evaluation publication succeeded after supplying the existing model explicitly. Canonical real kiosk launched on port4593; Deepgram connected, word playback started and real responses committed. Full evaluation→teaching-board generation is still underway, not accepted yet. Monitoring heartbeat inspects logs every five minutes without answering or changing child evidence. Production structural delta in assignmentPlanner.ts: 91 added/16 deleted lines; retained receipt/envelope adapters preserve paid responses and historical recovery. No commits or pushes performed.

### Evaluation is a pre-board experience (2026-10-11)
The child sees the evaluation activity directly, never its persisted compatibility/probe map. Completed probe metadata cannot bypass full-screen preparation. Missing evaluation payload fails closed to unavailable. Canonical packet lifecycle and board kind select the visible screen independently of incidental plan-ID prefixes. Prior tests missed the canonical completed-probe case; eight red regressions now cover naming, absent payload, building and paused states. Browser unit suite:62 passed; build passed; readonly review passed; isolated 1280×720 canonical browser journey passed, with explicit no-node-DOM followup verification running. Real kiosk restarted; real Planner request remains outcome_uncertain and paused, with ten saved observations preserved. This fix does not resolve the separate provider timeout or certify live audio.
Final scoped verification: explicit browser assertions pass with zero AdventureBoard node containers during evaluation and preparation at1280×720; screenshot preparation-no-map.png inspected. Preparation contains its own decorative progress illustration, not the canonical board. Native UI automation could bind ordinary Chrome but not the separate kiosk instance, so actual kiosk screenshot was not independently captured; launcher confirms kiosk-visible and repeated needs_attention status. No real provider request retried. Real session remains blocked by the previously recorded uncertain provider timeout, independently of the now-fixed map gate.

### 2026-10-11 Planner timeout request audit

Current Sonnet remains the model. Targeted planning no longer re-extracts the captured homework image or repeats instructions; original packet and full learning evidence remain durable. Serialized request on the saved failing fixture falls from 1,378,783 to 115,122 characters (mostly image base64 removal; **not** a token or latency reduction claim). Text remains 95,728 characters, including relevant/historical evidence and capabilities; further semantic compression needs evidence fidelity verification. All ten current attempts remain present.

Transport uses one validated deadline, defaults to 300 seconds, honors explicit caller/environment limits, streams current Sonnet and existing adaptive models, preserves older create transport, and disables automatic retry. Raising the bound is recovery headroom, not a promise that a child should wait five minutes. Start/end/error logs include request size, model, elapsed time, usage and stop reason.

Audit evidence: `/tmp/sunny-planner-request-size-audit.json`, red tests `/tmp/sunny-planner-request-audit-red.txt` and `/tmp/sunny-planner-deadline-red.txt`; 149 green tests `/tmp/sunny-planner-request-final-green.txt`; build `/tmp/sunny-planner-audit-handover-build.txt`; recorded browser `/tmp/sunny-planner-request-audit-browser.txt`. Second-agent readonly review found the deadline gap then confirmed repair. Increment adds a no-image guard, removes repeated instruction serialization, replaces split transport deadline handling and adds diagnostic logging; production additions serve the timeout invariant/observability. Existing unrelated staged changes remain intact.

Fresh isolated retest: manifest `/tmp/sunny-planner-audit-sandbox.json`, kiosk port4594, log `/tmp/sunny-planner-audit-kiosk.txt`. Provider intake took 38.865 seconds plus 17.764 seconds for one bounded version/title correction. Source child snapshot unchanged. Kiosk visibility invariant passed; native screenshot `/tmp/sunny-planner-audit-kiosk-visible.png` shows Word 1 of 10, evaluation only, no board. Live teaching-board timing and mic/TTS correctness **not yet proven**. Read-only heartbeat tracks this isolated run, including generation after voice exit.


### 2026-10-11 release-gate outcome — not ready for family handover

Implemented audio inter-chunk drain and ended-session activity retirement with red/green regressions. Recorded 1280x720 browser acceptance passes (117335ms), including evaluation end/resume, a delayed canonical completion delivered while ended, reload, board publication and selected chapter completion. Homework restart reloads the page, so old promises cannot reach a resumed App; independent readonly review withdrew that suspected race. Build, 41 Planner tests, 11 audio tests and diff whitespace check pass; review found no blocker in these implemented deltas.

Actual-provider isolated run saved all ten evaluation answers and ten audible playback completion acknowledgements. Targeted planning 116556ms plus one correction 89056ms still produced opening encounters and invalid checkpoint chronology; generation paused with durable diagnostics. Fixed contradictory correction instruction with a red/green transport regression. This prompt change has not had another live generation run. No Teaching board leaked during paused loading. Real-child source snapshot unchanged. Do not claim microphone accuracy, pronunciation clarity, or a successful live evaluation-to-playable-board run. Detailed local report: /tmp/sunny-release-gate-report.json; paused-loading screenshot: /tmp/sunny-release-gate-loading-failed.png. Temporary automated server stopped; saved sandbox/evaluation/receipts retained.


## October 11 saved-response comparison against main

Offline replay of the unchanged provider response `msg_011CfvutDd5URJ1Sz6HHcyyN` against archived main `7966a748` (no provider calls or child-data changes) found:

- Main parses the response but strips `boardDefinition`. Its legacy builder constructs eight nodes, inserts `choose-path`, and moves the mystery activity after the final checkpoint. Construction is not authored-journey fidelity or proof of a working session.
- Main still reports `planner_baseline_intervention_lineage_invalid`: the practice measurement incorrectly contains intervention references reserved for checkpoint lineage. This constraint predates Saturday.
- Current code additionally forbids the endpoint portal's activity binding and reports the activity absent from the journey.
- Current code then reports a false checkpoint-order issue because any definition issue prevents path-order extraction. The unchanged authored path actually places all declared interventions before the checkpoint. This diagnostic regression originates in `ee40e64f`.

The human saw stalled generation; logs captured correction failures, but the diagnostic incorrectly blamed checkpoint order. The lab missed the combined invalid-portal/valid-order case. Preserve this received response as a regression fixture before changing diagnostics. Do not solve it by reverting to the legacy builder, silently repairing the author's meaning, or weakening evidence provenance.

Evidence: local reports `/tmp/sunny-main-saved-response-replay.json`, `/tmp/sunny-branch-audit-reproduction.json`, and `/tmp/sunny-main-divergence-audit.json`. Replay covers parsing, relationship checks, and legacy construction only; it does not establish live provider, publication, launch, or audio readiness.

### Checkpoint verification limits (October 11)

Build passed. Focused verification passed: 163 root tests and 55 web tests. Readonly second-agent review found no blocker to preserving a checkpoint, not to release.

The normal pre-commit run used default Node 25 instead of the repository's pinned Node 20: root suite reported 24 failing files / 121 failed tests and 351 passing files / 4,029 passed tests; SQLite native ABI mismatch is present in the failure output. A rerun of those 24 files under Node 20 was started, with results in `/tmp/sunny-checkpoint-node20-rerun.txt`; its final result must be checked before release.

The complete web suite under Node 20 reports 120 passing files / 1,008 passed tests, and five failures in `web/src/tests/canonicalNodeCompletion.test.ts` (four local-completion-state cases and the failed-refresh case). These require diagnosis before any release approval. The explicit human request is to preserve and push all work for independent review; the checkpoint bypasses the failed local commit hook for preservation only. No failing test was changed or removed.

### Goal run: measured correction feedback (2026-10-11)

Fresh isolated Long e ingestion succeeded. The browser saved ten simulated responses (five correct, five `zzz` misses), received ten matching playback completion acknowledgements, and showed zero Adventure Board node containers throughout evaluation and loading. The real Planner's initial request was 79,608 characters; its first response took 109,722 ms (34,659 input / 11,186 output tokens). Generation then exhausted bounded corrections on authored portal overlaps at 768×1024. No Teaching Board published. Saved responses and evaluation remain in the certification workspace; this run is a failure, not acceptance.

Root cause addressed narrowly: canvas rejection named overlapping controls without measured authoring-unit separation. Commit `42c9bd0a` reports current and required normalized center separation on either axis; it never moves a portal, changes topology, or weakens publication verification. Production accounting: 10 added / 1 removed lines, justified by new actionable correction invariant; 11 test-only lines plus a bug record. Red then green: `/tmp/sunny-goal-canvas-feedback-red.txt`, `/tmp/sunny-goal-canvas-feedback-green.txt`. Build passed (`/tmp/sunny-goal-measured-canvas-build.txt`). Read-only second-agent review found no blockers; exact numerical threshold assertions remain a potential test improvement.

Commits `8aef63b9` and `4a0a2db6` update existing local provider fixtures to streaming transport and the wrapped intake tool schema, retaining outcome/replay/call-count assertions. Seventy progression tests and one CLI ingestion test passed; the CLI verifies both diagnostic-selection branches and required board definition on selection. A full supported-Node test run is underway; no full-suite-green claim yet.

Failed sandbox: `/Users/jtaylor/.sunny/certifications/goal-spelling-pipeline-20261011/cert-v3-ila-spelling-f076be75f2-f001b1d0`. Browser evidence: `/tmp/sunny-goal-browser-evidence.json`; screenshots `/tmp/sunny-goal-evaluation-1280x720.png` and `/tmp/sunny-goal-loading-1280x720.png`. Real child source snapshot stayed unchanged. Audible clarity and microphone accuracy are not proven by headless playback acknowledgements.

A separate fresh sandbox using the feedback change is in progress under `/Users/jtaylor/.sunny/certifications/goal-spelling-pipeline-measured-20261011`, port 4597. Its browser report is `/tmp/sunny-goal-measured-browser-report.json`. Keep the goal active until real generation, publication, visible fidelity and playable activities are proved. These checkpoints are pushed for review, not a release-readiness declaration.
