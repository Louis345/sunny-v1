# Retired Word Builder tests — 2026-10-20

Jamal explicitly requested removing failing Word Builder tests and merging PR #18 so latency can be addressed separately. This overrides the general no-test-deletion instruction only for obsolete Word Builder expectations; it does not authorize deleting unrelated failures.

CI run 39490749923 on 026feb0 passed 4,509 root tests and failed 14 assertions across six files. Eleven failures depended on Word Builder launching or reaching its former validation/audio flow, two expected it in the Planner catalog, and one pinned the previous learning-contract version 41 rather than the approved version 43.

Removed eleven obsolete Word Builder launch, slot and wire tests, including both canvas/voice cases. Retained legacy canvas-clear cleanup coverage, Spell Check and generic game/audio synchronization coverage, and the catalog/canonical readiness regressions that keep unfinished Word Builder unavailable. Planner tests now assert its absence and continue checking supported spelling activities. The math contract test now pins version 43 and preserves every substantive progressive-publication assertion.

Production code, prompts, learning records, ingestion and runtime behavior are unchanged by this cleanup. No canned responses or new constraints were introduced. The previous human acceptance and explicit exception for the untested post-check revision remain documented in the PR. Reviewers are invited to challenge whether any retired assertion protects an active feature; restoring coverage for active behavior is preferable to restoring the withdrawn activity.

Validation: all 207 tests across the six affected/related files passed, including the complete adaptive math discovery file and canonical activity repository regressions. All 19 catalog tests also passed (226 tests total). Backend/frontend build passed. The earlier full CI result remains a failed historical run; it is not relabeled green. A fresh CI run will accompany the pushed commit.
