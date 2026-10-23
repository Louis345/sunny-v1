# Successor readiness: verified structural fixes, recovery still pending

Branch `codex/successor-readiness`, based on `83d2c5a3`. Final implementation `1171f183`. The family kiosk and child records were not changed or restarted. Original published definitions, failed bindings and provider receipts were preserved.

## Human catch and earliest wrong decisions

The Oct 22 kiosk promised a ready next adventure, offering only Finish for now. The saved board had five unavailable activities with null bindings. `successorPreparationStatus` interpreted a publication timestamp as playability and returned no activity details; the component rendered that incorrect input. Publication had frozen a design with Not ready activities, not established usable activities.

The original candidate diagnostics and a fresh synthetic paid run revealed two upstream mismatches:

1. The Creator authors self-contained HTML with GAME_PARAMS and parent state events, but baseline validation also demanded refillable-shell configuration loading and GameBridge.reportState. All five saved first candidates failed these two unrelated protocol checks.
2. The math browser checker required matching visible prompt prose. A paid spelling practice candidate showed the correct frozen word `light` and “Study the glowing word, sailor!”, while reporting “Study this word closely.” The checker rejected it. It also waited for a practice word to be visible before following a newly appearing, submitted evidence-free Reveal step.

The lab tested status titles and injected successful validation, or exercised reused native activities rather than generated spelling. Logs recorded failures, but no check compared the resulting ready promise with launch availability. The fresh paid candidate and negative controls now supply regression evidence at the earliest responsible layers.

## Changes

- `82105659`: explicit self-contained artifact form for generated progression; existing refillable callers retain their protocol checks.
- `6c1c35e8` / `87cdeaa9`: actual activity availability in operational status, sharing unavailable-capability/reason handling with launch and projection. A fully unavailable published design reports attention. Usable siblings remain published; unavailable siblings use the existing terminal `not_ready` protocol.
- `0235210a`: saved-state server projection → child-facing status regression.
- `1171f183`: pass frozen spelling measurement roles to the existing browser verifier. Practice/instruction may be confirmed by the correct whole word actually visible with its matching item identity. Independent checkpoints receive no visible-answer fallback. Both initial and later items use the same whole-word matcher. A newly appearing declared Reveal may be followed only without emitting evidence; normal response, completion, identity and control checks remain. Verifier version increased to 18.

No Planner activities, count, alternatives, educational hypotheses, layouts or model settings were changed. No new AI role or production pipeline was added. Original failed budgets were not reset. The stable successor status timestamp is retained to prevent mid-session chapter swaps; a fresh mount independently refreshes the next board.

Production accounting across affected files: 54 lines added, 22 deleted, net +32. Additions expose actual availability and carry the frozen domain-specific witness into the existing verifier; the duplicate availability rule was removed. The shared checker gained spelling-only evidence support, leaving math's verification behavior intact. This exceeds a neutral shared-file line count; no unrelated code was deleted to conceal that cost. Most additional test lines are an unchanged 13,035-byte synthetic paid HTML fixture, catalog metadata and regression tests. The fixture is not selectable production content and never supplies child evidence.

## Verification and review

- Red/green regressions reproduce the shell mismatch, false published readiness, unavailable capabilities, retained unavailable reasons, mixed sibling status, paraphrased spelling instruction, first/later word substrings, independent-checkpoint exclusion and same-ID evidence-free Reveal.
- Build passed. Existing Vite eval/chunk-size/plugin timing and Browserslist warnings remain.
- Focused server suites: 164 tests passed across 8 files, including the full 50-test math/browser journey suite. Additional immutable paid-fixture browser replay: 1 passed. Total 165 server tests.
- Web status/adapter/refresh suites: 36 passed across 4 files.
- Independent read-only review caught weaker availability handling, mixed-status consumption and first-item substring acceptance. These were corrected with regressions; re-review found no remaining actionable findings. This was not an Opus review or human approval.
- Existing recorded-provider full kiosk robot at `6c1c35e8`: one test passed in 175.254 seconds, covering Discovery, Teaching, successor preparation, reload, all three reused activities and next Planner handoff. **Not clean family acceptance:** logs contain a stimulus mismatch and missing synthetic soul.md during cleanup, separately recorded in BUGS.md.

## Paid and saved replay evidence

One fresh synthetic Creator run used the unchanged default configured model, `claude-sonnet-5`, with two bounded candidates and no Planner purchase. With the old checker, the first candidate failed on prose matching; the correction introduced a clipped control. Total run time was 318.132 seconds and it attached no artifact. This is a failed generation run, not a latency or uninterrupted acceptance pass.

After the checker fix, the first candidate's **unchanged bytes** pass real browser controls and completion at both release sizes without another Creator call. Its SHA-256 and synthetic-only catalog metadata accompany `src/scripts/fixtures/generated-spelling-practice.html`. The automated replay verifies the hash before use. Screenshots from local replay show its second item and reachable controls; no audible pronunciation or microphone claim follows from this result.

Replaying the five original saved first candidates with the final verifier changes no records or receipts. All five pass corrected static validation. Radar read now passes the browser journey unchanged. Explain long i, wheel pattern, guided spelling and radar check still fail transition, visibility/stimulus or clipping checks. Those remaining failures need their own source-level attribution; a checker error code alone does not prove the Creator is at fault.

Local operational evidence is in ignored `outputs/successor-readiness/` (`saved-replay.json`, `fresh-creator.json`, `fresh-replay.json` and scripts). Reports reference the temporary screenshot directories. Logs: `/tmp/sunny-successor-final-tests.log`, `/tmp/sunny-successor-web-tests.log`, `/tmp/sunny-successor-final-build.log`, `/tmp/sunny-paid-fixture-test.log`, `/tmp/sunny-successor-robot.log`, `/tmp/sunny-successor-fresh.log`, `/tmp/sunny-successor-replay-final.log`.

## Handover limit

**Do not hand the existing adventure back to Ila as fixed.** Its published instance remains unchanged and unusable. These fixes remove demonstrated unnecessary implementation rejection and false readiness reporting. They do not replace frozen failed artifacts or establish a clean generated-board family session. Real-child recovery must preserve the published history and use an explicit recovery/replacement path; do not edit bindings, receipts, evidence or spent attempt budgets. No production deployment or push was performed.
