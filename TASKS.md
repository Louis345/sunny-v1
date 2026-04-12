# Project Sunny — Adventure Map Build Plan

# Generated: April 10, 2026

#

# INSTRUCTIONS FOR COMPOSER:

# Execute one phase at a time. Stop after each phase and report:

# - Test count before and after

# - Files touched

# - Lines added vs removed

# - Any risks or blockers found

# Do not proceed to the next phase without approval.

#

# BRANCH SETUP (run before any task):

# git checkout main

# git checkout -b feat/adventure-map

#

# NON-NEGOTIABLE RULES:

# - No hardcoded child names in any new file

# - Tests first — red commit before green commit

# - Net code trends down where possible

# - Every game and canvas reads from /api/profile/:childId

# - Nothing outside the Touch list gets modified

---

# PHASE 1a — GATE (runs on feat/pipecat-pipeline, then main)

# Nothing in Phase 1b starts until Phase 1a is complete and a branch winner is merged.

---

TASK-000: Fix pipecat reading complete audio gap
Phase: 1a
Branch: feat/pipecat-pipeline
Depends on: none
Context: After reading_progress event=complete fires, there is a 1-2 second silence
before Charlotte speaks. canvasPending is not cleared before the LLM response fires.
Charlotte waits for canvasPending to clear but it hangs. This is the last bug
blocking the pipecat branch from merging to main.
Read first:

- src/server/session-manager.ts (find receiveReadingProgress method)
- src/server/pipeline-proxy.ts (find reading_progress event flow)
  Touch:
- src/server/session-manager.ts
- src/tests/test-reading-complete-gap.ts (new)
- vitest.config.ts (add new test)
  Tests:
- receiveReadingProgress with event=complete — assert canvasPending is null BEFORE LLM fires
- Assert karaokeReadingComplete is true after complete event
- Assert no double-firing — complete event handled exactly once
  Done when:
- npm run test:system green
- Manual diag session: read a full story, no silence gap after story ends,
  Charlotte speaks within 500ms of story completion
  Delete: nothing
  Est: 30min

---

TASK-001: Branch comparison framework
Phase: 1a
Branch: main (runs after TASK-000 is merged)
Depends on: TASK-000
Context: Two branches exist — feat/pipecat-pipeline (Python STT, Nova-3, semantic
turn detection) and the legacy main branch (Node Deepgram Flux, TurnStateMachine).
The decision of which to keep must be data-driven. This task builds the measurement
instrument. Jamal runs the sessions and makes the decision — not this task.
Read first:

- src/server/session-manager.ts (find audit log patterns)
- src/scripts/ (see what scripts exist)
- src/context/ila/session_notes/ (understand session note format)
  Touch:
- src/scripts/compare-branches.ts (new)
- src/scripts/run-comparison.md (new — the test script Jamal runs)
- src/tests/test-compare-branches.ts (new)
- vitest.config.ts (add new test)
  Tests:
- compareSession(logContent) extracts stale_replay_count correctly from fixture log
- compareSession extracts turn_latency_p50_ms correctly
- compareSession extracts karaoke_completion_pct correctly
- compareSession extracts barge_in_latency_ms correctly
- compareSession returns 0 for missing metrics (graceful)
- compositeScore(metrics) returns number between 0-100
- compositeScore weights: completion 30%, hesitation accuracy 20%,
  latency 20%, suppression 15%, complete-once 15%
  Script output format:
  Branch A: pipecat Sessions: 3 Score: 87.3 ± 4.2
  Branch B: legacy Sessions: 3 Score: 71.8 ± 6.1
  Winner: pipecat (p=0.03, Cohen d=1.4 — large effect)
  run-comparison.md must contain:
- Exact 5-utterance script to speak in both branches
- How to capture logs from each branch
- How to run compare-branches.ts
- Minimum 3 sessions per branch
  Done when:
- npm run test:system green
- npx tsx src/scripts/compare-branches.ts --help runs without error
- Jamal can run 3 sessions on each branch and get a comparison table
  Delete: nothing
  Est: 1hr

---

TASK-002: Merge winner to main, create feat/adventure-map
Phase: 1a (gate close)
Branch: main, then feat/adventure-map
Depends on: TASK-001 + Jamal's branch decision
Context: After Jamal runs the comparison and picks a winner, this task merges
both feature branches to main and creates the clean adventure map branch.
This is a git operations task — no code changes.
Read first: nothing
Touch: git operations only
Steps:

1. git checkout main
2. git merge feat/child-profile-architecture (squashed commit fef0085)
3. git merge [winning branch] (pipecat or legacy)
4. npm run build — must pass
5. npm run test:system — must pass (238+ tests)
6. git checkout -b feat/adventure-map
   Done when:

- main has both profile work and winning pipeline
- feat/adventure-map exists off clean main
- npm run build passes on feat/adventure-map
- npm run test:system passes on feat/adventure-map
  Delete: losing branch (after Jamal confirms)
  Est: 30min

---

# PHASE 1b — INFRASTRUCTURE (feat/adventure-map)

# All Phase 1b tasks are parallelizable — no dependencies between them.

# All depend on TASK-002.

---

