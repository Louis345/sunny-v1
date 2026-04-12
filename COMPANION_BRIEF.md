# Companion workflow (human + Opus + Cursor)

1. **`feat/adventure-map` → `main`** — Merge when adventure-map work is committed and green (`npm run build`, `vitest run`). See `DECISIONS.md` **D-016** for branch policy.
2. **`feat/pipecat-pipeline`** — Stays in the repo as **archived reference**; **not** merged into `main`.
3. **Opus inputs (only these):**
   - This file: `COMPANION_BRIEF.md`
   - `DECISIONS.md`
   - The actual codebase (read files as needed)
   - **Do not** use `TASKS.md` as Opus context for companion design — general product tasks live there; companion work is tracked in `COMPANION_TASKS.md` after Opus writes it.
4. **Opus outputs:**
   - `COMPANION_DESIGN.md` — architecture, phases, integration points, branch-agnostic contracts
   - `COMPANION_TASKS.md` — atomic, self-contained tickets (follow the ticket shape you already use elsewhere: context, touch files, tests, done-when)
5. **Cursor** executes tickets from `COMPANION_TASKS.md` (tests first per `AGENTS.md`).

---

# Project Sunny — Companion System Design Brief

**For:** Claude Opus (planning / tickets only — no implementation in this step)  
**Date:** April 12, 2026

## Your job

1. Read this brief completely.
2. Read `DECISIONS.md` and reconcile any conflicts (cite decision IDs).
3. Read the codebase (`buildProfile`, WebSocket flow, `AdventureMap`, server routes, child registry).
4. Design the **full** companion system architecture (all phases).
5. Produce **atomic Cursor-ready tickets for Phase 0.5 only** in `COMPANION_TASKS.md`.
6. Flag conflicts with `ARCHITECTURE.md` / `AGENTS.md` laws if you read them for verification — **laws in `DECISIONS.md` and child-agnostic rules take precedence for this brief.**

**Do not** produce application code in the Opus pass — design + `COMPANION_DESIGN.md` + `COMPANION_TASKS.md` only.

## Context — what exists

- `buildProfile(childId)` is the assembly point; `children.config.json` is the registry; `GET /api/profile/:childId` is live.
- Two pipelines existed historically: Node + Deepgram vs Pipecat — **companion design must be branch-agnostic** where the UI mounts and which events fire must not assume a dead branch won.
- Claude is already Elli/Matilda in session; ElevenLabs voices the model. The **visual** companion reacts to session output and events — not a second LLM unless explicitly added later.

## Thermostat architecture (approved metaphor)

| Layer | Role |
|--------|------|
| **Plumbing** | WebSocket companion event pipeline; optional event-triggered vision (screenshots); VRM renderer (Three.js + `@pixiv/three-vrm`); bone positions for spatial hints; Web Audio → mouth blend shapes |
| **Device** | Swappable `.vrm` (or agreed format) per child via config/profile — drop-in replacement |
| **Dials** | Sensitivities, idle timing, random moments — live on **child profile** (single source of truth), not scattered constants |

## Locked decisions (do not reopen without new DECISIONS entry)

1. **Profile is source of truth** — `childProfile.companion` holds config (URLs, dials, toggles as specified in design). No parallel `companion.config.json`.
2. **Server emits dedicated companion events** — Filter semantic session/tool outcomes into a `companion_event` (or agreed) WebSocket message type; avoid spamming every low-level tool call — filter for **meaningful** moments.
3. **Vision is event-triggered, not a firehose** — Optional screenshot on meaningful events only; respect cost. Iframe/cross-origin limits may require text/state proxy for some games in v1.
4. **Two layers** — Map can stay Canvas 2D; companion is a separate WebGL/Three layer with transparent background; **z-index and shared coordinate data**, not one canvas context for both.
5. **CompanionLayer at app shell** — Persists across map ↔ game transitions (R2-D2 “in the ship”); not nested in a single game component.
6. **Toggle** — Child/parent can mute/hide companion; behavior when off (no capture, no reactions) must be explicit in design.
7. **VRM validation** — On load, fail loud if required expressions/bones are missing (list the contract in `COMPANION_DESIGN.md`).
8. **Phased delivery** — Phase 0.5: body + event wiring + minimal expressions + mouth sync hook + optional lookAt; later phases: spatial polish, walk-to-node if justified, accessories layered via agreed pipeline.

## Event shape (illustrative — Opus may refine names)

Companion-facing triggers should include things like: `session_start`, `correct_answer`, `wrong_answer`, `mastery_unlock`, `session_end`, `idle_too_long` — with optional `screenshot` / metadata where useful.

## Deliverables from Opus

### `COMPANION_DESIGN.md`

- Component tree (where `CompanionLayer` mounts vs `AdventureMap` / `SessionScreen`).
- Event pipeline: server → WebSocket → client → VRM.
- Vision flow: when captured, how attached to context for “what do you see?” style interactions (piggyback existing STT/session — no duplicate Claude streams unless explicitly justified).
- Animation loop: idle, expressions, audio-driven mouth.
- Phase roadmap 0.5 → 1 → 2 → 3 with **gates**.
- Explicit **conflicts** with `DECISIONS.md` (e.g. if an older decision said “no character on map” — resolve with pointer to **D-016** or propose a new decision record).

### `COMPANION_TASKS.md`

- Tickets **only for Phase 0.5**, atomic, self-contained (junior model can run one ticket without reading the whole repo).
- Each ticket: context, files to touch, tests, done-when, estimate, dependencies.
- Align with repo test commands (`vitest`, `npm run build`, web build if touched).

## Explicit non-goals for Phase 0.5

- Full dress-up economy, infinite generated accessories pipeline, or production mouth viseme solver.
- Merging `feat/pipecat-pipeline` — **out of scope** (archived).

---

*End of brief. Implementation follows `COMPANION_DESIGN.md` + `COMPANION_TASKS.md` after Opus.*
