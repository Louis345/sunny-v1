# Review: Elli db75fc0 (parent 68a5345) and isolated setup a8c9970

## Artist → canvas verdict (restated)

**No violation.** db75fc0 does not touch the Planner, the Experience Creator, the board definition, layout, locks, readiness or the "Not ready" path. `recordedActivityStatus` is read from the chart and projected only into Elli's context. Nothing feeds it back into the board. The prompt edits remove a withdrawal instruction and several prohibitions, which matches "more freedom, less constraint."

The real risks fall under "code reports truth" and evidence integrity, not artist/canvas.

## Findings

### 1. Stale status can survive when the node is cleared (Medium, likely blocker for the truth claim)
**Location:** `session-manager.ts`, `buildCurrentBoardContextForTurn`.

The refresh runs only when `currentBoardSnapshot?.nodeId` is truthy. Whether a stale value survives depends on how `updateCurrentBoardSnapshot` builds the snapshot, which is not shown:
- If it merges with the previous snapshot, a later update with no `nodeId` (for example, map view with no selection) keeps the old node's `recordedActivityStatus`.
- `buildCurrentBoardSnapshotContext` would then print it with no "Current node" line.

The unknown-node case is tested. The missing-node case is not.

**Test needed:** set the status to `completed` on node A, then update to a snapshot without a `nodeId`. Assert that no `Recorded activity status:` line appears. The fix should clear the field when there is no `nodeId`, not just skip the refresh.

### 2. Status is turn-time only; other context paths may lack it (Medium, unknown)
Removing the snapshot-time initialization (done for the size budget) made `buildCurrentBoardContextForTurn` the only writer. If any other path injects board context, it will show `Phase: complete` without a saved status, which is the original failure mode. Such paths could include:
- immediate pushes on screen events,
- proactive or idle prompts,
- session resume.

I cannot see whether such callers exist.

**Test needed:**
1. Enumerate every caller of `buildCurrentBoardSnapshotContext` and `buildActivityCompanionContext`.
2. Assert that each either goes through the refresh or cannot carry phase without status.

The README's claim that "turn-time refresh remains the single source" is accurate only if this holds.

### 3. Unguarded chart read on every turn (Medium)
`getChildChart(this.chartChildId)` now runs synchronously inside conversational context assembly, with no try/catch. If the chart is missing, mid-write or malformed, the throw could break turn context for that conversation. That conflicts with Law 4 (no silent failures, and no unhandled failures).

**Tests needed:**
- If `getChildChart` throws, context still builds and omits the status line.
- The failure is logged in the ` 🎮 [component] [action] [result]` form.

Separately, the per-turn disk read is an acknowledged latency cost that has not been measured. That is acceptable to defer, but it should not be called negligible.

### 4. Raw state strings are ambiguous to the model (Low–Medium)
`Recorded activity status: ready` means the node is unfinished, but in ordinary English "ready" can read as "done/ready to move on." The explanatory line helps but does not define the values.

A factual vocabulary would remove the ambiguity, for example "ready = available, not completed." This is reporting truth, not scripting dialogue. Acceptance should specifically check what Elli says after Word Builder reports `complete` while the node is still `ready`.

### 5. Hidden-assessment protection now relies on structure plus purpose wording (Low–Medium)
In `stimulus_only` mode, the explicit "Do not model syllables or reveal written letters" was replaced with a purpose statement. The structural protection remains: the target is not supplied in that mode. However, Elli may still infer the word from replayed audio or room speech and then model syllables.

The updated assertion only proves the new string exists. It is not a behavioral guarantee.

**Needed:** a realistic conversational evaluation, without paid calls unless the human approves them, in which the child asks for help during evaluation. Check that the reply supports the task without spelling content. If it leaks, treat that as a measurement-integrity defect.

### 6. Remaining instruction conflicts are only partially checked (Medium, unknown)
The new prompt test excludes two phrases. It does not scan the rest of the assembled prompt for withdrawal or anti-teaching guidance, such as mode supplements and other soul files. It also does not cover Matilda: `companion-base.md` changes apply to Reina's companion, but Matilda's personality was not reviewed. Reina's homework sessions are therefore affected by this change but have not been examined.

**Needed:**
- Dump the full assembled homework prompt for both companions and review it.
- Add a negative assertion for Matilda if similar text exists.

### 7. Removed "change the explanation after an unsuccessful hint" (Low, accepted tradeoff)
This removal follows the principles. However, the observed failure was repeated offers without delivering help, and the change now depends on purpose wording alone to fix that. Only the human session can show whether it did. Test counts do not establish usefulness; the README states this correctly.

### 8. Test quality (Low)
`mock.results[0].value` couples the test to call order of the mocked `getChildChart`. That is fragile but acceptable. The new test also calls `buildCurrentBoardContextForTurn` twice for one assertion pair, which is harmless.

### 9. Process (Medium)
- **Hook bypass:** human-authorized and disclosed, with no full-suite pass at db75fc0. That is acceptable for the first human session. A full backend/web pass at the final revision should be required before merge.
- **Diagnosis confirmation:** AGENTS.md requires human confirmation of the diagnosis before edits. The README records authorization of the changes but not explicit confirmation of the diagnosed chain. That record should be added, or its absence stated.
- **Lab invariant:** the human-caught behavior needs a lab invariant entry in `BUGS.md`, explaining why logs and the lab missed it. I see none.

### 10. Isolated setup a8c9970 (Medium, containment)
**Location:** `children.config.json` in the isolated checkout.

The change correctly addresses the observed `Invalid child name` error, because `childIdFromSessionName` resolves only configured profiles. However, it is a commit to a tracked production file.

**Risks:**
- Accidental push or cherry-pick into the PR branch would register a demo child in production.
- The acceptance runtime is db75fc0 plus a8c9970, so the tested revision is not the PR revision.

**Required:**
1. Show `git diff 68a5345..db75fc0 -- children.config.json` is empty on the PR branch.
2. Confirm a8c9970 is not on any pushed or PR branch.
3. Record both SHAs in the acceptance record.
4. Confirm that `elli-help-demo` resolves to an isolated chart and that the session writes nothing under Reina's or Ila's data.

The registry test (3 passed) does not cover the new entry. It only shows the existing tests still pass. No new validator is added, which is correct.

## Blockers

**Before calling truthful progress fixed:**
- #1: missing-nodeId staleness test and fix.
- #2: caller audit.
- #3: chart-read failure handling with a log line.

**Before human acceptance:**
- Containment evidence for a8c9970 (#10).
- Full assembled-prompt review for remaining conflicts (#6).

**Before merge:**
- Human acceptance judging delivered help, audible clarity, truthful status and correct assistance attribution.
- A full test pass at the final revision.
- Recorded diagnosis confirmation and lab invariant.
- Explicit human merge approval.

## Unknowns (not claimed either way)
- How `updateCurrentBoardSnapshot` merges snapshots.
- Other context injection paths.
- Matilda's personality text.
- Whether a new spoken explanation actually helps a child.

## Verdict
- **Artist/canvas:** no violation; the canvas is untouched and status is projected read-only.
- **Principles:** the direction is correct. Prohibitions are replaced by purpose and facts, and no scripts, keyword branches or retries are added.
- **Implementation:** not yet sufficient for "code reports truth" because of #1–#3. Address those and the containment proof, then proceed to the human session.
- **Merge:** not mergeable. Acceptance is pending and no full pass has been run at this revision.