# Adaptive Quest Loop

## Vision

Sunny should feel like a living learning game, not a fixed worksheet runner.

The system observes a child over time, forms a written theory about what the child knows, tests that theory through activities, adapts the next challenge, and eventually compares Sunny's prediction against real school outcomes. The game layer matters because it makes the work emotionally engaging: the child is not just answering questions, they are unlocking a world.

The product loop is:

```text
captured evidence
-> evaluator baseline
-> adaptive theory
-> targeted practice
-> generated quest
-> unlock ceremony
-> boss/main event
-> real-world calibration
-> better theory next time
```

Sunny must stay accountable to reality. A generated quest is not "good" because the AI says it is good. It is a hypothesis. The system writes down what it thinks will happen before the quest, then checks what actually happened after the quest, after the boss, and eventually after the school test or uploaded graded work.

## Core Principles

### Node 1 Is The Evaluator

The first node should usually be an evaluator/scout node. Its job is to find out what the child already knows, what is shaky, and what should be skipped.

For spelling:

```text
20 spelling words ingested
-> evaluator checks the words
-> mastered words are removed from heavy practice
-> shaky words become the targeted practice set
-> unknown words get explicit teaching
-> quest tests the remaining gap
```

The child should not be forced to grind words they already know. Known words can still appear as confidence builders, bonus words, or streak fuel, but the system should spend real learning time on fragile and unknown items.

Suggested evaluator buckets:

```text
mastered_now: correct fast, no hesitation
known_but_slow: correct but delayed or self-corrected
fragile: one miss, hesitation, or confusion pattern
unknown: miss, repeat, help needed, or no response
```

### Quest Readiness Is Not The Same As Quest Unlock

Sunny can have enough evidence to inspect a homework cycle before it has enough evidence to unlock a quest.

Minimum quest gate evidence:

```text
captured homework ready
baseline measurements ready
pre-quest theory exists
generated quest cataloged
preview/audit passes
```

Optional but valuable evidence:

```text
attention vitals
tutoring context
companion/session signals
recent frustration or fatigue signals
real-world graded calibration
```

If optional evidence is missing, Sunny can still proceed when confidence is high enough, but it should mark the decision as provisional or requiring review until the system earns trust.

### Approval Unlocks The Ceremony, Not The Quest Directly

When a parent approves generated content, or when the system eventually auto-approves it, the kid should not immediately see a random unlocked node.

Backend state should become:

```text
unlock_pending_ceremony
```

Then the child finishes the previous node. At that moment, the companion reacts, the map changes, and the quest unlocks as if the child's effort caused the world to open.

Kid-facing sequence:

```text
previous node complete
-> companion gets excited
-> dance / animation / sound cue
-> quest node transforms
-> prize carrot is revealed
-> quest becomes playable
```

This preserves the variable reward feeling. The child experiences the unlock as earned, not as an adult pressing a button.

### The Map Is A Fight Card

The activity sequence should feel like a great event card:

```text
Node 1: evaluator/scout
Node 2: targeted intervention
Node 3: pressure or retrieval challenge
Quest: co-main event, generated from evidence
Boss: main event, mastery-gated finale
```

The boss should feel meaningfully bigger than the quest:

```text
walkout ceremony
title-card animation
companion hype line
visible prize
harder challenge
surprise phase
post-win celebration
```

The quest earns engagement. The boss earns mythology.

## Data Sources

Sunny's adaptive content can draw from:

```text
captured homework: assignment text, questions, concepts, source documents, word lists
baseline activities: evaluator measurements, accuracy, speed, retries, hesitation, skipped items
attention vitals: onboarding attention data, session attention windows, fatigue signals
tutoring context: processed tutor summaries and known teaching targets
companion signals: session notes, transcripts, exhaustion cues, curiosity cues, mood changes
pronunciation/spelling attempts: misses, fuzzy matches, homophone confusion, streaks, recovery
spelling pattern-discrimination: trapped imposter chunks, safe chunks tapped, imposters escaped, streak heat, recovery after a trap error
real-world calibration: uploaded graded work, school tests, delayed reassessments
```

New adaptive decision code should enter through the child chart, not by directly reading scattered files. The child chart is the doorway; the care plan is the current hypothesis; activities are interventions; attempts are labs.

## Existing Pieces To Preserve

This is not a rewrite. Sunny already has several parts of the evaluator loop in place.

Existing signals:

```text
Game attempt contract: fireAttemptEvent / attempt_event for assessable interactions
Word Radar buckets: knownItems, weakItems, unknownItems, rawResults
Word Radar persistence: word_radar_complete updates word_bank and records attempts
NodeResult: missedWords, correctWords, accuracy, timeSpent_ms, wordsAttempted
Homework cycle measurements: interventionHistory and questMeasurement
Learning decision context: reads attempts, patterns, quest threshold, content catalog
Attention vitals: onboarding games record attention signals
```

