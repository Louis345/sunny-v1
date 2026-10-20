# Review: PR18 follow-up (diff since 65e74ad), prepared spelling practice after the evidence batch closes

## Verdict

**Conditionally ready for a short human regression.** I found no hard blocker in the logic shown. One item needs a 5-minute check, and possibly a one-line fix, before handing it back. Two test gaps should be closed cheaply. Nothing here is human-accepted or merge-authorized.

## What the fix gets right

**Server and render agreement**
- `canonicalJourneyLaunchable` and `projectLearningCycle` now both key on `allowsReadyActivitySelection(cycle)`. That check depends only on the board being a spelling `teaching` or `successor` board, not on lifecycle.
- `notTakenNodeIds` is also suppressed for those boards.
- So the server permit, the rendered `available` state, and the "not taken" decoration no longer disagree in `baseline_evaluating`, `awaiting_calibration`, `complete` or `blocked`.
- The repository test asserts both launchability and the projected state.

**Lifecycle preservation**
- `practiceContinuation` is evaluated on the pre-event `current` cycle.
- It forces `replay = true`, which skips every lifecycle-mutating branch: the authored frontier, the baseline frontier, quest and boss.
- The partial and complete regression confirms that lifecycle, predictions, evaluations and the prior observations prefix are all unchanged.

**Classification**
- Continuation observations are rewritten to `provenance: "practice"`, with `measurement_role:fresh_checkpoint` replaced by `measurement_role:practice`.
- In `evaluateAcademicPredictions`, practice rows can match only the `unassistedSpellingRecall` branch. That branch requires the `measurement_role:fresh_checkpoint` confound.
- `independent_probe` is also overwritten.
- Result: these rows cannot satisfy any prediction, even if a later blocked→retry Planner run re-evaluates over all observations. This is correct.

**Live binding and packet**
- `bindSpellingAssessment` labels new bindings `practice` during continuation.
- The packet presents `assessment: false`, so the client does not run checkpoint-coverage or hidden-item behavior.
- `observationsForCompletion` skips the checkpoint coverage requirement in the same condition.
- These four call sites share one predicate, `isSpellingPracticeContinuation`. That is the right consolidation.

**No extra Planner call**
- The route guard excludes continuation, evaluated on `beforeCycle`.
- In the blocked case, `finalCycle.lifecycle === "blocked"` is not in the trigger list anyway.

**Scope**
- The change is confined to launch, projection, classification and the trigger guard. It adds no board redesign and no scripts.
- The 15-minute timeout and Planner/forecast failures remain out of scope.

## Must-check before human regression

### 1. Is the observation rewrite idempotent?

`appendObservations` in the continuation path does:

```
confounds: [...filter(!measurement_role:*), "measurement_role:practice", "post_board_practice"]
```

It strips `measurement_role:` entries but **not** an existing `post_board_practice`.

The risk is in the capture-launch path (Word Radar and other `captureLaunchId` flows):
- Live recall rows are already appended, and rewritten, during play.
- At completion, `observationsForCompletion` returns those same stored rows.
- Those rows are then rewritten again, yielding a duplicate `post_board_practice`.

If `appendObservations` dedupes by `observationId` and deep-compares content, or throws on a conflict, then completing practice after the batch closed would fail or duplicate rows. This is exactly the flow the human will exercise.

- **Smallest fix:** filter `post_board_practice` as well as `measurement_role:*` before appending, or skip the rewrite when `provenance === "practice"` and the marker is already present.
- **Test to add:** a repository/runtime case that (a) records a live recall row, (b) completes with `captureLaunchId`, and (c) asserts no throw and exactly one row per `observationId` with a single `post_board_practice`.

## Should add (cheap, not blocking)

### 2. Route-level "no Planner call" test

The guard in `routes.ts` is untested. The repository test cannot see the route.

- Add one route test: after the batch closes, complete the Wheel.
- Assert that `advanceCanonicalCycleFromEvidence` is not called, in both the `baseline_evaluating` and the blocked case.

### 3. Blocked-path predicate dependency

The `blocked` arm depends on `block` writing a `decisionHistory` entry with `fromLifecycle` in `BATCH_CLOSED_LIFECYCLES`. Its `createdAt` must also be at or after the board's `publishedAt`.

- Your test covers `planner_response_max_tokens`.
- Confirm that the other block producers on this path record `fromLifecycle` the same way: transport errors and successor-preparation failures from `baseline_generating`.
- If any producer skips `decisionHistory`, those children will show an available node that the server treats as non-continuation. In that case the first completion would run the authored-frontier branch and could re-enter `baseline_evaluating`.

## Notes (product decisions, not defects)

- **Currency award.** A first completion of the practice Wheel still triggers the 25-coin award (`becameCompleted`). This is consistent with "replay doesn't re-award," but it now pays for post-batch practice. Confirm this is intended, or gate the award on the same predicate.
- **Successor published mid-practice.** If a successor board publishes while the child is in the old Wheel, completion throws `learning_board_read_only`. This is pre-existing behavior, but it is now more reachable. During the regression, check that the client shows a graceful message rather than an error.
- **Stale client lock.** The server is now correct, but the reported stale-lock symptom also needs the client to refetch the board after the completion and lifecycle change. Include this in the regression: finish the route and final check, return to the board without a reload, and confirm the Wheel is available.

## Suggested short human regression

1. **Selected route, then final check, then return to board.** The Wheel is available without a reload. Play it partially, then fully. The completion feedback is unchanged, and no second "thinking about next step" appears.
2. **Same flow after a forced Planner block.** The Wheel is still playable, and its completion saves.
3. **Optional check.** Inspect the saved cycle: lifecycle is unchanged, the new rows have `provenance: practice` with a single `post_board_practice` marker, and the prediction evaluations are identical.