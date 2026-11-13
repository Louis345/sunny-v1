# Companion Video Chat Conversation Context For Fable

Date: 2026-06-09
Branch: `codex/companion-latency-presence-lab`

This file is a conversation-level handoff for another model. It is not an app trace. It explains what the human has been trying to build, what went wrong across iterations, and what a new model should understand before proposing code.

## The Human Goal

Sunny is for the developer's daughters. The companion system is meant to create emotional attachment and reward value, not just tutoring.

The desired experience:

- A child earns time with a companion.
- The companion can be video-called.
- The child can chat naturally.
- The child can play simple shared games, starting with tic-tac-toe.
- The companion reacts like a friend with personality, not like a teacher or a scripted bot.
- The system should later support rewards, mystery boxes, chess, dream/image activities, and learning-adjacent play.

The human's core product thesis:

> If kids emotionally invest in the companion, Sunny can use that relationship to make learning feel more connected and rewarding.

## What The Human Kept Saying

The repeated feedback was not "make it faster" in isolation. It was:

- It feels fake when responses are hardcoded.
- It feels robotic when game turns happen without natural shared context.
- It feels bad when Elli forgets the board is open.
- It feels stale when she says generic game lines.
- It feels tutor-like when she should be a friend.
- The lab must catch what the human catches by feel.
- If a human can instantly tell the line is canned, the implementation failed.

Important human comments, paraphrased:

- "The goal is to make Elli feel alive."
- "Talking is going to get dull; shared play matters."
- "I stressed no hard responses."
- "I did not even have to look at the code to know responses were hardcoded."
- "What does this tell you?"
- "Latency comes from Claude to ElevenLabs, but the fixed tool calls and game moves are separate."
- "Maybe we should measure each variable instead of guessing."
- "The lab must mimic the way I actually use it."
- "Do not waste human testing time until the AI lab proves it is worth testing."

## The Main Failure Pattern

The implementation drifted toward optimizing latency by using a fast local `presence` path. That lowered measured response time but violated the organic-companion rule.

The fast presence path emitted local spoken companion lines such as:

- `I blocked it.`
- `Good game.`
- `Ready. You first.`

The human rejected the experience because it felt obviously scripted.

The deeper failure:

- The lab scored latency and did not score authorship.
- The code optimized for "fast" instead of "alive."
- The model lost active game context during social turns.
- Claude could respond as if tic-tac-toe was not in progress.
- The companion sometimes sounded like a tutor or app state machine.

## What Trace Evidence Showed

The key rejected trace was:

`trace_20260605t003732_24l31`

Local files:

- `logs/sessions/2026/06/2026-06-05T00-37-32Z_showroom_video_call_trace_20260605t003732_24l31/trace-summary.json`
- `logs/sessions/2026/06/2026-06-05T00-37-32Z_showroom_video_call_trace_20260605t003732_24l31/companion-call-trace.ndjson`

The old lab said the presence mode was ready for human review because latency was low:

- `presence/presence_reaction_audio`: p95 around a few milliseconds in one lab report.
- `move_rhythm`: around the intended range.
- failures: none.

But the human still rejected it.

Why the old lab missed it:

- It did not fail on `aiAuthored:false`.
- It did not fail on hardcoded local companion game speech.
- It did not fail when active board context was omitted from child turns.
- It did not fail on lost-context language like "another round" while a round was active.

## What Has Now Been Fixed On This Branch

The current branch has a reality-gated lab and removes the most obvious fake speech lane.

Implemented:

- `src/shared/companionLatencyGate.ts`
  - Converts trace packets to latency spans.
  - Fails human review for:
    - spoken presence reactions not AI-authored
    - hardcoded companion game speech
    - active activity context omitted
    - active game context lost response
    - stale reactions
    - missing audio
    - fallback speech
    - echo loops/repeated turns
- `src/engine/companionLatencyGate.test.ts`
  - Adds a rejected-session fixture based on the human-rejected shape.
  - This fixture must fail even when latency is fast.
- `web/src/components/CompanionShowroom.tsx`
  - Removes hardcoded spoken presence game reactions.
  - Routes semantic tic-tac-toe reactions through the authored talk path.
  - Traces `reactionLane`, `speechSource`, and `aiAuthored:true`.
  - Adds `activityFocus`.
  - Prevents hands-free rearm into completed rounds.
- `web/src/components/CompanionActivityRuntime.ts`
  - Keeps active tic-tac-toe context attached to talk turns, including social/repeat-after.
- `src/server/companionShowroomTalk.ts`
  - Accepts `activityFocus`.
  - Tells Claude if the game is foreground or background.
  - Keeps video calls companion-first rather than tutor-first.
