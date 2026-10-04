# Original Sunny board and Opus 5.5 compatibility

This is the bounded board/model fix authorized October 3, 2026. It is an incremental step on `codex/spelling-plumbing`, based on `53214e2`, not completion of Parts B–D of the plumbing prompt. The original kiosk remains the intended child experience. The separate spelling app is not activated by this change. The SQLite answer bridge, existing-parent-area integration, and removal of the superseded app remain outstanding.

## Human-caught problems and lab coverage

The parent saw Reward Break obscure the locked Word Radar checkpoint at a roughly 1200 × 788 CSS-pixel kiosk viewport. Slots 6 and 6.1 were only 8% of the board height apart. Runtime logs record node state, not rendered bounding boxes. The previous layout lab used a large 2048-pixel desktop and checked label/label or route-label/destination intersections, missing this complete-button collision. The new browser test renders the actual React board and production stylesheet at 1200 × 780, 768 × 1024 and 390 × 844 and checks complete button bounds. It failed with overlap areas 8133 and 3863 square CSS pixels before the fix. A narrow-window check then caught five pixels of clipping; the final position also keeps the complete button inside that viewport. Slot 6.1 moves to clear space; artwork, portraits, typography, node actions, identity, state and topology stay unchanged. Explicit Creator positions remain authoritative; this fixes the demonstrated default-slot collision, not every possible generated layout.

The kiosk had been opened about 39 seconds before the new assignment was published. Its mounted prior teaching board therefore disagreed with the current API. This was an installation-order error, not evidence that new homework was lost. The canonical new cycle had zero observations. Do not automatically replace an open child chapter: the learning contract forbids that interruption. Publish first, then reopen at an idle session boundary and verify the rendered board identity, not just server health. New invisible data-board-id, data-child-id and data-plan-id attributes support that assertion. Their browser assertions failed before implementation. An API-only audit missed the screen discrepancy; no automatic reconciliation is claimed here.

## Planner transport

The shared Planner transport policy covers Opus 5.5, Sonnet 5.5 and Fable 5.1. These models use automatic tool selection, streamed responses, an explicit high reasoning effort, at least 32,000 output tokens and a five-minute overall deadline. Effort, token budget and deadline can be configured. Existing models retain their request shape. Duplicated per-caller model checks are deleted; the helper and its tests are additions required to enforce one transport invariant. There are no automatic retries.

The chart, assignment and canonical next-step paths checkpoint the entire provider message before interpreting it. Truncation, refusal, context exhaustion and paused turns produce named failures before any tool output is accepted. Those received failures remain distinct from a network timeout with an unknown outcome. Old saved proposals remain readable. The experience brief path also uses streaming and explicit native structured output because its installed SDK predates these model IDs. No dependency upgrade or new production model call was introduced. Spelling's canonical next-step decision respects SUNNY_EXPERIENCE_PLANNER_MODEL; math retains its existing configuration precedence.

Red tests reproduced forced-tool requests, missing reasoning budget/effort, generic errors for received truncation/refusal, absent native-output configuration, and incorrect spelling model precedence. Regression tests include the real Anthropic SDK's SSE parser with a synthetic fetch response, durable full-message receipts, legacy receipt compatibility and no retry after timeout. This proves local request/receipt handling, not account access or superior teaching quality.

Reference: https://platform.claude.com/docs/en/models/opus-5-5/migration-guide

## Verification and remaining acceptance

Verification runs in a temporary copy without family context or .env, sanitized HOME and environment, external network denied and writes beneath ~/Development denied. Provider calls use fixtures or mocks. Root build passes. The focused server suite has 187 passing tests; web board/launch/packet suites have 90. Five workflow-policy checks ensure this branch cannot trigger the paid API reviewer and uses isolated verification. Browser checks exercise the actual board component/CSS, not a complete child learning week. Full spelling-week acceptance through the existing UI remains part of the unfinished plumbing integration.

No live model calls, new ingestion, generation, chart migration, merge or Saori code installation occurred during this verification. A model change cannot be claimed to improve learning until real predictions can be compared with eligible observations and later school results. Track coverage alongside prediction error; also track Planner failures, response time and cost. Do not compare unmatched word sets as a causal effect of the model.

Before installation: obtain the existing GitHub reviewer's exact-commit acceptance, preserve a verified backup, and set the explicit model only in the original kiosk runtime. Reopen the kiosk after the assignment is published, preserving the user's window/orientation preference. Verify the new assignment identity and zero synthetic observations before inviting a child to test. Installation is not complete merely because this document exists.

## In-progress original-kiosk evidence integration

Discovery now retains the frozen node identity in its server response context. A
context naming another node is refused before a response write; missing node
identity leaves evidence unknown/practice. Three regressions failed first: missing
identity in the context, accepted mismatched identity, and an independent reading
without node identity. A parent can see which activity opened; earlier labs and
logs checked artifact and item matches without comparing the retained node. This
is a boundary check, not completion of actual launch tracking for practice games.
The SQLite per-response bridge and full original-UI acceptance remain unfinished.

