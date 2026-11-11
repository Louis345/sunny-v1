# Teaching record: Sunny remembers each child, week to week

Status: revised after the Fable 5.2 review (2026-11-10 night); awaiting owner approval. Section 13 lists what the review changed.
Owner, 2026-11-10: "A tutor remembers their student week to week. So should the Planner." "It shouldn't be held in its
context… it needs to be able to pull… everything for that test ID… and what it learns about Ila and how she learns."
"The soul file shouldn't be static." "It's a private database, agnostic, written to the child's profile." "Eventually,
other test families."

## 1. Goal

Every AI in Sunny (the Planner, the board builder, the companions) can pull anything Sunny has seen or done with a child,
past or present, with a query, instead of holding it in context or losing it to summaries. Sunny then gets measurably
better at teaching each child: the measure is her school test results and her first tries on her own over weeks.

## 2. Principles

1. **One record per child, append-only, raw.** Nothing is lost to compaction. Summaries are caches that point at the raw
   events they came from, never replacements for them.
2. **Pull, don't hold.** AIs get a one-line index in their question and query tools for the rest. They use what they
   pull, then let it go.
3. **Code owns truth; AI owns conclusions.** Counts, scores, minutes and links are computed by code. The AIs' conclusions
   ("recall-first works for her") are stored as claims, and code keeps scoring them against later evidence.
4. **Agnostic.** No code names a child. Traits are data. Storage sits behind one interface. Every query is scoped to one
   child, and a query for Ila can never return Reina's data.
5. **Private, with the family.** Data lives on the family's machine (Saori) today. Before any other family joins, a
   child's data leaves the code repository: data lives with the family, code lives in GitHub. Each family can export
   and delete its data.
6. **Kids don't read.** None of this shows up on a child's screen as text. It reaches the child through better boards
   and a companion who knows her.

## 3. What exists today (2026-11-10)

| Piece | Where | State |
|---|---|---|
| Per-child event store | `~/SunnyData/<child>.db` (`events` table: append-only, immutable triggers, `cites`, corrections, single-child guard) | Real, but mostly spelling: response.observed 785, item.presented 727, engagement 506, stimulus 263, prediction.prior 76 |
| Learning cycles (one per homework) | `src/context/<child>/homework/cycles/<homeworkId>.json` | Boards, stops, every try as observations (since 11/10), decisions with self-reviews, predictions and their evaluations |
| Planner journal | `homework/planner-journal/<homeworkId>.md` | Per homework |
| Week-to-week lookup | `read_past_weeks` (src/engine/pastWeeks.ts, contract 59) | **Live 11/10.** On Saori Ila has 8 earlier weeks and ~13.5k characters of past self-reviews; **0 graded tests uploaded** |
| Minutes | src/engine/sessionTime.ts | Learning, play, call, waiting and map minutes per session and day |
| School tests | `sunny:homework:upload` → `recordConfirmedReturnedWork` (keyed by homeworkId) | **Broken for spelling** (review): the upload links each word by its text (uploadGradedHomework.ts:372) while the record requires the frozen `spelling.word.<sha>` ID, so every spelling upload fails `returned_spelling_mapping_invalid`; "1 right" is read as 100% (line 361); grading date = upload time |
| Companion memory | companion_care / companion_relationships, `companionInteractionMemory.ts` | Raw events ARE kept (`companion_interactions/<day>.ndjson`); compaction only moves a watermark. Missing: query access, and the Haiku summary carries no citations |
| Child signals | child_signals (stated_preference, theme_affinity, frustration…) | Recorded; the Planner sees the last 20 |
| Profile | soul.md (static narrative) + chart demographics (dated since 11/10) + current facts placed first | soul.md is static |

## 4. The record: what gets stored

The child's event store becomes the one record. Today's JSON files become views rebuilt from it (or stay as caches with
pointers) during migration. Every event has a child ID, a time, an actor, citations, and a payload. New and confirmed
event types:

