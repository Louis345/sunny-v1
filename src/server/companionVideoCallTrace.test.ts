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
  it("registers every trace event accepted by the trace packet layer in the route allowlist", () => {
    const routesSource = fs.readFileSync(path.join(__dirname, "routes.ts"), "utf8");

    expect(routesSource).toContain('"activity_reaction_stale_dropped"');
    expect(routesSource).toContain('"conversation_mode_changed"');
    expect(routesSource).toContain('"activity_phase_changed"');
  });

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

  it("summarizes AI-authored activity reactions and gesture fallbacks", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_activity_reaction",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
    };

    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "reaction_1",
        eventName: "activity_reaction_request_start",
        timestamp: Date.parse("2026-05-28T18:00:00.000Z"),
        payload: {
          activityReaction: {
            activityId: "tic_tac_toe",
            eventType: "companion_move",
            board: ["X", null, null, null, "O", null, null, null, null],
          },
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "reaction_1",
        eventName: "activity_reaction_response_received",
        timestamp: Date.parse("2026-05-28T18:00:01.100Z"),
        payload: {
          responseText: "I’ll take the center. Tiny sparkle strategy.",
          commandCount: 1,
          aiAuthored: true,
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "reaction_2",
        eventName: "activity_reaction_fallback",
        timestamp: Date.parse("2026-05-28T18:00:02.000Z"),
        payload: {
          reason: "talk_failed",
          fallback: "gesture_only",
        },
      },
      { rootDir: root },
    );

    const packet = readCompanionVideoCallTracePacket("trace_activity_reaction", {
      rootDir: root,
    });

    expect(packet.activityReactions).toMatchObject({
      aiAuthoredCount: 1,
      fallbackCount: 1,
      staleDroppedCount: 0,
      averageResponseMs: 1100,
      spokenCount: 0,
      missingAudioCount: 1,
    });
    expect(packet.eventOrder.map((event) => event.eventName)).toEqual([
      "activity_reaction_request_start",
      "activity_reaction_response_received",
      "activity_reaction_fallback",
    ]);
  });

  it("surfaces stale activity reactions without misclassifying them as speech loops", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_stale_reaction",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
    };

    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "reaction_1",
        eventName: "activity_reaction_request_start",
        timestamp: Date.parse("2026-05-28T18:10:00.000Z"),
        payload: {
          activityReaction: {
            activityId: "tic_tac_toe",
            eventType: "companion_move",
            board: ["X", null, null, "O", "O", null, "X", null, null],
            boardSignature: "X--OO-X--",
          },
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "reaction_1",
        eventName: "activity_reaction_stale_dropped",
        timestamp: Date.parse("2026-05-28T18:10:04.600Z"),
        payload: {
          reason: "board_changed_before_audio",
          boardSignature: "X--OO-X--",
          currentBoardSignature: "XXOOOXXXO",
          latencyMs: 4600,
        },
      },
      { rootDir: root },
    );

    const packet = readCompanionVideoCallTracePacket("trace_stale_reaction", {
      rootDir: root,
    });

    expect(packet).toMatchObject({
      traceId: "trace_stale_reaction",
      likelyCause: "stale_activity_reaction",
      loopSuspected: false,
      activityReactions: {
        aiAuthoredCount: 0,
        fallbackCount: 0,
        staleDroppedCount: 1,
      },
    });
    expect(packet.eventOrder).toEqual([
      expect.objectContaining({ eventName: "activity_reaction_request_start" }),
      expect.objectContaining({ eventName: "activity_reaction_stale_dropped" }),
    ]);
  });

  it("reports missing activity reaction audio before generic slow response", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_missing_activity_audio",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
    };

    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "reaction_1",
        eventName: "activity_reaction_request_start",
        timestamp: Date.parse("2026-05-28T18:30:00.000Z"),
        payload: {
          activityReaction: {
            activityId: "tic_tac_toe",
            eventType: "companion_move",
            board: ["X", null, null, null, "O", null, null, null, null],
          },
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "reaction_1",
        eventName: "activity_reaction_response_received",
        timestamp: Date.parse("2026-05-28T18:30:06.500Z"),
        payload: {
          responseText: "",
          commandCount: 1,
          aiAuthored: true,
          latencySpans: {
            claudeMs: 6500,
            ttsMs: 0,
            requestToResponseMs: 6500,
          },
        },
      },
      { rootDir: root },
    );

    const packet = readCompanionVideoCallTracePacket("trace_missing_activity_audio", {
      rootDir: root,
    });

    expect(packet.likelyCause).toBe("activity_reaction_missing_audio");
    expect(packet.activityReactions).toMatchObject({
      aiAuthoredCount: 1,
      missingAudioCount: 1,
      spokenCount: 0,
    });
  });

  it("reports board-open audio interruption as its own likely cause", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_interrupted_open",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
    };

    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        turnId: "turn_1",
        eventName: "audio_error",
        timestamp: Date.parse("2026-05-28T19:00:00.000Z"),
        payload: {
          reason: "The play() request was interrupted by a call to pause().",
          activeActivity: {
            activityId: "tic_tac_toe",
          },
        },
      },
      { rootDir: root },
    );

    const packet = readCompanionVideoCallTracePacket("trace_interrupted_open", {
      rootDir: root,
    });

    expect(packet.likelyCause).toBe("activity_open_interrupted_audio");
  });

  it("reports tic-tac-toe context hijacking a social turn before generic slow response", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_game_hijacked_social",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
      turnId: "turn_12",
    };

    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        eventName: "speech_result",
        timestamp: Date.parse("2026-05-30T00:35:31.000Z"),
        payload: { transcript: "Hello. Can you hear me?" },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        eventName: "talk_request_start",
        timestamp: Date.parse("2026-05-30T00:35:31.100Z"),
        payload: {
          questionText: "Hello. Can you hear me?",
          conversationIntent: "social",
          activeActivity: { activityId: "tic_tac_toe", turn: "child" },
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        eventName: "talk_response_received",
        timestamp: Date.parse("2026-05-30T00:35:37.000Z"),
        payload: {
          responseText:
            "Yes! I can hear you perfectly! I see we have our tic-tac-toe game going - it's your turn to place an X!",
          conversationIntent: "social",
          activeActivity: { activityId: "tic_tac_toe", turn: "child" },
        },
      },
      { rootDir: root },
    );

    const packet = readCompanionVideoCallTracePacket("trace_game_hijacked_social", {
      rootDir: root,
    });

    expect(packet).toMatchObject({
      likelyCause: "game_context_overrode_social_intent",
      loopSuspected: false,
    });
  });

  it("reports tic-tac-toe context hijacking repeat-after before repeated or slow response", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_game_hijacked_repeat",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
      turnId: "turn_14",
    };

    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        eventName: "speech_result",
        timestamp: Date.parse("2026-05-30T00:36:00.000Z"),
        payload: { transcript: "Ten" },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        eventName: "talk_request_start",
        timestamp: Date.parse("2026-05-30T00:36:00.050Z"),
        payload: {
          questionText: "Ten",
          conversationIntent: "repeat_after",
          activeActivity: { activityId: "tic_tac_toe", turn: "child" },
        },
      },
      { rootDir: root },
    );
    recordCompanionVideoCallTraceEvent(
      {
        ...base,
        eventName: "talk_response_received",
        timestamp: Date.parse("2026-05-30T00:36:01.400Z"),
        payload: {
          responseText:
            'Hmm, I\'m not sure what "ten" means for our tic-tac-toe game! Are you trying to pick square 10?',
          conversationIntent: "repeat_after",
          activeActivity: { activityId: "tic_tac_toe", turn: "child" },
        },
      },
      { rootDir: root },
    );

    const packet = readCompanionVideoCallTracePacket("trace_game_hijacked_repeat", {
      rootDir: root,
    });

    expect(packet).toMatchObject({
      likelyCause: "game_context_overrode_social_intent",
      loopSuspected: false,
    });
  });

  it("does not flag mirrored client/server lifecycle records as repeated turns", () => {
    const root = makeTraceRoot();
    const base = {
      traceId: "trace_mirrored",
      childId: "ila",
      companionId: "elli",
      callSource: "showroom" as const,
      relationshipState: "previewing" as const,
      turnId: "turn_1",
    };

    for (const timestamp of [
      Date.parse("2026-05-28T18:20:00.000Z"),
      Date.parse("2026-05-28T18:20:00.010Z"),
    ]) {
      recordCompanionVideoCallTraceEvent(
        {
          ...base,
          eventName: "talk_request_start",
          timestamp,
          origin: timestamp === Date.parse("2026-05-28T18:20:00.000Z") ? "client" : "server",
          payload: { questionText: "Let's play tic-tac-toe." },
        },
        { rootDir: root },
      );
    }
    for (const timestamp of [
      Date.parse("2026-05-28T18:20:01.000Z"),
      Date.parse("2026-05-28T18:20:01.030Z"),
    ]) {
      recordCompanionVideoCallTraceEvent(
        {
          ...base,
          eventName: "talk_response_received",
          timestamp,
          origin: timestamp === Date.parse("2026-05-28T18:20:01.000Z") ? "server" : "client",
          payload: { responseText: "Let's play!" },
        },
        { rootDir: root },
      );
    }

    const packet = readCompanionVideoCallTracePacket("trace_mirrored", {
      rootDir: root,
    });

    expect(packet).toMatchObject({
      likelyCause: "none",
      loopSuspected: false,
    });
    expect(packet.eventOrder).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: "talk_request_start", origin: "client" }),
        expect.objectContaining({ eventName: "talk_request_start", origin: "server" }),
        expect.objectContaining({ eventName: "talk_response_received", origin: "server" }),
        expect.objectContaining({ eventName: "talk_response_received", origin: "client" }),
      ]),
    );
  });
});
