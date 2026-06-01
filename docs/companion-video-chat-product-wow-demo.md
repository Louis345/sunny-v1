# Companion Video Chat Product Wow Demo

## Purpose

Demo Sunny's companion layer as an emotional reward surface. The child earns time with Elli, starts a video chat, plays tic-tac-toe, and Elli reacts like a friend sharing the moment instead of a scripted game bot.

This is not an AI tic-tac-toe bot. The game rules are local and instant; the AI is the companion reacting to meaningful moments.

## Launch

1. Start Sunny's server and web client.
2. Open `http://127.0.0.1:5173/dbz-preview.html?showroomTheme=crystal&child=ila`.
3. Select Elli in Crystal Atelier.
4. Start `Video Chat`.

If camera or mic permission is blocked, continue with the call shell and typed input. The demo still proves the shared-activity surface.

## Presenter Script

Say this before the game:

> This is not an AI tic-tac-toe bot. The game rules are local and instant; the AI is the companion reacting to meaningful moments.

Say this when the board appears:

> We do not want canned responses per game. Games emit semantic moments like `child_blocked_companion` or `companion_blocked_child`; Elli decides what to say from persona and context.

Say this after the round:

> Latency is treated as rhythm. The child move appears instantly, Elli has a deliberate decision pause, and traces record planned vs actual timing.

Close with:

> This becomes the reusable pattern for chess, dream games, drawing games, and mystery-box rewards.

## Demo Flow

1. Show the showroom briefly:
   - Crystal room theme is visible.
   - Companion selection is visible.
   - `Video Chat` reads as an unlocked reward preview.

2. Open Video Chat:
   - Let the call ceremony land.
   - Elli should appear as the companion portrait.
   - Use typed input if voice is flaky.

3. Ask or type:
   - `Let's play tic tac toe.`

4. Show the activity card:
   - The board should pop in as a compact activity card.
   - The card should not cover the child's face or dominate the call.
   - `Portrait / Full body` controls should be visible for comparing companion presentation.

5. Play one short round:
   - Create one meaningful game beat rather than racing to finish.
   - Prefer a block moment because it shows shared attention.
   - Good semantic moments: `child_created_threat`, `companion_blocked_child`, `child_blocked_companion`, `round_complete`.
   - Elli should not narrate every move.
   - Elli should comment on at least one meaningful beat.

6. End the call and copy the trace link:
   - Trace URL shape: `/api/companions/video-call-traces/<traceId>`.
   - Use the trace as the evidence packet after the demo.

## Suggested Move Pattern

Use this pattern when the board is empty and the child is `X`.

1. Child plays top-left.
2. Let Elli respond.
3. Child plays top-middle if open, otherwise center.
4. Elli should eventually face or create a block beat.
5. Stop after the first meaningful block or round-complete moment.

The exact squares do not matter as much as the trace showing the semantic moment. The demo is about shared play, not winning.

## Trace Checklist

Open the copied trace link and verify:

- Activity context includes `tic_tac_toe`.
- The active board state appears in the trace packet.
- Semantic moments include at least one of `child_blocked_companion`, `companion_blocked_child`, `child_created_threat`, or `round_complete`.
- Reaction timing includes planned delay versus actual latency.
- Stale reactions are either absent or marked as dropped.
- The trace distinguishes local game timing from Claude/TTS reaction timing.
- No raw screenshot, audio, or provider payload is stored.

## Success Criteria

- The board does not cover the child's face or dominate the call.
- Elli does not narrate every move.
- Elli comments on at least one meaningful game moment.
- The decision delay feels intentional, not broken.
- Portrait / Full body toggle helps compare companion presentation.
- The trace link shows activity context, reaction timing, and whether any stale reaction was dropped.

## Product Rule

Games emit semantic moments. Elli decides what to say from persona and context. No canned response table should be the primary speech path for shared play.

## Known Follow-Ups

- Smoother continuous presence during silence.
- Lower end-to-end response latency.
- Richer gesture policy so motions vary with intent.
- More deliberate portrait/full-body defaults per companion body shape.
- A reusable activity adapter for chess, drawing, dream-image games, and mystery-box rewards.
