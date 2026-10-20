# Phase 0/1: tomorrow’s check

Update: the subsequently requested [kiosk startup connection](KIOSK_STARTUP.md)
is implemented but awaits installation on Saori. Until then, her kiosk still uses
the previously installed code. Even after installation, this connection alone
does not switch the learning-event storage.

This milestone provides a verified recovery archive and a separate append-only
chart foundation. It does not change Reina’s kiosk, teaching, predictions, or
school-test readiness. No new child-facing screen is expected yet.

## Five-minute review

1. Open [the synthetic event history](/Users/jamaltaylor/SunnyData/phase01-review-20261002/events.json).
   It contains two events for `synthetic-tomorrow-demo`: an original profile and
   a correction. The original typo, `Practice Chlid`, remains visible. An identical
   retry created no third event.
2. Open [the derived chart](/Users/jamaltaylor/SunnyData/phase01-review-20261002/chart.json).
   It shows `Practice Child`, derived from the correction, and an event count of
   two. The files contain invented test data only.
3. The [read-only snapshot](/Users/jamaltaylor/SunnyData/phase01-review-20261002/audit.db)
   is the database copy used for replay. Its [metadata](/Users/jamaltaylor/SunnyData/phase01-review-20261002/audit.db.meta.json)
   records source location, host, time, event count, and checksum. The source path
   identifies the original temporary test database, not this review folder.
4. Read the final verification section of [the report](README.md). Check that the
   full server suite, web suite, build, archive checks, and independent review
   passed. A focused pass alone must not be mistaken for a green full suite.

## Optional repeatable acceptance check

Run these commands in Terminal on this development Mac. They use installed
packages, synthetic temporary data, and a fake child command; they do not ingest
homework, contact providers, or start a real child session.

```sh
cd /Users/jamaltaylor/Development/sunny-chart-foundation
export PATH="/Users/jamaltaylor/.nvm/versions/node/v20.20.0/bin:$PATH"
PYTHONDONTWRITEBYTECODE=1 python3 scripts/chart/test_phase0.py
node node_modules/vitest/vitest.mjs run src/engine/chartFoundation.test.ts src/scripts/sunnyMenuTerminalAcceptance.test.ts src/server/sessionToolNames.test.ts src/tests/test-session-manager-lines.ts
```

Expected: **7 archive checks and 26 TypeScript checks pass**. The terminal check
exercises input handoff, a fake confirmation, return to the menu, and Exit. It also
proves a stuck synthetic child is killed and reaped. The chart checks cover
immutable originals, correction replay, conflicts, citations, concurrent writes,
crash rollback, and read-only snapshots.

This is sufficient to review the foundation. Testing improved teaching with Reina
requires the later evidence-schema and live-integration milestone; that work is
not implemented or authorized by this milestone. Nothing here needs deploying to
her computer for this acceptance check.
