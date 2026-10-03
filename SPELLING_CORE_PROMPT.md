# Fresh-start prompt: Sunny spelling chart core (Milestone 1)

## Who you are working for and why

Sunny is a voice-based home tutor for a parent's two daughters (Reina and Ila). It runs as a kiosk on the family computer "Saori". The vision is a personal tutor that gets better at knowing each child over time. It works like a hospital:

- **The chart:** one record per child, the single source of truth.
- **Departments:** each subject is a specialist. Spelling is first.
- **Rooms:** activities and games present items and report what happened. They never score.
- **The loop:** before testing, Sunny guesses how the child will do. It measures with a fixed instrument (Discovery), compares its guess with reality, teaches, forecasts the school test, records the real school result, and gets more accurate over the weeks. A parent report card shows whether the guesses and forecasts are actually improving.

The previous attempt failed because learning was written to many places: JSON cycles, word banks, profiles, and copies per checkout. **This rebuild has one rule above all: one append-only SQLite chart per child is the only learning authority, and everything else is computed from it.**

## Starting point

- Repository: `/Users/jamaltaylor/Development/sunny-chart-foundation`.
- Create a new branch `codex/spelling-chart-core` from commit **`e15f7b5`** (branch `codex/chart-foundation-phase01`). Do not carry over that checkout's uncommitted changes.
- The uncommitted "cycle-command" slice is preserved at `origin/audit/chart-foundation-wip` (`7f6343d`) **for reference only**. Do not reuse its design. It stored legacy cycle commands and replayed the legacy reducer, which an audit rejected for two reasons: two competing representations of the same fact, and history that can become unreadable when the reducer changes.
- **Keep and build on** `src/chart/`: `db.ts`, `appendEvent.ts`, `guard.ts`, `eventId.ts`, `snapshot.ts`, the CLIs, and `kioskLifecycle.ts`.
- Read first: `AGENTS.md`, `LEARNING_FEEDBACK_LOOP.md`, `docs/SUNNY_CHART_REBUILD_SPEC.md`, `scripts/chart/README.md`, `scripts/chart/KIOSK_STARTUP.md`.

## Autonomous milestone authorization

The human approves **Milestone 1 as defined in this prompt** as an autonomous milestone under `AGENTS.md` "Autonomous Milestone Mode". Work it through to the end without stopping for approval:
- Red, then green, without pausing after reporting red tests.
- Change all the files this milestone needs, and fix every blocker inside its scope.
- Post short progress notes in the PR description. They are informational, not checkpoints.

This authorization does **not** cover any of the following:
- anything in the Roadmap, wiring into the kiosk, routes, ingestion or Planner;
- deployment, Saori, merging, paid provider calls, or real child data;
- changing the core design decision below.

If you hit a genuine product decision or a conflict with `AGENTS.md`, record it under "Assumptions and open questions" in the PR. Take the most conservative option that keeps the rules in this prompt intact, and continue. Stop only when progress is truly impossible, and then state the exact blocker.

Use bounded attempts. If the same failure persists after 3 different fixes, stop, record your diagnostics in the PR, and move on to the rest of the scope.

The **spelling pattern taxonomy** (`patterns.ts`) is a draft for the human to review. Mark it as such in the PR, and don't block on it.

## Core design decision (do not change it without asking the human)

**Typed facts are the record. Views are pure functions of facts.**

- Each spelling fact is one small, typed event with a strict payload schema, validated when written.
- The cycle view, evaluations, report and Planner packet are **pure projection functions** over the facts. They may change freely between code versions, because the facts don't depend on code.
- **Do not** store or replay `LearningCycleRecordV2` or legacy cycle commands for spelling. Do not read JSON cycles, `word_bank.json`, SM2 history or `learning_profile.json` learning fields for spelling. An empty or missing chart means "no history", never "fall back to the old files".

## Milestone 1 scope: the spelling department core (module level, not wired to the kiosk)

### 1. Commit order and time
- Projections order events by **commit sequence**, not by the caller's `occurred_at`. Use SQLite's `rowid` or add an explicit sequence column.
- If you change the schema, first verify that no real-child database with events exists anywhere you can see. Report what you checked. Bump the schema version, and make `openChart` refuse an unknown version rather than migrate silently.
- Rules about what came first (for example, a prediction made before the answer) use **server `recorded_at` and commit sequence**, never client-supplied time.
- A wrong or skewed clock must not permanently block a cycle. Don't add rules of the form "occurred_at must be ≥ predecessor"; rely on sequence.

### 2. Spelling event types, each with a strict schema, actor rule and natural key