TASK-003: Core adventure types
Phase: 1b
Branch: feat/adventure-map
Depends on: TASK-002
Context: Define the TypeScript interfaces that the entire adventure map system
uses. No implementation — interfaces only. Everything downstream imports from here.
Read first:

- src/shared/childProfile.ts (understand existing profile shape)
- src/server/games/registryDiscover.ts (understand game type names)
  Touch:
- src/shared/adventureTypes.ts (new)
- src/tests/test-adventure-types.ts (new)
- vitest.config.ts (add new test)
  Interfaces to define:
  NodeType: "word-builder" | "bubble-pop" | "karaoke" | "clock-game" |
  "coin-counter" | "spell-check" | "riddle" | "space-invaders" |
  "asteroid" | "space-frogger" | "boss"
  NodeConfig: { id, type: NodeType, words: string[], difficulty: 1|2|3,
  timeLimit_ms, theme, thumbnailUrl?: string, isCastle: boolean }
  NodeRating: { childId, sessionDate, nodeType, word, theme, rating,
  completionTime_ms, accuracy, abandonedEarly }
  NodeResult: { nodeId, completed, accuracy, timeSpent_ms, wordsAttempted }
  SessionTheme: { name, palette: {sky, ground, accent, particle, glow},
  ambient: {type, count, speed, color},
  nodeStyle, pathStyle, castleVariant,
  backgroundUrl?, castleUrl?, nodeThumbnails?: Record<string,string> }
  MapState: { childId, sessionDate, nodes: NodeConfig[], currentNodeIndex,
  completedNodes: string[], theme: SessionTheme, xp, level }
  Tests:
- NodeRating shape validates correctly (zod or manual)
- NodeConfig with isCastle=true is valid
- SessionTheme with no URLs (Canvas-only fallback) is valid
  Done when:
- npm run build passes with new types
- No any types in adventureTypes.ts
  Delete: nothing
  Est: 30min

---

TASK-004: Extend ChildProfile with adventure fields
Phase: 1b
Branch: feat/adventure-map
Depends on: TASK-002
Context: ChildProfile is missing unlockedThemes and attentionWindow. These are
needed by the node selection engine and theme registry. buildProfile must
compute them from existing data.
Read first:

- src/shared/childProfile.ts
- src/profiles/buildProfile.ts
- src/profiles/profileCompute.ts
- src/context/ila/learning_profile.json
  Touch:
- src/shared/childProfile.ts (add fields)
- src/profiles/buildProfile.ts (populate new fields)
- src/profiles/profileCompute.ts (add computeAttentionWindow, computeUnlockedThemes)
- src/tests/test-child-profile.ts (add cases)
  New fields on ChildProfile:
  unlockedThemes: string[] - default: ["default"] - "beach" unlocks at level 5 - "space" unlocks at level 10 - computed from profile.level
  attentionWindow_ms: number - default: 300000 (5 minutes) - computed from median completionTime_ms of non-abandoned NodeRatings - if no ratings exist yet: use default - src/context/{childId}/ratings/ is the source
  New pure functions in profileCompute.ts:
  computeUnlockedThemes(level: number): string[]
  computeAttentionWindow(ratings: NodeRating[]): number
  Tests:
- computeUnlockedThemes(1) returns ["default"]
- computeUnlockedThemes(5) returns ["default", "beach"]
- computeUnlockedThemes(10) returns ["default", "beach", "space"]
- computeAttentionWindow([]) returns 300000
- computeAttentionWindow([{completionTime_ms: 180000, abandonedEarly: false}]) returns 180000
- buildProfile("ila").unlockedThemes is an array
- buildProfile("ila").attentionWindow_ms is a positive number
  Done when:
- npm run test:system green
- curl /api/profile/ila returns unlockedThemes and attentionWindow_ms
  Delete: nothing
  Est: 1hr

---

TASK-005: Bandit engine
Phase: 1b
Branch: feat/adventure-map
Depends on: TASK-002
Context: The multi-armed bandit drives node type ordering. One bandit per child.
Arms = node types. Reward = composite of like/dislike + completion + accuracy.
State persists in learning_profile.json per child. Uses egreedy npm package.
Read first:

- src/context/ila/learning_profile.json
- src/utils/learningProfileIO.ts
- src/shared/adventureTypes.ts (after TASK-003)
  Touch:
- src/engine/bandit.ts (new)
- src/tests/test-bandit.ts (new)
- vitest.config.ts (add new test)
- package.json (add egreedy dependency)
  Bandit interface:
  selectNodeType(childId, availableTypes): Promise<NodeType>
  recordReward(childId, nodeType, rating, completed, accuracy): Promise<void>
  getBanditState(childId): BanditState
  resetBandit(childId): Promise<void>
  Reward formula:
  reward = (rating === "like" ? 0.5 : 0) + (completed ? 0.3 : 0) + (accuracy \* 0.2)
  range: 0.0 to 1.0
  State storage:
  In learning_profile.json under "banditState": { arms, counts, values }
  One entry per NodeType arm
  Cold start: epsilon=0.3 for first 10 sessions, then 0.1
  Tests:
- selectNodeType returns a valid NodeType from availableTypes
- recordReward with like=true, completed=true, accuracy=1.0 increases arm value
- recordReward with like=false, completed=false, accuracy=0 decreases arm value
- getBanditState returns persisted state
- resetBandit clears state
- bandit is deterministic given same random seed (for testing)
  Done when:
