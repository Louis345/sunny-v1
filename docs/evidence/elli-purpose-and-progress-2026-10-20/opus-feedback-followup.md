# Re-review: PR18 @ 8c0a5e1, B1 and B2 follow-up

**Verdict: B1 and B2 are both addressed. The PR is ready for the fresh human full-word test.** Merge still requires human acceptance, and none exists at this revision.

## B1: unstable memo dependency restarting review timers. **Addressed.**

**What changed:** `items` now depends on `resultsKey = JSON.stringify(results)` instead of the array reference. An equal packet that is freshly allocated now produces the same key. `items` keeps its identity, so the look effect does not re-fire.

**Is the test meaningful?** Yes. The new test rerenders with a freshly built packet every 1 s for 7 s. That refresh interval is shorter than the roughly 4.3–4.5 s dwell, so the old code would have reset the timers on every refresh and never left `look`. The test asserts the state reaches `plan`, so it would fail if the old behaviour came back.

**Residual behaviour (acceptable, not blocking):**
- `mode` resolves from `null` to `chapter` in an effect, which changes `resultsKey` once. This happens before `active` becomes true, so before `look` starts. No restart.
- If the saved results genuinely change in content during `look`, the dwell restarts. That is a real data change, not a polling artefact.
- The same is true of a change in `words.join("|")`, which predates this PR.

## B2: `preparationWords` replacing the card word set. **Addressed.**

**What changed:**
- The early return in `preparationWords` is removed. The card set again comes only from the Word Radar or `nodePlan` targets, with dedupe and the `.slice(0, 16)` cap restored.
- Marks are only looked up for words already on a card, and only when `mode === "chapter"`. Chapter mode is reached only through the `targeted-planning` handoff.

**Test coverage:**
- `old-word` is not added as a card.
- The `held` surface shows no mark on a matching word.

**Packet gate:** The lifecycle gate in `childExperiencePacket.ts` is still broad. This is fine because the hook-level chapter gate is what controls display.

## Prior S-items, resolved by the stated evidence

| Item | Status |
|---|---|
| **S1** (first row vs. latest) | Resolved. Taking the first recorded evaluation response is the intended semantics: it is the original evaluation, not later practice. |
| **S2** (`sourceId` format) | Resolved. The writer `recordSpellingDiscoveryAttempt` in `learningCycleRuntime.ts` writes `evaluation:${node.nodeId}`, which matches the projection. A recorder-path test would still be nice to have, but it is not required. |
| **S3** (multiple evaluation nodes) | Resolved as intended. Keeping all instruments is deliberate. One minor note: if the same word appears in two instruments with different outcomes, `results.find` in the hook shows whichever comes first. Worth a glance during the test if that case can occur. Not a blocker. |
| **S4** (correct vs. assisted) | Resolved. A check means "correct response". The labels never claim unaided or mastered. |

## What to watch in the human full-word test

- The look phase advances on schedule while status polling is running.
- Marks appear only on the post-evaluation chapter screen, and only on words already on the cards.
- Word Radar or target words that match evaluation words get their marks. A display or case mismatch would show no mark, which is the correct fallback for "unknown", but confirm the real words actually match.
- "Not sure" and missing words show no mark.
- A later resume or held session shows no marks.

## Checks and approval

The reported 11 packet and 40 preparation tests pass. Those results, plus this review, do not replace the human acceptance needed before merge.