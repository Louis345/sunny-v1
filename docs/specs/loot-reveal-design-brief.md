# Design Brief: Prize Vault, Chest Odds, and Loot Reveal

Self-contained brief for mock generation. Everything a designer needs is below.

---

## The product

**Sunny** is a personal learning app built for one family's two kids. A 3D anime-style AI companion ("Elli") lives in a soft, luminous "crystal atelier" showroom. The child can call her — a FaceTime-style video call where they talk, and play small games together (tic-tac-toe, Connect Four). The companion has persistent memory: she remembers past sessions, recalls games they played, and greets the child with real history.

Learning happens on a map of **nodes** at three tiers, gated on demonstrated mastery rather than time spent:

- **Baseline** — core practice
- **Quest** — applying a skill to unseen problems
- **Boss** — synthesis; requires evidence of transfer

## Who this is for

**An 8-year-old girl with ADHD, dyslexia, and a language disorder.** This is the design brief, not an accessibility footnote:

- **Do not rely on reading.** Rarity, odds and item identity must be legible as image, colour, shape and count — never as text alone. Assume she may not read a single label.
- **Numbers as countable pictures**, never as percentages. "3 out of 10 chests" drawn as ten chests with three glowing. Never "30%."
- **Attention is the scarce resource.** Reveal animation lands in 2–3 seconds. Skippable on repeat.
- **Large touch targets**, well above adult minimums. Assume imprecise tapping by an excited child.
- **Reduced-motion variant required** that still feels like an event.
- The companion speaks; treat **her voice as the primary narration channel**, text as secondary.

## What we're building and why

The child does real schoolwork. Completing a node opens a **chest**. What's inside is random from a **disclosed** pool — she can always see what she might get, and the odds, *before* she plays.

Three principles drive every decision:

1. **Odds are always visible.** Concealed contents are what make loot boxes predatory. Showing them converts a gamble into a goal.
2. **Every completion opens a chest.** Rarity lives *inside* the drop, never in whether she gets anything. A child who finishes her work and receives nothing experiences it as punishment.
3. **Nothing is ever devalued.** No seasons, no resets, no expiring currency, no "this is outdated now." Everything earned is permanent.

The randomness exists for **replayability** — re-running practice is exactly what builds durable memory, so wanting to run a node again is the mechanic doing pedagogical work.

There is a second, quieter goal: **the odds teach probability.** She has real motivation to understand them, which is the rarest thing in math education. A pity timer (guaranteed drop after N chests) is what keeps the lesson honest — randomness doesn't owe you anything, but effort always converts.

---

## Screens to design

### 1. The Prize Vault (the long arc)

A browsable room showing everything she can earn, across all three tiers. This is the aspirational surface — the reason to keep going.

**Two ladders, both visible:**

| Ladder | Shows |
|---|---|
| **Collection** | items owned vs. locked, grouped by tier — "4 of 18" |
| **Capability** | what she can now *do* — "you can do 7×8. Three months ago you couldn't." |

The capability ladder is as important as the loot. It's the proof that the time spent produced something real.

**States:**
- Default — mix of owned, locked, and one tier teased
- Owned item selected — larger view, where it appears on the companion
- Locked item — silhouette; readable as "not yet," never as taunting
- Tier not yet reached — whole tier softly obscured, one tier ahead visible, further tiers vague
- Empty/new user — almost nothing owned; must feel like a beginning, not a barren room

### 2. Chest Preview (odds shown here)

Appears when she engages a node, before the work. "Here's what's in this chest."

Must show:
- The **pool** for this chest — 4–6 items with rarity clearly distinct
- The **odds**, as countable pictures. Illustrative placeholders (tune later):

| Tier | Common | Rare | Epic |
|---|---|---|---|
| Baseline | 8 in 10 | 2 in 10 | 1 in 20 |
| Quest | 6 in 10 | 3 in 10 | 1 in 10 |
| Boss | 3 in 10 | 4 in 10 | 3 in 10 |

- **Tier comparison** — she should be able to see at a glance that a boss chest gives a better chance. This is the whole "harder work, better odds" lesson in one visual.
- **Pity progress** — "2 more chests until a guaranteed rare." Shown as a filling track, not a number.
- Items she **already owns**, marked so a duplicate isn't a surprise disappointment.

**States:** standard; contains owned items; pity nearly full; baseline vs. boss shown side by side.

### 3. Loot Reveal

Plays on completion. This is the payoff moment.

**States, all of which need to feel good:**
- **Common** — pleasant, quick, not oversold. This is the most frequent state; design it first, not last.
- **Rare** — a genuine lift
- **Epic** — the moment that earns the word. Rare enough to matter.
- **Duplicate** — converts to currency; must read as "still good," never as a loss
- **Pity triggered** — the guaranteed drop should feel *earned*, not like a consolation prize

Close the loop: the item lands somewhere she can see it — cosmetics visibly worn by the companion.

---

## Currency

A soft currency exists alongside loot. It buys cosmetic accessories for the companion and is the **agency backstop**: if luck never gives her the thing she wants, saving up can. Duplicates convert into it.

Currency never buys progress, access, or learning content. Cosmetics only.

---

## Hard rules — do not design around these

- **No countdown timers, no "expires soon," no artificial urgency.**
- **No real money, no purchase prompts, anywhere.**
- **No concealed odds.** Any chance shown must be the true one.
- **No near-miss framing.** Never show "you almost got the epic." Near-miss is a gambling mechanic and is off-limits.
- **Never end a completed session with nothing.**
- **Nothing expires or resets.**

## Tone

- Fits the existing world: soft, luminous, warm — "crystal atelier," not arcade-grimy.
- Prizes themselves lean **8-bit / pixel art**, a deliberate contrast against the soft 3D world. Pixel is the "game reward" register.
- Rarity must be readable by a child who cannot read the word "epic" — carried redundantly by colour, frame weight, motion, and sound.
- **Warmth over spectacle.** This is a friend handing you something, not a casino paying out.

## Non-goals for this round

- AI-generated prize content
- Automatic preference learning
- Trading, gifting, or any social economy
- The learning activity itself (existing surface)

## Questions worth answering in the mocks

1. What carries rarity redundantly for a non-reader, beyond colour?
2. How do ten chests render as a countable odds picture without becoming visual clutter?
3. How is a locked tier made aspirational rather than discouraging?
4. Where does the companion appear during the reveal — voice only, or on screen reacting?
5. How does the capability ladder show growth over months without becoming a chart?
