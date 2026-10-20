# Re-review: PR18 follow-up (B1 fix, B2 challenge, V1 verification)

**Verdict: No remaining blockers from my prior review. Ready for human testing.**

This is not approval. Human acceptance and explicit merge authorization are still required. The 135 passing tests and the build result are the author's reports. I did not observe them. The full suite was not re-run.

## B1: Resolved

**Evidence from the diff:**
- `unavailableActivityReason(node)` now returns `false` before the `canonicalJourneyFrontier` early return, so legacy and no-definition boards can no longer fall through to `undefined`.
- The check still comes after the `publishedAt === null` guard, so unpublished boards remain refused first.

**The fix reaches every caller that matters:**
- `SessionManager` uses `canonicalJourneyLaunchable(...) ?? [state check]`. Because the function now returns `false` rather than `undefined`, the `??` fallback no longer applies, and a legacy word-builder launch is recorded as `rejected`.
- `instrument_observed` throws `learning_cycle_node_not_launchable` on `=== false`, so observation writes are also blocked.

**Test coverage:** The new legacy case covers the exact gap: kind `legacy` with the definition deleted asserts `false`. You report it failed before the fix and passed after. That is the right shape of evidence.

## B2: Withdrawn

I accept the challenge. My premise was wrong on two points:

1. **`state === 'active'` is not a live lease.** It is a persistent "partial response captured" state. The `instrument_observed` path with `completed === false` sets it, and returning to the map does not clear it. The single-active guard I proposed would have trapped a child after any partial activity. That restores exactly the restraint the human rejected.
2. **The old frontier rule never truly prevented concurrency.** Partial `active` states could already persist under it.

**The real concurrency control is the live launch, and I verified it in the supplied source:**
- **One launch at a time.** `SessionManager` holds one `spellingLaunch`. A new `opening`/`launched` replaces it, and `closed` with a matching node and token releases it.
- **Stale completions are refused.** The completion route rejects a launch whose homework, node or token does not match (`spelling_completion_launch_mismatch`). It requires a live launch when the chart is persisted (`spelling_completion_launch_required`). So completing node A after switching to node B is refused.
- **Stale snapshots are ignored** when they carry an old token for the current node or item.

The new regression test correctly asserts that a partial node does not block launching another ready node.

**Residual notes (non-blocking, pre-existing):**
- **Missing launch token.** If a launch has no `launchToken`, the token comparison is skipped. Same-node stale completion then relies only on node identity. This does not create cross-node concurrency.
- **No launch-required check outside persisted mode.** When neither `SUNNY_CHART_DIR` is set nor a certification run is active, completion proceeds without a launch. This is acceptable because nothing is persisted, but it should stay non-production.
- **Partial-observation path not reviewed.** I did not see the partial-observation write path. It is described as bound through `bindSpellingAssessment` with `launch:this.spellingLaunch`, and I am taking that on the source excerpt rather than a full trace.

## V1: Verified, with one test weakness

**Evidence from `projections.ts`:**
- `previouslyExposed` is computed only from `item.presented` events where:
  - the sequence is lower than this response's sequence,
  - the word is the same, and
  - the presentation was either answered earlier (in commit order) or was a different presentation with `practice` instrument or visible support.
- Nothing reads `interventionNodeIds` or the authored order. Exposure is therefore actual and ordered, with no retroactive credit.

**Evidence from `originalResponses.ts`:**
- It records only real presentations bound to a launch.
- Responses must cite an existing presentation, and the adapter never invents one after an answer.

**Test weakness (should fix, not a blocker):**
- In the new test, the third assertion (second checkpoint `previouslyExposed === true`) is overdetermined.
- The first checkpoint's presentation was answered, so it alone already counts as exposure, even if the lesson were ignored.
- The test therefore does not prove that the lesson presentation counts as exposure.
- **Suggested change:** assert that the lesson's event ID is the exposure source, or add a variant with no answered first checkpoint.

**Documentation:** Clarify the AGENTS.md wording ("derives checkpoint exposure lineage" from the authored sequence). Authored lineage is planned context, and exposure claims come only from presentation events. This prevents a future reader from wiring the planned order into evidence.

## Scope checks

| Case | Expected behaviour | Status |
|---|---|---|
| Successor board | Launchable | Covered |
| Math | Frontier-only, locked | Covered |
| Probe | Locked | Covered |
| Unverified or unavailable activity | Refused | Covered |

No ingestion changes, child-data writes or learning write-path changes appear in the diff.

## Suggested human test focus

1. **Spelling: partial then switch.** Start activity A, answer one item, return to the map and launch B. Then confirm:
   - B launches.
   - A late or stale completion from A is rejected.
   - A shows as resumable.
2. **Checkpoint-first play.** Play the checkpoint before the lessons and confirm the chart shows no prior exposure for it.
3. **Historical word-builder portal.** Confirm it shows "Not ready" and cannot be launched, including on a legacy board.
4. **Math board.** Confirm it still enforces frontier-only launching.