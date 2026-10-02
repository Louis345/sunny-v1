# Sunny Chart Rebuild: Design Spec

Status: draft for review · Scope: spelling first · Host: Saori's computer

## 1. Why

Sunny's idea is right: read the child's chart, predict, measure, teach, forecast readiness, check against the real school test, and get smarter each week. The plumbing doesn't support it.

- A child's learning is written to at least six stores: cycle files, `learning_profile.json`, `word_bank.json`, homework folders, board files and session notes.
- Every code checkout (38 on the dev Mac) holds its own copy of the girls' data, and none of them is marked as the real one.
- For spelling, the loop has never closed. No prediction has ever been checked against a school test.
- Live-session bugs (duplicate writes, history changing, answers credited to the wrong activity) keep returning because several stores can be written.

This spec keeps the app (games, companion, board, Planner, Experience Creator) and replaces the plumbing.

## 2. Principles

1. **One chart per child, in one place.** It is a single SQLite file on Saori's computer, outside every code checkout.
2. **Facts are written once and never changed.** A mistake is fixed by writing a correction that cites the original.
3. **Everything else is computed from the facts:** the chart, boards, XP, review schedules and the report card. None of it is stored as separate state.
4. **Swapping the child's file changes everything downstream.** This is the waterfall.
5. **The school test is the truth.** Sunny earns trust by forecasting it accurately.

## 3. The chart database

**Location**
- `~/SunnyData/reina.db` and `~/SunnyData/ila.db` on Saori's computer.
- Uploaded files (homework photos, graded tests) are stored next to the database in `~/SunnyData/<child>/files/<sha256>.<ext>` and referenced by hash.

**Structure**
- **`events` table, append-only.** Columns:
  - `event_id`: unique and deterministic, for example a hash of type plus its natural key.
  - `type`
  - `occurred_at`, `recorded_at`
  - `actor`: `child | parent | planner | creator | system`
  - `cites`: the event IDs this event relies on.
  - `payload`: JSON.
- **The database rejects** any UPDATE or DELETE on `events` (via triggers) and any duplicate `event_id`. Writing the same event twice is therefore a harmless no-op.
- WAL mode is on, so the kiosk server, the board builder and ingestion can all write safely.
- A `schema` table holds the version.

**Access**
- **One write path.** A single module, `appendEvent(event)`, is the only code that writes. It validates the event shape and its citations.
- **One read path.** `buildChart(childId)` reads events and returns the chart. Planner, board, report card and companion context all start from it.
- **Startup guard.**
  - For Reina or Ila, the server opens only the declared file, and refuses to start if the path is inside a git checkout.
  - It logs: `🎮 [chart] [opened] child=reina path=~/SunnyData/reina.db events=N`.
- **Export:** `npm run chart:export reina` prints the history as readable text or JSON for people and agents.
- **Snapshot:** `npm run chart:snapshot reina` makes a read-only copy for audits on other machines. The copy records its source host, path and time.

## 4. Event types (spelling)

| Event | Written by | What it records |
|---|---|---|
| `child.profile_set` | parent | Interests, companion, support needs, reading level. Who she is. |
| `assignment.ingested` | system | Assignment ID (hash of the normalized word list plus test date), the words, test date and source photo hash. Re-ingesting the same list is a no-op. |
| `words.tagged` | planner, validated by code | The spelling patterns per word, for example `silent_letter`, `vowel_team_ea`, `suffix_ed`. Pattern IDs come from a fixed list that code validates. New patterns are added to the list deliberately. |
| `prediction.prior` | planner | **Before Discovery:** per word, the chance she spells it correctly, the expected error, and the history cited. |
| `session.started` / `session.ended` | system | Bookkeeping only. Creates no XP and no learning. |
| `item.presented` | system | Which word, which instrument, measuring or practice, and what was shown (audio only, letters visible, and so on). |
| `response.observed` | child, recorded by system | The exact typed response, correct or not (computed by code), whether it was the first try, and the facts about what happened around it (replayed the audio, saw the spelling, got a hint, asked the companion). Assistance is decided **per response from these facts**, never for a whole activity. |
| `prediction.evaluated` | system | The prior compared with Discovery: per-word error and overall score. |
| `plan.decided` | planner | One decision: what to teach next, citing the responses and evaluations it relies on. |
| `board.published` | system | A complete, frozen board: ID, previous board, the plan decision it implements, every node, route and artifact hash. A changed board is a new event. |
| `node.started` / `node.completed` | system | Activity progress. |
| `engagement.observed` | system | Route chosen, replays, quits, ratings. Never academic evidence. |
| `readiness.forecast` | planner | The predicted test score and the per-word risk, written before the test. This is the green light. |
| `school_test.recorded` | parent | Per word: right or wrong and what she actually wrote, plus a photo hash. Typed in by the parent at first. |
| `forecast.evaluated` | system | The readiness forecast compared with the school test. |
| `correction.recorded` | parent or system | Replaces a mistaken fact by citing it. The original stays in history. |

