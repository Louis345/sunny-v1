# Spelling board generation: one small contract instead of three large ones

Status: **proposal, awaiting human approval (AGENTS.md "Stay in scope [Law 6]")**. No production code is changed on this branch.
Base: `claude/board-canvas-no-logic` at `0b41c115`. Date: 2026-10-19.

## 1. Summary

**The hypothesis holds, with one correction.** Every spelling board is generated through an AI output contract that asks the model for many values code already knows. Each wrong value has been answered with a new validator, then a correction pass, then a guard against the correction drifting. The correction is that the branch has already moved part of the way. Contract 38 (`95996304`, "one journey sequence, no corrections, Creator preview") took portals, paths, edges and checkpoint lineage away from the Teaching Planner. What is left:

1. **Three spelling board contracts, not one.**
   - The **Probe** board is a full `AdventureBoardDefinition` written by the intake Planner, including positions, edge geometry and CSS theme. It is checked on a real canvas and goes through a bounded correction.
   - The **Teaching** board is a journey sequence written by the Planner, then a map drawn by the Fable "map artist" in up to three calls with screenshots.
   - The **Successor** board is again a full `AdventureBoardDefinition`, written by the progression Planner, checked on canvas, and corrected through journey, reference and citation patches.
2. **The Teaching Planner tool is still about 4× larger than it needs to be.** It is 19.7 KB with 196 schema properties and a six-way union over activity forms. It still asks for activity IDs, duplicate `type`/`activityId` fields, six Word Radar capture flags, measurement IDs and kinds, `finalCheck`, `maxDelayDays`, an `evidenceUsed` restatement, and explainer option IDs. It is deliberately left unlocked (non-strict) because the 2026-10-18 live compile check rejected it as "compiled grammar is too large" (`src/engine/strictTools.test.ts`, last test).
3. **The map artist runs an algorithm that code could run.** Its prompt (`src/engine/directMathExperience.ts`, `designNativeBoard`) spells out the layout rules: run the shared journey along the middle row of a 7×3 grid; give each option its own lane on the top or bottom row; rejoin on the middle row; leave an empty cell between stops; keep the bottom-right cell for Elli. The background is a one-value enum. The only remaining AI choices are eight palette colours and edge styles. Two refusals came from this stage: on 2026-10-14 (BUGS.md L548) and on 2026-10-19 (demo session 21b4cc, `stop_details` not recorded). Each refusal stopped the whole board.

**Proposal: one `BoardPlan` contract for all three spelling boards.**
- The AI chooses only from code-supplied enumerations: instrument modes from the launchable catalog, words from the assignment, evidence IDs from the supplied evidence, activity slots `A`–`L`, and a closed set of theme presets. Free text is used only for child-facing labels and pedagogy.
- Code compiles the plan into the frozen `AdventureBoardDefinition`. That covers IDs, bindings, capture flags, launch configuration, measurement bookkeeping, the CSS palette, and a **deterministic layout of the journey graph**.
- The map-artist stage and its preview loop are deleted for spelling.
- The schema drafted in §4 measures 4.9 KB, 54 properties, 0 optional fields and 4 unions under the repo's own `strictBudget` (limits are 24 optional and 16 unions).

**What it buys:**
- Spelling boards go from three contracts to one.
- AI calls per Teaching board go from 2–4 to 1.
- Correction-stage families on spelling boards go from four to zero.
- Spelling output is locked to the schema while it is written.
- 39 of the 70 board entries whose fault lies in the AI output contract or its provider call (56%) become impossible to write down.
- About −200 production lines net (estimated; §5).

**What it does not fix** (§8): about half of the 134 board-generation entries are code-pipeline and lifecycle bugs or generated-activity (HTML) bugs. This contract does not touch them.

**It changes approved rules.** AGENTS.md "The canvas has no logic" and `LEARNING_FEEDBACK_LOOP.md` contract 38 both name the Experience Creator as Sunny's map artist. Removing that duty for spelling needs your explicit approval and a contract version 39 (§7).

## 2. Field inventory