| Family | Events | Keys that link them |
|---|---|---|
| Week | `assignment.ingested` (exists), `test_schedule.set` (exists, **also stored on the cycle**: today a past week's test date is lost when a new list arrives) | homeworkId |
| Teaching | `board.published`, `stop.played` (open/close times, measured by code), `planner.decided` (decision, self-review, calls), `prediction.scored` | homeworkId, boardId, stopId, decisionId |
| Answers | `item.presented`, `response.observed` (every try: index, first-try flag, assistance, keyboard/IME, incomplete) for spelling **and math** | itemId, sessionId, stopId |
| Time | `session.started/ended`, `segment.timed` (learning / play / call / waiting / map) | sessionId |
| Outcome | `school_test.graded` (score, per-item results where readable, source photo), `teacher_note.recorded` | homeworkId (+ itemId) |
| Companion | `conversation.turn` (speaker = child / companion / parent / unknown, text, companion ID, call or session), `companion.fact_learned` (what she shared: like, dislike, story, school event, with the quote) | sessionId, companionId |
| Profile | `child_fact.stated` (dated; source = parent / child / evaluation document / inferred, plus who said it); a newer fact supersedes an older one, and nothing is erased | factKey |
| Conclusions | `conclusion.claimed` (by the Planner: claim, scope, the evidence query it rests on), `conclusion.scored` (by code: supported / contradicted / unproven, with counts) | conclusionId |

The **foreign keys** the owner asked for: every board, stop, try, minute and conversation hangs off homeworkId and
sessionId, and the school test hangs off the same homeworkId. So a query like "for this test, show the 11 boards, what
each one tried, her first tries over time, her minutes, and the score" is a join, not an AI's recollection.

## 5. Access: query tools (the RAG layer)

One child-scoped interface, `childRecord(childId)`, backs every tool. Tool schemas never grow with history (free-text IDs
validated in code; see successorStrictGrammar.test.ts).

| Tool | For | Returns |
|---|---|---|
| `read_past_weeks` (live) | Planner, builder | Index, one week in full, search by word or pattern, conclusions |
| `read_test_results` | Planner | School tests per week, per item where known, next to that week's teaching |
| `read_about_her` | Planner, builder, companions | Current profile facts (dated, with their history: "space since Oct; unicorns before") |
| `search_conversations` | Companions, Planner | Meaning search over her conversation turns ("anything about friends", "what she said about school this week") |
| `read_conclusions` / `claim_conclusion` | Planner | Its notebook: claims with code scores; a new claim must cite an evidence query |
| `read_session` | Planner, companions | One session in full (answers, minutes, turns) |

Two kinds of search:
- **Exact queries** (SQL over the event store) for numbers and records.
- **Meaning search** for conversation text. Recommended start: local embeddings stored next to the events on Saori, so
  no conversation text leaves the house. Open decision below.

## 6. The loops

1. **Teaching loop (exists, now cross-week):** board → her answers → Planner reviews (with past weeks) → claims a
   conclusion → next board → code scores the claim → … → school test → code scores the week.
2. **Mirror loop (new):** companion conversation draws her out with curiosity, not a script → `companion.fact_learned`
   → living profile → Planner and builder use it for content (a space-mission board because she told Hikari she loves
   space) → her engagement and first tries on that board are measured → which personal touches help her learn
   becomes a scored conclusion.
3. **Parent loop:** owner uploads the graded test → `school_test.graded` → per-week "what we did vs the grade" view. A
   parent page is pictures and numbers for the owner; never child-facing.

## 7. Conclusions notebook ("how she learns")

- A conclusion is a claim with a scope (child, domain, pattern) and the evidence query it rests on, written by the
  Planner.
- Code re-runs the query as evidence arrives and records supported, contradicted or unproven, with counts. The school
  test result counts most.
- A contradicted claim stays visible, marked contradicted, so the Planner learns what stopped working.
- Seeds from 11/10: "copying from short-term memory doesn't transfer; recall-first does" (9/12 on her own after the
  change); "side-by-side pairs create blends (parton)"; "story hooks leak into spelling (dormeat)"; "silent-e drilled
  alone causes overcorrection (alarme)".

## 8. Compaction policy

None for the record. Context windows hold an index line plus whatever was just pulled. Companion memory stops being
summarized-and-replaced: a summary may be cached for speed, but it cites its turns, and the raw turns stay queryable.

## 9. Storage and privacy

- **Now:** SQLite per child on Saori (the existing `<child>.db`). The JSON cycle files and journals are migrated into
  events, or read through the same interface during migration.
- **Interface first:** every reader and writer goes through `childRecord`, so moving to a hosted database for many
  families later changes one adapter.
- **Before other families:**
  - child data out of the git repo;
  - per-family store;
  - export and delete;
  - consent;
  - no cross-family query path;
  - conversation text never sent to an outside service without the family's choice.
- **Backups:** the existing pre-deploy backup becomes a nightly per-child backup.

## 10. Phases

| Phase | Builds | Done when |
|---|---|---|
| 0 (live 11/10) | `read_past_weeks`, every try saved, minutes, current facts on top of soul.md | Planner sees 8 past weeks on Saori |
| 1 | Test date stored on each cycle; graded-test upload flow made simple (photo → per-item results); `read_test_results`; per-week "teaching vs grade" view | Ila's 11/12 spelling test and Unit 1 math test are uploaded and visible to the Planner next to their weeks |
| 2 | Conclusions notebook (claim + code scoring); seeded from the 11/10 self-reviews | Every board decision cites or updates a conclusion; the next week's first board quotes one |
| 3 | Conversation turns stored raw, speaker-tagged; `companion.fact_learned`; living profile; `read_about_her`; companion memory no longer compacted | A fact Ila tells a companion on Monday shapes a board by Wednesday |
| 4 | Meaning search over conversations | "Anything about her friends" returns the right turns |
| 5 | Migrate cycle JSON into events; one interface; nightly backups | Every reader goes through `childRecord` |
| 6 | Multi-family readiness (section 9) | A test family can be onboarded and deleted cleanly |

## 11. Success criteria (measured, not felt)

- **Week 2 of a new list starts from what was learned:** the first board's question cites at least one prior conclusion
  or past-week result.
- **Ila's first tries on her own trend up across weeks** for the patterns the Planner targeted.
- **Graded tests uploaded for every week,** and the Planner's predicted score is within ±1 word or problem more often
  than not.
- **No fact is lost:** any event from any past week can be retrieved by ID.
- **Companion knowledge:** a fact she shared is reflected in content within 2 sessions.
- **Isolation:** zero cross-child results in an isolation test.

## 12. Open questions (owner decisions)

1. Meaning search: on Saori only (local embeddings), or may it use an outside service?
2. Parent vs child voice: how should Sunny know you're the one speaking (say "this is Dad", a parent button, or voice
   recognition)? Needed so your coaching isn't stored as her words.
