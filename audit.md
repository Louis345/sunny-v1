# Voice & worksheet UX — design audit workbook

Use this document to **think through** (solo or with a strong model like Opus) how Sunny’s **turn-taking**, **speech pipeline**, and **worksheet flow** should behave. Goal: fewer “the app isn’t listening” moments without breaking **grading integrity** or **echo safety**.

---

## 1. Purpose of this audit

- Map **user-visible invariants** (“what the child should always experience”).
- List **known failure modes** already seen in real sessions.
- For each major design fork, capture **pros / cons** before changing code.
- Produce a **short prioritized backlog** (minimal fixes first), not a full rewrite.

---

## 2. Scope (what to review)

| Area | Primary code / concepts |
|------|-------------------------|
| When user speech is accepted vs dropped | `session-manager.ts` → `handleEndOfTurn`, `shouldAcceptInterruptedTranscript` |
| Turn state machine | `session-state.ts` — `IDLE`, `LOADING`, `PROCESSING`, `CANVAS_PENDING`, `SPEAKING`, `WORD_BUILDER` |
| Client interrupt path | `web/src/hooks/useSession.ts` — RMS while `isPlayingRef`, WebSocket `barge_in` |
| Server interrupt | `session-manager.ts` → `bargeIn()`, `turnSM.onInterrupt()`, agent `AbortError` |
| TTS on vs off | `ws-tts-bridge.ts`, `TTS_ENABLED` — affects whether `isPlayingRef` / barge-in align with reality |
| Worksheet grading | `worksheet-tools.ts` → `submitAnswer`, `showProblemById`; `session-manager.ts` → `hostSessionLog`, `hostCanvasShow`, post-tool handlers |
| STT | Deepgram Flux (and how finals arrive relative to `PROCESSING`) |

Out of scope unless you explicitly expand: game HTML, PDF extraction quality, classifier routing.

---

## 3. Issues & concerns (observed or inferred)

### 3.1 Transcripts ignored while assistant “owns” the turn

- **Behavior:** In `PROCESSING`, `CANVAS_PENDING`, or `SPEAKING`, finals are often **discarded** (after a small junk filter), with a log like *Ignoring transcript while assistant owns turn*.
- **Concern:** During **long tool-heavy turns** (especially with **TTS disabled**), the child may speak **without** assistant playback; the **RMS-based `barge_in`** path may not fire the same way as when TTS is playing. Result: speech **never becomes** a user message → feels like the app isn’t listening.
- **Design tension:** Dropping finals reduces **echo** and **wrong-turn attachment**; keeping them reduces **perceived responsiveness**.

### 3.2 Barge-in vs “ignore transcript” are not the same policy

- **Barge-in:** Client sends `barge_in` → server aborts agent, stops TTS, `onInterrupt` → typically `IDLE`.
- **Ignore:** Deepgram sends a **final** while state is still `PROCESSING` → server drops it **without** requiring `barge_in`.
- **Concern:** Two mechanisms that **should** feel unified to the user (“I talked, so the assistant should stop or hear me”) can **diverge** depending on TTS and timing.

### 3.3 Worksheet: `sessionLog` / `activeProblemId` / host index

- **Behavior:** Grading is tied to **worksheet session** state (`activeProblemId`, `nextProblemIndex`). The host also tracks `worksheetProblemIndex` for tool side effects and canvas.
- **Partial mitigation (already shipped):** Implicit activation when `activeProblemId` is null but `problemId` matches `problems[nextProblemIndex]` and canvas is still worksheet-safe — reduces *no active problem* when the model calls `sessionLog` before the next `canvasShow`.
- **Remaining concern:** After **all problems are done**, `sessionLog` with any payload still fails with *no active problem* — model may **spam** the tool instead of using `sessionStatus`, `launchGame`, or plain chat.

### 3.4 Stale or wrong tool arguments

