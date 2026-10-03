# Prompt: Same Sunny, new spelling plumbing (Monday-ready)

## Guiding rule (overrides everything else)

**The child's experience must be identical to what the girls have been using. Only the plumbing changes.**

The same launcher, kiosk, board, companion, Word Radar, games, flow, look, sounds and timing. Any visible change for the child is a **blocking** finding, unless it is one of the listed bug fixes, which restore intended behavior. The only new screen allowed is a **parent page**, reached from the existing parent/caregiver area and never shown in the child's flow.

## Goal and deadline

The kids got their spelling list on Friday. By **Monday**:
1. Sunny runs on Saori (the family computer), exactly as the girls know it, waiting for a session.
2. Every spelling answer from the existing activities is recorded correctly in the child's SQLite chart.
3. The parent can enter school results and see the report card.
4. The known live-session spelling bugs are fixed.

## Context
- Repository: `/Users/jamaltaylor/Development/sunny-chart-foundation`. Base the new branch `codex/spelling-plumbing` on `codex/spelling-chart-core` @ `53214e2`. Open a **draft PR** into `codex/spelling-chart-core` in `louis345/sunny-v1`.
- **Reuse, don't rebuild:**
  - the chart database and guard;
  - the typed spelling facts (`src/chart/spelling/schemas.ts`, `relations.ts`, `record.ts`);
  - the pure projections (evaluations, report card, Planner packet);
  - `checkpointedAttempt.ts`, the schema-tool Planner transport (`provider.ts`), the profile draft adapter, and the Saori backup and installation work.
- Read first: `AGENTS.md`, `LEARNING_FEEDBACK_LOOP.md`, `scripts/chart/SPELLING_CORE.md`, `scripts/chart/SPELLING_KIOSK.md`.
- The human authorizes this milestone as an **autonomous milestone** (`AGENTS.md` Autonomous Milestone Mode), including deleting the code listed in Part B and installing on Saori after review acceptance.
- Production provider calls during real sessions are allowed, as before. Verification uses recorded fixtures only.

## Part A: restore Sunny on Saori now (before any coding)
1. Make the **original kiosk** the default again on Saori: the checkout and launcher the girls used before today. Verify it starts, reaches its normal home screen, and waits for a session.
2. Remove the desktop shortcuts `1 Sunny Tryout.command`, `2 Sunny Kids.command` and `Sunny - Start Here.txt`. Leave `~/SunnyData` and the backups untouched.
3. Report on the PR: what's running, from which checkout and commit, and proof it's waiting for a session. No other changes on Saori until Part D.

## Part B: delete the diversion
Delete the spelling-only app path built in the previous milestone:
- the `SpellingChart` page, `ProfileSetup`, `PatternReport` (unless reused on the parent page), the `/spelling` route in `web/src/main.tsx`, and their CSS;
- the `SUNNY_SPELLING_CHART` server mode in `src/server.ts`: the route swap, the WebSocket close, the `/` redirect, and the legacy-route skip;
- `chartSpellingLaunch.ts` and its npm script, plus `chartSpellingRoutes.ts` child endpoints that the parent page doesn't need;
- any tests that only cover the deleted code.

Keep everything listed under "Reuse". Net line count for this part should go down.

## Part C: the plumbing (the existing UI is unchanged)
1. **Assignment.** When a spelling list is ingested through the **existing** ingestion path, also record `assignment.ingested` in the chart with the same words and test date. The same assignment must not be recorded twice. Then the Planner writes `words.tagged` and `prediction.prior` from the chart packet, **before** Discovery opens. This happens behind the scenes, using `checkpointedAttempt`.
2. **Every answer is a typed fact.** At the server boundary where the existing spelling activities report results (Word Radar Discovery, practice games, explainer, the checkpoint), record `item.presented` and `response.observed` **per word**:
   - the raw answer, and correctness computed by code;
   - support facts **for that answer only**: letters shown, hint, companion help on that word, audio replays;
   - the **node actually launched**, from the server's own record of the launch, never inferred from the activity's label;
   - the instrument: Discovery (`discovery`, measure), games and explainer (`practice`), the final checkpoint (`recall_check`).

   If an activity can't report per-word results or support, record its answers as **practice**, never as independent evidence. List those activities in the PR.
3. **Forecast.** After the checkpoint, the Planner writes `readiness.forecast` from the chart, behind the scenes.
4. **Parent page**, inside the existing parent area:
   - confirm each child's profile draft once;
   - enter school results per word;
   - view the report card (guess and forecast accuracy, coverage, pattern history);
   - Planner recovery ("Try again").

   Plain and functional. Nothing new is shown to the child.
5. **Engagement vital signs, invisible to the child** (`engagement.observed`, actor `room`/`system`). Add a strict schema for this type first. Record per node and item:
   - time to first input;
   - long idle gaps;
   - audio replays;
   - erase bursts;
   - rapid repeated wrong attempts;
   - skips and "I don't know";
   - quitting mid-node;
   - help requests to the companion;
   - session length;
   - coming back on a later day.

   These are engagement facts only and must never affect academic scoring.