The original board already sends a `phase: launched` context before mounting an
activity. The server now validates that node against the current spelling cycle,
issues a launch ID for ready/active/completed nodes, and freezes that ID into the
item context. Missing or rejected launches make assistance unknown and add
`launch_unverified`. Two tests failed before implementation. This closes the
previous lab assumption that a valid item snapshot alone proves a launch; the
parent could see the actual activity while old logs recorded only item binding.
The launch ID is currently retained for the voice session, not yet persisted in
SQLite. Replay correlation and the full browser/database journey still need
verification before deployment. No child-facing controls changed.

## Original Discovery runtime bridge (integration in progress)

The original session now writes a typed presentation when a validated response
item opens, before its answer arrives. The original Discovery HTTP endpoint
writes the captured answer with that presentation ID and source attempt ID.
Repeated delivery remains idempotent. Confirmed browser playback acknowledgments
supply the replay count; sending TTS alone does not establish audible playback.
The existing cycle still receives the answer for the current board Planner.

Two runtime regressions failed before wiring: no presentation at item opening,
and no SQLite response after an actual HTTP submission. Both pass after wiring;
27 tests in four files and the server/web build pass in the isolated offline lab.
These additions establish the previously missing runtime calls; no child UI lines
change. The adapter opens and closes its own database handle for each write.

This is not deployment acceptance. Relaunch/late-response correlation, failure
between the cycle and chart writes, practice/aggregate instrumentation and full
original-browser verification remain required. A configured chart with no valid
prior presentation rejects the write instead of fabricating an earlier exposure.
Current audio-only Discovery has no separate hint button; its false hint field
must not be reused for an instrument with unmeasured help. No live data or
provider calls were used. Saori remains unchanged.

The next failure-injection test found that a missing chart presentation still
advanced the legacy cycle before returning HTTP 409 (one observation instead of
zero). The endpoint now commits the chart write first. The regression passes,
as do the focused route/support/typed-response suites and isolated full build.
This prevents a rejected chart write from advancing the current board's evidence.
It does not make the two stores atomic: crash recovery after a successful chart
write and failed cycle write remains unfinished and is required before activation.
The change moves existing lines; it adds no alternate scoring or fallback path.

## Discovery delivery recovery

A server-owned operational receipt now preserves the verified raw submission,
per-item support and both write inputs before either store is updated. It is
published with an exclusive atomic link after file flush, followed by directory
flush. Retrying the identical delivery uses those frozen inputs even after the
voice session disappears. Changed text or other request facts are rejected.
The chart presentation must already exist; recovery cannot manufacture one.
No provider call, learning decision, automatic retry loop or new UI is introduced.

The new recovery test initially failed to load the absent implementation. It now
injects failure in the legacy write after the chart commits, closes/reopens the
DB, repairs without live context, proves exactly one response and rejects a
changed answer. The actual HTTP regression also clears the voice-session registry
between duplicate deliveries. All 21 tests in four files pass; the isolated full
build passes. These tests establish retry recovery, not atomic transactions across
SQLite and JSON or an automatic startup sweep. Receipt disk-full and multi-process
fault injection remain unverified. The extracted module is a new delivery invariant;
route changes replace the direct chart write with the recoverable boundary.

## Relaunch correlation

The replay regression initially reused the first launch ID and its companion help
for the same word on a second launch. The original App now sends its existing
completion identity as an invisible correlation token in the launch event, item
telemetry and submitted answer. The server still validates the node and issues
its own launch ID; a client token is not authority to select an academic node.
History is keyed by server launch plus item, and response lookup selects the
matching token. An ambiguous tokenless lookup cannot choose one of two launches.
Audio acknowledgments retain the launch captured when narration began.

Two follow-up red checks caught old-launch feedback contaminating the current
item and an old-launch narration request being accepted. Those now respect the
same token boundary. These extend the human-caught wrong-activity/support
invariants: older logs named the word but could not disambiguate repeated
launches, and earlier tests never replayed the same item within one voice session.
No visible strings, layout or activity mechanics change. The change replaces
item-only history lookup; it does not introduce a second launch pathway.

Verification: 28 server tests, 114 existing web tests and the isolated full build
pass. The original-browser full-week and visual comparisons are still required;
these unit/HTTP tests do not substitute for them. Saori remains unchanged.

## Missing support remains unknown

Practice adapters can now preserve unmeasured support as null rather than invent
false or zero. The original presentation adapter downgrades an instrument with
unknown presentation support to practice. Captured raw answers still receive
code scoring, but unknown support is ineligible for independent evidence. An
unanswered earlier presentation with unknown exposure also prevents a later
clean-looking item from erasing that uncertainty; the projection reports it
separately from confirmed exposure. Corrections cannot turn unknown help into
asserted absence or remove recorded help.

The unknown-support test first failed schema validation. A second red test caught
eligibility surviving earlier unknown exposure; both now pass alongside core,
review, schema and runtime suites and the isolated build. Contract version32
records the boundary. This replaces boolean-only validation and eligibility;
it does not claim that practice-game runtime capture is already connected.

## Legacy completion support boundary

