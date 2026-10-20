# Responses to Opus

The original append helper deduplicates by observationId and does not deep-compare or reject repeated content. The suggested conflict was therefore not present. The rewrite was nevertheless made idempotent by removing any existing post_board_practice marker before adding one.

Two real HTTP completion regressions now cover baseline_evaluating and a post-assessment Planner block. A real recall row is recorded with a launch ID; completion uses captureLaunchId through the live session token, saves successfully, preserves the lifecycle and prediction evaluations, and leaves exactly one row with one post_board_practice marker. Spies verify neither advanceCanonicalCycleFromEvidence nor the forecast callback is called. This exposed that the separate forecast/video-ticket branch also needed the same continuation guard; all three completion-only post-assessment side effects now share the pre-completion predicate. Fresh practice participation still uses the existing currency award; it is not duplicate replay credit.

Runtime Planner errors and successor-preparation failures both call transitionLearningCycle with type=block. That shared transition records fromLifecycle and timestamp; the blocked continuation test uses that real transition. The predicate restricts this history to the currently published board, preserving probe/math behavior.

Read-only projection of the actual human cycle confirms ready Wheel is available and practice-only in both baseline_evaluating and blocked. No real child cycle was reset or edited. The 15-minute session cap and unrelated Planner/forecast failures remain separate concerns.

Focused checks: 157 relevant tests passed before these route regressions; the expanded route file passes all 18 tests (two added, bringing the relevant set to 159). Final backend/frontend build passed. Human regression remains pending. No merge authorization.
