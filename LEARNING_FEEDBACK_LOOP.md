# Sunny Learning Feedback Loop

Contract version: 28

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
→ AI-authored independent Probe Board prepared before the child session
→ one probe chapter covering the Planner-selected assignment concepts
→ factual evidence with instrument confounds separated
→ targeted Planner program and preregistered predictions
→ Fable board design
→ complete Teaching Board (immutable instance)
→ factual baseline scorecard
→ exactly one Planner decision
→ one complete successor board: targeted support, or Quest-authorized
→ factual Quest transfer scorecard
→ exactly one Planner decision
→ one complete successor board: targeted support, or Boss-authorized; or defer
→ factual Boss synthesis scorecard
→ awaiting calibration
→ returned graded or delayed work
→ prediction evaluation and exactly one theory decision
→ improved next intervention
```

The child completes the selected route frontier, not every cosmetic route merely to satisfy a gate. A route selection is engagement evidence only. When the selected frontier is complete, code records observations, closes that board's evidence batch, and enters an evaluating lifecycle; it never chooses the educational next step. The Planner then makes exactly one evidence-citing choice: prescribe support, generate Quest, generate Boss when Quest evidence exists, collect more evidence, or await calibration. Every choice except `await_calibration` authors one complete successor program, which becomes exactly one new board instance (see *Immutable board instances*).

Before Quest is available as a Planner action, runtime must have target-aligned baseline observations with at least one fresh, correct, unassisted response. Practice, repeated exposure, missing captured responses, all-wrong or assisted-only completion is ineligible for Quest. This is an evidence-availability boundary, not a mastery percentage: when it is unmet, the Planner still owns the choice between targeted Support and collecting more evidence; when it is met, the Planner still decides whether Quest is justified.

Every session is an honest chapter with a visible endpoint. Finishing the selected route does not reveal surprise required work in that same session. The child receives completion feedback and may replay completed nodes of the current board until its successor is published, while Sunny reduces the session into factual scorecards and asks the Planner for exactly one next-step decision in the background.

Replaying a completed teaching instrument appends practice evidence without resetting the current lifecycle, sibling readiness, or completed next-step work. The server derives replay from the canonical node state, not a generated claim. Repeated completion deliveries remain idempotent; replay does not initiate another Planner call or award completion credit again. Raw activity messages remain audit facts rather than a second scoring authority, and engagement ratings cannot override canonical academic observations.

When multiple academically valid interventions exist, the Planner may preregister a contextual agency experiment. It states the factual context, what academics remain comparable, one uncertain engagement hypothesis per route, predicted outcomes, falsifying evidence, and measurement keys. The board only projects the Planner's routes and records what was shown, selected, started, abandoned, completed, replayed, or switched. Selection alone never establishes preference; later interpretation must consider behavior, support, interaction, academic outcomes, and calibration together.

For targeted spelling, the exact Planner-authored routes that the child-facing board exposes are frozen into the canonical learning cycle before publication. The Planner's converged all-words checkpoint is frozen as the common tail of every selectable route, while any common opening nodes remain on the shared frontier. A direct route-node selection records that canonical route as engagement evidence; it never establishes mastery or a durable child preference.

When the targeted spelling Planner selects Visual Explainer, the artifact is an assisted teaching intervention. The Planner authors the word chunks, strategy, and practice check from committed evidence; code only validates assignment-word coverage, frozen identity, and truthful event provenance. Seeing a spelling, receiving a strategy, answering inside the explainer, or asking Elli for help remains practice/exposure and is never mastery. A later hidden-word recall checkpoint must cite the explainer intervention and capture a fresh unassisted response before Sunny may evaluate the prediction. The checkpoint—not the explainer—provides independent academic evidence.

The Probe Board establishes the child's independent starting point before targeted instruction. It is the complete first chapter for the assignment, not a single generated node followed by a child-visible generation wait. The Planner owns its construct coverage, activity count, item count, response formats, and evidence limits; the Experience Creator designs one coherent board from that frozen program. The complete Planner-authored map may appear after its program and design are frozen. Each probe node is implemented and verified before that node unlocks; unfinished siblings remain locked, and no unverified content can launch.

Probe items are fresh and may not teach or reveal the answer before recording the observation. Incorrect, uncertain, skipped, and `Not sure` responses advance without trapping the child. Companion reading or clarification remains available, but substantive help is recorded as assistance and cannot become independent evidence. Correctness, assistance, exposure, prompt ambiguity, reading friction, interface friction, and response-mode friction remain separate facts. Completion commits one evidence packet before targeted planning begins; ratings may inform later design hypotheses but cannot alter academic conclusions or gate academic completion. Reported reading/interface friction accompanies the canonical attempt even when emitted separately by the instrument. If the child exits early, Sunny preserves the original board and observations and reports incomplete coverage honestly.

The Probe Board program and coherent map design are generated after caregiver ingestion and before child play. The Probe Board is the only board instance that may publish before every node is verified; its topology is still frozen at publication. The first verified probe node may open while remaining nodes continue building independently. Those unfinished nodes use the board's ordinary lock state and unlock only after their own artifacts pass verification; generation never interrupts or auto-opens a node. Completing the Probe Board ends that child chapter normally and queues exactly one targeted Teaching Board job for the same assignment identity. The Teaching Board is generated asynchronously between sessions from committed probe evidence and prior chart history. It never appears as surprise required work in the completed probe session. The Teaching Board is a successor board instance of the Probe Board: a later session opens it only after every one of its nodes is implemented and verified; another ingestion is neither required nor permitted.

For spelling elicited by audio, an alternative written response with the same pronunciation is instrument-ambiguous unless the frozen item supplied meaning-bearing context. It is not a spelling error and cannot become independent evidence merely because the activity expected one orthography.

Probe Board completion is idempotent: replaying it returns the existing cycle without changing the original completion time, evidence, revision, or later lifecycle. Reconnection or a repeated completion request cannot send a published Teaching Board back into evaluation or planning.

The targeted program and complete board design are frozen before the targeted map appears, and every node artifact is verified before publication. Until then the child sees the truthful between-board preparation experience outside any board; optional status polling never opens a board, interrupts the current activity, or creates evidence. `Preparing` is operational generation state, while `evidence_locked` is an academic lifecycle state. The child may exit and return without losing either state. When a route frontier is complete, its unselected route is no longer required; its nodes are presented as not taken and are never relocked, removed, or repurposed.

Quest and Boss never launch automatically. They exist only as nodes of a successor board whose Planner decision authorized them, and they are visible and playable from that board's first render. Quest requires the baseline evidence boundary above; Boss requires valid unseen, unassisted Quest evidence and the existing mastery gate. An unauthorized encounter is entirely absent: no locked, hidden, teaser, preview, or "coming soon" marker appears on any board. Quest uses unseen transfer material. Boss uses unseen synthesis material and always ends in `awaiting_calibration`; in-app performance alone cannot close the cycle.

The AI-authored board presentation is preserved as a projection template, while node state, artifact binding, evidence, and lifecycle always come from the canonical cycle. A static compatibility file may not hide or override a newer canonical revision.

### Immutable board instances

Each published board is a complete, immutable instance recorded inside the assignment's single canonical `LearningCycleRecordV2`; it is not a second store. An instance records its unique `boardId`, `predecessorBoardId`, the `plannerDecisionId` and cited evidence IDs that authorized it, its frozen topology, a `topologyHash`, and `publishedAt`.

- **Frozen at publication and covered by the hash:** identity, predecessor, decision, cited evidence, node identities and order, node roles, Planner-authored academic contracts (targets, item and response-contract identities), Creator-authored titles, mechanics and themes, and route choices. Edges derive only from these frozen facts.
- **Forward-only after publication:** a node never returns to `generating` once playable and never leaves `completed`. Route navigation inside the board's frozen choice (which route's next node is open) is not a lifecycle change. An artifact binding is written once and never replaced; a verified artifact that later fails a safety or semantic audit may be retired, leaving its node `blocked`, but any replacement belongs to a successor board.
- **Forbidden:** appending, removing, relocking, replacing, or repurposing a node of a published board. "Nodes change after completion" always means a new board instance with a new identity.

Completing a board's evidence batch leads to at most one Planner decision and at most one successor board; `await_calibration` produces none. The successor is prepared between sessions, never opens automatically, and never interrupts the child. Once a successor is published, its predecessor is read-only history rendered exactly as experienced; it accepts no new attempts.

Encounter variability belongs to the Planner, not to code. Code never draws randomness to select an educational step. Reproducibility comes from the committed decision and from raw provider checkpoints saved before validation: a restart from the same frozen snapshot reuses that decision or checkpoint, makes no new provider call, and prepares the same successor. Rewards, engagement, play frequency, and randomness cannot authorize Quest or Boss. Presentation variety (theme, skin, narrative) remains the Experience Creator's.

A checkpointed Planner response that fails validation, or a provider call whose outcome is uncertain, blocks the cycle visibly for a person; it is never replayed or re-bought automatically. A successor node that fails to build is marked as needing attention and the successor stays unpublished; no automatic rebuild follows a restart.

Cycles written before contract 21 lack board instances. They remain readable as one synthesized legacy instance with no Planner decision attribution; they are never rewritten to claim one. Work already in flight on a legacy cycle finishes through the legacy path, re-ingestion never deletes its existing Quest or Boss evidence, and restarts never start a Planner call for it. Its first new Planner decision records the legacy instance and continues with successor boards.

## Authority and storage

Developer impersonation runs may exercise the complete production lifecycle only inside a physically isolated workspace snapshot. Their observations use the canonical schema for runtime fidelity but have simulation authority and may never enter a real child's chart, prediction evaluation, mastery, rewards, preferences, calibration, catalog decisions, or published board. Simulation authority cannot be promoted. The source child context is read-only during certification and its before/after inventory is part of certification evidence.

After the complete isolated journey has passed browser/runtime verification and explicit human acceptance, Sunny may promote only the immutable independent Discovery instrument into a pristine real-child cycle. Promotion is a content-provenance operation, not an evidence operation. It must revalidate the assignment fingerprint, child-profile snapshot, implementation and verifier versions, academic/design/artifact hashes, runtime proof, and blind visual approval. It then creates a new `evaluation_ready` cycle with zero observations. The impersonator cycle, attempts, summaries, predictions, decisions, targeted program, board, rewards, preferences, and generated teaching nodes are never copied. A matching promotion is idempotent; any conflicting real cycle or changed child snapshot blocks it.

- One canonical `LearningCycleRecordV2` JSON is writable for each assignment cycle.
- Raw uploads are immutable source artifacts referenced by that cycle.
- Raw event logs are immutable supporting facts referenced by ID.
- `getChildChart()` derives longitudinal history by reading canonical cycles.
- **No second writable factsheet** may summarize or override the cycles.
- Board, homework, session, and care-plan files are compatibility projections, never competing decision state.

Code owns identity, provenance, immutability, mathematical/source truth, exposure tracking, and safe lifecycle transitions. New math instruments freeze the Planner item identities, response contracts and exposure before generation. Canonical scoring uses captured responses against those contracts, never generated correctness claims. Explanations without independent rubric interpretation, missing contracts and uncaptured or malformed responses remain unscored; duplicate item submissions in one completion are rejected. Historical records are not rewritten. The AI Planner owns educational hypotheses, predictions, interpretation, and the next intervention. Neither Playwright nor generated content may write child-learning conclusions.

For generated math interventions, the Planner's academic contract is locked before creative design. A design artifact may choose presentation, interaction, stakes, recovery, and payoff, but it cannot alter the academic contract. Builder-model identity, artifact hashes, prompt hashes, and child-response measurements are recorded before launch so later model comparisons remain factual and observational. Builder ratings from unlike activities are not causal evidence and never select a model automatically.

Before that lock, the math domain adapter validates explicit representation facts against the item answer contract. Contradictory states—for example, a minute hand on 12 paired with an hour hand described as past the hour for an `:00` answer—cannot proceed to creative design or implementation repair. The same Planner may receive one bounded correction request containing the exact factual contradiction and immutable evidence identities. A correction may repair the academic contract but may not reinterpret child evidence, add a new learning theory, or bypass the ordinary parser. Downstream design and implementation start only after the corrected program passes the same truth gate.

Generation checkpoints are operational state, not learning authority. Valid Planner-authored nodes and Creator artifacts are preserved independently, and missing siblings may be requested without regenerating completed work. The board does not judge or rewrite activity count, route length, pedagogy, mechanics, themes, or presentation. The complete frozen Probe topology publishes before child use, while each verified artifact is bound and unlocked independently. After probe evidence is committed, the Teaching Board and every later successor publish between sessions only after every node artifact is verified. A failed candidate never removes the previously safe published experience.

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

Prediction evaluation uses only observations after registration, keeps source batches separate, and obeys explicit source and time-window eligibility. Unknown legacy eligibility is insufficient evidence, not an inferred outcome window. Several interventions preceding an outcome imply observational association, not causal attribution.

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
- Appending, removing, relocking, or repurposing nodes of a published board.
- Locked, teaser, or placeholder markers for an encounter the Planner has not authorized.
- Code-level randomness selecting an educational step or encounter.

## Cross-domain contract

The cycle records and evidence rules are domain-neutral. Math validates relationships and representations; spelling tracks canonical forms and delayed recall; reading separates passage exposure, decoding, and comprehension; science grounds claims and causal explanations in source evidence. Domain adapters verify truth but do not choose pedagogy.

New spelling cycles offer every assigned spelling target in independent Discovery before targeted practice is planned. Not sure, skipped, and untested targets remain unknown. Exit and resume preserve the original responses. Hearing the whole word is the elicitation stimulus, not spelling assistance; seeing its canonical spelling, hearing its letters, hints, or uncertain speech capture must be recorded separately. Assistance attaches only to the item where that support occurred; an open companion from an earlier item cannot contaminate later responses. The instrument never forces a model-answer round before evaluation.

The existing intake Planner selects the opening spelling diagnostic from explicitly validated catalog capabilities, using the source and child-chart evidence. A generic diagnostic label on a practice game is not validation. The decision records rationale, cited evidence, uncertainty, and next evidence needed; a frozen capability snapshot and hash accompany the canonical evaluation. Code validates eligibility and projects this selection, not a preferred game. If no available instrument fits, the Planner records `needs_instrument`; no fallback publishes or additional model call starts automatically. Device context is unknown unless observed. Selection does not establish that an instrument is best, engaging, or effective. Legacy saved intake requests and cycles remain readable as legacy fixed-instrument behavior, never retroactively attributed to the Planner. Raw provider responses are checkpointed before validation and reused on restart.

Spelling items freeze word identity, accepted forms, response mode, measurement role, and source evidence. A later unassisted recall opportunity can measure performance after practice, but the word remains previously exposed. Immediate recall is not delayed retention. Neither a new item ID nor a successful game resets word exposure. The final recall check includes targeted and initially secure words, and incomplete coverage remains explicit.

Verified implementation-repair evidence is operational evidence, not child-learning evidence. Reusable engineering lessons may describe only implementation conditions, reproduced defects, verified changes, provenance and uncertainty. Failed or incompatible repairs cannot become trusted lessons. Selecting a lesson is not evidence that it improved a later artifact; recurrence, verification, latency, and cost remain separate measured outcomes. These records cannot change academic contracts, weaken verifiers, create child preferences, or promote simulation observations into a real chart.


## Spelling chart authority — approved, not yet activated

Milestone 1 supplies a standalone spelling department. Until an explicit cutover,
legacy production paths remain authoritative; this section does not activate it.
The new department records small, strictly validated typed facts in the child's
append-only SQLite chart. Views, scoring, evaluations, pattern history, reports
and Planner packets are pure projections; no legacy cycle commands, SM2 fields
or JSON learning records are inputs. Missing history stays missing.

Commit sequence and server-recorded time establish what was known when. Caller
clocks cannot reorder facts or establish preregistration. Priors precede every
Discovery response for the assignment; forecasts precede recorded school results.
That latter boundary alone does not prove a forecast preceded the actual test.
Rooms submit raw responses; code scores frozen accepted forms. Assistance is
per response, including presentation support; audio replay alone is not help.
Only first, unassisted Discovery measurements with known outcomes evaluate
priors. Prior word exposure remains visible across sessions. Unknown, skipped
and ambiguous outcomes remain missing evidence, not failures. Coverage accompanies
accuracy. Plans cite reproducible evaluations and their actual input responses.
Corrections preserve identity and cannot alter facts already depended on.
The shared chart infrastructure is subject-neutral; spelling owns its schemas,
taxonomy and measurements. No kiosk, Planner or other subject is wired here.

For the unactivated spelling department, forecasts and Planner decisions cannot
be corrected into different predictions or decisions at their original time.
Response corrections can only downgrade reliability or add support: never replace
a typed answer with another answer, upgrade an unknown result, or remove help.
Pattern tags freeze when priors exist. Protocol 1 accepts only the canonical word
frozen by the assignment; a presenter cannot add alternative answers. Hearing an
unanswered audio-only prompt is elicitation, so resuming it preserves eligibility.
Prior answered attempts and visible/support/practice exposure remain exclusions.

## Spelling kiosk cutover — implementation authorized, activation explicit

The approved next milestone connects the typed-fact department to a dedicated
spelling kiosk journey. `SUNNY_SPELLING_CHART=1` selects that path; an unavailable
chart fails visibly and never falls back to JSON cycles or SM2. Other departments
retain their existing authority. The child-chart doorway provides spelling facts
and profile facts from SQLite only. Parent-confirmed assignment input creates the
source artifact; the Planner alone supplies pattern tags, priors, the teaching
program and the forecast. Code validates those proposals and measures responses.
No default probabilities, simulated answers or fallback teaching plans are allowed.

Discovery covers the assignment before a teaching plan is requested. Each launched
item has a server identity, frozen instrument and assistance conditions. Exit and
resume use committed facts; duplicate submissions cannot create new attempts.
Practice is visibly separate from hidden recall. Recall covers initially secure
as well as targeted words. The school result is entered explicitly by a parent;
missing results remain missing and are not filled with failures. Each fact can
currently be corrected at most once; the parent UI must disclose that limitation.

Provider requests use durable operational checkpoints outside the event stream:
claim before calling, preserve the response before validation, and reuse it on
restart. Each explicit user retry creates a separately preserved attempt after a
recorded failure, with at most three attempts per explicitly opened batch for a stage
or spoken word. Exhaustion pauses requests; a parent may explicitly acknowledge
and open another bounded batch without deleting any earlier checkpoint. No retry
runs automatically. After any failed audio attempt, further provider attempts
require the parent recovery action; child taps and restarts cannot drain the budget. A request with no recorded outcome requires an explicit parent
acknowledgment before another attempt; an active in-process request cannot be
recovered concurrently. Saved invalid output and failures remain auditable. Request checkpoints name the explicitly configured model. New prior provenance
records its input sequence cutoff and model; citations identify supplied facts,
not every unrelated chart event. These checkpoints never supply child
observations. Verification uses synthetic charts and recorded provider fixtures;
those fixtures cannot be selected for a real child. Activation and host readiness
must be proved separately from module and browser tests before child acceptance.

Parent-transcribed sources declare `sourceKind: parent_transcription`; a text
hash is never presented as proof that a school photograph was attached. The
existing hash field names remain readable for earlier typed facts.

The spelling parent screen is not access-controlled on the kiosk; there is no
parent PIN. Kiosk identity still restricts requests to the active local session.
A one-time, explicit legacy-profile adapter may prepare a draft containing only
display name, interests, companion, support needs and reading level. A parent must
review/confirm it before one child.profile_set fact is appended. The draft is not
Planner input. No word bank, SM2 history, old cycles, scores, session notes or XP
may cross this boundary. Verification uses synthetic profiles only. Existing
source files are retained unchanged; installation may prepare the draft, while
confirmation belongs to the first parent testing/setup screen.
