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
| `engagement.observed` | room, recorded by system | Engagement vital signs (section 9). Never academic evidence. |
| `engagement.prediction` / `engagement.evaluated` | creator / system | A presentation bet ("competition framing → finishes and replays") and its result. |
| `learner.hypothesis` / `learner.hypothesis_evaluated` | planner / system | A how-she-learns guess, and whether it predicted correctly in a second department (section 8). |
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

## 8. The shared hospital: departments, rooms and the whole child

**The chart** is one per child. Everything reads from it and writes to it.

**Departments** are the subjects: spelling first, math later. Each is a specialist and owns:
- its item types and scoring;
- what counts as help;
- its skill or pattern list;
- its fixed measuring tool;
- its readiness forecast;
- its real-world test;
- its report-card section.

A department never reads another department's skill scores. Every department must define all of the above before it ships.

**Rooms** are the nodes, games and activities, and they work for any subject. A department hands a room the items to present. The room makes the experience and reports raw facts: the response, timing, replays, help requests, and the engagement vitals below. Rooms never score or interpret anything. One room can serve spelling and math.

**The whole child** is a shared section about *how she learns*, not what she knows. Examples: "accuracy drops after ~12 minutes", "reading-heavy instructions slow her down", "a worked example first helps".
- Each entry starts as a Planner `learner.hypothesis` event citing evidence from one department.
- It becomes trusted only when it correctly predicts something in a **second** department (`learner.hypothesis_evaluated`).
- Trusted entries may also correct measurements. For example, a slow decoder's missed math word problem is flagged as a possible reading miss.

## 9. Engagement vital signs and rewards

Every room records the same vitals in every session, from day one (`engagement.observed`):
- time to start a node;
- finished vs quit, and where she quit;
- voluntary replays;
- chose the harder or easier route;
- pace, and long idle gaps;
- frustration markers (rapid repeated misses, giving up mid-item);
- whether she came back the next day without being asked;
- her own quick rating.

**Engagement loop.**
- The Experience Creator writes an `engagement.prediction` for each presentation choice (theme, game type, competition vs calm, story, humor), for example "competition framing → she finishes and replays".
- The vitals check that prediction.
- Most nodes use what has worked for her. Roughly one in four tries something new as a recorded experiment, so her preferences can be discovered and can change over time.
- Recent sessions count more than old ones.
- Engagement facts feed content for **every** subject, because what she enjoys transfers even though what she knows does not.

**Rewards** (variable reward is allowed, with these limits):
- Rewards come from effort and participation: finishing, persisting, coming back. Never from correctness alone, and correctness is never adjusted to grant one.
- The *form and timing* of rewards may vary (mystery reward, surprise unlock, companion moment). Earned rewards are never taken away.
- Optimize for flow and willing return, not time on screen. Sessions have a parent-set cap.
- XP and rewards are computed from events; nothing stores them separately.

## 10. Reliable AI content

- **Rooms are tested code.** The AI mostly writes *content as data* for proven rooms: words, problems, themes, story, art prompts, presentation settings. It does not write new programs for every node.
- Generated bespoke artifacts are allowed only when Playwright verification can prove them (they launch, every item is reachable, responses are reported correctly), and they get published only after passing.
- A room can't report academic results it didn't observe; scoring always happens in the department.

## 11. What goes and what stays

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

## 12. Build order

| Phase | Work | Done when |
|---|---|---|
| **0. Reset** | Archive Saori's current data folder into one tarball that is never read again. Create `~/SunnyData/`. UX-testing sessions may continue, but their data is throwaway. | Archive exists. |
| **1. Chart database** | Build `appendEvent`, `buildChart`, the immutability triggers, the startup guard, export and snapshot. | Tests prove: no update or delete possible; duplicate events are no-ops; the guard refuses a checkout path; two processes can write at once. |
| **2. Ingest, guess, Discovery** | Spelling ingestion, pattern tags, priors, the fixed Discovery instrument writing events. Every room reports engagement vitals from the start. | A synthetic child completes Discovery, and the export shows the prior, every response with its assistance facts, the vitals, and the evaluation. |
| **3. Board, forecast, test, report card** | Planner board from the chart, practice events, the readiness check and forecast, the parent test-entry screen, forecast evaluation, the report card. | A synthetic child runs 3 simulated weeks end to end, and the report card shows 3 weeks of numbers. |
| **4. Pilot** | Reina, real spelling, 3 weeks, on Saori. | 3 real school tests entered, and the report card shows guess and forecast accuracy. |
| **5. Engagement loop** | Engagement predictions, experiments in about one node in four, and rewards per section 9. | The report card shows which presentations worked for her. |
| **6. Grow** | Quest and Boss (from readiness evidence, as new boards), whole-child hypotheses, then the math department. | Each addition writes only events; math reads the whole-child and engagement sections, never spelling scores. |

## 13. Rules for agents (these replace the scattered rules for this path)

1. Real-child databases exist only on Saori. Development uses synthetic children or read-only snapshots.
2. All writes go through `appendEvent`. Never edit or delete events.
3. Every Planner decision, forecast and claim cites event IDs.
4. Every audit states which database it read (host, path, snapshot time).
5. One change per pull request, test first.

## 14. During the rebuild

UX-testing sessions with the girls can continue on the current system, but their data is throwaway: no audits, no learning conclusions, nothing carried forward. Keep logging UX bugs, since the games, companion and board carry over. Keep photos of graded school spelling tests; they can be entered as `school_test.recorded` once the database exists.

## 15. Open questions

1. Node version on Saori: built-in `node:sqlite` (Node 22+) or the `better-sqlite3` package?
2. Is one family database or one database per child preferred? Per child is the default here.
3. Test entry: should the parent type results at first (recommended), or should scanning come first?
