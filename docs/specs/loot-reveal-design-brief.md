# Design Brief: Prize Preview + Loot Reveal

**For:** mock generation. This is a design brief, not an implementation spec.
**Status:** v1 scope. Deliberately smaller than the full concept — see Non-goals.

---

## Purpose, in one line

A child sees what she could win *before* she does the work, and opens a box to find out which one she got *after*.

## Why it is built this way (do not design around these)

- **Prizes are shown in advance.** Concealed contents are what make loot boxes predatory; disclosing them converts a gamble into a goal. This is a hard requirement, not a preference.
- **Every completion opens a box.** Rarity lives *inside* the drop (usually common, occasionally epic), never in whether she gets anything. A child who finishes her work and receives nothing experiences it as punishment.
- **The randomness is the replay engine.** Knowing the pool but not the pull is what makes her want to run a node again — and re-running practice content is spaced retrieval, which is what actually builds durable memory.

## The loop — three beats

1. **Preview.** Before or at the moment she engages a node: "here's what's in this box."
2. **Work.** She does the actual learning activity. (Existing surface, not part of this brief.)
3. **Reveal.** Box animation → the item she got → where it went.

---

## Screens to mock

### 1. Prize Preview modal

Triggered from a node. Shows the pool for *this* node's tier.

States to cover:
- **Standard** — pool of 4–6 items, rarity visually distinct
- **Contains an item she already owns** — owned items marked, clearly not a "waste"
- **Higher tier teased** — one tier above shown as silhouettes, locked and clearly aspirational rather than taunting
- **Pity progress** — if she is close to a guaranteed rare/epic, show it ("2 more opens")

### 2. Loot Reveal

Plays on completion.

States to cover:
- **Common drop** — pleasant, quick, not oversold
- **Epic drop** — the big moment; this is the screen that has to earn the word "epic"
- **Duplicate** — must not feel like a loss; converts to coins
- **Pity triggered** — the guaranteed drop should feel *earned*, not like a consolation prize

### 3. Prize landing

Where the item goes and why it matters.

- Cosmetic items land on the companion — she should visibly *wear* it
- A short "see it on her" beat closes the loop

---

## Child-specific constraints (the important section)

**The primary user is 8 years old, with ADHD, dyslexia, and a language disorder.** These are not general accessibility notes; they are the design brief.

- **Do not rely on reading.** Item names and rarity must be legible as *images and colour*, not text. Any necessary words should be short, high-contrast, and generously spaced. Assume the child may not read a label at all.
- **The companion reads it aloud.** Elli already speaks and reacts; treat her voice as the primary narration channel and text as secondary. Design should leave room for her to be present in these moments.
- **Attention is the scarce resource.** The reveal animation should land in roughly 2–3 seconds. Anticipation is good; a long unskippable ceremony is not. Make it skippable on second viewing.
- **Large touch targets.** Well above adult minimums. Assume imprecise tapping and an excited child.
- **Motion sensitivity.** Provide a reduced-motion variant; the reveal must still feel like an event without heavy particle effects.

## Tone and visual direction

- Fits the existing companion showroom: soft, luminous, "crystal atelier" — not arcade-grimy.
- Prizes themselves lean **8-bit / pixel** as a deliberate contrast against the soft 3D world. The pixel style is the "game" register.
- Rarity should be readable at a glance by a child who cannot read the word "epic": colour, frame weight, motion, and sound all carry it.
- Warmth over spectacle. This is a friend giving you something, not a casino paying out.

## Rules that must not be broken

- No countdown timers, no "expires soon", no artificial urgency.
- No purchase prompts, no real currency, anywhere.
- No concealed odds. If a rarity chance is shown, it must be the true one.
- Never show a "you almost got the epic" near-miss. Near-miss framing is a gambling mechanic and is off-limits.
- The child must never end a completed session with nothing.

## Non-goals for v1

- The browsable **loot room** across all tiers (this brief covers a per-node modal only)
- The **demo room** and preference sensing
- AI-generated prize content
- Trading, gifting, or any social economy

## Open questions for design

1. How does rarity read to a non-reader? Colour alone is risky — what carries it redundantly?
2. Should the preview modal be *required* before a node, or optional? Required builds anticipation; optional respects autonomy and avoids friction on repeat runs.
3. How much of the companion is present in the reveal — voice only, or is she on screen reacting?
4. What does a duplicate look like such that it reads as "still good" rather than "unlucky"?

## Context the designer may want

- Existing surfaces: companion showroom (soft 3D, crystal theme), video-call overlay, activity tray with tic-tac-toe and Connect Four.
- The companion has persistent memory and reacts in character; she can refer to a prize in a later session.
- Node tiers already exist in the learning system: baseline → quest → boss, gated on demonstrated mastery rather than repetition.
