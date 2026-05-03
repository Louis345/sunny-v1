# Sunny Companion Care Rules

## Product Rule

Each child has a persistent relationship with a named companion. The companion has its own care plan, inventory, memory, and vitals. Learning earns care resources; care improves the companion's mood, energy, and helpfulness. Absence affects the companion gently through hunger and sleepiness, while return creates reunion and renewed bond.

The companion is not a decorative mascot and not a separate pet game. It is the emotional interface for Sunny's learning system.

## Source Of Truth

Companion wellbeing must have one durable source of truth per child-companion pair.

The long-term model is a companion care plan linked from the child chart:

```text
getChildChart(childId)
  -> active companion
  -> companion care plan
  -> vitals, memory, inventory, economy, store state
```

New adaptive or companion decision code should start from `getChildChart(childId)` and then read the active companion care plan through the chart. Do not make new decision code directly scatter reads across `learning_profile.json`, `children.config.json`, homework folders, attempts, or vitals unless the code is a low-level chart/care-plan adapter.

The current `tamagotchi` profile field can remain as a compatibility bridge, but the target architecture is a named companion care plan for Elli, Matilda, or any future companion.

## Companion Care Plan

A companion care plan should answer:

- Who is this companion attached to?
- When did they last see the child?
- What do they remember from the last session?
- How hungry, energetic, bonded, and useful are they?
- What food, care items, rewards, and store unlocks do they own?
- What evidence changed the state?

Recommended shape:

```ts
type CompanionCarePlan = {
  companionId: string;
  childId: string;
  state: {
    hunger: number;
    mood: number;
    bond: number;
    energy: number;
    usefulness: number;
    thoughtClarity: number;
    lastSeenAt: string;
    lastFedAt?: string;
  };
  memory: {
    firstMetAt: string;
    lastSessionSummary?: string;
    lastThingTheyWorkedOn?: string;
    lastEmotionalMoment?: string;
    reunionLineSeed?: string;
  };
  inventory: {
    food: CompanionFoodItem[];
    careItems: CompanionCareItem[];
  };
  economy: {
    coins: number;
    storeUnlocks: string[];
  };
};
```

## Vitals

The main visible bars are companion vitals, not generic child metrics.

- Hunger: decays with time and is restored by feeding.
- Mood: changes from reunion, wins, frustration, feeding, rest, and care items.
- Bond: grows from repeated sessions, personal exchanges, recovery after struggle, and care.
- Energy: controls how animated and willing the companion feels.
- Usefulness: controls how sharp, eager, and helpful the companion can be.
- Thought clarity: controls companion "ideas" and hint confidence; later store items can boost it.

All vitals must stay explainable from stored care state, session events, or logged learning evidence.

## Consequences

Companion care must have real visible consequences.

When hunger, energy, mood, or bond drop, the companion should visibly change:

- sad, tired, hungry, or reluctant expressions
- slower idle animation
- fewer excited reactions
- lower celebration intensity
- less personalized language when bond is low
- less confident "thoughts" when usefulness or thought clarity is low
- reluctance toward high-energy two-player activities

Example:

```text
"I want to play Wheel of Fortune with you, but I am low-energy right now.
Can we feed me or do one quick warmup first?"
```

Consequences may affect enthusiasm, expressions, animation, recommendations, hint style, and reward intensity. Consequences must not block required homework or make the child feel blamed for absence or mistakes.

The child should always have a visible repair path:

- feed from backpack
- earn a snack by completing a short node
- choose a calmer activity
- continue anyway with the companion visibly tired

## Learning Economy

Completing a node earns companion money. Money is for buying food, care items, boosts, cosmetics, and rare rewards.

Until the store exists, children should receive a default starter inventory so the care loop can be tested:

- 3 everyday foods
- 1 comfort item
- 1 focus/thought item
- 1 rare reward placeholder

Default items should be enough to demonstrate feeding, mood repair, energy repair, and a special reward animation without requiring the store.

Purchases and item use should improve companion readiness, expression, animation, and helpfulness. They should not bypass learning mastery.

## Food And Items

Food is a companion care resource. It should feel playful, but it should map to learning evidence or store purchases.

Starter food examples:

- Apple Bite: small hunger restore.
- Brain Berry: hunger plus thought clarity.
- Cozy Soup: energy plus mood after hard work.
- Star Candy: happiness and celebration.
- Mystery Snack: rare reward item from mastery or comeback evidence.

Item effects should be logged and bounded. No item should create an infinite boost loop.

## Animation Rules

Use the downloaded feeding concepts as interaction references:

- Animation A: default feeding interaction.
- Animation B: rare earned reward, mastery reward, comeback reward, or store purchase reveal.
- Animation C: not a core feeding loop; only consider later for learning-backed streak rituals.

Animation A should handle normal backpack feeding: tap food, food travels or pops, companion reacts, bars update, particles play.

Animation B should feel special and uncommon: earned mystery item, rare food, mastery unlock, or big store reveal.

Avoid raw rapid-tap feeding as the main loop. Sunny should reward care and learning evidence, not tapping speed.

## Absence And Reunion

The companion remembers when it last saw the child.

Longer absence can lower hunger, energy, mood, usefulness, and eventually bond. The reunion should acknowledge absence without guilt:

```text
"Reina! I remember we were working on clocks last time. I got sleepy waiting,
but I am glad you are back."
```

Do not say or imply the child hurt the companion by being away. Absence creates continuity and repair, not shame.

## Activity Readiness

The companion's care state can affect activity recommendations.

High energy and high bond:

- eager two-player games
- strong celebration
- "we" language
- more expressive animations

Low energy:

- suggests feeding, rest, or warmup before intense games
- can still continue if the child chooses
- lower animation intensity

Low bond:

- quieter greeting
- less inside-joke language
- asks for a reconnect moment before hard work

Low thought clarity:

- fewer confident hints
- asks to use a focus item
- suggests a simpler first step

## Store Direction

The future store should sell:

- food
- care items
- focus/thought items
- mood items
- cosmetics
- rare rewards

The store should spend coins earned from completed nodes and other domain-valid learning work. Store items should make the companion feel more alive and helpful, but they should not replace homework evidence, mastery gates, or care-plan logic.

## Safety And Tone

The companion can be hungry, moody, sleepy, reluctant, proud, silly, or excited. It should not be emotionally coercive.

Allowed:

- "I am low-energy. Can we do a quick warmup?"
- "That snack helped. I feel ready now."
- "I missed our clock mission."
- "I am not feeling Wheel of Fortune yet. Let's power up first."

Avoid:

- "You made me sad."
- "I cannot help unless you buy food."
- "You abandoned me."
- "I am disappointed in you."

The core feeling should be care, repair, and continuity.

## Logging Rule

Every significant companion state change must log in the terminal:

```text
 🎮 [companion-care] [action] [result]
```

Examples:

```text
 🎮 [companion-care] feed apple_bite hunger 0.42 -> 0.62
 🎮 [companion-care] absence_decay energy 0.81 -> 0.63 daysAway=3
 🎮 [companion-care] node_complete coins +25 balance=1300
```

If the care state changes and it is not logged, it did not happen.