The canonical spelling completion path also spread a whole-session companion
interaction across every target. A red regression reproduced two assisted words
when only the first had a per-item scaffold. Spelling completion now uses the
per-item scaffold and instrument's known teaching exposure; session companion
notes remain separate observations. Missing word-specific support stays unknown,
including legacy spelling nodes without frozen item contracts. Math is unchanged.
This replaces two expressions in the existing first-recording reducer; no new
learning path is added. The focused spelling/runtime suites and full isolated
build pass. This fixes the legacy half of that contamination bug; practice-game
SQLite capture is still pending and must use the same per-item boundaries.
The human could see which word received help; logs merely reflected the aggregate
classification, while previous tests never combined one scaffolded word with
another word and a session-level companion note.

## Canonical completion launch gate

Spelling completion now compares the submitted node and correlation token with
the server's actual launch before recording canonical evidence. A configured chart
requires that launch to be present. The App supplies the voice session separately
from the completion identity: those IDs have different purposes and must not be
interchanged. This adds a provenance invariant at the existing completion boundary;
no activity, layout or learning decision changes.

The first mismatch test went red because the route reached a later evaluation
endpoint guard instead of checking launch provenance. It did not reproduce a
successful false credit in that evaluation fixture. Expanded checks cover a wrong
node, wrong token and missing launch and assert unchanged observations. Isolated
server/web tests and build pass. Completion retry after loss of the live session
still needs durable launch recovery for practice, alongside its typed capture;
this gate alone is not full practice integration or deployment acceptance.

## Original Word Radar practice capture

The original Word Radar now reports captured practice responses through the same
server boundary as Discovery while keeping its practice screens and behavior.
The original App opts in only for spelling practice. Item flash/response telemetry
commits a practice presentation before answering; unknown hint/help/replay
measurements remain null. Typed text or a captured transcript is retained and
code-scored as practice in the chart and cycle. A missing captured answer is not
invented from the game's correctness flag. Assessment mode keeps its existing flow.

Two red tests showed no practice presentation and no callback for an actual
practice response. The component, session and HTTP tests now pass, including a
practice response with null support and retry after voice-session removal. The
isolated build initially caught a nonexistent packet field; the adapter now uses
the existing active-plan domain. Full build and focused server/web tests pass.

This connects one original practice instrument. Native iframe games, explainer,
aggregate limitations, completion deduplication against per-answer captures, and
practice restart recovery still require integration before activation. Do not count
completion summaries as additional independent attempts. Full-week browser proof
and independent review remain outstanding; Saori is unchanged.

## Per-answer replay preserves the closed chapter

The newly connected practice response path initially rejected responses to a
completed spelling node. The red replay test reproduced that rejection. The
existing item reducer now accepts completed-node practice and preserves the
node's completed state when recording an individual replay answer. Lifecycle,
prior evaluations and the Planner decision remain unchanged; retries remain
idempotent. The normal factual transition audit entry is still appended.
The first test overconstrained that audit history and was corrected to assert
unchanged theory decisions rather than suppressing the required audit entry.

This replaces the active-state guard and item-state assignment; it adds no new
progression logic and leaves math behavior unchanged. All 37 tests in three
focused suites and the isolated full build pass. Completion deduplication and
other practice instruments remain unfinished; no live installation occurred.

## Completion reuses the answers from the actual launch

The red integration regression caught completion appending a correct summary
observation after the same launch had already recorded a wrong raw answer.
A second red case caught averaging two attempts to the same word into the
completion score. The original response boundary now preserves the server launch
ID in legacy observations, and Word Radar completion selects only that launch's
latest committed response per item. All earlier attempts remain immutable audit
facts. A different launch cannot borrow those observations or the client score.

The changes add launch correlation to the existing boundary and replace summary
observation creation for the instrument already connected per answer. Other
instruments retain their existing path pending source instrumentation. There is
no new child screen or Planner call. This regression was discovered during
integration; the previous lab covered raw responses and completion separately,
so it did not catch double counting across both paths.

Focused replay, delivery-recovery and HTTP tests plus the isolated full build
pass. Native games, explainer capture, completion restart recovery, parent page,
and full original-browser acceptance remain outstanding. No live changes.

## Native item opening: Letter Rush read-and-race

The real iframe bridge now carries the original launch token. Letter Rush
read-and-race reports the word opening when its spelling is actually flashed;
the bridge resolves the frozen item identity before forwarding the existing
state message. The existing server presentation adapter then records practice
with letters visible and unmeasured hint/help fields left null. No presentation
is reconstructed from a completed game or an answer. Unknown words are not
bound. Other Letter Rush modes remain uninstrumented at this checkpoint.

The bridge regression failed first because item identity, practice capture and
launch correlation were absent. A composed real-bridge/session/database test
asserts the presentation exists while response count is zero. This adds only
invisible source telemetry and URL correlation; it replaces the existing
read-and-race flash statement with flash plus its exposure event. There is no
new renderer. Native response delivery is still pending: existing attempt events
continue through the old attempt recorder and must not be claimed as SQLite
responses. Completion must not opt native games into per-answer dedup until
that connection exists. Full-browser visual acceptance remains outstanding.

## Native raw response delivery

The existing native `attempt_event` boundary now connects an already-presented
practice item to the durable two-store delivery helper. It verifies node, launch
token, server launch ID and frozen contract before recording the raw response.
SQLite keeps unmeasured help and replay fields null; the canonical cycle grades
the actual letters. The private word-bank adapter receives that computed result
instead of a conflicting client correctness flag. Unknown/uninstrumented items
remain on the legacy path pending limitation capture.

