# Spelling kiosk — Milestones 2 and 3

The user authorized continuing past the accepted module checkpoint until the
spelling chart is connected to the kiosk for family testing. The normative
contract is LEARNING_FEEDBACK_LOOP.md version 25. This implementation requires
independent review and a backed-up installation before declaring Saori ready.
Nothing is merged. No live provider request or real-child ingestion was used
for implementation verification.

## What the connected path does

The dedicated launch command is `npm run sunny:spelling:chart` from this reviewed
checkout. It validates the chart directory, creates/reuses a private parent PIN,
and starts the existing kiosk launcher with the spelling-chart activation flag.
The default directory is `~/SunnyData`; `SUNNY_CHART_DIR` can explicitly select
another allowed directory. The PIN is shown in the parent's terminal. Existing
Anthropic and ElevenLabs configuration is required. Do not paste credentials
into GitHub or into a test fixture.

Startup opens schema-3 SQLite charts before reporting ready. Unsupported earlier
schemas are refused without migration or deletion. The dedicated process mounts
spelling intents and health routes, disables the legacy WebSocket and legacy
learning routes, and guards legacy word-bank/profile/cycle IO. Other launch modes
retain their previous behavior. It does not redirect the ordinary Sunny command
silently: family testing must use the dedicated command in the installed checkout.

The sequence is parent-confirmed word list → chart-based priors → audio-only
Discovery → evidence-cited Planner decision → optional targeted practice → recall
check → per-word forecast → parent-entered returned marks → report and next week's
Planner packet. The existing getChildChart doorway supplies typed spelling facts
without loading the old JSON learning files. The database and event envelope
remain subject-neutral; spelling owns its instruments, payloads and projections.

A parent transcription is labeled as such; it is not a photograph. The new intake
does not run OCR or import existing homework. Each answer is tied to a persisted
presentation. Correctness is computed on the server. Practice is assisted;
spoken-word replay alone is not assistance. Immediate recall is not retention.
The content catalogue states its algorithm, source and evidence but does not claim
proven learning effectiveness.

Planner proposals use durable request/response files outside the fact log. Raw
output is saved before validation; an uncertain request is not automatically
reissued. A chart change while a proposal is in flight rejects it. Invalid or
uncertain proposals currently require operator inspection; there is no parent
repair screen. This deliberately visible stop can block a live journey and is a
known readiness limitation, not an automatic retry loop.

Elli's existing ElevenLabs voice speaks the word. Audio is cached by voice and
word; a failed/uncertain generation is not silently repeated. The same word across
weeks reuses its audio. Leaving a room cancels pending playback. No new live
conversational companion, Quest/Boss, engagement rewards or math path is included.
The child types spelling responses; this is not speech recognition.

## Verification and regressions

Verification runs in a temporary copy without family context or .env files, with
fresh HOME, no provider credentials, external networking denied, and writes to
Development denied. Loopback is allowed for the real HTTP server and browser.

The new tests first failed for missing journey, route, launcher and audio modules
and absent browser UI. Further observed red/green regressions cover hidden-word
leakage, exact prior input citations, stale in-flight proposals, truthful source
kind, item catalogue/provenance, chart activation, legacy writes, parent form
labels, missing pattern history and audio arriving after the child left.
The final isolated build passes; all 133 scoped tests across 15 files and all
four workflow checks pass. A separate flag-off legacy cycle suite also passes
all 25 tests; it runs in CI alongside the scoped suite. Existing schema/load checks are additional verification, not newly red-first
implementation evidence. The program-word guard was introduced with the initial
feature; no separate pre-fix failing run is claimed for that individual guard.

Two browser journeys run three synthetic weeks through the real endpoints and
SQLite at 1280×800 and 390×844. They check stage progression, parent marks, report
coverage, pattern recurrence, audio cancellation and resume. The provider outputs
are hand-authored recorded fixtures. Browser audio playback is stubbed, so these
tests prove orchestration and invocation counts, not voice pronunciation, MP3
playability or real model quality. No claim of learning gains follows from them.
The actual-server acceptance separately checks readiness and legacy-route closure.
A further red test terminated the dedicated launch wrapper and found its server
still answering health requests. The wrapper now loads the existing launcher in
the same process so its shutdown owner receives the terminal signal. The passing
test requires a zero exit, shutdown-complete log and refused server connection.
The new first-hearing/replay check also went red: normal plays were recorded as
one replay. It now requires zero for the first hearing and one for an actual
repeat, without changing correctness or assistance rules.
Earlier server-only tests could not catch a parent wrapper leaving a child alive;
this directly extends the lab coverage motivated by the human's Exit-hang report.

Human-caught repetition: the parent heard duplicated “able”; historical logs
showed consecutive TTS calls but no invariant prohibited them. The old lab did
not count calls across replay and restart. The new audio tests assert a single
provider invocation across both, and no automatic retry after uncertain failure.
This verifies the new spelling route, not every legacy TTS path. The browser also
caught late playback after leaving; cancellation now has a failing-before/fixed-
after browser regression. A mocked unit-only lab would have missed that timing.

The existing 10,000-event test measures indexed presentation appends, not complete
longitudinal report/Planner latency. Those full-history projections remain a known
performance limit; synthetic three-week acceptance is not a large-history SLA.

## Family test procedure after installation and review

1. Run the dedicated command in the reviewed installed checkout. Confirm startup
   completes and the new “Your spelling journey” screen appears. A healthy database
   alone is insufficient; the new spelling screen must be visible.
2. A parent opens Parent area and enters the PIN printed in the terminal. Add the
   actual school list and test date. Optionally save interests before starting the
   list; do not edit profile while a Planner request is running.
3. Return to child view, select the list and prepare the next step. Let the child
   listen, type, replay a word and choose “I'm not sure” naturally. Comment on pace,
   pronunciation, clarity and engagement. Avoid helping during Discovery; the UI
   cannot detect unreported off-screen help.
4. Leave during a word and reopen the list. The saved place must resume without
   duplicated answers or unexpected audio. Complete practice and recall.
5. In Parent area, inspect the forecast and its stated uncertainty. Only enter
   school results after receiving the real graded test. Select every teacher mark;
   never invent missing marks. Partial tests currently stay pending. Dates can
   reflect a rescheduled test. Corrections require an audit, not a screen edit.
6. Across subsequent real weeks, compare prediction error with matched-word
   coverage, uncertainty and school outcomes. A lower error on a different set of
   words alone is not proof the child learned more. Immediate recall and school
   performance remain distinct.

The first actual model and voice calls occur during this human run and incur the
normal configured provider charges. No live-provider quality has been certified
by the offline acceptance. The model may still produce an invalid proposal; that
must be reported honestly rather than converted into invented evidence.

## Preservation and installation status

All 195 inventoried context directories (25,791 files) matched the before manifest.
Before/after aggregate SHA-256:
`ebe6ac6e19ef1ecca0f457aa03d5ce674c6fae25c6bb87366b94b9aa6c185e65`.
Local inventories are in /tmp and are not uploaded. The foundation checkout's
uncommitted work is preserved separately. No real chart has been created by tests.

At preparation time Saori was absent from the connected hosts and SSH returned
“No route to host.” Installation has not occurred. Once reachable, first inspect
its running server/launcher, chart schema and local changes; preserve an explicit
backup before switching the launcher. Never migrate/delete an older chart or
reuse a live child directory as a synthetic test directory. A clean local test
result does not establish that the family computer has this code.
