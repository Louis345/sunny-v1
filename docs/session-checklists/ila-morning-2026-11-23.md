# Ila morning session, 2026-11-23 (before her school math test)

Saori runs 14e421ec. Board 13 was planned 11:35 UTC (6:35 am) after the API credit was topped up; last night's attempt ran out of credit.
Each row is PASS or FAIL. Evidence comes from the server log, her record, or what you saw. Claude fills in the log rows after the session; you fill in the "you saw" rows.

## Before she plays (Claude, from the record)
| # | Check | How we know | Result |
|---|---|---|---|
| 1 | Board 13 is ready and playable | startup-check passed, board published | see board line below |
| 2 | The Planner graded its old guess ("rounding is secure") as wrong or unclear, citing evidence | read-back in her cycle | **PASS.** Graded "revised", citing 11 evidence ids: 68→60, 529→600, 72→80; 8 answers in 1 minute; the up-check turned 52−3 into 61, 64, 67, 70. Rounding readiness dropped to 0.4–0.5. |
| 3 | The new guess is about how she thinks (e.g. she changes the digit itself / doesn't see "closer hundred"), not game order or mood | hypothesis text | **PASS.** "She does not reliably fix WHICH digit is next door; in hundreds she peeks at the last digit." Rival guess: speed slips. Items that tell them apart: 538, 461, 252. |
| 4 | The board tests meaning, not only the rule: at least one item where the rule and the meaning give different answers, or a real-life "closer to" question | board plan | **FAIL.** Still a procedure ("tap the peek digit"); no "closer to" question. It saw "I don't understand the concept", but teaching notes were "None recorded": Saori's 19-classmates explanation was never entered. |
| 5 | The games' wording avoids confusing words (e.g. "peek" vs "peak"), or the Planner says why it kept them | game text | **FAIL.** Game is "Fuji Peek Tap" on a mountain peak; "peek digit" throughout, no reason given. Also wrote "the test is tomorrow" (it's today). |

## While she plays (you saw)
| # | Check | Result |
|---|---|---|
| 6 | She understood what to do without you explaining | |
| 7 | Elli did not give away answers, muted or not | |
| 8 | Elli talked less, answered what she said, and stopped when told | |
| 9 | Mute fully silenced voices (except a test word she tapped) | |
| 10 | No long wait, freeze or stuck screen | |
| 11 | She stayed engaged (didn't rush through or quit early) | |

## After (Claude, from logs)
| # | Check | How we know | Result |
|---|---|---|---|
| 12 | Her rounding answers on her own vs board 12 | attempts, unassisted | **Mixed.** Hundreds 2/3 on her own (538→500, 461→500 right: the items built to catch a last-digit peek; 252→330 wrong). Tens 0/2 (83→90, 57→50). Board 12 was 2/4. Adding 6+27+4→377. Left the adding game at 12:56; session ended 13:05, 2 of 4 games played. |
| 13 | "I don't understand" or help-dependence was recorded as a concept signal | child_signals / concept signal lines | **Not tested.** She didn't talk to Elli. 9 hinted tries were recorded, which the next Planner run reads as help-dependence. |
| 14 | No adult talk saved as her evidence | child_signals for the session | **PASS.** Saori's teaching (~13:00, "19 classmates is close to 20") was ignored, not saved; no signals saved after 02:23. |
| 15 | Planning eval (Fable, about $4, owner approves first): does the Planner see what Saori saw? | `SunnyEvals/results` | |
| 16 | School test result entered when it's back (scores the locked forecast) | graded upload | |

## Verdict
- **PASS (merge candidate):** rows 2–4 pass, rows 7–10 pass, and nothing broke her session.
- **FAIL:** the read-back still says "secure" from right answers alone, or the board drills only the rule, or a companion gives answers away. We fix that before merge.
- Cosmetic issues alone don't fail it (log them to BUGS.md).