Tags:
- **AI**: a decision only the model can make (pedagogy, sequence, child-facing language, perception of the school sheet).
- **AI→enum**: the model decides, but the valid answers are a set code already holds; today they are free strings.
- **Code**: code knows or can derive the value. Asking for it only creates a way to be wrong.

### 2.1 Teaching Planner: `create_learning_program`

Source: `nativeLearningProgramToolJsonSchema`, `spellingActivityFormSchema` and `journeySequenceSchema` in `src/engine/assignmentPlanner.ts` and `src/shared/adventureBoardDefinition.ts`. Measured: 19,717 bytes, 196 properties, 21 optional, 13 unions, not strict.

| Field | Tag | Why / how code knows it |
|---|---|---|
| `domain` (literal `spelling`), `planId` | Code | Constant; the job already holds the plan identity. |
| `journey.title`, `endpointLabel`, `singlePathReason` | AI | Child-facing language and the Planner's rationale. |
| `journey.opening[]`, `closing[]`, `choice.options[].nodeIds[]` | AI (sequence) | They point at AI-made `activities[].id` strings; a dangling one is silently dropped (`node-missing`). They become slot letters (§4). |
| `choice.purpose`, `choice.label`, `options[].label`, `options[].hypothesis` | AI | The choice question, its labels and the engagement hypotheses. |
| `choice.options[].id` | Code | Option identity; can be positional. |
| `activities[].id` | Code | Node identity. It also caused cross-assignment collisions (L293). |
| `activities[].type` **and** `activityId` | AI→enum, duplicated | The same choice asked twice ("Same value as type."); they disagreed in L100. One instrument-mode enum replaces both. |
| `activities[].title` | AI | The portal name she reads. |
| `activities[].difficulty` | AI (verify) | The spelling runtime does not appear to read it; confirm before removing. |
| `activities[].targetLane` | Code | The captured word-group ID, derivable from the chosen words. |
| `activities[].targets[]` | AI→enum | Which assigned words. Unknown words today become "Not ready" after the fact. |
| `wordRadarConfig.recallMode`, `letterRushMode` | AI→enum | The instrument mode the Planner chooses. Folded into the instrument enum. |
| `wordRadarConfig.inputMode`, `speakStyle`, `showTimer`, `timerSeconds`, `hideWordDuringResponse`, `requiresCapturedResponse` | **Code** | Fixed per mode in `WORD_RADAR_CONFIG_DEFAULTS` and catalog `capabilityModes[].config`. Config and capture-flag bugs: L67, L388, L394, L492. |
| `measurement.evidenceType` | Code | Follows from the instrument (`evidenceRole` on the catalog card). |
| `measurement.spelling.role` | Code | Follows from the mode: hidden recall is `fresh_checkpoint`, the explainer is `instruction`, games are `practice`. The union branches already hard-wire it. |
| `measurement.spelling.finalCheck` | Code | Derivable: the last checkpoint on every execution. |
| `measurement.spelling.maxDelayDays` | Code | The horizon is the parent's scheduled test date (schedule facts), or explicit null. |
| `measurement.spelling.evidenceIds[]` | AI→enum | Which supplied evidence informed this prediction. The ID set is code-known (the source of the `unknown_evidence_id` and empty-array bugs, L295, L502). |
| `expectedAccuracy.{min,max}`, `confidence`, `reason`, `uncertainty`, `support/revise/falsifyCriteria` | AI | The preregistered prediction. |
| `activityConfig` (explainer): `topic`, `learningGoal`, `misconception`, `strategy`, `words[].chunks`, `spokenChunks`, `focusChunk`, `tip`, `check.prompt`, `options[].label`, `options[].correct` | AI | Teaching content. |
| explainer `words[].text`, `check.targetWord` | AI→enum | Assigned words. |
| explainer `check.options[].id`, `correctOptionId` | Code | `correctOptionId` repeats `correct: true`; IDs can be positional. |
| `planTheory.*`, `reviewQuestions[]` | AI | Theory and open questions. |
| `generationRequests[].skillTarget`, `mechanicConstraints`, `reason` | AI | A request for a missing capability. |
| `generationRequests[].id`, `targetLane`, `domain` | Code | Identity, word group, constant domain. |
| `evidenceUsed[].id`, `type` | Code | A restatement of evidence code supplied; only `summary` is the model's own. Replaced by per-prediction citations. |