- npm run test:system green
- selectNodeType("ila", allNodeTypes) returns a NodeType without error
- State persists across two calls (write then read)
  Delete: nothing
  Est: 1hr

---

TASK-006: Theme registry
Phase: 1b
Branch: feat/adventure-map
Depends on: TASK-002
Context: Themes are HTML files in src/themes/. Auto-discovered like games.
Two sources: DesignerAgent (automatic) and Creative Studio (human-directed).
Both compete equally. Themes unlock per child based on level.
Read first:

- src/server/games/registryDiscover.ts (understand auto-discovery pattern)
- src/shared/childProfile.ts (understand unlockedThemes field)
  Touch:
- src/server/theme-registry.ts (new)
- src/themes/ (create directory with default.html placeholder)
- src/themes/default.html (new — static Canvas API world, no Grok)
- src/tests/test-theme-registry.ts (new)
- vitest.config.ts (add new test)
  default.html requirements:
- Pure Canvas API — bright daytime world
- Blue sky gradient, white clouds, green rolling hills
- No Grok images required — works with zero API keys
- Reads childId from URL param, fetches /api/profile/:childId
- Renders world in profile.ui.accentColor palette
- Exports: window.THEME_NAME = "default"
  Theme registry interface:
  getAvailableThemes(): string[]
  getThemePath(name: string): string
  isThemeUnlocked(name: string, profile: ChildProfile): boolean
  getRandomUnlockedTheme(profile: ChildProfile): string
  Tests:
- getAvailableThemes() returns ["default"] when only default.html exists
- isThemeUnlocked("default", anyProfile) returns true
- isThemeUnlocked("beach", profileLevel4) returns false
- isThemeUnlocked("beach", profileLevel5) returns true
- getRandomUnlockedTheme returns a theme from unlockedThemes
  Done when:
- npm run test:system green
- src/themes/default.html opens in browser and renders a Canvas world
- getAvailableThemes() returns the correct list
  Delete: nothing
  Est: 1hr

---

TASK-007: NodeRating storage
Phase: 1b
Branch: feat/adventure-map
Depends on: TASK-002
Context: After each node the child rates like/dislike. Ratings are written to
ndjson files matching the existing attempts pattern. These feed the bandit.
Read first:

- src/utils/attempts.ts (understand ndjson append pattern)
- src/shared/adventureTypes.ts (NodeRating interface)
  Touch:
- src/utils/nodeRatingIO.ts (new)
- src/tests/test-node-rating-io.ts (new)
- vitest.config.ts (add new test)
  File location: src/context/{childId}/ratings/{date}.ndjson
  Functions:
  appendNodeRating(rating: NodeRating): Promise<void>
  getNodeRatings(childId: string, limit?: number): Promise<NodeRating[]>
  getNodeRatingsByType(childId, nodeType): Promise<NodeRating[]>
  Tests:
- appendNodeRating writes to correct path for each childId
- appendNodeRating is append-only — second call adds a second line
- getNodeRatings returns ratings in chronological order
- getNodeRatings respects limit parameter
- getNodeRatingsByType filters correctly
- Functions work for any childId in registry (not just ila/reina)
  Done when:
- npm run test:system green
- appendNodeRating("ila", rating) creates file at correct path
- getNodeRatings("ila") returns the appended rating
  Delete: nothing
  Est: 30min

---

# PHASE 1c — SERVER-SIDE MAP

# Depends on all Phase 1b tasks complete.

---

TASK-008: DesignerAgent
Phase: 1c
Branch: feat/adventure-map
Depends on: TASK-003, TASK-006
Context: The DesignerAgent generates a SessionTheme at session start. It calls
Grok for world background and castle art. Canvas API fallback renders instantly
if Grok is unavailable. Theme selection is random from unlocked themes.
Read first:

- src/utils/generateStoryImage.ts (existing Grok API integration)
- src/shared/adventureTypes.ts (SessionTheme interface)
- src/server/theme-registry.ts (getRandomUnlockedTheme)
- src/profiles/buildProfile.ts (understand profile.interests)
  Touch:
- src/agents/designer/designer.ts (new)
- src/tests/test-designer-agent.ts (new)
- vitest.config.ts (add new test)
  DesignerAgent interface:
  generateTheme(profile: ChildProfile): Promise<SessionTheme>
  Grok prompt pattern (from profile.interests):
  "A {theme} world background for a children's learning adventure.
  Theme: {themeName}. Colors matching: {profile.ui.accentColor}.
  Style: flat illustration, bright, child-friendly, wide landscape.
  No text. No characters."
  Fallback behavior:
- If Grok unavailable: return theme with no backgroundUrl/castleUrl
- Canvas API default.html renders immediately from palette only
- Never block session start waiting for Grok
  Theme selection:
- Random from profile.unlockedThemes
- Time of day influences: before 7am=sunrise, 7-18=day, 18-20=sunset, after 20=night
- profile.todayMode can override theme (npm run sunny:mode:reading → reading-specific theme)
  Tests:
- generateTheme returns valid SessionTheme shape
- generateTheme works when Grok API key is missing (fallback)
- generateTheme selects from profile.unlockedThemes only
- generateTheme respects time of day (mock Date)
- Generated palette contains sky, ground, accent, particle, glow
  Done when:
- npm run test:system green
- generateTheme(ilaProfile) returns a SessionTheme in under 10 seconds
- generateTheme works with no Grok key (fallback theme returned)
  Delete: nothing
  Est: 1hr

---

TASK-009: Node selection engine
Phase: 1c
Branch: feat/adventure-map
Depends on: TASK-003, TASK-004, TASK-005
Context: Builds the ordered list of nodes for today's session. Bandit orders
node types. SM-2 dueWords drive content. attentionWindow determines count.
Always starts with a riddle (bond before learning). Always ends with castle.
Read first:

- src/shared/adventureTypes.ts (NodeConfig, NodeType)
- src/engine/bandit.ts (selectNodeType)
- src/profiles/buildProfile.ts (dueWords, attentionWindow, currentDifficulty)
  Touch:
- src/engine/nodeSelection.ts (new)
- src/tests/test-node-selection.ts (new)
- vitest.config.ts (add new test)
  Node count formula:
  shortSession = 3 nodes (attentionWindow < 180000ms)
  mediumSession = 4 nodes (attentionWindow 180000-360000ms)
  longSession = 5 nodes (attentionWindow > 360000ms)

* 1 castle node always appended
  Node ordering rules:

1. First node: always "riddle" (warm up, Law 7 — bond before learning)
2. Middle nodes: bandit selects from available game types
3. One dopamine node per session: space-invaders or asteroid (random)
4. Last node: always "boss" (castle)
   Content assignment:

- Spelling/reading nodes: words from profile.dueWords (SM-2)
- Math nodes: interleaving algorithm (existing)
- Riddle/dopamine nodes: no words, difficulty=1
- Castle (boss): hardest due word, difficulty=3
  NodeConfig.theme: passed from SessionTheme
  Interface:
  buildNodeList(profile: ChildProfile, theme: SessionTheme): Promise<NodeConfig[]>
  Tests:
- buildNodeList returns array with riddle as first node
- buildNodeList returns array with boss/castle as last node
- buildNodeList count matches attentionWindow (3, 4, or 5 + castle)
- buildNodeList uses dueWords for spelling nodes
- buildNodeList works for any registered childId
- No hardcoded child names in implementation
  Done when:
- npm run test:system green
- buildNodeList(ilaProfile, theme) returns valid NodeConfig[]
- buildNodeList(reinaProfile, theme) returns different content, same structure
  Delete: nothing
  Est: 1hr

---

TASK-010: MapCoordinator server
Phase: 1c
Branch: feat/adventure-map
Depends on: TASK-003, TASK-008, TASK-009
Context: Thin server-side adapter that owns map state. Handles WebSocket messages
from the adventure map client. Creates short-lived SessionManager instances
per node when voice interaction is needed. Does not replace SessionManager —
delegates to it for in-node activity.
Read first:

- src/server/session-manager.ts (understand WebSocket message patterns)
- src/server/ws-handler.ts (understand connection lifecycle)
- src/shared/adventureTypes.ts (MapState, NodeConfig, NodeResult)
  Touch:
- src/server/map-coordinator.ts (new)
- src/server/routes.ts (add /api/map/start and /api/map/node-complete)
- src/tests/test-map-coordinator.ts (new)
- vitest.config.ts (add new test)
  MapCoordinator owns:
- MapState (current node index, completed nodes, XP)
- WebSocket message routing for map events
- Node launch → SessionManager delegation
- Post-node pipeline (rating collection, bandit update, SM-2 update, XP)
  WebSocket messages (server → client):
  { type: "map_state", payload: MapState }
  { type: "node_launched", payload: NodeConfig }
  { type: "node_complete", payload: { nodeId, xpEarned, totalXp } }
  { type: "session_theme", payload: SessionTheme }
  WebSocket messages (client → server):
  { type: "node_click", payload: { nodeId } }
  { type: "node_result", payload: NodeResult }
  { type: "node_rating", payload: { nodeId, rating: "like"|"dislike"|null } }
  REST endpoints:
  POST /api/map/start — builds profile, generates theme, builds nodes, returns MapState
  POST /api/map/node-complete — receives NodeResult, runs post-node pipeline
  Tests:
- POST /api/map/start returns valid MapState for any registered childId
- POST /api/map/start returns 404 for unknown childId
- MapState contains nodes ordered by bandit selection
- node_click WebSocket message triggers node_launched response
- Post-node pipeline writes NodeRating to ndjson
- XP increments correctly after node completion
  Done when:
- npm run test:system green
- curl -X POST /api/map/start -d '{"childId":"ila"}' returns MapState JSON
- curl -X POST /api/map/start -d '{"childId":"reina"}' returns different MapState
  Delete: nothing
  Est: 2hr

---

# PHASE 1d — CLIENT-SIDE MAP

# Depends on Phase 1c complete.

---

TASK-011: AdventureMap.tsx Canvas component
Phase: 1d
Branch: feat/adventure-map
Depends on: TASK-003, TASK-010
Context: The main Canvas API component. Renders the adventure world. Reads
MapState from the WebSocket. Handles node clicks. Renders all animation.
Grok images fade in when ready. Canvas fallback renders immediately.
This is a NEW component — do not modify Canvas.tsx.
Read first:

- web/src/components/Canvas.tsx (understand iframe pattern, do not modify)
- src/shared/adventureTypes.ts (MapState, SessionTheme)
- web/src/hooks/useSession.ts (understand WebSocket hook pattern)
  Touch:
- web/src/components/AdventureMap.tsx (new)
- web/src/hooks/useMapSession.ts (new WebSocket hook)
- web/src/components/AdventureMap.css (new — minimal, animation only)
  Canvas layers (bottom to top):

1. Background: Grok image (fades in) or Canvas-drawn sky/hills fallback
2. Path: animated dashed bezier between nodes
3. Nodes: colored cards with pulse/glow on active node
4. Castle: Grok image or Canvas-drawn, always pulses
5. XP bar: top-left, white card
6. Rating overlay: appears after node completion
   Animation requirements:

- 60fps requestAnimationFrame loop
- Animated dashed path (lineDashOffset)
- Active node pulse (Math.sin wave on radius)
- Ambient particles (20 floating dots, theme-colored)
- Castle pulse (always animating, draws attention)
- Grok images fade in over 800ms (alpha 0→1)
  Node visual states:
- completed: gold background, checkmark
- active: glowing ring pulse, highlight color
- locked: gray, padlock icon
- castle: always visible, play button overlay
  useMapSession hook:
- Connects to WebSocket on mount
- Sends { type: "node_click", payload: { nodeId } } on click
- Receives map_state, node_launched, session_theme messages
- Returns: mapState, theme, onNodeClick, connectionStatus
  Child-agnostic:
- Reads childId from URL param or session context
- All colors from theme.palette — no hardcoded values
- Works for any registered child with zero code changes
  Tests (in web/src — component tests):
- AdventureMap renders without crashing given valid MapState
- completed nodes show checkmark
- locked nodes show padlock
- active node has different visual state
- onNodeClick fires with correct nodeId
  Done when:
- npm run build (web) passes
- AdventureMap renders in browser with a MapState fixture
- Clicking a node calls onNodeClick with the nodeId
- Canvas animates at 60fps (requestAnimationFrame loop running)
  Delete: nothing
  Est: 2hr

---

TASK-012: Game launch from node
Phase: 1d
Branch: feat/adventure-map
Depends on: TASK-011, TASK-010
Context: When a child clicks a node, the adventure map hands off to the game.
The game receives NodeConfig via URL params. When the game completes, it
posts a result back to the map. The map resumes.
Read first:

- web/public/games/ (understand existing game HTML files)
- web/src/components/Canvas.tsx (find iframe launch pattern)
- src/shared/adventureTypes.ts (NodeConfig, NodeResult)
  Touch:
- web/src/components/AdventureMap.tsx (add game launch/return logic)
- web/src/hooks/useMapSession.ts (handle node_launched message)
- web/public/games/word-builder.html (add NodeResult postMessage on complete)
- web/public/games/bubble-pop.html (same — if exists, else skip)
  Game launch flow:

1. User clicks node → useMapSession sends node_click
2. Server responds with node_launched + NodeConfig
3. AdventureMap shows portal animation (Canvas API expanding circles)
4. Game iframe launches with URL params:
   ?childId=ila&words=cat,dog&difficulty=2&timeLimit=30000&theme=default
5. Game completes → postMessage({ type: "node_result", ...NodeResult })
6. AdventureMap receives result → sends to server via node_result message
7. Portal closes → map resumes with node marked complete
   Portal animation (Canvas API):

- Expanding concentric circles from node center
- 800ms duration
- theme.palette.accent color
- Then iframe slides in
  Tests:
- node_launched message triggers portal animation (mock)
- Game iframe receives correct URL params from NodeConfig
- postMessage from game is received by AdventureMap
- node_result is sent to server after game completes
  Done when:
- npm run build passes
- Clicking a node opens word-builder.html with correct params
- Completing word-builder returns result to map
- Map shows node as completed after result received
  Delete: nothing
  Est: 1hr

---

TASK-013: Rating overlay
Phase: 1d
Branch: feat/adventure-map
Depends on: TASK-011, TASK-007
Context: After each node completes, the child rates like/dislike. Rendered on
the Canvas API surface (not a React overlay). Simple, fast, two options.
Rating is optional — child can skip by tapping elsewhere.
Read first:

- web/src/components/AdventureMap.tsx (find where node completion is handled)
- src/utils/nodeRatingIO.ts (understand rating storage)
- src/shared/adventureTypes.ts (NodeRating)
  Touch:
- web/src/components/AdventureMap.tsx (add rating overlay to canvas)
- web/src/hooks/useMapSession.ts (send node_rating message)
  Rating overlay design (Canvas API):
- Appears 500ms after node completion
- White rounded card, centered on canvas
- "How was [node type]?" in 14px text
- Two buttons: thumbs up (green) and thumbs down (orange)
- Auto-dismisses after 5 seconds if no response (null rating)
- Tapping elsewhere dismisses (null rating)
  Rating submission:
- Send { type: "node_rating", payload: { nodeId, rating } } via WebSocket
- Server receives, writes NodeRating via nodeRatingIO
- Then updates bandit reward
  Tests:
- Rating overlay appears after node_complete message
- Clicking thumbs up sends rating="like" to server
- Clicking thumbs down sends rating="dislike" to server
- Auto-dismiss after 5s sends rating=null
- Rating written to ndjson file
  Done when:
- npm run build passes
- Rating overlay appears after completing a node in browser
- Thumbs up/down send correct rating to server
- Rating appears in src/context/ila/ratings/ ndjson file
  Delete: nothing
  Est: 1hr

---

# PHASE 1e — INTEGRATION

# Connects all components into a working end-to-end session.

# Depends on Phase 1d complete.

---

TASK-014: Post-node pipeline
Phase: 1e
Branch: feat/adventure-map
Depends on: TASK-010, TASK-013, TASK-005, TASK-007
Context: After a node completes and is rated, the system runs the post-node
pipeline: update SM-2, update bandit, update XP, write session notes.
This closes the learning loop.
Read first:

- src/server/map-coordinator.ts (find node-complete handler)
- src/engine/bandit.ts (recordReward)
- src/utils/nodeRatingIO.ts (appendNodeRating)
- src/engine/learningEngine.ts (understand SM-2 update pattern)
  Touch:
- src/server/map-coordinator.ts (implement post-node pipeline)
- src/tests/test-post-node-pipeline.ts (new)
- vitest.config.ts (add new test)
  Pipeline steps (in order):

1. Write NodeRating to ndjson (nodeRatingIO.appendNodeRating)
2. Update bandit: recordReward(childId, nodeType, rating, completed, accuracy)
3. Update SM-2 for attempted words: recordAttempt(word, correct, domain)
4. Update XP: +10 per correct word, +25 per mastered word, +5 node complete
5. If castle node: +50 XP bonus
6. Send node_complete WebSocket message with { nodeId, xpEarned, totalXp }
7. Update session notes with node result
   Tests:

- Post-node pipeline runs all 6 steps in order
- Bandit reward is called with correct composite score
- SM-2 recordAttempt called for each word in NodeResult.wordsAttempted
- XP increments by correct amount
- Castle node adds 50 XP bonus
- Session notes updated after node completion
  Done when:
- npm run test:system green
- Complete a node manually — check bandit state updated in learning_profile.json
- Check NodeRating written to ndjson
- Check XP incremented in profile
  Delete: nothing
  Est: 1hr

---

TASK-015: Castle boss node
Phase: 1e
Branch: feat/adventure-map
Depends on: TASK-009, TASK-014
Context: The final node is always the castle. Boss level — hardest version of
today's due words. Extra XP. Completion triggers a celebration moment.
The castle always pulses on the map (already implemented in AdventureMap.tsx).
Read first:

- src/engine/nodeSelection.ts (understand castle node construction)
- web/src/components/AdventureMap.tsx (castle rendering)
- src/shared/adventureTypes.ts (NodeConfig with isCastle=true)
  Touch:
- src/engine/nodeSelection.ts (ensure castle is always last, difficulty=3)
- web/src/components/AdventureMap.tsx (castle completion animation)
- src/server/map-coordinator.ts (castle XP bonus handling)
  Castle completion (Canvas API animation):
- Particle burst from castle position
- 60 particles, theme.palette.glow color
- 2 second duration
- XP counter increments visually
- "Session Complete!" text fades in
  Tests:
- buildNodeList always returns castle as last node
- Castle node has difficulty=3
- Castle node has isCastle=true
- Castle completion adds 50 XP bonus
- Castle completion animation fires (mock canvas)
  Done when:
- npm run test:system green
- Complete all nodes manually — castle triggers particle burst
- XP shows +50 bonus for castle
  Delete: nothing
  Est: 1hr

---

TASK-016: Adventure metrics
Phase: 1e
Branch: feat/adventure-map
Depends on: TASK-007, TASK-014
Context: Compute derived metrics from NodeRating history. These inform the
Psychologist and feed back into buildProfile for the next session.
Read first:

- src/utils/nodeRatingIO.ts (getNodeRatings)
- src/profiles/profileCompute.ts (understand existing compute pattern)
- src/shared/childProfile.ts (understand where metrics live)
  Touch:
- src/engine/adventureMetrics.ts (new)
- src/tests/test-adventure-metrics.ts (new)
- vitest.config.ts (add new test)
  Functions (all pure — receive data as parameters):
  computeEngagementScore(ratings: NodeRating[], nodeType: NodeType): number
  = (likes/total) _ completionRate _ accuracyWeight
  computeThemeAffinity(ratings: NodeRating[], theme: string): number
  = average rating score for sessions with that theme
  computeAttentionWindow(ratings: NodeRating[]): number
  = median completionTime_ms of non-abandoned sessions
  computeDifficultySweetSpot(ratings: NodeRating[]): 1|2|3
  = difficulty level where engagement score is highest
  Tests:
- computeEngagementScore([all likes]) returns 1.0
- computeEngagementScore([all dislikes]) returns 0.0
- computeEngagementScore([mixed]) returns value between 0 and 1
- computeThemeAffinity returns higher score for liked theme
- computeAttentionWindow([]) returns default 300000
- computeAttentionWindow([abandoned at 120000]) returns 120000
- All functions are pure — same input always same output
  Done when:
- npm run test:system green
- All functions pass tests with fixture rating data
  Delete: nothing
  Est: 1hr

---

