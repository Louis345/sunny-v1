# Independent implementation review and validation

This implements the direction approved in [plan PR #20](https://github.com/Louis345/sunny-v1/pull/20). Jamal subsequently authorized implementation. The reviewer was a fresh-context OpenAI-model subagent, `review_progression_plan`, returning for source-only reviews of this isolated working branch. It did not run tests, use providers, read child records, or post to GitHub. This is an AI assessment, not an account review or human approval.

## Challenges and changes

The first implementation review supported leaving education with the Planner but found four defects:

1. Excluded simulated observations could re-enter through the newly supplied academic history. History now excludes those observations and their dependent predictions, evaluations and decisions. The regression inspects the assembled prompt, including ordinary-looking IDs that cite a simulated source.
2. Old received correction responses were hashed with the former 6,000-token request. The new request allowance must not break their recovery. Legacy primary and correction receipts retain their original identities and budgets; a regression reuses both without a new call.
3. Writing the frozen request directly could leave partial JSON after interruption. It now publishes complete temporary bytes atomically and exclusively. A pre-purchase interruption test returns safely and makes one eventual call.
4. A local transport-setting conflict was detected after the provider layer recorded an in-flight attempt. Validation now precedes that state change, leaving an absent/rejected receipt resumable rather than manufacturing an uncertain provider outcome.

The reviewer also challenged feeding presentation prose forward. Prior-plan context now carries academic targets, mechanics and measurement contracts, without themes, stakes/design prose or duplicated decisions. Presentation history remains the Creator's concern.

The second review found one remaining citation leak: a prediction could cite an ordinary observation ID whose source had been excluded. The stronger regression reproduced it; bounded dependency propagation now removes dependent claims. Final source-review verdict: **“The remaining P1 is resolved… No remaining blocker from my review. Final checks and canonical human acceptance remain required.”**

## Verification

- Original regression: the old request exposed `max_tokens=6000`, and no explicit recovery function existed. Two tests failed before implementation.
- Review regressions: four tests failed for history/presentation leakage, non-atomic publication and a false uncertain provider outcome; they passed after the changes. The ordinary-ID prediction citation case also failed before its fix.
- 133 targeted tests passed across `learningCycleRuntime`, `learningCycleRepository`, `plannerTransport`, `longitudinalLearning`, `learningBoardInstances`, and the existing HTTP/browser `spellingSuccessorResume` test. After the last citation-closure change, all 12 delivery/recovery regressions passed again.
- TypeScript and `npm run build` passed. Existing bundle-size, stale Browserslist and dependency `eval` warnings remain.
- `git diff --check` passed. No full 4,500-plus test suite was run. The full pre-commit hook is omitted in favor of the recorded focused checks and build, as requested for this workflow.

Synthetic tests verify one committed decision/successor, unchanged observations and predictions, preserved old receipt bytes, no automatic purchase on blocked restart, explicit authorization, interruption before purchase and before decision commit, receipt reuse after metadata/model changes, legacy correction reuse, refusal/uncertain-outcome exclusion, and partial artifact reuse. They do not show that a real child's learning improved.

## Limits and human acceptance

No paid provider or real-child recovery was run. Ila's saved assignment, completed board and failed receipts remain untouched. The new recovery command only records explicit authorization; the next normal startup may then buy that one authorized next-plan attempt and prepare its successor through the existing path. It does not re-ingest the assignment.

Recovery covers a truncated **primary next-plan response**. A failed correction or uncertain call stays blocked for separate diagnosis. Concurrent startup calls have a pre-existing in-flight collision risk, recorded in `BUGS.md`; the tests prove sequential restart/idempotency, not concurrent multi-process scheduling. Relevant-construct history is not a new cross-subject memory system or a claim that context size will remain constant over years.

Human acceptance is still pending at the implementation commit: launch the canonical visible kiosk, return after the completed board, inspect the next plan and playable board, close Sunny and return again. Assess coherence and usefulness separately from record preservation and provider counts. Nothing is merged, and AI agreement does not authorize merging.