About 40% of the leaf fields are Code or a duplicate. They make up most of the schema's size because they sit inside each branch of the six-way union.

### 2.2 Map artist: `preview_board`, `adjust_board`, `submit_board`

Source: `designNativeBoard`. Up to `MAX_BOARD_PREVIEWS + 1 = 3` calls, two of them carrying screenshots.

| Field | Tag | Note |
|---|---|---|
| `portals[].id`, `edges[].id` | Code | Copied from the frozen journey. |
| `portals[].cell.{landscape,portrait}.{col,row}` | **Code** | The prompt gives the placement algorithm in prose (§1). |
| `edges[].controlPoints` | Code | Two serialized-geometry bugs (L540, L542). The renderer can draw paths without control points. |
| `edges[].style` (`solid`/`dashed`/`glow`) | AI→preset | Taste; part of a theme preset. |
| `theme.background` | Code | Already a one-value enum (`silent-letter-world.jpeg`). |
| `theme.palette` (8 CSS colours) | AI→preset | Contrast must be guaranteed. Invalid CSS (L507–L510) and a downgraded look (L536) came from here. Closed presets with checked contrast replace it. |
| `whatISee`, `rationale` | AI | The artist's self-review. Has no use without the stage. |

### 2.3 Probe board: intake Planner `write_adventure_session_plan` (spelling intake)

Source: `spellingIntakeAuthoringSchema`, `intakeBoardSchema`, `planSpellingIntakeFromSource`.

| Field | Tag | Note |
|---|---|---|
| `title`, `words[].{word,pageNumber}`, `uncertainty[]`, `sourceNotes[]` | AI (perception) | Reading the school sheet; this is real AI work. |
| `diagnostic.action` | AI | `select` or `needs_instrument`. |
| `diagnostic.activityId` + `modeId` | AI→enum | One `instrument` enum from `packet.spellingDiagnostics.instruments`. The pair was rewritten into the portal ID by a correction (L500). |
| `diagnostic.reason`, `uncertainty[]`, `nextEvidenceNeeded[]` | AI | Rationale. |
| `diagnostic.evidenceIds[]` | AI→enum | From `spellingDiagnostics.evidenceIds`. |
| `boardDefinition.version`, `rootPathId`, `paths`, `choices`, portal `kind`, `activityNodeId` (always `diagnostic`), `edges` | **Code** | A one-node board is start → diagnostic → end. `activityId` vs `activityNodeId` vs `word-radar` confusion: L415, L418. |
| `boardDefinition.portals[].position`, `edges[].controlPoints` | **Code** | Layout. |
| `boardDefinition.theme` (background + 8 colours) | Code / preset | |
| `boardDefinition.title`, portal `label`s | AI | Child-facing names. |

### 2.4 Successor board: progression Planner

Source: `askPlanner` in `src/engine/learningCycleRuntime.ts`.

| Field | Tag | Note |
|---|---|---|
| `status`, `reason`, `progressionAction`, `preserve/change/testNext/nextEvidenceRequired`, `revisedHypothesis` | AI | The single theory decision (LEARNING_FEEDBACK_LOOP "Evaluation and one decision"). |
| `predictionEvaluationIds[]` | AI→enum | Already an enum for spelling (fixed after L472). |
| `contentDecisions[].contentId` | AI→enum | It was confused with node IDs (L474–L478). Make it an enum from the chart catalog. |
| `contentDecisions[].action`, `reason`; `evidenceIds` | AI; AI→enum | |
| `nextInstruments[].nodeId` | Code | Identity. |
| `nextInstruments[].title`, `academicTarget`, `mechanic`, `theme`, `creatorPrompt`, `stakesDesign` and the other design prose | AI | Design brief for a generated activity. |
| `nextInstruments[].spelling.{wordIds, measurementRole, responseMode}` | AI→enum | Already enums. |
| `boardDefinition` (the full `BOARD_DEFINITION_TOOL_SCHEMA`) | **Code** except title, labels, choice, hypothesis | The same journey shape as Teaching; positions, edges, theme CSS and IDs are code-known. |

