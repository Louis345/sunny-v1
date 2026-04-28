# Wheel of Fortune — Spelling Game

### Design & Implementation Handoff

**Project Sunny · games/spelling/**  
_Prepared for Claude Code / Cursor handoff_

---

## What This Is

A bonus-round Wheel of Fortune spelling game that unlocks when a child (Ila, age 7–8, dyslexia) struggles with a specific word during her session with Elli, her AI learning companion. It is designed to feel like **the most exciting 3 minutes of her day** — not remediation, not work.

The game runs as a surprise unlock. Elli and Ila solve it together. Elli always loses on BANKRUPT; Ila's coins are always protected. This is intentional — it keeps the child safe from frustration while giving Elli a dramatic reaction moment.

---

## The Three Design Directions

Three complete visual worlds were explored. Each has its own atmosphere, not just different colors.

### Direction A — Neon Cosmos `cosmos`

**Palette:** `#070010` deep space bg · `#a855f7` purple · `#f59e0b` amber · `#06b6d4` cyan  
**Feel:** Arcade cabinet from the future. Maximum hype. Lives in the same dark-purple universe as the rest of the Sunny app (existing `#070010` base).  
**Wheel:** Purple/blue gradient segments, amber gold ring, glowing hub  
**When to use:** If the rest of the app stays dark/space-themed — this is the most native fit.

### Direction B — Sunken Treasure `treasure`

**Palette:** `#071426` deep ocean bg · `#f59e0b` gold · `#0d9488` teal · `#ef4444` coral  
**Feel:** Indiana Jones meets Sesame Street. Warm, adventurous, slightly warmer emotional register.  
**Wheel:** Amber/brown treasure compass segments, teal ring  
**When to use:** If the app ever pivots to a warmer/cozier feel, or for a different child profile.

### Direction C — Enchanted Forest `enchanted`

**Palette:** `#071012` deep forest bg · `#34d399` emerald · `#c084fc` violet · `#fb923c` peach  
**Feel:** Firefly magic. Quieter atmosphere but electric in the dramatic moments. Most distinct from Direction A.  
**Wheel:** Forest green segments, violet ring  
**When to use:** Great for a calmer child or an alternate theme skin.

> **Recommendation:** Direction A is the right call for Ila. It matches your existing app palette and delivers the arcade energy the brief asked for. Direction C is worth keeping as an alternate skin — it's the most differentiated visually.

---

## Screen States

Each direction implements three frozen game states:

| State    | `state` prop | What happened                                                           | Elli mood        |
| -------- | ------------ | ----------------------------------------------------------------------- | ---------------- |
| Mid-Game | `midgame`    | Wheel landed on 400, Ila picks a letter                                 | 🌟 Happy/excited |
| Bankrupt | `bankrupt`   | Elli's spin hit BANKRUPT · Elli loses all coins · Ila's coins untouched | 😱 Shocked       |
| Solved   | `celebrate`  | Word fully revealed · slot machine celebration                          | 🤩 Celebrating   |

**Puzzle word used in designs:** `RABBIT` · Category: Animals  
In production this word comes from the session's active word (whatever Ila just struggled with).

**Tile state mid-game:** `R _ B B _ T` (indices 0, 2, 3, 5 revealed)

**Coin state:**

- Ila: 850 → 1350 on solve
- Elli: 600 → 0 on bankrupt (stays 0 through celebrate)

---

## Component Map

```
GameScreen (direction, state)
├── Particles            — ambient bg (stars / fireflies / bubbles per theme)
├── WheelSVG             — 10-segment SVG wheel, accepts rotation + spinning props
├── [SPIN button]        — calls handleSpin() → triggers wheel animation + sounds
├── ScoreCard ×2         — Ila + Elli, bankrupt state shows red shake
├── TileRow              — 6 letter tiles (RABBIT), revealed indices passed as array
├── LetterBank           — 8 letter buttons, highlighted letter plays reveal sound on click
├── CelebrationBanner    — slot-machine word reveal + bouncing RABBIT! text (celebrate only)
├── CoinRain             — absolute-positioned falling 🪙 emojis (celebrate only)
└── ElliPortrait         — speech bubble + emoji face, mood-reactive animations
```

---

## Sound Engine

**Fully synthetic — no audio files.** All sounds generated at runtime via Web Audio API oscillators and noise buffers. Works offline. Zero network requests.

```javascript
SE.spinWhoosh()      // On SPIN button press — filtered noise burst + sawtooth sweep
SE.spinSequence(3.2, onLand)  // 52 scheduled tick sounds with ease-in-out timing curve
SE._landThud()       // Called internally at end of spinSequence — low sine thud + tick
SE.bankrupt()        // Descending sawtooth wah-wah + stutter glitches + deep rumble
SE.letterReveal()    // 4-note ascending sine ping (880 → 1320 → 1760 → 2093 Hz)
SE.buttonTap()       // Soft 2-tone tap for non-highlighted letter buttons
SE.coin(when?)       // Single coin tinkle, random freq 1100–1800 Hz, scheduleable
SE.fanfare()         // 8-note ascending arpeggio → triumphant 5-voice chord → 16 coin shower
```

**AudioContext init:** Lazy — created on first user interaction. No autoplay violations.  
**Replay:** Each artboard's button re-triggers that state's signature sound independently.

### Wheel Spin Math

- 10 segments · 36° per segment
- Pointer sits at top (SVG y=4, angle −90°)
- Segment `i` midpoint angle = `(i + 0.5) × 36°` clockwise from top
- To land on segment `i`: `wheelRotation += 6 × 360 + (i + 0.5) × 36`

| State     | Target Segment | Index | Rotation offset |
| --------- | -------------- | ----- | --------------- |
| Mid-game  | 400            | 5     | 198°            |
| Bankrupt  | BANKRUPT       | 2     | 90°             |
| Celebrate | 500            | 7     | 270°            |

CSS transition on spin: `transform 3.2s cubic-bezier(0.12, 0.6, 0.2, 1.0)` (fast launch, gradual ease-out)

---

## Accessibility Constraints (non-negotiable)

| Rule              | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Font              | **Lexend** throughout — loaded from Google Fonts, weight 400–900 |
| Minimum font size | **18px** — no exceptions, including labels, hints, score cards   |
| Contrast          | All text on dark backgrounds, verified for dyslexia readability  |
| Tile size         | 60×70px minimum — large enough for children's motor accuracy     |
| Letter buttons    | 52×52px — above 44px iOS minimum touch target                    |
| Elli portrait     | Always bottom-right, always visible, never clipped               |
| Bankrupt copy     | **Always** includes "Your coins are SAFE" message for Ila        |

---

## What Needs to Be Built in Production

This HTML is a **static design prototype** — it demonstrates the full visual language, interaction model, and sound design. The production implementation needs:

### 1. Dynamic word injection

Replace hardcoded `RABBIT` with the session's active word from the learning engine:

```typescript
// From learningEngine.ts / sessionLog
const activeWord = session.currentWord; // e.g. "sit", "hat", "rabbit"
```

Tile count, positions, and initial reveal state all derive from this.

### 2. Real game loop state machine

```
IDLE → SPIN_ANIMATION → RESULT_REVEALED → LETTER_PICK → TILE_REVEAL → (repeat or SOLVE)
```

Bankrupt: skip LETTER_PICK, go to SPIN_ANIMATION for next turn  
Free Letter: auto-reveal most common missing letter  
Elli Spins: Elli picks a letter (call Elli agent with `wheelGamePickLetter` tool)

### 3. Elli agent integration

On each game event, call the Elli companion with a game context message:

```typescript
// Events to pass to Elli:
'wheel_spin_start'     → Elli hypes the spin ("Here we go!")
'wheel_landed_value'   → Elli reacts ("Ooh, 400 coins!")
'wheel_landed_bankrupt'→ Elli reacts dramatically ("OH NO! All my coins!")
'letter_correct'       → Elli celebrates ("Yes! R is in there!")
'letter_wrong'         → Elli encourages ("Not this time — let's try another")
'word_solved'          → Elli goes wild (trigger fanfare)
```

Elli's responses should use the **2-sentence hard cap** per her companion spec.

### 4. Score persistence

Write coin totals back to `sessionLog` at game end:

```typescript
sessionLog({
  gameType: "wheelOfFortune",
  word: activeWord,
  ilaCoins,
  elliCoins,
  solved: true / false,
});
```

### 5. Elli Spins segment logic

When wheel lands on "ELLI SPINS":

- Disable child's letter bank
- Show "Elli is thinking..." bubble
- Call Elli agent to pick a letter
- Auto-submit after 1.5s with Elli's choice
- Play `SE.letterReveal()` if correct, `SE.buttonTap()` if not

### 6. Game unlock trigger

The game unlocks when `masteryGating.ts` or `desirableDifficulty.ts` flags a word as:

- Attempted ≥ 2 times in the current session with `correct: false`
- Difficulty score above threshold (see `desirableDifficulty.ts`)

Suggested API surface:

```typescript
// Returns the word if bonus round should unlock, null otherwise
shouldUnlockWheelGame(sessionData: SessionData): string | null
```

---

## File Structure

```
games/
└── spelling/
    ├── WheelOfFortune.html     ← Full design prototype (this file)
    ├── HANDOFF.md              ← This document
    └── (future)
        ├── WheelOfFortune.tsx  ← Production React component
        ├── soundEngine.ts      ← Extracted SoundEngine class
        ├── wheelMath.ts        ← Segment rotation utilities
        └── types.ts            ← GameState, WheelSegment, etc.
```

---

## Open Questions for Claude Code / Cursor

1. **Which direction?** Recommend locking Direction A (Neon Cosmos) for Ila's profile. The other two can be skinned via the `THEMES` object — the component is already theme-parameterized.

2. **Elli Spins timing:** How long should Elli's "thinking" state last before auto-picking? Suggest 1.2–1.8s to feel natural without losing momentum.

3. **BANKRUPT frequency:** Should BANKRUPT ever hit Ila? Currently: never. This is intentional per the brief. Recommend keeping it — the emotional safety of "you're protected" is a core UX principle for this child.

4. **Word list source:** Does the wheel game always use the session's current word, or can it pick from recent struggled words? Multi-word puzzle round would be more game-like but adds complexity.

5. **Rive integration:** The project has `.riv` files (alien character, pixel project). If Elli gets a Rive animation, the portrait circle in `ElliPortrait` is the integration point — swap the emoji for a Rive canvas.

6. **Sound volume:** The `SoundEngine` has no master volume. Add a `gain` multiplier or mute toggle — some sessions may be in quiet environments.

---

## Quick Reference: Key CSS Animations

| Name                       | Used for                                |
| -------------------------- | --------------------------------------- |
| `spinBtnPulse`             | SPIN button idle glow (draws attention) |
| `wheel-spin-wrap.spinning` | CSS transition on wheel rotation        |
| `celebPop`                 | Letter tiles popping in on solve        |
| `coinFall`                 | Coin rain on celebration screen         |
| `bounceUp`                 | Elli celebrating, RABBIT! text          |
| `shake`                    | Bankrupt score card, shocked Elli       |
| `bankruptFlash`            | Red vignette pulse on bankrupt          |
| `pulseGlow`                | Header badge, SPIN button               |
| `firefly` / `twinkle`      | Background particles per theme          |

---

_Design by Claude · April 2026 · Project Sunny_