The red native-handler integration test produced zero chart responses. It now
asserts one response and one canonical observation after duplicate delivery,
wrong raw letters graded incorrect despite client `correct:true`, truthful
support fields, and rejection of a different launch token. This adds a bridge
to existing persistence at the original event boundary, not a new scoring rule.

Native completion deduplication, retry after lost launch memory, remaining game
modes and explainer capture still need integration. The earlier delivery-receipt
restart test covers the shared helper, not recovery of a native event after the
server loses its launch identity. No live installation or provider calls.

## Native completion uses captured launch evidence

The HTTP completion regression reproduced a native summary appending a second,
incorrectly correct observation after a wrong per-answer record. Completion now
uses the same launch-bound reduction as Word Radar when that actual launch has
already committed native responses. It does not select captures by word/date or
activity label. The fixture first needed correction to avoid copying an already
published board into a different synthetic cycle; that fixture error was not
evidence of the product bug. The subsequent red reproduced the duplicate.

This replaces the Word-Radar-only route condition with an evidence-based opt-in;
no new reducer or child flow is added. Uninstrumented native launches and missing
raw answers still need explicit limitation handling, and completion recovery
without live launch memory remains unfinished.

## Original-browser audio regression

The original-kiosk browser acceptance run failed all four scenarios at the first
spelling prompt: the event adapter dropped launchToken before calling the speech
handler, which correctly rejected the uncorrelated request. The smaller lab
tested the speech handler directly and therefore missed the adapter boundary.
Server logs did report spelling_stimulus_mismatch; the browser check turned that
log into a failed child-visible outcome instead of accepting module-level green.

The adapter now forwards the existing token. A focused regression first failed
for the omitted field, then passed. This adds one metadata field and deletes no
code; the guard remains intact. Original-browser verification is required before
claiming readiness. This defect was found in the isolated lab; Saori was not
changed.

## Original-browser replay duplication

After the audio correction, both adaptive full-route browser scenarios passed.
The two replay scenarios found a new double-write: Word Radar emits general
attempt telemetry as well as its durable per-answer HTTP request. The native
iframe adapter was consuming both. It now leaves Word Radar persistence with
the HTTP boundary; other native attempts keep their existing adapter. The
focused regression failed with an unwanted chart response before the fix.

Both replay browser scenarios now pass, as do 29 focused server tests and the
full isolated build. The old browser expectation of no replay HTTP calls was
updated to exactly two, matching the authorized per-answer plumbing; it still
asserts exactly two new immutable practice observations and no changed prediction
evaluations. Screenshots of the adaptive board and completed route were inspected.
These runs use fixture providers and no configured SQLite chart, so they verify
the original UI path, not full chart integration, live model quality, portrait
layout or installation readiness. Saori remains unchanged.

## Original portrait kiosk with the chart enabled

The browser lab now has a 768×1024 portrait scenario using the original host,
WebSocket, activities and HTTP endpoints with an isolated SQLite chart and a
recorded prior provider. It asserts priors precede presentations, Discovery
correctness matches raw answers, and every replay/first answer has exactly one
chart response matching the canonical observation ID. It exercises reload,
practice, checkpoint, replay and return to board.

Enabling the chart exposed a real startup race: clicking a teaching node just
after reload could send its launch and presentation before the voice session
existed. The chart correctly refused the subsequent answer, stopping completion.
The old chart-disabled lab allowed unknown live context, so it missed this.
The app now holds one requested launch until session_started supplies a session
ID, then consumes it before dispatch. Closing or changing assignment clears the
pending request. It does not invent a presentation after answering or relax
evidence checks. The browser asserts exactly four distinct launches across the
scenario. This adds a bounded pending-action handoff, not a new child screen.

The first test setup also exposed the chart-directory guard because the synthetic
child used a real-child ID without its required isolated directory declaration;
that fixture error was corrected and is not claimed as a product bug. Portrait
board screenshot inspected. This remains a fixture journey, not the full-week
parent-report/calibration milestone or a live Saori acceptance.

## Chart-enabled native route ordering

The new portrait adaptive browser case enables SQLite through Discovery, route
selection, Word Radar practice, Letter Rush and the final checkpoint. Its first
run found another boundary race: the route-selection HTTP request and activity
launch were sent concurrently. The server rejected the still-locked route node,
then correctly refused its answers because no validated presentation existed.
Earlier chart-disabled tests tolerated missing live context and therefore missed
this failure despite completing the visible route.

The route-choice handler now waits for the existing selection acknowledgment
before launching its node. Preview acknowledgments preserve preview behavior;
a failed choice is logged and cannot launch an uncommitted route. No evidence
guard is weakened and there is no new screen or provider call. The test compares
all chart response source IDs with canonical observations and requires every
Letter Rush presentation to have its response, marked practice.

