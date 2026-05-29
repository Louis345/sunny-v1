# Sunny PM Ledger

## North Star
Sunny is an adaptive learning system. The child chart and planner decide. Runtime validates and materializes. Activities measure truth. Elli/Matilda are playful companions, not tutors.

## Current Slice
Planner-owned adventure spine for Reina spelling.

## Why This Slice Matters
We need one reliable spelling domain loop before expanding store, onboarding, companion swapping, Tamagotchi, or a new map system. Pick-your-own-adventure should enter first as the Mystery/Bandit node so child choice becomes evidence instead of another parallel product surface.

## Definition Of Done
- Planner includes baseline measurement nodes, one Mystery/Bandit choice node, a locked Quest destination, and a locked Boss destination.
- Runtime does not silently append missing Mystery, Quest, or Boss nodes.
- Preflight fails when the planner omits required adventure-spine nodes.
- Evidence-loop test proves strong words get lighter spaced reinforcement and weak words get more scaffolded practice.
- Word Radar difficulty only escalates when planner-visible evidence supports it.
- Reina preflight passes before any live child session.

## Out Of Scope
- Store economy UI.
- New map rebuild.
- Onboarding branch merge.
- Companion swapping and trait system.
- Full Tamagotchi/care loop.
- Generated quest game implementation beyond locked/planned destinations.
- Broad map-coordinator refactor.

## Current Evidence
- Fresh Reina ingest: `src/context/reina/homework/pending/2026-05-23/`
- Active homework: `hw-spelling_test-5a49d659`
- Test date: `2026-05-26`
- Preflight after T001/T002 cleanup: correctly fails because the current active plan predates the planner-owned adventure spine.
- First Word Radar: `partial_visual_recall`, `letter-by-letter`, no timer, hidden during response.
- High-frequency lane: planner chose `visible_read` Word Radar plus Pronunciation.
- Missing in current active plan: planner did not include Mystery, Quest, or Boss.
- Runtime fallback cleanup: `src/server/map-coordinator.ts` no longer drafts or repairs active plans.
- T001/T002 proof: focused planner/preflight/session-plan tests pass; TypeScript passes.

## Task Queue

### T001 - Planner Requires Adventure Spine
Owner: AI
Status: completed
Goal: The assignment planner owns the baseline -> Mystery -> locked Quest -> locked Boss sequence.
Files:
- `src/engine/assignmentPlanner.ts`
- `src/engine/assignmentPlanner.test.ts`
Success:
- Planner prompt requires one Mystery node after evidence-generating work.
- Planner prompt requires locked Quest and Boss destinations.
- Tests fail if assignment planner output omits Mystery, Quest, or Boss.
Do Not:
- Do not add runtime repair.
- Do not generate a playable quest.
- Do not touch map UI.

### T002 - Delete Silent Quest/Boss Append
Owner: AI
Status: completed
Goal: Missing Quest/Boss stays a planner/preflight failure, not a runtime patch.
Files:
- `src/engine/sessionPlanFromChart.ts`
- `src/scripts/preflightHomeworkSession.ts`
- related tests
Success:
- Silent append fallback is removed.
- Preflight emits `missing_mystery_choice`, `missing_quest_destination`, or `missing_boss_destination`.
- Existing valid planner-authored Quest/Boss nodes still materialize.
Do Not:
- Do not add another fallback composer.

### T003 - Evidence Loop Fixture
Owner: AI
Status: next
Goal: Prove the next plan responds to known/weak word evidence organically.
Files:
- planner tests/fixtures
Success:
- Fixture with 5 strong and 5 weak Reina spelling words causes weak words to receive scaffolded Word Radar or Spell Check.
- Strong words receive lighter spaced reinforcement.
- Hidden recall appears only when evidence supports it.
Do Not:
- Do not hardcode Reina word rules.
- Do not add deterministic Word Radar mode selectors.

### T004 - Mystery/Bandit Evidence Contract
Owner: AI
Status: queued
Goal: Pick-your-own-adventure becomes measurable preference evidence.
Files:
- Mystery node/event contract files after T001/T002
Success:
- Logs capture options shown, option chosen, skipped/avoided options, rating or completion, and whether the child wanted more.
- Mystery evidence informs later Quest/companion flavor without counting as mastery.
Do Not:
- Do not build the store yet.
- Do not rebuild the entire adventure map.

