# Adding a New Game to Project Sunny

## The contract

Every game must include `_contract.js` in its `<head>`:

```html
<script src="_contract.js"></script>
```

Then use the four GameBridge functions:

### 1. GameBridge.init(callback)

Optional. Called when you want to react to `GAME_PARAMS` from the URL or to a parent `postMessage({ type: "start", ... })`. The parent also receives `ready` after the iframe loads (`DOMContentLoaded`).

```javascript
GameBridge.init(function (params) {
  var words = params.words || [];
  var difficulty = params.difficulty || 2;
  var childId = params.childId || "";
  // start your game here
});
```

### 2. GameBridge.complete(result)

Call exactly once when the game ends. This notifies the adventure map (`node_complete`) and the voice session path (`game_complete`) with the same result fields.

```javascript
GameBridge.complete({
  completed: true, // required
  accuracy: 0.85, // required (0-1)
  xpEarned: 30, // required
  timeSpent_ms: 45000, // required
  wordsAttempted: 1, // optional
  wordsCorrect: ["farmer"], // optional
  wordsStruggled: [], // optional
  flaggedWords: [], // optional
});
```

### 3. GameBridge.reportState(progress)

Call whenever meaningful state changes. Plain English. Elli reads this (via `game_state_update` on the map session).

```javascript
GameBridge.reportState('Spelling "farmer" — 2 blanks left: F _ R M _ R');
GameBridge.reportState('Wrong answer — tried "farmar", trying again');
GameBridge.reportState('Round 2 — fewer hints now');
```

### 4. GameBridge.fireEvent(trigger)

Call on key moments for companion reactions.

```javascript
GameBridge.fireEvent("correct_answer"); // Elli celebrates
GameBridge.fireEvent("wrong_answer"); // Elli encourages
GameBridge.fireEvent("session_complete"); // Elli goes wild
```

## Dyslexia mode

```javascript
if (params.childId === "ila" || params.dyslexiaMode) {
  // cream background, Lexend font, larger tiles
}
```

## That's it

Drop the HTML file in `web/public/games/`. It auto-discovers. No server changes needed for listing. Read this file, wire the four functions, done.
