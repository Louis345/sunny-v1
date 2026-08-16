# Sunny Math Feedback Loop — 2026-08-07

Status: **PASS — closed-loop release proof complete**

This file is the bounded release plan for closing Sunny's math feedback loop. It does not replace [`LEARNING_FEEDBACK_LOOP.md`](./LEARNING_FEEDBACK_LOOP.md), which remains the sole normative learning authority.

## Scope lock

Work through the checklist in order. Complete and prove one task before starting the next.

In scope:

- Complete-session evidence finalization.
- Evidence-gated Quest and Boss progression.
- Safe reingestion of the same assignment.
- Assignment readiness conclusions.
- Multiple evidence-driven sessions within one learning cycle.
- Prediction-error reporting and end-to-end proof.

Out of scope until every release gate below passes:

- Rewards, store, economy, or dopamine-game expansion.
- Board artwork, animation, sound, or companion redesign.
- Spelling, reading, science, React Native, or parent-chat work.
- New AI roles, quality harnesses, renderers, pipelines, or evidence stores.
- Model comparisons or prompt experiments unrelated to this checklist.

## Proof standard

An item is complete only when all four forms of proof exist:

1. **Invariant:** the intended learning rule is stated in `LEARNING_FEEDBACK_LOOP.md` when it changes normative behavior.
2. **Automated proof:** a focused test fails before implementation and passes afterward.
3. **Isolated system proof:** the production path runs against temporary child/cycle data with prompts, decisions, transitions, IDs, and hashes preserved.
4. **Human-readable proof:** one local report explains what Sunny believed, what happened, what it decided, and why.

Generated proof belongs under:

```text
outputs/math-feedback-loop-release-proof/<timestamp>/
├── report.html
├── summary.json
├── scenarios/
└── audit/
```

Proof runs must never mutate Reina or Ila. Preview, synthetic, Playwright, ratings, completion, and companion help must never become academic mastery evidence.

## Checklist

### 0. Freeze the starting truth

- [x] Record the current contract version, branch, commit, and product-code diff.
- [x] Record hashes for the isolated cycle before every scenario.
- [x] Add one report section listing the exact canonical files that may change.
- [x] Prove Reina and Ila remain byte-identical after every lab run.

**Pass:** the same sanitized starting cycle can be cloned repeatedly and real child files never change.

**Fail:** a proof scenario writes to real child data, begins from a different starting state, or cannot identify its source revision.

---

### 1. Finalize the complete session before the Planner decides — COMPLETE

- [x] Node completion records academic observations and leaves session finalization pending in the evaluating lifecycle.
- [x] Rating, Skip, Replay, Return, or explicit abandonment finalizes the packet exactly once.
- [x] The progression Planner cannot run before finalization.
- [x] A rating remains optional; Skip records `rating unavailable` rather than inventing a neutral score.
- [x] Academic, support, interaction, engagement, and companion evidence remain separate.
- [x] Provider failure preserves the finalized packet for one later decision.

**Automated proof scenarios:**

- [x] Node completion without modal resolution causes zero Planner calls.
- [x] Rating finalizes once and causes exactly one Planner call.
- [x] Skip finalizes once and causes exactly one Planner call.
- [x] Duplicate modal submission is idempotent.
- [x] Concurrent processes cannot own the same Planner decision lease.
- [x] Canonical cycle transitions use an atomic cross-process lock so delayed evidence cannot overwrite a decision.
- [x] Transition locks are owner-scoped, and brief contention cannot discard an already-paid Planner result.
- [x] A crashed process leaves a stale claim that can be recovered without accepting the old owner's result.
- [x] A delayed earlier-node modal cannot cause a second paid Planner call.
- [x] A locked, never-launched node cannot record abandonment evidence.
- [x] Preview finalization writes nothing.

**Human-readable proof:** [`outputs/math-feedback-loop-release-proof/2026-08-07-session-finalization/report.html`](./outputs/math-feedback-loop-release-proof/2026-08-07-session-finalization/report.html) shows the event timeline; focused runtime tests prove the stored finalization ID appears in the Planner prompt.

**Pass:** every immediate Quest/Support/Boss decision sees the complete session packet, including the modal outcome when supplied.

**Fail:** the Planner starts early, a rating changes mastery, Skip invents sentiment, or one session creates multiple decisions.

---

### 2. Require qualifying Quest evidence before Boss — COMPLETE

