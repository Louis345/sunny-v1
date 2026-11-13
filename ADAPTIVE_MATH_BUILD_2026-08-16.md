# Adaptive Math Build — 2026-08-16

## Purpose

This is the execution contract for Sunny's two-phase adaptive math path. It is a checklist, not a doctrine document. `LEARNING_FEEDBACK_LOOP.md` remains the sole normative learning-loop contract.

The checklist keeps the human and implementing agent accountable to observable proof. A task is complete only when its proof is linked or recorded here.

## Locked Product Pattern

```text
Parent ingests homework
→ Sunny extracts concepts and prerequisite relationships
→ Sunny consults the child chart and preregisters predictions
→ Sunny builds one fresh independent opening evaluation

Child completes the evaluation
→ Sunny records demonstrated knowledge, holes, assistance, and ambiguity
→ Planner decides whether a Visual Explainer is appropriate

If Visual Explainer is appropriate
→ child receives a teaching-only visual intervention
→ worker builds the targeted board asynchronously

If Visual Explainer is not appropriate
→ opening chapter closes cleanly
→ worker builds the targeted board asynchronously

Child returns to a complete evidence-informed board
→ baseline intervention
→ fresh, fun independent evaluation
→ continue or skip prebuilt intervention based on evidence
→ Quest transfer
→ Boss synthesis
→ readiness prediction

Parent returns marked homework
→ Sunny calibrates its prediction
→ complete, reassess, or prepare targeted Support
```

## Locked Decisions

- Evaluation and the teaching board are two phases of one canonical homework cycle, not separate pipelines.
- Initial ingestion creates the opening evaluation, not the complete speculative board.
- The existing Opus → Fable → Opus/GPT board factory remains the production board builder.
- The worker calls the existing board-building stage with the frozen extraction, child-chart snapshot, and evaluation findings.
- The worker must not reread the PDF, restart planning from zero, reset the cycle, or repeat valid paid work.
- Visual Explainer is an optional Planner-selected intervention for a demonstrated gap suited to a mental model.
- Visual Explainer is teaching-only and cannot establish mastery.
- Every primary teaching intervention is followed by fresh, independent evidence for the same construct.
- Fun presentation is allowed in an evaluation; answer exposure before the first response is not.
- The complete teaching board is built concurrently after evaluation. It does not regenerate after every node in this milestone.
- A prebuilt node may be skipped when earlier evidence makes it unnecessary.
- Quest evaluates fresh transfer. Boss evaluates fresh synthesis and produces a readiness prediction, not confirmed readiness.
- Returned marked work or a delayed independent reassessment confirms or contradicts readiness.
- Real child data is never used for implementation proof.
- Model comparison and model-policy changes occur only after the contracts and orchestration are proven.

## Today’s Autonomous Goal

Implement and prove the first vertical slice:

```text
assignment fixture
→ independent opening evaluation
→ factual findings packet
→ one evidence-citing intervention decision
→ optional Visual Explainer teaching bridge
→ resumable worker handoff to the existing board builder
→ one baseline intervention
→ one fresh independent evaluation
→ truthful before/after report
```

The current production path remains available until this slice is accepted.

## Evidence Required for Every Checkbox

Every completed checkbox must cite at least one:

- failing test followed by passing test;
- terminal log proving the state transition;
- stable artifact or evidence hash;
- local report path;
- screenshot;
- human acceptance note;
- commit hash.

“Implemented,” “looks correct,” or model-generated prose alone is not proof.

## Gate 0 — Safety and Baseline

- [ ] Protect all dirty Reina, Ila, creator, QA, generated, output, and temporary files from product commits.
- [ ] Create or confirm a clean implementation branch/worktree from the intended product checkpoint.
- [ ] Record the starting branch and commit.
- [ ] Record hashes for the existing math production entrypoint and one known playable board.
- [ ] Run the current focused tests and production build before behavioral changes.
- [ ] Confirm the existing board remains the rollback path.

Proof:

```text
Branch:
Starting commit:
Test command/result:
Build command/result:
Rollback board/hash:
```

## Gate 1 — Independent Opening Evaluation

### Story

```text
Given a captured math assignment and child chart
When Sunny prepares the first child chapter
Then it produces fresh items that measure assignment concepts and prerequisites
And it does not teach or reveal answers before the child’s first response
```

- [ ] Add the evaluation prompt and validated response schema.
- [ ] Start adaptive decisions from `getChildChart(childId)` or an existing `LearningDecisionContext` built from it.
- [ ] Bind every evaluation item to a construct, prerequisite, source lineage, exposure identity, response contract, and correct-answer contract.
- [ ] Prohibit copying school worksheet questions into the reusable evaluation bank.
- [ ] Record preregistered assumptions, predictions, uncertainty, and falsifying evidence before launch.
- [ ] Separate independent, assisted, exposed, unresolved, and `instrument_ambiguous` results.
- [ ] Ensure evaluation completion never becomes an automatic mastery conclusion.
- [ ] Produce one playable isolated opening-evaluation artifact.

