# Child knowledge store (spec, 2026-11-22; first PR after #59)

## Why
Sunny should know each child the way a good tutor does: what she says, what school says, what Sunny measured, all dated, so the Planner plans from everything and a parent can ask anything.

Today that knowledge is scattered and partly lost:
- Long markdown files: `soul.md` and `ila_context.md` (398 KB). This is the lost-in-the-middle problem: important lines sit mid-blob and get little weight.
- Three intake tools that disagree on file types, models and destinations.
- A Planner that never sees her diagnoses, other weeks, outside documents or what she tells her companions. Seen 11/22: zero read calls for Ila, and 0 rows for Reina's math query.

## Rules
1. **One store.** Her chart database (`~/SunnyData/<child>.db`) holds every fact as one dated row with its source. Markdown is never the source of truth; `soul.md` becomes a generated, readable view or is retired.
2. **Every row says who said it:**
   - `child_said`: her words, through a companion. What she said, not necessarily true: e.g. "my sister is two years older" while they are twins.
   - `parent`
   - `school`: report card, IEP, i-Ready, teacher
   - `tutor`
   - `sunny_measured`: answers, scores, forecasts
   Inside knowledge (Sunny) and outside knowledge (school, tutor) are kept apart and both kept.
3. **What a child says gets a tutor's judgment before it counts** (owner, 11/22: "would a tutor believe that?"). When a statement is saved, the extractor reads it against what the record already knows and labels it:
   - `consistent`: fits the record.
   - `new`: nothing to check it against. Kept as "she said", with low weight until repeated or confirmed.
   - `contradicts`: e.g. "my sister is two years older", but they are twins born 2017-11-21. Kept as what she said, with the contradiction named, and never used as fact.
   - `playful`: pretend, a joke or imagination.
   Weight grows only when she says it again in another conversation, or a parent or the school confirms it. The Planner and the learner card see the label, never a contradicted statement as truth. A companion may gently check in conversation ("twins, right?"), never in a way that corrects her harshly. On first run this check also re-reads every existing `child.fact_learned`; Ila's 11/10 "two years older" is the test case.
4. **Separate kinds, separate tables or event types:**
   - life and likes (`child.fact_learned`, already exists)
   - learning needs and accommodations
   - IEP goals with baseline and progress
   - teacher and report-card notes
   - test and measure results (school tests and i-Ready, alongside `school_test.recorded`)
   - documents (`document.ingested`: type, date, author, source hash; the original kept on Saori, never in the repo)
5. **A parent confirms extracted facts before they count.** This is `LEARNING_FEEDBACK_LOOP.md` "Returned graded work". A misread IEP number misleads every later plan.
6. **Push little, pull the rest.**
   - The Planner always gets a short generated learner card: about 15 lines with current accommodations, open IEP goals, top likes and dislikes, recent things she said. It is short so nothing is lost, and always present because the Planner does not fetch on its own.
   - Everything else is reached through one search tool.
   - The same tool answers parent questions: "how is she doing in school" (outside), "how is she doing in Sunny" (inside), "what should we review".
7. **Companions are the listeners.** Casual talk ("how was class today?") keeps feeding `child.fact_learned`. Companions get teaching cues from the learner card, never clinical notes, and never compare the twins.

## Intake (replaces the three)
1. At startup, a watcher reads each child's intake folder.
2. Haiku classifies each file: homework, graded test, report card, IEP or evaluation, i-Ready, tutor notes, conference notes.
3. Homework and graded tests go to the existing homework and grade paths. Everything else is extracted into pending rows.
4. The parent confirms in one screen, and the rows become facts.
5. The original moves to an archive on Saori with its hash. Nothing goes to the repo.

## Done when
- Ila's IEP progress report and both report cards are rows with source and date, and the learner card shows her accommodations.
- In a real next-board request, the Planner cites a school fact and something she said.
- A parent question ("what did her IEP say about reading?") is answered from rows, with the source named.
- The three old intake paths are deleted.
- Tests:
  - an unconfirmed extraction never reaches the Planner
  - a `child_said` fact is never presented as true
  - no clinical text reaches a companion prompt

## Next, on top of this store: the parent study plan (owner 11/22)
Sunny tells the parent what to do and when, the way a spaced-repetition app does: "Today: 15 min on rounding to hundreds. Tomorrow morning: 5-min review before the test. Nothing needed until Thursday." The plan is built from each skill's recent accuracy on her own first tries, the school test date, spacing, and what helped before. The AI decides; code supplies the facts and records each recommendation with its outcome, so the plan itself gets calibrated.

## Next: the Planner's metacognition loop (owner 11/22, first post-merge milestone with this store)
Why: on 11/22 both parents saw in 5 minutes that Ila follows the rounding rule without the concept ("I don't understand the concept", 23:23 UTC; misses like 652→"60" fit "changes the digit she looks at"). The Planner drilled the rule anyway. It never gets her words, never states a belief about her thinking (its predictions are about scores), and never reads its last hypothesis back: the real 11/19 request decided on turn 1 with zero reads.

Before planning each board the Planner must, in order (forced in code, not asked in the prompt):
1. **Grade the last hypothesis.** "I believed _; I predicted _; this happened: right, wrong or unclear." It cannot plan until it answers, citing the evidence ids.
2. **State one belief about her thinking, not her score**, with evidence: her words, help-dependence, the wrong-answer pattern, outside knowledge (a parent's note, the IEP, the teacher).
3. **Design the board as an experiment:** what fails if the belief is right, what this board changes (e.g. meaning first, "19 kids: about 10 or about 20?"), and the success measure, set before she plays.
4. **Follow the evidence:** right → continue; wrong → change the approach (meaning before procedure; revise or retire its own games, not only build new ones); unclear → test differently.
5. **Don't overthink:** one main belief per board; code supplies the facts; obvious evidence means act.

Inputs it needs, from this store: the concept signal (her words, hint-dependence, misconception patterns, kept separate from accuracy), parent and tutor teaching notes ("what worked"), and earlier weeks.
Measured by: the Planner evals (e.g. "board 11 should have targeted the misconception") and calibration against graded tests.

## Not in this PR
Embeddings and vector search. Start with SQL and text search over the rows, and add embeddings only if search misses. Ranked review sessions come after, on top of the same store.
