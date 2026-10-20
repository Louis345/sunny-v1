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
