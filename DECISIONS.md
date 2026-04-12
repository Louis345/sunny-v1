# DECISIONS.md — Architectural Decisions

Every decision made during the adventure map architecture design, why it was made, where the architect disagrees with the current direction, and what Jamal should push back on.

---

## D-001: Adventure map replaces voice-driven flow entirely

**Decision:** The Canvas API adventure map is the primary session experience. The current flow (ChildPicker -> WebSocket -> SessionManager -> Elli voice loop) becomes legacy behind a feature flag.

**Why:** The Khan Academy Kids model is proven for this age group (5-8). Visual navigation gives children agency — they choose what to do next instead of being led by voice. It removes STT as a dependency for the core learning loop (Deepgram latency and transcript accuracy are bottlenecks today). The adventure map also makes the multi-armed bandit and rating system natural — nodes on a map are inherently selectable and ratable.

**Risk:** The current voice-first experience is what the children know. The transition may feel jarring. Elli's conversational presence (jokes, encouragement, warmth) is the soul of Sunny — reducing her to event-driven TTS could make the experience feel mechanical.

**Mitigation:** Feature flag (`SUNNY_LEGACY_MODE`) preserves the old flow. Elli's event-driven lines must be carefully written to feel spontaneous, not robotic. The four trigger types (mastery, frustration, surprise, session end) are the moments that matter most emotionally.

---

## D-002: MapCoordinator is a new class, not a SessionManager subclass

**Decision:** `MapCoordinator` is a thin, purpose-built class (~200-300 lines estimated). It uses `GameBridge` directly for game iframe communication. It does NOT inherit from, wrap, or import SessionManager.

**Why:** SessionManager is 4,900+ lines. It imports Deepgram, the agent loop, voice classification, worksheet handling, turn state machines, and dozens of voice-specific concerns. Inheriting from it or wrapping it would create a dependency on all of that complexity. The adventure map needs approximately 5% of what SessionManager does (game launch, result capture, WebSocket messaging). It's cheaper to import the small pieces (GameBridge, buildProfile, word bank I/O, SM-2 functions) directly.

**Alternative considered:** "Short-lived SessionManager per node" — create a SessionManager instance for each node click, use it only for game execution, destroy it after. Rejected because SessionManager's constructor initializes Deepgram connections, voice state, transcript buffers, and agent context. Even if most of that is gated behind flags, the coupling is a maintenance trap.

**What this means for SessionManager:** SessionManager stays untouched in Phase 1. It serves the legacy voice flow behind the feature flag. Phase 3 (DELETIONS.md, not yet designed) will decide its fate — either extract a small NodeExecutor from it or delete it entirely.

---

## D-003: One bandit per child, arms = node types only

**Decision:** Each child gets one epsilon-greedy bandit (epsilon=0.2). The arms are node type strings: the keys from the game registry (word-builder, spell-check, clock-game, coin-counter, store-game, vault-cracker, bd-reversal-game, asteroid, space-invaders, space-frogger) plus "riddle" and "karaoke". Theme selection is random from the unlocked set — no bandit for themes.

**Why:** With 12 arms and epsilon=0.2, the bandit will converge in ~20-30 sessions (3-4 weeks of daily use). That's a reasonable timeline for learning a child's preferences. A second bandit for themes would have 6 arms and see 1 pull per session — it would never converge meaningfully. Random theme selection serves the design goal better ("never the same world twice") because variety is the point, not optimization.

**Risk:** Cold start. The first 3-4 sessions will be essentially random (epsilon explores, and even the greedy arm has no data). The default experience must be good enough that random ordering still feels intentional.

**Mitigation:** Riddle nodes are hardcoded to the first 1-2 positions (warm-up slot) regardless of bandit. This gives every session a consistent, low-stakes opening. The bandit only orders the middle slots.

---

## D-004: Server generates theme, client renders

**Decision:** DesignerAgent runs server-side. It produces a `SessionTheme` JSON object (palette, ambient, optional Grok image URLs). The client receives this JSON via WebSocket and does all Canvas API rendering.