| Type | Actor | Natural key (event ID = `eventId(type, key)`) | Key rules |
|---|---|---|---|
| `assignment.ingested` | system | assignmentId | Words, test date, source hash. One per assignmentId. Corrections may fix words or date **only before** the first prior is recorded; assignmentId is immutable. |
| `words.tagged` | planner | assignmentId | Every word gets ≥1 pattern ID from a fixed, versioned taxonomy file (`src/chart/spelling/patterns.ts`, which the human will review). Unknown IDs are rejected. |
| `prediction.prior` | planner | assignmentId + word | p(correct) in [0,1], expected error, confidence, cited event IDs. **Rejected if any Discovery response for that assignment already exists.** One per word. |
| `item.presented` | system | sessionId + itemId | Word, instrument (`discovery`, `practice`, `recall_check`), role (`measure`/`practice`), what was shown (audio only, letters visible, and so on). |
| `response.observed` | system (on behalf of the child) | sessionId + itemId + attempt | Raw typed response, first try or not, and **support facts** (audio replayed, spelling shown, hint, companion help). Must cite its `item.presented`. **Correctness is computed by code** from the frozen word and accepted forms, never supplied by the caller. Assistance is derived **per response** from its support facts. Replaying the spoken word is not assistance. |
| `plan.decided` | planner | assignmentId + decision index | Must cite the evaluation and response IDs it relies on. Must contain no correctness, mastery or evidence claims. |
| `readiness.forecast` | planner | assignmentId | Per-word p(correct on the school test), uncertainty, missing evidence, and cited `recall_check` responses. **Rejected once a `school_test.recorded` exists** for the assignment. |
| `school_test.recorded` | parent | assignmentId | Per word: correct or not and the written response if known; test date; photo hash. Tied to the original assignment. |
| `correction.recorded` | parent or system | — | Existing rules, plus: may never change an identity field or a fact that later facts already depend on. Use an explicit new fact instead. |

Evaluations (`prediction.evaluated`, `forecast.evaluated`) are **projections computed by code, not stored events**. If they must be stored for audit, only `system` may write them, and they must equal the projection exactly.

Make the remaining registered types (engagement, learner hypothesis, board, node) **reject** spelling use until each one gets its own schema in a later milestone. No type may accept an arbitrary payload.

### 3. Pure projections (`src/chart/spelling/*.ts`)
- `projectAssignment(events, assignmentId)`: words, patterns, priors, Discovery responses with computed correctness and assistance, recall checks, forecast, school result, coverage.
- `evaluatePriors(...)`: per-word error and Brier score over **eligible** responses only (first try, unassisted, `discovery` instrument, `measure` role), with coverage reported separately. Unknown, skipped and ambiguous responses are not counted as incorrect.
- `evaluateForecast(...)`: forecast vs school test, per word and Brier.
- `projectPatternHistory(events)`: per pattern across assignments, the eligible results and school results over time.
- `buildReportCard(events)`: the data for the parent report (structure only, no UI yet).
- `buildPlannerPacket(events, assignmentId)`: what the Planner reads: pattern history, prior and forecast accuracy, missing evidence. Facts with provenance, no behavioral commands.

### 4. Write path
- Add one module `src/chart/spelling/record.ts` that exposes intent-level functions (`recordAssignment`, `recordPriors`, `recordResponse`, and so on). Each one validates cross-event rules and appends in **one transaction** through `appendEvent`.
- Every rule enforced there must **also** be enforced inside `appendEvent`, so direct calls can't bypass it.
- Validation must not replay the whole history on every write. Use indexed lookups by natural key or assignment. Add a test with about 10,000 events confirming that appends stay fast.
- Log in the format ` 🎮 [chart] [action] [result]` for every write and rejection.

### 5. Contract
Before writing code, update `LEARNING_FEEDBACK_LOOP.md`. Add a short, precise "Spelling chart authority" section that describes this design (typed facts, projections, ordering by sequence, per-response assistance, server scoring, priors before Discovery, forecast before the school result). State that it is **not yet activated**: legacy paths remain authoritative until the cutover milestone. Bump the version by one. Don't describe unimplemented behavior as current.

## Tests (write first, confirm they fail, then implement)