- **Behavior:** The model can call `sessionLog` with a **previous** `childSaid` (e.g. old cents value) on a **new** utterance.
- **Concern:** Server-side ordering fixes **do not** validate semantic match between transcript and `childSaid`; **trust** is still on the model.

### 3.5 Reward / game flow

- **Behavior:** Model may **launchGame** before the child’s choice is clear, or mis-map ASR (“space rock” vs “space frogger”).
- **Concern:** **UX** confusion more than registry bugs; overlaps with 3.1 if the child tries to correct during `PROCESSING`.

---

## 4. Decision forks — pros & cons (fill in during audit)

Use this section in a review session: for each row, add **your** pros/cons and a **recommended default** for Sunny at home (kiosk, child user).

### 4.1 User finals during `PROCESSING`

| Option | Pros | Cons |
|--------|------|------|
| **A. Keep current (drop non-junk finals)** | Simple; less echo/wrong-turn risk | “Not listening” during long agent turns; worse when TTS off |
| **B. Queue exactly one final; replay after `AGENT_COMPLETE` or interrupt** | Child feels heard; bounded complexity | Must define discard rules if queue fills; possible stale content |
| **C. Treat loud mic / VAD during `PROCESSING` as `barge_in` when TTS off** | Aligns interrupt with “I’m talking” | Risk false triggers (noise, sibling); needs tuning |
| **D. Shorten `PROCESSING` (e.g. streaming tools / fewer serial steps)** | Less time in bad window | Architectural cost; may not be feasible soon |

**Notes (audit):**


---

### 4.2 `SPEAKING` vs `PROCESSING` policy

| Option | Pros | Cons |
|--------|------|------|
| **Same rule for both** | Easier to explain | May be wrong if echo profile differs |
| **Stricter drop during `SPEAKING`, looser during `PROCESSING`** | Matches “playback = echo risk” | More branches; must test both TTS on/off |

**Notes:**


---

### 4.3 Post-worksheet `sessionLog`

| Option | Pros | Cons |
|--------|------|------|
| **A. Fail closed (current)** | No fake attempts after completion | Model keeps calling; noisy errors |
| **B. Return explicit `worksheet_complete` / `no_more_problems` and prompt hard** | Steers model without fake logs | Prompt + tool description maintenance |
| **C. No-op success with `skipped: true`** | Quiet logs | Hides model mistakes; bad for analytics |

**Notes:**


---

### 4.4 Single source of truth for “current problem”

| Option | Pros | Cons |
|--------|------|------|
| **Keep worksheet session as authority** | Grading stays coherent | Host must stay in sync or repair explicitly |
| **Derive only from host index** | One number | Must ensure session state matches for `submitAnswer` rules |

**Notes:**


---

## 5. User-visible invariants (draft — refine in audit)

Candidate invariants to **accept, reject, or rewrite**:

1. A **clear, intentional** child utterance after turn-taking is open should **always** reach the companion as a user message (or an explicit **interrupt**) — *currently may violate during `PROCESSING`*.
2. **Echo** from the speaker should not **usually** create a spurious user turn — *current drops help this*.
3. A **graded worksheet attempt** should **always** attach to **at most one** `problemId` and **match** session rules — *partially enforced in code*.
4. **Barge-in** should **stop** assistant speech **quickly** when TTS is on — *RMS path targets this*.
5. With **TTS off**, behavior should still **not** strand the child in a state where **their speech is ignored** without an equivalent to barge-in — *audit whether this holds today*.

---

## 6. Suggested outputs from the audit (checklist)

- [ ] **Top 3 UX risks** ranked (child-visible).
- [ ] **Top 3 correctness risks** ranked (grading / wrong problem).
- [ ] For each top item: **one minimal code or prompt change** (or “no change”).
- [ ] **Test ideas** (Vitest or manual script) that would **lock** the chosen behavior.
- [ ] Explicit **TTS on** vs **TTS off** matrix: expected behavior for child speech during `PROCESSING` and `SPEAKING`.

### 6.1 Measurement (technical logs vs psychologist)

