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
