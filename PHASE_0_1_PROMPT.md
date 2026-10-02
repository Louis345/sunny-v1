# Codex prompt: Sunny chart rebuild, Phase 0 and Phase 1

## Setup

1. Get the spec into your working branch:
   ```
   git fetch origin claude/youthful-cori-jgsthu
   git show origin/claude/youthful-cori-jgsthu:SUNNY_CHART_REBUILD_SPEC.md > docs/SUNNY_CHART_REBUILD_SPEC.md
   ```
2. Read completely: `docs/SUNNY_CHART_REBUILD_SPEC.md` and `AGENTS.md`.
3. Base your branch on the branch Saori's kiosk currently runs. If you don't know which branch that is, ask the human. Commit and push to the branch the human names.

## How this works

- **You run on the human's dev Mac. The real chart lives on Saori's computer.** You cannot and must not access Saori's data. Real-child data is never created, read or written on this Mac by the new code.
- The current kiosk keeps running the old system for UX testing. **Nothing in this work may change kiosk behavior.** The new module is added alongside and is not wired in.
- Never modify, move or delete anything under any `src/context/` folder. Record a checksum inventory of `src/context/` before you start and compare it at the end.
- No paid provider calls. No ingestion or generation runs.
- Follow `AGENTS.md`: tests first (red, then green), logs in the format ` 🎮 [component] [action] [result]`, no silent failures.

---

## Phase 0: Saori reset script (you write it; the human runs it on Saori)

Write `scripts/chart/phase0-saori.sh`, a bash script for macOS.

**Default is a dry run.** It only prints. With `--apply`, it performs the steps below. It never deletes, moves or edits any existing file.

It must:
1. **Print environment facts:** hostname, macOS version, `node --version`, `npm --version`, and whether `sqlite3` exists on the command line.
2. **Find the live kiosk:**
   - list running `node` processes;
   - for each one, print its working directory (`lsof -a -p PID -d cwd -Fn`) and any `SUNNY_CONTEXT_ROOT` visible via `ps eww -p PID`;
   - print every `src/context/` folder found under `~/Development/*/` (and any `SUNNY_CONTEXT_ROOT` found), with its file count and latest modified time.
3. **Choose the archive source.** The source is a path argument (`--source <dir>`). If none is given, print the candidates and stop: never guess.
4. **With `--apply`:**
   - create `~/SunnyData/` (mode 700) and `~/SunnyData/archive/`;
   - archive the source into `~/SunnyData/archive/sunny-context-<host>-<timestamp>.tar.gz`;
   - write a sha256 manifest of every archived file next to it;
   - verify the archive by listing it and comparing file counts with the source;
   - print the archive path, size, file count and manifest path.
5. **Exit non-zero** with a clear message on any failure. Never leave a partial archive that looks complete: write to a `.partial` name and rename it only after verification.

Add a short test that runs the script against a temporary fake home directory, with a fake source, in both dry-run and `--apply` modes. The test must show that nothing in the source changed.

**Then STOP.** Commit and push. Tell the human to:
1. pull on Saori;
2. run `bash scripts/chart/phase0-saori.sh` (dry run) and paste you the output;
3. run it with `--apply --source <the live context dir>` after reviewing the output, and paste that output too.

**Do not start Phase 1 until the human has pasted the Phase 0 output.** You need Saori's Node version from it to choose the SQLite library.

---

## Phase 1: The chart database (built on the Mac, practice children only)

The human approves Phase 1 as a defined milestone. Work through it without stopping for approval, as long as you stay inside the scope below.

### Library choice
- If Saori's and this Mac's Node versions both support built-in `node:sqlite` without experimental flags, use it.
- Otherwise use `better-sqlite3`.

State which you chose and why.

### Files (new module: `src/chart/`)
- `db.ts` opens the database for a child:
  - one file per child, `<chartDir>/<childId>.db`;
  - WAL mode, a busy timeout, and a `schema` table with the version.
- `events` table:
  - columns: `event_id` (PRIMARY KEY), `child_id`, `type`, `occurred_at`, `recorded_at`, `actor` (`child|parent|planner|creator|system|room`), `cites` (JSON array), `payload` (JSON);
  - triggers that **abort any UPDATE or DELETE** on `events`.
