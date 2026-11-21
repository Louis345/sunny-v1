# Sunny: one plan, one goals board (from both audits, 2026-11-10)

Opus 5.5 found 19 problems and Fable 5.2 found 17; 13 overlap. Merged, that is **23 distinct problems**. They fall into six goals. Each goal has one number from the real logs today and a target, and the daily checklist now just reads those numbers.

## The six goals

| Goal | In plain words | Today (from the logs) | Target |
|---|---|---|---|
| **1. Sunny catches itself** | A child never finds a bug first | Reina's answers saved on 11/10: **0 of 37**. Bugs she reported that were already in the log: **1** | 37 of 37; 0 |
| **2. Honest numbers** | Every count the AIs read matches what she did | Math answers shown right: **0 of 49**. Reina's answers falsely "on her own": **47 of 47**. Ila's fragment misspellings: **23** | true counts; 0; 0 |
| **3. Introspection that closes the loop** | Each board is planned from the session that just happened, and the tutor is graded | Decisions holding their own session's retro: **0**. Predictions checked on boards 3 to 8: **0** | every board; every board |
| **4. Ila at her pace** | She's playing within minutes, and someone notices before she checks out | Longest wait to first answer: **14.9 min**. Frustration signals during her 15 stuck minutes: **0**. Wrong profile facts given to the AIs: **3** (grade 2, no diagnoses) | under 2 min; seen; 0 |
| **5. Reina pushed past her limit** | She always has a harder problem she hasn't seen | New problems written for her: **0**. Quest/Boss after the worksheet: **gone** | 1+ per board; available |
| **6. Games that teach and pull them back** | Loved games return with new content; games that walled her don't | Games with a true track record: **0** (all show 0 answers). Games retired: **0 of 82** | all; keep/fix/retire decided by the AIs |

A seventh, slower goal: **any homework subject** goes through the same loop. Today every non-spelling subject is treated as math.

## The 23 problems, by goal (O = Opus, F = Fable)

**1. Sunny catches itself**
1. A failed save loses the session and nobody is told (O1, O2, F1). *Fix:* a startup check of every board's seal plus a test save, and the scorecard compares answers given with answers saved.
2. The companion doesn't know when Sunny is broken: Matilda's "your answers will count this time" (O13). *Fix:* a save failure becomes a fact on the companion's next turn.
3. The server log is wiped on every restart (O10). *Fix:* dated logs, kept 7 days.
4. One sentence became 10 bug tickets (O12). *Fix:* tickets keyed to the final transcript, not partials.
5. Ila's test date disagrees between files, and nothing compares them (O14). *Fix:* one source for the test date.

**2. Honest numbers**
6. Math games read "0 right" in the retro and scorecard (O3, F6). *Fix:* count from the saved score, not the game's flag.
7. Matilda's help is saved as "on her own" (O8, F8). *Fix:* record help per problem, as spelling does.
8. Built games record "0 ms, no frustration" (O5, F13). *Fix:* real time and time to first answer.
9. Monster Stampede saves single wrong taps as misspelled words (O7). *Fix:* one answer per word.
10. Built games show 0 answers in the Planner's list of played games, so `build_from` sees no evidence (F9). *Fix:* match how answers are actually saved.
11. Reina's thinking aloud is thrown away (O11, F12). *Fix:* keep it for the retro.
12. A reward FaceTime call got a lesson retro (O18, F14). *Fix:* the retro is told what kind of session it was.

**3. Introspection that closes the loop**
13. The Planner plans before the retro is written (O4, F5). *Fix:* write the retro first.
14. The Planner stopped making checkable predictions (F11). *Fix:* code scores each board's predictions.
15. The Planner's question is 431,000 characters (O19, F17). *Fix:* summaries up front, raw records as a lookup tool.
16. Lessons about a game go to `BUGS.md`, which only engineers read (F10). *Fix:* a keep/fix/retire note on each game in the chart the AIs read.

**4. Ila at her pace**
17. The AIs are told Ila is grade 2 with no diagnoses (F15). *Fix:* correct profile facts from one place. This is your data, so you confirm the facts.
18. Built games don't report their steps, and the pre-publish check doesn't require it (O6, F2). *Fix:* the check sends a game back once if it doesn't report its steps.
19. Nobody notices a quiet child (O16, F3). *Fix:* see "Your hand-raise idea" below.
20. Frustration is a word list that only works in 5 games, and never in math (F4). *Fix:* plain facts on every turn (time on the step, answers so far, help asked) in every game.

