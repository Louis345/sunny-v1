# Companion capability API — design

This document describes the **companion capability registry**, how commands flow from Claude to the browser, and how to extend or retire pieces. Implementation lives under `src/shared/companions/` and `web/src/components/CompanionLayer.tsx`.

## Goals

- **Single contract** for command shape and capability metadata (`CompanionCommand`, `CapabilityDefinition`).
- **Server validates** every outbound command; the client only applies known, safe payloads.
- **Prompts stay in sync** with the registry via generated markdown (`generateCompanionCapabilities`).
- **Diagnostics** can fire the same commands as the model (`CompanionDiag`, `source: "diag"`).
- **`expressCompanion` / `companion_event`** remain the existing game/map path; this API is additive for **tool-driven** companion control.

## Layout

| Area | Role |
|------|------|
| `src/shared/companions/companionContract.ts` | Types: `CapabilityDefinition`, `CompanionCommand`, `DiagControl`, phases, API version. |
| `src/shared/companions/registry/*.capability.ts` | One file per capability: Zod `payloadSchema`, defaults, prompt copy, diag UI hints. |
| `src/shared/companions/registry/index.ts` | Barrel: builds `COMPANION_CAPABILITIES` map. |
| `src/shared/companions/validateCompanionCommand.ts` | Validates `type` + `payload` against registry; returns `CompanionCommand` or `null`. |
| `src/shared/companions/generateCompanionCapabilities.ts` | Markdown for system prompts; filters by `maxPhase` (default **0.5** = emote + camera only in prompts). |
| `src/agents/tools/companionAct.ts` | Claude tool: `{ type, payload }` → host. |
| `src/server/session-manager.ts` | `hostCompanionAct` → validate → `send("companion_command", { command })` (+ map broadcast reuse). |
| `web/src/hooks/useSession.ts`, `useMapSession.ts` | Append validated commands to React state. |
| `web/src/components/CompanionLayer.tsx` | Consumes `companionCommands`; implements **emote** and **camera** (phase 1 animate/move TBD). |
| `web/src/components/CompanionDiag.tsx` | Standalone QA when `VITE_COMPANION_DIAG=true`. |

## Command shape

After validation, a **`CompanionCommand`** includes:

- `apiVersion` (e.g. `"1.0"`)
- `type` (registry key)
- `payload` (plain object, schema-checked)
- `childId`, `timestamp`, `source` (`"claude"` | `"diag"`)

## Phases

`CompanionCapabilityPhase` is **0.5 | 1 | 2 | 3**. Prompt generation includes capabilities with `phase <= maxPhase`. Default prompt `maxPhase` is **0.5** so **animate** and **move** stay out of the model instructions until you raise `maxPhase` (e.g. to `1`) where prompts are built.

## Validation flow

1. Tool or diag builds `{ type, payload }`.
2. `validateCompanionCommand` looks up `type` in `COMPANION_CAPABILITIES`, parses with that capability’s `payloadSchema`, merges defaults as needed.
3. On failure: log (ASCII-only server logs in validate path), return `null`; `hostCompanionAct` returns an error result to the tool.
4. On success: build `CompanionCommand`, send over voice WS and map WS as `companion_command`.

## Wire protocol

- Message: `companion_command` with `{ command: CompanionCommand }`.
- Legacy normalization: stream/tool may emit `companion_act`; session layer normalizes to **`companionAct`**.

## Client behavior

- Hooks accumulate commands; `App` can merge voice + map streams.
- `CompanionLayer` dedupes by a stable key per command to avoid double application when the same command is replayed.
- **Implemented:** `emote`, `camera`. **Registered but not yet animated in layer:** `animate`, `move` (safe to ignore until implemented).

## Adding a capability

1. Add `src/shared/companions/registry/<name>.capability.ts` exporting a `CapabilityDefinition`.
2. Register it in `registry/index.ts`.
3. Extend `CompanionLayer` (or another consumer) if the browser should react.
4. Add tests: registry listing, validation happy/ sad paths, prompt generation if public-facing.
5. Optionally extend `CompanionDiag` controls via `diagControls` / `diagLabel`.

## VRM / avatar swap (future)

Keep **payloads generic** (emotion id, camera preset, clip name, world position). A future VRM loader should map those abstract intents to the active rig; avoid baking file paths or Three.js specifics into the contract where possible.

## Deletion / migration targets (when stabilizing)

- Any ad-hoc companion string paths duplicated outside the registry.
- Dead experimental hooks that bypass `validateCompanionCommand`.
- Prompt fragments that duplicate capability docs instead of calling `generateCompanionCapabilities`.

## Related npm script

- `npm run sunny:mode:diag:companion` — builds web with `VITE_COMPANION_DIAG=true` and launches kiosk script for companion QA.
