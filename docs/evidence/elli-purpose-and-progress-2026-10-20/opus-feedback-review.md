# Review: PR18 @ a97e851, "Show saved evaluation results on loading word cards"

**Verdict: not ready for the fresh full-assignment human test yet.** The rendering approach is sound and small. Two issues should be fixed first:

- One can stall or reset the "look" phase, which is a progression/latency change the request ruled out.
- One widens the change beyond "add a mark" by replacing which words appear on the loading cards.

Both are small fixes. No human acceptance exists at this revision, and merge is not permitted.

---

## Blocking defects

### B1. Unstable memo dependency can restart the review timers
**Location:** `useAppAdventurePreparation.tsx`, the `items` `useMemo`. The look-state `useEffect` depends on `items`.

- Before this change, `items` was keyed on `scope` and `words.join("|")`, so its identity stayed stable across packet refreshes.
- It now also depends on `input.packet?.spellingEvaluationResults`. `buildChildExperiencePacket` builds a new array on every call.
- So any packet refetch or reparse while the screen is visible gives `items` a new identity. That retriggers the look effect:
  - it sends `REVIEW_STARTED` again,
  - clears the pending `REVIEW_ITEM` and `REVIEW_DONE` timers,
  - and starts the roughly 4–5.5 s dwell over.
- If the packet refreshes more often than the dwell, the chapter screen can stay stuck in "Looking at what you did."
- None of the 39 web tests cover this. The new hook test renders once with a static packet.

**Fix:** Derive a stable key, such as `results.map(r => `${r.display}:${r.correct ?? "-"}`).join("|")`, and put that in the dependency array. Alternatively, make the look effect depend on a word-only key rather than on `items`. Add a test that rerenders the hook with an equal but freshly allocated packet and asserts that `REVIEW_DONE` still fires.

### B2. `preparationWords` now replaces the card word set, not just annotates it
**Location:** `useAppAdventurePreparation.tsx`, `preparationWords`, together with the lifecycle gate in `childExperiencePacket.ts`.

- The gate is `!["evaluation_ready","evaluation_active"].includes(lifecycle)`. That is true for every later lifecycle: targeted planning, teaching, successor, and any future state.
- Whenever results exist, they take priority over the Word Radar and `nodePlan` targets. The "held" or resume surface for a later session will show the evaluation words with marks instead of the words it showed before.
- The new early return also skips the dedupe and the `.slice(0, 16)` cap.

The request was "a simple indication on existing cards", so changing which cards appear is out of scope. Unrepeated old evaluation marks appearing on a later session's loading screen is also a provenance problem: the marks would describe a past check, not what the child is about to do.

**Fix:**
- Leave `preparationWords` as it was.
- Attach `correct` only where an existing card's word matches a result.
- Narrow projection, the surface, or both to the post-evaluation handoff, e.g. lifecycle `targeted_planning` or `surface === "chapter"`. Confirm the intended scope with the requester.

---

## Should fix before the human test (correctness and provenance)

### S1. Observation selection takes the first match, not the authoritative one
**Location:** `childExperiencePacket.ts`, `observations.find(...)`.

If the evaluation writer can record more than one row per item (retry, correction, re-submit), the mark shows the earliest row. Confirm the writer guarantees one row per item per evaluation. If it doesn't, pick the last row, or the row the evaluation scoring logic treats as canonical. The mark must agree with whatever the system actually scored.

### S2. The `sourceId` convention is asserted only by a hand-built fixture
The test constructs `sourceId: "evaluation:eval"` by hand. No test proves that the real recorder writes exactly `evaluation:${nodeId}`. If the format differs, every card silently shows no mark, which looks like "unknown" rather than an error.

**Fix:** Add one test that records observations through the real evaluation recording path and then builds the packet. Alternatively, cite the writer's line in the PR description.

### S3. Multiple evaluation nodes
`flatMap` runs over every `role === "evaluation"` node. With a re-evaluation or several evaluation nodes in one cycle, words repeat. The hook then matches by `display`, so the first node's mark wins, possibly a stale one. Restrict to the single completed evaluation node for the current cycle, or dedupe and prefer the latest node.

### S4. "Correct" vs. assisted
`result.correct === true` is used directly. The label "Correct" is honest, and nothing claims mastery, which is good. However, if evaluation rows can carry assistance metadata (a hint, a reveal, a read-aloud of letters), a green check could still be misread as "knew it unaided."

- Confirm evaluation is help-free by construction.
- If it is not, either show no mark for assisted items or have the requester confirm that "correct" means correct regardless of help.

This is a question to answer, not a confirmed defect.

---

## Minor / optional

- **Display-string matching in the hook.** Matching results to cards by `face` string is fragile (case, duplicate words). Carrying `correct` on the item from the source list would be cleaner. This becomes moot if B2 is fixed by annotating at the source.
- **Glyph rendering.** The Unicode ✓ and ✕ depend on the font and can render as emoji or at an inconsistent weight on some devices. The file already has `CheckIcon` and SVG icon conventions; using the existing SVG check and a matching cross would be consistent and look the same everywhere. The 1280x720 screenshots used one environment only.
- **No layout CSS for `.ap-result`.** It sets color only, with no gap or margin. Screenshots looked acceptable. Check narrow or tablet widths, and a 16-card tray if that is still possible.
- **Wording mismatch.** The accessible label says "To practise" while sighted users see a red ✕. The softer wording is reasonable for a child, but the two channels say different things. Pick one meaning deliberately with the requester.
- **Color contrast.** `#17643b` and `#a52b28` should pass on a light card. Verify against the actual card background, and note that meaning doesn't rely on color alone because the glyphs differ. That part is good.

---

## Scope check against the request

| Constraint | Status |
|---|---|
| Visual mark only on existing cards | **Violated by B2** (the word set changes) |
| No tutoring changes | OK. Narration and the Elli context payload are untouched; marks are not sent to Elli. |
| No scoring changes | OK. Read-only projection. |
| No board changes | OK |
| No latency or progression changes | **At risk from B1** (the review phase can restart) |
| Green check / red cross / no mark for unknown | OK. `not_sure` and missing rows show no mark, and practice rows are correctly excluded (tested). |
| Correct ≠ mastered | Labels comply. See S4 on assistance. |

## Organic-first artist/canvas principles

**Broadly yes.** The change reuses the existing card instead of adding a results panel or score summary, introduces no new surface or animation, and keeps the cards tappable to hear the word. Two caveats:
- The Unicode glyphs depart from the hand-drawn SVG icon language used everywhere else on the canvas (optional fix above).
- Showing old evaluation marks on later-session loading screens (B2) works against the "the canvas reflects what's happening now" principle.

## Readiness for human testing

**Not yet.** Fix B1 and B2, and add the rerender-stability test. Answer S1 and S2 by checking the evaluation writer, ideally with one test through the real recording path. Then rerun the 11 backend and 39 web tests plus the build, and do the fresh full-assignment human test.

During that test, the tester should specifically watch:
- the look phase advancing on schedule while status polling is running,
- that marks appear only on the post-evaluation chapter screen,
- that a "not sure" word shows no mark,
- and that a later resume or held session shows no stale marks.

Passing tests and the visual inspection don't replace that human acceptance.