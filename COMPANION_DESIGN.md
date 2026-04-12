# Project Sunny -- Companion System Architecture

**Author:** Claude Opus 4.6 (from brief by Jamal Taylor + Claude Sonnet)
**Date:** April 12, 2026
**Status:** Phase 0.5 ready for implementation

---

## 1. Design Principles

The companion is a visual layer driven by events Claude already produces. It adds no new LLM calls, no new ElevenLabs calls, and no new latency to the session pipeline. The VRM model, its expressions, and its behavior dials are all config -- not code. A new character is a `.vrm` file and a profile update.

The thermostat metaphor governs everything:

| Layer | What it is | How it changes |
|-------|-----------|----------------|
| **Plumbing** | Event pipeline, VRM renderer, audio analysis, bone system | Code changes (rare) |
| **Device** | `.vrm` file per child | Drop a file, update one config field |
| **Dials** | Sensitivity, idle timing, random moments | Profile fields, zero code changes |

---

## 2. Component Tree

```
App (root)
+-- ChildPicker                          (phase: picker)
+-- AdventureMap                         (when adventure mode active)
|   +-- WorldBackground                  (z-index: 1)
|   +-- PathCurve                        (z-index: 2, SVG)
|   +-- NodeCards                        (z-index: 3, React positioned)
|   +-- XPBar, RatingOverlay             (z-index: 4)
|   +-- LaunchPortal                     (z-index: 6, Canvas)
|   +-- Game iframe                      (z-index: 14 when active)
+-- SessionScreen                        (when voice mode active)
|   +-- CompanionStrip + Canvas
+-- CompanionLayer                       (z-index: 10, always mounted)
    +-- Three.js transparent WebGL canvas
    +-- pointer-events: none
```

**CompanionLayer** is a sibling of AdventureMap and SessionScreen, not a child. It mounts when a `childId` is known and unmounts only when the child logs out. It persists through portal animations, node transitions, game launches, and mode switches.

### Corrected Z-Index Model

The brief assumed Canvas 2D for the adventure map. The actual implementation uses React DOM + SVG + framer-motion. The corrected layering:

| z-index | Layer | Technology |
|---------|-------|------------|
| 1 | WorldBackground (sky, hills, Grok image) | React/CSS, `<img>` |
| 2 | PathCurve (node connections) | SVG |
| 3 | NodeCards (interactive node buttons) | React positioned divs |
| 4 | XPBar, RatingOverlay, celebration | React/framer-motion |
| 6 | LaunchPortal (expanding circles) | Canvas 2D |
| **10** | **CompanionLayer (VRM character)** | **Three.js WebGL, transparent** |
| 14 | Game iframe (when active) | iframe |

The Three.js canvas uses `pointer-events: none` so all clicks pass through to the map beneath. The companion is visually present but never blocks interaction. When a game iframe is active (z-index 14), it covers the companion -- the companion is visible on the map, hidden during active gameplay.

---

## 3. ChildProfile Extension

New `companion` field on `ChildProfile`. `buildProfile` assembles it with defaults.

```typescript
interface CompanionConfig {
  vrmUrl: string;
  sensitivity: {
    session_start: number;    // 0.0-1.0
    correct_answer: number;
    wrong_answer: number;
    mastery_unlock: number;
    session_end: number;
    idle_too_long: number;
  };
  idleFrequency_ms: number;
  randomMomentProbability: number;  // 0.0-1.0
  toggledOff: boolean;              // session state only, resets each session
}
```

### Where the config lives (Conflict 1 Resolution)

`children.config.json` does not exist in this codebase. Children are registered via TypeScript constants in `src/companions/loader.ts` and per-child context directories under `src/context/{childId}/`.

**Resolution:** `buildProfile` returns companion config with sensible defaults. No new registry file. For Phase 0.5, every child gets the same sample VRM and default dials. Future phases can add per-child overrides via a `companion` section in `learning_profile.json`, which `buildProfile` already reads.

Default values for Phase 0.5:

```typescript
const COMPANION_DEFAULTS: CompanionConfig = {
  vrmUrl: "/companions/sample.vrm",
  sensitivity: {
    session_start: 0.8,
    correct_answer: 0.9,
    wrong_answer: 0.6,
    mastery_unlock: 1.0,
    session_end: 0.7,
    idle_too_long: 0.5,
  },
  idleFrequency_ms: 8000,
  randomMomentProbability: 0.3,
  toggledOff: false,
};
```

This preserves Law 1 (single source of truth via `buildProfile`) and Law 3 (dynamic over static -- dials are data, not constants in rendering code).

---

## 4. Companion Event Pipeline

