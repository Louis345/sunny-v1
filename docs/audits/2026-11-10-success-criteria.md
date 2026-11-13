# How we'll know the fixes worked (written before building, 2026-11-10)

These are fixed **before** any code changes. After Ila's and Reina's next sessions, each line is marked PASS or FAIL from the logs, by a script, not by opinion. If a number can't be read from the logs, that line fails too: the goal includes Sunny being able to prove it.

## The rules

- **Before** is today's value, from the logs named.
- **After** is read from each girl's **first full session on the new build**. Lines marked *week* need several sessions and are judged after 5 school days.
- A line **passes** only if it meets the target exactly as written.
- **Overall success:** every **must-never** line passes, and at least 80% of the rest pass. A must-never line failing is a fail, whatever else passes.
- Ila's and Reina's learning results (right on her own) are **tracked, not graded**. One session can't prove learning; they're watched for the trend.

## Must-never lines (any failure = the batch failed)

| # | What | Before | After must be | Read from |
|---|---|---|---|---|
| N1 | Answers lost: given in a game but not saved | Reina 11/10: **37 given, 0 saved** | given = saved, for both girls | game traces vs saved answers (the scorecard compares them) |
| N2 | A child reports a bug that was already in the log | **1** (Reina, 11/10) | **0** | product issues vs earlier failure lines |
| N3 | The companion promises something Sunny can't back up ("it will count") | **1** (Matilda) | **0** | transcript plus failure lines |
| N4 | Kiosk opens with a broken board and nobody told | Reina, 3 boards broken, kiosk said ready | start check runs; on failure, a message to the parent before her name appears | kiosk log line `[startup-check]` |

## Graded lines

**Goal 1: Sunny catches itself**

| # | What | Before | Target | Read from |
|---|---|---|---|---|
| G1 | Time from a failure line to the parent being told | never | under 1 min | failure line vs parent-alert line |
| G2 | Bug tickets created from one sentence | 10 | 1 | product issues per utterance |
| G3 | Server logs kept across restarts | 1 run | 7 days of dated logs | log folder |
| G4 | Files that disagree on the test date | 2 (11/12 vs 11/13) | 0 | chart vs homework vs Planner question |

**Goal 2: honest numbers**

| # | What | Before | Target | Read from |
|---|---|---|---|---|
| G5 | Math answers shown "right" in the retro and scorecard vs the saved score | 0 of 49 shown, while 8 of 12 were really right on 11/9 | equal to the saved score | retro and scorecard vs saved answers |
| G6 | Reina's answers marked "on her own" when Matilda helped on that problem | 47 of 47 default | 0 helped answers marked "on her own" | help requests per problem vs saved help |
| G7 | Built games recording "0 ms" | 15 | 0; real time and time to first answer recorded | Ila's and Reina's saved game results |
| G8 | Monster Stampede letter-tap fragments saved as misspellings | 23 | 0 | Ila's saved answers |
| G9 | Built games shown with 0 answers in the Planner's played-games list | all | each shows its true count (Lantern Beat Game: 18) | the Planner's question |
| G10 | Retros written for reward-only sessions as lessons | 1 | 0 | handoff files |

**Goal 3: introspection closes the loop**

| # | What | Before | Target | Read from |
|---|---|---|---|---|
| G11 | Board decisions that include their own session's retro | 0 | every decision after a session | Planner question vs handoff time |
| G12 | Planner predictions scored by code | 0 on boards 3 to 8 | every new board's predictions scored (*week*) | prediction evaluations |
| G13 | Games with a keep / fix / retire note the AIs can read | 0 of 82 | every played built game (*week*) | the chart |
| G14 | Size of the Planner's question | 431,000 characters | under 120,000, with the raw record as a lookup tool | the Planner question file |

**Goal 4: Ila at her pace**

| # | What | Before | Target | Read from |
|---|---|---|---|---|
| G15 | Wrong profile facts given to the AIs | 3 (grade 2, no diagnoses, no IEP) | 0, after you confirm the facts | the Planner and builder asks |
| G16 | New built games that report their step | 0 of 16 | every new build | built game HTML |
| G17 | Longest wait to first answer in a new built game | Ila 14.9 min, Reina 12.2 min | under 3 min for each | session timeline |
| G18 | A stuck or silent stretch where the companion offered help (raised a hand or asked) | 0 in 15 stuck minutes | at least one offer in any stretch over 3 min with no answer; her response recorded | companion events |
| G19 | Games where the companion gets the per-turn facts (time on step, answers, help asked) | 5 named games, no math | every game, both subjects | companion context |

**Goal 5: Reina pushed past her limit**

| # | What | Before | Target | Read from |
|---|---|---|---|---|
| G20 | New problems the Planner wrote that she hadn't seen | 0 | 1 or more on her next board | her board |
| G21 | Quest / Boss available after the worksheet is done | gone | on the Planner's menu | the Planner's tools |

**Goal 6: games that teach and pull them back** (*week*)

| # | What | Before | Target | Read from |
|---|---|---|---|---|
| G22 | The builder sees each played game's track record | no | yes, in every build ask | builder ask |
| G23 | A loved game comes back with new content (`build_from` used) | 0 | at least once in the week, and her time to first answer on it is lower than on its first play | boards and timeline |

**Added 2026-11-10, after rating Ila's 16 sessions** (added after the lines above were fixed; it does not change them)

| # | What | Before | Target | Read from |
|---|---|---|---|---|
| G24 | The companion stated a wrong answer for the problem on screen | Ila 11/10: Elli said "type 34" three times; the answer was 17 | 0; a stated value whose problem or answer Sunny cannot tell fails | transcript vs the open problem's answer (item contracts, spelling words) |

Why: N3 only catches promises Sunny can't back up after a failure. A confident wrong answer is worse than none for Ila, and nothing compared Elli's words with the answer Sunny already held.

**Tracked, not graded:** Ila right on her own (11/9: 0 of 13, all with help); Reina right on her own; the girls' own words about the session; how many times you had to step in.

## Not in this batch

- **Other subjects (problem 23):** a bigger change. It goes next, once these numbers are green.
- **Ila's profile facts (G15):** I'll prepare the change; you confirm grade, diagnoses and IEP before it ships, because it's her medical and school record.

## How the rating runs

The first thing built is `npm run sunny:rate -- --child ila|reina`. It reads the session logs and Sunny's records and prints this table with PASS or FAIL for each line. After their sessions you run it, or I do. It also becomes the daily checklist, so you never have to ask "how was it?".
