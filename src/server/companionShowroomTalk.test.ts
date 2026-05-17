import { describe, expect, it } from "vitest";
import {
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
});
