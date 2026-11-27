# Proposal: the AI designs the check-up (spelling first)

Status: draft for owner approval, 2026-11-08. Nothing is built until approved.

## The concerns this answers

1. One way of working for every subject, not a pipeline per subject.
2. The opening check-up is boring and the same every time.
3. The AI is boxed in by rules about how it may assess.
4. Personalization comes from the child's chart, never from hard-coded choices (Japanese suited Ila and Reina; another child gets something else).
5. Sessions should feel new and rewarding. Not everything is dopamine: some learning is hard thinking, like a grind in a game that leads somewhere. The Planner may choose real struggle; the measure is learning and whether she comes back, not fun.
6. Rules beyond honest records and child safety keep the AI from finding better ways to teach.

## The vision (one loop for every subject)

```text
chart (source of truth)
→ diagnose (the AI designs how)
→ care plan
→ treat: use existing games, or build one when none fits
→ measure: answers, help given, and the AI's predictions are logged
→ calibrate: graded test scores show whether the predictions held, and the AI adjusts
```

Each subject brings only its games and its answer key. Why one loop rather than a pipeline per subject that inherits shared rules: this week every shared change (Contract 54, chests, call tickets, board-finished rules) had to be made twice or only reached spelling, and math alone needs a second provider key. Per-subject tweaks accumulate until the pipelines diverge. A read-only comparison of math and spelling can confirm this before any merge; math is not touched by this proposal. This proposal covers the **diagnose** step, for spelling, because that is where the boredom is and where the loop starts.

## Today

- The Planner may check all, some or none of the words first (contract 54).
- But every check uses **one instrument**: Word Radar hidden-word recall, typed on a keyboard. It is the only activity certified as an independent check-up (`independentDiscovery`, protocol `spelling-recall-v1`).
- So every new list opens with the same screen, whatever the child's chart says.
- Spelling production runs on built games (Word Radar, Letter Rush, Concept Check, Visual Explainer, Mystery) configured with her words. It can already *ask* for a new game (`generationRequests`), but only math builds them; generated spelling games exist only in the sandbox.
- The spelling Planner's instructions still carry a long list of directives (which game when, what to hold back, ordering), beyond what keeps the record honest.

## Proposed

**Rule:** before teaching a word, find out where she is with it. How is the AI's choice.

The Planner can either use Word Radar as now, or **design a check-up for this child** in any form her chart points to: a story where she spells words to move the plot, a puzzle, a challenge, a mission. A model builds it, as the creative sandbox already does. Every check-up type is an experiment, recorded with its results, so Sunny learns what works for her instead of one-size-fits-all.

**What code still guarantees, so the results stay honest** (a check-up that fails any of these never counts as a check-up):

1. **The word is hidden** until she has answered it. Code checks the screen in a real browser before the game is ever shown to her (the sandbox already has this check).
2. **Every answer is reported per word** through Sunny's normal answer path, with what she typed or said.
3. **Help is visible.** If the game shows letters, gives hints, or Elli helps, the answer is recorded as assisted, not independent. Code decides this from what happened, not from the game's own claim.
4. **It runs safely in front of her:** it loads, and a robot can get an answer through. While *building*, the AI is free to search, read GitHub, use packages and pull data; everything it needs is bundled into the game, so what code checked is exactly what she sees. Live calls while she plays are allowed and logged so bugs can be traced. Nothing that identifies her (name, voice, face, personal details) leaves Sunny.
5. **Code verifies, the AI never grades itself.** That is already a forbidden pattern in the contract, and it stays forbidden.

If the built check-up fails these checks, the board opens with Word Radar instead, and the failure is logged. The board always publishes.

**Recalibration:** each check-up's predictions are compared with her graded test, word by word. The Planner sees each check-up type's track record ("story check-ups predicted Ila's test 8/10; Word Radar 9/10") and chooses with that in view. A check-up whose predictions stop matching reality stops being trusted, and the record shows why.

## What we reuse (little new machinery)

- The sandbox's game builder and its browser checks.
- The math pipeline's step that saves and serves a built game.
- The existing answer path, help logging (`[companion] [support-mode]`) and chart.

## Build plan for today (each step tested first, Law 1)

0. **Gut the rules:** remove every directive in the spelling Planner's instructions except what keeps the record honest or protects the child. Lines that describe how a tool works (required fields, what a game can render) stay, because they are facts, not choices. Tests updated to match.
1. **Check-up contract in code:** the four checks above, as one function that answers "may this game count as an independent check-up?" Tests first.
2. **A new Planner choice:** `choose_discovery` gains `design_checkup` with a short brief (idea, which words, why it fits her). Prompt wording stays positive (no do-not lines).
3. **Build step at ingest:** the brief goes to the builder; the result goes through the contract; pass → it is her Discovery (or her activity), fail → the built games, logged. The board always publishes.
4. **Answers land as today:** independent, assisted or practice, per word.
5. **Contract 55** in LEARNING_FEEDBACK_LOOP.md: the rule becomes "diagnose before treating; any check-up that passes the code checks may be the instrument."
6. **Try it:** a sandbox run on a past list first, then Ila's next list.

## Pros

- The first thing she sees on a new list can be about her, not the same screen every time.
- The record stays honest: same checks, same chart, same graded test as judge.
- It is the first piece of the shared loop: the same contract works for math ("problem hidden until answered, per-problem result, help recorded").

## Cons and risks

- **Cost:** one build call per list, on top of the Planner. Roughly the sandbox's per-game cost; we will log it.
- **Time:** building and checking takes a few minutes at ingest, before the session, not during it.
- **Weaker evidence:** a story check-up may be noisier than Word Radar. The track-record comparison is how we find out, and Word Radar stays available.
- **Leaks the robot misses:** a game could hint at spelling in ways the browser check does not catch (a picture, a rhyme). The check-up's track record would show it; you can also play-test new check-up types first.
- **Voice:** Ila answers by speaking. Built games must use Sunny's speech path, not their own, or her spoken answers won't be heard. The sandbox games already speak through Sunny's narration path; answering by voice needs checking.

## How we know it worked (per list, against Word Radar lists)

- Graded test score and how well the check-up predicted it.
- Whether she finishes the check-up, and her rating.
- Time to the first reward, and help requests.

## Decisions (owner answers, 2026-11-08)

- One engine, subjects supply data (games + answer checking), no inheritance. Math untouched today.
- Network: open, logged; nothing that identifies her leaves Sunny through a built game. Claude, as Sunny's Planner and builder, keeps seeing her name and interests so it can personalize (owner, 2026-11-08).
- Rules: gut everything except honest records, child safety and tool facts.
- Goal: Ila's next session gets content built for her, for fast feedback.

## Open decisions

1. Approve the rule change (contract 55)?
2. Word Radar as the fallback when a built check-up fails, or should the Planner be told and choose again?
3. Play-test each new check-up type yourself before Ila sees it, or let it go straight to her once the code checks pass?
4. Network while she plays: bundled at build time plus logged calls through Sunny (recommended), or open internet from the game?
