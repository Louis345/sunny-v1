# One record, and one evaluation mode for every domain

Owner, 2026-11-25: "Everything is in the database, and it's queryable." "We evaluate before we do the intervention.
We compare our results at the end." "It should be universal rules for any domain."

**Status: approved by owner 2026-11-25. Build after the Christmas drop. No code yet.**

## What exists today (seen in code)

- Each child has her own database on Saori: an append-only event log (nothing edited or deleted; corrections are new
  events). The tutor reads it with SQL (`query_record`).
- **Only spelling writes to it.** Math boards, games, the tutor's keep/fix/retire notes, minutes per game and her
  answers in math live in per-homework JSON files, so the tutor's memory of games ends every week.
- Answers are already tagged with what makes them honest: unseen or practiced, with or without help.

## The change

1. **One write path for every domain.** Math, games, boards, the tutor's decisions and notes, minutes and companion
   talk write events to her database with the event types it already has. The JSON files stay as working copies
   until the database is proven, then they become exports.
2. **The game library is a query, not a file.** Every game she played, in any week, with its concept, how she did in
   it, and her unseen no-help results on that concept afterwards. Keep, revise, retire and "move to the reward arcade"
   are dated events with reasons.
3. **One evaluation mode, the same for every domain:**
   - **Before:** a diagnostic the tutor designs from her record (what she gets right without help, and what kind of
     mistake she makes). Unseen problems, no help.
   - **Intervention:** the boards, chosen by the tutor.
   - **After, now:** the Boss, unseen and no help, on the same skills.
   - **After, later:** a check days later, and her paper test. Learning is what is still there after a delay.
   - The tutor writes what it tried and what it expected before; code scores before against after; the tutor writes
     its conclusion. All of it is events.
4. **Garbage in, garbage out:** every event says where it came from (child, game, tutor, parent, scan), whether help
   was shown, and whether she had seen the problem. An event missing those is refused at the door, not cleaned later.

## Success: every row must pass

| # | Check |
|---|---|
| S1 | A math answer, a game played, a board published and a tutor note each appear as events in her database. |
| S2 | The tutor can answer "which games has she played since October, and how did she do on that concept afterwards?" with one query. |
| S3 | A game from a previous week is on this week's menu with its record. |
| S4 | A math homework opens with a diagnostic the tutor designed, and its results are events. |
| S5 | The Boss result is compared with the diagnostic per skill, by code, and the tutor's conclusion is saved beside it. |
| S6 | A delayed check and the paper test are compared with the Boss, so short-term gains are told apart from lasting ones. |
| S7 | Adding a new domain needs content and a diagnostic, and no new storage code. |
| S8 | Nothing she did before the change is lost: past weeks are imported once, marked as imported. |

## Failure: any one means not done

| # | Failure |
|---|---|
| F1 | Any answer is lost or counted twice. |
| F2 | An answer given with help, or on a problem she had seen, counts as unseen and no-help. |
| F3 | A board waits on the database: a write failure must never stop her session (it is logged and retried). |
| F4 | One child's query can see the other child's record. |
| F5 | Code decides what to teach. Code measures; the tutor decides. |

## What the science says (why these choices)

- **Event log:** event sourcing, standard for records that must never be rewritten.
- **Knowledge tracing:** modelling what a child knows from her whole answer history (Corbett and Anderson, 1995; deep
  knowledge tracing, Piech et al., 2015). This is what one queryable record makes possible.
- **Pretest, intervention, posttest:** the basic shape of any honest learning study.
- **Performance is not learning:** a result right after practice overstates what lasts (Bjork). Hence the delayed
  check and the paper test after the Boss.
- **Scaffold fading:** answers with help show what she can do with support, not what she owns. Hence the help tags.
- **Error analysis in math:** the kind of mistake says why (for example rounding by procedure without the meaning), so
  the diagnostic records how she was wrong, not only whether.
- **Too many comparisons find false patterns:** the tutor bets before she plays and code scores the bet, so a pattern
  has to predict, not just appear.
- **Later, with more families:** collaborative filtering, "children with records like hers learned from this approach".