- **Psychologist** (session prompt / curriculum path): qualitative and pedagogical judgment — *not* a substitute for server instrumentation.
- **Server logs** (`console` + optional files): technical proof of turn-taking, tool outcomes, and audit-tagged events. Use them to verify invariants in §3 and §5.
- **On disk (local only, gitignored):** `logs/sessions/YYYY-MM-DD/server.log` — same `🎮 [audit] …` lines as the terminal, appended for the calendar day. Set `SUNNY_LOG_TO_FILE=false` to disable file append. **Do not commit** these files; they may include child speech from adjacent `💬` lines if you later route more output through the same sink.
- **Grep examples (after audit logging shipped):**
  - `🎮 \[audit\].*component=transcript` — transcript disposition (`action=queued|accepted|dropped|replay|duplicate_suppressed`).
  - `component=transcript.*tts=off` — correlate with TTS-disabled runs.
  - `component=worksheet.*sessionLog_reject` — `sessionLog` with no active problem (`error=no_active_problem`); extend when P1 adds `worksheet_complete`.
  - `component=turn.*barge_in` — server barge-in with `stateBefore` / `turnState`.

---

## 7. Prompts for an external reviewer (e.g. Opus)

Paste sections 2–5 and ask:

1. “What **invariants** are contradictory? Resolve or deprioritize.”
2. “Given **TTS sometimes disabled**, what **single change** gives the best UX/correctness tradeoff?”
3. “List **regression risks** if we only implement that change.”

---

## 8. Related files (quick reference)

- `src/server/session-manager.ts` — `handleEndOfTurn`, `bargeIn`, `hostSessionLog`, `hostCanvasShow`
- `src/server/session-state.ts` — turn machine, `onInterrupt`, `onAgentComplete`
- `src/server/worksheet-tools.ts` — `createWorksheetSession`, `submitAnswer`
- `src/server/ws-handler.ts` — `barge_in` message
- `web/src/hooks/useSession.ts` — mic RMS, `barge_in`, playback / `isPlayingRef`
- `src/server/ws-tts-bridge.ts` — ElevenLabs streaming, stop on interrupt
- `src/tests/test-worksheet-session-submit.ts` — worksheet submit ordering contract
- `src/tests/test-canvas-barge-in-preserve.ts` — canvas persistence on interrupt
- `src/server/audit-log.ts` — `auditLog` / `formatAuditLine`, daily file under `logs/sessions/`
- `src/tests/test-pending-transcript.ts` — P0 pending transcript queue + consumption
- `src/tests/test-word-builder-feedback.ts` — Word Builder tool honesty + `canvasClear` ends WB
- `src/tests/test-audit-log.ts` — audit line format + env helpers

---

## 9. Executive summary (external review — consolidated)

*Distilled from a full pipeline read (Deepgram → `handleEndOfTurn` → `TurnStateMachine` → TTS → `useSession` barge-in). Use this section so you don’t need to re-run an expensive model pass for the same narrative.*

### What this audit concludes (one sentence)

The same **core bugs** we already suspected are **confirmed in code**: finals are **dropped in `PROCESSING`**, **TTS off** removes practical barge-in, and **post-worksheet `sessionLog`** returns a **weak signal**; **fixes are small and prioritized** (queue + replay first).

### Problems (agreed)

| # | Issue | Plain English |
|---|--------|----------------|
| **1** | Finals dropped in **`PROCESSING`** | Child talks while Claude runs → Deepgram final → server **discards** it (`session-manager.ts` ~1879–1888). |
| **2** | **TTS off** makes it worse | No playback → client **`isPlayingRef`** rarely true → **RMS `barge_in`** doesn’t run; **Flux `onStartOfTurn` barge-in** mostly targets **`SPEAKING`**, which is **brief** with TTS off → **dead zone**. |
| **3** | After worksheet done, **`sessionLog`** errors are vague | Model **retries** `sessionLog`; kid gets confusing follow-ups. |