**Why:** Grok API keys must stay server-side. Canvas API runs in the browser. Clean separation: server owns data and image generation, client owns pixels. This also means the Canvas rendering code can be developed and tested independently of the server (just pass it a mock SessionTheme).

**Why not server-side rendering:** Canvas API is a browser API. Server-side would mean generating static images or SVGs on the server, which loses all animation capability (pulse, glow, path drawing, portal transitions).

---

## D-005: Canvas API fallback, Grok images optional

**Decision:** The adventure map must look good with Canvas API only (no Grok images). Grok background and castle images are enhancements that fade in when available. If `GROK_API_KEY` is not set, the experience is fully functional and visually pleasant.

**Why:** Grok image generation takes 3-8 seconds. A child opening Sunny should see their world immediately, not a loading spinner. Canvas API renders in one frame (<16ms). The Grok images add richness but the Canvas API scene (sky gradient, green hills, cloud shapes, node cards) must stand on its own.

**Risk:** If the Canvas-only fallback looks amateurish compared to the Grok-enhanced version, it undermines the "magic visible" principle. The fallback IS the default for most development and testing.

**Jamal should push back if:** The default Canvas theme (`src/themes/default.html`) doesn't make a child smile on first sight. If it needs Grok images to look acceptable, the architecture is wrong and the default theme needs more design investment.

---

## D-006: ndjson for node ratings

**Decision:** One ndjson file per child per date at `src/context/{childId}/ratings/{date}.ndjson`. Each line is a JSON-serialized NodeRating.

**Why:** Matches the existing pattern (`src/utils/attempts.ts` uses append-only ndjson for attempt logging). Append-only means no read-modify-write — safe for concurrent processes. Human-readable — Jamal can `cat` a file and see exactly what happened in a session. Date partitioning keeps files small and makes cleanup easy.

**Alternative considered:** SQLite. Rejected because: adds a dependency (against constraints), requires migration management, and the data volume is tiny (5-6 ratings per session, one session per day per child).

---

## D-007: Variable node count from attentionWindow

**Decision:** Node count = `clamp(floor(attentionWindow_minutes), 3, 6)`. A child with a 2.5-minute attention window gets 3 nodes (including castle). A child with a 5.5-minute window gets 5 nodes.

**Why:** Prevents session abandonment. If a child consistently abandons after 3 minutes, giving them 6 nodes guarantees frustration. The system should meet the child where they are and grow with them. The floor function with clamping ensures: minimum 3 (warm-up + one learning node + castle), maximum 6 (prevents sessions from dragging).

**Risk:** A child with low attention gets only 1 learning node per session (warm-up riddle + 1 node + castle). That's very little practice. But engagement matters more than volume — one good interaction beats five abandoned ones.

**Phase 2 refinement:** TASK-022 replaces the mood-history-based attentionWindow with actual NodeRating data, making the calibration more accurate over time.

---

## D-008: Elli is event-driven, not conversational

**Decision:** During adventure map sessions, Elli speaks only on four trigger types: word mastery, frustration (2+ consecutive abandonments), surprise reward (10% chance after high accuracy), and session end. Maximum 10 TTS calls per session. No STT — the child does not talk to Elli during the map experience.

**Why:** The adventure map is a visual, self-directed experience. Elli's value in this context is emotional punctuation, not conversation. A well-timed "That word is YOURS now!" after a mastery event hits harder than continuous chatter. The 10-call cap prevents the system from over-talking — children tune out repetitive encouragement.

**Disagreement:** This is where I'd push back hardest on the overall direction. Elli's warmth IS Sunny. The voice-first experience creates a relationship between child and companion that a click-on-nodes map cannot replicate. The event-driven model risks making Elli feel like a notification system rather than a friend. If after Phase 1 the children engage less with Elli-on-map than with Elli-in-conversation, this decision should be revisited.

