# Project Sunny — Architecture Laws

Every contributor (human or AI) must read this before touching any file.

## The Prime Directive

Build systems, not features.  
Fix roots, not symptoms.  
A bug fixed twice is an architecture problem.

---

## Law 1: Single Source of Truth

Every piece of knowledge lives in exactly one place.

**TOOLS:** Defined once in `src/agents/elli/tools/`  
→ `generateToolDocs()` reads them automatically  
→ Psychologist prompt receives them automatically  
→ Adding a tool = one new file; docs stay generated (server/tool routing may still need wiring)

**CANVAS MODES:** Defined once in `Canvas.tsx`  
→ `generateCanvasCapabilities()` reads them automatically  
→ Psychologist receives them automatically  
→ Adding a mode = one file, zero duplicate prose in prompts

**CHILD PROFILES:** Defined once under `src/context/{child}/` (e.g. `soul.md`)  
→ Every agent reads from there  
→ Never duplicate profile data in prompts

**VIOLATION:** Hardcoding tool descriptions in prompts  
**VIOLATION:** Hardcoding canvas modes in prompts  
**VIOLATION:** Hardcoding child names in logic

---

## Law 2: Server Enforces Infrastructure, Claude Enforces Nothing

The **server** owns:

- State machine transitions
- TTS pipeline and audio
- WebSocket routing
- Latency measurement
- Session lifecycle

**Claude** owns:

- What to say
- When to use a tool
- How to respond to the child
- Pedagogy and relationship

**Hard constraints** (safety, session end, barge-in) may be reflected briefly in prompts *and* enforced in server code—that redundancy is intentional.

**VIOLATION:** Server gates that constrain Claude's pedagogy  
**VIOLATION:** Prompt rules that should be server state  
**VIOLATION:** Claude making authoritative UI or lifecycle decisions alone

---

## Law 2a: Tool Lists Are Infrastructure

The set of tools available to Claude is an infrastructure decision, not a pedagogy decision.

The **server** decides which tools exist for a given session type.
**Claude** decides when and how to use the tools she's given.

Removing `showCanvas` during a worksheet session is not constraining Claude's teaching.
It is enforcing canvas ownership — the same way a classroom projector has one controller at a time.

**VIOLATION:** Giving Claude a tool and then asking her not to use it in a prompt  
**VIOLATION:** Hardcoding the same tool set for all session types  
**VIOLATION:** Claude calling infrastructure tools (showCanvas, blackboard) that conflict with server-driven UI

---

## Law 3: Dynamic Over Static

If a human has to update two files when adding one feature, the architecture is wrong.

Prompts are generated — not written.  
Tool docs are generated — not written.  
Canvas capabilities are generated — not written.  
Session plans are generated — not written.

Static prompts are a code smell.  
If you're writing tool descriptions in a prompt string, stop and build a generator instead.

---

## Law 4: Tests First

No feature ships without a failing test first.  
No bug fix ships without a test that catches the regression.

Tests live in `src/tests/`.  
Pipeline contracts live in `src/scripts/test-pipeline.ts`.

If you can't write a test for it:

- Behavioral AI responses → human evaluation via logs
- Latency → pipeline contracts
- Tool correctness → `test:tools`
- TTS quality → `test:tts`

Exploratory prompt/UX work may ship with pipeline + log review when a test isn't meaningful yet—don't let process block learning.

---

## Law 5: Be Like Water

Claude is a companion, not a state machine.  
Give her tools and understanding.  
Never give her scripts or decision trees.

A real tutor doesn't follow steps A→B→C.  
She reads the room and responds to what's there.

**VIOLATION:** Numbered steps in prompts  
**VIOLATION:** IF/THEN rules in prompts  
**VIOLATION:** "If child does X, you do Y" in prompts

Give Claude:

- Deep understanding of the child
- Deep understanding of her tools
- Clear knowledge of what she's teaching today
- Trust to figure out the rest

---

## Law 5a: Server Facts vs Model Speech (Worksheets)

The **server** provides structured facts (amounts, confidence, canonical answers from extraction) and gates tools. It must not assert **numeric or worksheet-specific correctness** in hardcoded strings the child hears from TTS when those numbers come from OCR that may be wrong.

**OK:** Short non-numeric `handleCompanionTurn` lines (celebrations, transitions, opening line, reading `p.question`).

**Not OK:** Server-built sentences that state dollar/cent amounts or “the bigger amount is …” from extracted cents without passing the worksheet-truth sanity layer — use `[System: …]` + `runCompanionResponse` so the model speaks, with facts injected from `worksheet-truth.ts`.

See `src/server/worksheet-truth.ts` and `npm run test:accuracy`.

---

## Law 6: One Branch Per Concern

- `feat/blackboard-spelling` → spelling UX changes
- `feat/pipeline-optimization` → latency and infrastructure
- `feat/psychologist-v2` → Psychologist improvements

Never mix infrastructure and feature work on one branch.  
Pipeline fixes are invisible to the child.  
Feature work changes what she experiences.  
They ship separately.

---

## Law 7: The Measurement Habit

Before merging any branch:

```bash
npm run test:tts
npm run test:pipeline
```

If contracts fail, fix before merge. No exceptions.

