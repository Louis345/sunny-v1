import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createShowroomTalkPayload,
  shouldApplyShowroomTalkCommand,
  shouldGateShowroomTalkMic,
} from "../components/CompanionShowroom";

describe("CompanionShowroom talk mode", () => {
  it("sends the selected companion, selected voice, room, child, and question", () => {
    expect(
      createShowroomTalkPayload({
        childId: "ila",
        companionId: "kefla",
        voiceId: "voice_b",
        showroomTheme: "crystal",
        question: "Can you help with spelling?",
      }),
    ).toEqual({
      childId: "ila",
      companionId: "kefla",
      voiceId: "voice_b",
      showroomTheme: "crystal",
      question: "Can you help with spelling?",
    });
  });

  it("gates the mic while the companion is speaking but not while the child is talking", () => {
    expect(shouldGateShowroomTalkMic("idle")).toBe(false);
    expect(shouldGateShowroomTalkMic("listening")).toBe(false);
    expect(shouldGateShowroomTalkMic("thinking")).toBe(true);
    expect(shouldGateShowroomTalkMic("speaking")).toBe(true);
  });

  it("applies talk commands only to the currently selected companion", () => {
    const command = {
      apiVersion: "1.0" as const,
      childId: "showroom",
      source: "claude" as const,
      timestamp: Date.now(),
      type: "animate",
      payload: { animation: "talking", loop: true, companionId: "kefla" },
    };

    expect(shouldApplyShowroomTalkCommand(command, "kefla")).toBe(true);
    expect(shouldApplyShowroomTalkCommand(command, "elli")).toBe(false);
  });

  it("wires a Talk button without adding direct pose or motor animation calls", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("Talk with");
    expect(source).toContain("showroomTalkPhase");
    expect(source).toContain("submitShowroomTalkQuestion");
    expect(source).toContain("processShowroomCommand(motorsRef.current.current");
    expect(source).not.toContain(".playAnimation(");
  });
});