Human checkpoint 1:

- [ ] The first action is understandable within ten seconds.
- [ ] The task is age-appropriate.
- [ ] The evaluation feels playful enough to attempt.
- [ ] The first response is genuinely independent.

Proof:

```text
Red test:
Green test:
Artifact:
Screenshot:
Human note:
```

## Gate 2 — Factual Findings Packet

### Story

```text
Given completed evaluation evidence
When Sunny summarizes the starting point
Then it reports what was demonstrated, missing, assisted, or ambiguous
Without inventing a learning-style label or preference conclusion
```

- [ ] Produce demonstrated constructs with evidence IDs.
- [ ] Produce holes or misconceptions with evidence IDs.
- [ ] Preserve attempt, assistance, exposure, device, response-mode, and artifact provenance.
- [ ] Record confidence, uncertainty, and next evidence required.
- [ ] Distinguish conceptual errors from prompt, input, scoring, and speech-recognition friction.
- [ ] Prevent one incident from becoming “dislikes typing,” “visual learner,” or another durable label.
- [ ] Hash and persist the findings packet before the board Planner receives it.

Proof:

```text
Red test:
Green test:
Findings packet:
Packet hash:
```

## Gate 3 — Evidence-Citing Intervention Decision

### Story

```text
Given the immutable findings packet and child history
When the Planner chooses what happens next
Then it cites the evidence and chooses an appropriate intervention type
```

- [ ] Use the existing Planner role; add no evaluator agent.
- [ ] Permit `visual_explainer`, another catalog intervention, another bounded evaluation, or transfer-oriented planning.
- [ ] Require decision ID, evidence IDs, confidence, uncertainty, falsifying evidence, and measurement keys.
- [ ] Do not hardcode Visual Explainer as the universal response to a weak evaluation.
- [ ] Do not allow engagement evidence to change academic correctness.
- [ ] Preserve the decision before any creative artifact is generated.

Proof:

```text
Red test:
Green test:
Decision artifact:
Decision hash:
```

## Gate 4 — Visual Explainer Teaching Bridge

### Story

```text
Given a diagnosed gap that needs a concrete mental model
When the Planner selects Visual Explainer
Then Sunny teaches that exact gap while background board work proceeds
And the explainer writes practice/support evidence only
```

- [ ] Reuse the existing Visual Explainer shell, state machine, board routing, and evidence events.
- [ ] Inject the diagnosed construct, misconception, source evidence, and child context through the artifact contract.
- [ ] Remove science-only assumptions from generic runtime events.
- [ ] Keep prediction/reveal interactions `masteryEligible: false`.
- [ ] Treat the current answer-visible exit check as teaching recap, not independent evidence.
- [ ] Record opened, played, predicted, replayed, completed, abandoned, assisted, and friction signals.
- [ ] Preserve artifact, prompt, model, design, and implementation hashes.
- [ ] Ensure Elli remains child-invoked and answer-hidden.

Human checkpoint 2:

- [ ] The Visual Explainer clearly teaches the observed hole.
- [ ] It is not merely another quiz.
- [ ] Elli helps without controlling the activity.
- [ ] The child can complete or leave without being trapped.

Proof:

```text
Red test:
Green test:
Artifact:
Screenshot:
Human note:
```

## Gate 5 — Resumable Worker Handoff

### Story

```text
Given an immutable evaluation decision
When background board construction starts
Then the worker calls the existing board factory with the saved evidence
And survives timeout, provider pause, or process restart without repeating completed work
```

- [ ] Audit and reuse existing checkpoint/resume primitives before adding worker code.
- [ ] Extract or expose a callable existing board-building operation instead of duplicating ingestion.
- [ ] Pass `homeworkId`, `cycleId`, decision ID, frozen extraction, chart snapshot, findings packet, and academic hash.
- [ ] Persist worker phase, expected artifacts, completed artifacts, missing artifacts, call usage, latency, and failure.
- [ ] Prove the worker cannot reread the PDF or reset the opening-evaluation cycle.
- [ ] Prove repeated invocation is idempotent.
- [ ] Preserve every completed paid artifact across a sibling failure.
- [ ] Keep the existing board playable until the new board publishes atomically.
- [ ] Keep child-blocked time at zero.

Worker states:

```text
waiting
→ planning
→ designing
→ building
→ ready

Any active state
→ provider_paused (resumable)
→ publication_failed (old board preserved)
```

Proof:

```text
Red test:
Green test:
Restart/resume log:
Idempotency log:
Unchanged artifact hashes:
```

## Gate 6 — Evidence-Informed Proof Board

### Story

```text
Given the evaluation findings
When the existing board factory runs
Then it creates one coherent targeted board containing a teaching intervention and a fresh, fun independent evaluation
```

