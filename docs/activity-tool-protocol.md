# Activity Tool Protocol

Sunny treats activities as learning tools. The AI conductor may choose the tool, but the tool must declare what job it does before it can enter the adaptive path.

## No Orphan Activities

No orphan activities: every new activity must have an Activity Tool Contract before it is used by the adventure map, quest planner, AI conductor, or generated content pipeline.

The source of truth is:

```text
src/engine/activityToolCatalog.ts
```

Docs can explain the rule, but code owns the contract. If a future dashboard, prompt, or agent needs a portable format, generate it from `src/engine/activityToolCatalog.ts` instead of hand-maintaining a second contract file.

## Required Contract Fields

Every new activity contract must declare:

- `id`: Stable tool id used by planners and audits.
- `label`: Parent/developer-readable activity name.
- `nodeType`: Adventure map node type when the tool maps to an existing node.
- `purposes`: Whether the activity evaluates, teaches, practices, rewards, gates a quest, gates a boss, or measures attention.
- `domains`: The learning domains where the activity makes sense.
- `strengths`: What the activity is especially good at.
- `weakFor`: Where the activity is likely to mislead Sunny.
- `goodFitWhen`: Conditions where the conductor should choose this tool.
- `badFitWhen`: Conditions where the conductor should avoid this tool.
- `mechanicTruth`: The exact child action that proves the cognitive job. Example: in Letter Rush Trap the Imposter, the child traps wrong chunks like `ar` or `or` and lets the correct chunk `er` pass.
- `scaffolds`: Visible words, letter tiles, hints, retries, fuzzy matching, companion coaching, picture choices, model answers, or other support that can contaminate mastery.
- `writesPracticeEvidence`: Whether the activity may record practice evidence.
- `writesMasteryEvidence`: Whether the activity may record clean mastery evidence.
- `requiresPerTargetResult`: Whether the activity must emit per-word or per-question target results.

## Evidence Rule

Scaffolded activities can be valuable and fun, but they must not inflate mastery.

Examples:

- Word Radar is high-flow scaffolded practice. It can reinforce known misses, but it should not write independent mastery because it can show visible words, letter tiles, retries, and STT matching.
- Spelling Recall can write mastery only when the word is hidden and each word emits a per-target result.
- Visual Explainer teaches concepts, but it is not proof that the child can recall or transfer the idea independently.
- Quest and Boss nodes may write mastery only when they are tied to captured homework evidence, a theory, a review/gate state, and per-target results.

## Add-A-New-Activity Checklist

Before an activity is allowed into the active map:

1. Add the activity contract to `src/engine/activityToolCatalog.ts`.
2. Declare whether it is `evaluate`, `teach`, `practice`, `reward`, `quest`, `boss`, or `attention-screening`.
3. Declare all `scaffolds` that could make the child appear more independent than they really were.
4. Declare the mechanic truth: what the child clicks, avoids, says, sorts, sequences, predicts, or recalls, and why that action measures the intended skill.
5. Set `writesMasteryEvidence` to `false` unless the answer is not visible and the activity emits per-target results.
6. Set `requiresPerTargetResult` to `true` for any evaluator or mastery-eligible activity.
7. Add or update tests proving the planner chooses the activity only in the right domain and sequence.
8. If the activity is scaffolded, prove it writes practice evidence only.
9. If the activity is mastery-eligible, prove it does not expose visible answers or synthesize per-word results from aggregate accuracy.

## Conductor Contract

The AI conductor should choose from the catalog, not from vibes or raw UI names.

The intended flow is:

```text
Child chart
  -> captured homework evidence
  -> attention, tutoring, companion, and attempt signals
  -> activity tool catalog
  -> conductor proposes a session plan
  -> deterministic gates validate the plan
  -> adventure map renders the plan
  -> activities emit evidence back to the child chart
```

The conductor may make strategic choices. Code still enforces evidence safety.

## Current Product Rule

For science or reading comprehension with unknown baseline, start with a concept evaluator, teach visually if needed, then practice vocabulary.

For spelling with unknown baseline, start with independent hidden-word recall, then use scaffolded practice like Word Radar on misses, then re-check with a mastery-eligible evaluator.

Practice wins can guide the next node, but practice wins must not overwrite baseline evidence.

Letter Rush Trap the Imposter is spelling pattern-discrimination practice. It must present a word frame such as `farm_`, treat the correct chunk `er` as safe, and reward trapping plausible wrong chunks such as `ar` or `or`. This mode may emit practice evidence for pattern discrimination, safe-chunk errors, escaped imposters, streaks, and recovery. It must not write independent spelling mastery.
