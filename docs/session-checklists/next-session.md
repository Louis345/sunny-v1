# Check sheet: the girls' next sessions (after the 11/10 batch)

Saori build: `2f31a3ca`. After each session, run `npm run sunny:rate -- --child ila` (or `reina`) on Saori. It marks every line PASS, FAIL or N/A from the logs, with no opinion involved. The criteria were fixed before building: `docs/audits/2026-11-10-success-criteria.md`.

**Verdict rule:** all four must-never lines pass, and at least 80% of the graded lines that apply pass.

## Must never happen

| # | Line | Last time | Must be |
|---|---|---|---|
| N1 | Answers she gave but Sunny didn't save | Reina 11/10: 37 given, **0 saved** | given = saved |
| N2 | She reports a bug that was already in the log | **1** (Reina) | 0 |
| N3 | Her companion promises something Sunny can't back up | **1** ("your answers will count") | 0 |
| N4 | The start check ran before her name appeared | **never** | ran and passed (it already caught Reina's boards today) |

## Graded: is Sunny getting better?

| # | Line | Last time | Target |
|---|---|---|---|
| G1 | Parent told after a failure | never | under 1 min (alert recorded; to your phone once you set `SUNNY_PARENT_ALERT_URL`) |
| G2 | Bug tickets per sentence | 13 for 3 sentences | 1 each |
| G3 | Server log survives a restart | no | dated log for the day |
| G5 | Retro's "right" count equals the saved score | math: "0 right" | equal |
| G6 | Helped math answers saved as "on her own" | 47 of 47 | 0 |
| G7 | Built games saved as "0 ms" | 2 (Ila) | 0 |
| G8 | Letter-tap fragments saved as misspellings | 1 (Ila) | 0 |
| G9 | Played games shown to the Planner with 0 answers | all spelling games | true counts |
| G10 | Lesson retro for a session with no answers | 1 | 0 |
| G11 | Board decisions made with this session's retro | 0 | all |
| G12 | Planner calls checked by code | 0 since 11/8 | every board |
| G13 | Played games with a keep/fix/retire note | 0 | growing over the week |
| G14 | Size of the Planner's question | 431,000 characters | under 120,000 |
| G15 | Ila's diagnoses given to the AIs | 0 (says grade 2, none) | correct, **after you confirm them** |
| G16 | New built games that report their step | 0 of 16 | all |
| G17 | Longest wait to her first answer in a game | Ila 14.9 min | under 3 min |
| G18 | Quiet stretches over 3 min where her companion offered help (hand or words) | 0 of 2 | all |
| G19 | Games where her companion gets the pace facts | 0 | all |
| G20 | New problems written for Reina | 0 | 1+ per board |
| G21 | Quest/Boss after her worksheet is done | gone | on the menu |
| G22 | The builder sees each game's track record | no | yes |
| G23 | A loved game comes back with new content | never | once this week |

## Companion presence: is Elli less annoying? (added 2026-11-16, fix S14)

Ila: "Elli is annoying… she keeps saying the same over and over." After her session, run on Saori `npm run sunny:companion:audit -- --date YYYY-MM-DD --from HH:MM --to HH:MM` (kiosk time, the session's start and end). Targets were set before the fix shipped. The baseline is Ila's spelling session on 11/16, 5:29–5:54 PM, rebuilt from speech chunks (approximate). New sessions log every reply exactly.

| # | Line | Last time (Ila 11/16) | Target |
|---|---|---|---|
| C1 | Times she cut the companion off while it spoke | 8 (3.2 per 10 min) | half: 1.6 per 10 min or less |
| C2 | Typical reply length | 39 words; 10 of 15 over 30 | 20 words or less; at most 1 in 5 over 30 |
| C3 | Replies repeating one of the last three | 4 of 15 | 1 or fewer per session |
| C4 | Time to first sound after she stops (guard: must not get worse) | median 2.7 s, slowest 10% 3.8 s | median 2.7 s or less |
| C5 | Ila's own word, asked after the session: "Was Elli annoying?" | "Annoying… says the same over and over" | not annoying |

**Verdict:** the fix worked if C1–C3 meet their targets in two sessions, C4 does not get worse, and Ila doesn't call Elli annoying.

## Learning (watched, not graded)

| Child | What | Last time |
|---|---|---|
| Ila | Right on her own | 0 of 13 (every answer had help, 11/9) |
| Ila | Time to first answer in a new game | 14.9 min (Spelling Voice Gate) |
| Reina | Right on her own | unknown: 11/10 was lost |
| Both | Times you had to step in | Ila 11/9: sat beside her; Reina 11/10: came downstairs |

## Also new on screen

- Try-on rack: clothes she doesn't own are dark, with a 🔒 and their price. Hers are lit with ✓. Picking a locked one shows "You need N more coins. Finish a board to earn more."
- Her companion may raise a ✋ on its portrait when she's quiet. A tap brings it in.
