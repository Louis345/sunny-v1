# Ship PR #59: the one list (2026-11-21)

This replaces reading five sheets. It comes from Fable's independent read of BUGS.md, `merge-gate-highs.md`,
`merge-audit-2026-11-20.md`, `next-session.md`, the commits and CI on 9a5430f1.

**Where we are:**
- CI is green on 9a5430f1.
- The branch is 0 commits behind main.
- Saori runs 9a5430f1, so merging changes nothing the kids see; it only decides what main is.

## A. Your decisions (tick each, about 5 minutes)

- [ ] **A1 Park list.** Park every row in the audit's "Park until after the merge" table. They move to BUGS.md "Parked" with today's date.
- [ ] **A2 Graded tests follow the merge.** E11 (the 11/6 photos), spelling 11/19 and math 11/23 calibrate the Planner, not the code. Forecasts are locked on Saori's disk whatever branch runs, and the upload works on main.
- [ ] **A3 S40/S41 (banner over the rule sign, portrait over a button): first PR after the merge.** Fable's view: these are layout, not records. The companion reads the rule aloud.
- [ ] **A4 S42 (FaceTime cut off) follows the merge.** Its cause logging shipped (82c42024), so the next early end names the cause.
- [ ] **A5 Retire the daily-sheet lines that can't pass:**
  - G1 "parent told": you said no alerts.
  - G15 "diagnoses": waits on your confirmation, so N/A.
  - G23 "a loved game returns": not measurable yet, so N/A.
- [ ] **A6 Label the old sheets "retired, see next-session.md".** Nothing gets deleted. The sheets: `2026-11-10.md`, `CHILD_EXPERIENCE_FEEDBACK_CHECKLIST_2026-08-09.md`, `docs/EVIDENCE_FIRST_COMPLETION_CHECKLIST.md`, `docs/MATH_INGESTION_TEST_READINESS.md`.

## B. One real session on 9a5430f1 (Ila's or Reina's next session)

Claude reads the log afterwards and ticks these. Must-never 4/4 and no new High.

- [ ] S48: the Quest opens without tapping the fork.
- [ ] S45/S46: the next board opens on its own, and Let's go works.
- [ ] S47: Elli never says "your parent has been told" and never invents a cause.
- [ ] S3: no unbuilt board after a failed request.
- [ ] S11: a replayed answer is tagged as a retry, if she replays.
- [ ] S15: homework still shows the test dates afterwards (Ila 11/23, Reina 11/30, estimated).
- [ ] Voice: the announcer never talks over the companion, and the voice connection opens once per reply.

## C. Mechanics (Claude)

- [x] PR title says the outcome.
- [x] PR out of draft, so the human-gate check runs.
- [ ] Squash, or keep the history? Your call at /ship.

## D. After the merge (in order)

1. Graded tests: enter each one as it comes back. This is the first calibration row.
2. S40/S41 layout rule.
3. Fable designs the game library and catalog: a content-in API, tiers, value, stale and deprecated flags, and a portable library. Then build the content-in API. This is the cost cut.
4. Pet summon and dismiss by voice, the Den button, and the pet on a top layer.
5. Everything parked in BUGS.md.
