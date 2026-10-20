import { describe, expect, it } from "vitest";
import {
  VoiceTurnLatencyTracker,
  formatVoiceTurnLatencyLog,
  formatVoiceTurnLatencyReport,
  readVoiceTurnLatencyRecords,
  summarizeVoiceTurnLatency,
  type VoiceTurnLatencyRecord,
} from "./voiceTurnLatency";

function harness() {
  let clock = 1_000;
  const records: VoiceTurnLatencyRecord[] = [];
  const tracker = new VoiceTurnLatencyTracker({
    now: () => clock,
    emit: (record) => records.push(record),
  });
  return {
    tracker,
    records,
    advance(ms: number) {
      clock += ms;
    },
  };
}

describe("VoiceTurnLatencyTracker", () => {
  it("emits one record with every span when the first audio arrives", () => {
    const { tracker, records, advance } = harness();
    tracker.startTurn("final");
    advance(15);
    tracker.beginResponse();
    advance(25);
    tracker.mark("model_request");
    advance(1_900);
    tracker.mark("model_first_token");
    advance(60);
    tracker.mark("tts_first_text");
    advance(300);
    tracker.mark("tts_first_audio");

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      turnId: 1,
      source: "final",
      outcome: "first_audio",
      toolStepsBeforeFirstToken: 0,
      marksMs: {
        response_start: 15,
        model_request: 40,
        model_first_token: 1_940,
        tts_first_text: 2_000,
        tts_first_audio: 2_300,
      },
      spansMs: {
        endOfTurnToResponseStart: 15,
        responseStartToModelRequest: 25,
        modelRequestToFirstToken: 1_900,
        firstTokenToTtsText: 60,
        ttsTextToFirstAudio: 300,
        endOfTurnToFirstAudio: 2_300,
      },
    });
  });

  it("keeps only the first occurrence of each mark in a turn", () => {
    const { tracker, records, advance } = harness();
    tracker.startTurn("final");
    advance(10);
    tracker.mark("model_first_token");
    advance(500);
    tracker.mark("model_first_token");
    tracker.mark("tts_first_audio");
    expect(records[0].marksMs.model_first_token).toBe(10);
  });

  it("ignores marks when no turn is active (opening lines, post-audio chunks)", () => {
    const { tracker, records, advance } = harness();
    tracker.mark("tts_first_audio");
    tracker.startTurn("final");
    advance(100);
    tracker.mark("tts_first_audio");
    tracker.mark("tts_first_audio");
    expect(records).toHaveLength(1);
  });

  it("emits the unfinished turn as superseded when a new turn starts", () => {
    const { tracker, records, advance } = harness();
    tracker.startTurn("eager");
    advance(20);
    tracker.mark("model_request");
    tracker.startTurn("final");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      turnId: 1,
      source: "eager",
      outcome: "superseded",
      marksMs: { model_request: 20 },
    });
    expect(records[0].spansMs.endOfTurnToFirstAudio).toBeUndefined();
  });

  it("emits a cancelled record with the reason on barge-in and then goes inactive", () => {
    const { tracker, records, advance } = harness();
    tracker.startTurn("final");
    advance(700);
    tracker.cancelTurn("barge_in");
    tracker.cancelTurn("barge_in");
    tracker.mark("tts_first_audio");
    expect(records).toEqual([
      expect.objectContaining({ outcome: "cancelled", reason: "barge_in" }),
    ]);
  });

  it("records how long a held eager end-of-turn led the final one", () => {
    const { tracker, records, advance } = harness();
    tracker.noteEagerHeld();
    advance(850);
    tracker.startTurn("final");
    tracker.mark("tts_first_audio");
    expect(records[0].heldEagerLeadMs).toBe(850);
  });

  it("drops a stale held eager signal outside the hold window", () => {
    const { tracker, records, advance } = harness();
    tracker.noteEagerHeld();
    advance(3_500);
    tracker.startTurn("final");
    tracker.mark("tts_first_audio");
    expect(records[0].heldEagerLeadMs).toBeUndefined();
  });

  it("does not carry a held eager signal into a later turn", () => {
    const { tracker, records, advance } = harness();
    tracker.noteEagerHeld();
    advance(100);
    tracker.startTurn("final");
    tracker.mark("tts_first_audio");
    advance(100);
    tracker.startTurn("final");
    tracker.mark("tts_first_audio");
    expect(records[1].heldEagerLeadMs).toBeUndefined();
  });

  it("formats a Law 5 log line", () => {
    const { tracker, records, advance } = harness();
    tracker.startTurn("final");
    advance(2_300);
    tracker.mark("tts_first_audio");
    const line = formatVoiceTurnLatencyLog(records[0]);
    expect(line).toMatch(/^ 🎮 \[latency\] \[turn_first_audio\] /);
    expect(line).toContain("source=final");
    expect(line).toContain("eot_to_first_audio=2300ms");
    expect(line).toContain("tool_steps=0");
  });

  it("starts a system turn when Elli is asked to respond without a child end-of-turn (opening, activity start)", () => {
    const { tracker, records, advance } = harness();
    tracker.beginResponse();
    advance(30);
    tracker.mark("model_request");
    advance(2_000);
    tracker.mark("tts_first_audio");
    expect(records[0]).toMatchObject({
      source: "system",
      outcome: "first_audio",
      marksMs: { response_start: 0, model_request: 30, tts_first_audio: 2_030 },
    });
  });

  it("reuses the child's turn for its first response, but starts a new system turn for a second response", () => {
    const { tracker, records, advance } = harness();
    tracker.startTurn("final");
    advance(10);
    tracker.beginResponse();
    advance(10);
    tracker.beginResponse();
    expect(records).toEqual([
      expect.objectContaining({ turnId: 1, source: "final", outcome: "superseded" }),
    ]);
    tracker.mark("tts_first_audio");
    expect(records[1]).toMatchObject({ turnId: 2, source: "system" });
  });

  it("counts tool steps only until the first spoken token", () => {
    const { tracker, records } = harness();
    tracker.startTurn("final");
    tracker.noteToolStep(2);
    tracker.noteToolStep(0);
    tracker.noteToolStep(1);
    tracker.mark("model_first_token");
    tracker.noteToolStep(1);
    tracker.mark("tts_first_audio");
    expect(records[0].toolStepsBeforeFirstToken).toBe(2);
  });

  it("never lets a failing sink break the conversation turn", () => {
    const warnings: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args[0]);
    try {
      const tracker = new VoiceTurnLatencyTracker({
        emit: () => {
          throw new Error("disk full");
        },
      });
      tracker.startTurn("final");
      expect(() => tracker.mark("tts_first_audio")).not.toThrow();
      expect(() => tracker.cancelTurn("barge_in")).not.toThrow();
      expect(String(warnings[0])).toContain("[latency] [emit_failed]");
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("voice latency report", () => {
  function record(
    turnId: number,
    outcome: VoiceTurnLatencyRecord["outcome"],
    spans: VoiceTurnLatencyRecord["spansMs"],
    extra: Partial<VoiceTurnLatencyRecord> = {},
  ): VoiceTurnLatencyRecord {
    return { turnId, source: "final", outcome, marksMs: {}, spansMs: spans, ...extra };
  }

  it("reads latency records out of a session events.ndjson", () => {
    const rec = record(1, "first_audio", { endOfTurnToFirstAudio: 2_000 });
    const ndjson = [
      JSON.stringify({ component: "turn", action: "state_changed", state: "IDLE" }),
      JSON.stringify({ component: "latency", action: "turn", ...rec }),
      "",
      "not json",
    ].join("\n");
    expect(readVoiceTurnLatencyRecords(ndjson)).toEqual([
      expect.objectContaining({ turnId: 1, outcome: "first_audio" }),
    ]);
  });

  it("summarizes p50/p95 per span from completed turns only", () => {
    const records = [1_000, 2_000, 3_000, 4_000].map((ms, i) =>
      record(i + 1, "first_audio", {
        endOfTurnToFirstAudio: ms,
        modelRequestToFirstToken: ms / 2,
      }),
    );
    records.push(record(5, "cancelled", { endOfTurnToFirstAudio: 99_999 }));
    records.push(record(6, "superseded", {}));
    records.push(
      record(7, "first_audio", { endOfTurnToFirstAudio: 2_500 }, { heldEagerLeadMs: 600 }),
    );

    const summary = summarizeVoiceTurnLatency(records);
    expect(summary.turns).toEqual({ first_audio: 5, cancelled: 1, superseded: 1 });
    expect(summary.spans.endOfTurnToFirstAudio).toEqual({ count: 5, p50: 2_500, p95: 4_000 });
    expect(summary.spans.modelRequestToFirstToken).toEqual({ count: 4, p50: 1_000, p95: 2_000 });
    expect(summary.heldEagerLeadMs).toEqual({ count: 1, p50: 600, p95: 600 });
  });

  it("calls out the first response of the session separately (the 'warm-up' Elli moment)", () => {
    const summary = summarizeVoiceTurnLatency([
      record(1, "cancelled", { endOfTurnToFirstAudio: 9_000 }),
      record(2, "first_audio", { endOfTurnToFirstAudio: 6_100 }, { source: "system", toolStepsBeforeFirstToken: 2 }),
      record(3, "first_audio", { endOfTurnToFirstAudio: 2_000 }),
    ]);
    expect(summary.firstResponse).toEqual({
      turnId: 2,
      source: "system",
      endOfTurnToFirstAudio: 6_100,
      toolStepsBeforeFirstToken: 2,
    });
    const md = formatVoiceTurnLatencyReport(summary, "s");
    expect(md).toContain("First response: 6100ms (source=system, tool steps before first word=2)");
  });

  it("summarizes tool steps before the first word across completed turns", () => {
    const summary = summarizeVoiceTurnLatency([
      record(1, "first_audio", {}, { toolStepsBeforeFirstToken: 0 }),
      record(2, "first_audio", {}, { toolStepsBeforeFirstToken: 3 }),
    ]);
    expect(summary.toolStepsBeforeFirstToken).toEqual({ count: 2, p50: 0, p95: 3 });
  });

  it("renders a markdown report with the headline metric", () => {
    const summary = summarizeVoiceTurnLatency([
      record(1, "first_audio", { endOfTurnToFirstAudio: 2_300 }),
    ]);
    const md = formatVoiceTurnLatencyReport(summary, "session-abc");
    expect(md).toContain("# Voice Turn Latency: session-abc");
    expect(md).toMatch(/End of turn → first audio \| 1 \| 2300 \| 2300/);
  });
});
