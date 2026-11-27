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

---

# Design: database, tool calls, Planner context (owner answers 2026-11-13)

**Owner answers:**
- Her paper work is scanned into a folder on Saori.
- The IEP, teacher notes and emails are all stored in the database, and the Planner must know they exist.
- The classifier is Haiku, on its own API key, as a fixed pipeline: scan → read the page → JSON → sort.
- Tutor sessions are Zoom calls.

## 1. Database (her file: `~/SunnyData/ila.db`)

**What stays as it is.** The `events` table remains the single source of truth:
- Rows are append-only. Code blocks any update or delete, and every row is tied to one child.
- Corrections are new rows (`correction.recorded`), never edits.

**New event types:**

| Event | What it records |
|---|---|
| `document.ingested` | One original file: its kind (school_work, iep, teacher_note, email, tutor_session), date, source, file hash, page count, and the model that read it |
| `school_work.recorded` | One graded paper: subject, date, each item (prompt, her answer, marked right or wrong, teacher mark), score, teacher comments. Cites its document |
| `child.fact_learned` (exists) | A dated fact taken from a document, such as an IEP goal or accommodation, or "reverses b/d" from the tutor. Cites the document and page |

**New search tables.** These can always be rebuilt from the events and files, so they are never the truth:
- `documents(doc_id, kind, date, title, file_path, sha256, pages)`
- `document_text(doc_id, page, chunk, text)` plus an SQLite full-text index for keyword search. Meaning search can come later, still kept on Saori.

**Files.** Originals are saved as `~/SunnyData/ila/files/<hash>.pdf|jpg|m4a`. They are never edited.

**The honesty rule.** Past school work and documents are history and claims. They can inform the Planner, but
never count as a Sunny try or a fresh check. Only `school_test.recorded` and `school_work.recorded` can score
a school forecast.

## 2. The classifier (Haiku, own key `ANTHROPIC_API_KEY_INTAKE`)

This is a pipeline driven by code, not an agent:

1. Scan folder → one job per page.
2. Haiku reads the page image and fills a strict JSON form: kind, date, subject, title, items (with her
   answer and the teacher's mark), score, comments, and a confidence for each field.
3. Code checks the result: the score matches the items, the date is plausible, the words are real, and the
   page isn't already on file.
4. **A review table goes to you** (on your phone). Uncertain fields are highlighted.
5. Only papers you approve are written as events. The original file is always kept.

Haiku transcribes and sorts. It never judges learning or writes predictions.

**Zoom tutor calls.** We need the transcript. If Zoom saved one (a .vtt file, or cloud recording with audio
transcript turned on), it's free and goes straight in. If you only have the video, transcribing it needs a
service, which is a separate decision. Each call becomes a `tutor_session` document, and a reader pass turns
it into dated facts ("worked on -tion, still mixes -sion").

## 3. The Planner's tools (all read-only, one child, frozen at question time)

| Tool | Exists? | What it does |
|---|---|---|
| `query_record` | yes | Any SQL search over her events (school work appears here automatically). 100 rows max |
| `read_past_weeks` | yes | Every Sunny week: words, results, its own decisions and self-reviews |
| `read_record` | yes | This week's full record, a page at a time |
| `list_documents` | new | The index only: kind, date, title, one line each. Filters: kind, date range |
| `search_documents` | new | Keyword search → the best passages, with document and page |
| `read_document` | new | One document, a page at a time |
| `ask_reader` | later | Sends a helper agent to read whole documents and answer one question with page references (the hub-and-spoke pattern) |

## 4. Context management: a tutor's working memory

- **Always in the question (small, a few thousand tokens):**
  - this week's words and her latest results
  - her standing facts, which are always shown because they constrain everything (IEP accommodations and
    goals, diagnoses, what helps her)
  - a one-line index of what's on file, e.g. "On file: 14 school tests (Sep–Nov), 2 IEP documents, 9
    teacher emails, 23 tutor sessions. Use the tools."
- **Everything else is pulled when needed:** index → search → read one page. The Planner decides what and
  how much. That's agentic, not a workflow.
- **Hard limits in code:** 100 rows / 30k characters per answer, 40 tool calls, 10 turns (already in place).
  Lists come back in pages.
- **Pull, then drop:** once the Planner writes down what it learned (a short note in its decision), the raw
  tool results it no longer needs are cleared from the conversation. Its notes stay. So it can read six
  months of history without overflowing.
- **Frozen in time:** every lookup sees the record as of the moment the question was asked, so a decision
  can be replayed exactly later.
- **Cited:** a decision lists the documents and events it relied on. Later we can check which sources led to
  good predictions.

## Order to build (one PR per step, tests first)

1. Past school work: the `school_work.recorded` event and a manual JSON upload (code only).
2. Haiku intake pipeline + review table (needs the new key).
3. Documents + `list_documents` / `search_documents` / `read_document` + the index line in the question.
4. Old words back on the board (retention).
5. Zoom transcripts, once we know which format exists.
