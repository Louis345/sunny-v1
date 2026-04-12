# Project Sunny -- Companion System Phase 0.5 Tickets

# Generated: April 12, 2026
#
# INSTRUCTIONS FOR CURSOR:
# Execute one ticket at a time. Stop after each ticket and report:
# - Test count before and after
# - Files touched
# - Lines added vs removed
# - Any risks or blockers found
# Do not proceed to the next ticket without approval.
#
# NON-NEGOTIABLE RULES:
# - No hardcoded child names in any new file
# - Tests first -- red commit before green commit
# - Net code trends down where possible
# - Every companion behavior reads from childProfile.companion
# - Nothing outside the Touch list gets modified
#
# PARALLEL AGENTS:
# Agent 1 (VRM Rendering): COMPANION-002, 003, 004, 005
# Agent 2 (Server Events): COMPANION-006, 007
# Agent 3 (Independent):   COMPANION-008
# COMPANION-001 is a prerequisite -- run first by whichever agent starts.

---

COMPANION-001: Companion shared types and ChildProfile extension
Phase: 0.5
Agent: Prerequisite (run before Agents 1 and 2 start parallel work)
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: none
Context: The companion system needs shared type definitions for events and a
  new `companion` field on ChildProfile. This ticket defines the interface
  contract that both the VRM rendering layer (Agent 1) and the server event
  emitter (Agent 2) code against. No runtime logic beyond extending buildProfile
  to return companion defaults. The companion config on ChildProfile holds
  sensitivity dials, VRM URL, idle timing, and toggle state -- all fields that
  the CompanionLayer reads to drive behavior. Note: children.config.json does
  not exist in this codebase. Companion defaults are computed in buildProfile,
  which is the single assembly point for all child data (Law 1).
Read first:
  - src/shared/childProfile.ts (existing ChildProfile interface)
  - src/shared/adventureTypes.ts (understand shared type file pattern)
  - src/profiles/buildProfile.ts (see how profile is assembled)
  - src/profiles/profileCompute.ts (see pure compute function pattern)
Touch:
  - src/shared/companionTypes.ts (new -- CompanionEvent, CompanionTrigger, CompanionConfig)
  - src/shared/childProfile.ts (add companion: CompanionConfig to ChildProfile)
  - src/profiles/buildProfile.ts (add companion defaults to return value)
  - src/tests/test-companion-types.ts (new)
Tests:
  - CompanionConfig shape has all required fields: vrmUrl (string), sensitivity (object with 6 trigger keys), idleFrequency_ms (number), randomMomentProbability (number), toggledOff (boolean)
  - CompanionEvent shape has type "companion_event" and payload with trigger, timestamp, childId
  - CompanionTrigger union includes all 6 values: session_start, correct_answer, wrong_answer, mastery_unlock, session_end, idle_too_long
  - All sensitivity values in default config are between 0.0 and 1.0
  - buildProfile("ila") returns a profile with companion field containing all required keys
  - buildProfile("reina") returns a profile with companion field (child-agnostic)
  - Default vrmUrl is "/companions/sample.vrm"
  - Default toggledOff is false
Done when:
  - npm run build passes with new types
  - vitest run passes (new tests green)
  - curl /api/profile/ila returns JSON with companion field containing vrmUrl, sensitivity, idleFrequency_ms, randomMomentProbability, toggledOff
  - No hardcoded child names in companionTypes.ts
  - No any types in new files
Est: 30min

---

COMPANION-002: CompanionLayer shell with Three.js, VRM loading, toggle, and App mount
Phase: 0.5
Agent: 1
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: COMPANION-001
Context: This is the foundational rendering ticket. It creates the CompanionLayer
  React component which owns a Three.js WebGL canvas with transparent background,
  loads a VRM model file, validates it, and renders it in a fixed position on
  screen. The component mounts at the App root as a sibling to AdventureMap and
  SessionScreen -- it persists across all navigation. The Three.js canvas sits
  at z-index 10 with pointer-events:none so clicks pass through to the map
  beneath. Toggle on/off is included: when toggled off, the canvas hides
  (display:none) and the animation loop pauses. Phase 0.5 uses the sample VRM
  from @pixiv/three-vrm examples (AvatarSample_B.vrm or equivalent). VRM
  validation on load checks for required blend shapes ["happy", "sad",
  "surprised", "aa"] and required bones ["head", "leftHand", "rightHand",
  "spine"]. Missing requirements throw a descriptive error. The component reads
  vrmUrl from childProfile.companion.vrmUrl -- no hardcoded model path in
  rendering code. Install three, @pixiv/three-vrm, and @types/three as
  dependencies in web/package.json.