Verification passed: original portrait adaptive route with configured SQLite,
30 launch tests, and full isolated build. The recorded-provider journey wrote
10 priors and 28 raw responses, exactly matching the canonical observation IDs;
four Letter Rush presentations each had a response. The acknowledgment uses
selectedRouteId, not the unrelated preference-applied flag. The initial attempt
to use that flag correctly withheld launch but also blocked a valid route; the
full browser regression caught it. Portrait board screenshot inspected. This is
not yet the full-week parent report, all activity modes, or live acceptance.

## Original caregiver spelling report and school entry

The original caregiver entry is the Sunny menu's Learning report, which opens
`/parent/learning-report`. It now links to `/parent/spelling`; no child screen or
launcher is changed. This page reads the existing typed projections, exposes the
existing one-time profile-draft confirmation, and records explicitly confirmed
per-word school marks as parent transcription. It does not claim a photo exists,
invent missing written answers, or require a replacement-app plan to accept real
school evidence. Missing priors/forecasts show insufficient evidence, not success.

New HTTP and component tests first failed because these original-parent adapters
did not exist. The HTTP test covers explicit confirmation, repeated submission,
incomplete/conflicting results and unknown children; the component test requires
all marks and confirmation. The original chart-enabled browser now also reaches
this page through the existing report link and submits school marks. This change
adds a parent-only feature; small route registration and parent navigation are the
only additions to shared hot paths. No learning doctrine or scoring changed.
Schedule controls, recovery, and automatic forecasts remain separate unfinished
parts of this same milestone; this page alone does not close the loop.

Verification: server route tests, both parent components, full build and the
original portrait browser journey with real HTTP parent entry pass. Parent
screenshot inspected after the saved school marks. The isolated browser's
post-session background chain logs a missing synthetic `soul.md` on navigation;
this is not proof of a successful post-session chain, and full-week acceptance
must cover that remaining fixture boundary rather than hide the diagnostic.

## Parent-controlled test schedule

Contract 33 adds strict parent-only schedule revisions and a pure projection.
The new schema/projection test first failed (module absent), and the original
parent component test failed for its missing weekday control. The actual parent
page now saves a usual weekday or a date/explicit unset for a specific list.
An exception wins over the default. Printed dates remain proposals, with no
automatic confirmation. The page states the default calculation: first chosen
weekday strictly after the recorded assignment date (UTC), with the computed
date visible and changeable. No live date is set by this patch.

Schedule facts retain natural change IDs and cannot be rewritten by corrections;
new changes are new parent facts. Projections retain the supporting fact ID for
the upcoming forecast integration. No scheduling decision changes correctness,
legacy board decisions, or recorded school-result dates. Added parent controls
are the requested feature; no child hot-path additions. Forecast citation wiring
remains unfinished and must be implemented before full acceptance.

Verification passed: 43 focused server/schema cases, two parent component cases,
full build, and the original portrait browser journey saving both a weekday and
an assignment exception before its school marks. Updated parent screenshot
inspected. These are synthetic settings only; Saori and Reina's records remain
untouched.

## Original checkpoint forecast and parent recovery

The new original-flow forecast adapter first failed its missing-module test. It
uses the chart doorway, existing checkpointed provider receipts, shared transport
and fact validation; it does not create a replacement-app plan. The browser test
then failed at the parent page because the checkpoint had never invoked it.
The original completion route now queues it after the spelling frontier completes,
without holding up the child. Unknown/missing recall evidence is not manufactured.

The request freezes the effective parent schedule and chart sequence. The forecast
stores/cites that schedule fact (or explicit null when none exists); old facts
without the new fields remain readable. A changed chart rejects a stale receipt.
Provider failure preserves the receipt and cannot trigger another automatic call;
the original parent page offers an explicit retry. A completed forecast is reused,
including on replay, and school results prohibit a retrospective forecast. Schema
validation still requires real cited recall facts, full word coverage and no school
result. No default scheduled date or probabilities are invented by code.

Verification: focused forecast/core/schema/server tests, three parent component
cases, shared recovery tests and full build pass. Original portrait browser proves
automatic invocation, a recorded failure, no automatic replay call, explicit
parent recovery through HTTP, and saved forecast followed by school calibration.
The browser uses recorded probabilities only; no paid provider verification.
A further red test caught absence of pending status: the parent now sees a running
forecast as preparing, with a read-only Refresh action, not a premature retry.
The displayed forecast error screenshot was inspected. This still is not final
all-activities/full-week/install acceptance.

### Native visibility measurement — October 4

A composed native bridge → SessionManager → SQLite regression failed because an omitted visibility measurement was recorded as lettersVisible:true. The old ambiguity boolean conflated unknown and visible. Replaced it with nullable measured visibility throughout presentation and response context; confirmed exposure remains sticky and unknown cannot become false on a later hidden event. HTTP preserves null rather than inferring false from absent exposure flags. Three visibility cases and focused route/narration suites plus isolated full build pass. This fixes measurement truth before extending native modes; no UI changes, live data, provider calls or installation. Existing browser cases covered explicit visible/hidden states and missed omitted metadata; source-only logs did not distinguish the two.

### Letter Rush source openings beyond read-and-race — October 4

