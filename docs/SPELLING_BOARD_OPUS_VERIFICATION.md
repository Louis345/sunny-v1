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