Read first:
  - web/src/App.tsx (understand component tree, where to mount CompanionLayer)
  - web/src/components/AdventureMap.tsx (understand z-index usage, sibling pattern)
  - src/shared/companionTypes.ts (CompanionConfig shape from COMPANION-001)
  - src/shared/childProfile.ts (ChildProfile with companion field)
Touch:
  - web/package.json (add three, @pixiv/three-vrm, @types/three)
  - web/public/companions/sample.vrm (new -- download sample VRM model)
  - web/src/components/CompanionLayer.tsx (new)
  - web/src/App.tsx (mount CompanionLayer when childId known, pass toggle state)
  - web/src/tests/test-companion-layer.ts (new)
Tests:
  - CompanionLayer renders without crashing given a valid childId and companion config
  - CompanionLayer creates a Three.js WebGLRenderer with alpha:true
  - CompanionLayer canvas has z-index 10 and pointer-events none
  - VRM loader rejects a file missing required blend shape "happy" (mock or fixture)
  - VRM loader rejects a file missing required bone "head" (mock or fixture)
  - VRM validation passes for sample.vrm (or mock with all required shapes/bones)
  - When toggledOff is true, canvas has display:none
  - When toggledOff is false, canvas is visible
  - CompanionLayer does not render when childId is null/empty
  - No hardcoded child names or VRM paths in CompanionLayer.tsx
Done when:
  - npm run build (web) passes with Three.js dependencies installed
  - vitest run passes (new tests green)
  - Open browser with VITE_ADVENTURE_MAP=true: VRM model visible in bottom-right corner
  - Click map nodes: clicks pass through CompanionLayer canvas to map beneath
  - Toggle button hides/shows the VRM
  - Console shows descriptive error if VRM file is missing or invalid
Est: 2hr

---

COMPANION-003: Expression reactions to companion events
Phase: 0.5
Agent: 1
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: COMPANION-002
Context: When a CompanionEvent arrives, the VRM model should react with a facial
  expression. This ticket implements the trigger-to-expression mapping and the
  sensitivity-gated reaction system. Each trigger type maps to a VRM expression:
  correct_answer -> happy, wrong_answer -> sad, mastery_unlock -> surprised,
  session_start -> happy, session_end -> happy, idle_too_long -> thinking pose
  (head tilt via bone rotation, not a face blend shape -- "thinking" is not a
  standard VRM expression). The sensitivity dial from childProfile.companion
  .sensitivity[trigger] determines whether the reaction fires: roll
  Math.random() against the sensitivity value. If the roll passes, set the
  expression to weight 1.0 and decay it back to 0.0 over a configurable
  duration (2000ms default, 3000ms for mastery_unlock and session_start).
  "neutral" is weight 0 on all expressions -- the default rest pose. The
  CompanionLayer receives CompanionEvent[] as a prop and processes new events
  each render cycle. No hardcoded sensitivity values in this file -- all read
  from the profile.
Read first:
  - web/src/components/CompanionLayer.tsx (from COMPANION-002, VRM loaded here)
  - src/shared/companionTypes.ts (CompanionEvent, CompanionTrigger, CompanionConfig)
  - src/shared/childProfile.ts (companion.sensitivity shape)
Touch:
  - web/src/components/CompanionLayer.tsx (add expression reaction logic)
  - web/src/utils/companionExpressions.ts (new -- trigger-to-expression map, decay logic)
  - web/src/tests/test-companion-expressions.ts (new)
Tests:
  - TRIGGER_EXPRESSION_MAP maps correct_answer to "happy"
  - TRIGGER_EXPRESSION_MAP maps wrong_answer to "sad"
  - TRIGGER_EXPRESSION_MAP maps mastery_unlock to "surprised"
  - TRIGGER_EXPRESSION_MAP maps session_start to "happy"
  - TRIGGER_EXPRESSION_MAP maps idle_too_long to "thinking" (pose identifier)
  - Expression reaction fires when Math.random() < sensitivity value (mock random)
  - Expression reaction does NOT fire when Math.random() >= sensitivity (mock random)
  - Expression weight starts at 1.0 and decays to 0.0 over duration
  - After decay completes, all expression weights are 0.0 (neutral rest pose)
  - "thinking" trigger rotates head bone instead of setting face blend shape
  - Sensitivity values come from profile.companion.sensitivity, not hardcoded constants
  - Processing the same event twice does not double-trigger (deduplication by timestamp)
