# Spark Orb Flagship Capture — Plan (no implementation yet)

Branch: `claude/spark-orb-flagship-capture` · Worktree: `sunny-spark-orb-flagship`
Status: **awaiting human approval per Law 6** (plan touches far more than 2 files).
Related other-AI worktree: `sunny-spark-orb-capture-personality` on `codex/spark-orb-alive-creature` — do not overlap; coordinate before Phase 1 lands.

## 1. What exists today (audit)

Primary files:

- `web/src/components/SparkOrbLearningShell.tsx` (2361 lines) — the encounter. Creature is a single static `<img>`; the only idle motion is `sparkLearningCreatureBounce` (1.7s fixed sine, translate −50%→−53%) and it only runs in `ready`/`collected` phases. In `idle`, `charge-1`, `charge-2` the creature is **completely frozen** — exactly what the screenshot shows.
- Capture personalities (`playful/shy/brave/sleepy`) exist but only animate during `pulling/shrinking/locked` capture stages. The `watching` reaction has **no CSS rule** — personality is invisible for ~95% of the encounter.
- Launch skill: one drag gesture. `computeSparkOrbLaunchPhysics` decides success purely from drag geometry (`hitDistance ≤ 82` capture radius, vertical sweet spot 178px). The target never moves, capture never fails after a hit (no struggle/escape), `holdPower` is cosmetic. A miss zeroes the charge (`setChargeOverride(0)`) — three correct answers wiped by one bad throw, punishing motor error with academic-progress loss.
- `orbCount` reaching 0 has no handled state (dead end — log to BUGS.md).
- `web/src/components/capturedMonsterReward.ts` — reward gateway has a `child_chart` mode **with no writer implemented**; everything runs `storybook_only`, `chartWriteAttempted: false`.
- The shell is **not imported anywhere outside stories/tests**. The flagship activity has no production path: no adventure-board node launches it, no attempt evidence reaches the chart, no `game-traces.ndjson` lines are written.
- Embedded questions live in the **story file**, not the shell contract — the shell cannot see answers, so it can never emit per-target `attempt_event`s (Law 14 requires `requiresPerTargetEvidence: true` for the `domain_payload_wrapper` mode in `src/engine/activityEvidenceContract.ts:414`).
- Reusable prior art: `MonsterLifeLayer` in `CapturedMonsterDen.tsx` already has `monsterLifeBreathe`/`monsterLifeCurious`/`monsterLifeHappy` keyframes. Reuse, don't reinvent (Maintainability guideline).
- Accessibility: pointer-drag only (no keyboard path), no `prefers-reduced-motion`, no `aria-live` announcements, color-only hit-quality feedback.

## 2. Why the human caught this and the lab did not (AGENTS.md line 2 invariant)

- Tests assert **state labels** (`data-capture-motion`, event payloads), not motion. jsdom never runs CSS keyframes; a frozen creature and an alive creature produce identical DOM assertions.
- Law 5 logs fire on **state transitions**. Idle has no transitions, so a dead idle and a healthy idle are both silent. Absence of evidence looked like evidence of calm.
- New lab invariant: **aliveness must emit a heartbeat.** (a) idle behaviors (blink, glance, fidget) emit trace events so silence is detectable; (b) a Playwright check screenshots the creature region twice, 1.5s apart, in `idle` phase — the diff must exceed a pixel threshold. That converts "looks alive" into a red/green assertion.

## 3. Child-psychology design brief (dopamine, done responsibly)

Dopamine responds to **anticipation and reward-prediction error**, not the reward itself. Current design inverts the reinforcement: the *throw* gets all the spectacle while the *correct answer* (the learning act) gets a dot fill. Levers, mapped to mechanisms:

1. **Make the learning moment the peak juice.** Correct answer → spark visibly flies from the problem panel into the orb; creature notices, ears up, leans toward the child. The creature is a *witness to learning*, associating academic effort with social reward. (Classical association + social reinforcement.)
2. **Variable-ratio bonus, never variable-ratio punishment.** For 5–9-year-olds, unpredictable *loss* breeds avoidance; unpredictable *bonus* breeds delight. A fair hit must always eventually capture (after suspense); variability lives in bonus magnitude — throw quality → star rating, bond boost, rare sparkle/shiny variant at low probability. (Skinner schedules, adapted for child motivation.)
3. **Suspense beat = struggle phase.** 1–3 orb wobbles before lock (Pokémon shake-check). Anticipation is where dopamine actually spikes. Child can "cheer" (rapid taps) during wobbles — active hope instead of passive waiting.
4. **Competence via desirable difficulty.** Creature drifts laterally so aim is a real skill; drift amplitude and capture window adapt from *measured motor evidence* (rolling hitDistance) to hold ~70–80% success — the flow channel. After 2 breakouts, a guaranteed-capture pity window protects against learned helplessness.
5. **Protect earned academic progress.** Misses cost an orb but never drop charge below 1 (endowed-progress effect; the child's spelling was correct — the throw was the miss).
6. **Autonomy & relatedness.** Nickname on capture (exists in reward record), companion reacts (exists), creature "remembers" the word it was caught with ("Lumipuff loves the word *because*!") — retrieval hook for the target itself.
7. **Curiosity gap.** Den shows silhouettes of uncaptured species (catalog currently has only Lumipuff — needs 3–5 species for this to work).

Evidence discipline (Law 14): motor/aim metrics stay `preference_reward / preference_only` engagement evidence — they must never contaminate mastery claims. Academic evidence comes only from the embedded per-target attempts.

## 4. Proposed state machines

### 4a. Creature life (new `CreatureLifeLayer`, layered, all phases)

| Layer | Behavior | Spec |
|---|---|---|
| Autonomic | breathe + hover | scaleY 1.00→1.03 @ 2.6s; vertical drift ±6px @ 3.9s (non-integer period ratio so the loop never visibly repeats) |
| Blink | eyelid overlay / filter flash | scheduler: 2–7s randomized (base 3.5s + jitter, 10% double-blink), Law 2 counter guard, cleanup on unmount |
| Gaze | eye/head offset | tracks pointer, active answer choice, or orb; random glance every 4–9s when idle |
| Mood | reactions to learning events | `spark_earned`→perk+chirp; `missed_try`→concerned lean; `orb_ready`→alternates gaze orb↔child; aim hold→alert freeze; modulated by existing 4 personalities |
| Fidget | personality-weighted idle acts | every 8–15s: ear twitch / look around / sway / yawn(sleepy); never same fidget twice in a row |

States: `resting → (scheduler) blink | glance | fidget`, interrupted by `reacting(event)`, suppressed during capture stages (existing capture animations own the creature then).

### 4b. Capture loop

```
ENCOUNTER (creature drifts laterally, personality amplitude)
  → AIM (hold + drag; existing) → FLIGHT (existing physics)
  → CONTACT (hitQuality: direct/near/wide; existing)
  → STRUGGLE (new: 1–3 wobble pulses = f(hitQuality, rarity, difficulty); cheer input adds capture strength)
  → LOCKED (capture, bonus tier by throw quality)
  | BREAKOUT (new: creature pops out, shakes off, stays on field, wary; orb spent, charge floor = 1)
Adaptive: drift amplitude + capture radius tuned from rolling motor evidence toward 70–80% success; pity capture after 2 breakouts.
```

### 4c. Evidence contract (Law 14 compliance)

- `attempt_event` per embedded question (requires moving the question flow into the shell contract — an `onAttempt`/problem-panel reporting seam so the shell pairs academic target ↔ reward moment).
- `game_state_update` on every phase transition.
- Completion summary: targets shown/correct/missed/recovered, attempts, accuracy, time-to-answer, throws, hitQuality distribution, struggles, breakouts, recoveries, orbs spent, cheer usage, help/skip/pause.
- `game-traces.ndjson` lines via the existing session trace path; implement the `child_chart` writer behind `recordCapturedCreatureReward` (chart-waterfall path per Law 12, never a private score).

## 5. Failing tests to write FIRST (Law 1)

1. **Idle aliveness** — creature has an active life state in *every* phase incl. `idle`/`charge-1` (fails today: no animation in those phases).
2. **Blink irregularity** — fake timers + seeded RNG: ≥3 blinks in 15s, intervals not all equal (σ > 0.8s); scheduler obeys Law 2 counter guard and cleans up on unmount.
3. **Struggle phase** — after `release_success`, `capture_struggle` events with `pulseCount ∈ [1,3]` precede `capture_lock`.
4. **Breakout preserves learning** — breakout path emits `capture_breakout`, creature remains visible, `chargeCount ≥ 1` (fails today: charge zeroes).
5. **Moving target** — creature x-position changes over time in `ready` phase.
6. **Evidence contract** — completion emits the Law 14 summary; `child_chart` mode calls the chart writer (mock) and appends ndjson trace lines; motor metrics tagged engagement-only.
7. **Playwright aliveness heartbeat** — Storybook `idle` phase: two creature-region screenshots 1.5s apart must differ beyond pixel threshold; with `prefers-reduced-motion`, motion is reduced but blink persists and the check still passes at a lower threshold.
8. **Keyboard capture path** — focus orb → arrows aim → hold Space charges → release launches; identical event payloads; `aria-live` announces spark earned / capture.

## 6. Phasing (Law 3: one theme per phase, one commit each; Law 6: approval before starting)

| Phase | Theme | Files (est.) |
|---|---|---|
| 1 | Creature aliveness layer (blink/breathe/gaze/fidget, reuse MonsterLifeLayer patterns) | new `CreatureLifeLayer.tsx`, shell integration, tests |
| 2 | Struggle/breakout + charge-floor rebalance | shell, sfx, tests |
| 3 | Moving target + adaptive difficulty from motor evidence | shell physics, tests |
| 4 | Evidence: per-target attempts seam, completion summary, child_chart writer, ndjson traces | reward gateway, shell, engine contract, tests |
| 5 | Learning-moment juice (spark flight answer→orb, creature witnesses) + bonus tiers | shell, story, tests |
| 6 | A11y: keyboard path, reduced motion, aria-live | shell, tests |

Out of scope for now (logged, not built): multi-species catalog + Den silhouettes, session/adventure-board integration node, orbCount=0 dead end (→ BUGS.md).

## 7. Acceptance bar (from product owner, refined)

- Creature reads as alive within 3s of mount, zero input, in every phase.
- Blink intervals visibly irregular; breathing + hover are layered and never phase-lock.
- Capture requires aim on a moving target; success ~70–80% after adaptation; every capture passes through a suspense struggle.
- A fair hit never hard-fails silently; breakout is a recoverable story beat, not a punishment for learning.
- Misses, struggles, breakouts, recoveries, and cheers all emit structured events; completion summary reaches the child chart; traces land in ndjson.
- Motor evidence never appears in mastery claims.