### Event Shape

```typescript
interface CompanionEvent {
  type: "companion_event";
  payload: {
    trigger: CompanionTrigger;
    timestamp: number;
    childId: string;
    screenshot?: string;           // base64 JPEG, attached on meaningful events
    metadata?: Record<string, unknown>;
  };
}

type CompanionTrigger =
  | "session_start"
  | "correct_answer"
  | "wrong_answer"
  | "mastery_unlock"
  | "session_end"
  | "idle_too_long";
```

### Transport: Branch-Agnostic (Conflict 4 Resolution)

The adventure map uses REST (`useMapSession`), not WebSocket. The voice session uses WebSocket (`useSession`). The companion event pipeline must work with both transports without assuming either.

**Resolution:**

| Flow | Transport | How companion events arrive |
|------|-----------|---------------------------|
| Adventure map | REST | `/api/map/node-complete` response includes `companionEvents: CompanionEvent[]` |
| Voice session | WebSocket | Server emits `{ type: "companion_event", payload }` message |

The client normalizes both transports into the same `CompanionEvent[]` array and passes it to CompanionLayer. CompanionLayer never knows or cares which transport delivered the event.

```
Adventure map flow:
  POST /api/map/node-complete
    -> server runs post-node pipeline
    -> server generates CompanionEvent[] based on result
    -> response: { mapState, companionEvents }
    -> useMapSession stores events
    -> CompanionLayer receives via props

Voice session flow:
  SessionManager.handleToolCall() or handleEndOfTurn()
    -> server detects meaningful moment
    -> server calls this.send("companion_event", payload)
    -> useSession receives via WebSocket onmessage
    -> CompanionLayer receives via props
```

### Server-Side Event Generation

The server filters for meaningful moments only. Not every tool call or state change becomes a companion event. The mapping:

| Server event | CompanionTrigger | When |
|-------------|-----------------|------|
| `session_started` sent | `session_start` | Once per session |
| `sessionLog` tool with `correct: true` | `correct_answer` | Each correct attempt |
| `sessionLog` tool with `correct: false` | `wrong_answer` | Each incorrect attempt |
| Word mastery detected (SM-2 interval jumps) | `mastery_unlock` | Rare, high-value |
| `session_ended` sent | `session_end` | Once per session |
| No child input for `>45s` | `idle_too_long` | Timer-based |
| Node complete with `accuracy >= 0.8` | `correct_answer` | Adventure map flow |
| Node complete with `accuracy < 0.5` | `wrong_answer` | Adventure map flow |

---

## 5. Screenshot Vision Flow

### Design

Event-triggered only. No continuous streaming. Cost-viable at session volume.

```
1. Server detects meaningful event (correct_answer, mastery_unlock)
2. Server includes { requestScreenshot: true } in companion_event payload
3. Client receives event, calls captureScreenshot()
4. captureScreenshot():
   - If raw <canvas> element exists: canvas.toDataURL("image/jpeg", 0.7)
   - If React DOM only: capture WorldBackground <img> src as proxy
   - If game iframe active: use text state proxy (game posts result data)
5. Client sends screenshot back:
   - Adventure map: includes in next POST request body
   - Voice session: sends { type: "screenshot", data: base64 } on WebSocket
6. Server attaches to Claude context for next turn
```

### "What do you see?" Interaction

When a child says "Elli, what do you see?" during a voice session:
1. STT transcribes the utterance (existing pipeline)
2. The next Claude turn includes the most recent screenshot in context
3. Claude responds with visual awareness ("I see you're on the bubble pop node!")
4. Zero new Claude calls -- the screenshot piggybacks on the existing turn

This requires no new STT, no new Claude stream, no new ElevenLabs call. The screenshot is injected as a user message image attachment in the existing conversation history.

### Iframe Cross-Origin Limitation

Games in iframes (`web/public/games/*.html`) are same-origin in this codebase, so `canvas.toDataURL` works on game canvases. If a game ever moves cross-origin, fall back to the text state proxy: the game already posts `NodeResult` via `postMessage`, which contains accuracy, completion, and words attempted. That text state is sufficient for Claude's context.

---

## 6. VRM Animation Loop

### Three.js Scene Setup

```
Scene
+-- AmbientLight (intensity: 0.6)
+-- DirectionalLight (intensity: 0.8, from above-right)
+-- VRM model (loaded via GLTFLoader + VRMLoaderPlugin)
+-- PerspectiveCamera (positioned to frame upper body)

Renderer: WebGLRenderer, alpha: true (transparent background)
Canvas: position absolute, inset 0, z-index 10, pointer-events none
```

