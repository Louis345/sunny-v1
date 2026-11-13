import { describe, expect, it } from "vitest";
import {
  buildCompanionLatencyHumanReviewMarkdown,
  companionTracePacketToLatencySpans,
  evaluateCompanionLatencyGate,
  type CompanionLatencySpan,
} from "../shared/companionLatencyGate";

function span(partial: Partial<CompanionLatencySpan> & Pick<CompanionLatencySpan, "mode" | "metric" | "durationMs">): CompanionLatencySpan {
  return {
    type: "companion_latency_span",
    scenarioId: partial.scenarioId ?? "tic_tac_toe_presence_round",
    traceId: partial.traceId ?? `trace_${partial.mode}`,
    mode: partial.mode,
    metric: partial.metric,
    durationMs: partial.durationMs,
    ...(partial.turnId && { turnId: partial.turnId }),
    ...(partial.reactionLane && { reactionLane: partial.reactionLane }),
    ...(partial.eventType && { eventType: partial.eventType }),
    ...(partial.likelyCause && { likelyCause: partial.likelyCause }),
  };
}

describe("companion latency gate", () => {
  it("fails the human-rejected session shape even when latency is fast", () => {
    const spans = companionTracePacketToLatencySpans(
      {
        traceId: "trace_rejected_human_session",
        likelyCause: "none",
        eventCount: 12,
        loopSuspected: false,
        activityReactions: {
          aiAuthoredCount: 0,
          presenceCount: 1,
          fallbackCount: 0,
          staleDroppedCount: 0,
          spokenCount: 1,
          missingAudioCount: 0,
          averagePresenceResponseMs: 1,
        },
        eventOrder: [
          { eventName: "call_started", timestamp: 1_000 },
          { eventName: "call_greeting_audio_start", timestamp: 1_100 },
          {
            eventName: "activity_context_changed",
            timestamp: 2_000,
            payload: {
              activeActivity: {
                activityId: "tic_tac_toe",
                status: "active",
                turn: "child",
                board: ["X", null, null, null, "O", null, null, null, null],
              },
            },
          },
          {
            eventName: "speech_result",
            turnId: "social_mid_game",
            timestamp: 3_000,
            payload: {
              transcriptPreview: "Alright Elli, gotcha.",
              activeActivity: {
                activityId: "tic_tac_toe",
                status: "active",
                turn: "child",
                board: ["X", null, null, null, "O", null, null, null, null],
              },
            },
          },
          {
            eventName: "talk_request_start",
            turnId: "social_mid_game",
            timestamp: 3_010,
            payload: {
              conversationIntent: "social",
              activeActivityIncluded: false,
            },
          },
          {
            eventName: "talk_response_received",
            turnId: "social_mid_game",
            timestamp: 7_000,
            payload: {
              responsePreview: "Ready for another round?",
            },
          },
          {
            eventName: "activity_reaction_request_start",
            turnId: "presence_reaction_1",
            timestamp: 8_000,
          },
          {
            eventName: "activity_reaction_response_received",
            turnId: "presence_reaction_1",
            timestamp: 8_001,
            payload: {
              aiAuthored: false,
              reactionLane: "presence",
              responsePreview: "I blocked it.",
            },
          },
          {
            eventName: "activity_reaction_audio_start",
            turnId: "presence_reaction_1",
            timestamp: 8_002,
          },
          {
            eventName: "activity_context_changed",
            timestamp: 9_000,
            payload: {
              type: "companion_tic_tac_toe_companion_move",
              decisionLatencyMs: 1_100,
            },
          },
        ],
        turns: [
          {
            turnId: "social_mid_game",
            eventNames: ["speech_result", "talk_request_start", "talk_response_received"],
            conversationIntent: "social",
            requestToResponseMs: 3_990,
            transcriptPreview: "Alright Elli, gotcha.",
          },
        ],
      },
      { mode: "presence", scenarioId: "human_rejected_presence_round" },
    );
    const result = evaluateCompanionLatencyGate(spans);

    expect(result.readyForHumanReview).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "companion_reaction_not_ai_authored" }),
        expect.objectContaining({ code: "active_activity_context_omitted" }),
        expect.objectContaining({ code: "active_game_context_lost_response" }),
      ]),
    );
  });

  it("fails spoken presence reactions that are not AI-authored", () => {
    const result = evaluateCompanionLatencyGate([
      span({ mode: "presence", metric: "first_visible_feedback", durationMs: 120 }),
      span({
        mode: "presence",
        metric: "presence_reaction_audio",
        durationMs: 2,
        likelyCause: "spoken_presence_not_ai_authored",
      }),
      span({ mode: "presence", metric: "move_rhythm", durationMs: 1_100 }),
    ]);

    expect(result.readyForHumanReview).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "companion_reaction_not_ai_authored" }),
      ]),
    );
  });

  it("fails slow presence reaction p95 and blocks human review", () => {
    const result = evaluateCompanionLatencyGate([
      span({ mode: "presence", metric: "presence_reaction_audio", durationMs: 900 }),
      span({ mode: "presence", metric: "presence_reaction_audio", durationMs: 1_800 }),
    ]);

    expect(result.readyForHumanReview).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "presence_reaction_audio_p95_slow",
        }),
      ]),
    );
  });

  it("fails trace blockers before generic latency failures", () => {
    const result = evaluateCompanionLatencyGate([
      span({
        mode: "presence",
        metric: "trace_blocker",
        durationMs: 0,
        likelyCause: "game_context_overrode_social_intent",
      }),
      span({ mode: "presence", metric: "presence_reaction_audio", durationMs: 2_200 }),
    ]);

    expect(result.readyForHumanReview).toBe(false);
    expect(result.failures[0]).toMatchObject({
      code: "companion_trace_blocker",
      evidence: expect.stringContaining("game_context_overrode_social_intent"),
    });
  });

  it("fails when a run has no playable latency evidence", () => {
    const result = evaluateCompanionLatencyGate([
      span({ mode: "presence", metric: "first_visible_feedback", durationMs: 120 }),
    ]);

    expect(result.readyForHumanReview).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "companion_latency_insufficient_evidence",
        }),
      ]),
    );
  });

  it("passes a product-demo-ready presence run", () => {
    const result = evaluateCompanionLatencyGate([
      span({ mode: "presence", metric: "first_visible_feedback", durationMs: 120 }),
      span({ mode: "presence", metric: "presence_reaction_audio", durationMs: 480 }),
      span({ mode: "presence", metric: "presence_reaction_audio", durationMs: 860 }),
      span({ mode: "presence", metric: "move_rhythm", durationMs: 1_200 }),
      span({ mode: "claude", metric: "claude_social_response", durationMs: 4_900 }),
    ]);

    expect(result.readyForHumanReview).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "presence",
          metric: "presence_reaction_audio",
          p95Ms: 860,
        }),
      ]),
    );
  });

  it("converts video-call trace packets into separated latency spans", () => {
    const spans = companionTracePacketToLatencySpans(
      {
        traceId: "trace_presence",
        likelyCause: "none",
        eventCount: 8,
        loopSuspected: false,
        activityReactions: {
          aiAuthoredCount: 0,
          presenceCount: 2,
          fallbackCount: 0,
          staleDroppedCount: 0,
          spokenCount: 2,
          missingAudioCount: 0,
          averagePresenceResponseMs: 520,
        },
        eventOrder: [
          { eventName: "call_started", timestamp: 1_000 },
          { eventName: "call_greeting_audio_start", timestamp: 1_140 },
          {
            eventName: "activity_reaction_request_start",
            turnId: "presence_1",
            timestamp: 2_000,
          },
          {
            eventName: "activity_reaction_audio_start",
            turnId: "presence_1",
            timestamp: 2_510,
          },
          {
            eventName: "activity_phase_changed",
            timestamp: 3_000,
          },
          {
            eventName: "activity_phase_changed",
            timestamp: 4_250,
          },
        ],
        turns: [
          {
            turnId: "turn_social",
            eventNames: ["speech_result", "talk_request_start", "talk_response_received"],
            requestToResponseMs: 5_400,
          },
        ],
      },
      { mode: "presence", scenarioId: "presence_round" },
    );

    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "first_visible_feedback",
          durationMs: 140,
        }),
        expect.objectContaining({
          metric: "presence_reaction_audio",
          durationMs: 510,
          turnId: "presence_1",
        }),
        expect.objectContaining({
          metric: "claude_social_response",
          durationMs: 5_400,
        }),
      ]),
    );
  });

  it("does not count a tic-tac-toe launch turn as a slow Claude social response", () => {
    const spans = companionTracePacketToLatencySpans(
      {
        traceId: "trace_presence_game_launch",
        likelyCause: "slow_response",
        eventCount: 8,
        loopSuspected: false,
        activityReactions: {
          aiAuthoredCount: 0,
          presenceCount: 1,
          fallbackCount: 0,
          staleDroppedCount: 0,
          spokenCount: 1,
          missingAudioCount: 0,
          averagePresenceResponseMs: 620,
        },
        eventOrder: [
          { eventName: "call_started", timestamp: 1_000 },
          { eventName: "call_greeting_audio_start", timestamp: 1_120 },
          {
            eventName: "activity_reaction_request_start",
            turnId: "presence_reaction_1",
            timestamp: 2_000,
          },
          {
            eventName: "activity_reaction_audio_start",
            turnId: "presence_reaction_1",
            timestamp: 2_620,
          },
        ],
        turns: [
          {
            turnId: "game_launch_1",
            eventNames: ["talk_request_start", "talk_response_received", "audio_play_start"],
            transcriptPreview: "let us play tic tac toe",
            requestToResponseMs: 6_766,
          },
        ],
      },
      { mode: "presence", scenarioId: "presence_round" },
    );

    expect(spans).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "claude_social_response",
          turnId: "game_launch_1",
        }),
      ]),
    );
  });

  it("uses tic-tac-toe companion move decision latency instead of noisy phase gaps", () => {
    const spans = companionTracePacketToLatencySpans(
      {
        traceId: "trace_presence_move_rhythm",
        likelyCause: "none",
        eventCount: 8,
        loopSuspected: false,
        activityReactions: {
          aiAuthoredCount: 0,
          presenceCount: 1,
          fallbackCount: 0,
          staleDroppedCount: 0,
          spokenCount: 1,
          missingAudioCount: 0,
          averagePresenceResponseMs: 520,
        },
        eventOrder: [
          { eventName: "call_started", timestamp: 1_000 },
          { eventName: "call_greeting_audio_start", timestamp: 1_120 },
          { eventName: "activity_phase_changed", timestamp: 2_000 },
          { eventName: "activity_phase_changed", timestamp: 2_001 },
          { eventName: "activity_phase_changed", timestamp: 12_650 },
          {
            eventName: "activity_context_changed",
            timestamp: 14_000,
            payload: {
              type: "companion_tic_tac_toe_companion_move",
              decisionLatencyMs: 1_240,
            },
          },
        ],
        turns: [],
      },
      { mode: "presence", scenarioId: "presence_round" },
    );

    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "move_rhythm",
          durationMs: 1_240,
        }),
      ]),
    );
    expect(spans).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "move_rhythm",
          durationMs: 1,
        }),
      ]),
    );
    expect(spans).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "move_rhythm",
          durationMs: 10_649,
        }),
      ]),
    );
  });

  it("writes a human-readable approval report that includes the exact test URL", () => {
    const result = evaluateCompanionLatencyGate([
      span({ mode: "presence", metric: "first_visible_feedback", durationMs: 120 }),
      span({ mode: "presence", metric: "presence_reaction_audio", durationMs: 640 }),
    ]);
    const markdown = buildCompanionLatencyHumanReviewMarkdown({
      result,
      testUrl:
        "http://127.0.0.1:5173/dbz-preview.html?showroomTheme=crystal&child=ila&activityReactionMode=presence",
      traceUrls: ["http://127.0.0.1:5173/api/companions/video-call-traces/trace_presence"],
      labDir: "/tmp/sunny-lab",
    });

    expect(markdown).toContain("ready_for_human_review: true");
    expect(markdown).toContain("activityReactionMode=presence");
    expect(markdown).toContain("trace_presence");
  });
});
