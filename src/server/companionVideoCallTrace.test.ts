import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  readCompanionVideoCallTracePacket,
  recordCompanionVideoCallTraceEvent,
} from "./companionVideoCallTrace";

function makeTraceRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-video-call-trace-test-"));
}

function readTraceFolder(root: string, traceId: string): string {
  const monthRoot = path.join(root, "2026", "05");
  const match = fs
    .readdirSync(monthRoot)
    .find((name) => name.endsWith(`_showroom_video_call_${traceId}`));
  if (!match) throw new Error(`missing trace folder for ${traceId}`);
  return path.join(monthRoot, match);
}

describe("companion video call traces", () => {
  it("appends sanitized trace rows under logs/sessions YYYY/MM folders", () => {
    const root = makeTraceRoot();

    recordCompanionVideoCallTraceEvent(
      {
        traceId: "trace_test",
        eventName: "call_started",
        childId: "ila",
        companionId: "elli",
        callSource: "showroom",
        relationshipState: "previewing",
        timestamp: Date.parse("2026-05-28T16:00:00.000Z"),
        payload: {
          visualSnapshot: {
            base64: "raw-camera-frame",
            mimeType: "image/jpeg",
            width: 512,
            height: 384,
          },
          audioBase64: "raw-audio",
          providerPayload: { secret: "nope" },
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        traceId: "trace_test",
        turnId: "turn_1",
        eventName: "speech_result",
        childId: "ila",
        companionId: "elli",
        timestamp: Date.parse("2026-05-28T16:00:01.000Z"),
        payload: {
          transcript: "Can you see my tic tac toe move?",
          activeActivity: {
            activityId: "tic_tac_toe",
            board: ["X", null, null, null, "O", null, null, null, null],
            turn: "child",
          },
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        traceId: "trace_test",
        turnId: "turn_1",
        eventName: "talk_response_received",
        childId: "ila",
        companionId: "elli",
        timestamp: Date.parse("2026-05-28T16:00:02.250Z"),
        payload: {
          responseText: "I see the board context. Try a corner next!",
          commandCount: 1,
          visionUsed: false,
        },
      },
      { rootDir: root },
    );

    const traceFolder = readTraceFolder(root, "trace_test");
    const traceText = fs.readFileSync(
      path.join(traceFolder, "companion-call-trace.ndjson"),
      "utf8",
    );
    const summary = JSON.parse(
      fs.readFileSync(path.join(traceFolder, "trace-summary.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(traceText.trim().split("\n")).toHaveLength(3);
    expect(traceText).toContain("transcriptPreview");
    expect(traceText).toContain("transcriptHash");
    expect(traceText).toContain("responsePreview");
    expect(traceText).toContain("responseHash");
    expect(traceText).toContain("tic_tac_toe");
    expect(traceText).not.toContain("raw-camera-frame");
    expect(traceText).not.toContain("raw-audio");
    expect(traceText).not.toContain("providerPayload");
    expect(fs.existsSync(path.join(traceFolder, "upload-status.json"))).toBe(true);
    expect(summary).toMatchObject({
      traceId: "trace_test",
      childId: "ila",
      companionId: "elli",
      eventCount: 3,
      likelyCause: "none",
    });
  });

  it("returns a compact truth packet with deterministic loop cause", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_loop",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
    };

    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "turn_1",
        eventName: "speech_result",
        timestamp: Date.parse("2026-05-28T17:00:00.000Z"),
        payload: { transcript: "What would you like to do today?" },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "turn_1",
        eventName: "talk_response_received",
        timestamp: Date.parse("2026-05-28T17:00:01.200Z"),
        payload: { responseText: "What would you like to do today?" },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "turn_2",
        eventName: "speech_result",
        timestamp: Date.parse("2026-05-28T17:00:02.000Z"),
        payload: { transcript: "What would you like to do today?" },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "turn_2",
        eventName: "loop_suspected",
        timestamp: Date.parse("2026-05-28T17:00:02.100Z"),
        payload: { reason: "transcript_echoed_last_companion_response" },
      },
      { rootDir: root },
    );

    const packet = readCompanionVideoCallTracePacket("trace_loop", { rootDir: root });

    expect(packet).toMatchObject({
      traceId: "trace_loop",
      likelyCause: "speech_recognition_echo",
      loopSuspected: true,
    });
    expect(packet.eventOrder.map((event) => event.eventName)).toEqual([
      "speech_result",
      "talk_response_received",
      "speech_result",
      "loop_suspected",
    ]);
    expect(packet.turns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          turnId: "turn_1",
          transcriptPreview: "What would you like to do today?",
          responsePreview: "What would you like to do today?",
          requestToResponseMs: 1200,
        }),
      ]),
    );
    expect(JSON.stringify(packet)).not.toContain("base64");
    expect(JSON.stringify(packet)).not.toContain("audioBase64");
  });
});
