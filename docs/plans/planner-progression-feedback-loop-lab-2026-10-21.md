# Feedback-loop verification while Ila is at school

This is engineering verification, not a child session or evidence that learning improved. It follows the failed morning handoff described in [the canvas-decoupling report](planner-progression-canvas-decoupling-2026-10-21.md). LEARNING_FEEDBACK_LOOP.md remains the sole normative contract; it is now version 46.

## Human diagnosis confirmation and acceptance status (Opus F1)

Before the canvas edits, Jamal was shown the exact chain: `requireBoardDefinition` rejected the primary response, a paid correction was requested, and a second validation error blocked the whole cycle. Jamal then instructed in this Codex conversation on October 21: **“we need to decouple this so sessions are not blocked so i expect code delettion”**. That was confirmation and implementation authorization for the diagnosed coupling. It was not acceptance of an implemented revision.

After the reviewer found the remaining unused-portal defect, Jamal asked why work had stopped, then clarified: **“Ila is at school now so we need a way to make sure the feedback loop and rejections are fixed”**. This follow-up authorizes the isolated engineering work recorded here. No renewed human acceptance has occurred at `a7db50e8` or the later fixes. Do not treat either AI review or this test report as `/ship` approval.

AGENTS.md now explicitly removes the successor exception that allowed canvas rejection/correction, while keeping initial Discovery/math authoring separate. Contract 45 documented the presentation/execution separation; contract 46 adds an explicit zero-provider replay of complete paid work. None authorizes fabricated learning, automatic paid retries, or merge without the human.

## Opus follow-ups

- **F2**, fixed in `0c46a8aa`: an off-path portal bound to an unknown activity is excluded with `[board] [portal] [not-ready]`; the authored executable routes stay intact. Regression reproduces the former commit-time `learning_cycle_successor_route_node_missing` failure and proves publication continues.
- **F3**, fixed in `f6882851`: missing start/endpoint markers produce per-route diagnostic logs. They neither reject the board nor change activity order. Tests preserve both routes and assert the logs.
- **F1**: this document records actual human authorization and the absence of acceptance. The PR body and review replies must also reflect the final revision. GitHub connector writes were denied and signed-in Chrome required unlocking; pending UI work is not falsely marked complete here.

## The recovery gap and change

The repaired reader alone could not recover a cycle already stored as blocked. The old command only authorized a new purchase for a truncated primary response. It did not apply to a complete received plan rejected for board wiring.

The new explicit `--replay-received` operation reads the original primary checkpoint and receipt. It never calls a model or opens an intermediate evaluating/purchase state. Existing action, evidence, spelling identity, encounter and successor checks run before the cycle's atomic decision commit. The commit links the original block, request hash, receipt hash and operator reason. Repeating a successful replay returns saved state; failed validation or interruption preserves the original block. Ordinary startup still cannot repurchase failed work. Truncated/refused/uncertain work is not eligible.

Independent source review found that the old normal decision path applies catalog/profile writes before final board validation. Operational replay therefore does not execute those separate writes. Valid catalog actions are preserved verbatim as **deferred proposals**, not discarded or represented as applied. The real saved primary contains five such recommendations. Explicit application of those proposals remains separate work; it does not hold the board's instructional program hostage. Normal fresh Planner decisions retain their existing catalog path.

Example operator command, for the later real recovery only:

```sh
npm run sunny:planner:authorize-recovery -- --child ila --homework hw-spelling-5cce17a5 --blocked-decision hw-spelling-5cce17a5:decision:r121 --reason "Human authorizes replay of the preserved complete plan after canvas repair" --replay-received
```

This command was **not** run against Ila. It commits a preparing successor, not a playable board. Actual artifact generation and a verified visible kiosk are still required before inviting her to test. Replaying the decision needs no new Planner purchase or ingestion; building new activity artifacts may use the normal providers and budget.

## What the lab proves

The lab uses temporary synthetic profiles, assignment records and fake providers through production checkpoint/runtime/repository/generator functions. The two real board topologies are anonymized fixtures; raw family conversation and learning records are not committed as test data. Global network fetch fails if accidentally invoked.

Four complete traversals cover primary/correction output × wheel/radar choice:

1. Close a synthetic first chapter and preserve its responses.
2. Receive a Planner response through the real durable receipt boundary; interrupt before commit and retain the historical canvas block.
3. Explicitly replay that complete receipt without another provider call. Preserve receipt bytes, prior observations/predictions/evaluations, previous boards and failure history; record replay provenance.
4. Reload stored state, prepare five mock activities, and publish despite unavailable screenshot diagnostics. Repeated preparation does not rebuild them.
5. Traverse the selected four-activity route. Record eight synthetic word answers as assisted practice, not independent learning evidence. Close the selected route, keeping the unselected alternative optional and the published board unchanged.
6. Reload stored state. The next fake Planner request contains the recorded responses and assistance; it does not start from an empty baseline. Commit one new decision, prepare/publish the next board, retain the old board as history, and avoid duplicate calls/commits on repeated resume.

Separate regressions cover missing presentation, off-canvas coordinates, preservation of each valid viewport, unused invalid portals, missing boundary diagnostics, unresolved educational identities, repeated measurement identity, omitted single-path explanations, and protected citation/word/encounter rules.

Recovery-specific adversarial tests also prove:

- Missing CLI authorization does not change state.
- Truncated/refused receipts cannot become replay or automatic paid retry.
- A replay interrupted before atomic file replacement leaves the original blocked record and receipt bytes intact; normal startup buys nothing.
- Two same-process concurrent explicit replays commit only one decision/successor. This does **not** establish cross-process locking.
- Valid catalog actions plus a later rejected spelling successor do not change profile bytes or the catalog; the block remains exact. Valid replay stores those actions as explicitly deferred proposals without applying them.

## Results and limits

**221 tests passed in 10 affected files**, including the nine new feedback/recovery cases. `npm run build` and `git diff --check` pass. Existing dependency/bundle warnings remain. The full 4,500-plus suite was not run; the pre-commit hook is omitted in favor of these recorded focused checks and build under the approved workflow.

Independent OpenAI-model source review challenged the non-atomic catalog effect. The failing regression reproduced it; replay isolation and explicit proposal preservation resolved it. Final source verdict: **“No remaining source blocker found in this scope.”** This is source review, not fresh Opus approval or human acceptance.

Verification made **zero paid calls** and did not resume Ila's real cycle. Its saved revision remains 208, lifecycle blocked, with the same two published boards. Its SHA-256 after the lab is `274bb5c852754254a3f4cbb9556cb3cc6013a8a465e3337150d1babe3722a010`. Fake providers and mock HTML test the execution contract; they do not establish the quality of a newly generated lesson, speech delivery, model judgment or the child's enjoyment.

Next acceptance should use the reviewed final commit, deliberately replay the existing paid decision, prepare its activities once, verify the dedicated visible kiosk and matching build ID, then have Ila use the board and return after completion. No new initial evaluation or ingestion is required to recover this failed handoff. Human usefulness, live provider behavior, rendering and restart remain to be observed before merge.
