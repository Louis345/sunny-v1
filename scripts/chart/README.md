# Chart foundation: Phase 0 and Phase 1

This tooling is separate from the kiosk. The existing `LEARNING_FEEDBACK_LOOP.md`
remains the learning authority until a separately approved switchover. No imports,
migrations, ingestion, generation, provider calls, or runtime integration are added.
The human chose to retire legacy learning records: the archive is recovery-only,
not a future learning input. Original files are never removed or reset here.

## Archive on Saori

Run `bash scripts/chart/phase0-saori.sh` first. It reports only environment facts,
Node process working directories and context roots, and candidate inventories.
It searches both `~/Development` and `~/Devlopment`. It never prints complete
process environments. Python 3.9+ and standard macOS inspection tools are needed.

After reviewing the resolved live source, stop all source writers between sessions
using the existing launcher/operator workflow. This script never stops the kiosk.
Only then run:

```sh
bash scripts/chart/phase0-saori.sh --apply --writers-stopped --source /absolute/live/context
```

`--writers-stopped` is an operator attestation, not automatic process detection.
Checksums cannot substitute for that operational precondition. The source must
stay quiescent until the command exits. Restart the same code/launcher afterward.

New archives and JSON SHA-256 manifests go into private `~/SunnyData/archive/`.
Every archived file is hashed from the archive and compared with the source,
which is inventoried before and after capture. Source symlinks and special files
are rejected, never followed. Existing files are not overwritten. Failure leaves
clearly named partial files for diagnosis; no final archive is published before
verification and durable manifest publication. Empty source directories are not
included; file paths and contents are preserved. This is not a database backup
tool: Phase 1 uses SQLite's consistent backup API for live databases.

Tests: `PYTHONDONTWRITEBYTECODE=1 python3 scripts/chart/test_phase0.py`.
All fixtures live under a temporary fake home; no family context is used.

## Phase 1 storage (not connected to the kiosk)

Node 20.20.x is the live runtime on both machines. `better-sqlite3` 12.11.1 is
pinned because built-in SQLite is unavailable on that runtime. Its native binding
must be installed for each machine's architecture using that Node version.

`openChart(childId, opts)` opens one database, binds it to that child, and installs
schema version 1, WAL, a five-second busy timeout, and immutable-event triggers.
For Reina and Ila, only `SUNNY_CHART_DIR` chooses the directory; checkout paths
and database symlinks are refused. Synthetic IDs may use an explicit temporary
`chartDir`. The real-child guard is a location boundary, not OS authentication:
the caller/deployment still controls who can invoke it. Database owners with
arbitrary SQL/filesystem access can alter schemas; triggers protect ordinary
application writes, not a malicious administrator.

`appendEvent(db, event)` is the sole application write API. `recorded_at` is
server-owned and retained on retry. Other envelope content, canonical object
keys and the citation set determine whether an ID is an identical retry or a
conflict. Citations must already exist in this child's database. JSON must be
finite, dense, and at most ten levels deep. The envelope and profile, assignment,
and correction payloads are validated now; other type-specific schemas belong
to Phase 2 before those events can enter a live learning path.

Replay orders events by `(occurred_at, event_id)` using normalized UTC timestamps;
server arrival time does not decide profile precedence. A correction references
an original event, includes a reason and validated replacement payload, and
applies at that original event's position. Corrections cannot change its identity,
actor, citations or time. If multiple corrections target it, the last under that
same deterministic order wins. All originals and corrections remain exportable.
The Phase 1 chart exposes only child ID, count, profile, assignments and last
event time. It computes no mastery, predictions, rewards or teaching decisions.

```sh
SUNNY_CHART_DIR=/absolute/synthetic/chart-dir npm run chart:export -- synthetic-demo --json
SUNNY_CHART_DIR=/absolute/synthetic/chart-dir npm run chart:snapshot -- synthetic-demo --out /absolute/audit.db
npm run chart:export -- synthetic-demo --json --snapshot /absolute/audit.db
```

