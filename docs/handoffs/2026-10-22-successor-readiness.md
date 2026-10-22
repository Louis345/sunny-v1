# Successor readiness: bounded fixes, not family-test readiness

Branch: `codex/successor-readiness`, based on `83d2c5a3` from the running arrival-authority checkout. Work is isolated; the family kiosk was not rebuilt or restarted and child records were not modified. No provider calls were made.

## Human catch and decision chain

The Oct 22 kiosk said “Your next adventure is ready for your next visit” and offered only Finish for now. Its saved board had five blocked activities with null artifact bindings. `publishedAt` existed, so `successorPreparationStatus` returned `successor_published` and an empty activity list. The status component faithfully rendered that misleading input. Publication had finalized a design whose activities had all degraded to Not ready; publication was not proof of playability.

The saved implementation diagnostics expose an earlier mismatch: the existing Creator requests self-contained HTML using GAME_PARAMS and parent state events. The baseline validator additionally required the configuration URL and GameBridge.reportState protocol for reusable shells. All five first candidates failed those two checks. Fixing this mismatch does not establish that the original HTML is otherwise usable.

The lab missed this because it tested the published message independently and commonly injected successful validation. The existing full browser robot covers reused native successors, not these generated implementations. Logs did record failures, but the user-facing ready claim was never compared with actual activity availability.

## Changes and deletion accounting

- `82105659`: explicitly validate canonical generated activities as self-contained; retain refillable-shell checks for existing callers. Syntax, identity, response reporting and full browser checks remain intact.
- `6c1c35e8`: derive operational successor status from verified activity availability, retaining immutable publication and board semantics.
- `87cdeaa9`: share unavailable-capability/reason handling between status, projection and launch. Use the existing terminal `not_ready` status for unavailable published siblings, and preserve published completion in the preparation adapter.

Affected production files: 24 lines added, 7 deleted, net +17. Additions supply an explicit artifact form and truthful availability details; the old duplicate unavailable-capability rule was removed. No roles, Planner calls, pedagogical rules, activity-count minimum, layout veto, provider retry budget or model settings were added or changed.

The successor status timestamp deliberately remains the decision timestamp. Polling still updates displayed status on every response. Keeping the board-refresh timestamp fixed preserves the current chapter; a fresh mount starts with no timestamp and fetches the successor. Do not “fix” that timestamp by introducing a mid-session board swap.

## Verification

- Red/green: self-contained-versus-shell regression; five-unavailable-activity readiness, unverified binding, unavailable capability, retained unavailability reason and mixed published sibling cases.
- Build passed after each code milestone. Existing Vite eval/chunk-size warnings remain.
- Final focused server suites: 114 tests passed in 7 files.
- Web preparation status, adapter and refresh-hook suites: 35 tests passed in 3 files.
- Independent read-only agent review found availability-policy drift and mixed-status consumption in the first revision. Both were corrected and tested. Re-review reported no remaining actionable findings. This was not an Opus review or human approval.
- Existing full kiosk browser robot at `6c1c35e8`: one test passed in 175.254 seconds, exercising recorded-provider Discovery, Teaching, successor preparation, reload, all three reused activities and the next Planner handoff. It bought no real provider calls and wrote only synthetic records. **Not a clean acceptance pass:** its log contains `spelling_stimulus_mismatch` and a missing synthetic `soul.md` post-session error. Those are separately logged in BUGS.md. Automated passing status cannot establish pronunciation or microphone correctness.

## Saved-artifact replay and outstanding blocker

Copied each saved first candidate into a temporary browser-only workspace. No original HTML, receipts or child evidence were edited. After the artifact-form fix all five pass static validation; all five still fail the real two-viewport browser gate:

| Activity | Remaining first failure | Browser replay time |
| --- | --- | --- |
| Explain long i | Reported prompt does not appear on the current screen | 16.545 s |
| Wheel pattern | Wrong item remains reported after transition | 9.855 s |
| Radar read | Reported prompt does not appear on the current screen | 12.264 s |
| Guided spelling | Input and Submit extend below viewport | 0.225 s |
| Radar check | Reported prompt does not appear on the current screen | 10.464 s |

These are implementation/context defects, not evidence that the Planner's educational journey should be discarded. The empty frozen-prompt diagnostic is not, by itself, a checker defect: generated spelling has no separately frozen prompt prose, while the Creator is already instructed to report its actually displayed prompt.

Local replay evidence: `outputs/successor-readiness/saved-replay.json` (ignored operational artifact) and its referenced temporary screenshot directory. Test logs are `/tmp/sunny-successor-final-tests.log`, `/tmp/sunny-successor-web-tests.log`, `/tmp/sunny-successor-final-build.log`, `/tmp/sunny-successor-robot.log` and `/tmp/sunny-successor-replay.log`.

**Do not hand the existing adventure back to Ila as fixed.** Its published instance is preserved, including the failed implementations and their bounded request history. These code changes prevent the false success claim and the wrong shell check; they do not repair frozen failed artifacts. Any further implementation work must use a separately recorded sandbox attempt and preserve original receipts. Real-child recovery or replacement requires an explicit recovery path, not editing published bindings or restarting their spent request budgets.
