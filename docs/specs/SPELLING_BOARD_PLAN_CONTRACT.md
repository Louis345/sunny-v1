# Spelling board generation: one small contract instead of three large ones

Status: **proposal, revision 2, awaiting human approval (AGENTS.md "Stay in scope [Law 6]")**. No production code is changed on this branch.
Base: `claude/board-canvas-no-logic` at `0b41c115`. Date: 2026-10-19.

**Revision 2 (after review).** Revision 1 proposed replacing the AI map artist with a fixed code layout. That would have given every journey of the same shape the same map. The human rejected it: Ila's delight at the 2026-10-18 board ("Mommy it's an octagon design") showed the reveal of a new design is part of the experience, and the goal is **different patterns and designs from board to board**. Revision 2 keeps the Planner as the artist and the board as the canvas:
- The AI (Planner plus map artist) paints every spelling board. That now includes the Probe and Successor boards, which today run on an older contract.
- The artist gets more creative room than it has today, not less.
- Code only fills in the values it already knows. It draws a portal itself only where the AI placed nothing, so a refusal still produces a board.

Decisions recorded from the review are in §7.

## 1. Summary

**The hypothesis holds, with one correction.** Every spelling board is generated through an AI output contract that asks the model for many values code already knows. Each wrong value has been answered with a new validator, then a correction pass, then a guard against the correction drifting. The correction is that the branch has already moved part of the way. Contract 38 (`95996304`) took portals, paths, edges and checkpoint lineage away from the Teaching Planner. What is left:

1. **Three spelling board contracts, not one.**
   - The **Probe** board is a full `AdventureBoardDefinition` written by the intake Planner: positions, edge geometry and CSS theme, checked on a real canvas and repaired by a bounded correction.
   - The **Teaching** board is a journey sequence written by the Planner, then a map drawn by the Fable map artist in up to three calls with screenshots.
   - The **Successor** board is again a full `AdventureBoardDefinition`, written by the progression Planner, checked on canvas, and corrected through journey, reference and citation patches.
2. **The Teaching Planner tool is about 4× larger than it needs to be.** It is 19.7 KB with 196 properties and a six-way union over activity forms. It still asks for activity IDs, duplicate `type`/`activityId` fields, six Word Radar capture flags, measurement IDs and kinds, `finalCheck`, `maxDelayDays`, an `evidenceUsed` restatement and explainer option IDs. It is left non-strict because the 2026-10-18 live compile check rejected it as "compiled grammar is too large" (`src/engine/strictTools.test.ts`).
3. **The map artist is boxed into one pattern.** Since `d9ae7cdf` (2026-10-14) its prompt (`designNativeBoard`, `src/engine/directMathExperience.ts`) has fixed the placement:
   - a 7×3 grid,
   - the shared journey on the middle row,
   - a fork's two options on the top and bottom rows, rejoining in the middle,
   - an empty cell between stops.

   A fork drawn this way is always the same ring (roughly a hexagon or octagon), which is probably the shape Ila loved. The Oct 18 board itself is on Saori and was not inspected (§9). The background is a one-value enum. So the artist's real freedom is eight palette colours and edge styles, which is the opposite of the goal.
4. **An artist refusal stops the whole board.** This happened on 2026-10-14 (BUGS.md L548) and on 2026-10-19 (demo 21b4cc). The 10-19 cause is unknown because `stop_details` was not recorded.

**Proposal.**
- **One `BoardPlan` contract for the Planner on every spelling board.** The Planner chooses only from code-supplied enumerations: instrument modes, assignment words, evidence IDs and activity slots. Free text is kept for child-facing language and pedagogy. Code fills in IDs, bindings, capture flags, launch configuration and measurement bookkeeping. Measured under the repo's `strictBudget`, the schema is 4.9 KB with 54 properties, 0 optional fields and 4 unions, small enough for `strict: true`.
- **One map-artist contract for every spelling board**, aimed at variety:
  - free placement on the canvas, with no fixed grid or lanes;
  - curve choices for paths;
  - a pattern name the artist commits to;
  - theme presets;
  - a factual list of the patterns used on her previous boards, so it can make something new.

  Code supplies measured portal sizes and the screen areas that are taken. It never rejects or reworks the map.
- **One canvas rule instead of failure branches:** any portal the artist left unplaced gets a position from a simple code layout. A refusal therefore still publishes the Planner's journey, drawn plainly, with a log line. This generalizes the existing "unplaced portal goes to a fixed logged spot" rule.