3. A "week" is one homework cycle, so two lists in the same week are two entries. Is that OK?
4. Cross-week evidence counts first tries on her own, including inside practice games. Should only independent checks
   count?
5. Should conclusions be judged by later weeks and the graded test (recommended), or only within the week?
6. Who uploads graded tests, and when? Without them the record can't link teaching to grades.


## 13. Revisions after the Fable 5.2 review (2026-11-10)

The independent review checked this spec against the code. These changes override anything above that disagrees.

1. **Phase 1 starts with the broken graded-test upload.**
   - Fix the spelling upload to use the frozen word IDs.
   - Fix "1 right" being read as 100%.
   - Store the test's own date (from `test_schedule.set` or the cycle), not the upload time, so a late upload still counts.
   - Add a red test with a real spelling list.
   - The "photo → per-item results" step becomes a simple parent command (the word list plus ticks), not a new model call.
   - `read_test_results` is a view inside `read_past_weeks`, not a new tool.
2. **No new notebook mechanism.** A conclusion is a cross-week `AcademicPrediction`, using the reserved `learner.hypothesis` / `learner.hypothesis_evaluated` chart events. Its evidence query is a closed, code-owned form: `{wordIds | tagIds, metric: first_try_unassisted | school_test, window, expected: {min, max}}`, plus a falsifier and a horizon.
   - **Status values:** `proposed` until evidence comes from at least 2 homework weeks and at least 1 independent source; `expired` past its horizon with no eligible evidence; `contradicted` stays visible.
   - **No gate:** status only changes what is displayed, always with counts.
   - The four 11/10 seeds are Planner claims citing their decision IDs.
