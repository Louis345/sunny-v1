# Companion expression via `expressCompanion` tool (revised)

## Locked product decisions (do not deviate)

1. **Payload shape:** `CompanionEventPayload` uses optional `trigger` and optional `emote`. Map/game events send `trigger` only; Claude `expressCompanion` sends `emote` + optional `intensity` only (no dummy `trigger`).

2. **Merge / dedupe in App:** Combine voice-session `companionEvents` with map `mapSession.companionEvents`. Deduplicate with key `timestamp|childId|emote|trigger` (empty string for missing fields), then **sort by `timestamp`** so order matches real time.

3. **Expression pipeline order (CompanionLayer RAF):** Process **emote-backed payloads first** (`pickEmotesToApply` + `applyAcceptedEmote`), then **trigger-backed** (`pickTriggersToApply` + `applyAcceptedTrigger`). `pickTriggersToApply` **skips** any payload where `emote` is set.

4. **Emote → VRM mapping (blend / pose):**
   - `happy` → face `happy`, duration 2000 ms, initial `faceWeight = intensity`
   - `sad` → face `sad`, duration 1500 ms, `faceWeight = intensity`
   - `surprised` → face `surprised`, duration 2000 ms, `faceWeight = intensity`
   - `celebrating` → face `surprised`, duration 2500 ms, `faceWeight = intensity`
   - `thinking` → thinking head-tilt path (no face blend), duration 2000 ms
   - `neutral` → clear expression state immediately (no face, no thinking)
   - `wink` → face `happy`, duration 600 ms, `faceWeight = intensity`

---

## Superseded approach

Do **not** inject companion instructions via `generateCompanionCapabilities` / inline JSON in the assistant text stream. Claude streams to ElevenLabs token-by-token; any JSON tail would be spoken.

## Target approach

Use the **same tool pattern** as `canvasShow` and `sessionLog`: Vercel AI SDK `tool()` + Zod `inputSchema`, wired through **`createSixTools(host)`** and **`SessionManager.buildAgentToolkit()``.

Reference implementation: [`src/agents/tools/six-tools.ts`](src/agents/tools/six-tools.ts) (`SixToolsHost`, `sessionLog` tool ~L319+, `createSixTools` return object). Host methods are implemented on [`SessionManager`](src/server/session-manager.ts) (~L3187+ `createSixTools({ canvasShow: (a) => this.hostCanvasShow(a), ... })`).

## Tool contract (match user schema; implement with Zod)

- **Exported tool name:** `expressCompanion` (camelCase like other six-tools; SDK may surface `express_companion` — normalize in `onStepFinish` like `session_log` → `sessionLog`).
- **Description:** Make the companion react expressively. Use this to show emotion intentionally alongside speech. Never put emotion in words — show it through Elli's body.
- **Input:** Zod object:
  - `emote`: `z.enum([...])` matching shared `COMPANION_EMOTES` keys
  - `intensity`: `z.number().min(0).max(1).optional()` — default **0.8** in `execute` / host when omitted
- **Required:** only `emote`.

**Single source for enum keys:** [`src/shared/companionEmotes.ts`](src/shared/companionEmotes.ts) — imported by `six-tools.ts`, web, and server.

## Server: host + broadcast

1. Extend **`SixToolsHost`** with `expressCompanion(args: Record<string, unknown>): Promise<Record<string, unknown>>`.
2. Add **`expressCompanion`** `tool()` inside **`createSixTools`**.
3. **`SessionManager.buildAgentToolkit`:** pass `expressCompanion: (a) => this.hostExpressCompanion(a)` into **`createSixTools`** (single object — all branches use same `six`).
4. **`hostExpressCompanion`:** validate `emote` with `isCompanionEmote`; clamp `intensity`; build payload **without** `trigger`; `this.send("companion_event", { payload })`; call **exported** `broadcastCompanionEventToMapChild(childId, envelope)`.
5. **`onStepFinish`:** `express_companion` → `expressCompanion`.
6. **`SixToolsMemoryHarness`:** stub `expressCompanion`.

## Web

- **`useMapSession` `isCompanionEvent`:** accept payload if `(trigger || emote)` and `childId` and `timestamp`.
- **`useSession`:** handle `companion_event`, append payload; clear on `session_started` / `resetToPicker`.
- **`App.tsx`:** merge voice + map arrays, dedupe, sort by timestamp → `CompanionLayer`.
- **`companionExpressions`:** `pickEmotesToApply`, `applyAcceptedEmote`; **`CompanionLayer`** runs emotes before triggers.

## Verification

- `npm run build`
- `npm run test`

## Files touched

See implementation; expect `companionEmotes.ts`, `companionTypes.ts`, `six-tools.ts`, `six-tools-apply.ts`, `map-coordinator.ts` (export), `session-manager.ts`, `useMapSession.ts`, `useSession.ts`, `App.tsx`, `companionExpressions.ts`, `CompanionLayer.tsx`, tests.