Done when:
  - npm run build (web) passes
  - vitest run passes (new tests green)
  - In browser: send a mock companion_event with trigger "correct_answer" -- VRM face changes to happy and fades back to neutral
  - In browser: send trigger "mastery_unlock" -- VRM face changes to surprised
  - In browser: send trigger "idle_too_long" -- VRM head tilts slightly
Est: 1hr

---

COMPANION-004: Idle behavior and LookAt spatial awareness
Phase: 0.5
Agent: 1
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: COMPANION-002
Context: The VRM should feel alive even when nothing is happening. This ticket
  adds two systems: (1) Random idle moments driven by profile dials, and (2)
  LookAt gaze tracking that follows the currently active/hovered node on the
  adventure map. For idle moments: every idleFrequency_ms (from
  childProfile.companion.idleFrequency_ms, default 8000), roll Math.random()
  against randomMomentProbability (from profile, default 0.3). If hit, play a
  random behavior from ["wave", "lookAround", "headTilt", "surprised"]. Each
  is a short bone animation (500-1500ms). For LookAt: use three-vrm's
  VRMLookAt system. Set vrm.lookAt.target to a THREE.Object3D whose position
  tracks the active node. Node positions come from the adventure map's layout --
  the CompanionLayer receives the active node's screen position as a prop
  ({x: number, y: number} in pixels) and converts to Three.js world
  coordinates via camera unprojection. When no node is active, the lookAt target
  drifts toward screen center. Breathing and eye blink are handled automatically
  by three-vrm's vrm.update(deltaTime) call (already in COMPANION-002).
Read first:
  - web/src/components/CompanionLayer.tsx (VRM scene, animation loop)
  - web/src/components/AdventureMap.tsx (find activeIndex, node position data)
  - web/src/components/PathCurve.tsx (how node positions are calculated)
  - src/shared/childProfile.ts (companion.idleFrequency_ms, randomMomentProbability)
Touch:
  - web/src/components/CompanionLayer.tsx (add idle timer + lookAt target updates)
  - web/src/utils/companionIdle.ts (new -- idle behavior logic, random moment selection)
  - web/src/components/AdventureMap.tsx (expose active node screen position via callback prop or context)
  - web/src/App.tsx (pipe active node position from AdventureMap to CompanionLayer)
  - web/src/tests/test-companion-idle.ts (new)
Tests:
  - Idle timer increments with deltaTime and resets at idleFrequency_ms
  - Random moment fires when Math.random() < randomMomentProbability (mock random)
  - Random moment does NOT fire when Math.random() >= randomMomentProbability
  - Random moment selects from ["wave", "lookAround", "headTilt", "surprised"]
  - Idle timing reads from profile.companion, not hardcoded constants
  - LookAt target updates when active node position changes
  - LookAt target drifts to center when no node is active (null position)
  - Idle timer pauses when toggledOff is true
  - All idle behaviors complete within 1500ms (do not overlap with expression reactions)
Done when:
  - npm run build (web) passes
  - vitest run passes (new tests green)
  - In browser: wait 8+ seconds with no interaction -- VRM performs a random idle action
  - In browser: hover over different map nodes -- VRM gaze follows the hovered node
  - In browser: stop hovering -- VRM gaze drifts back to center
Est: 1.5hr

---

COMPANION-005: Mouth sync via Web Audio API AnalyserNode
Phase: 0.5
Agent: 1
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: COMPANION-002
Context: When ElevenLabs audio plays through the browser, the VRM's mouth should
  move. This ticket creates a shared AnalyserNode (module-level ref pattern,
  same as the existing gameIframeRef in Canvas.tsx) that taps into the audio
  playback chain. The useSession hook (web/src/hooks/useSession.ts) currently
  plays PCM audio via: BufferSource -> AudioContext.destination. This ticket
  inserts an AnalyserNode: BufferSource -> AnalyserNode -> destination. The
  AnalyserNode ref is exported from a new file web/src/utils/audioAnalyser.ts.
  CompanionLayer imports this ref and reads amplitude data every animation
  frame. Amplitude (RMS) maps to the VRM "aa" blend shape weight for mouth
  movement. When no audio is playing (analyser ref is null or silent), the
  mouth stays closed (aa weight = 0). The adventure map flow currently has no
  audio, so analyser ref will be null during map navigation -- mouth sync is
  a no-op. This is correct and expected. Mouth sync activates only during
  voice sessions where ElevenLabs audio is playing.