Red source tests executed the actual beginWord function: type-and-spell, hear-and-spell and mastery-run emitted no opening, so their raw native events could not reach the typed response path. Those modes now announce the actual current item before narration/interaction, reusing the validated native bridge and durable response writer. Explicit item-opening identity replaces the assumption that all native presentations have a flash phase. Read-and-race or a displayed whole-word scaffold records visible; other modes preserve unknown visibility (the full dynamic visual surface is not certified as hidden). No rendered elements change. Trap-the-imposter remains excluded from whole-word response capture: its target-selection results are not typed spelling answers and still require limitation capture. The explainer also needs separate exposure and choice/limitation handling. Tests verify one opening per actual beginWord and no fake trap spelling opening.

Validation: focused source/bridge/session/HTTP tests, full isolated build and original adaptive portrait chart browser pass (28 responses, four native presentations, ten priors). Browser still covers read-and-race, not all added modes; their opening functions and shared bridge/response boundaries are tested. Existing post-session synthetic soul.md gap remains visible. No paid providers, Saori writes or review post.

### Explainer exposure and non-spelling response limitations — October 4

Actual explainer renderScene now records each word when its first chunk becomes visible, once per rendered model; launch alone creates no exposure. Chunk-choice source events preserve the selected text in strict activity.limited facts with server launch provenance, never as a whole-word spelling response. Trap-the-imposter target results use the same limitation channel, preserving reported aggregate outcome while declining to fabricate spelling text. Limitation events cannot change spelling scores or private word-bank correctness. The original parent report discloses missing word-level answers. Contract34 documents the boundary. Red source-function tests, real server/SQLite duplicate and wrong-launch tests, strict schema and parent HTTP/UI regressions cover the path. These are composed/source tests, not full-browser explainer/trap acceptance; delivery still relies on live launch. Adds necessary source instrumentation and a typed limitation boundary; no rendered child elements changed.

Existing real iframe explainer browser suite initially rejected the new limitation event because it previously expected zero attempt events. Updated it to require exactly one unscored captured choice and exactly one earlier frozen-identity exposure. Six browser tests across1280×720 and1365×768 plus build pass; strategy screenshot inspected. This exercises iframe bridge transport, not the full original-host explainer route.

### Part B — remove the separate spelling application

The original server now always mounts the original routes and WebSocket handler. Deleted the SpellingChart/ProfileSetup/PatternReport UI/CSS, /spelling branch, dedicated launcher and npm command, separate child endpoints, mode-specific legacy-path guards and their tests. Kept the chart database, typed facts/projections, checkpointed provider/profile modules and chart startup/close tests. CI now selects original browser and parent integration tests in place of deleted app tests. Red entrypoint invariant failed on the mode flag, then isolated startup/parent/entrypoint tests, workflow tests and full build passed. This is authorized removal under Part B; more than500lines removed, child rendering remains the original App.

Post-removal original portrait chart journey, replay, parent schedule saves, forecast recovery and school report browser passed. Full original-host proof still has the documented synthetic post-session profile gap; this removal is not installation readiness.

## Original engagement source capture (2026-10-04)

The original WordRadar input handler now measures first keyboard/text input delay, gaps of at least ten seconds between inputs, and bursts of three erase actions separated by no more than one second. Existing telemetry carries these measurements with the current item and launch token. Confirmed audio playback ACKs record replays after the first stimulus; a newly summoned companion records a help request on the active response item. Explicit skipped answers record one skipped signal from the durable response receipt, including after restart. These are operational observations, never spelling correctness or mastery.

Red verification found no chart signals from the actual session boundary and initially missed text-field input because only key append was instrumented. The shared input recorder now covers both sources. The server requires the matching item/node/token and the writer cites its previously committed presentation; duplicate signal IDs are idempotent. No item or answer is fabricated. Focused verification passed 22 server tests across three files and 43 WordRadar hook tests, followed by the complete isolated build. The original portrait browser journey with SQLite also passed, asserting first-input measurements and presentation citations through the existing host, WebSocket, HTTP, replay and parent report flow.

Fix versus delete: the existing input, playback and companion boundaries gain measurement calls; the existing durable delivery path gains a skip measurement. New helper code enforces presentation provenance once. No UI, listener, timer, provider call or academic scoring path was added. Non-durable measurement failures log explicitly and do not interrupt the child interaction. This does not yet cover native/speech input timing, rapid wrong attempts, session duration, quit, or later-day returns. The full milestone, post-session fixture gap, review and installation remain outstanding; Saori is unchanged.

## Original parent intake-prior recovery (2026-10-04)

A new restart regression reproduced an unintended second provider call when intake was repeated after a recorded prior failure. Original intake now stops with `prior_needs_attention`. The existing parent recovery endpoint accepts an explicit prior stage and acknowledgment; the parent report shows a retry control and pending state. Recovery reads the existing chart assignment and uses the same bounded, durable prior checkpoint through the chart doorway. It never re-uploads the source, creates another assignment, or proceeds into replacement-app planning. Successful retries are reused. Observed assignments cannot acquire retrospective priors.

Red HTTP and component checks showed the missing prior status/control. Seven server tests across two files and five parent component tests passed, followed by the full isolated build and original portrait SQLite journey/replay/parent report browser run. The build initially identified a missing test JSON type assertion, corrected before the successful build. The new retry itself is covered through real HTTP plus database reopen, not yet a full-browser failed-intake scenario.

