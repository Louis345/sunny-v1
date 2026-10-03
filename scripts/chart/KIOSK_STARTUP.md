# Chart connection at kiosk startup

Implemented after the separately approved Phase 0/1 foundation. This change is
ready on the development branch and has not been installed on Saori.

## What changes

The kiosk server opens the declared chart before it starts accepting requests.
With a selected child it opens that child's file; a family picker launch opens
`ila.db` and `reina.db`. An unset directory or a refused/corrupt database stops
startup with a visible error. It never silently chooses a checkout-local file.

Preview, diagnostic, stateless, test, demo and certification runs do not open
these writable charts. Configured ordinary servers also open the charts;
unconfigured non-kiosk development servers retain their existing behavior.
The server owns each connection and closes it on shutdown. Partial startup
failure closes already-opened connections. Cleanup failures are logged and
reported as failures.

This is a database connection, not the learning-store switchover. Startup creates
no profile, assignment, session, response, prediction or decision event. Existing
learning paths still use their existing storage. No old conclusions are imported.

## One-time installation on Saori

Installation and restart require lifting the earlier explicit no-deployment
instruction. Before installation, preserve the existing checkout and launcher,
verify the actual active checkout, and wait for a quiet interval. At the latest
read-only preflight the kiosk checkout was
`/Users/jtaylor/Devlopment/sunny-opus55-test`, commit `293294c`, using Node 20.20.2.
Do not overwrite its local dependencies or reset its checkout as a shortcut.

Install the reviewed branch and its pinned `better-sqlite3` dependency for
Saori's Node version and architecture. The existing install script also downloads
companion assets; dependency installation should preserve those existing assets
and avoid running unrelated lifecycle scripts. Configure the launch environment
(or the `.env` loaded by the launcher) once with:

```text
SUNNY_CHART_DIR=/Users/jtaylor/SunnyData
```

No separate database service needs starting. Subsequent ordinary kiosk launches
open the database automatically. Keep the existing `SUNNY_CONTEXT_ROOT` setting
because the learning-store migration has not happened.

After installation, confirm the startup log includes `[chart] [opened]` with the
expected child/path and `[chart] [startup] [connected]`. The server also exposes
`GET /api/chart/status`; a connected result is:

```json
{"connection":"open","children":["reina"],"learningEventsConnected":false}
```

A family-picker launch lists both children. `learningEventsConnected: false` is
intentional and must not be described as a complete learning database integration.
Opening the kiosk alone will not populate learning events yet.

## Verification

- Initial tests failed because the lifecycle module was absent.
- A close-error regression failed before the connection status reported `failed`.
- Independent review caught missing legacy stateless/test/demo flags. All three
  regression cases failed before reuse of `shouldPersistSessionData()` fixed them.
- 15 lifecycle checks and 4 actual-server acceptance checks pass. The latter use
  an invented child and a temporary source copy: connection before HTTP readiness,
  truthful status, zero manufactured events, clean shutdown, refused missing
  configuration, and preview/stateless non-creation.
- Combined chart, startup, kiosk-launch, runtime-mode, readiness and shutdown
  checks: **74 passed, zero failed**, in an isolated copy with outbound networking
  blocked except loopback. Build and whitespace checks pass. Independent review
  cleared the final change. No provider calls or real ingestion/generation ran.
- The earlier full 3,956-server/906-web run belongs to the completed Phase 0/1
  commit. This startup extension was verified with the relevant 74-test run;
  another full repository run is not claimed.
- Original development context: 1,137 files; before/after SHA-256 both
  `c3eff39f05f2f737f96277a890b469cfb21d54b09940847585f2e4a8d66bf44c`.
  No real-child database was created on the development Mac.

The server entry point adds connection ownership, one factual status endpoint,
and logged shutdown failures in place of swallowed cleanup errors. New source
lines implement this requested lifecycle invariant; no teaching or measurement
algorithm, math module, provider call or learning-contract change is introduced.
