# Adaptive Learning North Star

## One Sentence

Sunny is not a worksheet runner or a collection of mini-games. Sunny is a child-chart-driven adaptive learning system that uses baseline activities, choice moments, generated content, and real-world calibration to learn what works for each child.

## Core Insight

Baseline activities are instruments, not the final product.

They exist to measure the child:

- What they know.
- What they struggle with.
- What they choose when choice is real.
- What they tolerate only because the system required it.
- What helps them recover after a miss.
- What increases frustration.
- What improves real school outcomes.

Once Sunny has enough evidence, it should gradually shift from generic baseline activities toward generated interventions that match the child, the assignment, the care plan, and the current theory.

## The Hospital Model

Sunny should behave like a care-plan system.

```text
child chart
-> intake
-> vitals and labs
-> care-plan hypothesis
-> intervention
-> measured response
-> calibration against reality
-> revised care plan
```

Learning terms:

```text
child chart = patient chart
baseline activities = labs and vitals
homework interpretation = diagnosis context
activity nodes = interventions
attempts and engagement = response to treatment
quest/boss = custom intervention
graded test upload = real-world outcome
```

The system should never say "this worked" just because an AI generated it or because the child completed it once. It should record the theory, test the intervention, and compare against later evidence.

## Product Loop

The durable loop is:

```text
captured homework or learning goal
-> assignment/domain interpretation
-> baseline evaluator activity
-> child preference choice point
-> written theory
-> generated micro-quest
-> measured engagement and learning
-> boss only when needed
-> graded-test or delayed reassessment calibration
-> reuse, revise, or retire
```

This gives Sunny a memory that improves with use.

## Cold Start

A new child starts with an intake period.

Sunny should create a profile like a hospital intake:

- academic baseline
- attention profile
- frustration profile
- activity preference profile
- motivation hooks
- language and reading signals
- parent goals
- known constraints

At first, Sunny should use more baseline activities because it has not earned trust yet.

Baseline activities answer:

```text
Can the child do this?
How much can they handle?
What type of challenge keeps them engaged?
Where do they break down?
What should Sunny avoid?
```

## Preference Is Not Compliance

The bandit algorithm should measure preference, not forced completion.

If Sunny requires Reina to complete Spell Check, then completion proves very little about preference. It may prove mastery, tolerance, or compliance. It should count strongly as effectiveness evidence and weakly as preference evidence.

Preference evidence becomes strong only when the child had a meaningful choice.

Strong preference signals:

- child selected the activity from a choice set
- child asked to play again
- child voluntarily continued
- child chose it over another valid option
- child said "I like this one" or similar
- child laughed, stayed active, and completed without friction
- parent marked it as liked

Negative preference signals:

- child skipped it when offered
- child used back/exit
- child asked to stop
- child complained or said it was boring
- long idle time before first action
- high frustration with no learning payoff
- repeated abandonment

Forced activities can still update:

- mastery model
- mental-load model
- effectiveness model

But they should not dominate:

- activity affinity
- bandit reward
- generated-content preference memory

## Mystery Node As Preference Lab

The mystery node should evolve from a random dopamine reward into a controlled preference experiment.

Instead of always selecting one random activity, Sunny can sometimes show a small choice set:

```text
Choose your next challenge:
- Fast game
- Pronunciation battle
- Story mission
```

Sunny records:

- options shown
- option selected
- options skipped
- time to choose
- active play time
- completion
- replay request
- explicit like/dislike
- observed frustration
- post-activity performance

This is where the bandit belongs.

The bandit should choose among domain-valid or reward-valid options, but only after the assignment and care-plan gates decide what kind of learning is allowed.

```text
domain gate decides what is valid
adaptive load decides how much
preference model ranks equivalent valid options
bandit explores when evidence is thin
generated content uses the learned preference profile
```

## Generated Content Graduation

Generated content should start small.

Early generated interventions:

- 3-minute pronunciation quest
- 5-word retrieval mission
- short story/karaoke passage
- custom boss round for one fragile pattern
- child-themed review challenge

Sunny should compare generated content against baseline.

Questions to answer:

```text
Was generated content more engaging than baseline?
Did accuracy improve?
Did frustration drop?
Did the child ask for more?
Did the child remember it later?
Did the school test confirm transfer?
```

