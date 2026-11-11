# Sunny Arcade Cook-Off

Owner direction, 2026-11-10: "Give them complete creative freedom to build an arcade-like game that teaches them, based on their soul MDs, and compare all the models. Like a chef's kitchen."

The idea: same kitchen, same ingredients, a different chef at each station, and the kids are the judges.

## Goals

1. **Find out which model builds the game each girl learns from and wants to play again.** That means learning plus replay, not "looks impressive."
2. **Break the repetition.** Ila's spelling unit put Monster Stampede on 10 of 11 boards and the "Lantern" theme on 5 boards in a row. The cook-off checks whether fresh game designs beat recycled ones.
3. **Keep the same pipeline.** Every chef goes through the existing Experience Creator path (`generateCanonicalProgressionArtifact`), using the same Planner target, chart and soul files. Only the model changes. No new AI role, so the Math Prompt Chain Boundary is respected.
4. **Every winner becomes catalog material** (Law 11), with what it targets, the evidence it used, how it was measured, and a reuse/revise/retire decision.

## The kitchen (what every chef gets)

| Ingredient | Source |
|---|---|
| Who the child is | `src/context/<child>/soul.md`, passed in as written |
| What she has shown so far | The chart, through `creatorChildContext` (engagement observations, rewards, reading access) |
| This week's target | The Planner's latest node for her: academic target, items, evidence rules, items already seen |
| The ticket | [chef-ticket.md](chef-ticket.md): persona, freedom, hard rules, scorecard, inspiration board, Sunny spin, output contract |
| Her brief | [brief-ila.md](brief-ila.md) / [brief-reina.md](brief-reina.md): what tonight's run would hand each chef |

## The chefs

| Station | Model | Why it's here |
|---|---|---|
| 1 | `claude-fable-5-2` | Newest and strongest on the API key (released 2026-11-09) |
| 2 | `claude-fable-5-1` | Checks whether 5.2 is actually better than 5.1 |
| 3 | `claude-opus-5-5` | Strong and cheaper |
| 4 | `claude-sonnet-5-5` | **The champion:** today's Experience Creator builder |

That's 4 chefs × 2 girls = **8 games**. Each gets one repair try if it fails technical validation, which is the harness's existing rule.

## The scorecard

Learning comes first. The game's own score is **never** used as learning evidence (Law 14).

| Category | Weight | Measured by | Who scores |
|---|---|---|---|
| **Learning** | 40% | Accuracy on this game's target items in a **later check outside the game** (the Trophy Check or the next board), compared with items she practiced in other games | Sunny's evidence (canonical cycle) |
| **Replayability** | 20% | Coins she **spends** to play it again, plus times she picks it when nothing requires it, over 7 days, divided by times it was offered | Sunny's coin and arcade records |
| **Dopamine and feel** | 15% | Kid card "Fun?" plus parent observation (laughing, "again!", playing past the end) | Kid + parent |
| **Intuitive** | 10% | Seconds from the first screen to her first correct, unassisted action. No reading needed to start. Help requests count against it. | Game traces + parent |
| **Personalization** | 10% | Kid card "Made for me?" plus a parent check: does it use her actual world, or would it work for any kid? | Kid + parent |
| **Looks** | 5% | Kid card "Pretty?" | Kid |

### The kid card (tap faces, no reading needed, the companion reads each question aloud)

| # | Question | Faces |
|---|---|---|
| 1 | Was it fun? | 😴 🙂 😄 🤩 |
| 2 | Want to play again? | 👎 🤷 👍 🔁 |
| 3 | Was it easy to figure out? | 😵 🤔 🙂 😎 |
| 4 | Was it made just for you? | 🤷 🙂 😊 💖 |
| 5 | Did it look cool? | 😐 🙂 😍 ✨ |

### The parent card (you and Saori, about 30 seconds per game)

- Did she learn the thing, or just play around it? (1–4)
- Did she need help to start? (none / once / more)
- Moments worth noting (free text: "laughed at the boss", "quit at stage 2")

### Rules for a fair contest

- **Blind:** neither girl knows which chef made which game. Games are named by their own titles only.
- **Rotating order:** each girl plays her 4 games in a different order across days, so going first or the novelty of a new game doesn't decide the winner.
- **Separate tables per girl.** They are different learners, and the soul files say never to compare them.
- **A minimum before calling a winner:** each game offered at least 3 times over at least 5 days.

## How a run goes

1. **Approve this file and the ticket** (owner).
2. **Harness change, tests first** (Law 1). Two small, independently testable changes in the Experience Creator:
   - Choose the model per run (the cook-off sets it; production stays on its default).
   - A cook-off output limit large enough for a real game (proposed: 200,000 characters), and one approved engine allowed from a CDN (Phaser 3, pinned version). Production limits stay unchanged.
3. **Cook-off run overnight** on a sandbox copy of each girl's chart. Saori and her real records are never written. Output: 8 games, a screenshot and playthrough of each, and the measured token cost per chef.
4. **Owner tasting:** you play all 8 first and drop anything broken or unsafe.
5. **Kids play** over 5–7 days, as blind rotating stops or arcade picks, and tap their cards.
6. **Results:** a winner per girl, the score in each category, the cost per chef, and a catalog decision per game (reuse / revise / retire).

## Estimated cost

Prices per million tokens (input / output): Fable 5.2 $8 / $40 (from launch coverage, not yet in the SDK price table), Fable 5.1 $10 / $50, Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10. The estimate assumes about 15k tokens in and 80–120k out (including thinking) per game, with up to 2 tries.

| Chef | Per game | 2 girls |
|---|---|---|
| Fable 5.2 | ~$3–5 | ~$6–10 |
| Fable 5.1 | ~$4–6 | ~$8–12 |
| Opus 5.5 | ~$2–2.50 | ~$4–5 |
| Sonnet 5.5 | ~$1–1.20 | ~$2–2.50 |
| **Total** | | **~$20–30** (worst case with every repair try used: ~$45) |

Real token counts are logged per run and reported with the results.

## What this does not do

- It doesn't change any girl's live board. Winners join the catalog only after the owner says so.
- It doesn't add a new AI role or pipeline. It's the same Experience Creator with a different model.
- It doesn't copy any existing game. Inspiration is limited to genres and mechanics, all in Sunny's own art and world.
