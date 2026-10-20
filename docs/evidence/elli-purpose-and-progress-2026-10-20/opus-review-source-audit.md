# Source audit of Opus questions

The complete Opus report is preserved separately. Its findings #1 and #2 were explicitly conditional on source it had not seen. Read-only source inspection after review shows:

- `buildCurrentBoardSnapshot` constructs a fresh snapshot object; `updateCurrentBoardSnapshot` replaces it. It does not merge recordedActivityStatus from the previous object. The hypothesized missing-node stale-status mechanism in #1 is not established by the actual source. A direct regression for that transition would still strengthen coverage.
- The only production caller of `buildActivityCompanionContext` is `SessionManager.buildCurrentBoardContextForTurn`. The only production caller of `buildCurrentBoardSnapshotContext` is that activity-context function. The alternate-path concern in #2 was not found.
- The synchronous chart read can throw. Its new turn-time call has no local failure handling; #3 remains a concrete resilience concern, not a demonstrated incident in the human session. No follow-up implementation has been made.
- Main application config diff 68a5345..db75fc0 is empty. The isolated setup commit is absent from the application repository and from remote branches in the isolated clone. Both revisions and the isolated chart are recorded in setup-correction.json.

No board design, readiness, locks, learning eligibility or canvas behavior was changed. Opus agrees with that architectural assessment, but has not approved merge.
