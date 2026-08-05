import { describe, expect, it } from "vitest";
import {
  buildCompanionVideoCallTraceScoreReport,
  renderCompanionVideoCallTraceScoreMarkdown,
} from "./companionVideoCallTraceReport";
import type { CompanionVideoCallTraceRecord } from "./companionVideoCallTrace";

const base = {
  traceId: "trace_score",
  childId: "ila",
  companionId: "elli",
  callSource: "showroom",
  relationshipState: "previewing",
  recordedAt: "2026-06-13T23:16:54.000Z",
} as const;

function record(
  eventName: CompanionVideoCallTraceRecord["eventName"],
  timestamp: number,
  extras: Partial<CompanionVideoCallTraceRecord> = {},
): CompanionVideoCallTraceRecord {
  return {
    ...base,
    eventName,
    timestamp,
    ...extras,
  };
}

describe("companion video call trace score report", () => {
  it("fails human review when activity reactions are stale and mostly unspoken", () => {
    const records: CompanionVideoCallTraceRecord[] = [
      record("call_started", 0),
      record("talk_request_start", 100, {
        turnId: "turn_social",
        payload: { conversationIntent: "social" },
      }),
      record("talk_response_received", 5200, {
        turnId: "turn_social",
        responsePreview: "Yes! Let's play!",
        payload: {
          conversationIntent: "social",
          latencySpans: {
            claudeMs: 2100,
            toolFollowupMs: 1900,
            ttsMs: 1100,
            requestToResponseMs: 5100,
          },
          requestToResponseMs: 5100,
        },
      }),
      record("activity_reaction_request_start", 6000, {
        turnId: "reaction_1",
        payload: { activityReaction: { eventType: "companion_move" } },
      }),
      record("activity_reaction_response_received", 10600, {
        turnId: "reaction_1",
        responsePreview: "Nice block!",
        payload: {
          aiAuthored: true,
          requestToResponseMs: 4600,
          latencySpans: { requestToResponseMs: 4600 },
        },
      }),
      record("activity_reaction_stale_dropped", 10620, {
        turnId: "reaction_1",
        payload: { reason: "board_changed_before_audio" },
      }),
      record("activity_reaction_request_start", 12000, {
        turnId: "reaction_2",
        payload: { activityReaction: { eventType: "round_complete" } },
      }),
      record("activity_reaction_response_received", 16400, {
        turnId: "reaction_2",
        responsePreview: "Good game!",
        payload: {
          aiAuthored: true,
          requestToResponseMs: 4400,
          latencySpans: { requestToResponseMs: 4400 },
        },
      }),
      record("activity_reaction_audio_start", 16410, { turnId: "reaction_2" }),
      record("activity_reaction_audio_ended", 19000, { turnId: "reaction_2" }),
      record("call_ended", 20000),
    ];

    const report = buildCompanionVideoCallTraceScoreReport(records);

    expect(report.readyForHumanReview).toBe(false);
    expect(report.metrics.activityStaleDroppedCount).toBe(1);
    expect(report.metrics.activitySpokenCount).toBe(1);
    expect(report.metrics.activityUsefulSpeechRate).toBe(0.5);
    expect(report.metrics.socialResponseP95Ms).toBe(5100);
    expect(report.blockers).toContain(
      "Activity reactions arrived stale. The board changed before speech could play.",
    );
    expect(report.blockers).toContain(
      "Too few activity reactions became spoken moments. The game will feel quiet or behind.",
    );

    const markdown = renderCompanionVideoCallTraceScoreMarkdown(report);

    expect(markdown).toContain("Demo readiness: FAIL");
    expect(markdown).toContain("Activity stale drops: 1");
    expect(markdown).toContain("Useful activity speech rate: 50%");
  });

  it("passes human review when latency, authorship, stale drops, and spoken coverage are healthy", () => {
    const records: CompanionVideoCallTraceRecord[] = [
      record("call_started", 0),
      record("talk_request_start", 100, {
        turnId: "turn_social",
        payload: { conversationIntent: "social" },
      }),
      record("talk_response_received", 2400, {
        turnId: "turn_social",
        responsePreview: "I hear you!",
        payload: {
          conversationIntent: "social",
          requestToResponseMs: 2300,
          latencySpans: {
            claudeMs: 900,
            toolFollowupMs: 500,
            ttsMs: 700,
            requestToResponseMs: 2300,
          },
        },
      }),
      record("activity_reaction_response_received", 3500, {
        turnId: "reaction_1",
        responsePreview: "Tiny sparkle strategy.",
        payload: {
          aiAuthored: true,
          requestToResponseMs: 1100,
          latencySpans: { requestToResponseMs: 1100 },
        },
      }),
      record("activity_reaction_audio_start", 3510, { turnId: "reaction_1" }),
      record("activity_reaction_audio_ended", 5000, { turnId: "reaction_1" }),
      record("activity_reaction_response_received", 6500, {
        turnId: "reaction_2",
        responsePreview: "Good game.",
        payload: {
          aiAuthored: true,
          requestToResponseMs: 1300,
          latencySpans: { requestToResponseMs: 1300 },
        },
      }),
      record("activity_reaction_audio_start", 6510, { turnId: "reaction_2" }),
      record("activity_reaction_audio_ended", 8000, { turnId: "reaction_2" }),
      record("call_ended", 9000),
    ];

    const report = buildCompanionVideoCallTraceScoreReport(records);

    expect(report.readyForHumanReview).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it("reports social first-audio metrics when streamed turns include firstAudioMs", () => {
    const records: CompanionVideoCallTraceRecord[] = [
      record("call_started", 0),
      record("talk_response_received", 2400, {
        turnId: "turn_stream_1",
        payload: {
          conversationIntent: "social",
          requestToResponseMs: 2300,
          latencySpans: { firstAudioMs: 900, requestToResponseMs: 2300 },
        },
      }),
      record("talk_response_received", 5400, {
        turnId: "turn_stream_2",
        payload: {
          conversationIntent: "social",
          requestToResponseMs: 2500,
          latencySpans: { firstAudioMs: 1300, requestToResponseMs: 2500 },
        },
      }),
      record("call_ended", 6000),
    ];

    const report = buildCompanionVideoCallTraceScoreReport(records);
    expect(report.metrics.socialFirstAudioP95Ms).toBe(1300);
    expect(report.metrics.socialFirstAudioAverageMs).toBe(1100);

    const markdown = renderCompanionVideoCallTraceScoreMarkdown(report);
    expect(markdown).toContain("Social first-audio p95: 1300ms");
    expect(markdown).toContain("Social first-audio average: 1100ms");
  });

  it("scores a timed-out move packet as a deliberate fallback, not missing audio", () => {
    // Regression for a real session: the packet timed out, the move revealed
    // silently (correct), then the late line was discarded. Without a fallback
    // event on the same turn the report called that missing audio and failed
    // the run for behaviour that was working as designed.
    const records: CompanionVideoCallTraceRecord[] = [
      record("call_started", 0),
      record("activity_move_packet_requested", 1000, {
        turnId: "turn_19",
        payload: { plannedMove: "drop your yellow disc into column 4" },
      }),
      record("activity_move_packet_timeout", 5000, {
        payload: { plannedMove: "drop your yellow disc into column 4" },
      }),
      record("activity_reaction_response_received", 6200, {
        turnId: "turn_19",
        payload: {
          aiAuthored: true,
          requestToResponseMs: 5200,
          latencySpans: { requestToResponseMs: 5200 },
        },
      }),
      record("activity_reaction_fallback", 6210, {
        turnId: "turn_19",
        payload: { reason: "move_packet_timeout", fallback: "gesture_only" },
      }),
      record("call_ended", 7000),
    ];

    const report = buildCompanionVideoCallTraceScoreReport(records);

    expect(report.metrics.activityMissingAudioCount).toBe(0);
    expect(report.metrics.activityFallbackCount).toBe(1);
    expect(report.metrics.movePacketTimeoutCount).toBe(1);
    expect(report.likelyCause).not.toBe("activity_reaction_missing_audio");
    expect(report.blockers).not.toContain(
      "Some AI-authored activity reactions produced no playable audio.",
    );
  });

  it("reports move packet metrics without changing pass thresholds", () => {
    const records: CompanionVideoCallTraceRecord[] = [
      record("call_started", 0),
      record("activity_move_packet_requested", 1000, {
        turnId: "packet_1",
        payload: { plannedMove: 5 },
      }),
      record("activity_move_packet_arrived", 2600, {
        turnId: "packet_1",
        payload: { latencyMs: 1600, plannedMove: 5 },
      }),
      record("activity_reaction_response_received", 2600, {
        turnId: "packet_1",
        responsePreview: "Center square, mine!",
        payload: {
          aiAuthored: true,
          requestToResponseMs: 1600,
          latencySpans: { requestToResponseMs: 1600 },
        },
      }),
      record("activity_reaction_audio_start", 2650, { turnId: "packet_1" }),
      record("activity_reaction_audio_ended", 4200, { turnId: "packet_1" }),
      record("activity_move_packet_requested", 6000, {
        turnId: "packet_2",
        payload: { plannedMove: 3 },
      }),
      record("activity_move_packet_timeout", 10000, {
        payload: { plannedMove: 3, timeoutMs: 4000 },
      }),
      record("activity_reaction_fallback", 10010, {
        turnId: "packet_2",
        payload: { reason: "move_packet_timeout", fallback: "gesture_only" },
      }),
      record("call_ended", 11000),
    ];

    const report = buildCompanionVideoCallTraceScoreReport(records);

    expect(report.metrics.movePacketRequestedCount).toBe(2);
    expect(report.metrics.movePacketArrivedCount).toBe(1);
    expect(report.metrics.movePacketTimeoutCount).toBe(1);
    expect(report.metrics.movePacketP95Ms).toBe(1600);
    expect(report.metrics.activityStaleDroppedCount).toBe(0);
    expect(report.readyForHumanReview).toBe(true);

    const markdown = renderCompanionVideoCallTraceScoreMarkdown(report);
    expect(markdown).toContain("Move packets requested: 2");
    expect(markdown).toContain("Move packets arrived: 1");
    expect(markdown).toContain("Move packet timeouts: 1");
    expect(markdown).toContain("Move packet p95: 1600ms");
  });
});