Read first:
  - web/src/hooks/useSession.ts (find playNextChunk function around line 944, find playContextRef, find pcmToAudioBuffer)
  - web/src/components/CompanionLayer.tsx (animation loop where updateMouthSync is called)
  - web/src/components/Canvas.tsx (find gameIframeRef export -- this is the pattern to follow for the analyser ref)
Touch:
  - web/src/utils/audioAnalyser.ts (new -- module-level AnalyserNode ref)
  - web/src/hooks/useSession.ts (insert AnalyserNode into playback chain in playNextChunk)
  - web/src/components/CompanionLayer.tsx (read analyser ref, compute RMS, set "aa" blend shape)
  - web/src/tests/test-mouth-sync.ts (new)
Tests:
  - audioAnalyserRef.current is null initially
  - After playback AudioContext initializes, audioAnalyserRef.current is an AnalyserNode
  - AnalyserNode is connected between source and destination (not bypassed)
  - updateMouthSync returns 0.0 when analyser is null (no audio)
  - updateMouthSync returns value > 0.0 when analyser has non-silent audio data (mock)
  - updateMouthSync returns value between 0.0 and 1.0 (clamped)
  - RMS computation from Uint8Array byte data is mathematically correct (fixture: [128,128,...] -> 0.0, [255,0,255,0,...] -> ~1.0)
  - Smooth interpolation: weight change per frame is <= 0.3 of delta (no jumps)
  - When audio stops, mouth weight decays to 0.0 within 200ms
Done when:
  - npm run build (web) passes
  - vitest run passes (new tests green)
  - In browser with voice session: Elli speaks, VRM mouth moves in sync with audio amplitude
  - In browser with voice session: Elli stops speaking, VRM mouth closes smoothly
  - In browser with adventure map (no voice): VRM mouth stays closed (no errors)
  - useSession.ts audio playback still works correctly (no regression)
Est: 1.5hr

---

COMPANION-006: Server companion event emission for both flows
Phase: 0.5
Agent: 2
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: COMPANION-001
Context: The server must generate CompanionEvent objects at meaningful moments
  and deliver them to the client. Two flows exist and both must emit events:
  (1) Adventure map flow: MapCoordinator handles node completions via REST.
  After processing a node result in applyNodeResult(), generate CompanionEvent
  based on accuracy (>=0.8 -> correct_answer, <0.5 -> wrong_answer). Include
  companionEvents array in the REST response alongside mapState so the client
  can forward to CompanionLayer. On session start (startMapSession), emit
  session_start. (2) Voice session flow: SessionManager handles tool calls and
  turn ends via WebSocket. After sessionLog tool returns with correct/incorrect,
  emit companion_event on the WebSocket. On session_started and session_ended,
  emit companion_event. For idle_too_long: start a 45-second timer on the
  server after the last child input; if it fires, emit idle_too_long. The
  adventure map currently uses REST (useMapSession), not WebSocket. Companion
  events piggyback on existing REST response payloads -- no new transport
  needed. This is the branch-agnostic resolution from COMPANION_DESIGN.md
  Conflict 4.
Read first:
  - src/server/map-coordinator.ts (find startMapSession, applyNodeResult, handleMapClientMessage)
  - src/server/session-manager.ts (find handleToolCall, find "sessionLog" handling, find send() method)
  - src/server/routes.ts (find /api/map/start and /api/map/node-complete endpoints)
  - src/shared/companionTypes.ts (CompanionEvent, CompanionTrigger from COMPANION-001)
Touch:
  - src/server/companionEventEmitter.ts (new -- pure function: generateCompanionEvents(trigger, childId, metadata?) -> CompanionEvent[])
  - src/server/map-coordinator.ts (call generateCompanionEvents after node result, include in return)
  - src/server/session-manager.ts (call generateCompanionEvents on sessionLog result, emit via this.send)
  - src/server/routes.ts (pass companionEvents from map-coordinator response to client)
  - web/src/hooks/useMapSession.ts (read companionEvents from REST response, expose via hook return)
  - src/tests/test-companion-event-emitter.ts (new)