1. Each type: valid accepted. Wrong actor, missing field, extra or unknown field, or bad values rejected.
2. A prior after the first Discovery response for that assignment is rejected. A forecast after the school result is rejected.
3. A caller cannot set correctness; the projection computes it from the frozen word.
4. Assistance is per response: companion help on word 3 doesn't mark words 1, 2 or 4 as assisted. Replaying the spoken word is not assistance.
5. Identical retries are no-ops even with a different `occurred_at`. A conflicting fact under the same natural key is rejected.
6. A future-dated or backdated `occurred_at` neither reorders history nor blocks later facts.
7. Corrections can't change assignmentId, and can't change words after priors exist.
8. Pure projections: the same events always give identical output, and events have no dependency on code version (prove it by projecting a stored fixture event log committed in the repo, `src/chart/spelling/fixtures/week1.events.json`).
9. **Three synthetic weeks** at module level: ingest, tags, priors, Discovery (with some assisted, unknown and ambiguous answers), plan, recall check, forecast, school result, then week 2's Planner packet includes week 1's pattern history, and the report card shows prior and forecast Brier per week with coverage. Changing a week-1 school result changes the report and the week-2 packet.
10. Two processes appending responses concurrently for the same session gives no duplicates and no loss.
11. Performance: 10,000 events, and an append stays under a stated bound.
12. Family data unchanged: compare a checksum inventory of every `src/context/` before and after.

## Hard constraints
- No paid provider calls, no ingestion or generation runs, no deployment, no merge. Don't touch Saori.
- Never create, read or write a real child's chart. Tests use synthetic child IDs in temporary directories.
- Use Node 20.20.0. Run tests in a temporary copy of the repo with `src/context/ila` and `src/context/reina` removed, no `.env`, and network access blocked.
- Don't wire anything into the kiosk, routes, ingestion or Planner in this milestone. Don't delete legacy code yet.
- Follow `AGENTS.md`: tests first, ` 🎮` logs, no silent failures. Note the scope of each change in the commit message.
- If a requirement here conflicts with `AGENTS.md` or the existing code in a way you can't resolve, stop and explain. Don't build around it.

## Done when
- Build passes; new tests pass; existing chart-foundation tests still pass; `git diff --check` is clean.
- The family-data inventory is identical before and after.
- One read-only second-agent review of the diff against this prompt, `AGENTS.md` and the contract.
- Commit on `codex/spelling-chart-core` and push. Don't merge.
- Report:
  - files added and changed;
  - the red tests and their initial failures;
  - final results;
  - schema decisions;
  - anything in this prompt you think is wrong.

## Review workflow (a separate reviewer grades your work)

An independent reviewer will review your pull request on GitHub and grade both your **code** and your **reasoning**. Work so that your thinking is visible.

1. Push `codex/spelling-chart-core` early and open a **draft PR** against base `codex/chart-foundation-phase01` in `louis345/sunny-v1`. Never merge it, and never mark it ready yourself.
2. Commit in small, independently understandable steps. Each step goes red first, then green. The commit message states what changed and why.
3. Keep the PR description current. It must contain:
   - **Decisions log:** each meaningful choice, the alternatives you considered, why you chose it, and what would change your mind.
   - **Assumptions and open questions:** anything you guessed rather than verified.
   - **Red-test evidence:** each new test and the exact failure it showed before the implementation.
   - **Verification:** commands run, the Node version, the isolation method, and results. Report only what you actually ran.
   - **Known gaps and risks:** what this milestone does not do, and where it could be wrong.
   - **Spec deviations:** any place you departed from this prompt, and why.
4. When review comments arrive, either fix the issue and reply with the commit SHA, or reply explaining why not. Resolve nothing silently. Don't argue for scope creep: out-of-scope ideas go under "Known gaps".

### Grading rubric (each category A–F)

| Category | What earns an A |
|---|---|
| **Spec fidelity** | Typed facts are the record; views are pure projections; no legacy cycle, JSON or SM2 reads for spelling; scope stays in Milestone 1. |
| **Evidence integrity** | Server-side scoring, per-response assistance, priors before Discovery, forecast before the school result, ordering by sequence, no caller-supplied correctness, no fact type accepting arbitrary payloads. |
| **Tests** | All 12 required tests exist, were red first, test behavior rather than implementation, and include failure cases. |
| **Simplicity** | The smallest design that meets the spec. No speculative abstractions; legacy hot paths untouched. |
| **Safety** | No real-child data touched, no paid calls, isolated test runs, family-data inventory unchanged. |
| **Honesty of reasoning** | Claims in the PR match the code; uncertainty is stated; nothing is labeled done that isn't. |

**Merge gate:** no category below B, and zero unresolved blocking findings. The human makes the final decision.

## Roadmap (do not start these now)
- **Milestone 2: wire it up.** Ingestion, the Discovery kiosk path, the Planner reading the packet and writing `plan.decided`, practice and recall rooms, the forecast step, a parent school-result entry screen, and the report card UI. Recorded providers, browser acceptance at both viewports, three synthetic weeks through real endpoints.
- **Milestone 3: cutover.** An activation flag, `getChildChart` reading spelling from the chart, legacy spelling writes switched off, and a backed-up installation on Saori.
- **Milestone 4:** engagement vital signs and the engagement loop; then Quest and Boss as new boards; then the math department.
