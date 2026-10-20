# Elli: stage purpose and truthful progress

Human authorized focused Elli changes after the October 20 kiosk session at
68a5345aab2c4262ba7a5f18b3f8ee74e68d9b3c. Board progression and latency remain
separate work. No merge is authorized.

## Evidence and diagnosis

Session 82575095-1345-4a81-a555-9839d581106d used the isolated four-word
elli-help-demo chart. It is operational acceptance evidence, not a real child's
mastery record. Raw room conversation remains private.

- Around 16:03–16:05 UTC, Elli repeatedly offered to help with dissatisfied
  without a completed sounding-out demonstration. Actual usefulness and audible
  speed were not established. The assembled homework prompt still contained
  "She never sounds like a teacher" and directed withdrawal on frustration.
  This conflicts with the supported-practice teaching purpose. It is a confirmed
  instruction conflict, not proof of the sole cause of each model response.
- At 16:05:00 UTC, Word Builder reported phase complete but completed:false;
  canonical completion remained ready/transitioned=false. Later Elli described
  the activity as finished. The context projection exposed screen phase without
  its distinct canonical saved status. The earliest missing context belongs to
  the projection, not to a new dialogue rule.
- Word Builder's malformed attempts, fixed reported metrics and struggle-ending
  semantics remain separate board/activity defects. This commit does not repair
  them, unlock portals, invent answers or change learning eligibility.

## Changes and principles

Remove the personality conflict and describe evaluation and practice by purpose.
Describe pronunciation facts instead of repeating several prohibitions. A help
request permits collaborative demonstration; the AI still chooses what to say,
how to explain and whether to ask, pause or adapt. No canned response, help-keyword
branch, fixed hint sequence, new model call or retry is introduced.

Expose canonical node status independently of self-reported screen phase, including
after returning to the map. Refresh it at the next conversational turn so a save
settling after the last screen event does not leave stale progress. Unknown nodes
have no asserted status. Code executes and reports facts; Elli owns pedagogy.
The additional chart lookup is a correctness tradeoff; latency optimization and
measured performance impact are not claimed here.

## Verification and remaining acceptance

Two new regressions failed before implementation: the full assembled prompt
retained the teaching conflict, and live context lacked saved progress. A further
red check reproduced stale status after a late save. Focused green suite: 122
tests across seven files, including the session-manager size budget, hidden assessment protection, practice help
accounting, speech-rate execution/ownership and stale-turn retirement. Existing
pronunciation assertions retain their meaning using the revised factual wording.
No paid provider call or real-child data modification is part of these checks.
The normal commit hook runs build and full backend/web tests. The human explicitly
authorized change-focused verification instead of repeating all 4,511 backend
tests, to shorten the feedback cycle before human acceptance. This commit bypasses
that hook once after the focused suite and build pass; the hook and test suite
remain unchanged. No full-suite pass is claimed for this revision.

The first full backend run passed 4,510 tests and failed only the unchanged
session-manager size budget (2,500 lines, required less than 2,500). Removed
duplicate snapshot-time status initialization; turn-time refresh remains the
single source for conversational status. The size limit and tests are unchanged.
The second hook completed the build and began the full suite; it was stopped on
the human's instruction. Final focused checks pass all 122 tests, including the
unchanged size budget. The full backend/web build also passed after the correction.

Human test: one evaluation opportunity, then supported practice asking for slower
speech, syllables/sounding out and a different explanation after unhelpful help.
Judge actual delivered help rather than offered help, audible clarity rather than
configured rate, and truthful progress rather than fluent reassurance. Verify
assistance records remain tied to the right item. Existing board locks may prevent
a full-board completion pass; do not call that an Elli acceptance success or alter
the board to hide it. Opus should challenge whether the purpose/context changes
suffice, whether conflicting instructions remain, and whether saved status is
fresh at the moment it is used. Final human acceptance remains pending.


## First human result and review handoff

The caregiver reported that Ila completed evaluation and was happy. This is
positive qualitative acceptance of that part of the experience, not full Elli
acceptance or measured learning gain. The application source was db75fc0; the
isolated runtime additionally used local configuration commit a8c9970, registering
elli-help-demo. That setup-only commit is not in the application repository and
must not be pushed or cherry-picked into this PR. The application's
children.config.json diff from the PR base is empty. All acceptance writes used
the isolated elli-help-demo chart, not either child's real chart.

Session 2e4ff995-4d72-48cf-b85e-f99ccb0c5808 began at 17:19:36 UTC. Evaluation
committed and generation queued around 17:26:55. Board 2 published at
17:28:42.574 UTC; generation reported 113,211 ms, six prepared activities and zero
not-ready activities. Several early help responses were interrupted before audio;
other reassurance completed. No confirmed speech-rate change or useful practice
sounding-out demonstration was observed before this handoff. Stale turn 12 retired
to IDLE and handed its queued transcript back to normal handling. Human positivity
must not be presented as proof that all pending voice/help checks passed.