Tests:
  - generateCompanionEvents("correct_answer", "ila") returns array with one event of trigger "correct_answer"
  - generateCompanionEvents("session_start", "reina") returns event with correct childId
  - Every generated event has timestamp (number) and childId (string)
  - applyNodeResult with accuracy >= 0.8 includes companion_event with trigger "correct_answer" in response
  - applyNodeResult with accuracy < 0.5 includes companion_event with trigger "wrong_answer" in response
  - startMapSession includes companion_event with trigger "session_start" in response
  - POST /api/map/node-complete response body includes companionEvents array
  - POST /api/map/start response body includes companionEvents array
  - useMapSession exposes companionEvents in its return value
  - generateCompanionEvents is a pure function (no side effects, no I/O)
  - No hardcoded child names in companionEventEmitter.ts
Done when:
  - npm run build passes
  - vitest run passes (new tests green)
  - curl -X POST /api/map/start -d '{"childId":"ila"}' -- response includes companionEvents array with session_start event
  - curl -X POST /api/map/node-complete with result accuracy 0.9 -- response includes correct_answer companion event
  - In browser with voice session: open dev tools Network tab, see companion_event messages on WebSocket
Est: 1.5hr

---

COMPANION-007: Screenshot capture pipeline
Phase: 0.5
Agent: 2
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: COMPANION-006
Context: On meaningful companion events, the server can request a screenshot
  from the client. The client captures what it can and sends it back. The
  server attaches the screenshot to Claude's context for the next turn. This
  enables the "what do you see?" interaction in future phases. For Phase 0.5,
  the pipeline is wired end-to-end but the conversational ask flow is not
  enabled (Phase 1+). Screenshot capture strategy: if a <canvas> element exists
  in the DOM, call canvas.toDataURL("image/jpeg", 0.7). If only React DOM
  exists (adventure map with no active game), capture the WorldBackground <img>
  element's src as a proxy. If a game iframe is active (same-origin), reach
  into its canvas. The server marks certain companion events with
  requestScreenshot: true in the payload. The client responds with the
  captured image. In the adventure map REST flow: the screenshot is included
  in the next POST request body. In the voice WebSocket flow: the client
  sends { type: "screenshot", data: base64jpeg } on the WebSocket. The server
  stores the most recent screenshot in session state for injection into Claude's
  next turn as an image attachment.
Read first:
  - src/server/companionEventEmitter.ts (from COMPANION-006, see event shape)
  - src/server/session-manager.ts (find how messages are received from client, find history/context injection)
  - web/src/hooks/useSession.ts (find WebSocket message handling)
  - web/src/hooks/useMapSession.ts (find REST request/response flow)
  - web/src/components/AdventureMap.tsx (find canvas and iframe elements)
Touch:
  - web/src/utils/screenshotCapture.ts (new -- captureScreenshot(): Promise<string | null>)
  - web/src/hooks/useMapSession.ts (capture and include screenshot when requestScreenshot is true in companion event)
  - web/src/hooks/useSession.ts (capture and send screenshot when companion_event has requestScreenshot)
  - src/server/session-manager.ts (receive screenshot message, store in session state for next Claude turn)
  - src/server/companionEventEmitter.ts (add requestScreenshot: true for mastery_unlock and correct_answer triggers)
  - src/tests/test-screenshot-capture.ts (new)
Tests:
  - captureScreenshot returns a base64 string starting with "data:image/jpeg" when a <canvas> element exists (mock DOM)
  - captureScreenshot returns null when no canvas or img element exists
  - captureScreenshot uses quality 0.7 (verify toDataURL args via mock)
  - companion_event with trigger "mastery_unlock" has requestScreenshot: true
  - companion_event with trigger "correct_answer" has requestScreenshot: true
  - companion_event with trigger "idle_too_long" does NOT have requestScreenshot
  - useMapSession includes screenshot in next POST body when requestScreenshot was true
  - Screenshot data does not exceed 200KB (JPEG quality 0.7 at reasonable resolution)
  - captureScreenshot does not throw when called with no DOM elements (returns null gracefully)
Done when:
  - npm run build passes
  - vitest run passes (new tests green)
  - In browser with adventure map: complete a node, check Network tab -- next request includes screenshot field (or null if no canvas)
  - In browser with voice session: trigger a mastery event, check WebSocket -- screenshot message sent
  - Server logs show "screenshot received" (or similar) when screenshot arrives
  - No errors when screenshot capture finds no canvas (graceful null)
