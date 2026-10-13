# Milestone: the board does what it is told

Paste this into a fresh session. Work on `Louis345/sunny-v1`, starting from branch `codex/voice-turn-integrity` at `596d6065`.

## Read first

1. `AGENTS.md` and `LEARNING_FEEDBACK_LOOP.md`.
2. `docs/handoffs/2026-10-13-pipeline-review.md`, which records what failed and what evidence was preserved.
3. This file. Where this file conflicts with the two above, this file states the human's decision, and you update those documents as part of the milestone (see "Contract changes").

## The human's intent, in his words

> The canvas should have no logic, like a painter's canvas: when does the canvas reject the painter? Bad map, bad plan: blame the AI planner.

The roles mirror a real classroom:

- **Planner = the teacher.** It decides what this child needs: which activities, in what order, and which choices she gets.
- **Creator = the map artist.** It turns the Planner's journey into a board she wants to finish: the Grok illustrated world, vivid portals, animated glowing paths, and a sense of accomplishment. It never changes the lesson.
- **Board = the canvas.** It renders exactly what it is given, launches the bound activities, and shows truthful progress. It makes no judgments.

## Confirmed diagnosis (do not re-diagnose; build on it)

The pipeline fails because code rejects AI work and sends it back for correction, not because the AI work is bad.

1. **Creator geometry rejection, the earliest wrong decision.** The Creator outputs portal coordinates without being able to see portal sizes; labels wrap to 186 px or more. `verifyAuthoredBoardCanvas` (`src/engine/adventureBoardCanvas.ts`) renders the board at three sizes and rejects any overlap. The `repair_board_geometry` loop (`src/shared/adventureBoardDefinition.ts`, `src/engine/directMathExperience.ts` around lines 1321–1540) allows two attempts, then the job fails with `composition_missing`. Trial 9 and the human sandbox run both died here.
2. **The Planner writes the plan twice.** It writes `nodePlan` (the inventory) and a separate `journey` graph in an insertion grammar (root path, option paths, resumed closing paths). `validateBoardDefinition` rejects every mismatch between them. Every observed Planner failure was this kind of bookkeeping (`activity_portal_missing`, `path_unreachable`), or a bug in our own guards. None was a teaching mistake.
3. **The Planner must author facts that code can compute.** Checkpoint `interventionNodeIds` are validated against path order (`src/engine/spellingCheckpointLineage.ts`, `assignmentPlanner.ts` around lines 2110–2200). Code already knows the path order, so it can derive them.

Each correction costs another 30–80 s provider call, which is why no run reached a playable map within 180 s.

## Milestone scope

### 1. The Planner authors the journey in one place

Replace the portal/path/edge grammar with one sequence the Planner cannot contradict:

```
journey: {
  title,
  opening: [nodeId, ...],
  choice?: { purpose, label, options: [{ id, label, hypothesis, nodeIds: [...] }] },
  closing: [nodeId, ...],
  singlePathReason?,
  endpointLabel
}
```

- The Planner still decides everything: activities, order, labels, choices and hypotheses. Code only expands this sequence into start, activity, choice and endpoint portals, the paths and the connections, mechanically and the same way every time.
- `nodePlan` remains the activity details. If a node in `nodePlan` is not referenced in the journey, log ` 🎮 [planner] [journey] [node-unused]` and leave it off the board. Do not reject the plan.
- Code derives checkpoint exposure lineage (`interventionNodeIds`) from journey order and targets. The Planner no longer authors it, and code no longer validates it.
- Saved boards already published in the old v2 definition format stay readable and render as before. Do not migrate or rewrite them.

### 2. The Creator gets a persona and a way to see its work

- Persona: "You are Sunny's map artist. You design adventure maps a child wants to finish. You receive the teacher's journey and the illustrated world. You decide placement, palette, path style and feel. You never change the lesson."
- Give it a `preview_board` tool. It renders the real board (the same renderer as the kiosk, with the actual artwork loaded, not network-aborted) at 1280×720 and 768×1024, and returns screenshots plus measured portal boxes.
- The Creator places portals, previews, adjusts and submits. **At most 3 previews**, enforced in code as the loop guard (Law 2, with a test). After that it submits what it has.
- Code accepts the submission. It does not reject it for overlap, contrast or layout. A poor-looking map is the Creator's fault, visible in its saved screenshots and judged by the human.
- Measure the added time and report it. The 180 s target still applies.

### 3. The canvas has no logic

Delete; do not wrap:

- the overlap rejection gate in `verifyAuthoredBoardCanvas` (keep the renderer for `preview_board` and for the screenshots in the publication receipt);
- `adventureCompositionCorrectionTool`, `applyAdventureCompositionCorrection` and the `repair_board_geometry` loop;
- topology rejection codes in `validateBoardDefinition` that the new format makes impossible or meaningless;
- the Planner field-patch correction machinery for journey and lineage fields;
- code that reads old correction-receipt formats (`legacy-correction`, `measurement-field-correction-v6/v7/v8`, and so on). **Never delete saved receipt files.** Saved responses stay on disk as read-only history.

### 4. Keep only truth checks, and they never loop

These protect the children's records, not the art:

- target words must be her assigned words;
- evidence IDs must exist;
- activity types and native configurations must be supported.

A failure **does not trigger regeneration**. The board still publishes. That one portal shows a truthful "not ready" state, and the failure is logged as ` 🎮 [board] [portal] [not-ready] reason=...`. The only remaining Planner correction is for a response that cannot be parsed at all.

### 5. Truthful waiting screen

The Teaching map appears only when complete. Make sure nothing publishes a partial targeted board during preparation (`revealTargetedBoard` / `project()` in `runSpellingTargetedGeneration`). The waiting screen shows real phases from the generation status.

## Contract changes (approved in principle by the human; show him the exact diff before committing)

- `AGENTS.md`, section "Planner is the artist; the board is the canvas": replace "Return precise violations to the author through bounded correction" and similar rejection language with the canvas-has-no-logic rule above, and add the Creator persona and preview tool.
- `LEARNING_FEEDBACK_LOOP.md`: bump the version to 38. The Planner authors the journey sequence, code expands it mechanically and derives exposure lineage, and the Creator composition is accepted as submitted. Truth checks degrade a single portal and never regenerate. No map is shown during preparation.

## How to work

1. **If any requirement here conflicts with another, or with the code, stop and say so in one message: "these conflict: A vs B, which wins?"** Do not patch around a conflict. The last session spent a weekend doing that.
2. Tests first. Post the plan and the red tests, then wait for the human to say "implement".
3. Report net lines: added, deleted, and which mechanisms were removed. Deletion should clearly exceed addition in the generation path.
4. One coherent change per commit. Push to the working branch the human names.

## Hard limits

- Never modify Reina's or Ila's records or charts. Use isolated synthetic children only.
- No paid provider calls without the human's approval. Ask before each live run and state the expected cost.
- Do not retry old jobs, reset attempt budgets or edit receipts.
- No merge without the human.

## Acceptance

1. `npm run build` and the relevant tests pass. Say plainly what failed or did not run.
2. Two fresh, isolated, synthetic spelling runs go from evaluation, through the waiting screen, to a complete playable map, each within 180 s. Recovered runs do not count. These need the human's approval for paid calls.
3. Screenshots of each map at kiosk and portrait size, shown to the human. He judges the look; code does not.
4. Click through the map: every portal launches its activity, and the choice works.
5. Only a real session on Saori can prove the voice and the feel. Say so.
