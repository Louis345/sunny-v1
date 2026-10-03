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
