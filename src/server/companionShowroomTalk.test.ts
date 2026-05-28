import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildShowroomClaudeMessages,
  buildShowroomTalkMemoryPrompt,
  buildShowroomTalkSystemPrompt,
  createShowroomCompanionActivityRequest,
  createShowroomTalkCompletedEvent,
  createShowroomTalkPhaseCommand,
  getShowroomCompanionActivityTools,
  resolveShowroomSpokenText,
  resolveShowroomTalkRequest,
} from "./companionShowroomTalk";

describe("companion showroom talk contract", () => {
  const voiceOptions = [
    { id: "voice_a", label: "Voice A", language: "en", default: true },
    { id: "voice_b", label: "Voice B", language: "en" },
  ];

  it("preserves the selected companion, selected voice, room, child, and question", () => {
    const result = resolveShowroomTalkRequest(
      {
        childId: "ila",
        companionId: "kefla",
        voiceId: "voice_b",
        showroomTheme: "crystal",
        question: "Can you help me train for spelling?",
      },
      {
        routeCompanionId: "kefla",
        voiceOptions,
        fallbackVoiceId: "voice_a",
      },
    );

    expect(result).toEqual({
      ok: true,
      request: {
        childId: "ila",
        companionId: "kefla",
        voiceId: "voice_b",
        showroomTheme: "crystal",
        question: "Can you help me train for spelling?",
        callSource: "showroom",
        relationshipState: "previewing",
      },
    });
  });

  it("accepts explicit earned reward call context for future Mystery Box calls", () => {
    const result = resolveShowroomTalkRequest(
      {
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "I opened the mystery box!",
        callSource: "mystery_box",
        relationshipState: "earned_reward",
        rewardContext: {
          nodeId: "n-mystery-1",
          activityId: "mystery",
          rewardId: "video_call_ticket",
          earnedBy: "finished word radar",
        },
      },
      {
        routeCompanionId: "elli",
        voiceOptions,
        fallbackVoiceId: "voice_a",
      },
    );

    expect(result).toEqual({
      ok: true,
      request: expect.objectContaining({
        childId: "ila",
        companionId: "elli",
        mode: "video_call",
        callSource: "mystery_box",
        relationshipState: "earned_reward",
        rewardContext: {
          nodeId: "n-mystery-1",
          activityId: "mystery",
          rewardId: "video_call_ticket",
          earnedBy: "finished word radar",
        },
      }),
    });
  });

  it("preserves active tic-tac-toe context so Claude knows the game is open", () => {
    const result = resolveShowroomTalkRequest(
      {
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "What should I do next?",
        activeActivity: {
          activityId: "tic_tac_toe",
          surface: "video_call_overlay",
          status: "active",
          board: ["X", null, null, null, "O", null, null, null, null],
          childMark: "X",
          companionMark: "O",
          turn: "child",
          lastMove: {
            by: "companion",
            square: 5,
            mark: "O",
            timestamp: 1000,
          },
        },
      },
      {
        routeCompanionId: "elli",
        voiceOptions,
        fallbackVoiceId: "voice_a",
      },
    );

    expect(result).toEqual({
      ok: true,
      request: expect.objectContaining({
        activeActivity: {
          activityId: "tic_tac_toe",
          surface: "video_call_overlay",
          status: "active",
          board: ["X", null, null, null, "O", null, null, null, null],
          childMark: "X",
          companionMark: "O",
          turn: "child",
          lastMove: {
            by: "companion",
            square: 5,
            mark: "O",
            timestamp: 1000,
          },
        },
      }),
    });
  });

  it("accepts video-call trace and turn ids without treating them as provider content", () => {
    const result = resolveShowroomTalkRequest(
      {
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "Can you see this?",
        callTraceId: "trace123",
        turnId: "trace123_turn_1",
      },
      {
        routeCompanionId: "elli",
        voiceOptions,
        fallbackVoiceId: "voice_a",
      },
    );

    expect(result).toEqual({
      ok: true,
      request: expect.objectContaining({
        callTraceId: "trace123",
        turnId: "trace123_turn_1",
      }),
    });
  });

  it("rejects companion id mismatches instead of letting another companion answer", () => {
    const result = resolveShowroomTalkRequest(
      {
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "storybook",
        question: "Who are you?",
      },
      {
        routeCompanionId: "kefla",
        voiceOptions,
        fallbackVoiceId: "voice_a",
      },
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "companion_mismatch",
    });
  });

  it("builds a short persona prompt that tells Claude to show emotion through companionAct", () => {
    const prompt = buildShowroomTalkSystemPrompt({
      companionId: "kefla",
      companionName: "Kefla",
      showroomTheme: "crystal",
      personality:
        "Fierce anime warrior grit: treats lessons like training, big energy, zero meanness.",
    });

    expect(prompt).toContain("You are Kefla");
    expect(prompt).toContain("crystal");
    expect(prompt).toContain("1-3 short sentences");
    expect(prompt).toContain("companionAct");
    expect(prompt).toContain("show emotion through movement");
    expect(prompt).not.toContain("award coins");
    expect(prompt).not.toContain("award XP");
  });

  it("adds active tic-tac-toe board context to the video-call prompt", () => {
    const prompt = buildShowroomTalkSystemPrompt({
      companionId: "elli",
      companionName: "Elli",
      showroomTheme: "crystal",
      personality: "Warm, playful, and encouraging.",
      mode: "video_call",
      activeActivity: {
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        status: "active",
        board: ["X", null, null, null, "O", null, null, null, null],
        childMark: "X",
        companionMark: "O",
        turn: "child",
        lastMove: {
          by: "companion",
          square: 5,
          mark: "O",
          timestamp: 1000,
        },
      },
    });

    expect(prompt).toContain("Active video-call activity: tic-tac-toe.");
    expect(prompt).toContain("Board: 1=X, 2=empty, 3=empty, 4=empty, 5=O");
    expect(prompt).toContain("Current turn: child.");
    expect(prompt).toContain("Last move: companion placed O on square 5.");
    expect(prompt).toContain("Stay aware of this activity");
  });

  it("tells Claude whether a call is previewing or an earned reward", () => {
    const showroomPrompt = buildShowroomTalkSystemPrompt({
      companionId: "elli",
      companionName: "Elli",
      showroomTheme: "crystal",
      personality: "Warm, playful, brave.",
      mode: "video_call",
      hasFreshVisualSnapshot: false,
      callSource: "showroom",
      relationshipState: "previewing",
    });
    const rewardPrompt = buildShowroomTalkSystemPrompt({
      companionId: "elli",
      companionName: "Elli",
      showroomTheme: "crystal",
      personality: "Warm, playful, brave.",
      mode: "video_call",
      hasFreshVisualSnapshot: false,
      callSource: "mystery_box",
      relationshipState: "earned_reward",
      rewardContext: {
        nodeId: "n-mystery-1",
        activityId: "mystery",
        rewardId: "video_call_ticket",
        earnedBy: "finished word radar",
      },
    });

    expect(showroomPrompt).toContain("may not have chosen you yet");
    expect(rewardPrompt).toContain("earned this call");
    expect(rewardPrompt).toContain("celebrate");
    expect(rewardPrompt).toContain("without turning it into homework");
    expect(rewardPrompt).toContain("finished word radar");
  });

  it("formats compacted companion memory for prompts without raw logs", () => {
    const prompt = buildShowroomTalkMemoryPrompt({
      firstMetAt: "2026-05-01T00:00:00.000Z",
      lastSessionSummary: "Ila laughed when Elli did a silly dance.",
      lastEmotionalMoment: "Ila felt proud after reading a hard word.",
      reunionLineSeed: "Ask about the brave-color drawing.",
      relationshipFacts: ["Ila likes silly dances"],
      favoriteMoments: ["Elli cheered for the blue marker drawing"],
      emotionalTone: "playful and brave",
      lastCompanionInteractionCompactedAt: "2026-05-27T12:00:00.000Z",
    });

    expect(prompt).toContain("Ila laughed");
    expect(prompt).toContain("silly dances");
    expect(prompt).toContain("playful and brave");
    expect(prompt).not.toContain("base64");
    expect(prompt).not.toContain("visualSnapshot");
  });

  it("creates validated phase commands through the companion command contract", () => {
    const thinking = createShowroomTalkPhaseCommand({
      childId: "showroom",
      companionId: "kefla",
      phase: "thinking",
    });
    const speaking = createShowroomTalkPhaseCommand({
      childId: "showroom",
      companionId: "kefla",
      phase: "speaking",
    });

    expect(thinking).toMatchObject({
      apiVersion: "1.0",
      childId: "showroom",
      source: "claude",
      type: "animate",
      payload: { animation: "think", loop: true },
    });
    expect(speaking).toMatchObject({
      apiVersion: "1.0",
      childId: "showroom",
      source: "claude",
      type: "animate",
      payload: { animation: "talking", loop: true },
    });
  });

  it("emits a future-ready completion event without awarding economy currency", () => {
    const event = createShowroomTalkCompletedEvent({
      childId: "ila",
      companionId: "kefla",
      showroomTheme: "storybook",
      question: "Can you help?",
      responseText: "Training starts with one brave try.",
    });

    expect(event).toMatchObject({
      type: "companion_talk_completed",
      childId: "ila",
      companionId: "kefla",
      showroomTheme: "storybook",
      questionLength: 13,
      responseLength: 35,
    });
    expect(event).not.toHaveProperty("coinsAwarded");
    expect(event).not.toHaveProperty("xpAwarded");
  });

  it("accepts video-call mode with a small camera snapshot and visual summary", () => {
    const result = resolveShowroomTalkRequest(
      {
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "Look at this drawing.",
        callSource: "showroom",
        relationshipState: "previewing",
        lastVisualSummary: "The child was holding a blue marker.",
        visualSnapshot: {
          base64: "a".repeat(128),
          mimeType: "image/jpeg",
          reason: "child_asked_visual_question",
          capturedAt: 1_765_000_000_000,
          width: 512,
          height: 384,
        },
      },
      {
        routeCompanionId: "elli",
        voiceOptions,
        fallbackVoiceId: "voice_a",
      },
    );

    expect(result).toEqual({
      ok: true,
      request: {
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "Look at this drawing.",
        callSource: "showroom",
        relationshipState: "previewing",
        lastVisualSummary: "The child was holding a blue marker.",
        visualSnapshot: {
          base64: "a".repeat(128),
          mimeType: "image/jpeg",
          reason: "child_asked_visual_question",
          capturedAt: 1_765_000_000_000,
          width: 512,
          height: 384,
        },
      },
    });
  });

  it("rejects invalid or oversized video snapshots before Claude sees them", () => {
    const result = resolveShowroomTalkRequest(
      {
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "Look at this.",
        callSource: "showroom",
        relationshipState: "previewing",
        visualSnapshot: {
          base64: "a".repeat(1_100_000),
          mimeType: "image/png",
          reason: "too_large",
          capturedAt: Date.now(),
          width: 2400,
          height: 1800,
        },
      },
      {
        routeCompanionId: "elli",
        voiceOptions,
        fallbackVoiceId: "voice_a",
      },
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "invalid_visual_snapshot",
    });
  });

  it("builds a video-call prompt that forbids visual claims without a fresh snapshot", () => {
    const prompt = buildShowroomTalkSystemPrompt({
      companionId: "elli",
      companionName: "Elli",
      showroomTheme: "crystal",
      personality: "Warm, playful, brave.",
      mode: "video_call",
      hasFreshVisualSnapshot: false,
      lastVisualSummary: "The child was holding a blue marker.",
    });

    expect(prompt).toContain("You are in a video call");
    expect(prompt).toContain("Do not claim you can see");
    expect(prompt).toContain("fresh camera snapshot");
    expect(prompt).toContain("ask the child to tap Look");
    expect(prompt).toContain("The child was holding a blue marker.");
  });

  it("adds image content only when a fresh video snapshot is provided", () => {
    const withoutSnapshot = buildShowroomClaudeMessages({
      question: "Can you help me?",
      mode: "video_call",
    });
    const withSnapshot = buildShowroomClaudeMessages({
      question: "Look at this.",
      mode: "video_call",
      visualSnapshot: {
        base64: "abc123",
        mimeType: "image/jpeg",
        reason: "look_button",
        capturedAt: 1_765_000_000_000,
        width: 512,
        height: 384,
      },
    });

    expect(JSON.stringify(withoutSnapshot)).not.toContain("image");
    expect(JSON.stringify(withSnapshot)).toContain("image");
    expect(JSON.stringify(withSnapshot)).toContain("abc123");
  });

  it("marks completion events with mode and snapshot metadata only", () => {
    const event = createShowroomTalkCompletedEvent({
      childId: "ila",
      companionId: "elli",
      showroomTheme: "crystal",
      question: "Look at this.",
      responseText: "That drawing has brave colors.",
      mode: "video_call",
      callSource: "showroom",
      relationshipState: "previewing",
      visionUsed: true,
      visualSnapshot: {
        base64: "raw-image-data-must-not-leak",
        mimeType: "image/jpeg",
        reason: "look_button",
        capturedAt: 1_765_000_000_000,
        width: 512,
        height: 384,
      },
    });

    expect(event).toMatchObject({
      type: "companion_talk_completed",
      mode: "video_call",
      visionUsed: true,
      callSource: "showroom",
      relationshipState: "previewing",
      visualSnapshot: {
        mimeType: "image/jpeg",
        reason: "look_button",
        width: 512,
        height: 384,
      },
    });
    expect(JSON.stringify(event)).not.toContain("raw-image-data-must-not-leak");
  });

  it("forbids spoken stage directions because gestures must be companionAct commands", () => {
    const prompt = buildShowroomTalkSystemPrompt({
      companionId: "elli",
      companionName: "Elli",
      showroomTheme: "crystal",
      personality: "Warm, playful, brave.",
      mode: "video_call",
      hasFreshVisualSnapshot: true,
    });

    expect(prompt).toContain("Do not say stage directions");
    expect(prompt).toContain("Do not say things like");
    expect(prompt).toContain("I wave");
    expect(prompt).toContain("call companionAct");
  });

  it("passes companionAct as a real Anthropic tool and parses tool_use commands", () => {
    const routeSource = readFileSync(resolve(__dirname, "routes.ts"), "utf8");

    expect(routeSource).toContain("tools:");
    expect(routeSource).toContain("companionAct");
    expect(routeSource).toContain("tool_use");
    expect(routeSource).toContain("phaseCommands");
  });

  it("exposes openCompanionActivity as a product tool for tic-tac-toe overlays", () => {
    const tools = getShowroomCompanionActivityTools();
    const toolNames = tools.map((tool) => tool.name);
    const source = JSON.stringify(tools);

    expect(toolNames).toContain("openCompanionActivity");
    expect(source).toContain("tic_tac_toe");
    expect(source).toContain("video_call_overlay");
    expect(source).not.toContain("chess");
  });

  it("validates tic-tac-toe activity requests without overloading gesture commands", () => {
    expect(
      createShowroomCompanionActivityRequest({
        childId: "ila",
        companionId: "elli",
        rawInput: {
          activityId: "tic_tac_toe",
          surface: "video_call_overlay",
          reason: "child_accepted_game_invite",
        },
      }),
    ).toMatchObject({
      source: "claude",
      childId: "ila",
      companionId: "elli",
      activityId: "tic_tac_toe",
      surface: "video_call_overlay",
      reason: "child_accepted_game_invite",
    });
    expect(
      createShowroomCompanionActivityRequest({
        childId: "ila",
        companionId: "elli",
        rawInput: {
          activityId: "chess",
          surface: "video_call_overlay",
        },
      }),
    ).toBeNull();
    expect(
      createShowroomCompanionActivityRequest({
        childId: "ila",
        companionId: "elli",
        rawInput: {
          activityId: "tic_tac_toe",
          surface: "new_page",
        },
      }),
    ).toBeNull();
  });

  it("keeps portrait speech optional when visual companionAct is enough", () => {
    const prompt = buildShowroomTalkSystemPrompt({
      companionId: "elli",
      companionName: "Elli",
      showroomTheme: "crystal",
      personality: "Warm, playful, brave.",
      mode: "video_call",
      hasFreshVisualSnapshot: false,
    });

    expect(prompt).toContain("Speech is optional");
    expect(prompt).toContain("visual action is preferred");
    expect(prompt).not.toContain("Always include words for Elli to say aloud");
    expect(prompt).not.toContain("even when you call companionAct");
  });

  it("does not synthesize fallback speech for companionAct-only turns", () => {
    expect(
      resolveShowroomSpokenText({
        rawText: "",
        companionCommandCount: 1,
      }),
    ).toBe("");
    expect(
      resolveShowroomSpokenText({
        rawText: "  Tiny hello.  ",
        companionCommandCount: 1,
      }),
    ).toBe("Tiny hello.");
    expect(
      resolveShowroomSpokenText({
        rawText: "",
        companionCommandCount: 0,
      }),
    ).toBe("I'm here with you. Let's keep going.");
  });

  it("does not let companionAct-only turns fall through to the thinking fallback", () => {
    const routeSource = readFileSync(resolve(__dirname, "routes.ts"), "utf8");

    expect(routeSource).toContain("tool_result");
    expect(routeSource).toContain("showroom_companion_act_result");
    expect(routeSource).toContain("openCompanionActivity");
    expect(routeSource).toContain("showroom_companion_activity_result");
    expect(routeSource).toContain("createShowroomCompanionActivityRequest");
    expect(routeSource).toContain("activityRequests");
    expect(routeSource).toContain("recordCompanionInteractionEvent");
    expect(routeSource).toContain("maybeCompactCompanionInteractionMemory");
    expect(routeSource).not.toContain(
      "text || `${companion.name} is thinking. Ask me that one more time.`",
    );
  });

});
