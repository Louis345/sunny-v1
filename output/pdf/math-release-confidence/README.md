# Math longitudinal release fixtures

These synthetic Grade 3 multiplication documents exercise Sunny's real assignment identity, returned-work, longitudinal planning, and readiness-calibration paths. They contain no Reina or Ila data.

## Why three rounds

1. `LAB-MATH-A` establishes a strong but scoped belief: arrays and direct multiplication are stronger than word-problem interpretation.
2. `LAB-MATH-B` deliberately contradicts overconfidence by exposing missing-factor and equal-sharing errors.
3. `LAB-MATH-C` tests whether Sunny carries that correction forward, preserves what improved, and scopes readiness to externally supported constructs.

Every round has a blank original and a visibly marked returned version. The returned version must be uploaded against the original assignment's `homeworkId`; it is not a new ingestion.

## Required sequence

For each round:

1. Ingest the blank original into an isolated synthetic child root.
2. Record the factual engagement events from `scenario-manifest.json` through the canonical event path.
3. Progress through the permitted baseline/Quest/Boss lifecycle with synthetic artifact bindings.
4. Reingest the same blank original and prove no lifecycle state or hashes changed.
5. Upload the marked return while explicitly selecting the original `homeworkId`.
6. Confirm extraction, compute prediction errors, and allow exactly one Planner theory decision.
7. Before the next round, capture the exact longitudinal context sent to the Planner.

The release report must show `believed -> predicted -> happened -> assessment -> next action` for every relevant assumption and must prove real child roots were unchanged.
