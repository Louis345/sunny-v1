# PR #59 merge audit (2026-11-20, draft for the owner to approve)

The rule used for every line: **keep** it before the merge if it can break her records, her study time, or what Elli
tells her is true. **Park** it until after the merge if it is cosmetic, wardrobe, a design idea, or internal tidying
(owner: "cosmetic bugs found by the kids are fine; never let records or study time break").
Nothing here is decided until the owner marks it.

## The checklists we have

| Checklist | What it is | State |
|---|---|---|
| BUGS.md merge gate | The 4 merge conditions: bugs fixed or parked, daily checklist passes, graded tests back, Saori stable | live: this audit |
| `docs/session-checklists/merge-gate-highs.md` | The 4 Highs from the 11/17 deal | S11, S15, S3 need a Saori proof; E1 left the list |
| `docs/session-checklists/next-session.md` (graded by `npm run sunny:rate`) | Daily session checklist: 4 must-never lines + graded lines, 80% to pass | Ila 11/20: must-never 4/4 pass, graded 12/18 = FAIL (needs 15) |
| `docs/session-checklists/2026-11-10.md` | The 11/10 sheet | stale: replaced by next-session.md |
| `CHILD_EXPERIENCE_FEEDBACK_CHECKLIST_2026-08-09.md` | August sheet | stale |
| `docs/EVIDENCE_FIRST_COMPLETION_CHECKLIST.md` | Earlier evidence sheet | stale |
| `docs/MATH_INGESTION_TEST_READINESS.md` | Math intake readiness | stale |

Proposal: label the four stale sheets "retired, see next-session.md" (no deleting). Fix the daily sheet's own lines:
- G1 "parent told within 1 min": you said "I don't want alerts", so this line can never pass. Retire it.
- G15 "diagnoses given to the AIs": waits on you to confirm Ila's diagnoses. Mark N/A until you confirm.
- G23 "a loved game returns": the grader can't measure it yet. Mark N/A.

With those three changes, today's session would score 12 of 15 = 80%: a pass. The real misses would be G2, G18
(Elli did not offer help in a 3-minute quiet stretch) and G19 (pace facts in 1 of 4 games).

## Built: closes with one real session (no new code)

| # | What | Proof we need on Saori |
|---|---|---|
| S48 | Quest stayed locked behind the fork she already played | Lantern Quest opens without a fork tap |
| S45, S46 | Waiting screen stopped checking; Let's go ignored | next board opens on its own (seen once on 11/20 15:06; need the long-wait case) |
| S34 | FaceTime companion can't see her clothes | a call where she names her dress, and a self-look |
| S11 | A repeated answer counted as a new first try | her next replay is tagged retry |
| S15 | Test date vanished | homework still shows math 11/23 after the session (the 11/20 rating already shows 2026-11-23) |
| S3 | One dropped request blocks the next board | no unbuilt board after a failed request |

## Keep: fix before the merge

| # | What | Why keep |
|---|---|---|
| S42 High | FaceTime cut off right after hello; cause unknown | The call is her earned reward; we can't tell why it ended. Minimum: log what ended each call, and no end in the first 10 s |
| S47 High | Elli made up a cause ("your parent's been told") | What Elli tells her must be true (must-never N3) |
| S40 + S41 | Banner covers the rule sign she needs; portrait covers a game button | She needs the rule to answer: one rule, nothing covers a game piece, with a layout test |
| E11 | The 11/6 graded tests were never entered | Needs your photos; graded tests are a merge condition |

## Park until after the merge

| # | What | Why park |
|---|---|---|
| E8 | Floating-words history per activity, not per mode | Needs an approved plan under the learning loop; coarse, not wrong |
| S39 (permanent plan) | One storage policy for the kiosk | The 11/18 cleanup works; deploy checks disk (15 GB free). Matters for friends' machines, after the merge |
| W5 | Princess can't wear outfits | Needs a new body (content) |
| W7 (rest), S8 (rest) | Other companions' dressable bodies | Content copying, not records |
| W8 | Elli wears another companion's dress in homework | Cosmetic; FaceTime half fixed by S34 |
| W9 | Purple ears + purple dress won't equip | Wardrobe; not yet diagnosed |
| S10 | Mute doesn't stop Elli | Annoying, not records; not yet diagnosed |
| S12 | Japanese pronunciation | Not her homework |
| S37 | One source for each child's companion | Refactor |
| S4 (rest) | Elli conversation habits | Model behaviour, tracked by the C1–C5 lines |
| S5, S6 (rest) | Screen and lesson leftovers | Most parts fixed; the rest cosmetic |
| S7, S9, S43 | Name card, odd numbers, fork card | Never reproduced; reopen when seen with a screenshot |
| S44 | Long wait for the next board | Design idea |
| I2, I5, I6 | Test temp folders, node types, Planner retry cost | Internal; cost waits for calibration |

## Graded tests

- Spelling 11/19: graded paper not yet in Sunny (needs the photo).
- Math 11/23 (Monday): photograph it when it comes back.
- 11/6 tests: E11 above.

## Not found

The "scrapbook": no file, memory or session mentions it. Tell me what it held and I'll find or rebuild it.

## If you approve this

The merge list becomes: 6 Saori proofs from real sessions + 4 fixes (S42, S47, S40/S41, E11 photos) + the graded
tests + one passing daily checklist. Everything else moves to BUGS.md's parked list with your date.