**Amendment — April 12 2026:** VRM companion is now physically
visible on screen. If child addresses Elli directly, STT picks
it up and Claude responds — one exchange, then back to flow.
Elli still never initiates during active node play.
Child leads. Elli responds. Law 6.

---

## D-009: Feature flag for legacy flow, no deletion in Phase 1

**Decision:** `SUNNY_LEGACY_MODE=true` environment variable routes to the old SessionScreen + useSession + SessionManager flow. Default (no env var) is adventure map. Both code paths coexist in ws-handler.ts. No old code is deleted in Phase 1.

**Why:** Rollback safety. If the adventure map has a critical bug during testing, Jamal can flip one env var and the children's daily sessions continue uninterrupted. Deleting the old flow requires a dedicated design (DELETIONS.md) that identifies every file, function, and side effect being removed.

**Cost:** Code duplication. ws-handler.ts will have two routing paths. Both Canvas.tsx and AdventureMap.tsx will exist. But this cost is temporary and bounded — Phase 3 resolves it.

---

---

## D-011: Branch comparison as a gate, not just a task

**Decision:** TASK-000 (fix pipecat bug) and TASK-001 (comparison framework) are a hard gate. No Phase 1b infrastructure work starts until the comparison is complete and a winner is merged to main. `feat/adventure-map` branches off the merged main.

**Why:** The adventure map must build on a stable voice foundation. If the pipecat branch is the winner, the Python pipeline becomes part of the stack and MapCoordinator needs to account for it. If Express wins, the Python pipeline is archived. Building adventure map infrastructure before this decision means risking a rebase across 20+ files if the foundation changes.

**Cost:** Blocks all parallel work for 1-3 days (TASK-000 is 1hr implementation + Jamal testing, TASK-001 is 2hr implementation + Jamal running 3+ sessions per branch). This is intentional — the right foundation is worth the wait.

---

## D-012: GameBridge reuse without SessionManager

**Decision:** MapCoordinator imports `GameBridge` directly from `src/server/game-bridge.ts` for game iframe communication. It does NOT import or instantiate SessionManager.

**Why:** GameBridge is a clean 69-line class with zero dependencies on voice, STT, agent loops, or session state. It does exactly what MapCoordinator needs: post a start message to an iframe, handle game_complete events, and forward game messages. Importing it directly means MapCoordinator inherits none of SessionManager's 80+ imports.

**What MapCoordinator imports (complete list):**

- `GameBridge` from game-bridge.ts (game iframe communication)
- `buildProfile` from profiles/buildProfile.ts (profile assembly)
- `generateTheme` from agents/designer/designer.ts (theme generation)
- `selectNodes` from engine/nodeSelection.ts (node selection)
- `selectArm`, `reward`, `computeBanditReward` from engine/bandit.ts (bandit)
- `writeRating`, `readRatings` from utils/nodeRatingIO.ts (rating storage)
- `computeSM2`, `computeQualityFromAttempt` from algorithms/spacedRepetition.ts (SM-2)
- `readWordBank`, `writeWordBank` from utils/wordBankIO.ts (word bank I/O)
- `computeProgression` from engine/progression.ts (XP/level)
- Types from shared/adventureTypes.ts

That's 10 imports from 10 small, focused modules. Compare to SessionManager's 80+ imports.

---

## D-013: Theme files are HTML with Canvas API instructions

**Decision:** Each theme in `src/themes/` is an HTML file containing Canvas API drawing code. A metadata comment header (`<!-- theme: name="Beach" unlockLevel=5 -->`) provides discovery metadata. The theme registry scans the directory and serves these files to the client.

**Why not JSON theme descriptors?** JSON would describe palette/colors/layout but couldn't express drawing logic (how to render clouds, wave patterns, star fields). Canvas API code IS the drawing logic. HTML files are self-contained — drop one in, it works.

**Why not a theme DSL?** Over-engineering. HTML + Canvas API is a universal skill. The Creative Studio (Phase 2) generates these files via Claude Sonnet, which can write Canvas API code fluently. A DSL would require a compiler, documentation, and debugging tools.