When generated content repeatedly beats baseline and transfers to real results, Sunny can reduce baseline frequency.

Baseline activities should never disappear completely. They become periodic checkups.

```text
baseline often during cold start
baseline sometimes during learning
baseline before tests or when confidence drops
baseline after generated content to recalibrate
```

## Quest And Boss Role

Quest and boss are not decorations.

Quest is a custom intervention generated from:

- child chart
- current homework cycle
- assignment interpretation
- care plan
- theory
- baseline evidence
- preference evidence
- content catalog memory

Boss is not always generated. Boss is a mastery gate used when quest evidence says it is needed.

Quest/boss content must declare:

- what theory it tests
- what algorithm it serves
- what evidence created it
- what success looks like
- how it will be measured
- whether it should be reused, revised, or retired

## Dopamine With Guardrails

Sunny can use novelty and personalization for good.

The goal is not to maximize addiction. The goal is to maximize willing learning inside healthy bounds.

Guardrails:

- learning objective stays attached
- parent/care-plan goals outrank pure engagement
- session caps and natural stopping points
- fatigue and frustration reduce intensity
- novelty is used to reduce boredom, not trap the child
- generated content must be measured against learning outcomes
- real-world graded work can falsify Sunny's theory

The system should create content that feels fresh without losing accountability to reality.

## Recommendation Model

Sunny needs separate models.

### Mastery Model

Answers:

```text
What can the child do?
What is fragile?
What is mastered?
What needs retrieval?
What transferred to real schoolwork?
```

### Mental-Load Model

Answers:

```text
How much can the child handle today?
Should cohort size expand or shrink?
Should Sunny increase challenge or route support?
Is the child fast but careless, slow but accurate, or overwhelmed?
```

### Preference Model

Answers:

```text
What does the child choose?
What do they ask to repeat?
What do they avoid?
What format keeps effort high?
Which wrappers make learning feel fun?
```

### Effectiveness Model

Answers:

```text
Which activity actually improved learning?
Which generated content transferred to tests?
Which content was fun but ineffective?
Which intervention should be reused, revised, or retired?
```

The bandit belongs mostly to the preference model. It should not replace the mastery model or the assignment/domain gate.

## Data Contract For Choice Moments

Every real choice moment should store:

```json
{
  "choiceSetId": "choice-...",
  "childId": "reina",
  "context": "mystery",
  "domain": "spelling",
  "shownOptions": [
    { "activityId": "monster-stampede", "label": "Fast game" },
    { "activityId": "pronunciation", "label": "Pronunciation battle" },
    { "activityId": "karaoke", "label": "Story mission" }
  ],
  "selectedActivityId": "pronunciation",
  "skippedActivityIds": ["monster-stampede", "karaoke"],
  "timeToChoose_ms": 3200,
  "source": "child_choice",
  "started": true,
  "completed": true,
  "accuracy": 0.9,
  "activePlayTime_ms": 82000,
  "replayRequested": true,
  "explicitSentiment": "like",
  "frustrationScore": 0.1,
  "createdAt": "2026-05-12T00:00:00.000Z"
}
```

The important distinction is `source`.

```text
child_choice = strong preference evidence
parent_choice = medium preference evidence
system_required = weak preference evidence, strong effectiveness evidence
system_recommendation = medium preference evidence if child accepts it
```

## Success State

Sunny is working when:

- the child feels like each session is new
- the parent can see why activities were chosen
- the system can explain its assumptions
- generated content is tied to evidence
- baseline activities become smarter and less repetitive
- real tests improve the model
- bad theories get retired
- good theories create better sessions

The end state is not "more games."

The end state is:

```text
the more a child uses Sunny, the more Sunny understands how to help that child learn
```

## Next Implementation Direction

The next architecture move is to make preference evidence real.

Priority changes:

1. Treat mystery as a choice experiment, not just a random reward.
2. Add a durable choice-event log.
3. Split forced activity completion from true preference evidence.
4. Feed choice evidence into `activityModel` and bandit reward.
5. Feed preference summaries into `generateAdaptiveQuestArtifact`.
6. Compare generated content against baseline activities.
7. Use graded-test upload to mark generated content `reuse`, `revise`, or `retire`.

This keeps the system aligned with the north star:

```text
measure the child
-> form a theory
-> generate a better intervention
-> prove or revise it
```
