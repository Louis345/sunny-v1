# Companion Video Call Score: trace_20260803t213428_0a5rr

Demo readiness: PASS
Likely cause: none

## Metrics
- Social response p50: 4249ms
- Social response p95: 4249ms
- Social response average: 4249ms
- Social first-audio p95: 1697ms
- Social first-audio average: 1697ms
- Activity response p95: n/a
- Activity response average: n/a
- Activity AI-authored responses: 0
- Activity spoken moments: 0
- Activity stale drops: 0
- Activity missing audio: 0
- Activity fallback count: 0
- Useful activity speech rate: 100%
- Move packets requested: 0
- Move packets arrived: 0
- Move packet timeouts: 0
- Move packet p95: n/a
- Average Claude latency: 3248ms
- Average tool follow-up latency: 0ms
- Average ElevenLabs latency: 993ms

## Blockers
- None

## Strengths
- No stale activity reactions.
- Most AI-authored activity reactions became speech.
- Live conversation stayed within the current review ceiling.

## Live verification: contract + Connect Four + game memory

Session: one video call, Connect Four opened by Claude through the
registry-generated `openCompanionActivity` tool enum, one full round played.

**Connect Four behaves exactly like tic-tac-toe on every property the hybrid
move packet was built to guarantee:** 0 stale drops, 4/4 move packets arrived,
0 timeouts, 0 missing audio, 100% useful speech. Elli's lines were
game-specific and synchronized with the disc landing ("Middle column's calling
my name", "I got you with that last column move!").

The single blocker is the pre-existing 2500ms activity ceiling (p95 2834ms),
unchanged in nature from the wave-1 finding: that threshold was calibrated for
ungated reactions chasing a moved board, and the latency now sits inside the
companion's thinking beat. Threshold semantics remain the open decision.

**Memory loop, proven end to end:**
- Round result was companion_win. Code wrote
  `gameRecord.connect_four = { played: 1, childWins: 0, companionWins: 1,
  draws: 0, currentStreak: -1 }`.
- Ledger inspection: 7 game beats tagged `companion_activity_completed` with
  `activityContext`, and **0 leaked machine prompts into `questionText`** —
  only the child's real words ("hi elli! can we play connect four?") are filed
  as hers.
- In a NEW call, asked "what's our connect four score so far?", Elli answered:
  *"We've played one round of Connect Four so far, and I totally won that
  one!"* — matching the deterministic record exactly, with no invented tally.
