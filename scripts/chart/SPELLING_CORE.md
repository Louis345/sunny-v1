# Spelling department core — Milestone 1

Implementation prepared for independent review. Not activated, not deployed,
and not ready for kiosk acceptance. The normative authority is
[LEARNING_FEEDBACK_LOOP.md](../../LEARNING_FEEDBACK_LOOP.md), version 24.
The adopted scope is [SPELLING_CORE_PROMPT.md](../../SPELLING_CORE_PROMPT.md).

## What changed

The chart now accepts typed spelling facts and projects assignment readings,
prior evaluations, forecasts, school calibration, pattern history, report data
and Planner packets. The shared database remains subject-neutral. Spelling owns
its schemas, protocol and draft pattern taxonomy. There are no new model calls,
legacy cycle reducers, JSON learning reads, math changes or kiosk integrations.

New code lives in `src/chart/spelling/`; changes to shared chart files replace
permissive validation, client-time ordering and retry comparison. New source
lines establish the approved typed-fact invariants. Legacy learning hot paths,
server routes and UI are unchanged.

## Decisions log

- **Schema 3, explicit sequence.** An INTEGER PRIMARY KEY AUTOINCREMENT survives
  VACUUM and database snapshots. Implicit rowid was simpler but less explicit
  for durable ordering. Exports preserve sequence. Opening an existing unknown
  or schema-1/schema-2 file is refused before schema/WAL changes; no migration occurs.
- **Local presence check before changing schema.** A metadata-only walk of
  `~/Development`, `~/Devlopment` when present, and `~/SunnyData` found no
  `reina.db`, `ila.db`, `reina.sqlite` or `ila.sqlite`. Dependency/build/cache/git
  directories and symlink directories were excluded. Context files were hashed
  without printing contents. No real chart contents were read. This is a scoped
  local check, not proof of absence elsewhere or on Saori. Installation on another
  host requires its own preflight; it is not authorized here.
- **Facts, not reducer commands.** Writes validate structure and relationships
  inside `appendEvent`'s immediate transaction. Intent helpers use that same
  path; prior batches use an enclosing transaction. Logs distinguish staged
  writes from committed batches and rollbacks.
- **Indexed validation.** Natural IDs, assignment/type/sequence and item indexes
  serve normal writes. An immutable citation index records dependencies transactionally.
  Plans recompute only their assignment's evaluation, not the entire chart.
- **Pure evaluation IDs.** A versioned content hash identifies the evaluation's
  rows and coverage. `plan.decided.evaluationIds` must match the actual projection
  at append time. `cites` remains a list of stored events; evaluated response IDs
  must be included. Assisted/unknown responses can also support a decision to
  gather evidence. Evaluation IDs are not phantom stored events.
- **Correction history.** Corrections preserve natural and semantic identity,
  validate the replacement using the same rules, and refuse existing dependencies.
  Projections accept an explicit sequence cutoff to reproduce what was known
  earlier. A result correction changes later reports without changing an earlier
  report requested at its original cutoff. Corrections of corrections are refused.
- **Exposure and scoring.** Protocol 1 normalizes captured answers with NFC,
  trim and lowercase, comparing against the single canonical word frozen in the assignment. Presenters cannot introduce aliases. Words
  and forms are canonical lowercase at this boundary. Assistance includes the
  frozen presentation and the individual response; spoken-word replay is not
  assistance. A new item/session cannot erase exposure within an assignment.
  Previous assignments' exposure remains visible but does not permanently exclude
  a word from future independent weekly measurements. Immediate recall is not
  labeled retained mastery.
- **Uncertainty remains visible.** Brier uses known eligible outcomes and reports
  coverage separately. A forecast before result entry does not prove it preceded
  the test: only a server-recorded date earlier than the parent-entered test date
  yields `before_test_date`; other cases remain `unverified`.
- **Fixed protocol, no instrument-selection change.** Protocol version 1 pins the
  data/scoring contract; this module does not select or launch a production room.
  Unknown protocol versions are refused. The pattern taxonomy is a draft for
  human review, not a claim of a validated spelling ontology.

## Red-test evidence

Initial commit-order suite: three failures before implementation:

1. Export returned `second, first` for reversed client clocks.
2. A timestamp-only retry threw `chart_event_conflict`.
3. Unknown payload fields were accepted (`expected function to throw`).