Latency targets (p95)—see `CONTRACTS` in `src/scripts/test-pipeline.ts`; numbers below are the current bar and may be updated when models or hardware change:

- T0→T2 (STT → first token): &lt; 1500ms
- T0→T4 (STT → first audio): &lt; 2000ms
- T5→T6 (canvas message → render): &lt; 50ms

---

## What Success Looks Like

Ila doesn't fight the system.  
Ila doesn't correct Elli.  
Ila comes back tomorrow.

That is the only metric that matters.  
Everything else is in service of that.

---

## Living document

When you change architecture laws, contract thresholds, or mandatory checks, update this file in the same PR.  
If `AGENTS.md` or onboarding docs reference process, keep them aligned with this file.

---

## Law 12: Games Are Configured Per Child By The Psychologist

Every game in Sunny has a configuration namespace on the child profile.  
Games read config. Algorithms write algorithm outputs. Psychologist writes game config.  
No game hardcodes behavior that should be profile-driven.

### The separation

- **Algorithms** → child profile root (shared across all games)
- **Psychologist** → child profile `games` namespace (per-game, per-child)
- **Games** → read from profile, never write back directly
- **Server** → passes profile config into game via props or `GAME_PARAMS`

### Game config schema (source of truth)

Each game config extends `GameConfig` base:

- `unlocked: boolean` — Psychologist flips when child is ready
- `sessionCount: number` — auto-incremented by server on `sendNodeComplete`
- `lastAccuracy: number | null` — written by server from `sendNodeComplete.accuracy`

#### word-radar

- `inputMode: "whole-word" | "letter-by-letter" | "keyboard"`
  - **whole-word** — child says the full word, STT matches against `acceptedResponses`
  - **letter-by-letter** — child says one letter at a time, per-position matching with aliases
  - **keyboard** — child types the word, auto-submits on length match
- `speakStyle: "option-a" | "option-b"`
  - **option-a** — silent mic + waveform, all-or-nothing tile reveal on match
  - **option-b** — confidence bar fills as STT hears partial match (`computeMatchRatio` in `useWordRadar`)
- `keyboardStyle: "option-b" | "option-c"`
  - **option-b** — locked-forward: correct letters lock green, wrong shakes tile
  - **option-c** — free-type: all tiles pending yellow, reveal on complete word
- `showTimer: boolean` — displays SVG ring + countdown, always records `responseTime_ms`
- `personalBestMetric: "speed" | "accuracy"`
  - **speed** — personal best = lowest `responseTime_ms` per word
  - **accuracy** — personal best = highest accuracy streak

#### spell-check

- `difficulty: 1 | 2 | 3` — controls hide ratio and decoy count
- `knownMode: "skip" | "quick"` — skip = omit known words, quick = fast pass
- `maxWords: number` — max words per session (SM-2 due list may be longer)

#### karaoke-reading

- `wordsPerLine: number` — chunk size for line display
- `fontSize: number` — px, Ila default 42, Reina default 40
- `skipWordEnabled: boolean` — shows SKIP button on current word

#### clock-game

- `unlocked: boolean`
- Step comes from `masteryGating.clockStep` (algorithm output, **not** game config)
- **VIOLATION:** never add `step` to clock-game config

#### coin-counter

- `unlocked: boolean`
- Step comes from `masteryGating.coinStep` (algorithm output, **not** game config)
- **VIOLATION:** never add `step` to coin-counter config

#### boss

- `sessionsRequired: number` — total sessions before Psychologist evaluates unlock
- `dataThresholdMet: boolean` — Psychologist sets true when data quality sufficient
- `generatedGamePath: string | null` — path written when Sonnet/Opus generates the game
- `generationModel: "sonnet" | "opus" | null`

### What the Psychologist can write

The Psychologist reads the full `measurementReport` which includes:

- Per-game `sessionCount` and `lastAccuracy`
- SM-2 due words and ease factors
- `masteryGating` outputs (`clockStep`, `coinStep`, `readingLevel`)
- `rawResults` from `sendNodeComplete` (per-item accuracy, `responseTime_ms`, `inputMode` used)

The Psychologist writes to `games` config to:

- Change `inputMode` when a child's STT accuracy is consistently low (e.g. whole-word accuracy below 0.5 for 3 sessions → switch to keyboard)
- Adjust `difficulty` when `lastAccuracy` is above 0.85 for 2 sessions
- Flip `unlocked: true` when prerequisite sessions are complete
- Set `personalBestMetric` based on whether speed or accuracy is improving faster

### Adding a new game — checklist

1. Add `GameConfig` subtype to `src/shared/childProfile.ts`
2. Add default config to `src/profile/gameConfigDefaults.ts`
3. Add to `verifyGameConfig` in `src/profile/verifyProfile.ts`
4. Add to `ARCHITECTURE.md` game config schema (this section)
5. Server passes `games["your-game"]` into `GAME_PARAMS` or React props
6. Game reads from props / `GAME_PARAMS` only — never reads profile directly
7. Tests: `buildProfile` returns correct defaults, `verifyGameConfig` passes

Runtime prompt text for the Psychologist is generated from defaults via `generateGameConfigDocs()` in `src/profile/generateGameConfigDocs.ts` (keeps prompts aligned with `DEFAULT_GAME_CONFIGS`).
