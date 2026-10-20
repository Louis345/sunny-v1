# Verdict: one in-scope length cap remains; no evidence, tool or disclosure regressions found

The delta does what it claims: the personality, free-chat and worksheet caps are removed, and answer recording and tool protocol are intact. However, one rigid length cap survives in the assembled prompt, and the new tests cannot detect it. Fix it before freezing source. Everything else is non-blocking or pre-existing.

## Should fix before freeze (in scope)

**1. A one-sentence cap remains in the `takeGameScreenshot` tool description.**
- **Location:** assembled prompt → `## Your tools` → `### takeGameScreenshot`: "After taking the screenshot — ONE sentence response only."
- **Conflict:** it directly contradicts the new `elli.md` Screen Awareness line, "Explain plainly at a useful length…"
- **Fix:** soften it, for example: "React as a friend would; don't narrate everything you see."
- **Test gap:** the new test looks only for "Respond in one plain sentence", so it misses this cap. Extend the regex, for example `/ONE sentence response only|one sentence per turn/i`. A broader `/\b(one|1|two|2) sentences?\b.*(max|only|at most)/i` sweep over the assembled prompt would catch future variants.

## Non-blocking, pre-existing, outside the length-only scope

These are worth logging in the PR as known contradictions with the principles. Do not fix them silently.

**2. The worksheet supplement contains a fixed hint ladder.**
- **Location:** `### When the Child is Wrong`, which scripts 1st, 2nd and 3rd wrong-answer responses.
- **Conflict:** it contradicts `CHILD_AUTHORITY_RULE`: "There is no fixed hint ladder."

**3. Two worksheet instructions blur supported practice and independent evidence.**
- "If they want to skip a problem… sessionLog(correct: true, ...)" in `### How This Works`.
- "After 3 wrong: Walk through the answer… sessionLog(correct: true, ...)" in `### When the Child is Wrong`.
- Both log assisted or skipped items as correct. This conflicts with "Completion with assistance is supported practice, not independent mastery" and with `sessionLog`'s own `skipped: true` path.
- This is the most substantive evidence concern in the full prompt. It is not introduced by this delta, but it should be flagged against `LEARNING_FEEDBACK_LOOP.md`.

**4. The worksheet supplement contradicts itself on counting.**
- It says "Do NOT count coins yourself", but grading steps say "Count or calculate the answer yourself" and disagreement handling says "count together out loud".

**5. The base prompt scripts a tangent redirect.**
- `## Tangents and explaining games` allows "engage… for **one** response only" plus a canned redirect line.
- The worksheet supplement allows "1-2 turns".
- Neither is a length cap, but both are scripts.

## Disclosure

- The independent-checkpoint bullet in `elli.md` changed from "help briefly" to "offer the live context's whole-word replay or instruction clarification". This is narrower and now matches `GAME_REVEAL_RULE`, which is good.
- **Minor ambiguity:** the next bullet ("When the child asks… explain the idea, or choose a helpful analogy") is not explicitly scoped away from checkpoints. Consider adding "During practice," so analogies cannot be read as permitted during independent checkpoints.
- No other disclosure loosening was found. The Wheel rule, written hidden answers and the letter-by-letter prohibition are unchanged.

## Test and probe coverage

**6. The worksheet supplement is tested only in isolation.**
- The worksheet test asserts on the supplement, not on an assembled worksheet-mode prompt.
- Your principles call for verifying the assembled prompt.
- **Separate concern:** the adventure branch says "Do not use canvasShow, canvasClear, or canvasStatus", while the worksheet supplement depends on `canvasShow`. Confirm the two are never co-assembled, or add an assembled worksheet-mode test.

**7. Probe and test side effects need confirming.**
- Confirm that `buildSessionPrompt` writes no cache or context files for the synthetic profiles ("Practice" and "synthetic-prompt-probe").
- The probe sets `process.env.ADVENTURE_MAP` globally without restoring it. That is acceptable in a one-shot script, but note it.

## Scope of this review

This covers prompt and test consistency only. It makes no claim about human usefulness, approval or merge readiness. Those still depend on the full hook rerun on frozen source and the human gates.