The initial eight spelling behavior tests failed to load because `spelling/record`
did not exist. Those tests covered scoring, temporal gates, assistance, atomic
priors, corrections, repeated exposure and three synthetic weeks.

Additional red/green regressions during implementation:

- Unknown-only evidence was refused by plan validation (`chart_plan_response`).
- Presentation word identity could be changed through a correction.
- Duplicate evidence IDs were accepted; the committed fixture was initially absent.
- A school-result correction could bypass assignment coverage.
- Round 1 permitted a response correction before a dependent decision. The reviewer
  correctly rejected its answer-replacement case; round 2 now asserts that
  replacement is refused and only reliability downgrades are allowed.
- Future protocol versions were silently scored, and multiple presentation
  citations could select the wrong source.
- A rolled-back prior batch logged a partial event as `[ok]`.
- CI's first branch-specific job verified review setup but not core acceptance.

Honesty note: the expanded schema matrix, concurrency and performance checks were
added after the initial core implementation and passed on their first run. They
are additional verification, not claimed as independently observed red-first
implementation evidence. This is a process deviation from the prompt's literal
“all 12 were red first”; the reviewer should assess it explicitly.

## Verification

All execution used Node **20.20.0** in a temporary repository copy, with family
`src/context` folders and `.env*` omitted, a clean temporary HOME/environment,
and macOS `sandbox-exec` denying external outbound network and writes anywhere under
`~/Development`. Existing dependencies were read through links; compiler and
Vite cache directories were local to the temporary copy. Two initial builds
failed because those caches still pointed into the protected dependency checkout;
the isolation was fixed, not weakened. Round 2 permits loopback only for the actual-server
HTTP test; external access remains blocked. No dependency installation was run locally.

- Root `npm run build`: server TypeScript, web TypeScript and Vite pass. Existing
  bundle-size, Lottie eval and browser-data-age warnings remain.
- `node node_modules/vitest/vitest.mjs run` with `chartFoundation`,
  `chartCommitOrder`, `chartSpellingCore`, `chartSpellingSchemas`,
  `chartSpellingLoad`, `chartKioskLifecycle`, `chartSpellingReview` and
  `chartKioskAcceptance` test files: **111 pass**.
- `node --test scripts/chart/reviewWorkflow.test.cjs`: **3 pass**.
- Three synthetic weeks exercise assignment → tags → priors → Discovery → cited
  plan → recall → forecast → parent result → next packet/report. They verify
  prior Brier/coverage, forecast Brier, history recurrence, and changed report/
  packet when a school result changes. This is module-level acceptance, not a
  browser or live-child run.
- Two subprocesses both attempt the same 100 responses: exactly 100 stored,
  no loss or duplicates. Foundation's separate 400-event process/rollback tests
  also pass.
- 10,000 events plus 20 measured `item.presented` appends: below the stated **250 ms maximum**;
  observed samples under 1 ms on this Mac. Response/plan write latency is not
  characterized by that test; this is not a production latency SLA.
- Committed `week1.events.json` is a synthetic fact log with fixed expected
  coverage and scores. It proves current reproducibility, not that future edits
  can never break compatibility. Protocol/version guards and the fixture must
  remain release checks.
- GitHub CI replaces the branch's setup-only check with build and relevant tests
  in a network namespace, without checked-out family context or credentials.
  The paid reviewer remains excluded for this branch. Remote results are reported
  separately after the push; no remote pass is implied by local success.

## Family data preservation

195 discovered `src/context` directories, 25,791 files across the local scan;
all per-directory hashes matched before and after. The complete local inventories
are in `/tmp/sunny-spelling-core-context-before.json` and
`/tmp/sunny-spelling-core-context-after.json`, not uploaded to GitHub. Round 2
rechecked every root with the same result; its inventory is
`/tmp/sunny-spelling-core-round2-context-after.json`.
Aggregate inventory SHA-256, both before and after:

`ebe6ac6e19ef1ecca0f457aa03d5ce674c6fae25c6bb87366b94b9aa6c185e65`

Original Sunny context remains 1,137 files, hash
`c3eff39f05f2f737f96277a890b469cfb21d54b09940847585f2e4a8d66bf44c`.
Existing foundation uncommitted work remains in its original checkout.

## Known gaps and human testing