Not stored: XP, levels, review due dates, "mastered" flags. These are all computed from events.

## 5. The spelling week, step by step

1. **Ingest.** The parent photographs the list, and code writes `assignment.ingested`. The Planner tags patterns (`words.tagged`).
2. **Guess.** The Planner reads the chart and writes `prediction.prior` for every word.
3. **Discovery.** The child hears each word and types it, hidden, first try only. The instrument is the same every week, so readings stay comparable, while the Experience Creator may change the look and theme around it. Code writes `response.observed`, and `prediction.evaluated` follows.
4. **Plan.** The Planner writes `plan.decided`. The Experience Creator builds a full board, and code writes `board.published`. The child chooses routes. Practice answers are recorded as practice.
5. **Check and forecast.** A short hidden check, in the same format as Discovery, measures progress. The Planner writes `readiness.forecast`.
6. **The test.** The parent enters the school results (`school_test.recorded`), and code writes `forecast.evaluated`.
7. **Next week.** The chart now holds, per pattern, the guesses, readings, forecasts and real results, so the next guess starts from that.

If the school test result never arrives, the week stays open. Sunny never marks it as passed on its own.

## 6. Evidence rules

- **Counts as independent evidence:** first-try, hidden-word responses in the fixed measuring format, where none of these happened before or during the answer: saw the spelling, received a hint, or had companion help. Replaying the spoken word is not help.
- **Practice:** everything inside games. It's useful for choosing what to teach, but never counts as mastery.
- **Engagement** (choices, fun, ratings) can shape presentation only.
- **The school test is the strongest evidence**, and the only thing that can confirm readiness.
- **Neither code nor AI may create a response.** Only the child produces responses, and only the parent produces school results.

## 7. Parent report card

One screen, per week:
- how close the before-Discovery guess was (Brier score, plus "predicted 14/20, got 12/20");
- how close the readiness forecast was to the school test;
- trend per pattern (for example, silent letters: 2/5 → 4/5 over 3 weeks);
- words at risk for the next test.

**Sunny is working when both accuracy lines improve over the weeks.**

## 8. What goes and what stays

**Retired from the learning path** (the spelling path first; math and other subjects later):
- `word_bank.json` and the SM2 writes (review scheduling is computed from events instead);
- learning fields in `learning_profile.json`;
- `homework/cycles/*.json`;
- homework pending folders and board files as state;
- XP computed from session counts.

**Kept and connected to the chart:**
- the games and activity catalog;
- the companion;
- the board renderer, which now reads `board.published`;
- the Planner and Experience Creator, which read `buildChart` and write events through `appendEvent`.

**Out of scope for now:** companion care and wardrobe, math and reading. Each moves later, one at a time.

`LEARNING_FEEDBACK_LOOP.md` is replaced by a one-page version of sections 4–6 when this ships. It is replaced, not appended to.

## 9. Build order

| Phase | Work | Done when |
|---|---|---|
| **0. Pause** | Stop child sessions and live monitoring. Archive Saori's current data folder into one tarball that is never read again. Create `~/SunnyData/`. | Archive exists; no sessions running. |
| **1. Chart database** | Build `appendEvent`, `buildChart`, the immutability triggers, the startup guard, export and snapshot. | Tests prove: no update or delete possible; duplicate events are no-ops; the guard refuses a checkout path; two processes can write at once. |
| **2. Ingest, guess, Discovery** | Spelling ingestion, pattern tags, priors, the fixed Discovery instrument writing events. | A synthetic child completes Discovery, and the export shows the prior, every response with its assistance facts, and the evaluation. |
| **3. Board, forecast, test, report card** | Planner board from the chart, practice events, the readiness check and forecast, the parent test-entry screen, forecast evaluation, the report card. | A synthetic child runs 3 simulated weeks end to end, and the report card shows 3 weeks of numbers. |
| **4. Pilot** | Reina, real spelling, 3 weeks, on Saori. | 3 real school tests entered, and the report card shows guess and forecast accuracy. |
| **5. Grow** | Quest and Boss (from readiness evidence, as new boards), a richer companion, then math. | Each addition writes only events. |

## 10. Rules for agents (these replace the scattered rules for this path)

1. Real-child databases exist only on Saori. Development uses synthetic children or read-only snapshots.
2. All writes go through `appendEvent`. Never edit or delete events.
3. Every Planner decision, forecast and claim cites event IDs.
4. Every audit states which database it read (host, path, snapshot time).
5. One change per pull request, test first.

## 11. During the pause

The girls do spelling at school as normal. Keep photos of their graded spelling tests. They can be entered as `school_test.recorded` once the database exists, which gives Sunny real history to start from.

## 12. Open questions

1. Node version on Saori: built-in `node:sqlite` (Node 22+) or the `better-sqlite3` package?
2. Is one family database or one database per child preferred? Per child is the default here.
3. Test entry: should the parent type results at first (recommended), or should scanning come first?
