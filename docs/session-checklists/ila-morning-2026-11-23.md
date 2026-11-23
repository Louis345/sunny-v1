# Ila morning session, 2026-11-23 (before her school math test)

Saori runs 7cb90bdd. Board 13 was built by the new Planner (thinking loop) the night before.
Each row is PASS or FAIL. Evidence comes from the server log, her record, or what you saw. Claude fills in the log rows after the session; you fill in the "you saw" rows.

## Before she plays (Claude, from the record)
| # | Check | How we know | Result |
|---|---|---|---|
| 1 | Board 13 is ready and playable | startup-check passed, board published | |
| 2 | The Planner graded its old guess ("rounding is secure") as wrong or unclear, citing evidence | read-back in her cycle | |
| 3 | The new guess is about how she thinks (e.g. she changes the digit itself / doesn't see "closer hundred"), not game order or mood | hypothesis text | |
| 4 | The board tests meaning, not only the rule: at least one item where the rule and the meaning give different answers, or a real-life "closer to" question | board plan | |
| 5 | The games' wording avoids confusing words (e.g. "peek" vs "peak"), or the Planner says why it kept them | game text | |

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
| 12 | Her rounding answers on her own vs board 12 | attempts, unassisted | |
| 13 | "I don't understand" or help-dependence was recorded as a concept signal | child_signals / concept signal lines | |
| 14 | No adult talk saved as her evidence | child_signals for the session | |
| 15 | Planning eval (Fable, about $4, owner approves first): does the Planner see what Saori saw? | `SunnyEvals/results` | |
| 16 | School test result entered when it's back (scores the locked forecast) | graded upload | |

## Verdict
- **PASS (merge candidate):** rows 2–4 pass, rows 7–10 pass, and nothing broke her session.
- **FAIL:** the read-back still says "secure" from right answers alone, or the board drills only the rule, or a companion gives answers away. We fix that before merge.
- Cosmetic issues alone don't fail it (log them to BUGS.md).