**What it buys:**
- One Planner contract and one artist contract across all spelling boards.
- No correction stages on spelling boards (four families today).
- Strict-locked output.
- An artist failure can no longer stop a board.
- 39 of the 70 board entries caused by the AI output contract or its provider (56%) can no longer block or corrupt a board.
- About −60 production lines net (likely range −30 to −120; §5). This is less than revision 1, because the artist stays. The larger deletion is the legacy planner path (optional step 7).

**What it does not fix** (§8): about half of the 134 board-generation entries are code-pipeline or generated-activity (HTML) bugs.

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
| `portals[].cell.{landscape,portrait}.{col,row}` | **AI, over-constrained** | The creative core. Today it is limited to a 7×3 / 3×4 grid with prescribed lanes (§1), which yields one recurring shape. Revision 2 gives free normalized placement. |
| `edges[].controlPoints` | AI → enum | Serialized-geometry bugs (L540, L542) came from free point arrays. Replace them with a per-edge `curve` choice (`straight`, `arc`, `wave`, `loop`); code draws the curve. |
| `edges[].style` (`solid`/`dashed`/`glow`) | AI | Taste. |
| `theme.background` | Code | Already a one-value enum (`silent-letter-world.jpeg`). |
| `theme.palette` (8 CSS colours) | AI → preset | Invalid CSS (L507–L510) and a downgraded look (L536) came from here. The artist picks a preset (decision 3a); each preset's contrast is checked once. |
| `whatISee`, `rationale` | AI | Self-review; kept, and logged. |
| *(new)* `pattern` | AI | The design idea the artist commits to (for example "octagon ring", "spiral", "mountain climb"). Logged, saved with the board, and fed back as presentation history for variety. |

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
- **C:** 6 of 6 can no longer block a board. Code never rejects geometry (the v38 rule, extended to Probe and Successor); free point arrays are gone under strict; taken screen areas are given to the artist as facts. An overlap can still appear and is judged in screenshots.
- **E:** 3 of 3, if the live compile check passes (§7, decision 4).
- **Total:** 39 of 70 (56%). **D:** an artist refusal no longer stops a board; Planner-call and transport failures remain. **H** stays, correctly.

**Why labs kept missing these.** One reason recurs in the "why the lab missed it" notes: the lab injected well-formed AI output. Each new invalid shape came from a live model and got its own validator. With a strict, enum-only contract, the set of shapes the model can return is finite and is enumerated by the schema itself. The lab can generate all of them.

## 4. Target contract: `BoardPlan`

### 4.1 Ownership

