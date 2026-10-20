# Continue prepared practice after the final check

Human acceptance feedback for tested code `65e74ad`: Ila was very happy with Elli and reported an overall good experience; sometimes Elli talks too much. She completed Spell Check Build and Radar Final Check. Earlier observations of repetitive help concern one interaction, not the overall experience. Parent reports two End Session screens and a restart glitch. Nothing here claims a measured learning gain.

## Confirmed defect and earliest wrong decision

The selected route was Radar then Stampede. At 15:59:18 EDT, completing Radar Final Check closed that board's evidence batch (`baseline_evaluating`). The shared launch/projection code treated a closed assessment batch as a reason to withhold prepared, unplayed activities, including Wheel on the alternate route. The parent confirmed Wheel locked only after the final check. Wheel's canonical state stayed ready, with no artifact failure. The later progression Planner response hit max_tokens and changed the cycle to blocked; the server then reported Wheel available, so a stale client projection may have prolonged the observed lock. That client-state hypothesis was not independently verified.

The earliest wrong product decision is equating closed assessment evidence with unavailable practice. The new continuation behavior keeps prepared current-board spelling activities playable while treating later responses as optional practice, preserving the closed assessment and saved predictions. Immutable board definitions, unavailable-activity checks, math and probe behavior stay intact.

## Code and verification

Commit `5f7f838` shares a continuation predicate across launch permission, evidence capture/purpose and completion handling. Continued play cannot move the closed lifecycle, promote a response to checkpoint evidence, or queue a new completion-triggered Planner decision. A Planner-blocked cycle that followed closed assessment uses the same practice-only semantics. No tutor wording or praise scripts were added. Contract 43 records the learning-record distinction.

A regression reproduced the refused launch after a selected route and final check completed. It now checks extra activity launch and display, partial and completed practice, preserved lifecycle/predictions/prior observations, and practice classification in both evaluating and Planner-blocked cases. Existing spelling replay, native binding, capture-route and prediction checks pass. Focused verification: 156 tests across seven files passed; adding the packet-purpose regression brought the relevant total to 157, with 42 packet/repository tests passing afterward. Backend/frontend build passed the changed production code. No full local suite repeated under the approved focused workflow.

No real-child records were changed by implementation or verification. No paid ingestion was run. The live human session was not silently upgraded. No merge authorization. Opus found no hard logic blocker and requested capture-path and no-extra-provider checks; both are now covered by passing real HTTP regressions. The marker rewrite is idempotent, and Planner, forecast and final-check ticket triggers share the continuation guard. Final build passed. A short human regression at the final revision remains required.

## Separate follow-ups

- The two confirmed automatic session endings were at 15:32:23 and 15:47:39 EDT, each after 15 minutes wall time. `session-bootstrap.ts` calls session.end from the configured maximum-duration timer. The 15:59:24 disconnect/reconnect has no matching timeout log, so its trigger is unresolved.
- Progression failed with `planner_decision_invalid:planner_response_max_tokens` after the final check. Another background request reported `chart_forecast_recall_required`. No provider retry was initiated for this fix. These failures require separate packet-size/provenance investigation; human enjoyment does not establish valid academic calibration.
- Earlier native initial audio failure, speech pacing not demonstrated by a rate tool, and occasional verbosity remain recorded observations. No latency or timing-limit patch is included.

Reviewers should challenge whether prepared practice stays playable after assessment, whether prior facts stay immutable, and whether later practice can enter the closed checkpoint or trigger paid planning. This implements the human's more-freedom principle while keeping learning records truthful.