TASK-017: Session notes integration
Phase: 1e
Branch: feat/adventure-map
Depends on: TASK-014, TASK-016
Context: At session end, write a [metrics] block to session notes. The
Psychologist reads this on sunny:sync. Includes node completion, ratings,
theme, bandit state.
Read first:

- src/engine/psychologistBridge.ts (understand writeSessionNote)
- src/context/ila/session_notes/ (understand format)
- src/shared/adventureTypes.ts (NodeRating, MapState)
  Touch:
- src/engine/psychologistBridge.ts (add metrics block to session note)
- src/tests/test-session-metrics-note.ts (new)
- vitest.config.ts (add new test)
  Metrics block format:

## Metrics

- Nodes completed: 4/5
- Castle reached: yes
- Avg accuracy: 78%
- Avg completion time: 4.2 min
- Ratings: 3 likes, 1 dislike, 1 null
- Theme: default
- Most engaged node type: bubble-pop
- Least engaged: clock-game
- Bandit state: updated
  Tests:
- writeSessionNote includes [metrics] block
- Metrics block contains nodes completed count
- Metrics block contains rating summary
- Metrics block contains most/least engaged node types
  Done when:
- npm run test:system green
- Run a full session — check session_notes file has [metrics] block
  Delete: nothing
  Est: 30min

---

TASK-018: Feature flag and full wiring
Phase: 1e
Branch: feat/adventure-map
Depends on: TASK-011 through TASK-017
Context: Wire the adventure map into the app behind a feature flag. Old
ChildPicker → SessionScreen flow stays alive. ADVENTURE_MAP=true env var
switches to the new flow. This preserves the ability to rollback if
children do not respond well to the new experience.
Read first:

- web/src/App.tsx (understand current flow: ChildPicker → SessionScreen)
- web/src/hooks/useSession.ts (understand current session hook)
- src/server/routes.ts (understand existing API endpoints)
  Touch:
- web/src/App.tsx (add ADVENTURE_MAP feature flag branch)
- web/src/hooks/useMapSession.ts (ensure production-ready)
- src/server/server.ts (ensure /api/map/\* routes registered)
  Feature flag:
  ADVENTURE_MAP=true → child sees AdventureMap on login
  ADVENTURE_MAP=false (default) → child sees existing ChildPicker → SessionScreen
  Flag reads from: import.meta.env.VITE_ADVENTURE_MAP in React
  process.env.ADVENTURE_MAP in Node
  Tests:
- With ADVENTURE_MAP=false: App renders ChildPicker (existing test passes)
- With ADVENTURE_MAP=true: App renders AdventureMap
- AdventureMap renders for "ila" without error
- AdventureMap renders for "reina" without error — different colors
- Full flow: start → nodes → castle → session notes written
  Done when:
- npm run test:system green
- ADVENTURE_MAP=true in .env → open browser → world appears
- ADVENTURE_MAP=false in .env → open browser → existing flow unchanged
- Complete full session with flag on: nodes → castle → metrics in notes
  Delete: nothing
  Est: 1hr

---

# PHASE 2 — CREATIVE STUDIO

# Depends on Phase 1e complete and stable.

# Only start after ADVENTURE_MAP=true has been tested in real sessions.

---

TASK-019: Charlotte creative studio tools
Phase: 2
Branch: feat/adventure-map
Depends on: TASK-018
Context: In npm run sunny:mode:diag:build, Charlotte gets tools to generate
and iterate on worlds interactively. Parent speaks to Charlotte, Charlotte
generates Canvas HTML, parent approves, saves to theme registry.
This is how the theme library grows without manual coding.
Read first:

- src/companions/loader.ts (understand creator/diag profile)
- src/agents/elli/tools/ (understand tool pattern)
- src/server/theme-registry.ts (getAvailableThemes, theme paths)
- src/agents/designer/designer.ts (generateTheme)
  Touch:
- src/agents/creator/tools/generateWorld.ts (new)
- src/agents/creator/tools/previewWorld.ts (new)
- src/agents/creator/tools/saveTheme.ts (new)
- src/agents/creator/tools/listThemes.ts (new)
- src/agents/creator/tools/loadProfile.ts (new)
- src/server/session-manager.ts (register creator tools in diag:build mode)
  Tools:
  generateWorld({ theme: string, profile?: ChildProfile }): Canvas HTML string - Calls Claude Sonnet with canvas generation prompt - Returns complete HTML that renders a Canvas world - Includes default fallback if generation fails
  previewWorld({ html: string }): void - Sends html to canvas via canvasShow type="world" - Parent sees it immediately
  saveTheme({ name: string, html: string }): { path: string } - Validates name (alphanumeric, no spaces) - Writes to src/themes/{name}.html - Returns path confirmation
  listThemes(): { themes: string[] } - Returns getAvailableThemes()
  loadProfile({ childId: string }): ChildProfile - Returns buildProfile(childId) - Charlotte can preview how a world looks for a specific child
  npm script:
  "sunny:mode:diag:build": "SUNNY_SUBJECT=creator SUNNY_BUILD_MODE=true npm run sunny"
  Tests:
- saveTheme writes to correct path
- saveTheme rejects invalid names
- listThemes returns all files in src/themes/
- loadProfile throws for unknown childId
  Done when:
- npm run test:system green
- npm run sunny:mode:diag:build starts
- Say "build me a beach world" — Charlotte generates Canvas HTML
- Say "save this as beach_v1" — file appears at src/themes/beach_v1.html
- Say "list themes" — Charlotte lists available themes
  Delete: nothing
  Est: 2hr

---

TASK-020: Attention window calibration
Phase: 2
Branch: feat/adventure-map
Depends on: TASK-016, TASK-018
Context: After 5+ sessions, the system has enough rating data to compute a
real attention window per child. buildProfile updates attentionWindow_ms
from actual NodeRating history. Node count adapts accordingly.
Read first:

- src/profiles/buildProfile.ts (computeAttentionWindow call)
- src/utils/nodeRatingIO.ts (getNodeRatings)
- src/engine/adventureMetrics.ts (computeAttentionWindow)
  Touch:
- src/profiles/buildProfile.ts (wire real rating data to computeAttentionWindow)
- src/tests/test-attention-calibration.ts (new)
- vitest.config.ts (add new test)
  Before this task: attentionWindow uses default 300000ms
  After this task: attentionWindow computed from actual rating history
- If fewer than 5 rated sessions: use default
- If 5+ rated sessions: use computeAttentionWindow(ratings)
- Result flows into nodeSelection → different node count per child
  Tests:
- buildProfile with 0 ratings returns attentionWindow=300000
- buildProfile with 5 ratings (all completed in 120000ms) returns ~120000
- buildProfile with mixed abandoned/completed sessions uses non-abandoned only
- Node count changes when attentionWindow changes (integration test)
  Done when:
- npm run test:system green
- Run 5 sessions with flag on → check attentionWindow changes in profile API response
  Delete: nothing
  Est: 1hr

---

TASK-021: Theme unlock progression
Phase: 2
Branch: feat/adventure-map
Depends on: TASK-004, TASK-018
Context: Themes unlock at specific XP levels. When a child first reaches
level 5, beach unlocks. Level 10, space unlocks. The system announces
unlocks via a canvas celebration. Child sees a new world next session.
Read first:

- src/profiles/profileCompute.ts (computeUnlockedThemes)
- src/server/map-coordinator.ts (session start flow)
- web/src/components/AdventureMap.tsx (celebration animation)
  Touch:
- src/profiles/profileCompute.ts (ensure unlock thresholds are correct)
- src/server/map-coordinator.ts (detect new unlock, send unlock_event)
- web/src/components/AdventureMap.tsx (unlock celebration animation)
- src/tests/test-theme-unlock.ts (new)
- vitest.config.ts (add new test)
  Unlock detection:
- Compare previous unlockedThemes to new unlockedThemes after XP update
- If new theme unlocked: send { type: "theme_unlocked", payload: { themeName } }
- Client shows celebration (particle burst + "New world unlocked!" text)
- Next session: new theme available to DesignerAgent
  Tests:
- computeUnlockedThemes(4) does not include "beach"
- computeUnlockedThemes(5) includes "beach"
- computeUnlockedThemes(9) does not include "space"
- computeUnlockedThemes(10) includes "space"
- unlock_event sent when level crosses threshold
  Done when:
- npm run test:system green
- Manually set XP to level 5 → restart session → "beach" in theme registry
- theme_unlocked WebSocket event fires at level 5 and 10
  Delete: nothing
  Est: 1hr

---

# PHASE 3 — CLEANUP

# Blocked on DELETIONS.md design (not written yet).

# Do not execute Phase 3 until:

# 1. ADVENTURE_MAP=true has been tested in real sessions with real children

# 2. Engagement data confirms the new flow works better than the old one

# 3. DELETIONS.md is written with exact file list, feature flag removal plan,

# and rollback strategy

TASK-022: Write DELETIONS.md (prerequisite for Phase 3)
Phase: 3 prerequisite
Branch: feat/adventure-map
Depends on: Real session data from TASK-018
Context: Before deleting the old flow, design the deletion carefully.
This task produces the plan. Phase 3 execution is a separate task.
Touch:

- DELETIONS.md (new, project root)
  DELETIONS.md must contain:
- Exact list of files to delete
- Exact list of functions to delete within kept files
- Feature flag removal plan (ADVENTURE_MAP env var)
- Tests that prove old flow is safe to delete
- Rollback plan: git revert strategy if deletion breaks production
- Go/no-go criteria: engagement metric thresholds that must be met
  Done when: DELETIONS.md exists and Jamal approves it
  Est: 30min

---

# END OF TASKS.md

# Total: 22 tasks (TASK-000 through TASK-021 + TASK-022)

# Phase 1a: 3 tasks (gate — must complete before any other phase)

# Phase 1b: 5 tasks (parallelizable infrastructure)

# Phase 1c: 3 tasks (server-side map)

# Phase 1d: 3 tasks (client-side map)

# Phase 1e: 5 tasks (integration)

# Phase 2: 3 tasks (creative studio + polish)

# Phase 3: 1 prerequisite task (cleanup design)

#

# DEFINITION OF DONE FOR THE ENTIRE SYSTEM:

# A child opens Sunny, plays through an adventure the system designed for them,

# rates it, and tomorrow's adventure is measurably different because of what

# they did today — with zero parent or developer intervention.