| AI decides (Planner: lesson; artist: picture) | Code fills in, the same way every time |
|---|---|
| **Planner:** which instrument modes (enum: launchable catalog `activityId:modeId`) | Node, portal, path, edge, option, measurement and check-option IDs (namespaced by assignment and position) |
| **Planner:** which words each activity targets (enum: assignment words) | `type`/`activityId`, native launch config, capture flags (from the mode's catalog config) |
| **Planner:** sequence (opening, optional choice with options, closing, by slot `A`–`L`) | Measurement role, `evidenceType`, `finalCheck`, horizon (from the parent schedule), checkpoint exposure lineage (already derived in v38) |
| **Planner:** prediction numbers and criteria; evidence citations (enum: supplied evidence IDs, decision 2a) | `targetLane` from word groups; activity targets from the explainer words |
| **Planner:** child-facing titles, labels, choice question, hypotheses, endpoint label; explainer content; theory | Start, choice and endpoint portals; connections (already derived in v38) |
| **Artist:** pattern, portal placement (free), path curve and style per edge, theme preset (decision 3a) | Curve geometry from the chosen curve; palette CSS from the preset; a fallback position for any portal the artist did not place (§4.3) |

Planner authority as AGENTS.md defines it is unchanged, and so is the Creator's authority over the picture. Code invents no route, deletes no choice, reorders nothing, and never rejects or moves an artist-placed portal.

### 4.2 Schema (Teaching body; Probe and Successor share the journey part)

Drafted and measured in scratch, with 20 words, 25 evidence IDs and 14 instrument modes in the enums, using `strictToolSchema` and `strictBudget` from `src/engine/plannerTransport.ts`:

| | Bytes | Properties | Optional | Unions | Strict-unsupported |
|---|---:|---:|---:|---:|---:|
| Current Teaching Planner | 19,717 | 196 | 21 | 13 | 0 after rewrite (rejected live as "too large") |
| Current successor/probe `boardDefinition` | 5,305 | 56 | n/a | n/a | n/a |
| Current map-artist composition | 2,959 | 34 | n/a | n/a | n/a |
| **Target `BoardPlan`** (measured with a theme field since moved to the artist) | **4,872** | **54** | **0** | **4** | **0** |

```ts
$defs: { word: enum(assignment words), instrument: enum(launchable activityId:modeId),
         evidenceId: enum(supplied IDs), slot: enum('A'..'L') }
{
  title: string, endpointLabel: string,
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

**Successor:** the decision fields stay. `contentId` becomes an enum, and `nextInstruments[]` loses `nodeId` and gains `slot`. `boardDefinition` is replaced by the same `opening/choice/closing/endpointLabel` block. The artist then paints it (§4.3).

### 4.3 The artist's canvas, and the fallback layout

**Artist contract** (one strict tool per stage, same for Probe, Teaching and Successor boards):

```ts
{ whatISee: string, pattern: string, theme: $theme,
  portals: [{ portal: $portalId, landscape: {x, y}, portrait: {x, y} }],   // x, y in 0..1
  edges:   [{ edge: $edgeId, curve: enum(straight, arc, wave, loop), style: enum(solid, dashed, glow) }],
  rationale: string }
```

- **IDs come from enums.** Portal and edge identities are enums of the frozen journey's IDs, so the artist cannot invent or misspell one.
- **Facts the artist is given.**
  - The real portal sizes, measured with the label (`measureBoardPortals`, already exists).
  - The screen areas that are taken: the level badge, the status bar, and Elli's corner.
  - The safe area and the minimum spacing.
  - Up to 2 rendered looks (unchanged).
- **The prescriptive grid and lane rules are removed from the prompt.** These are the rules that produce one recurring shape.
- **Variety.** The artist also receives a short factual list of the `pattern` and `theme` values of this child's previous boards. Its brief: make each map a new design she has not seen, a world she wants to finish. This is presentation history, never child evidence (decision 7). Her reaction to a design remains engagement evidence under `LEARNING_FEEDBACK_LOOP.md`, separate from academics.
- **Overlap.** It is never a reason to reject. It is visible in the saved screenshots and the generation report, and judged by the human (the v38 rule, unchanged).

**Fallback layout.** `layoutJourney(expanded journey)` is a small pure function in `src/shared/` that places portals in a simple left-to-right trail with one lane per option. It is used for exactly one thing: **any portal without an artist position**.
- Nothing missing: the artist's map is drawn exactly.
- Two portals missing: those two get layout spots, logged as `🎮 [board] [portal] [fallback-position]`. This already exists, at a single fixed spot.
- The artist refused, timed out or returned nothing readable: every portal gets a layout spot, logged as `🎮 [experience-creator] [composition] [fallback-layout] reason=…`. The board publishes.

If the artist refuses after a look, the last composition it previewed is its own work. Using it is better than the plain layout. That needs one sentence changed in the learning contract (decision 7).

The fallback layout is exhaustively tested for overlap, since the shape space is finite (12 activities, at most one choice). That way the plain board is at least tidy.

### 4.4 Theme presets

`THEME_PRESETS` is a table of `{id, background, palette, edgeStyles}`, each with its `text`/`panel` contrast checked in a test. The artist picks one (decision 3a). Only one illustrated world exists today (`silent-letter-world.jpeg`), so the first presets are palette variants on it. More artwork means more presets, with no contract change. The approved look stays: illustrated Grok world, inviting portals, animated dashed or glow paths.

### 4.5 Truth checks that remain, and what each degrades

Under strict mode these cannot fire for new responses. They stay because saved non-strict receipts can still be replayed, and because each guard needs a test:

- An unassigned word, an unknown evidence ID, or an unsupported instrument marks that one portal **Not ready** (existing behaviour).
- Explainer content that does not join back to the word, or a check without exactly one correct option, marks that portal Not ready.
- A visual-explainer instrument with `explainer: null` marks that portal Not ready.
- A slot that is referenced but never defined, or defined twice, is logged and left off; this is the existing `node-missing` / `node-repeated` behaviour.

## 5. Deletion plan

Each step is its own red-green change (AGENTS.md Laws 1 and 3) with its own invariant. Line counts are estimates from current function spans, production code only.

| Step | Change | Deleted | Added | Net | Proof (red first) |
|---|---|---:|---:|---:|---|
| 0 | **Refusal diagnostics.** Save the full provider response, including `stop_details`, for every board stage. | 0 | ~3 | +3 | Lab invariant: an injected refusal's receipt contains `stop_details`. The human caught 10-19 because loading never finished. Logs said `[refused]` with no reason. The lab injected the refusal and asserted only the stop. |
| 1 | Add the fallback `layoutJourney` and `THEME_PRESETS` (pure, unused). | 0 | ~80 | +80 | Exhaustive no-overlap test of the fallback layout; reserved-area test; preset contrast test. |
| 2 | **Teaching artist: free canvas, variety, never stops the board.** Remove the grid and lane prescription and the cell/grid helpers. Strict artist tools with portal and edge enums. Add `pattern`, `curve`, theme preset and previous-pattern facts. A refusal, unreadable reply or missing composition uses the fallback layout, replacing the `learning_design_provider_refused` throw. | ~25 | ~35 | +10 | **(a)** An injected refusal publishes the Planner's journey with every portal on the fallback layout, makes no further provider call, and logs `[fallback-layout]`. **(b)** Artist positions are published unchanged (existing invariant). **(c)** The prompt carries no grid or lane rule and lists previous patterns. **(d)** Live (decision 4): one strict artist compile and one sandbox evaluation-to-board run. Screenshots go to the human for the design check. |
| 3 | **Teaching Planner → strict `BoardPlan`.** One flat activity form plus `compileBoardPlan` replaces `spellingActivityFormSchema`, `nativeActivityBase`, `nativeSpellingMeasurement` and the `deriveNativeActivity` config derivation, and drops the hydrate-time relationship re-check. The old hydrate stays read-only for saved receipts. | ~60 | ~80 | +20 | `strictBudget` test (unsupported = [], optional ≤ 24, unions ≤ 16). Every output shape is generated from the enums. Old-receipt replay is unchanged. Live strict compile (decision 4). Flip the "keeps the lesson Planner unlocked" test. |
| 4 | **Probe on the shared path.** The intake Planner picks `diagnostic.instrument` (enum) and labels; code builds start → diagnostic → end; the artist paints it. Delete `intakeBoardSchema`, `spellingIntakeCorrectionSchema`, the intake canvas verification, the correction half of the `planSpellingIntakeFromSource` catch block, and the tool-schema override (use `strictTool`). | ~95 | ~25 | **−70** | Every `select` intake publishes a playable Probe board. No `authoring-correction` stage is ever written. The correction cases in `spellingDiagnosticSelection.test.ts` become "cannot occur". |
| 5 | **Successor on the shared path.** A `BoardPlan` journey replaces `BOARD_DEFINITION_TOOL_SCHEMA`; `contentId` becomes an enum; the artist paints it. Delete the journey-correction and reference-patch branches and the successor canvas gate for spelling. Math keeps its path. | ~35 | ~20 | **−15** | Each progression action publishes a successor. No correction stage is written. Update `spellingSuccessorContract.test.ts`. |
| 6 | **Drain and delete legacy readers,** after a read-only inventory of in-flight old-contract cycles in the real children's contexts (decision 6a). | ~80 | 0 | **−80** | Inventory attached. Published boards stay readable. |
| | **Total** | **~295** | **~243** | **≈ −50** | Likely range −20 to −110. |

**Per file:** `assignmentPlanner.ts` about −130; `learningCycleRuntime.ts` about −15; `directMathExperience.ts` about +10; a new `src/shared/boardPlan.ts` about +90.

**This is a small net reduction.** The value is in removed failure surfaces, not lines: three Planner contracts become one, two canvases become one, four correction families go to zero, and artist failure no longer blocks a board. The larger deletion is **optional step 7** (separate approval): the legacy `planAssignmentFromSource` path. It holds `callAssignmentPlannerModel` with its measurement correction, the canvas correction, `planAssignmentFromSourceInternal`, and about 150 lines of forgiving Word Radar normalizers, roughly −400 to −600 lines in all. It needs a caller audit first, because `ingestHomework.ts:1499` and `sunnyIngest.ts` still call it. Math is untouched (Math Prompt Chain Boundary).

**Commit count.** Since the merge-base with `main`, 85 commits touch the two hot-path files (the brief's 107 likely used another range). Two further files were created on this branch: `adventureBoardDefinition.ts` (332 lines) and `adventureBoardCanvas.ts` (172 lines).

**Order.**
- Steps 0–2 first: they stop artist failures from blocking boards and open the canvas.
- Step 3 shrinks the Planner.
- Steps 4–5 move the Probe and Successor boards onto the same path. This is the AGENTS.md rule that a path keeps its old checks until its author can see its own work.
- Step 6 waits for real data to drain.
- Each step leaves the system shippable.

## 6. Degrade path: what the child sees

| Failure | Child sees | Log | Recovery |
|---|---|---|---|
| Artist refuses, times out, returns nothing readable, or places nothing | **Board publishes.** Every portal of the Planner's journey is on the plain fallback layout (or on the artist's last previewed map, decision 7). | `🎮 [experience-creator] [composition] [fallback-layout] reason=… stop_details=…` | None needed for her; the human sees the plain board and the reason in the report |
| Artist leaves some portals unplaced | Board publishes; only those portals use fallback spots | `🎮 [board] [portal] [fallback-position]` | None |
| A colour key or preset is unusable | Board publishes; that key falls back to the preset default | `🎮 [experience-creator] [theme] [fallback]` (exists) | None |
| One activity fails a truth check | Board publishes; that portal shows **Not ready** and the path passes over it | `🎮 [board] [portal] [not-ready] reason=…` (exists) | None |
| **The Planner itself** refuses or returns nothing readable | No new lesson exists to draw, and the learning contract forbids code-authored teaching plans. So the completed Probe board stays, she may replay it as practice, Elli says her next map isn't ready, and **Stop for now** keeps everything. | `🎮 [learning-planner] [response] [refused] stop_details=…` | Parent retry, at most 3, existing rule (decision 8) |

The two live refusals (10-14 and 10-19) were both the artist. Under this design both would have published a board.

## 7. Decisions

**Recorded from the review (2026-10-19):**

1. **The map artist stays, and the goal is variety.** The AI paints every spelling board, with different patterns and designs. Revision 1's deterministic layout is withdrawn. Code draws a portal only where the AI placed nothing.
2. **(a)** Evidence citations stay Planner-cited, as an enum over the supplied IDs.
3. **(a)** Themes come from closed, contrast-checked presets; the artist chooses among them.
4. **Yes:** paid calls are approved for the live strict-compile checks and one sandbox evaluation-to-board run in steps 2 and 3.
5. **No use-case branches that end board generation.** One canvas rule (fallback positions for unplaced portals) covers artist refusal, timeout and partial output. There is no second-model fallback. The refusal root cause is investigated from the `stop_details` that step 0 records.
6. **(a)** Delete the legacy readers after the in-flight inventory.

**Still open:**

7. **Two learning-contract wording changes (v39).**
   - **(i)** Allow the artist to see the `pattern` and `theme` of the child's earlier boards. This is presentation history for variety, not child evidence; the contract currently forbids feeding Creator prose forward as evidence, so the exception should be stated.
   - **(ii)** On an artist refusal after a look, publish the last composition it previewed. The 10-14 fix currently forbids treating a preview as the final submission. The alternative is to always use the plain fallback layout.
   - *Recommended: allow both.*
8. **Planner failure.** This is the only case left with no new board, because no lesson exists to draw. Keep the honest wait, with probe replay and parent retry (recommended, and consistent with the learning contract)? Or do you want another option considered?

## 8. What this does not fix

- **F, code pipeline and lifecycle (43 entries, 32%).** Examples: readiness and publication disagreements, loading-curtain races, stale greetings, blocked-node promotion. These are runtime bugs with no AI field involved; a smaller contract does not touch them.
- **G, generated activity HTML (21, 16%).** Plus the 7 repair-loop entries in B. The same root cause shows up there: the Creator writes code-known runtime contracts (child ID, config-URL load, `GameBridge.reportState`, item IDs; L398, L520, L524). It is a natural follow-up, not part of this change.
- **Provider transport (D).** Fewer calls reduce exposure but do not remove timeouts, credit exhaustion or receipt identity issues.

## 9. Evidence gaps

- **The 2026-10-18 "octagon" board was generated on Saori and is not on this machine,** so its shape was inferred from the code it ran (the grid and lane rule since `d9ae7cdf`), not inspected. Copying its saved `boardDefinition` and generation screenshots from Saori would confirm which design choices produced it.
- **The 2026-10-19 demo receipts (21b4cc) were not found** in the `sunny-board-canvas` worktree or recent outputs. The refusal is cited from the brief, and its cause is unknown without `stop_details` (step 0).
- **Variety is a design goal, not a measured outcome.** No unit test can prove the artist makes different maps. The proof is the per-board `pattern` log plus the human's review of live boards.
- **Unchecked or untested claims:**
  - Whether `activities[].difficulty` is read by the spelling runtime was not traced.
  - Line estimates come from function spans, not a trial implementation.
  - The fallback layout's no-overlap claim holds only once the step 1 tests exist.
