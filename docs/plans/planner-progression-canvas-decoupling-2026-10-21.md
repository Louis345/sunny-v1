# Successor canvas decoupling after the failed morning session

PR #22's reviewed revision delivered a complete Planner response, but the live handoff failed. Earlier Opus approval applies to revision `79208a64`, not this change. Human acceptance failed; nothing is authorized for merge.

## Failure and responsibility

The morning primary response completed in 115,729 ms (`stop=tool_use`, 181,795 input / 10,051 output tokens). Its paths named two canonical activities without repeating their portal declarations. `requireBoardDefinition` rejected it. A paid journey correction took another 70,972 ms (14,456 input / 9,889 output tokens); its option paths repeated their shared closing stops. Validation rejected that too and `advanceCanonicalCycleFromEvidence` blocked the cycle. The session log records the first veto at line 377 and the block at line 506. No successor published.

The first implementation fixed response truncation but retained the wrong authority boundary: presentation bookkeeping could veto the entire educational decision. It also retained a second canvas gate before activity preparation and a canvas-proof requirement at publication. The human caught the missing progression. Logs recorded the failures, but the scheduled PR-feedback watcher was not a live-session watcher. Lab fixtures used valid linear boards; source review and passing tests missed the real branching responses.

## Change

The successor path no longer calls the full topology/layout verifier on the Planner response, purchases a journey-correction turn, blocks a cycle on canvas diagnostics, or requires a canvas approval receipt to publish verified successor activities. The redundant full-board verdict at successor publication is removed. Initial Discovery and initial math authoring retain their existing contracts.

A small shared reader connects the existing authoring format mechanically: a path stop naming a canonical activity binds to that activity, a branch's shared root stops resume once from the root, and drawn connections follow that single declared order. Existing finite positions, theme and matching edge presentation stay authored. Missing/unreadable visual fields use logged plain presentation; each valid viewport is preserved independently. No activity, educational order, academic decision or claim is selected by this reader.

Unknown educational references, ambiguous executable identities and reuse of one measurement identity twice in a route remain explicit errors. They cannot be silently dropped or turned into invented learning. Canonical instruments may still be shared on alternative routes. Answer keys, source word IDs, evidence citations, encounter authority, actual artifact verification, immutable published boards and paid receipt preservation remain intact. Citation/content-only repair retains its prior request identity and cannot edit the plan.

The removed production code totals 27 lines; 79 production lines are added, a net increase of 52 lines across five production files. This is **not** a claim of net code reduction. The added reader is required to execute existing paid responses faithfully after deleting their vetoes. No evidence protection is removed to meet a deletion quota.

## Regression and replay evidence

- Three original regressions failed on the morning missing-portal/repeated-path errors before the change. Further review regressions failed for missing visual fields, publication's single-path explanation veto, unresolved-stop deletion, missing activity binding, repeated measurement identities, and replacement of a valid viewport. They pass after the fixes.
- **178 targeted tests pass in eight files**: successor canvas decoupling, learning-cycle runtime, successor boards, spelling successor contract, journey sequence, immutable board instances, progression generator and math closed-loop acceptance. No full 4,500-plus test run was performed.
- `npm run build` and `git diff --check` pass. Existing dependency/bundle warnings remain.
- Both **original full received responses**, not only anonymized fixtures, were replayed read-only locally. Each yields two routes of four activities, from five prescribed instruments. The educational decision and instrument prescriptions remain deeply equal to the original response. Zero provider calls were made; SHA-256 hashes of the real cycle and both receipts are unchanged across replay. The real cycle was not resumed.
- Regression fixtures preserve the real topology, labels and coordinates, replacing child/assignment identifiers and academic rationale/hypotheses with synthetic metadata. No child observations or conversation are committed as test facts.
- Synthetic preparation publishes once despite unavailable screenshot tooling, preserves prior boards/observations/predictions, makes one Planner call with no correction purchase, and reuses completed work on restart. Fake HTML verifies lifecycle mechanics, not live instructional quality.
- Local kiosk-renderer previews at 1280×720 and 768×1024 load the illustrated artwork for both payloads. The primary layout reports two overlaps; the correction reports none. Those remain visible diagnostics for human judgment, not publication vetoes. Preview defaults depict recommended-order state and do not establish actual launch availability; the runtime regression separately verifies prepared spelling activities are selectable.

## Independent challenge and limits

The independent OpenAI-model source reviewer challenged legacy academic-patch receipt identity, the remaining visual schema/publication veto, deletion of unresolved stops, lost canonical bindings, repeated measurement identity, and preservation of each viewport. All were addressed with the relevant regression checks. Its last blocking review found no remaining progression/evidence blocker; its remaining visual-fidelity concern was then fixed and tested. This is not fresh Opus approval or human acceptance.

This follows artist → canvas by removing presentation judgment from progression. The explicit tradeoff is that a poor authored layout remains visible for review. The added mechanical reader does not judge teaching or rewrite evidence. Challenge whether either recorded route changes meaning, whether any presentation-only failure can still veto a successor, and whether any record/paid-receipt guarantee regressed.

The already blocked real cycle is unchanged. This change does not authorize a paid retry, reset data, re-ingest the assignment, recover uncertain outcomes, or claim that a live successor is ready. Activity-generation failures retain their separate attention/recovery behavior. Next steps are fresh Opus review, deliberate recovery from the preserved response without repurchasing that decision, and a human return → playable successor → close → return test at the revised commit. Record the actual tested revision, usefulness, completion and record integrity before requesting merge approval.