- `src/server/companionVideoCallTrace.ts`
  - Separates fast delivery lane from authorship.
  - A reaction can be `reactionLane:"presence"` and still `aiAuthored:true`.
- `src/scripts/runCompanionLatencyLab.ts`
  - Adds `npm run sunny:companion:latency-lab`.

Verification already passed:

```bash
npm run build
npm run test
npm run sunny:companion:latency-lab -- --mock
```

## What Is Still Missing

The branch fixed the process and removed fake local spoken responses, but it does not yet implement the ideal low-latency architecture.

Missing next slice:

> Session-authored reaction packs.

That means:

- When tic-tac-toe mounts, Claude generates fresh persona-specific reaction variants for that session.
- ElevenLabs prewarms audio in the background.
- The board appears instantly.
- Predictable semantic beats use the cached Claude-authored audio.
- Regular child speech still goes live to Claude + ElevenLabs with full board context.

This is the intended compromise:

- Do not call Claude for every predictable move.
- Do not hardcode companion speech locally.
- Let Claude author a small pack once per game session.
- Use local nonverbal presence for immediacy.
- Preserve live Claude for open-ended child conversation.

## The Architecture Split The Human Wants Considered

There are two different systems and they should not be confused:

1. **Live human banter**
   - Child says anything.
   - Request goes to Claude.
   - If game is active, include board context every time.
   - ElevenLabs speaks response.
   - Good for open-ended social conversation.

2. **Fixed game mechanics / predictable beats**
   - Board state changes are local and instant.
   - The game engine decides legal moves.
   - The companion can react to semantic moments.
   - Reactions should be authored by Claude but cached/prewarmed for speed.

The human's latency hypothesis:

- Claude response latency and ElevenLabs synthesis latency are large fixed costs.
- Tool calls to update tic-tac-toe board are a separate cost.
- If the board move is deterministic, do not wait for Claude to make the board move.
- Use measured latency to design deliberate rhythm.
- Use local delay, SFX, gaze, and gestures to mask wait time.
- Use authored cached reactions for predictable game beats.

## Things A New Model Should Not Do

Do not:

- Reintroduce hardcoded spoken game lines.
- Claim the fast local line path is "AI-authored" when it is not.
- Optimize only p95 latency and ignore believability.
- Let tic-tac-toe hijack social chat.
- Let completed tic-tac-toe remain foreground context.
- Make every move trigger Claude speech.
- Make local code speak fallback lines when Claude/TTS fails.
- Add a broad Socket.IO rewrite before proving HTTP + cached authored reactions cannot work.
- Create a new pose/movement system.
- Write demo child context files into the PR.

## What A Good Fable Answer Should Do

A useful Fable response should:

- Push back if the request is over-scoped.
- Define a small next slice.
- Write tests first.
- Explain why the previous lab missed the human rejection.
- Preserve live Claude for normal conversation.
- Use Claude-authored cached packs for predictable game moments.
- Keep local code responsible for board rules, SFX, delay, and nonverbal presence.
- Trace authorship, pack id, moment type, stale drops, and timing.
- Give a concrete implementation plan with file-level changes.
- Say exactly what gets deleted vs added.

## Suggested Fable Prompt

```text
You are being handed a failed companion video-chat/game prototype. The user is not asking for generic AI game advice. They are trying to build an emotional reward surface for Sunny, where kids video-call a companion and play games like tic-tac-toe.

The human rejected the last iteration because it optimized latency with hardcoded local spoken lines. The human could tell immediately. The lab missed it because it measured speed, not authorship or context continuity.

Read the two handoff docs:
- docs/companion-fable-evaluation-brief.md
- docs/companion-fable-conversation-context.md

Then inspect:
- web/src/components/CompanionShowroom.tsx
- web/src/components/CompanionTicTacToe.tsx
- web/src/components/CompanionActivityRuntime.ts
- src/server/companionShowroomTalk.ts
- src/server/companionVideoCallTrace.ts
- src/shared/companionLatencyGate.ts
- src/engine/companionLatencyGate.test.ts

Your task:
1. Explain the real failure mode.
2. Propose the smallest next architecture to make tic-tac-toe feel natural without hardcoded speech.
3. Decide whether session-authored reaction packs are the right next move.
4. If yes, give exact tests and implementation steps.
5. If no, propose a better architecture and explain why.

Constraints:
- No hardcoded spoken companion game responses.
- No local spoken fallback.
- Board moves stay deterministic and local.
- Regular child speech stays live Claude + ElevenLabs.
- Active board context is included on every active-game child turn.
- Fast game reactions must be traceable as AI-authored.
- Do not persist child-specific generated game lines into profile files.
- Do not rewrite transport unless trace evidence proves it is necessary.
```

