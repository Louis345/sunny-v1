# Sunny Learning Feedback Loop

Contract version: 6

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

## Evidence-gated board progression

For homework boards, the inner learning loop is:

```text
school assignment
→ preregistered prediction
→ personalized baseline intervention
→ factual baseline scorecard
→ exactly one Planner decision
→ targeted support or Quest
→ factual Quest transfer scorecard
→ exactly one Planner decision
→ targeted support, defer, or Boss
→ factual Boss synthesis scorecard
→ awaiting calibration
→ returned graded or delayed work
→ prediction evaluation and exactly one theory decision
→ improved next intervention
```

The child completes the selected route frontier, not every cosmetic route merely to satisfy a gate. A route selection is engagement evidence only. When the selected frontier is complete, code records observations and enters an evaluating lifecycle; it never chooses the educational next step. The Planner then makes exactly one evidence-citing choice: prescribe support, generate Quest, generate Boss when Quest evidence exists, collect more evidence, or await calibration.

Before Quest is available as a Planner action, runtime must have target-aligned baseline observations with at least one fresh, correct, unassisted response. All-wrong or assisted-only completion is ineligible for Quest. This is an evidence-availability boundary, not a mastery percentage: when it is unmet, the Planner still owns the choice between targeted Support and collecting more evidence; when it is met, the Planner still decides whether Quest is justified.

Every session is an honest chapter with a visible endpoint. Finishing the selected route does not reveal surprise required work in that same session. The child receives completion feedback and may replay completed nodes, while Sunny reduces the session into factual scorecards and asks the Planner for exactly one next-step decision in the background.

When multiple academically valid interventions exist, the Planner may preregister a contextual agency experiment. It states the factual context, what academics remain comparable, one uncertain engagement hypothesis per route, predicted outcomes, falsifying evidence, and measurement keys. The board only projects the Planner's routes and records what was shown, selected, started, abandoned, completed, replayed, or switched. Selection alone never establishes preference; later interpretation must consider behavior, support, interaction, academic outcomes, and calibration together.

The next intervention is generated and validated as the **next session chapter**. A later session load presents that ready chapter; the open session packet never polls for or swaps in newly generated required nodes. When a route frontier is complete, its unselected route is no longer required. This preserves meaningful agency without making the child finish both versions of the same curriculum.

Quest and Boss never launch automatically. Once their evidence-authorized artifacts are generated and validated, the next session presents the node as unlocked. Quest uses unseen transfer material. Boss uses unseen synthesis material and always ends in `awaiting_calibration`; in-app performance alone cannot close the cycle.

The AI-authored board presentation is preserved as a projection template, while node state, artifact binding, evidence, and lifecycle always come from the canonical cycle. A static compatibility file may not hide or override a newer canonical revision.

## Authority and storage

- One canonical `LearningCycleRecordV2` JSON is writable for each assignment cycle.
- Raw uploads are immutable source artifacts referenced by that cycle.
- Raw event logs are immutable supporting facts referenced by ID.
- `getChildChart()` derives longitudinal history by reading canonical cycles.
- **No second writable factsheet** may summarize or override the cycles.
- Board, homework, session, and care-plan files are compatibility projections, never competing decision state.

Code owns identity, provenance, immutability, mathematical/source truth, exposure tracking, and safe lifecycle transitions. The AI Planner owns educational hypotheses, predictions, interpretation, and the next intervention. Neither Playwright nor generated content may write child-learning conclusions.

For generated math interventions, the Planner's academic contract is locked before creative design. A design artifact may choose presentation, interaction, stakes, recovery, and payoff, but it cannot alter the academic contract. Builder-model identity, artifact hashes, prompt hashes, and child-response measurements are recorded before launch so later model comparisons remain factual and observational. Builder ratings from unlike activities are not causal evidence and never select a model automatically.

Generation checkpoints are operational state, not learning authority. Valid Planner-authored nodes and Creator artifacts are preserved independently, and missing siblings may be requested without regenerating completed work. The board does not judge or rewrite activity count, route length, pedagogy, mechanics, themes, or presentation. It publishes only after every displayed node has a launchable artifact, while the previously published board remains active.

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

Adaptive memory carries factual observations, provenance, confidence, and uncertainty—not reusable behavioral commands. Derived labels such as preferred, avoided, low-pressure, competitive, or consequence-free cannot become authoritative Planner instructions. Generated mission, recovery, stakes, reward, and Creator prose are outputs of a prior intervention, not observations, and may not be fed forward as child evidence. The Planner receives the underlying facts and independently decides what to preserve, vary, or test next.

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
