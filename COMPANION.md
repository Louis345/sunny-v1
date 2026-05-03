# Sunny Companion Care Rules

## Product Rule

Each child has a persistent relationship with a named companion. The companion has its own care plan, inventory, memory, vitals, and economy. Learning earns care resources; care improves the companion's mood, energy, and helpfulness. Absence affects the companion gently through hunger and sleepiness, while return creates reunion and renewed bond.

The companion is not a decorative mascot and not a separate pet game. It is the emotional interface for Sunny's learning system.

## Source Of Truth

Companion wellbeing lives in one source-of-truth file per child-companion pair:

```text
src/context/{childId}/companion_care/{companionId}.json
```

New decision code should start from `getChildChart(childId)`, then load the active companion care plan through the chart. Legacy `learning_profile.tamagotchi` and `learning_profile.companionCurrency` are compatibility mirrors only.

## Starter Food Before Store

Until the store exists, each new care plan gets a starter pantry:

- Apple Bite x3
- Brain Berry x2
- Cozy Soup x1
- Star Candy x1
- Mystery Snack x1

Completed learning nodes award coins and can replenish care resources. Food is not unlimited, but the child should never be stuck without a repair path.

## Consequences

Low care has visible consequences:

- hungry, sad, tired, or quiet expressions
- slower/lower-energy reactions
- fewer big celebrations
- lower thought clarity/usefulness
- reluctance toward high-energy two-player games

Consequences must not block required homework. The child should always be able to feed, do a warmup, choose a calmer activity, or continue gently.

## Animation Rules

- Animation A is the default feeding interaction.
- Animation B is for rare earned rewards, mastery moments, comeback rewards, and Mystery Snack.
- Animation C is not a core v1 loop; do not reward raw rapid tapping.

## Tone

Allowed:

- "I am low-energy. Can we do a quick warmup?"
- "That snack helped. I feel ready now."
- "I am not feeling Wheel of Fortune yet. Let's power up first."

Avoid:

- "You made me sad."
- "I cannot help unless you buy food."
- "You abandoned me."
- "I am disappointed in you."

The core feeling is care, repair, and continuity.

## Logging

Every significant companion state change must log:

```text
 🎮 [companion-care] [action] [result]
```