**Risk:** HTML files could contain arbitrary JavaScript. The theme registry should validate that theme files only contain Canvas API calls, not DOM manipulation, network requests, or other side effects. A simple allowlist of Canvas API methods in a validation step would mitigate this.

**Jamal should push back if:** Theme HTML files become hard to understand or debug. If a simpler format (JSON palette + a fixed set of drawing algorithms for clouds/hills/water) would cover 90% of cases, the HTML approach is over-flexible.

---

## D-014: Riddle nodes always in warm-up position

**Decision:** The node selection engine places riddle nodes in the first 1-2 positions regardless of bandit ordering. The bandit only orders the learning and dopamine nodes in the middle slots.

**Why:** "Law 7" from the prompt spec — warm up, bond before learning. Riddles are low-stakes, fun, and create a moment of connection. Starting with a spelling challenge risks frustration before the child is settled. This is also consistent with the existing bondProtocol.ts pattern (every session starts with a bond activity).

**Trade-off:** The bandit can never learn that a child hates riddles and prefers to jump straight into word-builder. The warm-up slot is fixed. This is intentional — some things are pedagogy, not preference.

---

## D-015: Post-node pipeline is synchronous in MapCoordinator

**Decision:** After rating is received, the post-node pipeline runs sequentially in MapCoordinator: ndjson write -> bandit reward -> SM-2 update per word -> XP update -> WebSocket map_update. All steps complete before the next node unlocks on the client.

**Why:** Data consistency. The SM-2 update must complete before the next node's word selection (which reads from the word bank). The bandit reward must complete before the next session's arm selection. Sequential execution in a single async function is simple, debuggable, and correct.

**Performance:** The pipeline is fast. ndjson append: <5ms. Bandit update: <1ms. SM-2 per word (typically 1-5 words): <10ms total. XP computation: <5ms. WebSocket send: <1ms. Total: <25ms. The child won't notice the delay between rating and next-node-unlock.

---

## D-016: `main` follows adventure map; Pipecat branch archived

**Decision:** `feat/adventure-map` is merged into `main` when that work is committed and CI-green. **`feat/pipecat-pipeline` is not merged into `main`.** It may remain as a local/remote branch for reference (“archived path”) but is not the active integration line.

**Why:** One canonical web + Node server line reduces split-brain product and companion integration work. Companion design (`COMPANION_BRIEF.md` → `COMPANION_DESIGN.md` / `COMPANION_TASKS.md`) targets the codebase on `main` after the merge.

**Note:** Older decision text elsewhere that assumed “branch comparison before Phase 1b” may be superseded by this gate once merge is done — update cross-references when touching those docs.

---

## Disagreements with the Current Design

### 1. SessionManager should have been split long ago

SessionManager at 4,900 lines is the single biggest risk in the codebase. It handles: voice I/O, agent tool execution, game bridges, worksheet rendering, canvas state, transcript management, session planning, reward evaluation, clock tracking, spelling homework gating, and more. Any change to any of these concerns risks breaking the others. MapCoordinator is the right approach — small, focused modules that compose. The legacy SessionManager should be the top Phase 3 priority.

### 2. ws-handler.ts hardcodes child names

`ws-handler.ts` validates `start_session` with `Ila | Reina | (creator + diagKiosk)`. This violates the child-agnostic principle from the profile architecture branch. The adventure map path (`start_adventure`) will use childId from the registry, but the legacy path still has the hardcoded names. This should be fixed as part of the profile architecture merge, before `feat/adventure-map` branches off.

### 3. Canvas.tsx at 2,770 lines is the same pattern as SessionManager

Canvas.tsx handles: teaching content, worksheet PDFs, karaoke reading, clock rendering, score meters, rewards, championships, game iframes, spelling content, place value content, riddles, story images, and blackboard overlays. AdventureMap.tsx must not become Canvas.tsx 2.0. Enforce strict component extraction: GamePortal.tsx for iframe management, RatingOverlay for the like/dislike prompt, MapCanvas for the Canvas API drawing. Keep AdventureMap.tsx as an orchestrator under 400 lines.