### Animation Frame (runs every requestAnimationFrame)

```
function animate(deltaTime):
  1. vrm.update(deltaTime)                    // three-vrm internal update
  2. updateMouthSync(analyser, vrm)           // audio amplitude -> aa blend shape
  3. updateIdleBehavior(deltaTime, profile)   // random moments, breathing
  4. updateLookAt(activeNodePosition)          // gaze follows hovered node
  5. updateExpressionDecay(deltaTime)         // fade expressions back to neutral
  6. renderer.render(scene, camera)
```

### Expression System

Companion events trigger VRM expressions. The sensitivity dial scales the expression weight. Expressions decay back to neutral over time.

```
On companion_event received:
  trigger = event.payload.trigger
  sensitivity = profile.companion.sensitivity[trigger]
  if Math.random() < sensitivity:
    expressionName = TRIGGER_EXPRESSION_MAP[trigger]
    vrm.expressionManager.setValue(expressionName, 1.0)
    schedule decay: lerp from 1.0 -> 0.0 over 2000ms
```

Trigger-to-expression mapping:

| Trigger | VRM Expression | Duration |
|---------|---------------|----------|
| `session_start` | `happy` | 3000ms |
| `correct_answer` | `happy` | 2000ms |
| `wrong_answer` | `sad` | 1500ms |
| `mastery_unlock` | `surprised` | 3000ms |
| `session_end` | `happy` | 2000ms |
| `idle_too_long` | thinking pose | 2000ms |

### VRM Expression Requirements (Conflict 2 Resolution)

Standard VRM 1.0 expressions: `happy`, `angry`, `sad`, `relaxed`, `surprised`, `aa`, `ih`, `ou`, `ee`, `oh`, `blink`, `blinkLeft`, `blinkRight`.

The brief requires `["happy", "sad", "thinking", "neutral", "surprised"]`. Two of these are not standard blend shapes:

- **"neutral"** = all expression weights at 0. This is the VRM default rest pose. No blend shape needed. Validation does not check for it.
- **"thinking"** = not a face blend shape. Implemented as a **pose animation**: slight head tilt via `head` bone rotation (15 degrees on Z axis) + `lookAt` target shifted upward. This is behavioral, not a face expression.

**VRM validation on load checks for:**
- Required blend shapes: `["happy", "sad", "surprised"]`
- Required bones: `["head", "leftHand", "rightHand", "spine"]`
- Mouth sync blend shape: `["aa"]` (for amplitude-driven lip movement)

Missing any required blend shape or bone throws a descriptive error. Silent failures are prohibited per ARCHITECTURE.md.

---

## 7. Idle Behavior -- Three Layers

All three layers run simultaneously on every animation frame.

### Layer 1: VRM Built-in (no code needed)
- Breathing animation (subtle spine/chest bone oscillation)
- Eye blink every 3-5 seconds (VRM `blink` expression auto-driven by three-vrm)

three-vrm handles both of these automatically when `vrm.update(deltaTime)` is called.

### Layer 2: Spatial Awareness (Phase 0.5)
- `vrm.lookAt.target` set to a `THREE.Object3D` positioned at the currently hovered/active node
- Node positions come from `PathCurve` layout (percentage-based, converted to screen pixels, then projected to Three.js world coordinates)
- When no node is hovered: lookAt target drifts slowly toward screen center
- Uses three-vrm `VRMLookAt` -- approximately 2 lines to set target

### Layer 3: Random Unpredictable Moments (Phase 0.5)
- Every `idleFrequency_ms`, roll `Math.random()` against `randomMomentProbability`
- If hit: fire a random behavior from `["wave", "lookAround", "headTilt", "surprised"]`
- Each behavior is a short bone animation (500-1500ms)
- Variable reward mechanic: child never knows when the companion will do something
- Driven entirely by profile dials, not hardcoded timing

```
idleTimer += deltaTime
if idleTimer >= profile.companion.idleFrequency_ms:
  idleTimer = 0
  if Math.random() < profile.companion.randomMomentProbability:
    playRandomIdleMoment()
```

---

## 8. Mouth Sync

### Architecture

ElevenLabs audio arrives as PCM 16-bit mono @ 24kHz. The existing `useSession.ts` plays it via `AudioContext` -> `BufferSource` -> `destination`. For mouth sync, an `AnalyserNode` is inserted into this chain.

```
Before (existing):
  BufferSource -> AudioContext.destination

After (with companion):
  BufferSource -> AnalyserNode -> AudioContext.destination
```

### Shared AnalyserNode Pattern