- [x] Boss is not an allowed action unless Quest contains target-aligned, correct, unseen, unassisted evidence.
- [x] Entirely incorrect Quest work cannot authorize Boss.
- [x] Assisted-only Quest success cannot authorize Boss.
- [x] Previously exposed Quest items cannot authorize Boss.
- [x] The Planner still chooses Boss, Support, or calibration when the evidence boundary is satisfied; code does not impose a mastery percentage.

**Automated proof scenarios:**

- [x] All-wrong Quest → Boss rejected.
- [x] Assisted-correct Quest → Boss rejected.
- [x] Reused-item-correct Quest → Boss rejected.
- [x] Fresh, correct, unassisted Quest → Boss becomes an available Planner action, not an automatic transition.

**Human-readable proof:** [`outputs/math-feedback-loop-release-proof/2026-08-07-quest-boss-evidence/report.html`](./outputs/math-feedback-loop-release-proof/2026-08-07-quest-boss-evidence/report.html) shows every Quest observation with correctness, exposure, assistance, provenance, and the resulting allowed actions. The focused release suite passes 68 tests and the production build passes without paid calls or real-child writes.

**Pass:** weak Quest evidence cannot reach Boss and qualifying evidence still requires one evidence-citing Planner decision.

**Fail:** completion alone, an incorrect answer, assistance, rating, or replay unlocks Boss.

---

### 3. Make same-assignment reingestion lifecycle-safe — COMPLETE

- [x] The assignment source hash continues to identify the same `homeworkId`.
- [x] Interrupted generation resumes only missing extraction, design, HTML, or publication work.
- [x] Reingesting a published assignment never resets completed nodes, route selection, observations, decisions, or lifecycle.
- [x] Reingestion never rewrites immutable assumptions or predictions after launch.
- [x] A changed source file receives a distinct source fingerprint and cannot silently replace the original assignment.
- [x] The normal ingestion command reports whether it found a ready, continuing, awaiting-calibration, or completed assignment without provider calls.

**Automated proof matrix:** reingest the same PDF while the cycle is:

- [x] `baseline_ready`
- [x] `baseline_active`
- [x] `baseline_evaluating`
- [x] `quest_ready`
- [x] `quest_active`
- [x] `boss_ready`
- [x] `awaiting_calibration`
- [x] `complete`

For every state, assert lifecycle, completed-node states, route history, evidence IDs, decision IDs, and immutable prediction hashes are unchanged unless the state is an interrupted generation checkpoint.

**Human-readable proof:** [`outputs/math-feedback-loop-release-proof/2026-08-07-same-assignment-reingestion/report.html`](./outputs/math-feedback-loop-release-proof/2026-08-07-same-assignment-reingestion/report.html) shows the unchanged before/after hashes and ingestion disposition for every lifecycle. The command exits before extraction and all provider work when a canonical cycle exists.

**Pass:** the same PDF is a doorway back into the same learning cycle, never a reset button.

**Fail:** prior progress disappears, an old intervention republishes, or immutable beliefs are rewritten.

---

### 4. Add one accountable assignment-readiness conclusion

- [x] Extend the existing theory decision—without another model call—with a structured readiness assessment:

```text
predicted_ready
ready_independent
ready_with_support
not_yet_ready
insufficient_evidence
```

- [x] Record scope, reason, evidence IDs, prediction-evaluation IDs, uncertainty, and one next action.
- [x] Boss completion can produce only a prediction and `awaiting_calibration`; it cannot produce `ready_independent`.
- [x] Only confirmed graded work or a delayed independent reassessment may support `ready_independent`.
- [x] Parent language distinguishes “Sunny predicts” from “Sunny believes based on returned evidence.”
- [x] The learning report names the assignment and the specific constructs covered by the conclusion.

**Automated proof scenarios:**

- [x] Strong Boss without external evidence → `predicted_ready`, awaiting calibration.
- [x] Strong confirmed returned work → `ready_independent`.
- [x] Successful work with material assistance → `ready_with_support` or insufficient evidence.
- [x] Weak returned work → `not_yet_ready`.
- [x] Ambiguous or low-confidence extraction → `insufficient_evidence`.

**Automated proof:** `learningCycleRuntime.test.ts`, `longitudinalLearning.test.ts`, `returnedWorkPipeline.test.ts`, and `LearningReportPage.test.tsx` prove the five readiness boundaries and parent-language distinction. The focused release suite passed 67 tests on 2026-08-07.

**Parent copy examples:**

```text
Sunny predicts Reina is ready for Assignment XYZ, but returned work is still needed to confirm it.
Sunny believes Reina can complete Assignment XYZ independently.
Sunny believes Reina needs more support with equal partitioning before completing Assignment XYZ independently.
```

