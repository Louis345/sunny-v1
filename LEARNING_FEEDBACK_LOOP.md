# Sunny Learning Feedback Loop

Contract version: 1

This document is the **sole normative** authority for how Sunny forms, tests, and revises learning claims. Product changes that alter this loop must update this contract version before implementation. Other documents may describe infrastructure or history, but they must link here instead of creating another learning doctrine.

## Product claim

Sunny should become better at choosing instruction for a child because it compares preregistered beliefs with real outcomes over time. A beautiful activity is an intervention and a measurement instrument; it is not proof that learning occurred.

```text
child chart + prior cycles + returned graded work
→ theory
→ preregistered prediction
→ intervention
→ immutable observations
→ prediction evaluation
→ exactly one theory decision
→ next intervention or stop
→ delayed or graded calibration
```

## Authority and storage

- One canonical `LearningCycleRecordV2` JSON is writable for each assignment cycle.
- Raw uploads are immutable source artifacts referenced by that cycle.
- Raw event logs are immutable supporting facts referenced by ID.
- `getChildChart()` derives longitudinal history by reading canonical cycles.
- **No second writable factsheet** may summarize or override the cycles.
- Board, homework, session, and care-plan files are compatibility projections, never competing decision state.

Code owns identity, provenance, immutability, mathematical/source truth, exposure tracking, and safe lifecycle transitions. The AI Planner owns educational hypotheses, predictions, interpretation, and the next intervention. Neither Playwright nor generated content may write child-learning conclusions.

## The many-to-many evidence model

Evidence is **many-to-many**:

- One assignment can test several constructs.
- One item can provide a primary construct and optional secondary constructs.
- Several observations can evaluate one prediction.
- One returned assignment can evaluate several predictions.
- A construct can accumulate observations, interventions, prediction errors, and decisions across many cycles.

Construct IDs are stable and namespaced, for example `math.multiplication.equal_groups`. Mappers reuse existing IDs before introducing a new one.

## Preregistered academic predictions

Before an intervention launches, its academic prediction records:

- construct and context;
- time horizon;
- expected metric range;
- predicted error patterns;
- confidence;
- evidence that informed the prediction;
- selected intervention;
- maximum evidence claim.

The prediction is immutable after launch. A later observation can disagree with it but cannot rewrite it. UX-oriented design predictions remain separate and cannot stand in for an academic prediction.

## Observations are facts, not decisions

Each `LearningObservation` records the item, construct links, result, assistance, exposure, provenance, source, and confounds. Valid evidence sources include activities, independent probes, returned graded work, delayed reassessment, teacher notes, and caregiver observations.

Evidence streams remain separate:

- academic evidence describes performance;
- interaction evidence describes use of the interface;
- support evidence describes demos, hints, scaffolds, or companion help;
- engagement evidence describes choice, persistence, replay, frustration, and ratings;
- companion evidence records contextual observations.

Practice and assisted success can guide the next teaching choice but cannot establish mastery. Engagement and companion evidence cannot become academic mastery. Teacher notes are qualitative unless they include explicit scored results. Interface hesitation cannot become academic failure.

## Returned graded work

The caregiver selects the original assignment before uploading returned graded work. That explicit selection supplies the original `homeworkId`; the marked file's new fingerprint identifies a source, not a new assignment.

Sunny extracts score, item text, child response, teacher mark or note, correctness, construct links, and extraction confidence. Uncertain extraction remains pending until a caregiver confirms it. Confirmed fingerprints are idempotent. Unmatched or unconfirmed files never block the published child board.

Confirmed returned graded work and delayed reassessment may calibrate prior predictions. Raw upload facts are recorded first and cannot directly change the theory.

## Evaluation and one decision

For one confirmed evidence batch:

1. Code matches observations to preregistered predictions and computes factual prediction error.
2. The Planner receives the current theory, matched observations, evaluations, contradictions, and prior history.
3. The Planner writes exactly one decision: `supported`, `revised`, `falsified`, `inconclusive`, or `awaiting_calibration`.
4. The decision cites observation and prediction-evaluation IDs and records what to preserve, change, test next, and what evidence is still required.
5. Only that decision may revise the theory or prescribe the next intervention.

Provider failure leaves the factual batch pending for later interpretation. It never discards evidence or blocks an already published child board.

## Longitudinal planning

The child chart supplies the Planner a compact, relevant cross-cycle history:

- chronological scored observations and assistance conditions;
- external calibration versus practice results;
- persistent error patterns and contradictions;
- prior interventions and theory decisions;
- prediction accuracy;
- missing evidence;
- profile-backed support constraints;
- engagement history in a separate presentation section.

Every new prediction explains which historical evidence informed it. Re-ingestion starts from this history rather than from zero.

## Forbidden patterns

- Retrospective predictions written after seeing the result.
- Completion, fun, or dopamine treated as mastery.
- Practice items reused as unseen assessment evidence.
- AI-generated observations or AI self-verification.
- Playwright or synthetic QA evidence entering the child chart.
- Raw observations directly revising theory.
- Automatic mastery thresholds that bypass one evidence-citing decision.
- Game-specific private scores that do not enter the canonical cycle.
- Parallel factsheets, writable mirrors, or competing learning-loop doctrines.

## Cross-domain contract

The cycle records and evidence rules are domain-neutral. Math validates relationships and representations; spelling tracks canonical forms and delayed recall; reading separates passage exposure, decoding, and comprehension; science grounds claims and causal explanations in source evidence. Domain adapters verify truth but do not choose pedagogy.
