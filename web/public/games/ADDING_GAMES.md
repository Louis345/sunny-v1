# Adding a New Game to Project Sunny

## The three game types

1. **Flow state games** — React components, live in app shell  
   Examples: KaraokeReadingCanvas, WordRadar  
   STT: uses shell's `interimTranscript` prop  
   No GameBridge needed

2. **Low-level learning games** — HTML files, iframe pattern  
   Examples: spell-check.html, wheel-of-fortune.html, wordle.html  
   Location: `web/public/games/`  
   Uses: `_contract.js` + GameBridge

3. **Pure dopamine games** — HTML files, same iframe pattern  
   Examples: space-invaders.html, asteroid.html

## Checklist for adding an HTML game

### The HTML file
- [ ] Copy `_contract.js` script tag from `spell-check.html` line 1
- [ ] Read `GAME_PARAMS` at top of script (never hardcode values)
- [ ] Call `sendNodeComplete()` on game end
- [ ] Call `fireCompanionEvent()` on key moments
- [ ] Call `fireAttemptEvent()` once for every assessable interaction
- [ ] Report vital signs: attention, mood/frustration, idle/reengagement signals
- [ ] Dyslexia mode: check `childId === "ila" || dyslexiaMode === true`

### Platform registration (4 files, always all 4)
- [ ] `src/shared/adventureTypes.ts` — add to `NodeType` union + `ALL_NODE_TYPES`
- [ ] `src/shared/nodeRegistry.ts` — add iframe handler with `GAME_PARAMS`
- [ ] `src/server/map-coordinator.ts` — add `NODE_THUMBNAIL_PROMPTS` entry; add to `isWordDrivenHomeworkNodeType` if word-driven
- [ ] `src/agents/designer/designer.ts` — add to thumbnail prompts `Record`

### Diag test button (always required)
- [ ] `web/src/components/DiagPanel.tsx` — add `onTestYourGame` prop + button
- [ ] `web/src/App.tsx` — add to `diagFlowGameOpen` type union; add branch in `openDiagFlowGame()`; add `diagYourGameUrl` state; add `FlowGameOverlay` render block

## CRITICAL: iframe overlay sizing

Every HTML game MUST use this exact iframe pattern in `App.tsx`.  
No exceptions. No `max-width`. No fixed height. `FlowGameOverlay` handles the fullscreen chrome.

**CORRECT:**

```tsx
{diagFlowGameOpen === "your-game" && diagYourGameUrl ? (
  <FlowGameOverlay onBack={closeDiagFlowGame}>
    <iframe
      title="Your Game"
      src={diagYourGameUrl}
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  </FlowGameOverlay>
) : null}
```

**WRONG** (do not copy from old Wordle implementation):

```tsx
<iframe
  className="mx-auto block h-[min(85vh,720px)] w-full max-w-[540px]"
/>
```

## Tests (always write first)
- `ALL_NODE_TYPES` includes your new type
- `NODE_THUMBNAIL_PROMPTS["your-game"]` is defined
- `isWordDrivenHomeworkNodeType("your-game")` correct
- nodeRegistry builds correct iframe URL
- your-game `NOT` in `BANDIT_POOL` (unless it should be)

---

## GameBridge — Companion State Contract

Every game MUST follow this contract so the companion always
knows what the child is doing without needing a screenshot.

Sunny treats games as care-plan interventions. A game is viable adaptive
content only if it can report:

- learning attempts, when the child answers or produces something assessable
- vital signs, especially attention and mood/frustration signals
- completion evidence, including time on task

Pure dopamine games may have no assessable attempts, but they still need vital
sign evidence: time on task, abandonment, reengagement, and obvious frustration
or flow signals.

Include `_contract.js` in your `<head>`:

```html
<script src="_contract.js"></script>
```

### 1. GameBridge.init(callback)

Optional. Called on `GAME_PARAMS` from the URL or a parent `postMessage({ type: "start", ... })`. The parent also receives `ready` after the iframe loads.

```javascript
GameBridge.init(function (params) {
  var words = params.words || [];
  var difficulty = params.difficulty || 2;
  var childId = params.childId || "";
  // start your game here
});
```

### 2. GameBridge.complete(result)

Call exactly once when the game ends. This notifies the adventure map (`node_complete`) and the voice session path (`game_complete`).

```javascript
GameBridge.complete({
  completed: true,    // required
  accuracy: 0.85,     // required (0-1)
  xpEarned: 30,       // required
  timeSpent_ms: 45000, // required
  wordsAttempted: 1,  // optional
  wordsCorrect: ["farmer"],  // optional
  wordsStruggled: [],        // optional
  flaggedWords: [],          // optional
});
```

