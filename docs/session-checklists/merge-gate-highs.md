# High bugs before PR #59 merges (owner deal, 2026-11-17)

The owner holds Claude to these bugs; Claude holds the owner to "no new features" (they go to BUGS.md's parked list).
A bug leaves this sheet and BUGS.md only when **both** proofs pass: the lab test (fails without the fix) and the Saori check from a real session.

| # | Bug | Lab proof (fails without the fix) | Saori proof (after a real session) | Status |
|---|---|---|---|---|
| S11 | A repeated answer is logged as a new first try, inflating "on her own" | A game answers the same problem twice: only the first answer counts as on her own | Her saved record: a problem answered again in a replay is tagged retry, not first try | lab proof passes; Saori check waits for her next replay |
| S15 | Ila's spelling test date vanished overnight | Saving or restoring a lane keeps the test date | After her next session ends, homework/current.json still shows spelling 11/19 and math 11/23 | lab proof passes; Saori check after her next session |
| S3 | One dropped request blocks the next board; a failed Quest or Boss is skipped, not retried | A request that fails once is retried, and the board still builds | Log: no board left unbuilt after a single failed request | dropped request: lab proof passes (owner chose one automatic retry, 2026-11-17; contract updated). Quest/Boss rebuild half: not chosen, stays manual (`retryCutOffStop`) |
| E1 | A grown-up's voice or coaching during a check is saved as "on her own" | Help heard during a check marks that answer as helped | Ila's next check: answers given while someone spoke to her are not "on her own" | owner decision 2026-11-17: house rule, no coaching during check words; if it happens, tell Claude and those answers are marked helped (owner OK, backup first). Speaker-labelled speech and an AI transcript check are parked until after the merge. Leaves the merge list |

Remaining merge gate (BUGS.md): every Medium and Low is fixed or parked by the owner; the daily checklist is graded; graded school tests are back (spelling 11/19, math 11/23); sessions stable on Saori.