A module-level ref (same pattern as the existing `gameIframeRef` in `Canvas.tsx`) exposes the `AnalyserNode` to CompanionLayer without prop drilling.

File: `web/src/utils/audioAnalyser.ts`

```typescript
export const audioAnalyserRef: { current: AnalyserNode | null } = { current: null };
```

- `useSession.ts` creates the AnalyserNode when the playback AudioContext initializes, stores it in `audioAnalyserRef.current`, and routes audio through it.
- `CompanionLayer` reads `audioAnalyserRef.current` on each animation frame.

### Per-Frame Mouth Update

```
function updateMouthSync(analyser, vrm):
  if !analyser: return                       // no audio playing
  const data = new Uint8Array(analyser.fftSize)
  analyser.getByteTimeDomainData(data)
  
  // Compute RMS amplitude (0.0 - 1.0)
  let sum = 0
  for byte in data:
    const sample = (byte - 128) / 128
    sum += sample * sample
  const rms = Math.sqrt(sum / data.length)
  
  // Scale to blend shape weight with smoothing
  const weight = Math.min(1.0, rms * 3.0)    // amplify for visible movement
  const smoothed = lerp(previousWeight, weight, 0.3)
  vrm.expressionManager.setValue("aa", smoothed)
```

This is amplitude-based lip sync, not phoneme-based. It produces convincing "talking" movement for a character model. Phoneme-based viseme solving is an explicit non-goal for Phase 0.5.

### Adventure Map Flow

The adventure map currently has no audio playback. `audioAnalyserRef.current` is `null` during map navigation. Mouth sync only activates when:
1. A voice session is active (legacy flow)
2. Event-driven TTS fires during the map experience (future phase)

When the analyser ref is null, `updateMouthSync` is a no-op. The VRM mouth stays in rest position.

---

## 9. Toggle Behavior

Both child and parent can toggle the companion off. Toggle state is session-only (`toggledOff` on the companion config), resets to `false` each session.

When toggled off:
- Three.js canvas is hidden (`display: none`, not unmounted -- preserves WebGL context)
- No companion events processed
- No expressions triggered
- No screenshots captured
- No audio analysis
- Idle timers pause
- The toggle button remains visible in the UI

Toggle is a single React state boolean at the App level, passed to CompanionLayer. CompanionLayer short-circuits its entire animation loop when `toggledOff === true`.

---

## 10. Branch-Agnostic Contract

The companion system works regardless of which pipeline branch is active.

| Concern | Adventure map branch | Pipecat branch (if revived) | Contract |
|---------|---------------------|---------------------------|----------|
| Event delivery | REST response payload | WebSocket or REST | `CompanionEvent[]` array |
| Audio for mouth sync | No audio in map flow | Audio via Pipecat TTS | `audioAnalyserRef` (null when no audio) |
| Screenshot capture | React DOM proxy | Same | `captureScreenshot()` function |
| Profile delivery | `GET /api/profile/:childId` | Same endpoint | `ChildProfile.companion` |
| VRM model URL | From profile | From profile | `profile.companion.vrmUrl` |

The CompanionLayer imports nothing from `session-manager.ts`, nothing from `map-coordinator.ts`, nothing from `ws-tts-bridge.ts`. It receives data through props and the shared analyser ref. The server pipeline that feeds it is invisible to it.

---

## 11. Phase Roadmap

### Phase 0.5 -- Body + Vision (current)

**Gate:** Elli appears on screen, reacts to correct answer with happy expression, mouth moves when ElevenLabs audio plays, eyes follow active node, random idle moments fire. Sample VRM model.

Parallel agents:
- Agent 1: VRM rendering (CompanionLayer, Three.js, expressions, idle, mouth sync)
- Agent 2: Server companion event emitter + screenshot pipeline
- Agent 3: Node routing fix (independent)

### Phase 1 -- Spatial Awareness Polish

**Gate:** LookAt smoothly tracks hovered node with configurable speed. Companion "notices" when child hovers a node for >2 seconds (subtle expression change).

Work: Smooth interpolation for lookAt target. Per-node hover detection piped from AdventureMap to CompanionLayer. Configurable lookAt speed dial on profile.

### Phase 2 -- Walking

**Gate:** Companion walks to clicked node using Mixamo walk animation retargeted to VRM. Position interpolates over time. Faces direction of travel.

Work: Mixamo walk/idle animations loaded as `AnimationClip`. Position path follows the PathCurve SVG coordinates projected to Three.js world space. Transition between idle and walk states based on movement.

**Performance gate:** Only build if Phase 1 proves VRM rendering is acceptable on the target machine (iPad, Chromebook, or whatever the children use). If frame rate drops below 30fps with the VRM + map + game iframe, walking is cut.