Fix versus delete: replace unconditional original-intake retry with recorded-failure handling; extend the existing parent recovery dispatch instead of adding a second page or provider transport. New status and recovery functions are required to expose saved intake failures. This prepares chart priors only: resuming interrupted original intake publication and preparing an already-published, zero-observation legacy assignment still require integration. No Saori changes, real evidence, paid verification calls, or review post. Full human-test readiness remains pending.

## Existing original assignment preparation (2026-10-04)

Added an explicit low-level installation adapter, `prepareExistingOriginalSpelling`, for an already-published original spelling assignment that has never started Discovery. It reads the frozen original evaluation contract and source fingerprint, checks the word list against captured targets, and invokes the existing chart intake/prior checkpoint. It does not re-ingest the PDF, rebuild/publish a board, copy observations or invent presentation history. The date remains null until a parent schedule fact supplies it. The original host must be stopped at the installation boundary before invoking this adapter; it is not an automatic live-session migration.

The initial tests failed because the adapter was absent. The tests verify unchanged original cycle bytes after two calls, one provider invocation, only assignment/tags/priors in the chart, and refusal of an active evaluation before any chart write/provider call. An initial active-session fixture used the wrong repository transition signature; corrected the fixture rather than weakening the guard. The original-browser fixture additionally creates its assignment with chart capture disabled, prepares it afterward, and then follows the same original child/parent path. This is synthetic deployment preparation; no actual Saori assignment has been changed.

Fix versus delete: pure addition is required for the user-authorized one-time installation preparation. The adapter reuses intake and provider checkpoints; it introduces no alternative runtime or launcher. Native/completion recovery, full activity/engagement coverage, post-session fixture, timings, final acceptance and review/install remain outstanding.

Verification result: five preparation/intake tests passed, complete isolated build passed, and the new `existing=true` original portrait scenario passed through Discovery, reload, practice, checkpoint, replay and parent forecast recovery/schedule/school report. The first browser setup attempted to open the synthetic real-mode chart before declaring its directory; moved chart opening until after the chart-disabled original ingestion. Product guard unchanged. This proves the preparation path on recorded fixtures, not host installation or real-model latency.

## Parent repair of saved original answers (2026-10-04)

The parent report now offers explicit repair of an assignment's saved answer deliveries. It reads server-owned operational receipts and invokes the existing idempotent chart/legacy writer with the frozen request and verified inputs. No live session, launch reconstruction, new presentation, client answer, or provider call is used. This can repair both WordRadar and native receipts after a chart commit followed by a failed legacy write. It does not restore an answer that never reached receipt publication, and it does not recover activity completion or unreceipted limitation events.

Red restart tests showed the missing receipt recovery entry point; red HTTP/component tests showed the missing parent control. Core tests reopen the database after an injected legacy failure, recover the saved delivery, and retain one answer and one explicit skip measurement. Seven server tests and six parent component tests passed with the full isolated build. Recovery reprocesses existing receipts safely; it does not label all receipts as failed or delete their history. The parent action requires acknowledgment and reports errors visibly. Original native WebSocket retry itself still depends on a live launch; the new recovery route handles saved native deliveries separately.

Fix versus delete: extend the existing parent API and report with one recovery operation; reuse original delivery validation and scoring without a new write authority. No child UI or host changes.

## Monday scope frozen (2026-10-04)

The human reduced acceptance to original-screen answer capture/activity fixes, parent test date, report/school marks, and known session bugs. Remaining engagement and all timing work are deferred. Install a separate practice-only test version before the human plays; fix only reported issues with focused tests, then request one final review pass. No heartbeat or review loop. This supersedes the earlier installation/review order and full-week automation requirement.

Native capture check found Spell Check dropped memory-round text before sending it, and Wordle lacked a presentation boundary. Red source/function/bridge tests reproduced both. Spell Check now records raw memory input before clearing it; both instruments announce actual opening. Shared completion reports unavailable word responses for targets without a captured typed attempt (Wheel/letter-selection remains a limitation, never a guessed word answer). Existing server provenance and scoring remain the authority. Focused native/server/empty-session/XP/companion checks and full build passed. Added capture only; no child screen/layout changes. The earlier lab checked Letter Rush and Word Radar, so it missed these other instrument boundaries.

Practice installer: explicit fresh-directory-only setup for `practice`, six synthetic sample words, zero answers, labeled fixture priors, and a synthetic soul/profile. It cannot overwrite an existing child configuration or chart directory. The original runtime will use live providers only when the parent plays; the setup makes no provider calls. Focused setup test and full build passed, followed by one original-screen browser journey through answers, replay, parent repair, date setting, forecast recovery and school report. This proves recorded-provider wiring, not live provider quality. Final review is deferred until the parent's session and reported fixes, as requested.

### Saori practice installation

Installed code `286b4e5862cd4951e24d016b958bfde1244559a4` at `/Users/jtaylor/.sunny/monday-practice-286b4e58/app`; independent server on port 3012, Desktop `Sunny Practice - Monday.command`. Root and web dependencies installed from locks; remote full build passed. Node 20.20.2; explicit Planner model `claude-opus-5-5`. Runtime writes restricted by macOS sandbox to the practice installation and temporary files, additionally denying family context/chart paths. The initial overly broad sandbox rule also blocked compilation of the Ila/Reina session source modules; narrowed it to data paths and rebuilt successfully, without changing app code or relaxing protection of family data.

