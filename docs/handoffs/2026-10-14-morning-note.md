# Morning note, 14 October

Branch `claude/board-canvas-no-logic`, local only, not pushed. Worktree: `/Users/jamaltaylor/Development/sunny-board-canvas`.

## Read this first

**The Anthropic account is out of credit again.** The $20 lasted about 12 full runs plus ingestions, so a full spelling run (ingest, Planner, map artist) costs roughly $1.50. Nothing can generate a map, and the test profile could not be re-ingested, until credit is added.

**Not ready for Reina and Ila yet.** See "Before the girls use it".

## What works now (spelling Teaching map)

Evaluation → loading screen → "Your map is ready" → board → path choice → a game opens. Walked twice in the kiosk page at 1280×720.

Tonight's live runs, two looks for the map artist:

| Run | Time to map | Stops | Overlaps | All activities ready |
|---|---|---|---|---|
| 16 | 151 s | 11 | 0 | yes |
| 17 | 149 s | 13 | 5 | yes |
| 18 | 106 s | 7 | 0 | yes |
| kiosk walk | 171 s | 14 | 18 | yes |
| 19 | 151 s | 11 | 4 | yes |

Five of five published. Run 18 and the kiosk walk fell back to a plain dark background; that bug is fixed (see below) and run 19 confirmed the illustrated world.

## Fixed tonight

- Map artist capped at two looks.
- **Plain dark background bug:** one spare palette key from the artist made the whole theme unreadable, and the board fell back to a plain colour. The theme is now read key by key and the fallback is the illustrated world. This also explains the dark map in an earlier run that I had blamed on the artist.
- An out-of-credit refusal is recorded as a rejection, so the same step can be retried after topping up.

## Regression

- Root: 4,172 pass. The only 2 failures (`spellingPlannerCapabilitySchema.test.ts`) also fail on the base commit.
- Web: 1,022 pass.
- Spelling browser flow: 8 of 8.
- Run before the last two commits (two-look cap, theme reading); their own focused tests pass.
- Not run: the math browser suites.

## Known problems

- **Speed with a real profile.** With a full learning profile the Planner took 120 s (171 s total). The bare test child takes 47 to 80 s. Reina's and Ila's profiles are full ones, so expect waits near or past 180 s.
- **Big journeys crowd the map.** The Planner still plans 11 to 14 stops; the canvas holds about 8 comfortably. Overlaps track stop count almost exactly.
- **Loading screen shows 16 of 20 words.** This is a deliberate cap in `useAppAdventurePreparation.tsx`, not a bug. Say if you want all of them.
- **Untested by anyone:** Elli's voice and answers during the wait, games played with sound, the final checkpoint, and what happens when the map is finished.
- Only spelling's Teaching map is rebuilt. Math, the evaluation board and follow-on boards use the old path. Ingestion still makes one correction call.

## To test this morning

1. Add Anthropic credit.
2. Ingest the sheet for the test profile (it has a clean profile but no assignment yet):

```bash
cd /Users/jamaltaylor/Development/sunny-board-canvas && SUNNY_EXPERIENCE_PLANNER_MODEL=claude-sonnet-5 SUNNY_CHART_DIR=$HOME/.sunny/chart-test DOTENV_CONFIG_PATH=/Users/jamaltaylor/Development/sunny/.env npm run sunny:ingest:spelling -- --child=demo-pashley --pdf="/Users/jamaltaylor/Downloads/5_6 spelling.pdf"
```

3. Open the kiosk:

```bash
cd /Users/jamaltaylor/Development/sunny-board-canvas && SUNNY_COMPANION_ID=elli SUNNY_EXPERIENCE_PLANNER_MODEL=claude-sonnet-5 SUNNY_CHART_DIR=$HOME/.sunny/chart-test DOTENV_CONFIG_PATH=/Users/jamaltaylor/Development/sunny/.env npm run sunny:run -- --subject homework --child demo-pashley --homework-domain spelling
```

Wait for `🎮 [kiosk] [kiosk-visible] [confirmed]`. Then: do the evaluation, stay on the loading screen and talk to Elli, open the map, play.

## Before the girls use it

None of this was done overnight, because it touches their real records and needs your decisions:

- **A real chart folder.** This branch refuses to start for Reina or Ila without `SUNNY_CHART_DIR` pointing outside any checkout. The test folder `~/.sunny/chart-test` must not be used for them.
- **Their profiles on this branch.** Their data lives in the main checkout; this worktree has the repository's copies. Which is current needs checking before anything is ingested.
- **Their companions.** The test used an override (`SUNNY_COMPANION_ID=elli`). Their own companion settings should be used, without the override.
- **A real evaluation.** Each girl does her own 20-word evaluation. It is saved as her evidence, so it should be a real attempt.
- **Your own run first.** If your morning session shows problems with Elli or the wait, fix those before putting a child on it.

## Test setup notes

- `creator` cannot start a real session ("Invalid child name"). `demo-pashley` has no companion or learning profile on this branch; a copy of creator's profile was made for testing. Test files are untracked and not committed.
- Older test data was moved to the session scratch folder, not deleted.
- Plain `npm run build` fails in this folder because `/Users/jamaltaylor/Development/node_modules` leaks `@types/react` into the server typecheck. `npx tsc --noEmit -p . --typeRoots ./node_modules/@types` is clean. Commits were made with `HUSKY=0` for that reason.
