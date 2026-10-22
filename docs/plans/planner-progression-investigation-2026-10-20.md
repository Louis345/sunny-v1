# Investigation notes for the Sunny progression plan

Read-only findings at source revision `31face36968b90138acdbd965c3801dcc541a811`. These are engineering evidence for discussion, not additional Planner instructions or an approved implementation design.

## What happened

Ila's assignment `hw-spelling-5cce17a5` has all seven activity nodes completed. At inspection, it had 12 preregistered predictions, 92 observations, zero saved prediction evaluations, and a blocked next-step decision. The observations contain different assistance and measurement conditions; their count is not a learning score.

Two preserved received Planner responses have `stop_reason: max_tokens`, each using 6,000 output tokens. The cycle records `planner_decision_invalid:planner_response_max_tokens`. No raw family conversation or provider request is reproduced here.

The request in `src/engine/learningCycleRuntime.ts` already asks the Planner to compare predictions with evidence and author its next program. It uses `getChildChart`, offers existing progression actions, and currently has a 6,000-token response budget. The failure handler marks the cycle blocked. `successorResumeAction` in `src/engine/learningBoardInstances.ts` does not resume blocked cycles. `resumeSuccessorBoards` in `src/server/routes.ts` calls those existing paths at startup.

The provider cache in `runMathProviderStage` preserves received responses and refuses silently changed requests for the same stage. Recovery must account for that; deleting the failed receipt or making every restart purchase a new answer would hide or repeat the failure. The exact focused remedy is still to be discussed and reviewed.

## A comparison gap to investigate

One stored prediction was registered October 18 with a one-day window. Its matching checkpoint was observed October 20 and marked assisted. The evaluator excludes responses outside the registered window and applies assistance/source conditions. Audit the remaining predictions before attributing all missing evaluations to the same cause. Preserve the original prediction and results; no historical evidence was changed during this investigation.

## Review focus

Challenge the smallest change that lets the existing Planner finish its next decision and carries that decision into the next session. Examine whether it receives a useful account of the prior experience and why comparisons are missing. Keep learning from the child with the Planner; keep reliable delivery and record preservation with runtime. Avoid turning this into a broad provider, board, or learning-schema refactor.

No new tests, runtime changes, paid retries, or family-data edits have been made for this plan. The isolated worktree is `/Users/jtaylor/Development/sunny-planner-progression-plan`; the branch is `codex/planner-progression-plan`.