Read-only health identifies the installed SHA; chart status lists only `practice`; original child-experience packet and parent snapshot respond successfully. No child session opened during installation. Practice chart has one assignment, tags, six labeled fixture priors and zero responses. Parent report direct URL is `http://localhost:3012/parent/spelling?child=practice`. The family launcher remains unchanged. Before/after inventory: 833 files, SHA256 `613fba9dbda389d46ec926775b71e19c231384b56395821eeee68694c7c892fa`, identical. Installation receipt, logs and startup helper are in the separate installation directory. No heartbeat, PR review request or review loop started. Next action belongs to the parent's full session; fix only their findings with focused tests, then one final review pass.

### PR 11 final-review blocker: board-to-voice handoff

The reviewer found a cross-activity session bug: a retained board spelling launch caused a later voice game to throw before its legacy answer write and companion note. The mismatch was logged, but the missing downstream save/feedback was not asserted. Earlier lab journeys stayed within board-launched activities and missed this handoff.

Fix: the host sends a close event with the exact node and launch token; the session releases only that matching launch and active assistance context. Historical response context remains available for delivery recovery. A mismatched launch skips chart attribution while retaining the legacy answer write and Elli's factual note. Selection/chunk limitations never enter word scoring, but still supply factual companion context even without a board launch. Removed the two mismatch throws and the limitation path's feedback suppression. Added lifecycle cleanup and regression tests to cover the newly observed boundary; no activity UI or learning contract change.

Red tests reproduced missing legacy writes/notes and retained launch state before implementation. Focused server/HTTP/chart checks and host close checks passed, followed by the full server/web build. Prior commit c6fcd3b CI failed in the browser suite with WebGL-context errors and avatar readiness timeouts; this separate runner issue is not repaired or represented as passing here. Saori's practice installation and the girls' launcher were not changed by this fix. No additional review round or polling loop.

Post-fix isolated original-screen portrait browser journey also passed (768×1024, chart enabled, existing assignment): Discovery, reload, practice, checkpoint, replay, parent forecast recovery, date and school report. This is recorded-provider acceptance; the specific board-to-voice handoff is covered by the focused regression tests, not a live Saori session.

### Practice update and CI software WebGL (Oct 4)

At the parent's explicit request, updated only the existing Saori practice installation to `4e6e4fbf949c87fde5dd4827b02e1267bbdb5e8e`. Stopped the verified port-3012 process, backed up practice data, replaced the seven changed tracked files, built server/web remotely, and restarted through the existing practice sandbox/launcher. Health reports the requested SHA and parent report HTTP is 200. All 833 inventoried family files retain SHA256 `613fba9dbda389d46ec926775b71e19c231384b56395821eeee68694c7c892fa`. Girls' launcher untouched; practice launcher name/port unchanged. Backup and before/after inventories remain in the practice installation. No child session or provider call initiated during verification.

CI had seven browser failures: the headless runner could not create WebGL contexts, and companion readiness therefore failed. Local graphics availability hid that environment difference. Changed only test Chromium launch arguments to add `--use-angle=swiftshader` and `--enable-unsafe-swiftshader`. No application code or assertion removed: zero-error and companion-ready checks remain intact. Existing failed CI is the red evidence; the full browser acceptance suite is the regression check.

Validation limitation: with those exact flags, the local full suite has 5 passes and 3 adaptive failures waiting 12 seconds for the initial "Hear the word" button (line 209). A single isolated portrait adaptive rerun reproduced the same timeout. The adaptive cases stop before their companion-ready assertions, so this is not proof those checks pass. No timeout, assertion, or app behavior was changed. This remains an unresolved browser acceptance blocker beyond the requested flag-only edit.

### Adaptive browser startup timeout diagnosis

The parent requested resolving the remaining failures before practice. Failure diagnostics showed the initial Discovery controls rendered and no page errors. A diagnostic rerun completed the adaptive portrait journey unchanged, with startup at 9.7 seconds. Software rendering uses CPU and the cold Vite/VRM start is slower than the prior GPU-backed lab. The next full run measured adaptive startup at 15.6s (1365×768), 14.9s (1280×720), and 13.8s (768×1024): all exceed the old 12s interaction timeout.

Changed only the initial "Hear the word" wait to a bounded 45s startup budget. Later controls retain 12s; companion-ready and zero-page-error assertions remain unchanged, as do all evidence checks. No runtime code, child UI, learning behavior, or Saori update is required for this test-harness correction. Earlier passing GPU runs masked this environment dependency; retained timing/diagnostic artifacts now distinguish it from a missing control. No live-provider latency claim is made.

Green verification: all eight tests in the full spelling browser suite passed (seven actual journeys across both landscape sizes and portrait, including all three adaptive cases and existing-assignment preparation), with software WebGL and unchanged readiness/error/evidence assertions. Full root/server/web build passed. Diagnostic-only instrumentation was removed. Existing synthetic post-session soul-file warnings remain a disclosed fixture limitation, not a new runtime fix or proof of the post-session provider chain.
