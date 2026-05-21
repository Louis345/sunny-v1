import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createShowroomVideoChatEntryCopy,
  createShowroomVideoChatStartedEvent,
  createShowroomTalkPayload,
  shouldIgnoreShowroomAutoResumeTranscript,
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

  it("renders Video Chat as an unlocked testing entry point", () => {
    const copy = createShowroomVideoChatEntryCopy({
      companionName: "Elli",
    });

    expect(copy).toEqual({
      title: "Video Chat with Elli",
      actionLabel: "Video Chat",
      status: "Ready to test",
      helperText: "Camera room test shell. Economy lock is disabled for this spike.",
    });
  });

  it("emits a future-ready event when Video Chat starts", () => {
    expect(
      createShowroomVideoChatStartedEvent({
        childId: "ila",
        companionId: "elli",
        showroomTheme: "crystal",
      }),
    ).toMatchObject({
      type: "video_chat_started",
      childId: "ila",
      companionId: "elli",
      showroomTheme: "crystal",
      mode: "showroom_camera_shell",
    });
  });

  it("wires an unlocked Video Chat shell without economy lock copy", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("Video Chat");
    expect(source).toContain("showroomVideoChatOpen");
    expect(source).toContain("Start camera");
    expect(source).toContain("End video chat");
    expect(source).not.toContain("Earn 155 more coins");
    expect(source).not.toContain("Locked Reward");
    expect(source).not.toContain("Placeholder economy: final costs and balances TBD.");
    expect(source).not.toContain("coinsAwarded");
  });

  it("wires video chat voice through the existing showroom talk loop", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain('aria-label="Ask by voice in video chat"');
    expect(source).toContain("startShowroomTalkListening");
    expect(source).toContain("submitShowroomTalkQuestion");
    expect(source).toContain("videoChatMotorRef.current");
    expect(source).toContain("processShowroomCommand(videoChatMotorRef.current");
    expect(source).not.toContain("navigator.mediaDevices.getUserMedia({ audio: true");
  });

  it("starts video chat camera and listening from the call entry", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("void startShowroomVideoChatCamera({ autoListen: true })");
    expect(source).toContain("startShowroomTalkListening({ source: \"video_call\" })");
    expect(source).toContain("showroomVideoChatCameraState === \"live\"");
  });

  it("captures one small camera snapshot only for visual video-call moments", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("shouldAttachVideoSnapshotForQuestion");
    expect(source).toContain("captureShowroomVideoSnapshot");
    expect(source).toContain('aria-label="Let companion look"');
    expect(source).toContain("visualSnapshot");
    expect(source).toContain("lastVisualSummary");
    expect(source).toContain("image/jpeg");
    expect(source).toContain("0.65");
    expect(source).not.toContain("setInterval(captureShowroomVideoSnapshot");
  });

  it("keeps video chat hands-free by resuming listening after companion speech", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("videoChatContinuousListenRef");
    expect(source).toContain("if (videoChatContinuousListenRef.current)");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_RESUME_DELAY_MS");
    expect(source).toContain("startShowroomTalkListening({ source: \"video_call\" })");
    expect(source).not.toContain("Push to talk");
  });

  it("does not submit tiny auto-resume echoes from Elli's previous spoken answer", () => {
    expect(
      shouldIgnoreShowroomAutoResumeTranscript({
        transcript: "ADY",
        previousResponse: "What would you like to do today?",
      }),
    ).toBe(true);
    expect(
      shouldIgnoreShowroomAutoResumeTranscript({
        transcript: "today",
        previousResponse: "What would you like to do today?",
      }),
    ).toBe(true);
    expect(
      shouldIgnoreShowroomAutoResumeTranscript({
        transcript: "yes",
        previousResponse: "Would you like to practice spelling?",
      }),
    ).toBe(false);
    expect(
      shouldIgnoreShowroomAutoResumeTranscript({
        transcript: "Can we read?",
        previousResponse: "What would you like to do today?",
      }),
    ).toBe(false);
  });

  it("clears stale companion text before video chat starts a fresh listening turn", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    const listeningBody = source.match(
      /const startShowroomTalkListening = useCallback\([\s\S]*?recognition\.start\(\);/,
    )?.[0];

    expect(listeningBody).toBeDefined();
    expect(listeningBody).toContain("setShowroomTalkResponse(\"\")");
    expect(listeningBody).toContain("setShowroomTalkQuestion(\"\")");
  });

  it("keeps video chat attentive without looping the t-rex-prone think animation", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("createShowroomEmoteCommand");
    expect(source).toContain('emote: "thinking"');
    expect(source).not.toContain('playCurrentCompanionAnimation("think", { loop: true })');
  });
});
