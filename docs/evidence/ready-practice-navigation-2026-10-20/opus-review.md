# Review: PR18 commits fa83e6b and 810c35c

**Verdict: Request changes.** Both commits move in the approved direction: more child freedom, with honest capability limits. One concrete launch/projection mismatch is a blocker. One likely new regression needs a one-line guard. One evidence-attribution question must be checked before merge.

This review is not approval. No human acceptance or merge authorization exists for these commits.

## Direction check

| Commit | More freedom, less restraint? | Capabilities truthful? |
|---|---|---|
| fa83e6b: spelling Teaching/successor boards selectable without sequence locks | **Yes.** The scope is narrow: `domain === 'spelling'` and board kind `teaching` or `successor`. Batch-closed lifecycles still block launch. The authored path stays as the recommended frontier (`progress.currentNodeId`). | **Yes, for the definition path.** Launch still requires verification, a ready/active/completed state, membership on the current board and a published board. |
| 810c35c: withdraw word-builder | **Neutral to positive.** It removes a dead end rather than adding a restriction. The path passes over the portal via `notReady` in `journeyFrontier`. | **Yes.** The Planner sees the contract as `reference_only`. The tool is gone from discovery and the generated registry. Historical portals render "Not ready" without mutating stored records. |

Neither commit restores sequence restrictions. My fixes below also do not restore them.

## Blockers (new in these commits)

### B1. Legacy and no-definition boards bypass the word-builder launch block (810c35c)

**The mismatch:** in `canonicalJourneyLaunchable`, the early return

```ts
const frontier = canonicalJourneyFrontier(cycle);
if (!frontier) return undefined;
```

runs before the `!unavailableActivityReason(node)` check.

- For any historical board without a `definition`, the function returns `undefined`, which is the "legacy navigation contract".
- Meanwhile `projectLearningCycle` marks the same node `locked: true` through `nodePlan`.
- Result: the projection says locked/Not ready, but launch falls through to whatever legacy navigation permits. This is exactly the launch/projection mismatch the commit claims to prevent for "historical word-builder portals".

**Smallest fix:** hoist the capability check above the frontier return.

```ts
const node = cycle.nodes.find(n=>n.nodeId===nodeId);
if (node && unavailableActivityReason(node)) return false;
const frontier = canonicalJourneyFrontier(cycle);
if (!frontier) return undefined;
```

**Missing test:** a legacy-kind cycle with no definition and a `word-builder` node should assert `canonicalJourneyLaunchable(...) === false`.

### B2. Two activities can now be active at once (fa83e6b)

**The regression:**

- Before this commit, only the single frontier node was launchable. That implicitly prevented a second concurrent `active` node.
- Now any ready, verified node launches. The new condition does not check whether another board node is already `active`.
- `assertJourneyChoiceAvailable` already refuses choices with `journey_choice_activity_in_progress`. Activity launch has no equivalent guard.
- This risks interleaved completion and exposure writes, which threatens "actual learning records must remain intact".

**Smallest fix:** inside the free-selection clause, add one condition that only refuses launch while a different node on this board is in progress:

```ts
&& !cycle.nodes.some(n => n.nodeId !== nodeId && currentBoardInstance(cycle).nodeIds.includes(n.nodeId) && n.state === 'active')
```

Mirror it in the renderer by gating `allowReadyActivitySelection` on the same "no other active activity" condition (the renderer already does this for choices). This is not a sequence restriction. It only blocks launching while another activity is running.

## Must-verify before merge (possible evidence-truth defect)

### V1. Checkpoint exposure lineage under out-of-order play

- AGENTS.md says code "derives checkpoint exposure lineage" from the authored sequence.
- The new test explicitly makes the spelling `checkpoint` node available before `chunks` and `practice` are done.
- If lineage is derived from the definition order rather than from actually completed nodes, a checkpoint played first would be attributed as "after exposure". That would be a fabricated learning claim.

**What to do:** confirm that checkpoint evidence records the actually completed predecessors at the time of the attempt.

- If it does not, the smallest fix is to compute lineage at completion as the authored predecessors intersected with the completed nodes.
- Do **not** re-lock the checkpoint; the human rejected that.

The commit's doc text ("actual exposure records… keep their existing contracts") only holds if this is true. I could not verify it from the supplied diff.

## Non-blocking observations

- **Unchosen-branch portals become available.** A child can launch a branch activity without selecting the choice. This is consistent with "selectable without sequence locks". Note that no route-selection engagement evidence is recorded in that case, and the frontier falls back to the first declared execution. That fallback is pre-existing behavior.
- **`publishedAt` is checked inconsistently.** The renderer does not check it, but launch does. This is harmless if unpublished boards are never projected to the child. It is a pre-existing pattern.
- **The test name overstates scope.** "opens every prepared spelling teaching activity" also covers successor boards, but only `teaching` is exercised. Add one `successor` case and one non-spelling (math) case asserting the old frontier-only behavior.
- **Completed historical word-builder nodes behave correctly.** They stay "completed" because the renderer filters completed nodes out of `notReady`. Replay is blocked by launchability, which is acceptable and truthful.
- **Registry regeneration should be guarded.** The test asserts both `discoverGames()` and `TEACHING_TOOLS` omit word-builder, so a stale generated file would be caught. Good.

## Pre-existing (not regressions from these commits)

- The default execution with no route selection is the first-declared option.
- `renderBoardDefinition` trusts the caller to supply only published boards.
- `/games/word-builder.html` still exists on disk. Direct URL access is outside the canonical launch path. That is acceptable, but note it if a non-canonical companion launcher accepts raw URLs.

## Preserved invariants (verified from the diff)

- **Probe boards:** unchanged. The test asserts locked and non-launchable.
- **Math and other domains:** unchanged, because the free-selection path is gated on `domain === 'spelling'`.
- **Immutable definitions:** untouched. Changes are projection- and launch-time only, and `notReady` is derived, not persisted.
- **Completion, exposure and learning records:** no write-path changes in either commit, subject to B2 and V1.
- **Real child data:** the claim that no records were modified and no re-ingestion is needed is consistent with the diff. Nothing here writes child data. The reported test and build passes are the author's reports, not results I observed. No synthetic observation in the diff is transferred to real children.

## Summary

Fix B1 (hoist the capability check) and B2 (one-active guard), and confirm V1. With those three resolved, both commits faithfully implement the approved "more freedom, truthful capabilities" change.