### Phase 3 -- Accessories

**Gate:** Grok-generated PNG accessory anchors to head bone screen position. Hat follows companion's head when she moves. New accessory = Grok prompt, zero code changes.

Implementation:
1. Read VRM head bone world position via `vrm.humanoid.getBoneNode("head").getWorldPosition()`
2. Project to screen space via `camera.project(worldPos)` -> NDC -> pixel coordinates
3. Position a DOM `<img>` element at those coordinates
4. Update every frame via `requestAnimationFrame`
5. Accessories are PNG URLs stored on `childProfile.companion.accessories[]`
6. Grok generates accessory images from a prompt; the URL is stored in profile

This is a DOM overlay, not a Three.js attachment. Simpler, more flexible, and avoids modifying the VRM model.

---

## 12. What Gets Deleted When Companion Is Stable

Once Phase 0.5 is verified with real children:

| File/Code | Status | Condition |
|-----------|--------|-----------|
| `CompanionStrip.tsx` emoji avatar | Replace with VRM viewport | Phase 0.5 stable |
| Hardcoded emoji in `ChildPicker.tsx` | Replace with VRM thumbnail | Phase 1 stable |
| `COMPANION_DEFAULTS` hardcoded values | Move to per-child config in `learning_profile.json` | Phase 1 stable |
| Sample VRM model | Replace with custom VRM per child | Custom models commissioned |

No existing session pipeline code is deleted by the companion system. The companion is additive -- it renders alongside existing flows. Deletion of legacy voice-only flows is governed by `DELETIONS.md` (TASK-022 in TASKS.md), not by the companion system.

---

## 13. Conflict Log

### Conflict 1: `children.config.json` does not exist

**Brief assumed:** `children.config.json` is the child registry and gains a `vrmUrl` field.
**Reality:** Children are registered via TypeScript constants in `src/companions/loader.ts` and per-child context directories.
**Resolution:** Companion config defaults live in `buildProfile`. No new registry file created. Per-child overrides possible via `learning_profile.json` `companion` section in future phases.
**Law alignment:** Law 1 (single source of truth via `buildProfile`).

### Conflict 2: VRM expressions "thinking" and "neutral" are not standard

**Brief required:** `["happy", "sad", "thinking", "neutral", "surprised"]` as validation targets.
**Reality:** VRM 1.0 standard has `happy`, `sad`, `surprised` but not `thinking` or `neutral`.
**Resolution:** "neutral" = all expressions at weight 0 (default rest pose, no blend shape). "thinking" = pose-based animation (head bone tilt + lookAt shift), not a face blend shape. Validation checks `["happy", "sad", "surprised", "aa"]` only.
**Law alignment:** No law conflict. Fails loud on missing required shapes.

### Conflict 3: Adventure map is React DOM, not Canvas 2D

**Brief assumed:** z-index 1 = Canvas 2D map, z-index 2 = Three.js, z-index 3 = React UI.
**Reality:** Map uses WorldBackground (CSS/React), PathCurve (SVG), NodeCards (React positioned divs), framer-motion animations.
**Resolution:** Corrected z-index model in Section 2. Three.js canvas at z-index 10, above map elements (1-6) but below game iframe (14). `pointer-events: none` passes clicks through.
**Law alignment:** Law 2 (server owns events, client owns rendering -- Three.js is a rendering concern).

### Conflict 4: Adventure map has no WebSocket for server-push events

**Brief assumed:** Server emits `companion_event` on WebSocket.
**Reality:** Adventure map uses REST polling via `useMapSession`. Voice session uses WebSocket.
**Resolution:** Companion events piggyback on REST response payloads for adventure map flow. Voice session uses native WebSocket `companion_event` message. Client normalizes both into `CompanionEvent[]`. CompanionLayer is transport-agnostic.
**Law alignment:** Law 3 (dynamic over static -- transport is an implementation detail, not a contract).

### Conflict 5: D-008 "no STT during map" vs "child asks Elli what do you see"

**Brief implied:** Child can ask Elli about screenshots during map play.
**D-008 original:** No STT during adventure map. Event-driven TTS only.
**D-008 amendment (April 12):** Child can address Elli directly, STT picks it up, Claude responds -- one exchange, then back to flow.
**Resolution:** No conflict. The amendment resolves it. Screenshot + "what do you see" is Phase 1+ (requires STT active during map). Phase 0.5 captures screenshots and attaches to context but does not enable the conversational ask flow.

---

*End of COMPANION_DESIGN.md. Implementation follows COMPANION_TASKS.md.*