- `appendEvent.ts` is the **only** write path:
  - It validates the event envelope, the actor, that `type` is in the registry, and that every ID in `cites` already exists in that child's database.
  - It is idempotent. The same `event_id` with identical content is a no-op that returns the stored event. The same `event_id` with **different** content throws `chart_event_conflict`.
  - It logs ` 🎮 [chart] [append] [ok|duplicate|rejected] child=… type=… id=…`.
- `eventId.ts` provides `eventId(type, naturalKey)`, a deterministic sha256-based ID.
- `eventTypes.ts` is the registry of the event types in spec section 4, plus the engagement and learner events from sections 8–9.
  - Phase 1 validates the envelope and requires `payload` to be an object.
  - Per-type payload schemas are added in Phase 2, but `child.profile_set` and `assignment.ingested` get real validators now, as the pattern for the rest.
- `buildChart.ts` exports `buildChart(childId, opts)`, a **pure function of the events**:
  - Phase 1 output: the child ID, event count, latest profile (from `child.profile_set`), assignments (from `assignment.ingested`) and the last event time.
  - The same events always produce the same chart.
- `guard.ts` decides where real children's charts live:
  - Real children are `ila` and `reina`. Their chart directory comes only from `SUNNY_CHART_DIR`.
  - Opening a real child's chart **must refuse** if `SUNNY_CHART_DIR` is unset, or if the resolved directory is inside a git working tree (walk up looking for `.git`).
  - On refusal, log ` 🎮 [chart] [open] [refused] child=… reason=…` and throw.
  - Synthetic children (any other ID) may open in any directory, including temporary test directories.
  - On a successful open, log ` 🎮 [chart] [opened] child=… path=… events=N`.
- `cli/export.ts` (`npm run chart:export -- <child> [--json]`) prints every event in order, readably, or as JSON.
- `cli/snapshot.ts` (`npm run chart:snapshot -- <child> --out <file>`):
  - makes a consistent copy using SQLite's backup API, plus `<file>.meta.json` recording source host, source path, snapshot time and event count;
  - `buildChart` and export can open a snapshot read-only via `--snapshot <file>`.

Add only the two npm scripts and, if needed, the dependency to `package.json`. Change no other existing files.

### Tests (write first and confirm they fail, then implement)
1. Writing an event, then reading it back via export and `buildChart`, works for a synthetic child in a temporary directory.
2. A direct SQL UPDATE or DELETE on `events` fails.
3. A duplicate identical event is a no-op, and the count is unchanged.
4. A duplicate `event_id` with different content throws `chart_event_conflict`.
5. An event citing a missing event ID is rejected.
6. An unknown type or bad actor is rejected.
7. `buildChart` is deterministic: the same events give a deep-equal chart, regardless of insertion timing.
8. The guard refuses `reina` when `SUNNY_CHART_DIR` is unset, and when it points inside a git working tree. It allows `reina` in a temporary directory outside any git tree, using a temporary path in tests only and never a real home folder. It allows synthetic children anywhere.
9. **Two separate processes** appending concurrently, 200 events each, to the same child database results in 400 events, no errors and no corruption.
10. A snapshot opens read-only, its meta file is correct, and writing to it fails.
11. Nothing under `src/context/` changed (inventory comparison).

### Definition of done
- `npm run build` passes; the new tests pass; the existing test suite is still green; `git diff --check` is clean.
- No existing runtime file imports `src/chart/` yet. It is not wired into the kiosk.
- The `src/context/` before and after inventory is identical.
- One read-only second-agent review of the diff against `AGENTS.md` and the spec.
- Commit, push, and report:
  - the library choice;
  - files added;
  - red tests and their initial failures;
  - final results;
  - anything in the spec you think is wrong or unclear (push back rather than guessing).

## Out of scope (do not do)
- Wiring the new chart into the kiosk, ingestion, Planner or boards.
- Migrating or importing any old data.
- Changing `LEARNING_FEEDBACK_LOOP.md` or deleting old stores. That happens in later phases.
