# Companion Fable Evaluation Brief

Date: 2026-06-09
Branch: `codex/companion-latency-presence-lab`
Worktree: `/Users/jamaltaylor/Development/sunny-companion-latency-presence-lab`

## Why This Brief Exists

Sunny's companion video call prototype needs to feel like shared play with a living companion, not a local game with canned audio. A human rejected the experience because it was obvious that the fast `presence` lane had hardcoded responses and lost tic-tac-toe context.

The goal is to ask Claude Fable 5 to solve the product/architecture problem without inheriting the messy conversation history.

Official Anthropic references checked on 2026-06-09:
- Model overview: https://docs.anthropic.com/en/docs/about-claude/models/overview
- API release notes: https://docs.anthropic.com/en/release-notes/api
- Migration guide: https://docs.anthropic.com/en/docs/about-claude/models/migrating-to-claude-4
- Pricing: https://docs.anthropic.com/en/docs/about-claude/pricing

Relevant Fable facts:
- API model id: `claude-fable-5`.
- 1M token context window by default.
- Up to 128k output tokens.
- Always-on adaptive thinking; do not pass `thinking: { "type": "disabled" }`.
- Same Messages API/tool-use pattern as recent Claude models.
- Higher cost than Opus/Sonnet-tier models, so use it for architecture/lab design, not every low-latency child turn.

## Product Goal

Video Chat is an emotional reward surface. The child earns a call with a companion, chats naturally, and can play lightweight games such as tic-tac-toe. The companion should feel like a friend:

- Elli: warm, playful, never teacher-like unless asked for learning help.
- Kefla: challenge energy.
- Matilda: calm/strategic.
- Princess: gentle quest-like.

For games, the product rule is:

> Game rules are local and instant. Companion speech is authored from persona and current context. Local code may handle gestures, board pulses, SFX, and timing, but must not author spoken companion lines.

## Current Human-Rejected Problem

Rejected trace shape based on `trace_20260605t003732_24l31`:

- Spoken game reactions had `aiAuthored:false`.
- Fast presence lane said local hardcoded lines such as `I blocked it.` and `Good game.`
- Active tic-tac-toe board was omitted from some video-call child turns.
- Claude responded with context-loss language like `Ready for another round?` while the current round was still active.
- Latency was lower, but the experience felt fake because authorship and context continuity were broken.

The human caught it by feel before reading code. That is the core lesson: low latency alone is not success.

## Current Branch State

Already implemented and tested on this branch:

- `src/shared/companionLatencyGate.ts`
  - Converts trace packets into latency spans.
  - Fails human review for:
    - spoken presence reactions that are not AI-authored
    - active activity context omitted
    - active game context lost response
    - hardcoded companion game speech
    - stale reactions, missing audio, fallback speech, echo loops, repeated turns
- `src/engine/companionLatencyGate.test.ts`
  - Contains a rejected-session fixture that must fail even when latency is fast.
- `web/src/components/CompanionActivityRuntime.ts`
  - Active activities stay attached to talk turns even when the conversation mode is social/repeat-after.
- `web/src/components/CompanionShowroom.tsx`
  - Removed browser-authored spoken presence responses.
  - Activity reactions go through the existing Claude talk flow.
  - Adds `activityFocus: "foreground" | "background"`.
  - Traces `reactionLane`, `speechSource`, and `aiAuthored:true` for authored activity reactions.
  - Skips hands-free rearm into completed tic-tac-toe rounds.
- `src/server/companionShowroomTalk.ts`
  - Accepts `activityFocus`.
  - Tells Claude when an active game is foreground vs background.
  - Keeps video calls companion-first, not tutor-first.
- `src/server/companionVideoCallTrace.ts`
  - Separates `reactionLane` from `aiAuthored`, so fast presence delivery can still be truthfully authored.
- `src/scripts/runCompanionLatencyLab.ts`
  - Adds `npm run sunny:companion:latency-lab`.
  - Mock mode writes a lab packet and human review report.

Verification already passed:

```bash
npm run build
npm run test
npm run sunny:companion:latency-lab -- --mock
```

Known gap:

- The branch removes hardcoded speech and makes the lab truth-gated, but it does not yet implement the full session-authored reaction pack generated on tic-tac-toe mount and prewarmed through ElevenLabs.

## Architecture Constraints

Do not propose a solution that violates these:

- No hardcoded spoken companion responses for game moments.
- No local spoken fallback for companion game reactions.
- Local code may do nonverbal presence only: gestures, gaze, SFX, board pulse, delay, UI motion.
- Live child conversation must always go to Claude + ElevenLabs.
- If tic-tac-toe is active, every child turn must include `activeActivity` and `activityFocus`.
- Completed games become memory/background only and must not hijack social or repeat-after turns.
- Existing movement path must stay validated through `companionAct`/validated command path. No new direct pose writers.
- Do not persist child-specific generated game reaction lines into child profile files.
- Debug traces must not log raw audio, screenshots, or full provider payloads.
- Branch hygiene: do not commit `src/context/**` demo files or `tmp/`.