### T005 - Planner QA Harness
Owner: AI
Status: queued
Goal: Prove planner quality and child-specific adaptation without paying for every test run.
Files:
- planner QA script/test files
- saved planner packet/output fixtures
Success:
- Fixture-based and zero-cost by default.
- Optional paid mode runs the real assignment planner.
- Compares Ila and Reina on the same assignment.
- Records model, token estimate or usage when available, estimated cost, latency, node mix, Word Radar modes, target lanes, Mystery/Quest/Boss status, and preflight result.
- Fails if planner omits the adventure spine or collapses child-specific differences.
Do Not:
- Do not require paid model calls in normal tests.
- Do not treat stylistic child differences as learning proof unless tied to chart evidence.

### T006 - Class A Baseline Activity Flight Recorder
Owner: AI
Status: queued
Goal: Word Radar and Pronunciation produce audit-ready per-target logs in the session directory.
Files:
- Word Radar and Pronunciation client emitters
- server event/session debug recorder path
- session audit tests
Success:
- Word Radar records mode, target, visible/scaffold state, audio request/playback proof, captured response, accepted/rejected reason, retries, skips, latency, and per-target result.
- Pronunciation records target, prompt visibility, audio/model playback proof, transcript, match category, homophone ambiguity, contamination flags, retries, latency, and per-target result.
- Logs append to the same session directory used by transcript/session audit.
- Audit can explain whether a bug was product, speech capture, planner config, or companion interference.
Do Not:
- Do not add companion narration.
- Do not change scoring thresholds without a failing fixture.

### T011 - Rehome Slot Machine Variable Reward
Owner: AI
Status: queued
Goal: Keep the slot-machine reward idea as a new-board engagement instrument, not as a reason to preserve the legacy AdventureMap.
Files:
- `web/src/components/SlotMachineOverlay.tsx`
- new JSON-board Mystery/variable-reward integration tests
Success:
- Mystery or reward choice sets can use a slot-machine reveal ceremony from the new `AdventureBoardExperience` path.
- Slot reveal events record anticipation/reveal/replay/back signals as engagement evidence only.
- The component is renamed or wrapped as a neutral variable-reward reveal if that makes ownership clearer.
- No import from or dependency on legacy `AdventureMap`.
Do Not:
- Do not count slot-machine reward engagement as mastery.
- Do not keep the old AdventureMap alive for this component.

### T012 - Quest/Boss Spec Shell And Candidate Lifecycle
Owner: AI
Status: queued
Goal: Stop asking AI to invent the whole Quest/Boss runtime. Sunny owns the validated shell; AI owns theme, story, scenes, and challenge design.
Files:
- Quest/Boss shell renderer and tests
- generated QuestSpec schema and validator
- generated artifact candidate/review lifecycle
Success:
- AI outputs a QuestSpec JSON, not full runtime HTML, for the first Quest/Boss shell.
- Sunny-owned shell handles `/games/_contract.js`, `#sunny-companion`, hidden-recall loops, attempt events, completion events, target hiding, replay/back overlay, validation hooks, and logs.
- Generated candidates move through explicit states: candidate, validation_failed, validated_available, selected, not_selected, preserved, revised, discarded, retired.
- Discarded candidates stay audit evidence only and never become playable or child-chart mastery evidence.
- If a child sees two valid Quest/Boss options and picks one, the unpicked option is recorded as `not_selected`, not `discarded`.
- Choice logs capture shown options, selected option, not-selected option ids, option traits, position/order, validation status, and later play outcome for the selected option.
- Bandit/engagement model treats not-selection as a weak preference signal only after repeated exposures; selected play outcome and voluntary replay carry stronger weight.
Do Not:
- Do not let AI render companion chrome or runtime evidence plumbing.
- Do not count unchosen options as dislike or mastery failure.
- Do not delete unchosen valid artifacts immediately; expire or retire them only through explicit lifecycle rules.

## Next Command
Re-ingest/replan Reina spelling with the updated planner prompt, then run `src/scripts/preflightHomeworkSession.ts --child=reina`.