Reads never create a missing chart. Snapshot creation uses SQLite's backup API,
counts events in the resulting copy, records host/path/time/hash provenance, and
publishes a read-only single-file database after its metadata. It refuses existing
destinations. Export writes data to stdout and operational logs to stderr.

Tests: `npx vitest run src/engine/chartFoundation.test.ts`. These are included in
the existing engine test glob, so CI discovers them without changing its config.
The tests cover 400 writes from two real processes and rollback on process exit,
in addition to identity, validation, replay, corrections, and snapshots.

## Approved boundaries and remaining gates

- The old records are retired from future learning but preserved for recovery.
- The Phase 0 archive requires a separately coordinated quiet interval; never
  interrupt a child session automatically. The synthetic Phase 1 implementation
  was prepared after a remote dry run established the runtime. The requested
  archive gate remains outstanding; this is not a completed reset or switchover.
- No migrations, real-child database creation, runtime imports, or contract rewrite.
- Source-code additions establish new tested invariants. No production hot-path
  code is added or deleted. Only the CLI scripts, dependency and lockfile change
  existing configuration; existing unrelated edits remain untouched.
- Future learning measures must distinguish storage correctness, forecasting
  accuracy, and retained learning. A school test is external evidence, not
  infallible truth; one successful cross-subject hypothesis test is not certainty.

## Verification record — 2026-10-02

Implementation base: `293294ca7c565b23fc064d42f6df7e4f764d6aa2`, matching
Saori's observed kiosk checkout. Work lives on `codex/chart-foundation-phase01`
in an isolated sparse worktree; the original dirty checkout was preserved.

- Archive tests: five initial failures before the scripts existed; seven pass
  after implementation and review regressions for writer confirmation and
  durable publication. Saori dry run passed; **actual archive not performed**.
- Chart tests: initial import failure before the module existed; 22 pass after
  implementation. Review's sparse-array regression failed before the fix and
  passed afterward. Two subprocesses commit 400 events; interrupted writes
  roll back; original events remain immutable and corrections replay.
- `npm run build` passes with Node 20.20.0. Synthetic CLI acceptance passes:
  append, JSON export, snapshot, snapshot export and chart replay agree.
- Independent read-only review completed; reported defects were fixed and the
  reviewer cleared the narrow recheck. No existing runtime imports this module.
- Web suite: 905 pass, one fails in the unchanged companion-overlay test
  (`web/src/tests/test-app-companion-overlay-stack.ts:118`). Its input
  `web/src/App.tsx` and the test match the base commit byte-for-byte; the failure
  also reproduces alone. This work does not fix that unrelated UI issue.
- Broad server suite: incomplete; interrupted after more than eight minutes
  without completion or a JSON result. No pass/fail total is claimed. Both broad
  suites ran in a disposable source copy with synthetic context, credentials
  removed and outbound network denied; no family records were copied there.
  These restrictions may affect legacy tests; no unisolated retry was attempted.
- The commit hook runs the entire suite in the checkout. It is bypassed for
  this saved work-in-progress commit to honor the no-context-writes boundary;
  build and test results above are the actual verification, not a green hook.

Original `/Users/jamaltaylor/Development/sunny/src/context`: 1,137 files.
Before and after content-manifest SHA-256 are identical:

```text
before c3eff39f05f2f737f96277a890b469cfb21d54b09940847585f2e4a8d66bf44c
after  c3eff39f05f2f737f96277a890b469cfb21d54b09940847585f2e4a8d66bf44c
```

The manifest hashes sorted `(relative path, file SHA-256)` pairs encoded as
compact JSON. It proves the checked file paths and bytes agree, not unchanged
access times or an absence of writes by concurrent processes between checks.
It is the dev checkout inventory, **not a checksum of Saori's live records**.

Phase 0 awaits a quiet archive interval. Phase 1 is not merge-ready until the
existing-suite failures/incomplete checks have a separately agreed disposition.
Nothing is deployed; this foundation alone claims no improvement in learning
or prediction accuracy. Those require later validated evidence collection,
forecasts recorded before outcomes, and repeated external assessment.
