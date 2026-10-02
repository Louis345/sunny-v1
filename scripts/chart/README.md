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
