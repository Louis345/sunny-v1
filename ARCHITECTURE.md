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

**CHILD PROFILES:** Defined once in `src/souls/`  
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
