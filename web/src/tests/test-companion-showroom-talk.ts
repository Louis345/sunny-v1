import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createShowroomVideoCallStatusCopy,
  createShowroomVideoChatEntryCopy,
  createShowroomVideoChatStartedEvent,
  createShowroomTalkPayload,
  getShowroomTalkRequestedAnimation,
  getShowroomVoiceErrorRecovery,
  shouldIgnoreShowroomAutoResumeTranscript,
  shouldApplyShowroomTalkCommand,
  shouldGateShowroomTalkMic,
  shouldIdleImmediatelyAfterSilentTalk,
  shouldPlayShowroomListeningGesture,
  selectShowroomTalkPlaybackCommands,
  toShowroomIdleLoopCommand,
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

  it("shows a ringing and answer ceremony before camera/listening starts", () => {
    expect(
      createShowroomVideoCallStatusCopy({
        companionName: "Elli",
        phase: "calling",
        cameraState: "off",
      }),
    ).toEqual({
      heading: "Calling Elli...",
      status: "Ringing",
      helperText: "Elli will answer, then the camera starts.",
    });
    expect(
      createShowroomVideoCallStatusCopy({
        companionName: "Elli",
        phase: "answered",
        cameraState: "requesting",
      }),
    ).toMatchObject({
      heading: "Elli answered",
      status: "Connecting camera",
    });

    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );
    expect(source).toContain("playVideoCallRingtone");
    expect(source).toContain("showroomVideoCallPhase");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_RING_MS");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_ANSWER_MS");
    expect(source).toContain("[showroom-video-chat] ringing");
    expect(source).toContain("[showroom-video-chat] answered");
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

  it("defaults video chat to guarded hands-free rearming after companion speech", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("videoChatContinuousListenRef");
    expect(source).toContain("startShowroomTalkListening({ source: \"video_call\" })");
    expect(source).toContain("auto-start");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_HANDS_FREE_REARM_MS");
    expect(source).toContain("videoChatHandsFreeRearmRef");
    expect(source).toContain("[showroom-hands-free] rearm_scheduled");
    expect(source).toContain("[showroom-hands-free] rearm_starting");
    expect(source).not.toContain("SHOWROOM_VIDEO_CHAT_RESUME_DELAY_MS");
    expect(source).not.toContain("queueVideoChatListeningResumeRef");
    expect(source).not.toContain("listen_resume");
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

  it("keeps video-call no-speech from becoming child-visible error spam", () => {
    expect(
      getShowroomVoiceErrorRecovery({
        source: "video_call",
        error: "no-speech",
        retryCount: 0,
      }),
    ).toEqual({
      displayError: null,
      shouldRetry: true,
      quietRetry: true,
      nextRetryCount: 1,
    });
    expect(
      getShowroomVoiceErrorRecovery({
        source: "video_call",
        error: "no-speech",
        retryCount: 2,
      }),
    ).toEqual({
      displayError: null,
      shouldRetry: false,
      quietRetry: true,
      nextRetryCount: 2,
    });
    expect(
      getShowroomVoiceErrorRecovery({
        source: "showroom",
        error: "no-speech",
        retryCount: 0,
      }),
    ).toMatchObject({
      displayError: "Voice input: no-speech",
      shouldRetry: false,
    });
  });

  it("does not gesture every time video-call listening restarts", () => {
    expect(shouldPlayShowroomListeningGesture("showroom")).toBe(true);
    expect(shouldPlayShowroomListeningGesture("video_call")).toBe(false);
    expect(shouldPlayShowroomListeningGesture("video_call", { quiet: false })).toBe(false);
  });

  it("limits a talk turn to one body animation and prefers the real dance move", () => {
    const base = {
      apiVersion: "1.0" as const,
      childId: "showroom",
      source: "claude" as const,
      timestamp: Date.now(),
    };
    const selected = selectShowroomTalkPlaybackCommands([
      {
        ...base,
        type: "animate",
        payload: { animation: "wave", loop: false },
      },
      {
        ...base,
        timestamp: base.timestamp + 1,
        type: "animate",
        payload: { animation: "dance_victory", loop: false },
      },
      {
        ...base,
        timestamp: base.timestamp + 2,
        type: "emote",
        payload: { emote: "happy", intensity: 0.8 },
      },
    ]);

    expect(selected).toHaveLength(2);
    expect(selected[0]).toMatchObject({
      type: "animate",
      payload: { animation: "dance_victory" },
    });
    expect(selected[1]).toMatchObject({
      type: "emote",
      payload: { emote: "happy" },
    });
  });

  it("routes child dance requests through the companion signature dance", () => {
    const base = {
      apiVersion: "1.0" as const,
      childId: "showroom",
      source: "claude" as const,
      timestamp: Date.now(),
    };
    const requestedAnimation = getShowroomTalkRequestedAnimation({
      question: "Can you do your signature dance?",
      specialDance: "silly_dancing",
    });
    const selected = selectShowroomTalkPlaybackCommands(
      [
        {
          ...base,
          type: "animate",
          payload: { animation: "wave", loop: false },
        },
      ],
      { requestedAnimation },
    );

    expect(requestedAnimation).toBe("silly_dancing");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      source: "diag",
      type: "animate",
      payload: { animation: "silly_dancing", loop: false },
    });
  });

  it("lets silent visual-only dance turns finish instead of canceling them with idle", () => {
    const danceCommand = {
      apiVersion: "1.0" as const,
      childId: "showroom",
      source: "diag" as const,
      timestamp: Date.now(),
      type: "animate",
      payload: { animation: "salsa_dancing", loop: false },
    };

    expect(shouldIdleImmediatelyAfterSilentTalk([danceCommand])).toBe(false);
    expect(shouldIdleImmediatelyAfterSilentTalk([])).toBe(true);
  });

  it("forces talk completion back to a looping idle animation", () => {
    const idleCommand = {
      apiVersion: "1.0" as const,
      childId: "showroom",
      source: "claude" as const,
      timestamp: Date.now(),
      type: "animate",
      payload: { animation: "idle", loop: false },
    };

    expect(toShowroomIdleLoopCommand(idleCommand)).toMatchObject({
      type: "animate",
      payload: { animation: "idle", loop: true },
    });
    expect(toShowroomIdleLoopCommand(idleCommand).source).toBe("diag");
    expect(toShowroomIdleLoopCommand(idleCommand).timestamp).not.toBe(
      idleCommand.timestamp,
    );
    expect(toShowroomIdleLoopCommand(null)).toMatchObject({
      type: "animate",
      payload: { animation: "idle", loop: true },
    });
  });

  it("logs the video-call speech-to-idle transition for human-caught pose bugs", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/CompanionShowroom.tsx"),
      "utf8",
    );

    expect(source).toContain("[showroom-talk] speaking_start");
    expect(source).toContain("[showroom-talk] audio_ended");
    expect(source).toContain("[showroom-talk] idle_applied");
    expect(source).not.toContain("[showroom-talk] listen_resume");
  });
});