## What Fable Should Solve

Design and/or implement the next slice:

### Session-Authored Reaction Pack

On tic-tac-toe mount:

1. Ask Claude once to generate a small fresh reaction pack for this session.
2. Moment keys should include:
   - `game_started`
   - `child_threat`
   - `companion_blocks_child`
   - `child_blocks_companion`
   - `companion_win`
   - `child_win`
   - `draw`
   - `whose_turn`
   - `rematch`
3. Each moment should have 2-4 short variants.
4. Variants must be persona-authored, not generic.
5. Each variant should include:
   - `variantId`
   - `momentType`
   - `spokenText`
   - optional companion command intent/gesture hint
   - constraints for when it is valid
6. Prewarm each line through the existing ElevenLabs route/path in the background.
7. Board display must not wait for pack generation or prewarm.
8. When a semantic moment happens:
   - pick a valid cached variant if available
   - play prewarmed audio if ready
   - if audio is not ready, use nonverbal presence only or live Claude for important beats
   - never use local spoken fallback
9. Trace each spoken reaction:
   - `speechSource: "session_authored_cache"`
   - `aiAuthored: true`
   - `packId`
   - `momentType`
   - `variantId`
   - `audioPrewarmed: boolean`
   - timing fields
10. Drop stale reactions if board state no longer matches.

### Live Conversation Contract

For ordinary child speech:

- Still call live Claude + ElevenLabs.
- Always include active tic-tac-toe board while status is active.
- Use `activityFocus: "foreground"` only for game-related utterances.
- Use `activityFocus: "background"` for social, repeat-after, and visual turns while a game is open.
- Do not answer as if the game is over unless status is completed.

### Reality Lab Upgrade

The lab should fail unless all are true:

- First visible feedback < 200ms.
- Presence cached reaction p95 < 1500ms.
- Claude social response p95 < 6500ms.
- Tic-tac-toe move rhythm stays 900-1800ms.
- Authorship score is 100% for spoken game reactions.
- Active board context included for every active-game child turn.
- No hardcoded local companion speech.
- No stale spoken reactions.
- No context hijack.
- No repeat/echo loop.

## Files To Inspect First

- `web/src/components/CompanionShowroom.tsx`
- `web/src/components/CompanionTicTacToe.tsx`
- `web/src/components/CompanionActivityRuntime.ts`
- `src/server/companionShowroomTalk.ts`
- `src/server/routes.ts`
- `src/server/companionVideoCallTrace.ts`
- `src/shared/companionLatencyGate.ts`
- `src/scripts/runCompanionLatencyLab.ts`
- `web/src/tests/test-companion-showroom-talk.ts`
- `web/src/tests/test-companion-tic-tac-toe.tsx`
- `src/engine/companionLatencyGate.test.ts`

## Questions Fable Should Answer

1. Is session-authored reaction pack the right next architecture, or is there a better split between local deterministic game logic and live model speech?
2. Where should the pack live in memory during the call?
3. What is the smallest API change that avoids a second audio system?
4. How should pack generation degrade if Claude or ElevenLabs is slow?
5. How do we keep variants fresh without making every line feel templated?
6. What should the lab measure to prove this is worth human testing?
7. What invariants should fail if someone reintroduces hardcoded companion speech?

## Fable Prompt To Paste

```text
You are reviewing Sunny's companion video-call prototype. The product goal is not "an AI tic-tac-toe bot"; it is shared play with a companion who feels alive. The current human-rejected failure was obvious: hardcoded fast speech, lost board context, and "ready for another round" while a round was active.

Read this brief and propose a surgical implementation plan for the next slice: session-authored tic-tac-toe reaction packs generated once on game mount, prewarmed through ElevenLabs, and used only for semantic moments. Regular child speech must remain live Claude + ElevenLabs with active board context included.

Constraints:
- No hardcoded spoken companion game lines.
- No local spoken fallback.
- Local code can handle only nonverbal presence: SFX, board motion, gestures, gaze, delay.
- Every spoken game reaction must trace aiAuthored=true with packId, momentType, variantId, speechSource.
- Active game context must be included on every child turn while status is active.
- Completed game context must not hijack social or repeat-after turns.
- No new direct body/pose path; use validated companionAct/command path only.
- Do not persist generated child-specific reaction lines into child profile files.
- Do not log raw audio, screenshots, or full provider payloads.

First, identify the failure mode in the existing design. Then propose the smallest implementation that could pass the lab and be worth human testing. Include exact tests to write first, files to edit, and what should be deleted vs added. Push back where the plan is wrong.
```

## Success Criteria For Fable's Answer

A strong answer should:

- Preserve organic conversation instead of replacing it with canned lines.
- Admit that latency is not the only metric.
- Keep deterministic game rules local and instant.
- Use model-authored cached reactions only for predictable semantic beats.
- Keep live Claude for open-ended child speech.
- Include board context on every active-game turn.
- Define traceable authorship and stale-drop rules.
- Add tests before implementation.
- Avoid broad rewrites or new transport unless trace evidence proves HTTP/cached reactions are not enough.

