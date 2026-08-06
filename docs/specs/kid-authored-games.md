# Spec: Kid-Authored 8-Bit Games

**Status:** captured, not started. Parked deliberately while Connect Four finishes its first real test with Ila.

**One line:** let the child build small 8-bit games whose *creative parts come from what she has actually learned*, and make Elli the audience.

---

## The motivation this is trying to serve

Sunny needs a dopamine loop that makes a child *want* to come back, without turning learning into the tax she pays to reach the fun. This is one candidate of several; the point is to find what sticks, then build it out.

The original framing was: *kids build games, and to build games they need coins.* The destination is right. The coin gate is the part that will eat the project, for a specific and well-documented reason.

## The trap: coins as a gate

**Lepper, Greene & Nisbett (1973), "Undermining children's intrinsic interest with extrinsic reward."** Preschoolers who already enjoyed drawing were split into groups; one was promised a reward for drawing. In later free play, the rewarded group drew *less* than children who were never rewarded. Naming a reward converted play into work. This is the **overjustification effect**, and it is among the more replicated findings in motivation research.

Applied here: if coins buy access to game-building, the system tells the child that **building games is the real thing and learning is the toll**. She will optimise for the toll — rush the math, farm the coins. The result is a very sophisticated chore chart.

**Deci & Ryan's Self-Determination Theory** supplies the alternative: intrinsic motivation runs on **autonomy, competence, relatedness**. Access gates attack autonomy directly.

## The reframe: learning expands the toolbox

Do not let earned currency buy **access**. Let learning buy **capability**.

| Don't | Do |
|---|---|
| "50 coins unlocks the game editor" | "You mastered multiplication — your game can now have enemies that *multiply*" |
| "Spend coins to add a sprite" | "You nailed this week's spelling list — those words are now your game's dialogue" |

Same loop, opposite relationship to school. In the gate model learning is endured; in the toolbox model **learning is the source of creative power**.

This is **Papert's constructionism** (*Mindstorms*, 1980): children learn most deeply while building something shareable and personally meaningful. It is the thesis behind **Scratch** (Resnick et al., MIT Media Lab) and its design principle of *low floor, high ceiling, wide walls*.

## Why this solves "content goes stale"

The worry that motivated this idea is correct: authored content is finite, and Sunny will run out.

But the naive fix — "kid-made games are infinite" — is not quite true either. A seven-year-old's game is usually not fun to replay a third time. Infinite *quantity* is not the same as sustained *pull*.

What does not go stale is **the making, plus an audience**. Scratch did not succeed because the games were good; it succeeded because somebody saw them.

**Sunny already has the audience, and it is better than Scratch's.** Elli can play the child's game, react in character, and *remember it next session*. A companion who brings up your game two days later is a stronger loop than any coin balance. That machinery shipped: deterministic `gameRecord` plus Haiku-compacted narrative memory, injected into every conversation.

The second staleness fix is that **the toolbox tracks the curriculum**. Because the creative parts are minted from what the child just learned, the palette keeps moving on its own. Content cannot go stale while school keeps happening.

## What already exists (this is closer than it looks)

- `src/scripts/generateGame.ts` — AI game generation
- `src/scripts/validateGeneratedGame.ts` — generated-artifact validation
- `src/engine/directMathExperience.ts` — generates a complete, self-contained playable HTML activity, with a declared QA script, driven through a real Playwright journey before it is allowed to ship. Includes a repair loop that feeds validator errors back to the model.
- Companion memory — `gameRecord` (deterministic), `rivalryNote` / `companionSelfNotes` (narrative, model-authored but constrained)
- The companion activity contract — a registry-driven surface where a new game is one descriptor plus one component

The missing pieces are the child-facing authoring step and the "Elli plays your game" beat, not the generation pipeline.

## Smallest testable version

Do **not** build a game engine or a sprite editor first.

1. Ila finishes real work (the spelling / math she is already doing).
2. She picks a theme and one thing she learned.
3. The existing pipeline generates a small 8-bit game **using her own content**.
4. **Elli plays it**, reacts in character, and it enters companion memory.
5. Next session, Elli mentions it unprompted.

### Success / failure — decided in advance

- **Success:** she asks to make another one *unprompted*, and the ask arrives *before* any question about cost.
- **Failure:** the first thing she asks is how many coins it costs. If currency is the first thing out of her mouth, the gate has already formed in her head and the mechanic should be removed, not tuned.

Note the failure condition is about **her language, not her engagement**. A child can be engaged and still be learning the wrong lesson about why she is doing it.

## Honest caution on the underlying thesis

The claim "Sunny can teach better than traditional school" usually leans on **Bloom's 2-sigma problem (1984)** — tutored students outperforming classroom students by roughly two standard deviations.

Use it carefully. **That specific effect size has not replicated well**, and Bloom's original study conditions were unusual. The defensible version of the claim is the weaker, well-supported one: **1:1 tutoring reliably outperforms one-to-many instruction**. Cite the true weaker claim rather than the shaky strong one — the pitch survives scrutiny that way.

## Open questions (decide before building)

1. **Does currency exist at all in v1?** Recommendation: no. Ship the toolbox without any economy and see whether the loop pulls on its own. Add currency only if the loop is real but under-motivating — never as the thing that makes it work.
2. **How much authoring does the child actually do?** Choosing a theme and supplying content is very different from placing sprites. Start at the low-agency end; autonomy can be added, but a blank canvas that produces something ugly is a motivation *sink*.
3. **Who else sees it?** Elli is the guaranteed audience. A sibling or parent as a second audience is likely a large multiplier and near-zero engineering.
4. **What stops a bad generation reaching her?** The existing Playwright-gated pipeline already refuses to ship an artifact that fails its own declared QA. Reuse that, do not bypass it.

## Prerequisite

Connect Four must get one real session with Ila first. It answers the same underlying question this idea depends on — *does a reward surface actually pull her back unprompted?* If it does not, a game-builder will not either, and that is one evening of learning instead of three weeks.