No learning improvement for Reina is claimed from synthetic tests. They prove
that facts can close the measurement loop; improvement requires prospective
forecasts and returned school results across real weeks. The current kiosk still
uses legacy learning paths. Running it today does not exercise this new core.
Milestone 2's endpoint/room/Planner/UI integration and Milestone 3's activation
and deployment remain separate, explicitly excluded work.

The earlier human-reported evidence issues motivate these lab invariants:
per-response support and exact presentation identity are now checked rather than
inferred from activity summaries. Humans could see help or a wrong launched node;
summary logs and labs that tested only activity completion could miss those facts.
This module tests the fact boundary, not the future room's capture fidelity.
Duplicate TTS is a separate runtime issue and is not claimed fixed here.

Independent acceptance belongs to the existing Claude GitHub session, on the
exact SHA announced by `REVIEW READY`. No other AI reviewer is configured here.
No merge, deployment, provider calls, real ingestion or generation occurred.


## Round 2 review response

The independent review of `28feb23` found two blocking correction loopholes.
They were real defects: permissive corrections could replace a child's typed
answer or substitute forecast probabilities while retaining the earlier timestamp.
The original lab accepted answer replacement as a positive case, so logs reported
an allowed correction instead of exposing the evidence failure. The revised lab
now rejects those operations and checks legitimate downgrades separately.

Each behavioral fix went red before implementation and passed the relevant tests
and isolated server/web build afterward:

- Forecast correction after the test, before result entry: initially accepted;
  now every forecast correction is refused.
- Answer replacement and removal of help: initially accepted; now raw text is
  preserved or nulled, status only downgraded, and support can only be added.
- Decision correction and retagging after priors: initially accepted; now refused.
  New decisions use consecutive indexes; draft tags can change before priors.
- Presentation-specific alternate answers: initially accepted; protocol 1 now
  requires exactly the assigned canonical word, including presentation corrections.
- Unanswered audio-only resume: initially ineligible; now eligible. Earlier
  answers, instruction/help and practice still exclude a fresh Discovery reading.
  The tests include an earlier answer arriving after the resumed item opened.
- Citation DELETE/UPDATE: initially allowed; now blocked by schema-3 triggers.
  The earlier format is refused without altering its file. A repeated metadata-only
  scan of the local development roots and SunnyData found no real-child DB paths.
- CI omitted the actual-server acceptance and review regression files; its
  workflow test failed before both were added. Isolated networking permits only
  loopback for these HTTP checks. Four server-startup checks pass with synthetic
  data, no provider credentials, and external networking blocked.

No changes were made to the school-result product schema merely to close review.
The following questions are explicitly deferred for human/product review:

1. **Partial school tests:** current results must cover the assigned words. An
   explicit `not_tested`/partial-result design is needed before a parent-facing
   workflow can support subsets. Missing words must never be invented as failures.
2. **Test-date changes:** assignment `testDate` is the scheduled date; result
   `testDate` is the parent's actual date. They may differ when a test moves.
   Requiring equality would lose truthful evidence. A future UI should surface
   that difference; this module preserves both.
3. **Capitalization and alternative forms:** protocol 1 measures canonical
   lowercase single spellings. Proper nouns, capitalization and accepted aliases
   need an explicit instrument/assignment contract, not presenter discretion.
4. **Time zones:** the forecast label compares a server UTC date with the reported
   test date. A late-evening local forecast can conservatively remain `unverified`.
   It is not falsely marked prospective; exact local test timing remains future work.

Projection indexing and response/plan latency characterization remain known
performance work before larger-history integration, as noted by the reviewer.
No evidence is claimed for improved real-child learning from these simulations.

### Round 2 follow-up: chained-correction finding verification

The round-2 reviewer reported that a second response correction could remove
support or restore a downgraded reading. Two new regressions exercise those exact
sequences through the public append path. Both second corrections were already
rejected by `chart_correction_has_dependents`: the first correction cites its
target, and immutable citation rows protect it before the response comparison.
The initial assertions expected `correction_response_upgrade` and failed because
they received this earlier rejection; that is not a reproduced evidence bypass.
The tests now assert the actual dependency boundary and unchanged projected
assistance/unknown result. No production change is warranted by this reproduction.
These are additional safety regressions, not a red-green implementation fix.
The blocking finding is disputed pending the reviewer's reproduction or retraction.

Verification: all 113 scoped tests, including actual-server acceptance, and the
server/web build pass in the isolated offline copy. No production lines changed.