**Pass:** a parent can see what Sunny believes, why, how certain it is, and what happens next.

**Fail:** completion is called mastery, a vague score becomes readiness, or the conclusion lacks evidence IDs.

---

### 5. Continue the same learning cycle across multiple sessions

- [x] Returned-work interpretation chooses one structured action: complete, targeted Support, or collect more independent evidence.
- [x] External evidence does not automatically complete the cycle merely because it was interpreted.
- [x] `not_yet_ready` creates one targeted next-session chapter within the same `homeworkId`.
- [x] `insufficient_evidence` requests one bounded independent reassessment.
- [x] `ready_independent` completes the cycle without generating unnecessary work.
- [x] Every new chapter has its own immutable prediction and retains links to prior evidence and decisions.
- [x] A child never receives surprise required work in the session they just completed.

**Automated proof scenarios:**

- [x] Returned work confirms prediction → cycle completes.
- [x] Returned work contradicts prediction → theory revises and Support becomes the next session.
- [x] Returned work is inconclusive → reassessment becomes the next session.
- [x] Second returned-work batch updates the same cycle without duplicating the first interpretation.

**Human-readable proof:** [`outputs/math-feedback-loop-release-proof/2026-08-08-final/report.html`](./outputs/math-feedback-loop-release-proof/2026-08-08-final/report.html) displays completion and targeted Support as different next chapters under one assignment identity.

**Pass:** Sunny keeps teaching the same concept until evidence supports readiness, while preserving every prior prediction and outcome.

**Fail:** weak returned work closes the cycle, a second board erases history, or the child is forced into unannounced extra work.

---

### 6. Track whether Sunny's predictions improve

- [x] Compute factual prediction error before Planner interpretation.
- [x] Preserve prediction, actual result, assistance condition, provenance, error, and resulting adjustment.
- [x] Show prediction accuracy by assignment and construct.
- [x] Separate practice predictions from externally calibrated predictions.
- [x] Show whether the next Planner preserved or changed the intervention because of the prior error.
- [x] Never present one successful prediction as proof that Sunny is generally accurate.

**Required report table:**

| Assignment | Construct | Prediction | Actual | Error | Evidence type | Adjustment |
|---|---|---:|---:|---:|---|---|

**Pass:** the parent can see whether Sunny is becoming better calibrated over several assignments.

**Fail:** prediction error is hidden, calculated after interpretation, or mixed with ratings and engagement.

---

### 7. Run the final closed-loop release proof

Run all scenarios from one identical sanitized starting cycle:

- [x] Strong learning + low rating → academically eligible progression; presentation evidence records dissatisfaction.
- [x] Weak learning + high rating → Support, not Quest.
- [x] Assisted success → no independent-readiness claim.
- [x] Strong baseline → Planner may generate Quest.
- [x] Weak Quest → Support or defer, never Boss.
- [x] Strong Quest → Planner may generate Boss.
- [x] Strong Boss → awaiting external calibration.
- [x] Strong returned work → ready independently and complete.
- [x] Weak returned work → targeted next session in the same cycle.
- [x] Same PDF at every lifecycle state → no reset.
- [x] Next related assignment receives prior prediction errors and theory decisions.

The final `report.html` must open with:

```text
MATH FEEDBACK LOOP: PASS / FAIL / INCOMPLETE
Complete session evidence reached decisions: Yes / No
Weak evidence was blocked from Quest/Boss: Yes / No
Same-assignment reingestion preserved progress: Yes / No
Returned work controlled readiness: Yes / No
Multiple sessions preserved one learning history: Yes / No
Next Planner used prior prediction error: Yes / No
Real child data changed: No
```

**Pass:** every row above is proven by IDs, hashes, lifecycle transitions, and readable before/after reasoning.

**Fail:** any row relies only on prompt wording, mocked conclusions without production transitions, terminal claims without an audit artifact, or real child data.

## Definition of math feedback-loop complete

The math feedback loop is complete only when Task 7 passes and a parent can answer all of these questions from the report:

1. What did Sunny believe before teaching?
2. What did Sunny predict the child would do independently?
3. What actually happened, with and without assistance?
4. Did the child enjoy or reject the presentation?
5. Why did Sunny choose Support, Quest, Boss, reassessment, or completion?
6. Does Sunny currently predict readiness or believe readiness has been externally demonstrated?
7. What will Sunny preserve or change next?
8. Is Sunny's prediction accuracy improving over time?

Until then, the branch is not finished even if every activity launches and looks polished.