### 4. attempts.ts still uses hardcoded child names

`loadAttemptHistory` takes `"Ila" | "Reina"` as a type. `appendWorksheetAttemptLine` maps childName to filename with an if/else chain. Both should use childId from the registry. This is pre-existing tech debt but it will bite the adventure map if nodeRatingIO.ts follows the same pattern. TASK-006 uses childId consistently — but the old code remains.

---

## Risks

### R-001: Grok API cost and latency

Grok generates 2 images per session (background + castle). At xAI pricing, this could be $0.10-0.50 per session. With 2 children doing daily sessions, that's $6-30/month. Acceptable for now, but if the theme registry grows and sessions regenerate themes aggressively, costs scale.

**Monitor:** Log Grok API call count and latency per session. Alert if >4 calls per session or >10s latency.

### R-002: egreedy cold start

With 12 arms and epsilon=0.2, the first ~20 sessions (3 weeks) will feel semi-random. If a child dislikes the randomness, they may disengage before the bandit converges.

**Mitigation:** Seed the bandit with sane priors. Dopamine games (asteroid, frogger, space-invaders) start with a small positive bias. Riddle starts with positive bias (always in warm-up). Spelling/reading nodes start neutral.

### R-003: Adventure map may reduce learning density

The current voice session is dense — Elli drives a child through 5-10 words in a focused 15-minute session. The adventure map session may have 3-6 nodes with only 1-3 words per node, plus portal animations, rating prompts, and map transitions. Net words practiced per session could drop.

**Monitor:** Track words attempted per session in the metrics block. Compare to voice-session word counts. If adventure map drops below 60% of voice-session word density, the node length calibration needs adjustment.

### R-004: Two canvas components is maintenance burden

Canvas.tsx (2,770 lines) and AdventureMap.tsx will coexist indefinitely (Canvas.tsx serves the legacy flow). Shared patterns (iframe game embedding, animation utilities, Canvas API helpers) should be extracted to shared utilities, not duplicated.

**Action:** During TASK-011 and TASK-013, extract shared Canvas utilities into `web/src/utils/canvasHelpers.ts`. Do not copy-paste from Canvas.tsx.

### R-005: Theme HTML files are an attack surface

If a theme file contains malicious JavaScript (e.g., from a compromised Creative Studio session), it executes in the child's browser context. The theme registry needs validation.

**Mitigation:** Theme files run in the same origin as the app (not sandboxed). In Phase 1, this is acceptable because only Jamal creates themes (via Creative Studio in Phase 2, or by hand). Before any user-facing theme sharing, add a Canvas API allowlist validator to the theme registry.

---

## What Jamal Should Push Back On

1. **If the default Canvas theme doesn't delight a child without Grok images** — the architecture assumes Canvas-only looks good. If it doesn't, invest more in the default theme before proceeding. The fallback IS the experience for development, testing, and any moment when Grok is slow.

2. **If MapCoordinator grows past 500 lines in Phase 1** — it should be thin. If it's accumulating logic, something is in the wrong layer. Push the logic down into engine/ modules.

3. **If the children miss conversational Elli** — the event-driven TTS model is a bet. If the children ask "why doesn't Elli talk to me anymore?" or engagement drops after switching from voice to map, revisit D-008. A hybrid model (map navigation + voice commentary) might be the right answer.

4. **If the bandit ordering feels random after 2 weeks** — 20 sessions should show convergence. If it doesn't, either epsilon is too high (try 0.1) or the reward formula needs reweighting (currently: rating 50%, completion 30%, accuracy 20%).

5. **If Phase 1 takes more than 3 weeks of Composer sessions** — there are 19 Phase 1 tasks at ~25.5 hours estimated. At 2 hours per Composer session, that's ~13 sessions. If it's dragging, the tasks may be too granular — consider combining infrastructure tasks (TASK-002 through TASK-006 could be one session for a skilled Composer).
