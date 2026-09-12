# Math ingestion: supervised test readiness

Scope: `codex/adaptive-math-discovery-board`, 2026-09-05. This change hardens the existing intake and Discovery pipeline. It does not introduce another preview system, renderer, AI role, or mobile API.

## Verdict

**Ready for one supervised local paid ingestion followed by the existing `npm run sunny` Parent preview.** Production build, complete root/web suites, real browser acceptance, and independent review passed. No live-provider ingestion or parent acceptance was performed by this task. Parent acceptance remains a merge gate; unattended child use and remote-endpoint readiness are not established.

## What changed

- Ingestion, stale-draft recovery, and the targeted worker use one validated extraction codec. Existing valid raw extractions remain readable; new saves use the same envelope. Relocated uploads update their verified source path.
- Discovery and targeted planning share the original PDF/image attachment path. The exact attached bytes must match the frozen assignment hash. Weak OCR can still use the original document; empty text with no usable source stops before a paid call.
- The existing browser gate owns opening controls, frozen scoring, actual click/fill/drag journey, completion, and evidence-message validation. Full-journey failures and rendering exceptions now reach the same single repair attempt. Both 1365×768 and 1280×720 are checked. Diagnostics identify incorrectly visible hidden elements and obstructed controls.
- Browser success produces an acceptance report tied to actual HTML, frozen academic items, and verifier version. Publication checks that report against the bytes it will serve. Existing artifacts are locally reverified before reuse; they do not acquire fabricated proof.
- Discovery paid responses are saved before parsing. A stage receipt prevents a changed request from bypassing an uncertain previous call. Corrupt receipts stop for attention. SDK automatic retries are disabled for Discovery generation; uncertain outcomes are not automatically purchased again.
- The menu, direct ingestion, server, and worker share environment-file discovery. Intake checks the active child chart, source, identity collision, local output writes, credentials when new generation is required, and browser launch before paid work.
- `ingestMathAssignment` is callable without CLI argument parsing. Intake owns a child-level lock and saves operational state/checkpoint diagnostics. A living process keeps its lock even during long generation; dead-owner recovery is serialized.
- Publication has a durable journal and writes the launchable plan last. Recovery finishes the projections without rewriting the canonical cycle. Active cycles are preserved. Child-chart reads and Discovery evidence writes refuse to cross an unfinished publication.
- Explicit Skip messages retain `response_not_captured` while using the transport's empty-string representation. Missing answers are not turned into incorrect answers.
- Removed the obsolete targeted-ingestion summary/parser helpers and the second reviewed-HTML checkpoint authority.

## Reproduced failures and lab invariants

| Failure | Why the human/logs found it | Why the previous lab missed it | Regression |
|---|---|---|---|
| Extraction resumed into a different disk shape | The failure appeared across intake/archive/worker boundaries | Helpers used different fixture shapes | Shared codec and actual worker tests |
| Hidden pause overlay and later journey failure | A real playthrough exercised the blocked action; opening review reported success | Opening and complete-playthrough gates were separate | Real browser hidden-state test and full-journey repair test |
| Valid flat messages rejected; malformed messages accepted | Host and persistence behavior differed from the standalone verifier | Verifier fixtures omitted the endpoint's required metadata | Flat-message and persistence-contract browser tests |
| Skip could block completion | `null` failed the attempt endpoint's string contract | Existing Skip fixture sent an empty string | Host coordinator transport regression |
| Repeated paid request after an invalid response or interrupted checkpoint | A resumed ingestion had to reconstruct a missing parsed checkpoint | Parsed checkpoints were tested, raw paid receipts were not | Invalid/corrupt/uncertain receipt tests and intake acceptance interruption |
| Original PDF omitted from Discovery / mutable source path | Boundary review found Discovery received only text while targeted planning received the document | Existing PDF delivery tests covered targeted planning only | Native-PDF Discovery request, blank-source refusal, relocated-source and changed-byte regressions |
| Old lock stolen from living worker; dead worker delayed restart | These require process-lifetime conditions | Normal acquire/release tests used fresh timestamps | Live/dead-owner lease regressions |
| Publication interruption stranded projections | In-memory rollback cannot survive process exit | Prior tests only covered ordinary publication | Durable-journal recovery and pending-evidence fence tests |
| Existing files trusted as readiness | Logs proved file existence rather than current acceptance | Fresh artifacts dominated the lab | Changed-byte reuse and publication-proof rejection tests |

The new `mathIngestionAcceptance.test.ts` calls the real ingestion entry point with a mocked SDK, actual Chromium, synthetic files, and the real persistence layer. It interrupts the builder checkpoint after the response is saved, resumes without repeating that request, repairs a synthetic pause-overlay defect, publishes, then reruns without another provider call or canonical-cycle change. No child runtime records are used as fixtures.

## How to test

1. Run `npm run sunny` in this worktree with your intended context/environment.
2. Use the existing math ingestion option. Reuse the assignment and saved checkpoints; do not use `--fresh` merely because the previous run stopped.
3. Wait for `Done — DISCOVERY READY`. If it stops, retain the printed phase, reason, and checkpoint path.
4. For your wife's playthrough, choose **Start child session → Math → Parent preview (records nothing)**.
5. Try correct, incorrect, Help, Skip, every response mode, completion, exit, and reopen. Independently inspect whether each question and diagram actually measure the intended mathematics.
6. Report the activity/question, action, expected behavior, actual behavior, and screenshot for each failure.

Parent preview exercises usability without recording her answers as the children's learning evidence. It does not itself advance the canonical academic cycle; the isolated automated journey covers persistence and calibration. Ingestion itself remains a write operation in the selected context.

## Explicit limits

- Live provider availability, output quality, cost, and parent acceptance remain unverified. Preflight cannot guarantee a remote provider will accept a request.
- An ambiguous paid outcome stops for attention. Explicit `--retry-uncertain` permits retry only of the same pending request and may charge again; do not use it automatically.
- A damaged previously published activity is rejected, not silently replaced or historically rescored. The reported unpublished Day22 candidate follows the new repair path.
- A crash while holding the temporary reclamation directory stops with its path for attention; automatic recovery from every filesystem crash point is not claimed.
- This is recoverable local file publication, not a distributed database transaction. Remote upload authentication, durable scheduling, client polling/cancellation, and cross-host ownership remain future API work.
- Browser verification does not establish educational validity, long-term learning gains, or voluntary child engagement.

## Release gates

| Gate | Result |
|---|---|
| Production build | Passed |
| Complete root suite | Passed: 3,038 tests / 280 files |
| Complete web suite | Passed: 782 tests / 100 files |
| Real intake → interrupted checkpoint → receipt reuse → browser repair → publication → repeat | Passed with mocked SDK and actual Chromium |
| Real host/iframe journey through targeted generation, progression, returned-work calibration, next Planner request | Passed with mocked providers and isolated synthetic records |
| Independent review and re-review | Passed for supervised local trial |
| Protected family records | 1,445 files byte-identical across both worktrees; no additions or removals |
| Live paid provider run | Not run |
| Wife/parent acceptance | Not run |
| Remote endpoint / merge | Not released |

Logs and reviewer conclusions are retained under `outputs/ingestion-gate/`. All build/test commands ran in a disposable isolated checkout; no test was run against the canonical family directories.
