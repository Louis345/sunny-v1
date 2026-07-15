# Companion Video Call Score: trace_20260715t033858_43m86

Demo readiness: FAIL
Likely cause: slow_response

## Metrics
- Social response p50: 4065ms
- Social response p95: 6475ms
- Social response average: 4843ms
- Activity response p95: 2613ms
- Activity response average: 2299ms
- Activity AI-authored responses: 11
- Activity spoken moments: 11
- Activity stale drops: 0
- Activity missing audio: 0
- Activity fallback count: 0
- Useful activity speech rate: 100%
- Move packets requested: 7
- Move packets arrived: 7
- Move packet timeouts: 0
- Move packet p95: 2681ms
- Average Claude latency: 1960ms
- Average tool follow-up latency: 0ms
- Average ElevenLabs latency: 536ms

## Blockers
- Activity reaction latency is too slow for move-by-move play.

## Strengths
- No stale activity reactions.
- Most AI-authored activity reactions became speech.
- Live conversation stayed within the current review ceiling.

## Comparison vs trace_20260613t231654_56acz (pre-wave-1 baseline)

| Metric | 2026-06-13 | 2026-07-15 |
| --- | --- | --- |
| Demo readiness | FAIL (stale_activity_reaction) | FAIL (slow_response, 1 blocker) |
| Activity stale drops | 3 | 0 |
| Useful activity speech rate | 25% | 100% |
| Activity response p95 | 5258ms | 2613ms |
| Social response p50 | 5191ms | 4065ms |
| Avg tool follow-up latency | 1780ms | 0ms |
| Avg ElevenLabs latency | 873ms | 536ms |
| Move packets (new) | n/a | 7 requested / 7 arrived / 0 timeouts |

Remaining blocker: activity p95 2613ms vs the 2500ms ceiling. That ceiling was
calibrated for ungated reactions where slow speech chased a moved board; with
the gated move packet the latency is spent inside the companion thinking beat
(the previous local-only think delay was 2200-2850ms). Wave 2 (streaming TTS)
is the structural fix; alternatively the lab could score packet-gated turns
against the packet timeout budget.

## Wave 2 addendum: streaming pipeline (2026-07-15, trace_20260715t072607_6wwuo)

Video-call social turns now stream: Claude tokens -> sentence-chunked
ElevenLabs websocket TTS (PCM 24kHz) -> SSE audio chunks -> gapless WebAudio
playback through the lip-sync analyser. `?companionStream=off` falls back to
the buffered JSON path, as does any stream failure before first audio.

- Social first-audio average: 3204ms (p95 4200ms) vs 4-5.6s full-response wait
  on the buffered path measured in the same session with the flag off.
- System prompts are now cache_control'd; warm-turn time-to-first-token
  dropped from ~1981ms to ~1570-1645ms.
- Game move packets are unchanged (still buffered JSON, gated reveal):
  3/3 arrived, 0 timeouts, 0 stale drops, useful speech 100%.
- Remaining blocker is unchanged from wave 1: activity p95 vs the 2500ms
  ungated ceiling (threshold-semantics decision pending).