## 3. BUGS.md classification

**Method.** `BUGS.md` at `0b41c115` was split into 282 entries: one per heading section or top-level bullet, with continuation lines folded in. 196 entries match board, Planner, Creator, canvas or generation keywords. Each was read and tagged by hand: 48 turned out to be off-topic (voice, kiosk, companion, test isolation) and 14 are continuations of an earlier entry. That leaves **134 board-generation entries** (the brief estimated 143 of 263 with a different split). The per-entry tags are in [`SPELLING_BOARD_BUGS_CLASSIFICATION.tsv`](./SPELLING_BOARD_BUGS_CLASSIFICATION.tsv), with the BUGS.md line for each.

| Tag | Failing field or stage | Entries | Share of 134 | Share of the 70 AI-contract entries |
|---|---|---:|---:|---:|
| **A** | A code-known field written by the AI (IDs, references, catalog enums, capture or config flags, CSS theme, generated-artifact runtime contract) | 34 | 25% | **49%** |
| **B** | A correction or repair pass (rewrote valid fields, exhausted its budget, receipt or prompt drift) | 14 | 10% | **20%** |
| **C** | Geometry or layout (overlap, clearance, crowding, serialized geometry) | 6 | 4% | **9%** |
| **D** | Provider, transport or receipt (refusal, timeout, in-flight, credit, receipt identity) | 10 | 7% | **14%** |
| **E** | Strict schema or request too large to compile | 3 | 2% | 4% |
| **H** | AI pedagogical decision (wrong teaching choice; correctly the Planner's) | 3 | 2% | 4% |
| **F** | Code pipeline, lifecycle or projection (no AI field involved) | 43 | 32% | n/a |
| **G** | Generated activity HTML or its verifier and repair (not the board) | 21 | 16% | n/a |

**A breaks down further:**
- 15 are IDs, references and bindings: evidence, prediction vs evaluation, content, portal and edge IDs, lineage, `activityId` vs `activityNodeId`.
- 6 are catalog or enumeration mismatches, such as schema offering 29 activities while validation accepted the launchable set (L110), or Quest and Boss being advertised before they were authorized (L465).
- 5 are instrument config or capture flags.
- 3 are generated-artifact runtime contracts (hard-coded child ID, missing config-URL load, missing `reportState`).
- 2 are CSS or theme values, 2 are generated correctness claims (math), and 1 is a parser stripping a field.

**B breaks down further:**
- 7 are board-contract corrections (L439, L453, L490, L492, L500, L502, L504). Four of these are "the correction changed fields that were already valid" (L490, L492, L500, L502).
- 7 are generated-activity repair loops (math or explainer HTML).

**D:** the refusals are L548 (2026-10-14) and the 2026-10-19 demo session, which is not yet logged in BUGS.md.

**What the target contract removes by construction (spelling boards only):**
- **A:** 23 of 34. All 12 spelling-board ID and reference entries, all 6 catalog entries, 3 of 5 config entries, and both CSS entries. The rest are math, generated-artifact or intake-capture entries.
- **B:** 7 of 14. Every board-contract correction; no correction stage remains.
- **C:** 6 of 6. Layout becomes a tested pure function.
- **E:** 3 of 3, if the live compile check passes (§7, decision 4).
- **Total:** 39 of 70 (56%). **D** shrinks (one call instead of 2–4) but is not eliminated. **H** stays, correctly.

**Why labs kept missing these.** One reason recurs in the "why the lab missed it" notes: the lab injected well-formed AI output. Each new invalid shape came from a live model and got its own validator. With a strict, enum-only contract, the set of shapes the model can return is finite and is enumerated by the schema itself. The lab can generate all of them.

## 4. Target contract: `BoardPlan`

### 4.1 Ownership

| AI decides (from code-supplied choices where possible) | Code fills in, the same way every time |
|---|---|
| Which instrument modes to use (enum: launchable catalog `activityId:modeId`) | Node, portal, path, edge, option, measurement and check-option IDs (namespaced by assignment and position) |
| Which words each activity targets (enum: assignment words) | `type`/`activityId`, native launch config, capture flags (from the mode's catalog config) |
| Sequence: opening, optional choice with options, closing (by slot `A`–`L`) | Measurement role, `evidenceType`, `finalCheck`, horizon (from the parent schedule), checkpoint exposure lineage (already derived in v38) |
| Prediction numbers and criteria; evidence citations (enum: supplied evidence IDs) | `targetLane` from word groups; the activity's target list from the explainer words |
| Child-facing titles, labels, choice question, hypotheses, endpoint label | Start, choice and endpoint portals; connections (already derived in v38) |
| Explainer teaching content; theory; review questions | Positions for landscape and portrait; edge paths (deterministic layout, §4.3) |
| Theme preset (enum of closed presets) | Background image, 8-colour palette, edge styles (from the preset table) |

Planner authority as AGENTS.md defines it is unchanged: activities, sequence, alternatives, convergence, labels, configurations (as mode choices) and evidence relationships (as citations). Code invents no route, deletes no choice and reorders nothing.

### 4.2 Schema (Teaching body; Probe and Successor share the journey part)

Drafted and measured in scratch, with 20 words, 25 evidence IDs and 14 instrument modes in the enums, using `strictToolSchema` and `strictBudget` from `src/engine/plannerTransport.ts`:

| | Bytes | Properties | Optional | Unions | Strict-unsupported |
|---|---:|---:|---:|---:|---:|
| Current Teaching Planner | 19,717 | 196 | 21 | 13 | 0 after rewrite (rejected live as "too large") |
| Current successor/probe `boardDefinition` | 5,305 | 56 | n/a | n/a | n/a |
| Current map-artist composition | 2,959 | 34 | n/a | n/a | n/a |
| **Target `BoardPlan`** | **4,872** | **54** | **0** | **4** | **0** |

```ts
$defs: { word: enum(assignment words), instrument: enum(launchable activityId:modeId),
         evidenceId: enum(supplied IDs), slot: enum('A'..'L'), theme: enum(preset IDs) }
{
  title: string, theme: $theme, endpointLabel: string,
  activities: [{
    slot: $slot, instrument: $instrument, title: string, words: [$word],
    prediction: null | { expectedMin, expectedMax, confidence: number,
                         reason, uncertainty, support, revise, falsify: string,
                         evidenceIds: [$evidenceId] (min 1) },
    explainer: null | { topic, learningGoal, misconception, strategyTitle: string, steps: [string],
                        words: [{ word: $word, chunks: [string], spokenChunks: [string], focusChunk, tip }],
                        check: { word: $word, prompt: string, options: [{ label: string, correct: boolean }] } }
  }],
  opening: [$slot], choice: null | { purpose, label, options: [{ label, hypothesis, slots: [$slot] }] },
  closing: [$slot], singlePathReason: null | string,
  theory: { hypothesis, intervention: string, evidenceSummary, support, revise, falsify: [string] },
  reviewQuestions: [string]
}
```

There is no union over activity kinds. Kind-specific content is one nullable `explainer` object, and the instrument enum carries the mode. Length limits that strict mode drops (titles of about 24 characters, at most 12 activities, at most 8 explainer words) are trimmed and logged on arrival, the way `deriveNativeActivity` already trims explainer text (`[planner] [explainer] [text-trimmed]`). Nothing is rejected.

**Probe:** the intake capture fields stay. `diagnostic` becomes `{action, instrument: $diagnosticInstrument, reason, evidenceIds, uncertainty, nextEvidenceNeeded}` plus a portal `title`. Code builds start → diagnostic → end.

**Successor:** the decision fields stay. `contentId` becomes an enum, and `nextInstruments[]` loses `nodeId` and gains `slot`. `boardDefinition` is replaced by the same `opening/choice/closing/theme/endpointLabel` block.

### 4.3 Deterministic layout

`layoutJourney(expanded journey) → {portalId: {landscape, portrait}}` is a pure function in `src/shared/`. It does what the map-artist prompt already asks for, in code:

- **Landscape.** Columns follow sequence index. Shared portals sit on the middle lane. At a choice, each option gets its own lane, spread symmetrically above and below; lanes are added beyond three rows when there are more than two options, so no choice is ever dropped. Options rejoin the middle lane at one column past the longest option. A path longer than the 7 columns that fit (980 px safe width ÷ (116 px portal + 28 px air)) wraps into a second band.
- **Portrait.** The same graph transposed onto 3 columns and as many rows as needed. Today's 3×4 grid gives the artist the same capacity limit.
- **Reserved cells.** The level badge (top-left), the status bar (bottom-centre) and Elli (bottom-right) are reserved, which turns the L29 invariant into a layout rule.
- **Edges.** No control points; the renderer draws them. Style comes from the preset.
- **Over capacity.** Spacing tightens to the measured minimum and `🎮 [board] [layout] [over-capacity] portals=N` is logged. The board still publishes and nothing is removed.

The shape space is finite: up to 12 activities, at most one choice, the longest label clamped. So it is tested once, exhaustively. A unit property test asserts that no boxes overlap for every shape, using measured maximum portal sizes. One Playwright lab renders a representative set at 1280×720, 768×1024 and 1470×956 with the XP bar and Elli present. Because layout is a tested function of the journey, `verifyAuthoredBoardCanvas` is no longer a per-board publication gate for spelling. The same check runs in CI against the layout function instead.

### 4.4 Theme presets

`THEME_PRESETS` is a short table of `{id, background, palette, edgeStyles}`. Each palette's `text`/`panel` pair is contrast-checked in a test. Only one illustrated world exists today (`silent-letter-world.jpeg`), so presets start as palette variants on that world. The approved look is kept by construction: illustrated Grok world, inviting portals, animated dashed or glow paths, left-to-right progression. A side-by-side screenshot comparison with the last accepted artist maps is required before handover ("Preserve the approved experience").

### 4.5 Truth checks that remain, and what each degrades

Under strict mode these cannot fire for new responses. They stay because saved non-strict receipts can still be replayed, and because each guard needs a test:

- An unassigned word, an unknown evidence ID, or an unsupported instrument marks that one portal **Not ready** (existing behaviour).
- Explainer content that does not join back to the word, or a check without exactly one correct option, marks that portal Not ready.
- A visual-explainer instrument with `explainer: null` marks that portal Not ready.
- A slot that is referenced but never defined, or defined twice, is logged and left off; this is the existing `node-missing` / `node-repeated` behaviour.

## 5. Deletion plan

Each step is its own red-green change (AGENTS.md Laws 1 and 3) with its own invariant. Line counts are estimates from the current function spans and are counted for production code only.

| Step | Change | Deleted | Added | Net | Proof (red first) |
|---|---|---:|---:|---:|---|
| 0 | **Refusal diagnostics.** Save the full provider response (including `stop_details`) on refusal for every board stage. | 0 | ~3 | +3 | Lab invariant: an injected refusal's receipt contains `stop_details`. **Why the human caught 10-19:** loading never finished. **Why logs did not explain it:** they record `[refused]` without the provider's reason. **Why the lab missed it:** the `learning_design_provider_refused` lab injects the failure and asserts the stop, not the diagnostic. |
| 1 | Add `layoutJourney` and `THEME_PRESETS` (pure, unused). | 0 | ~90 | +90 | Exhaustive no-overlap property test; reserved-cell test; contrast test; one Playwright layout lab at three viewports. |
| 2 | **Teaching: replace the map artist with layout + preset.** Delete `designNativeBoard`, `compositionAsSubmitted`, the grid and cell helpers, `MAP_ARTIST_PERSONA`, `MAX_BOARD_PREVIEWS`, and `measureBoardPortals`. Edit AGENTS.md and bump `LEARNING_FEEDBACK_LOOP.md` to v39. | ~140 | ~10 | **−130** | Call-count test: a Teaching generation makes exactly one provider call. Existing acceptance: authored journey = rendered, traversable journey in a sandbox evaluation-to-board run. Screenshots compared with the approved brief. Retire `creatorPreview.test.ts` (204 lines) and the artist parts of `learningExperienceCreator.test.ts`. |
| 3 | **Teaching Planner → strict `BoardPlan`.** Replace `spellingActivityFormSchema`, `nativeActivityBase`, `nativeSpellingMeasurement`, and the `deriveNativeActivity` config derivation with one flat form plus `compileBoardPlan`. Remove the hydrate-time relationship re-check and sanitize pass. The old `hydrateNativeLearningProgram` stays read-only for saved receipts. | ~60 | ~80 | +20 | `strictBudget` test (unsupported = [], optional ≤ 24, unions ≤ 16). The model's every possible output shape is generated from the schema enums. Old-receipt replay is unchanged. **Live compile check: one paid call (decision 4).** Flip the "keeps the lesson Planner unlocked" test. |
| 4 | **Probe: code-built one-portal board.** `diagnostic.instrument` becomes an enum. Delete `intakeBoardSchema`, `spellingIntakeCorrectionSchema`, the intake canvas verification, the new-correction half of the `planSpellingIntakeFromSource` catch block, and the `spellingIntakeToolJsonSchema` override (use `strictTool`). | ~95 | ~20 | **−75** | Every `select` intake yields an executable start → diagnostic → end board. No `authoring-correction` stage is ever written. Rewrite the correction cases in `spellingDiagnosticSelection.test.ts` as "cannot occur". |
| 5 | **Successor: `BoardPlan` journey.** Replace `BOARD_DEFINITION_TOOL_SCHEMA` in the progression tool, make `contentId` an enum, and delete the journey-correction and reference-patch branches and the successor canvas verification for spelling. Math keeps its path. | ~35 | ~15 | **−20** | Each progression action authors a publishable successor. No `progression-journey-correction` or `reference-patch` stage is written. Update `spellingSuccessorContract.test.ts`. |
| 6 | **Drain and delete legacy readers.** First, a read-only inventory of in-flight cycles under the old contracts in the real children's contexts. If there are none, delete the old native hydrate path and the intake legacy-correction receipt reuse loop. | ~80 | 0 | **−80** | Inventory output attached. Published boards stay readable: stored definitions are not touched. |
| | **Total** | **~410** | **~218** | **≈ −190** | Likely range −150 to −250. |

**Hot-path files:**
- `directMathExperience.ts`: about −130 (3,947 → about 3,815).
- `assignmentPlanner.ts`: about −135 (3,235 → about 3,100).
- `learningCycleRuntime.ts`: about −20.
- A new `src/shared/boardPlan.ts` gains about +170.

**Commit count.** Since the merge-base with `main`, 85 commits touch the two hot-path files (the brief's 107 likely used a different range). Two further files were created on this branch: `adventureBoardDefinition.ts` (332 lines) and `adventureBoardCanvas.ts` (172).

**Optional step 7 (separate approval).** The legacy `planAssignmentFromSource` path still holds most of the remaining correction machinery: `callAssignmentPlannerModel` with its measurement correction, canvas correction, `planAssignmentFromSourceInternal`, and roughly 150 lines of forgiving Word Radar normalizers. That is about −400 to −600 lines, but only after a caller audit shows spelling no longer reaches it. `ingestHomework.ts:1499` and `sunnyIngest.ts` still call it. Math's Experience Creator composition is untouched (Math Prompt Chain Boundary); applying the layout there would be its own proposal.

**Order and rationale.**
- Step 2 comes before step 3 because it removes the stage that refused, and it is independent of the Planner schema.
- Steps 4 and 5 reuse the compiler and layout from steps 1–3.
- Step 6 waits for real data to drain.
- Steps 2–5 each leave the system shippable.

## 6. Degrade path: what the child sees

AGENTS.md and the learning contract forbid code-authored fallback teaching plans ("no … fallback teaching plans", spelling kiosk cutover). So the degrade never invents pedagogy. It narrows the failure to the smallest unit and keeps her chapter honest.

| Failure | Child sees | Log | Recovery |
|---|---|---|---|
| One activity fails a truth check, or its explainer content is invalid | Board publishes; that portal shows **Not ready** and the path passes over it | `🎮 [board] [portal] [not-ready] reason=…` | None needed; missing measurement stays explicit |
| Layout over capacity | Board publishes with tighter spacing | `🎮 [board] [layout] [over-capacity]` | Planner is told capacity as a fact (already) |
| Preset artwork missing | Board publishes on the default preset | `🎮 [board] [theme] [fallback]` | Fix the asset |
| Teaching Planner refuses, hits `max_tokens`, or returns nothing readable | Probe chapter stays complete; she may replay completed probe nodes as practice (contract allows replay until a successor publishes); Elli says her next map isn't ready yet; **Stop for now** keeps everything. Today's screen is "Building paused · Your work is saved · Try again". | `🎮 [learning-planner] [response] [refused] stop_details=…` | Parent opens a bounded retry batch (at most 3, existing rule); no automatic retry |
| Intake Planner refuses | No child session yet; the parent sees the saved source and the failure | `[spelling-discovery] … [refused]` | Parent retry |
| Successor Planner refuses | The current board stays playable and replayable; the cycle is blocked for a person (existing rule) | `[canonical-progression] [blocked]` | Parent retry |

The map-artist refusal, the failure behind both live refusals, is no longer possible because the stage no longer exists.

## 7. Conflicts with current rules and decisions for you

1. **Remove the map-artist duty for spelling boards.** This requires editing AGENTS.md ("The Experience Creator is Sunny's map artist…") and `LEARNING_FEEDBACK_LOOP.md` §"For the spelling Teaching board…" (contract v39). The Experience Creator remains for generated activities and for math. *Recommended: yes.*
2. **Evidence citations.** *Recommended:* keep them Planner-cited, as an enum over the supplied IDs. This keeps "every new prediction explains which historical evidence informed it". The alternative, deriving citations from target words, is smaller but is a learning-contract change.
3. **Theme.** *Recommended:* the Planner picks from closed presets. The alternative is one fixed preset until more artwork exists.
4. **Live strict compile check.** Proving the schema compiles takes one real request per tool (Teaching, Probe, Successor). That is a paid call in verification, which needs your approval.
5. **Parent retry after a refusal.** Should the retry use the same configured model only (current rule), or may it name a second configured model? Recommended: same model, until `stop_details` evidence shows why it refused.
6. **In-flight old-contract cycles** (step 6): delete the readers after the inventory, or keep them indefinitely.

## 8. What this does not fix

- **F, code pipeline and lifecycle (43 entries, 32%).** Examples: readiness and publication disagreements, loading-curtain races, stale greetings, blocked-node promotion. These are runtime bugs with no AI field involved; a smaller contract does not touch them.
- **G, generated activity HTML (21, 16%).** Plus the 7 repair-loop entries in B. The same root cause shows up there: the Creator writes code-known runtime contracts (child ID, config-URL load, `GameBridge.reportState`, item IDs; L398, L520, L524). It is a natural follow-up, not part of this change.
- **Provider transport (D).** Fewer calls reduce exposure but do not remove timeouts, credit exhaustion or receipt identity issues.

## 9. Evidence gaps

- The 2026-10-19 demo-session receipts (21b4cc) were not found in the `sunny-board-canvas` worktree or in recent output folders. The refusal is cited from the brief. Its cause is unknown because `stop_details` was not saved; step 0 exists for exactly this reason.
- Whether `activities[].difficulty` is read by the spelling runtime was not traced.
- The line estimates come from function spans, not from a trial implementation.
- The no-overlap claim for deterministic layout is a design claim until the step 1 tests exist.
