# Sunny Session Audit

sessionDir: /Users/jamaltaylor/Development/sunny/src/fixtures/sessions/reina-b2343c-bad

## Counts
- events: 548
- gameTraces: 438
- chartAttemptEvents: 2
- transcriptWordRadarMentions: 4

## Issues
- [high] off_assignment_target_launched: Activity reading for letter-rush used "farmer", but node node-5-silent-mastery approved 5 other target(s).
- [high] target_purpose_missing: Post-session truth has target evidence but no target purposes, so activity fit cannot be audited.
- [high] stale_current_target: Monster trace carried stale currentWord="among" for itemIndex=1; current target must match the prompted item.
- [high] activity_accuracy_missing_target_truth: An activity reported nonzero accuracy without target-level correct, missed, contaminated, or result evidence.
- [high] summary_target_contradiction: Activity summary lists "among" as both correct and missed; recovered targets must be separated from unresolved misses.
- [high] pronunciation_accuracy_denominator_mismatch: Pronunciation reported 100% after 5/12 target(s); accuracy must use the planned target denominator.
- [high] pronunciation_homophone_marked_miss: Pronunciation marked "No" as a miss for "know" even though pronunciation matching accepts it.
- [high] duplicate_narration_request: Duplicate narration request for word-radar|among||word_radar_mic_click within 750ms; one user action should not create two voices.
- [high] missing_psychologist_adaptation_decision: Normalized activity readings exist, but the session has no psychologist decision or next-plan diff that interprets them.
- [high] companion_false_mastery_claim: Companion claimed perfect/mastery language that contradicted authoritative Word Radar evidence.
