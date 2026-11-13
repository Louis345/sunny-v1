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

- [x] Protect all dirty Reina, Ila, creator, QA, generated, output, and temporary files from product commits.
- [x] Create or confirm a clean implementation branch/worktree from the intended product checkpoint.
- [x] Record the starting branch and commit.
- [x] Record the starting hash for the existing math production entrypoint.
- [x] Run the current focused tests and production build before behavioral changes.
- [x] Confirm the existing production path remains the rollback path; this slice is not wired into normal ingestion.

Proof:

```text
Branch: codex/adaptive-math-two-phase
Starting commit: 9a2cc9db431e6916c6f1768c1a90b8ed1778e208
Test command/result: baseline focused suite, 5 files / 135 tests passed
Build command/result: npm run build passed before behavioral changes
Rollback path/hash: src/scripts/ingestMathDirect.ts at cfd6fa3031076a9e488bec8b01982fa299ba285624d42cf69386487e4d5418a2; active child/session files are untouched
```

## Gate 1 — Independent Opening Evaluation

### Story

```text
Given a captured math assignment and child chart
When Sunny prepares the first child chapter
Then it produces fresh items that measure assignment concepts and prerequisites
And it does not teach or reveal answers before the child’s first response
```

- [x] Add the evaluation prompt and validated response schema.
- [x] Start adaptive decisions from `getChildChart(childId)` or an existing `LearningDecisionContext` built from it.
- [x] Bind every evaluation item to a construct, prerequisite, source lineage, exposure identity, response contract, and correct-answer contract.
- [x] Prohibit copying school worksheet questions into the reusable evaluation bank.
- [x] Record preregistered assumptions, predictions, uncertainty, and falsifying evidence before launch.
- [x] Separate independent, assisted, exposed, unresolved, and `instrument_ambiguous` results.
- [x] Ensure evaluation completion never becomes an automatic mastery conclusion.
- [x] Produce one playable isolated opening-evaluation artifact.

Human checkpoint 1:

- [ ] The first action is understandable within ten seconds.
- [ ] The task is age-appropriate.
- [ ] The evaluation feels playful enough to attempt.
- [ ] The first response is genuinely independent.

Proof:

```text
Red test: adaptiveMathTwoPhase.test.ts initially failed because the contract module did not exist
Green test: adaptiveMathTwoPhase.test.ts — opening schema, chart doorway, lineage, answer-contract, source-copy, light-rewrite, and preregistration invariants passed within the 135-test focused root suite
Artifact: outputs/adaptive-math-two-phase/2026-08-17T00-33-44-594Z/opening-evaluation.html
Screenshot: visually inspected in the in-app browser at 127.0.0.1:4197; wrong-answer replay recorded evidence and did not trap progression
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

- [x] Produce demonstrated constructs with evidence IDs.
- [x] Produce holes or misconceptions with evidence IDs.
- [x] Preserve attempt, assistance, exposure, device, response-mode, and artifact provenance.
- [x] Record confidence, uncertainty, and next evidence required.
- [x] Distinguish conceptual errors from prompt, input, scoring, and speech-recognition friction.
- [x] Prevent one incident from becoming “dislikes typing,” “visual learner,” or another durable label.
- [x] Hash and persist the findings packet before the board Planner receives it.

Proof:

```text
Red test: factual findings assertions failed before createMathEvaluationFindings existed
Green test: adaptiveMathTwoPhase.test.ts — factual findings and label guard passed
Findings packet: outputs/adaptive-math-two-phase/2026-08-17T00-33-44-594Z/evidence/findings.json
Packet hash: recorded as findingsHash in summary.json and worker-job.json
```

## Gate 3 — Evidence-Citing Intervention Decision

### Story

```text
Given the immutable findings packet and child history
When the Planner chooses what happens next
Then it cites the evidence and chooses an appropriate intervention type
```

- [x] Use the existing Planner role; add no evaluator agent.
- [x] Permit `visual_explainer`, another catalog intervention, another bounded evaluation, or transfer-oriented planning.
- [x] Require decision ID, evidence IDs, confidence, uncertainty, falsifying evidence, and measurement keys.
- [x] Do not hardcode Visual Explainer as the universal response to a weak evaluation.
- [x] Do not allow engagement evidence to change academic correctness.
- [x] Preserve the decision before any creative artifact is generated.

Proof:

```text
Red test: evidence-citing decision assertions failed before the decision validator existed
Green test: adaptiveMathTwoPhase.test.ts — decision evidence resolution passed
Decision artifact: outputs/adaptive-math-two-phase/2026-08-17T00-33-44-594Z/decisions/intervention-decision.json
Decision hash: recorded in the worker job identity
```

## Gate 4 — Visual Explainer Teaching Bridge

### Story

```text
Given a diagnosed gap that needs a concrete mental model
When the Planner selects Visual Explainer
Then Sunny teaches that exact gap while background board work proceeds
And the explainer writes practice/support evidence only
```

- [x] Reuse the existing Visual Explainer shell, state machine, board routing, and evidence events.
- [ ] Inject the diagnosed construct, misconception, source evidence, and child context through the artifact contract.
- [x] Remove science-only assumptions from generic runtime events.
- [x] Keep prediction/reveal interactions `masteryEligible: false`.
- [x] Treat the current answer-visible exit check as teaching recap, not independent evidence.
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
Red test: VisualExplainer.test.tsx reproduced the hardcoded science domain
Green test: VisualExplainer.test.tsx — 14/14 passed using the web worktree test runner
Artifact: outputs/adaptive-math-two-phase/2026-08-17T00-33-44-594Z/visual-explainer.html
Screenshot: visually inspected and interacted with in the in-app browser; the artifact labels itself teaching-only and directs measurement to a later fresh item
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

- [x] Audit and reuse existing checkpoint/resume primitives before adding worker code.
- [x] Extract or expose a callable existing board-building operation instead of duplicating ingestion.
- [x] Pass `homeworkId`, `cycleId`, decision ID, frozen extraction, chart snapshot, findings packet, and academic hash.
- [x] Persist worker phase, expected artifacts, completed artifacts, missing artifacts, call usage, latency, and failure.
- [x] Prove the worker cannot reread the PDF or reset the opening-evaluation cycle.
- [x] Prove repeated invocation is idempotent.
- [x] Preserve every completed artifact across a sibling failure.
- [x] Keep the existing board playable by leaving normal publication unchanged.
- [x] Keep child-blocked time at zero in the worker contract.

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
Red test: worker test failed until reportArtifact checkpointing was added
Green test: adaptiveMathTwoPhase.test.ts and runAdaptiveMathTwoPhaseLab.test.ts passed
Restart/resume log: report audit records planning → designing → building → provider_paused → building → ready
Idempotency log: rerun after ready executes zero builders
Unchanged artifact hashes: baseline-intervention hash survives the simulated sibling interruption
```