[Opus's completed review](./opus-review.md) agrees this does not violate artist →
canvas. It raises chart-read resilience, status vocabulary, assembled-prompt
coverage and acceptance concerns. [The source audit](./opus-review-source-audit.md)
distinguishes its conditional hypotheses from verified source behavior: snapshots
are replaced rather than merged, and the alternate production context callers
it hypothesized were not found. The synchronous chart-read failure concern remains
open. The saved receipt identifies the real Opus 5.5 API response; it is not a
GitHub approval. Raw room transcripts and internal model reasoning are not published.

Before merge: address agreed review findings, run change-focused regressions,
perform the final human test on the exact revision, review approvals, and obtain
explicit human merge authorization. Do not merge automatically.

Next separate branch/PR: board generation and child-visible locked content. Begin
with the child's achievable teaching journey, the Planner's authored sequence and
actual completion facts. Diagnose why displayed content cannot be finished and
where generation time is spent. Preserve the artist → canvas boundary; do not
silently unlock/reorder nodes or invent learning evidence. Latency optimization
remains a separate branch. No board or latency fix is included here.


## Full PR #18 review at 15bfd2b

[Opus's full-branch review](./opus-pr18-review.md) covers the complete diff from
001312f through 15bfd2b; the receipt pins both revisions. It agrees the change
preserves artist → canvas. It recommends guarding the turn-time chart lookup
before the second human test, and a real state-machine check for the tool-only
foreign-audio case. Those are review findings, not fixes included in this
documentation update. It also raises broad support accounting, Wheel scope,
Matilda's remaining personality conflict, raw status vocabulary and human
acceptance limits. Read each finding's stated certainty; a hypothetical failure
is not a reproduced live incident. The earlier snapshot-merge/alternate-caller
hypotheses are now explicitly withdrawn by the reviewer after seeing the source.

The human authorized focused diagnosis and implementation of context/lifecycle
repairs, then explicitly instructed the latest Elli changes and targeted testing.
A separate confirmation of the detailed purpose/progress diagnosis after it was
posted was not recorded. Do not retroactively claim one. Review recommendations
do not authorize merge. Final human acceptance and explicit merge approval remain
pending. The next board/locked-content target is separate, not part of this PR.


## Review fixes and final-human-test candidate

The human explicitly authorized addressing the PR18 findings, targeted checks and
preparing the final human test. Four narrow commits resolve the verified concerns:

- ca13bb3: a single guarded chart lookup in activity context replaces two reads;
  status/history use the same cycle. Failure logs unavailability, omits saved
  status, marks history unavailable and preserves bound activity facts. The new
  throwing-read and single-read tests failed first, then passed. No persisted
  snapshot status is mutated; production grep confirms no other consumer needs it.
- a8f26ca: the real state machine reproduced a tool-only turn stuck in SPEAKING
  when native audio owned playback. It now releases the completed conversational
  turn, preserves foreign audio, and checks staleness before side effects. Both
  audio-owner cases and starting the next turn pass; native audio is not stopped.
- 2144e45: factual status vocabulary makes prepared/in-progress/saved completion
  distinct. No dialogue template or progression change is introduced.
- e761028: factual Wheel letter-choice and hidden-answer conditions are restored;
  supported teaching follows live assistance conditions. No canned response or
  keyword branch is added. Matilda's separate personality conflict remains deferred.

Clean-clone verification at e761028db4a53a2b1aa331983407228332ba9962:
backend/frontend build passed; 176 tests across 12 affected files passed in 7.98s.
This includes chart-failure survival, one-read context, current practice/evaluation
conditions and assistance, actual turn ownership, speech controls, urgent routing,
assembled prompt and size budget. No provider calls or real-child writes were
part of these checks. The unrelated local prompt edit was preserved and excluded
from the clean verification and commits. No full-suite result is claimed here;
CI/full regression remains a pre-merge gate, not a wait before human testing.

[Opus's re-review](./opus-pr18-followup.md) found no new blocking code defect and
considers the code ready for the final human test conditional on these checks and
the documented deferrals. Those records are present: BUGS.md and the preceding
README sections explicitly record conservative support accounting, Matilda's
conflict, lab invariants, exact diagnosis-confirmation limits and isolated setup.
The re-review did not receive those earlier unchanged documentation sections;
its inability to verify them is not evidence that they are absent.

Explicit non-blocking deferrals: bound-item context without nodeId may lack recent
history; a tool-only CANVAS_PENDING acknowledgement path remains a hypothesis;
conservative support marking is not a count of delivered/useful help; response
length/time to first audio and hidden-assessment behavior need human observation.
There are no other production consumers of recordedActivityStatus besides the
context projection. Do not remove exposure tracking to make help metrics look
better. No Planner, artist, canvas, locks, board generation or latency fix is included.

Final human test: independently attempt an evaluation word with replay/clarification
available; during supported practice ask for slower audio, sounds/syllables and a
different explanation; return to the map and ask what is finished. Judge actual
delivery, audible usefulness, assessment integrity, saved progress and response to
feedback. Watch native audio versus a new turn. Record exact source/config revisions,
help conditions, human feedback and timing. Do not require prescribed praise or
wording. Final human acceptance and explicit merge authorization are still pending.