The gap is not "we have no evaluator." The gap is that evaluator evidence is scattered across game-specific outputs, generic node results, word-bank updates, attempt logs, and homework-cycle measurements.

Finalizing the evaluator means creating one durable interpretation layer:

```text
existing game output
-> evaluator evidence adapter
-> mastered_now / known_but_slow / fragile / unknown
-> adaptive snapshot
-> next-node targeting
```

Word Radar is already closest to this model. Its current buckets map naturally:

```text
knownItems -> mastered_now
weakItems -> known_but_slow or fragile
unknownItems -> unknown
rawResults attempts > 1 -> fragile
rawResults slow response -> known_but_slow
rawResults incorrect/timeout/skip -> unknown
```

The important product decision: do not create a second attempt pipeline. Reuse the existing attempt contract and add an evaluator summary adapter that every adaptive feature can read.

## Automation Model

Session end should not run expensive generation inline. It should enqueue a readiness check.

```text
session ends
-> save attempts, transcript, node measurements, rewards, notes
-> build adaptive evidence snapshot
-> run quest gate
-> if blocked: log missing evidence
-> if newly ready: enqueue adaptive review
-> background job generates preview
-> Playwright audit clicks through stateless preview
-> auto-approve or mark for review
-> approved content waits for unlock ceremony
```

Target log shape:

```text
🎮 [adaptive-readiness] [checked] child=ila homework=hw-reading-... gate=blocked missing=pre_quest_theory
🎮 [adaptive-readiness] [queued] child=ila homework=hw-reading-... reason=quest_gate_open
🎮 [adaptive-review] [approved] child=ila homework=hw-reading-... quest=...
🎮 [adaptive-review] [blocked] child=ila homework=hw-reading-... reason=playwright_failed
```

## Auto-Approval Threshold

Parent approval can be temporary. The path to removing it is earned trust.

Start with human review when:

```text
first generated quest for that child/homework domain
attention evidence is provisional
tutoring context is missing but expected
Playwright audit passes with warnings
generated content uses a new activity type
```

Allow auto-approval when:

```text
captured homework is ready
baseline measurements are ready
pre-quest theory exists
content is cataloged with evidence ids and algorithm targets
Playwright audit passes
no console/runtime errors
all nodes complete
back/exit paths return to map
reward/feed values mutate correctly
recent generated quests for this child had no rejection
engagement stayed stable or improved
```

Block auto-approval when:

```text
captured homework is missing
baseline measurements are missing
pre-quest theory is missing
content is uncataloged
preview crashes or freezes
navigation traps the child
reward values do not mutate
AI content is not tied to evidence
```

## What To Build Next

### Slice 1: Evaluator Result Model

Add a domain-agnostic evaluator result contract that adapts existing game evidence from spelling, reading, pronunciation, and future activities.

This should not replace `fireAttemptEvent`, `word_radar_complete`, `NodeResult`, or homework cycle measurements. It should sit above them and summarize what they mean for adaptive routing.

The contract should classify each target item:

```text
mastered_now
known_but_slow
fragile
unknown
```

It should record:

```text
childId
homeworkId
nodeId
domain
target item
response
correctness
latency
attempt count
hint/help used
classification
evidence id
```

### Slice 2: Read Evaluator Results In The Snapshot

Extend the adaptive evidence snapshot so baseline readiness can explain the actual target buckets, not just "there were measurements."

Example output:

```text
Baseline:
- mastered_now: sunny, lucky, slowly
- fragile: neatly, shiny
- unknown: carrying, happiest
```

This makes reading vs spelling differences obvious and parent-readable.

### Slice 3: Targeted Practice Selector

Build a selector that turns evaluator buckets into the next node config.

Rules:

```text
mastered_now -> skip or bonus/streak fuel
known_but_slow -> light retrieval
fragile -> targeted practice
unknown -> explicit teaching + repeated retrieval
```

### Slice 4: Session-End Readiness Check

After session end, run the lightweight adaptive readiness check and enqueue background review if the gate opens. Do not generate content inline during the child session.

### Slice 5: Unlock Ceremony State

Add the quest state:

```text
approved
unlock_pending_ceremony
unlocked
completed
```

Frontend listens for the ceremony event only after the previous node completes.

### Slice 6: Playwright Preview Audit

Run a stateless preview click-through before generated content can auto-approve.

Audit checks:

```text
map loads
previous node completes
quest unlock ceremony fires
quest starts
quest exits cleanly
back buttons return to map
overlays have exit paths
reward values mutate
no console/runtime errors
```

## Open Product Questions

The next decision is how strict Node 1 should be by domain.

For spelling, checking all words may be worth it because it prevents wasted practice. For reading/science, the evaluator may need a smaller sample: vocabulary, one comprehension question, and one explain-it-back prompt.

The second decision is whether the first version of auto-approval should be child-specific, domain-specific, or both. A safe default is child plus domain. Sunny may earn trust for Reina spelling before it earns trust for Ila reading.