## Gate 6 — Evidence-Informed Proof Board

### Story

```text
Given the evaluation findings
When the existing board factory runs
Then it creates one coherent targeted board containing a teaching intervention and a fresh, fun independent evaluation
```

- [x] Opus receives the findings packet and historical evidence rather than assignment-only guesses.
- [ ] Fable receives the immutable academic contract and retains creative control.
- [ ] Existing Opus/GPT builders receive unchanged runtime requirements.
- [x] Build one fixture primary baseline intervention for zero-cost orchestration proof.
- [x] Build one fixture fresh post-intervention evaluation for the same construct.
- [x] Ensure post-intervention items are structurally equivalent but unexposed.
- [ ] Allow Fable to make the evaluation fun without answer exposure or invalid scaffolding.
- [ ] Build independent artifacts concurrently.
- [ ] Record generated/reused status, tokens, cost, and latency by artifact.
- [x] Do not generate Quest, Boss, rewards, or speculative Support in this gate.

Proof:

```text
Red test:
Green test:
Board packet: outputs/adaptive-math-two-phase/2026-08-17T00-33-44-594Z/board.html
Board screenshot: visually inspected through the in-app browser at 127.0.0.1:4197
Artifact hashes: audit/worker-job.json
Latency/cost: fixture proof records 0 paid calls and $0; real provider factory acceptance remains unchecked
```

## Gate 7 — Before/After Learning Proof

### Story

```text
Given an independent starting result, one intervention, and a fresh independent result
When Sunny evaluates the episode
Then it reports measured change and remaining uncertainty without claiming unsupported causation
```

- [x] Match pre- and post-evaluation items to the same construct and difficulty boundary.
- [x] Compare independent evidence separately from assisted or ambiguous evidence.
- [x] Classify the result as improved, unchanged, weaker, or inconclusive.
- [x] Record the exact intervention exposure between measurements.
- [x] State only that improvement is consistent with helping until repeated or externally calibrated.
- [x] Produce a local visual report showing belief → before → intervention → after → next evidence.
- [x] Include worker latency, calls, cost, hashes, and restart history in a collapsed audit section.
- [x] Confirm no real child tree changed.

Human checkpoint 3:

- [ ] The before/after report matches the observed episode.
- [ ] The report is understandable without terminal logs or raw JSON.
- [ ] The experience demonstrates enough value to proceed to production migration.

Proof:

```text
Red test: before/after and report assertions failed before the comparison/report runner existed
Green test: runAdaptiveMathTwoPhaseLab.test.ts passed within the 135-test focused root suite
Report: outputs/adaptive-math-two-phase/2026-08-17T00-33-44-594Z/report.html
Screenshot: visually inspected through the in-app browser at 127.0.0.1:4197; report displays PASS, 0/1 before, 1/1 after, uncertainty, zero calls, and unchanged child data
Human note:
```

## Gate 8 — Release-Quality Verification

- [x] Run every focused test introduced by Gates 1–7.
- [x] Run the production build.
- [x] Run `git diff --check`.
- [x] Run one zero-cost interruption/restart acceptance lab using recorded model fixtures.
- [ ] Run at most one explicitly approved paid acceptance episode if fixtures pass.
- [x] Confirm the current production path and rollback board remain available.
- [x] Confirm real Reina and Ila trees are byte-identical to their protected starting state.
- [ ] Run a read-only second-agent review against `AGENTS.md` Laws 1–14.
- [x] Record every unrelated discovery in `BUGS.md` instead of expanding scope.
- [ ] Create one bounded product-code commit only after human acceptance.

Proof:

```text
Focused tests: root 135/135; web Visual Explainer 14/14
Production build: passed (server TypeScript + web TypeScript/Vite)
Diff check: passed
Interruption lab: PASS at outputs/adaptive-math-two-phase/2026-08-17T00-33-44-594Z/report.html; frozen opening/exit artifact hashes and the validated decision hash are bound into the comparison; real Reina/Ila trees unchanged, zero paid calls, complete fixture cost accounting
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
