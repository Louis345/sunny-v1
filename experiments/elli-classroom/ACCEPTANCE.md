# Elli's Classroom: acceptance checklist (2026-11-26)

Goal: prove Sunny can teach a concept it has not seen, for either child, and measure that she learned it.
The owner decided (11/26) that **measured learning is the gate** for bringing the Classroom into PR #59: before, teach,
after. Everything else found along the way goes to BUGS.md.

This commit holds the code and this checklist. If any **Build** or **Human** item fails, revert the commit
(`git revert <sha>`), don't patch on top. **Learning** items are results: a lesson that doesn't teach is recorded as a
failed technique, not reverted.

Child data (evidence, lessons, answer logs, clips, baselines, pass lines, parent quotes) stays in gitignored `evidence/`
and `out/` and never goes to GitHub.

## Build (proof: run logs and files in out/)
- [x] 1. One maker (`make-classroom.ts`) for any child and concept. Only `--child`, `--concept`, `--evidence` and `--task` change. No subject words in the code or prompt. Proof: it made Reina division (wrestling, acting, probe) and Ila rounding (her interests).
- [x] 2. Freedom: the tutor draws its own board pieces when the kit can't show the idea. Proof: log `[draw] [piece]` (division equation, colored rounding road).
- [x] 3. The critic is a different model (Sonnet 5.5) and sees screenshots of every question and piece. Proof: it found giveaways itself (glowing jobs, the flag), plus unread word cards.
- [x] 4. Each lesson plays end to end headless: 0 console errors, reward reached, answers recorded.
- [x] 5. The layout check runs on every question screen. Its bubble false alarm is fixed.
- [ ] 6. No giveaway: when a question is asked, its answer is not on screen. Proof: the critic's screenshots, then a human.
- [x] 7. Never teach the test: the after-check avoids every number in that child's probe, lessons and answer history, and Reina's graded quiz numbers never reach Ila.
- [x] 8. Cost logged and at most $3 per build. Actual: $2.04 to $2.11.

## Presence (same room for both girls)
- [x] Faces: the tutor names a feeling per line; Elli's face shows it.
- [x] Lip sync: her mouth follows the real audio level. Proof: mouth up to 0.71 on a voiced line.
- [x] Timing: answers appear only after she finishes asking, with small uneven pauses and quicker reactions.
- [x] Gaze: she looks at the board while explaining, at the child while asking, and now and then glances at the answers.
- [x] Wait time: after 10 s and 25 s with no answer, she leans in with a warm face and no words. Proof: log `[wait] [lean-in]`.
- [x] Idle life: breathing, weight shift, head drift and blinks (sometimes double), with no build-up on bones the animation doesn't drive.
- [x] Word cards are read aloud, one by one, each one glowing as she says it.
- [ ] Owner and Saori rate "feels alive, not robotic" at least 4 out of 5.

## Human
- [ ] 9. Owner and Saori rate each lesson 1–5 on "does it teach the idea" and "would it hold her". Both are at least 4.
- [ ] 10. Built from the child (acting for Reina; Kon the three-tailed fox and her house for Ila), not a reskin.

## Learning: the merge gate (before, teach, after)
| Day | Ila | Reina |
|---|---|---|
| Before (day 1) | Probe: lantern story-check, 11 checks tagged by piece, saved to a file | Probe: `out/reina-probe/v2`, built by the same engine with `--task probe` |
| Teach (day 1) | Kon lesson (`out/ila-rounding-interests/v2`) | Acting lesson (`out/reina-division-acting/v2`) |
| After (day 2 or later) | Re-check `out/ila-recheck` (10 items, code-written, no pictures, no help, quiet) | Re-check `out/reina-recheck` (same rules) |

- [ ] 11. Both girls play Before and Teach. Answer files are saved (automatic at the end; 📋 then 💾 to save again).
- [ ] 12. After-check, at least a day later with no help: each child meets her pass line. The pass lines are fixed before she plays, in `evidence/<child>/pass-line.txt`, and scored by code against `out/<child>-recheck/key.md`.
- [ ] 13. The tutor reads her Before, Teach and After answers and writes what worked, what didn't, and what it would change.
- If an After-check misses: at most one repair lesson built from her own answers, then one new After-check. At most 4 sessions over 3 days.
- 10 items is a small sample. A clear jump counts; a small one is "not proven". The graded school test stays the final word.

## Not in this commit
- Talking to Elli mid-lesson (needs a small local server): its own commit and checklist.
- Matilda for Reina: in Sunny the Classroom loads the chart's companion.
- Orb catcher in the reward picks: the first thing after the merge.
- Anything inside Sunny: it comes into #59 only after the learning gate passes.