**5. Reina pushed**
21. The Planner can't write new problems, so Quest and Boss disappear (O9, F7). *Fix:* a tool for the Planner to write a new problem, which code scores.

**6. Games that teach and pull them back**
22. The builder is told to invent a new world every time, and isn't told that new mechanics cost Ila minutes or which games she loved (O15, F9, F10). *Fix:* give the builder each played game's track record. `build_from` (added 11/9) then has real evidence.

**7. Other subjects**
23. Every non-spelling subject is treated as math (O17, F16). *Fix:* subject is a fact, not a branch. This one is bigger; it goes last.

## Your hand-raise idea (for problem 19)

You're right that silence isn't always checking out; sometimes it's thinking. So the companion shouldn't blurt. Give it two tools and let it choose:
- **Raise a hand:** a soft, silent signal on screen (a wave or glow, like a Zoom raised hand) meaning "I'm here if you want me". She taps it or ignores it.
- **Ask to speak:** "Can I help?", spoken gently.

The companion gets the facts each turn: minutes on this step, minutes silent, answers so far, help asked. It decides when and which tool to use, and Sunny records whether she accepted. Over time that is per-child calibration: Elli may learn to raise a hand early for Ila, and Matilda may learn to stay quiet longer for Reina. The gesture is a global tool; when to use it is each child's own learned behaviour. No timer in code decides it.

## Does any of this make the games more engaging?

Yes, though indirectly. Neither audit proposed new game designs. Both found that the builder is working blind, and fixing that is what lets content get better:
- **Problem 22 (and 10, 16):** the builder learns which games she loved and finished fast, and which walled her. Loved mechanics come back with new words; failed ones retire.
- **Problem 18:** every game explains itself and tells the companion its step. Ila's 15-minute wall becomes a 1-minute start.
- **Problem 21:** Reina always has a harder problem she hasn't seen. For a challenge-seeker, that is the hook.
- **Problems 8 and 20:** real time and frustration signals show which games pull her in and which push her out.

## Order (one small change at a time, each child-tested)

| Phase | Problems | Why first |
|---|---|---|
| **0, today** | Reseal Reina's 3 boards (so her graded test can be uploaded); 1 (startup check, given-vs-saved) | Nothing else matters if answers can be lost |
| **0, your call** | 17 (Ila's profile facts) | Biggest single lever on Ila's games; it needs you to confirm the facts |
| **1, honest numbers** | 6, 7, 8, 9, 10, 2 | Introspection reasons from these; today several are false |
| **2, close the loop** | 13, 14, 16, 12 | The Planner plans from tonight, is graded, and learns per game |
| **3, each child's pace** | 18, 19, 20, 21 | Ila's wall and Reina's ceiling |
| **4, content memory** | 22, 11, 15 | Better games from real track records |
| **5, housekeeping** | 3, 4, 5 | Fewer false alarms and lost logs |
| **later** | 23 | Other subjects, once the loop is honest |

Each problem becomes one ticket, sized for a Sonnet session: one change and one test. Each is measured by its goal's number in the daily checklist.

## Checklists: from five to one

| Existing | Status | Proposal |
|---|---|---|
| `CHILD_EXPERIENCE_FEEDBACK_CHECKLIST_2026-08-09.md` | Done, historical (Aug/Sep) | Move to `docs/archive/` |
| `docs/EVIDENCE_FIRST_COMPLETION_CHECKLIST.md` | Done, historical | Move to `docs/archive/` |
| `docs/MATH_INGESTION_TEST_READINESS.md` | Historical readiness report | Move to `docs/archive/` |
| `docs/session-checklists/2026-11-10.md` | Today's; mostly superseded by this | Its unmet rows fold into the goals above |
| The two audit pitch tables | New | Merged into the six goals above |

From now on there is **one goals board** (the six-goal table above, kept in `docs/session-checklists/GOALS.md`). Each session day gets a short page that reads the six numbers from the logs and marks each better, same or worse. Nothing else to maintain.

## About the Sonnet judge

The judge's main job was mechanical: open each proof and check it says what the report claims. Sonnet is reliable at that, and no proof failed in either report. The decisive gap (5 of 5 hidden problems found against 3 of 5) is also a plain fact you can check against the answer key. Where a stronger judge might differ is in weighting impact: Fable's "Ila is grade 2, no diagnoses" could deserve more weight than a 3. Your preference for Fable's layout is a real point too: its one-card-per-finding format reads more easily, and future reports should use it.