**Also noted:** host **`worksheetProblemIndex`** vs worksheet session state; **stale `childSaid`** (exact duplicate guard only); **games + `PROCESSING`** (corrections dropped).

### Recommended fixes (priority)

| Priority | What | Type | Notes |
|----------|------|------|--------|
| **P0** | **Queue + replay** — On **`PROCESSING`**, call `turnSM.setPendingTranscript(transcript)` instead of drop; after **`onAgentComplete()`**, `consumePendingTranscript()` and replay via `handleEndOfTurn(pending, true)`. | **Code** | `setPendingTranscript` / `consumePendingTranscript` exist in `session-state.ts` (~209–224) but are **unused**. Split policy: **queue** `PROCESSING`; **keep drop** for **`SPEAKING`** / **`CANVAS_PENDING`** (echo / canvas timing). |
| **P1** | **`worksheet_complete`** — When no worksheet problem left, return e.g. `worksheet_complete: true` (not only generic `no_active_problem`). | **Code** + **tool description** | Optionally one sentence on **`sessionLog`** in `six-tools.ts`; tool result is the main signal. |
| **Defer / optional** | **TTS-off barge-in during `PROCESSING`** — e.g. Flux `onStartOfTurn` → `bargeIn()` when TTS disabled. | **Code** | **Either** defer until P0 is proven **or** ship with P0; needs **TTS-off flag** on server + tuning. |
| **P2 (later)** | Stop deriving **`problemId` only from `worksheetProblemIndex`** in `hostSessionLog` | **Code / API** | Needs **model-supplied `problemId`** or a **worksheet session getter** — not a free deletion. |

### Implementation status (repo; update as you ship)

| Item | Status | Notes |
|------|--------|--------|
| **P0** Queue + replay in `PROCESSING` | **Done** | `handleEndOfTurn` / `playbackDone`; tests: `src/tests/test-pending-transcript.ts` |
| **P1** `worksheet_complete` / clearer post-done signal | **Open** | `hostSessionLog` still returns `no_active_problem`; audit lines log `sessionLog_reject` for grep |
| **TTS-off barge-in during `PROCESSING`** | **Open** | Optional / deferred per §9 |
| **P2** Host `problemId` coupling | **Open** | Later |
| Spelling toolkit + `startWordBuilder` / `startSpellCheck` | **Done** | Spelling sessions expose correct tools |
| Word Builder honesty + `canvasClear` ends WB | **Done** | Tests: `src/tests/test-word-builder-feedback.ts` |
| **§6.1** technical audit lines + daily file | **Done** | `src/server/audit-log.ts`; `logs/sessions/` gitignored |

### Sections 4–6 — filled recommendations (for the workbook above)

- **4.1:** Recommend **B** (queue + replay). **C** (VAD barge-in when TTS off) **defer** or bundle with B per appetite.
- **4.2:** **Split** — stricter during **`SPEAKING`**, queue during **`PROCESSING`** (falls out of 4.1).
- **4.3:** Recommend **B** — explicit **`worksheet_complete`** (+ tool line), not prompt bloat alone.
- **4.4:** Keep **worksheet session** as authority; **P2** reduces host index coupling when API allows.

**Invariant summary:** (1) and (5) **violated** today → **P0**; (2)(4) **hold** with TTS on; (3) **improved** by shipped worksheet guards; (6) **P1**.

**Top UX risks:** speech black hole in **`PROCESSING`**; post-done **`sessionLog`** spam; stale praise (rarer).

**Top correctness risks:** semantic **stale `childSaid`** (no cheap server fix); ambiguous post-done errors; future **index drift** if two tool paths diverge.

**Test ideas:** unit round-trip **pending transcript**; **`hostSessionLog`** returns **`worksheet_complete`** when done; manual **TTS off** during long agent turn.

**TTS matrix (after P0):** **`PROCESSING`** → queue + replay (TTS on **and** off); **`SPEAKING`** → existing RMS / drop policy unchanged in intent.

---

*Drafted for Project Sunny. Revise dates and decisions as you run the audit.*
