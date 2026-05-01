# Sunny Game Attempt Contract

Every assessable game interaction must emit one normalized attempt event.

This applies to hardcoded games and AI-generated games. If a game asks a child
to spell, solve, choose, read, type, count, or answer, the game must report the
attempt after grading it.

HTML iframe games report through `_contract.js`. React flow-state games report
through `createFlowGameEvents().reportAttempt()` or an explicit server-side
completion handler that records every attempted item.

Companion events and attempt events are separate:

- `fireCompanionEvent()` drives encouragement, reactions, and animation.
- `fireAttemptEvent()` drives SM-2, diagnostics, error patterns, and future
  assignment selection.

## Required Call

```js
fireAttemptEvent({
  domain: "spelling",
  target: "blister",
  attemptedValue: "blster",
  correct: false,
  quality: 1,
  scaffoldLevel: 0
});
```

## Required Fields

- `domain`: `"spelling"`, `"math"`, `"reading"`, `"history"`, `"clocks"`, or
  `"segmentation"`
- `target`: the expected word, answer, prompt, or skill item
- `correct`: boolean
- `quality`: SM-2 quality score from `0` to `5`
- `scaffoldLevel`: support level from `0` to `4`

## Optional But Important Fields

- `attemptedValue`: what the child actually produced. This is mandatory for
  spelling diagnostics whenever the child types or speaks an answer.
- `responseTimeMs`: response time in milliseconds.

## Product Rule

A game is not diagnostically valid if it grades an assessable interaction but
does not call `fireAttemptEvent()` for that interaction.

When `attemptedValue` is missing, Sunny can still update practice scheduling,
but it cannot classify the reason for an error.

Legacy baseline games may declare `sunny-attempt-contract-server-side` only when
the server records each attempted item from the completion payload. New
generated games must use `fireAttemptEvent()`.