Est: 1.5hr

---

COMPANION-008: Node routing fix -- route game iframe by node type
Phase: 0.5
Agent: 3
Branch: feat/adventure-map (or main after merge per DECISIONS.md D-016)
Depends on: none
Context: AdventureMap.tsx has a function buildWordBuilderGameUrl that always
  routes to web/public/games/word-builder.html regardless of node type. This is
  a stub from the initial map implementation. The adventure map has 11 node
  types (word-builder, bubble-pop, karaoke, clock-game, coin-counter,
  spell-check, riddle, space-invaders, asteroid, space-frogger, boss) and 11
  game HTML files exist in web/public/games/. This ticket replaces the stub
  with a function that routes each node type to its correct game file. The
  mapping uses the game registry (src/shared/gameRegistry.generated.ts) where
  possible. Node types that don't have a direct game file (riddle, boss,
  karaoke, bubble-pop) fall back to word-builder.html for Phase 0.5. The
  function is renamed from buildWordBuilderGameUrl to buildGameUrl to reflect
  its general purpose. URL params remain the same: childId, difficulty, theme,
  nodeId, game. This ticket is independent of the companion system and can run
  in parallel with Agents 1 and 2.
Read first:
  - web/src/components/AdventureMap.tsx (find buildWordBuilderGameUrl function, see how it is called)
  - web/public/games/ (list all .html files to know which games exist)
  - src/shared/adventureTypes.ts (NodeType union -- all possible node types)
  - src/server/games/registry.ts (game registry pattern)
Touch:
  - web/src/components/AdventureMap.tsx (rename buildWordBuilderGameUrl to buildGameUrl, add type-based routing)
  - web/src/utils/gameRouting.ts (new -- NODE_TYPE_TO_GAME_FILE map, buildGameUrl function)
  - web/src/tests/test-game-routing.ts (new)
Tests:
  - buildGameUrl with node type "word-builder" returns URL containing "word-builder.html"
  - buildGameUrl with node type "clock-game" returns URL containing "clock-game.html"
  - buildGameUrl with node type "coin-counter" returns URL containing "coin-counter.html"
  - buildGameUrl with node type "spell-check" returns URL containing "spell-check.html"
  - buildGameUrl with node type "space-invaders" returns URL containing "space-invaders.html"
  - buildGameUrl with node type "asteroid" returns URL containing "asteroid.html"
  - buildGameUrl with node type "space-frogger" returns URL containing "space-frogger.html"
  - buildGameUrl with node type "riddle" falls back to "word-builder.html"
  - buildGameUrl with node type "boss" falls back to "word-builder.html"
  - buildGameUrl with node type "karaoke" falls back to "word-builder.html"
  - buildGameUrl with node type "bubble-pop" falls back to "word-builder.html"
  - URL always includes childId, difficulty, theme, nodeId, and game params
  - NODE_TYPE_TO_GAME_FILE has no hardcoded child names
  - Every existing game HTML file in web/public/games/ has a corresponding entry in the map
Done when:
  - npm run build (web) passes
  - vitest run passes (new tests green)
  - In browser: click a clock-game node -- clock-game.html loads in the iframe (not word-builder)
  - In browser: click a space-invaders node -- space-invaders.html loads
  - In browser: click a riddle node -- word-builder.html loads (expected fallback)
  - No regression: word-builder nodes still work correctly
Est: 45min

---

# END OF COMPANION_TASKS.md
# Total: 8 tickets (COMPANION-001 through COMPANION-008)
# Prerequisite: 1 ticket (shared types)
# Agent 1 (VRM Rendering): 4 tickets (COMPANION-002 through 005)
# Agent 2 (Server Events): 2 tickets (COMPANION-006 and 007)
# Agent 3 (Independent): 1 ticket (COMPANION-008)
#
# DEFINITION OF DONE FOR PHASE 0.5:
# A child opens Sunny. A VRM character is visible on screen. She is breathing.
# Her eyes follow the node the child is hovering over. The child answers
# correctly -- the character's expression changes to happy, her mouth is moving
# because ElevenLabs audio is playing. After 8 seconds of nothing happening,
# the character might do something random and unexpected. The child can mute
# her with one tap. When muted, she disappears entirely. Clicking a clock-game
# node opens clock-game.html, not word-builder.html.
