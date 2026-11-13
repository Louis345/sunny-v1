# Ila's portfolio: plan (draft for owner, 2026-11-13)

**Goal:** a tutor's memory. All of her school work, plus teacher, IEP and tutor notes, goes into her private
record on Saori. Before each board, the Planner pulls as much of it as it decides it needs, with its own tool
calls. There is no fixed workflow.

**Not this weekend:** new games, apart from chess, which is a separate Fable task.

## What already works (checked in code)

- **The Planner already looks things up like a tutor.** `query_record` runs any read-only search over her
  whole record, 100 rows at most, so it never floods its context. `read_past_weeks` searches every earlier
  week by word, pattern ("-ant") or text, including its own past decisions and self-reviews.
- **School grades already link to predictions.** Grades are recorded as `school_test.recorded`, predictions
  are locked, and the two are scored against each other (Ila's 8/8 went in this way).
- **The living profile already holds dated facts.** `child.fact_learned` is the place for "struggles with
  vowel teams" from a teacher, with the date and the source.

## What's missing

1. **Old work can't get in.** The grade upload only matches a week Sunny itself ran. A spelling test from
   September, before Sunny, has nowhere to go. This is the main blocker.
2. **No classifier.** Today each upload needs you to name the subject. Dropping in a folder needs something
   that sorts it.
3. **No home for long documents.** The IEP, teacher conference notes and Zoom tutor notes have nowhere to be
   stored or searched.
4. **Old words never come back.** The board Planner can only put this week's words on a board. The
   spaced-repetition scheduler (SM2, "words due") exists, but only older parts of Sunny use it. So "does it
   stick" is neither practiced nor measured.

## Plan: small steps, each tested, one at a time

| # | Step | What you get | Cost |
|---|------|--------------|------|
| 1 | **Past-work record.** A new record type for school work from before Sunny or outside it: date, subject, items, her answers, score, and the original file kept. Never counted as Sunny practice. | Before and after: her school scores before Sunny vs since | Code only |
| 2 | **Classifier (Haiku).** You drop a folder in. Haiku reads each page and says what it is (spelling test, math homework, teacher note…), the date, the words or problems, and the marks. **You review a table before anything is saved.** | Dozens of papers in one sitting | About a cent a page. A new math model call: needs your yes |
| 3 | **Documents + search.** The IEP, conference notes and tutor notes are stored whole. A helper agent reads each one once and turns it into short dated facts with page references. The Planner gets a `search_documents` tool. | The Planner knows her goals and accommodations, and what the tutor saw | A few cents per document |
| 4 | **Old words on the board.** The Planner may add 2–3 words from 1, 2 or 4 weeks ago, with no help, marked as retention checks. | The answer to "does it stick", per word | Code only |
| 5 | **Before/after page.** Her school spelling scores over time, with the date she started Sunny marked. | The "did Sunny cause it" chart | Later |

**Order:** 1 → 2 → 4 → 3 → 5. Steps 1 and 2 are for the weekend scan session. Step 4 is small and answers
retention. Step 3 is the biggest and most sensitive, so it goes after the IEP meeting date is known.

## Rules this keeps

- Her data stays in her own database on Saori, never in GitHub. IEP and tutor notes are the most private
  data Sunny will hold.
- Past work is history, not new evidence. It can inform the Planner, but never counts as a Sunny try or a
  fresh check.
- Nothing is saved from a scan until you've seen the table. The original file is always kept.
- The Planner decides what to look up. Code only makes sure lookups are small, scoped to one child, and
  read-only.

## What I need from you

1. What is her old work in? Photos, PDFs, a scanned folder? Roughly how many pages?
2. Are the Zoom tutor sessions recordings, transcripts or written notes?
3. When are the IEP meeting and teacher conference?
4. Yes or no on step 2's Haiku classifier (a new paid model call that also reads math).
