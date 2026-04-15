# Companion API — task index (COMPANION-API-001 … 010)

Atomic tickets aligned with `TASKS.md` style. **001–008** are implemented in-tree; **009–010** are follow-ups.

---

COMPANION-API-001: Contract + registry barrel  
Phase: companion-api  
Branch: feat/companion-vrm (or current companion branch)  
Depends on: none  
Context: Introduce shared types and a single `COMPANION_CAPABILITIES` map so server, web, and prompts agree on command shape and metadata.  
Read first:

- `src/shared/companions/companionContract.ts`
- `src/shared/companions/registry/index.ts`
  Touch:
- `src/shared/companions/companionContract.ts`
- `src/shared/companions/registry/index.ts`
- `src/tests/test-companion-api-registry.ts`
- `vitest.config.ts` (include tests if needed)
  Tests:
- Registry exports all expected capability `type` keys
- Each registered definition has non-empty `description` and valid `phase`
  Done when:
- `npm run build` green
- `npx vitest run` green  Delete: duplicate type definitions for the same concept  
  Est: 45m

---

COMPANION-API-002: Capability modules (emote, camera, animate, move)  
Phase: companion-api  
Branch: (same)  
Depends on: COMPANION-API-001  
Context: One `*.capability.ts` per capability with Zod schemas, defaults, and diag metadata. Emote uses shared `companionEmotes`; intensity optional with default.  
Read first:

- `src/shared/companionEmotes.ts`
- `src/shared/companions/registry/emote.capability.ts` (pattern)
  Touch:
- `src/shared/companions/registry/*.capability.ts`
- `src/shared/companions/registry/index.ts`
  Tests:
- Registry tests include new types; validation tests cover each payload (see COMPANION-API-006)
  Done when:
- All capability files parse and register; build green  Delete: inline Zod duplicated outside registry  
  Est: 1h

---

COMPANION-API-003: `companionAct` tool  
Phase: companion-api  
Depends on: COMPANION-API-001  
Context: Anthropic tool with root shape `{ type, payload }` delegating to a host callback.  
Read first:

- `src/agents/tools/companionAct.ts`
- `src/agents/tools/six-tools-apply.ts` (harness)
  Touch:
- `src/agents/tools/companionAct.ts`
- `src/agents/elli/tools/generateToolDocs.ts`
- `src/tests/test-six-tools.ts`
  Tests:
- Tool executes through memory harness with expected host args
  Done when:
- Tool appears in docs list and six-tools tests pass
  Delete: none  
  Est: 30m

---

COMPANION-API-004: Session manager wiring + WebSocket  
Phase: companion-api  
Depends on: COMPANION-API-003, COMPANION-API-006  
Context: Add tool to agent toolkit; validate; emit `companion_command` to client; normalize `companion_act` → `companionAct`; map session reuse for broadcast.  
Read first:

- `src/server/session-manager.ts` (`hostCompanionAct`, `buildAgentToolkit`)
- `src/server/session-type-registry.ts`
  Touch:
- `src/server/session-manager.ts`
- `src/server/session-type-registry.ts`
  Tests:
- Existing session/integration tests still pass; add narrow unit test if hook surface allows without heavy mock
  Done when:
- Voice and map clients receive validated commands only
  Delete: none  
  Est: 1h

---

COMPANION-API-005: Prompt markdown generation  
Phase: companion-api  
Depends on: COMPANION-API-002  
Context: `generateCompanionCapabilities({ maxPhase })` appended wherever canvas/capability manifests are injected (including reading and diag). Default `maxPhase` excludes phase-1-only tools from prompts until explicitly raised.  
Read first:

- `src/shared/companions/generateCompanionCapabilities.ts`
- `src/agents/prompts.ts`
  Touch:
- `src/shared/companions/generateCompanionCapabilities.ts`
- `src/agents/prompts.ts`
- `src/tests/test-companion-generate-capabilities.ts`
  Tests:
- Default markdown mentions `companionAct` and expected capability headings; phase filter omits animate/move when `maxPhase` is 0.5
  Done when:
- Tests green; prompts include generated block
  Delete: hand-maintained duplicate capability bullets  
  Est: 45m

---

COMPANION-API-006: `validateCompanionCommand`  
Phase: companion-api  
Depends on: COMPANION-API-002  
Context: Central validation; returns `null` on error; logs with plain ASCII prefixes (no emoji in validate path).  
Read first:

- `src/shared/companions/validateCompanionCommand.ts`
  Touch:
- `src/shared/companions/validateCompanionCommand.ts`
- `src/tests/test-companion-validate.ts`
  Tests:
- Unknown type → null
- Invalid payload → null
- Valid emote/camera/minimal animate/move → command with `apiVersion`, `childId`, `timestamp`
  Done when:
- `npx vitest run` green
  Delete: ad-hoc validation in callers  
  Est: 45m

---

COMPANION-API-007: Web client — hooks + CompanionLayer  
Phase: companion-api  
Depends on: COMPANION-API-004  
Context: `useSession` / `useMapSession` handle `companion_command`; `App` merges streams; `CompanionLayer` applies emote + camera with dedupe; optional camera helpers.  
Read first:

- `web/src/hooks/useSession.ts`
- `web/src/components/CompanionLayer.tsx`
  Touch:
- `web/src/hooks/useSession.ts`
- `web/src/hooks/useMapSession.ts`
- `web/src/App.tsx`
- `web/src/components/CompanionLayer.tsx`
- `web/src/utils/companionCamera.ts` (if present)
  Tests:
- Prefer Playwright or unit tests on reducers if present; otherwise manual QA documented
  Done when:
- No throw on unknown types; emote/camera visibly apply in session
  Delete: duplicate WS handler logic  
  Est: 1.5h

---

COMPANION-API-008: Companion diag + npm script  
Phase: companion-api  
Depends on: COMPANION-API-007  
Context: `VITE_COMPANION_DIAG=true` serves `CompanionDiag`; npm script builds web with flag and launches kiosk.  
Read first:

- `web/src/components/CompanionDiag.tsx`
- `web/src/App.tsx`
- `package.json`
  Touch:
- `web/src/components/CompanionDiag.tsx`
- `web/src/App.tsx`
- `package.json`
  Tests:
- Manual: run `npm run sunny:mode:diag:companion`, fire sample commands
  Done when:
- Diag loads without full voice session; commands reach layer
  Delete: none  
  Est: 45m

---

COMPANION-API-009: Client implement animate + move  
Phase: companion-api  
Depends on: COMPANION-API-007  
Context: `CompanionLayer` (or scene controller) interprets registry types currently no-op’d; align with VRM / scene graph.  
Read first:

- `src/shared/companions/registry/animate.capability.ts`
- `src/shared/companions/registry/move.capability.ts`
- `web/src/components/CompanionLayer.tsx`
  Touch:
- `web/src/components/CompanionLayer.tsx` (+ any animation runtime)
- Tests under `web/` or `src/tests` for pure logic
  Tests:
- Dedupe and state: no double-play; guard max concurrent animations if required
  Done when:
- Diag and live tool can drive animate/move with visible effect
  Delete: placeholder stubs in client  
  Est: 2–4h

---

COMPANION-API-010: Hardening + VRM migration cleanup  
Phase: companion-api  
Depends on: COMPANION-API-009  
Context: Remove legacy duplicate paths; document VRM mapping; tighten logging to project standard if desired; ensure CI and Law 7 gates pass.  
Read first:

- `COMPANION_API_DESIGN.md`
- `AGENTS.md` (logging, tests)
  Touch:
- Dead code removal list from design doc
- `DECISIONS.md` entry if behavior changed
  Tests:
- Full `npm run build`, `npx vitest run`, `web` build
  Done when:
- No duplicate companion contracts; migration notes complete
  Delete: listed legacy blocks  
  Est: 1–2h