6. **The old learning stores.** For spelling, stop writing to the word bank, SM2 and learning-profile learning fields **only where nothing visible reads them**. Anything the UI still reads (for example XP or the existing board's cycle) keeps working unchanged for now. List each remaining legacy spelling write and the screen that still depends on it. Those move in the next milestone.
7. **Pipeline timing harness** (`pipeline.stage`, actor `system`). This records how long each step takes from the last scored answer to the new board. Add a strict schema for this type first.
   - **One write path.** The existing provider-stage wrapper (`runMathProviderStage`) and the browser check write the event, so every AI or build step is measured automatically. Callers never write it themselves.
   - **Payload:**
     - board/plan, assignment or homework, and node, when one applies;
     - the stage: `planner_decision`, `artwork`, `creator`, `browser_check`, `visual_review`, or `publish`;
     - the attempt number, the model, and the effort level;
     - start and finish times, and the duration in ms;
     - input and output tokens;
     - the outcome: `ok`, `failed`, `timeout`, `max_tokens`, `refusal`, or `needs_attention`;
     - the receipt path or hash.
   - **Event ID:** use the natural key board + node + stage + attempt.
   - **One more event per board:** `publish` cites the last scored response that triggered the board, so the time from the last answer to the published board can be computed.
   - **Separate from learning.** These events never enter learning projections, scoring, priors, forecasts or the report card.
   - **Failures:** a failed timing write is logged loudly (` 🎮 [pipeline] [timing] [write-failed] …`) and never blocks the board.
   - **Projection `projectBoardTimings`:**
     - per board: the total time from last answer to publish, the Planner time, and the build time;
     - per stage and model/effort: the median, the slowest time, and the failure rate.
   - **Parent page:** add a plain table of recent boards from that projection.
   - **First board too:** the board built after ingestion is timed the same way.
   - **Before the new code exists:** post a one-time read-only table on the PR, built from Saori's existing receipt timestamps (`startedAt` and `receivedAt`). Make no paid calls and no writes.

## Part C2: known live-session bugs to fix (each one red-first, with a test)
1. **Wrong activity credited:** an answer was credited to Letter Rush when the Visual Explainer was the node launched.
2. **Everything marked assisted:** one companion interaction marked every answer in the activity as assisted. In the chart, assistance is decided per answer.
3. **The waiting screen opened empty sessions repeatedly** after Discovery completed.
4. **XP from empty sessions:** confirm it's fixed at the base commit; fix it if not.
5. **The companion not speaking during activities:** investigate. Fix it if the cause is clear and small, otherwise report the cause.

## Part D: install on Saori after review acceptance
1. Back up again and verify the backup.
2. Install the accepted commit as the **default** launcher.
3. Set `SUNNY_EXPERIENCE_PLANNER_MODEL=claude-opus-5-5`.
4. Confirm Sunny is running and waiting for a session.
5. Report on the PR.

## Out of scope (next milestone)
- **Board speed** (agreed with the human; it starts after this milestone is accepted):
  - build successor-board activities **in parallel**, with bounded concurrency, the same one-attempt-per-activity rule, the same lease and checkpoints, and publishing only when every activity passes;
  - an **honest progress bar** while a board is prepared: steps done out of total steps, with a time estimate from the measured `pipeline.stage` medians and no fake progress;
  - effort experiments (for example the Creator on medium for some activities), judged on the measured build time, browser-check and visual-review pass rates, retries, and engagement.
- Making the Planner and the existing targeted board read from the chart instead of the old cycle.
- Deleting the remaining old learning code for spelling.
- Math, Quest and Boss.

## Verification
- Build passes; existing tests pass; new tests cover the plumbing.
- **Browser acceptance through the existing kiosk UI** (both viewports), with a synthetic child and recorded providers: a full spelling week through the normal screens. Afterwards, the chart contains the expected typed facts with the correct node attribution and per-answer support, and the parent page shows the report.
- The browser acceptance run also leaves `pipeline.stage` events for every build step of each board it prepares. `projectBoardTimings` reports them correctly, and no learning projection changes because of them.
- **A visual comparison** of the child screens before and after (screenshots of the same steps), which must match apart from the listed bug fixes.
- The family-data inventory is unchanged. No real-child chart writes during verification.

## Review loop (same as before)
- Post `REVIEW READY round <n> @ <sha>`. The human's existing Claude session reviews on GitHub. No other AI reviewer and no paid review calls. At most 4 rounds.
- A new grading category, **Experience preserved**: any unrequested visible change for the child is 🔴.
- An unanswered product question blocks. Record it under "Assumptions and open questions" and take the option that keeps the child's experience identical.
- Never merge. The human decides.
