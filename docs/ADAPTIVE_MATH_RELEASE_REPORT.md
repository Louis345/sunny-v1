# Sunny Adaptive Math release report

Latest ingestion-specific readiness and limits: [Math ingestion test readiness](MATH_INGESTION_TEST_READINESS.md). Earlier gate results below do not establish live-provider or remote-endpoint reliability.

Branch: `codex/adaptive-math-discovery-board`. Baseline: `5db52ea`. Date: 2026-09-05.

**Verdict: not ready to merge until the pending release gates are completed.** Implementation and automated acceptance are separate from parent assessment-validity review and evidence of long-term learning or voluntary engagement.

## Changes and reproduced failures

| Boundary | Reproduced failure | Regression protection / result |
| --- | --- | --- |
| Background generation | First node had no canonical artifact binding; predictions and measurement roles were absent while work began | Actual worker tests preregister the full existing canonical program and bind verified artifacts before job readiness. |
| Interrupted publication | A `board_ready` job concealed missing binding; projection failure downgraded completed generation | Restart reconciles saved artifacts without another generation call. Publication errors retain completed generation. |
| Concurrent learning | Late siblings reset academic lifecycle; stale final plans dropped Support; asynchronous Support used a stale revision | Worker and generator tests preserve canonical additions/completion and check the current unchanged contract before binding the latest revision. |
| Browser proof | Fabricated passing reports; generated completion hooks bypassed broken controls; on-load evidence passed decorative controls | Real click/fill/drag journeys at 1365×768 and 1280×720; early evidence, missing controls, errors, incomplete playthrough, and inaccessible actions fail. Hash/version proof is recorded. |
| Retry / resume | Rejected saved candidate did not consume the remaining bounded repair attempt; stale canonical proof was retained | Existing bounded generation retries are reused; unchanged approved candidates are locally verified/rebound without paid regeneration. |
| Prediction evaluation | Earlier Discovery and separate source batches contaminated outcome matching; ambiguous legacy eligibility was inferred | Explicit source/window eligibility, strictly post-registration observations, source-separated batches, practice/assistance/exposure exclusions, and observational—not causal—attribution. Existing IDs and records are preserved. |
| Discovery completion | Friction was not joined to saved attempts; rating/engagement delivery could gate academic completion | Friction reaches canonical attempts; academic completion waits for answer writes and proceeds independently of rating and its delivery. Skips remain uncertainty. |
| Discovery validity | Question supplied its own answer; diagram scale disagreed with accepted answer | Synthetic cases retained in `src/scripts/fixtures/adaptiveMathRelease.ts`. Planner receives academic chart history separately from engagement and owns frozen representation specifications. **Browser success does not establish educational validity.** |

The human caught these issues by using the whole child journey. Prior logs proved individual generation/scoring events, not rendered control usability, canonical publication, or temporal eligibility. Prior tests mostly covered helpers or trusted generated hooks; they did not exercise the complete host/iframe/API boundary or concurrent publication. Every confirmed implementation bug above now has regression coverage. The synthetic graph fixtures are examples for separate assessment review, not automatic repairs to historical child records.

## Automated journey

`npm run test:math-release` uses the actual React host, iframe routes, learning APIs, canonical repository, and generated-artifact browser verifier. Only providers, synthetic chart adapters, background scheduling, and non-math companion services are mocked. It opens Discovery, records correct/incorrect/skipped responses and reading friction, fails engagement delivery, reopens during generation, plays the first ready node through click/fill/drag while a sibling prepares, evaluates fresh evidence, traverses explicit Planner Support/Quest/Boss decisions, awaits calibration, confirms returned work twice, and inspects the next related-assignment Planner request for prior evidence.

All records are created under a temporary synthetic context. Provider credentials are blanked for the test. Browser requests outside localhost are blocked. Actions and execution have finite limits. Failure output contains the step, screenshot, browser errors, canonical evidence IDs, generation state, and Playwright trace. Normal reruns require no paid provider calls.

Artifacts: `outputs/math-release-acceptance/report.json`, `journey.zip`, and screenshots. Build/test logs, red-test diagnostics, family hashes summary, and line counts are retained in `outputs/math-release-evidence/`. The complete suites run in a disposable archive of the branch, with the implementation copied in and family runtime changes excluded.

## Release gates

