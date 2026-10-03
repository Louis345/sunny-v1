# Complete spelling experience: implementation acceptance

Requested scope: the parent starts Sunny’s kiosk and can judge a complete spelling
experience, not a database connection demonstration. Default first release is
spelling, as in the rebuild draft; other departments retain their current path.
`LEARNING_FEEDBACK_LOOP.md` remains the normative learning authority.

## Release boundary

A connected release must include all of these in the actual kiosk path:

1. Parent-confirmed child profile and homework words, source identity, and test date.
2. Pattern tags and per-word predictions committed before any Discovery answer.
3. Every assigned word offered in independent Discovery, with per-response support,
   exposure, raw response, server scoring, exact launch identity and resumability.
4. Factual prediction evaluation, followed by the Planner’s evidence-citing teaching
   decision. Existing verified activity capabilities are reused; presentation remains
   adaptive and distinct from academic scoring.
5. Practice and a fresh hidden recall check, covering initially secure words as well
   as targeted words. Practice cannot become unseen or delayed-retention evidence.
6. An explicit per-word school-test forecast committed before the test, with honest
   uncertainty and incomplete coverage. A successful game is not proof of readiness.
7. Parent-entered per-word returned-test results tied to the original assignment.
8. A parent report showing predicted versus observed performance, forecast errors,
   pattern history, missing evidence and what Sunny proposes next.
9. The next assignment’s Planner packet reads the event-backed chart history.
10. Kiosk restart and duplicate deliveries preserve responses, decisions and boards.

Merely writing a second copy of old cycle/word-bank state into SQLite is not
acceptance. For the activated spelling path, the append-only database is the only
learning authority. Old records stay archived/preserved and supply no learned
conclusions. Files may hold immutable uploads/content and operational provider
checkpoints, but may not be competing writable learning state.

## Implementation approach

- Extend validated spelling event payloads and deterministic chart projections.
  Keep `appendEvent` as the only application event writer; commit related facts
  transactionally with validated citations and stable identities.
- Replace the activated spelling path’s storage access, rather than adding a
  best-effort mirror. Keep existing other-domain behavior behind its current path.
- New decision code enters through `getChildChart`; the spelling projection comes
  from events and a confirmed profile. Legacy scores and generated instructions
  are not silently carried forward as child evidence.
- Reuse existing ingestion parsing, provider checkpointing, native spelling
  instruments and verified board capabilities where their contracts fit. Preserve
  the separation between Planner decisions, Creator presentation and code scoring.
- Wire intake, child responses, decisions, board publication, recall, forecast,
  returned results and report through the real server/kiosk endpoints.
- Update the normative contract before changing learning/storage authority; do not
  treat the archived rebuild draft as an additional competing contract.

## Proof required before calling this ready

- Tests first for the missing complete flow, plus regressions for unsupported
  assistance, provenance mismatch, retrospective predictions, duplicate retries,
  crashes/restart, and stale legacy records attempting to influence the chart.
- Three synthetic spelling weeks through the production endpoints and browser,
  with deterministic recorded provider responses and explicit simulated authority.
  No synthetic event or conclusion is copied into a real child’s chart.
- Demonstrate that changed school-test results change the factual report and the
  next Planner packet. Do not manufacture a claim that forecasts improved.
- Build, relevant unit/integration tests, browser acceptance and independent review.
- Before/after checksums of preserved child context, and a clear deployment/changeover
  plan for Saori. Earlier no-provider-call and no-deployment restrictions remain
  until explicitly lifted; implementation and recorded-provider verification can
  proceed without either.

## What the parent can judge

Immediate: clarity, repetitions, timing, engagement, correct resume behavior,
whether teaching responds to observed difficulty, and whether the report matches
actual answers. Over several school tests: forecast accuracy and retained learning.
A pleasant kiosk session alone cannot establish either of the latter outcomes.

## Current gaps confirmed in code

- `createSpellingDiscoveryCycle` creates an empty academic-predictions collection.
- `learningCycleRepository` still writes canonical JSON cycles and mutable runtime
  progression; child chart readers still include legacy profile/word-bank paths.
- `buildChart` currently projects only profile and assignments.
- `readiness.forecast` and `forecast.evaluated` are registered event names, not a
  connected forecasting/calibration workflow.
- The existing report displays assumptions, returned-work observations and a theory
  decision, but not the new per-word prior/forecast accuracy or multiweek pattern view.

These are implementation gaps, not tasks the parent should have to discover while
trying to test an otherwise advertised completed experience.

## Human-caught gap and release invariant

The parent caught that a connected database did not change the experience because
answers and decisions still followed the old stores. Startup logs correctly said
`learning_events=not_connected`; they proved a connection, not learning-loop
closure. The earlier lab checked its Phase 0/1 and startup scope, so its passing
checks could not establish the expanded product outcome.

Release invariant: never label this experience ready from a database health check.
The actual kiosk journey must produce preregistered predictions, captured answers,
matched evaluations, cited decisions, a forecast, confirmed school results, and a
report read back after restart, and the next Planner packet must use that history.
This full invariant remains to be implemented and verified.

## Implementation checkpoint — not ready for child testing

The first storage slice adds typed spelling creation/transition events, derives
native cycle views by replaying the existing lifecycle rules, and checks expected
revisions in a SQLite transaction. It does not activate the spelling kiosk path.
No new learning behavior is deployed. The new contract amendment defines the
intended activated path; satisfying it remains the release gate.

The slice removes persistence from the creation/transition reducers and leaves it
in the existing JSON wrappers for legacy callers. New event code is justified by
the requested authority replacement; it does not introduce a new math pipeline.
The child chart, ingestion, runtime routes, Planner, report, and parent entry screen
still require integration. Pattern priors, forecast/calibration, and three-week
browser acceptance are not implemented by this checkpoint.

Independent review caught direct no-op revision consumption, conflicting assignment
corrections, duplicate assignment identities, and a corrected-history replay error.
Each was reproduced in a regression before its fix. Review of the storage slice is
not approval of a complete spelling release.

Preservation check uses Path-sorted regular files under the original development
`src/context`, encoded as `(relative path, SHA-256)` pairs with compact JSON. The
1,137-file inventory matches the prior baseline:
`c3eff39f05f2f737f96277a890b469cfb21d54b09940847585f2e4a8d66bf44c`.
No provider calls, real ingestion/generation, merge, or deployment were performed.

Latest verification for this slice: root+web build passed; 75 tests passed across
chartSpellingCycles, chartFoundation, learningCycleRepository, and spellingDiscovery.
Independent recheck found no remaining blocker in this storage slice. This does
not substitute for the full browser journey or authorize activation.