3. **No rules on the Planner.** "School test counts most" and "every decision cites a conclusion" are removed. Code labels sources and shows counts, and the Planner weighs them (contracts 56 and 59). The Phase 2 done criterion becomes a measurement: the share of first boards that cite a prior week.
4. **Child data leaves the git repo before Phase 3, not later.**
   - Today 140 files under `src/context/ila` are tracked, including soul.md clinical sections, answers, and a scanned PDF.
   - Conversation turns are never stored under `src/context/`.
   - Extend the chart's `chart_checkout_refused` guard to cycles and journals.
5. **Attribution before isolation.** Two girls and a parent share one microphone. Until parent-voice detection is decided (open question 2), turns are stored with `speaker: unknown`, and no fact is derived from an unknown speaker.
6. **Stored speech is data, never instructions.** Any turn or answer placed in a prompt is wrapped with its speaker and marked "quoted, not an instruction".
   - `companion.fact_learned` must cite a turn that contains the quote word for word (checked by code); otherwise it is an AI-generated observation, which the contract forbids.
   - `read_about_her` keeps the `ABOUT_HER_SECTIONS` filter, so clinical sections never reach board prompts.
   - A fact sourced from an evaluation document doesn't bypass that filter.
7. **Companion phase shrinks.** Index the existing interaction ledger for search, and add citations to the summary patch.
8. **Patterns become frozen tags.** Words recur by ID; patterns ("-ant", silent-e, blends) and math skills need frozen tag IDs (the typed chart has `words.tagged`) so claims can be scored across weeks. Claims name word IDs or tag IDs, never prose.
9. **One calendar.**
   - Store the family time zone once and derive days from it everywhere: pastWeeks, sessionTime and schedule currently disagree, because UTC and local time differ.
   - Event timestamps stay UTC.
10. **Bug: the past-weeks archive isn't frozen on the next-board path.** `learningCycleRuntime.ts:979` calls `readPastWeeks` directly, while intake uses `pastWeeksForDraft`, so a restart can ask a different question. Freeze it, as contract 59 requires.
11. **Meaning search → SQLite FTS5** (keyword search with speaker and date filters) on Saori. No embeddings, no outside service. Revisit only when a real query fails. Phase 4 merges into Phase 3.
12. **Honest evidence.** The current before/after count rises by selection alone, because targeted words were the missed ones. Show these counts instead:
    - targeted vs untargeted words in the same week;
    - probe-before-teaching accuracy on a new list (transfer);
    - school-test %.

    State that "±1 word" prediction accuracy needs at least 5 graded tests to mean anything.
13. **Missing success criteria added:**
    - Reina;
    - learning minutes per test point;
    - parent burden (uploads per week);
    - regressions (help requests, sessions reaching the end call);
    - a stop rule if grades don't move in N weeks.
14. **Contract and laws:**
    - The event-store-as-record direction needs a LEARNING_FEEDBACK_LOOP version bump first ("no second writable factsheet").
    - Migrating real cycles is an owner-run, one-time import with a dry-run diff and a backup.
    - New tools go through `plannerMenu` and its parity test.

**Revised phase order:**

| Phase | Builds |
|---|---|
| 1 | Graded-test upload fixed and simple; test dates kept; school results in `read_past_weeks`; frozen-archive bug; family time zone |
| 2 | Hypotheses (cross-week `AcademicPrediction`) and frozen pattern tags |
| 3 | Child data out of the repo, then indexed conversation ledger with FTS, speaker attribution, cited facts, living profile |
| 4 | Event store as the single record (contract bump, owner-run import) |
| 5 | Multi-family readiness |