| Gate | Status |
| --- | --- |
| Production build | Passed on final implementation snapshot |
| Complete root and web suites | Passed: 2,989 root tests and 781 web tests; final cleanup change additionally passed all seven focused verifier tests; the final Planner graph-contract regression passed separately |
| Mocked-provider browser acceptance | Passed: complete host journey plus seven browser-verifier tests (8/8), with actual click/fill/drag actions |
| Independent code review | Passed after six findings were fixed and rechecked |
| Original Sol task review | Not completed: interrupted by separate user input in that task |
| Canonical family files | Passed: 1,445 files across both worktrees byte-identical at verification |
| Live-provider acceptance | Not run; no paid generation authorized |
| Parent-operated isolated acceptance | Not run |
| Parent assessment validity review | Not run |
| Merge / publish | Not performed |

## Parent acceptance

Run `npm run test:math-release:parent` from this branch's worktree. It opens a visible, isolated browser and prints the required math actions in the terminal. It waits for your Discovery, targeted, Support, Quest, and Boss interactions; returned-work upload/confirmation and evidence checks remain automated. Each interaction has a three-minute limit. The same temporary synthetic records and mocked providers are used. This mode has not yet been operated by the parent and must not be reported as passed.

Separately review the visible question, graph, scale, accepted answers, and whether each item actually measures the intended operation. A mechanically passing journey cannot answer that educational question. Existing published family experiences and historical evidence were not automatically rewritten.

## Scope and remaining work

No new production AI role, math renderer, or generation pipeline was introduced. The obsolete unreachable targeted-generation block in ingestion was removed; production TypeScript changes total **-65 net lines** (tests and fixtures excluded). New lines establish verification, publication, and evidence invariants; test-only fixtures and this report add no production path.

Long-term learning improvement and voluntary engagement remain outcomes to measure after release. Spark Orb, new games, visual redesign, and engagement-system expansion remain outside this milestone. Do not merge while a required gate above is failed or not run.


## Paid-ingestion blocker follow-up — 2026-09-05

The skeptical follow-up found two remaining evidence defects despite the earlier passing journey: Quest eligibility admitted practiced/repeated success, and canonical math completion trusted generated correctness. These are now covered by adversarial regression cases, not just a successful browser playthrough.

Canonical math scoring now compares captured answers to the frozen Planner response contracts. Missing/malformed responses, explanations without independent rubric interpretation, and legacy missing contracts remain unscored. Duplicate item rows cannot turn a retry into a fresh response. Duplicate option IDs and missing/duplicate next-instrument contracts are rejected. Support, Quest and Boss carry frozen Planner items through the existing pipeline. The duplicated item parser was replaced by the existing shared parser. The learning contract is version 9.

Focused independent review passed. Final automated results for this follow-up: **passed** — production build, 3,013 root tests (278 files), 781 web tests (100 files), full mocked-provider browser acceptance, 22 adversarial evidence regressions and focused independent review. All 1,445 family files across both worktrees remain byte-identical to this follow-up task’s starting snapshot. Evidence is in `outputs/paid-math-gate/`.

**Ready for one paid ingestion and parent preview trial.** This verdict does not mark the branch merged or the unrun live-provider and parent review gates passed.

For the paid trial, use the existing `npm run sunny` workflow on this branch and choose **Parent preview (records nothing)** when your wife tests. No new preview system is needed. Preview checks the visible experience; isolated automated acceptance checks actual persistence/calibration. Do not interpret a preview completion as a saved child observation.

Parent review checklist:

1. Read the question and diagram before answering. Confirm scale, labels, intended operation and correct answer agree.
2. Try a correct answer, a wrong answer and recovery; try Help and Skip where offered. Check that feedback is honest.
3. Exercise every response mode, the final question, completion and exit. Look for trapped screens or lost controls.
4. Leave and reopen the board; verify preparing and ready states are believable. Preview inspection does not itself advance the academic cycle.
5. Note the activity title, exact question, action taken, expected result and actual result; capture a screenshot for each bug. Each confirmed bug must become a lab regression before child use.

A paid ingestion includes provider generation work; later completion-triggered targeted planning can incur additional provider calls. No paid calls have been executed by this task. Parent preview findings and paid-provider behavior remain unverified until your trial. Automated gates permit a bounded parent trial, not a claim that the product is bug-free or ready for unsupervised child use.