- [ ] Opus receives the findings packet and historical evidence rather than assignment-only guesses.
- [ ] Fable receives the immutable academic contract and retains creative control.
- [ ] Existing Opus/GPT builders receive unchanged runtime requirements.
- [ ] Build one primary baseline intervention.
- [ ] Build one fresh post-intervention evaluation for the same construct.
- [ ] Ensure post-intervention items are structurally equivalent but unexposed.
- [ ] Allow Fable to make the evaluation fun without answer exposure or invalid scaffolding.
- [ ] Build independent artifacts concurrently.
- [ ] Record generated/reused status, tokens, cost, and latency by artifact.
- [ ] Do not generate Quest, Boss, rewards, or speculative Support in this gate.

Proof:

```text
Red test:
Green test:
Board packet:
Board screenshot:
Artifact hashes:
Latency/cost:
```

## Gate 7 — Before/After Learning Proof

### Story

```text
Given an independent starting result, one intervention, and a fresh independent result
When Sunny evaluates the episode
Then it reports measured change and remaining uncertainty without claiming unsupported causation
```

- [ ] Match pre- and post-evaluation items to the same construct and difficulty boundary.
- [ ] Compare independent evidence separately from assisted or ambiguous evidence.
- [ ] Classify the result as improved, unchanged, weaker, or inconclusive.
- [ ] Record the exact intervention exposure between measurements.
- [ ] State only that improvement is consistent with helping until repeated or externally calibrated.
- [ ] Produce a local visual report showing belief → before → intervention → after → next evidence.
- [ ] Include worker latency, calls, cost, hashes, and restart history in a collapsed audit section.
- [ ] Confirm no real child tree changed.

Human checkpoint 3:

- [ ] The before/after report matches the observed episode.
- [ ] The report is understandable without terminal logs or raw JSON.
- [ ] The experience demonstrates enough value to proceed to production migration.

Proof:

```text
Red test:
Green test:
Report:
Screenshot:
Human note:
```

## Gate 8 — Release-Quality Verification

- [ ] Run every focused test introduced by Gates 1–7.
- [ ] Run the production build.
- [ ] Run `git diff --check`.
- [ ] Run one zero-cost interruption/restart acceptance lab using recorded model fixtures.
- [ ] Run at most one explicitly approved paid acceptance episode if fixtures pass.
- [ ] Confirm the current production path and rollback board remain available.
- [ ] Confirm real Reina and Ila trees are byte-identical to their protected starting state.
- [ ] Run a read-only second-agent review against `AGENTS.md` Laws 1–14.
- [ ] Record every unrelated discovery in `BUGS.md` instead of expanding scope.
- [ ] Create one bounded product-code commit only after human acceptance.

Proof:

```text
Focused tests:
Production build:
Diff check:
Interruption lab:
Paid acceptance (if approved):
Second-agent review:
Commit:
```

## Eight-Hour Time Box

```text
Hour 1    Gate 0 and code-path audit
Hours 2–3 Gates 1–3
Hours 4–5 Gates 4–5
Hour 6    Gate 6
Hour 7    Gate 7
Hour 8    Gate 8 and human acceptance
```

If the time box expires, preserve all passing work and report:

- last completed gate;
- exact failing or unfinished item;
- whether the current production path remains safe;
- whether a paid call would be required to continue;
- next smallest independently testable step.

Do not mark the goal complete because time expired.

## Explicitly Deferred

- [ ] Multiple agency routes and contextual-bandit comparison.
- [ ] Quest generation or Quest contract changes.
- [ ] Boss generation or Boss contract changes.
- [ ] Parent SMS notifications.
- [ ] Parent menu redesign.
- [ ] React Native integration.
- [ ] Returned-work workflow changes.
- [ ] Content catalog promotion (`candidate` → `reuse/revise/retire`).
- [ ] Spelling-path migration.
- [ ] Rewards or economy work.
- [ ] Evaluator-model comparison.
- [ ] Production model-policy changes.
- [ ] Fully incremental node-by-node generation.

## Later Milestones

1. Restore agency to the evidence-informed complete board.
2. Reconnect Quest as fresh transfer and Boss as fresh synthesis.
3. Produce readiness prediction and targeted Support continuation.
4. Calibrate predictions through returned marked work.
5. Promote, revise, or retire interventions using repeated before/after and delayed evidence.
6. Apply the shared lifecycle to spelling using its existing activity catalog.
7. Compare evaluator models using a frozen evidence packet and decision contract.
8. Expose lifecycle endpoints to the parent menu, SMS, and future React Native client.

## Goal-Mode Working Rules

- Update this checklist after every gate with concrete proof.
- Follow red-green testing without pausing between red and implementation in autonomous milestone mode.
- Keep each behavior change independently understandable.
- Send concise progress updates at least once per hour.
- Do not modify real child evidence or generated runtime state for product proof.
- Do not broaden the milestone because a deferred idea is attractive.
- Stop only for an external credential/provider blocker or a genuinely new product decision outside the locked pattern.