### 3. GameBridge.reportState(progress, extras) — REQUIRED on every interaction

Call whenever meaningful state changes: a letter tap, wrong answer, round start, score change, or phase change.

Include structured `extras` so the companion understands state without a screenshot:

```javascript
GameBridge.reportState('Spelling "farmer" — 2 blanks left', {
  phase: "playing",       // "idle" | "playing" | "feedback" | "complete"
  currentWord: "farmer",  // target word or problem
  itemIndex: 2,           // current item (0-based)
  totalItems: 5,          // total items in session
  correct: true,          // was last action correct?
  score: 350,             // current score
  boardState: "F A _ M E R", // revealed tile state (if applicable)
});
```

Minimum required: the `progress` string. Structured extras give the companion richer context.

### 4. GameBridge.startHeartbeat(getState, getExtras) — REQUIRED during active play

Start a heartbeat so the companion stays aware even when the child is silent.

```javascript
var hb = GameBridge.startHeartbeat(
  function() { return 'Spelling "' + currentWord + '"'; },
  function() { return { phase: "playing", currentWord: currentWord }; }
);
// On game end:
clearInterval(hb);
```

The heartbeat fires every 5 seconds and calls `reportState` automatically.

### 5. GameBridge.fireEvent(trigger) — on key moments

```javascript
GameBridge.fireEvent("correct_answer");   // companion celebrates
GameBridge.fireEvent("wrong_answer");     // companion encourages
GameBridge.fireEvent("session_complete"); // companion goes wild
```

These events now reach the companion on both the map path AND the voice session path.

### 6. GameBridge.reportAttempt(attempt) — REQUIRED for assessment

Call once after every graded interaction. This is the learning-data contract;
see `GAME_ATTEMPT_CONTRACT.md`.

```javascript
fireAttemptEvent({
  domain: "spelling",
  target: "farmer",
  attemptedValue: childTypedValue,
  correct: true,
  quality: 5,
  scaffoldLevel: 0,
});
```

### 7. Vital Signs — REQUIRED for adaptive care plans

Every game must make attention visible to Sunny. The first version can be
simple: include vital-sign fields inside `reportState()` extras and
`GameBridge.complete()`.

```javascript
GameBridge.reportState("Round 2 — child is still engaged", {
  phase: "playing",
  currentWord: currentWord,
  activeDuration_ms: Date.now() - startedAt,
  idleEvents: idleCount,
  reengagements: reengagementCount,
  frustrationSignals: frustrationSignals,
  flowSignals: flowSignals
});
```

Completion payloads should include the same summary:

```javascript
GameBridge.complete({
  completed: true,
  accuracy: 0.85,
  xpEarned: 30,
  timeSpent_ms: Date.now() - startedAt,
  vitalSigns: {
    activeDuration_ms: activeDurationMs,
    idleEvents: idleCount,
    abandonments: abandoned ? 1 : 0,
    reengagements: reengagementCount,
    frustrationSignals: frustrationSignals,
    flowSignals: flowSignals
  }
});
```

Minimum viable vital signs:

- `activeDuration_ms`: meaningful time on task
- `idleEvents`: count of notable inactivity periods
- `abandonments`: `0` or `1` for the activity
- `reengagements`: count of returns after idle/help/backtracking
- `frustrationSignals`: short strings, e.g. `"rapid_wrong_taps"`, `"quit_attempt"`
- `flowSignals`: short strings, e.g. `"self_corrected"`, `"completed_streak"`

If a game cannot measure vital signs, it can still be a toy, but it should not
be used as adaptive learning content or AI-generated quest content.

---

## Voice path vs map path

Both paths now work for all event types:
- `game_state_update` → queued for next Claude turn (via `injectGameContext`)
- `companion_event` → forwarded to server; whitelisted triggers (`correct_answer`, `wrong_answer`, etc.) prompt a companion reaction
- `game_complete` → session reconciliation

## What NOT to do

- Do NOT rely on the companion taking a screenshot to understand state
- Do NOT call `reportState` only at round boundaries — call it on every tap
- Do NOT omit structured `extras` — prose strings give weak context to Claude
- Do NOT forget to `clearInterval(hb)` when the game ends
- Do NOT ship a care-plan game that cannot report attention/mood vital signs

---

## Dyslexia mode

```javascript
if (params.childId === "ila" || params.dyslexiaMode) {
  // cream background, Lexend font, larger tiles
}
```

## That's it

Drop the HTML file in `web/public/games/`. It auto-discovers. No server changes needed for listing. Read this file, wire the five functions, done.
