import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildShowroomClaudeMessages,
  buildShowroomTalkSystemPrompt,
  createShowroomTalkCompletedEvent,
  createShowroomTalkPhaseCommand,
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
      },
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

  it("requires spoken text even when Claude uses companionAct", () => {
    const prompt = buildShowroomTalkSystemPrompt({
      companionId: "elli",
      companionName: "Elli",
      showroomTheme: "crystal",
      personality: "Warm, playful, brave.",
      mode: "video_call",
      hasFreshVisualSnapshot: false,
    });

    expect(prompt).toContain("Always include words for Elli to say aloud");
    expect(prompt).toContain("even when you call companionAct");
  });

  it("does not let companionAct-only turns fall through to the thinking fallback", () => {
    const routeSource = readFileSync(resolve(__dirname, "routes.ts"), "utf8");

    expect(routeSource).toContain("tool_result");
    expect(routeSource).toContain("showroom_companion_act_result");
    expect(routeSource).not.toContain(
      "text || `${companion.name} is thinking. Ask me that one more time.`",
    );
  });

});
