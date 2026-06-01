import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createShowroomVideoCallStatusCopy,
  createShowroomVideoChatEntryCopy,
  createShowroomVideoChatStartedEvent,
  resolveVideoCallPickupGreeting,
  createShowroomVideoActivityContextFromEvent,
  createShowroomTalkPayload,
  createShowroomVideoCallContextFromSearch,
  getShowroomActivityBoardSignature,
  getShowroomVideoChatLatencyBudget,
  inferShowroomVideoConversationIntent,
  isShowroomActivityReactionCurrent,
  resolveShowroomTalkChildId,
  getShowroomTalkRequestedAnimation,
  getShowroomVoiceErrorRecovery,
  resolveShowroomContainedSlotFraming,
  shouldIgnoreShowroomAutoResumeTranscript,
  shouldApplyShowroomTalkCommand,
  shouldGateShowroomTalkMic,
  shouldIdleImmediatelyAfterSilentTalk,
  shouldPlayShowroomListeningGesture,
  shouldRequestShowroomActivityReaction,
  selectShowroomTalkPlaybackCommands,
  toShowroomIdleLoopCommand,
} from "../components/CompanionShowroom";

function readShowroomSource(): string {
  return readFileSync(resolve(__dirname, "../components/CompanionShowroom.tsx"), "utf8");
}

function readVideoCallSource(): string {
  return readFileSync(
    resolve(__dirname, "../components/CompanionVideoCallOverlay.tsx"),
    "utf8",
  );
}

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
      callSource: "showroom",
      relationshipState: "previewing",
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
    const source = readShowroomSource();

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

  it("resolves companion-specific showroom pickup greetings", () => {
    expect(
      resolveVideoCallPickupGreeting({
        companionId: "elli",
        companionName: "Elli",
        childName: "Ila",
        callSource: "showroom",
        relationshipState: "previewing",
      }),
    ).toEqual({
      text: "Hiii Ila! I was hoping you'd call.",
      usedMemorySeed: false,
    });
    expect(
      resolveVideoCallPickupGreeting({
        companionId: "kefla",
        companionName: "Kefla",
        childName: "Ila",
        callSource: "showroom",
        relationshipState: "previewing",
      }).text,
    ).toBe("You called? Good. I was ready for a challenge.");
    expect(
      resolveVideoCallPickupGreeting({
        companionId: "matilda",
        companionName: "Matilda",
        childName: "Ila",
        callSource: "showroom",
        relationshipState: "previewing",
      }).text,
    ).toBe("Hi Ila. I saved a calm little spot for us.");
    expect(
      resolveVideoCallPickupGreeting({
        companionId: "princess",
        companionName: "Princess",
        childName: "Ila",
        callSource: "showroom",
        relationshipState: "previewing",
      }).text,
    ).toBe("Ila, you made it. The quest can begin.");
  });

  it("uses earned reward and safe memory pickup variants without making memory mandatory", () => {
    expect(
      resolveVideoCallPickupGreeting({
        companionId: "elli",
        companionName: "Elli",
        childName: "Ila",
        callSource: "game_reward",
        relationshipState: "earned_reward",
      }),
    ).toEqual({
      text: "Ila! You earned this call. I was hoping we'd get a minute together.",
      usedMemorySeed: false,
    });
    expect(
      resolveVideoCallPickupGreeting({
        companionId: "elli",
        companionName: "Elli",
        childName: "Ila",
        callSource: "showroom",
        relationshipState: "selected",
        memory: { reunionLineSeed: "Last time we played tic-tac-toe." },
      }),
    ).toEqual({
      text: "Hiii Ila! Last time we played tic-tac-toe.",
      usedMemorySeed: true,
    });
    expect(
      resolveVideoCallPickupGreeting({
        companionId: "elli",
        companionName: "Elli",
        childName: "Ila",
        callSource: "showroom",
        relationshipState: "selected",
        memory: { reunionLineSeed: "   " },
      }).usedMemorySeed,
    ).toBe(false);
  });

  it("wires an unlocked Video Chat shell without economy lock copy", () => {
    const source = `${readShowroomSource()}\n${readVideoCallSource()}`;

    expect(source).toContain("CompanionVideoCallOverlay");
    expect(source).toContain("Video Chat");
    expect(source).toContain("showroomVideoChatOpen");
    expect(source).toContain("Start camera");
    expect(source).toContain("End video chat");
    expect(source).not.toContain("Earn 155 more coins");
    expect(source).not.toContain("Locked Reward");
    expect(source).not.toContain("Placeholder economy: final costs and balances TBD.");
    expect(source).not.toContain("coinsAwarded");
  });

  it("wires pickup greeting through existing companion speak route and trace events", () => {
    const source = readShowroomSource();

    expect(source).toContain("resolveVideoCallPickupGreeting");
    expect(source).toContain("call_greeting_selected");
    expect(source).toContain("call_greeting_audio_start");
    expect(source).toContain("call_greeting_audio_ended");
    expect(source).toContain("call_greeting_skipped");
    expect(source).toContain("/speak");
    expect(source).not.toContain("new WebSocket");
  });

  it("wires video chat voice through Deepgram barge-in plus the existing showroom talk loop", () => {
    const source = `${readShowroomSource()}\n${readVideoCallSource()}`;

    expect(source).toContain("useDeepgramVideoCallStt");
    expect(source).toContain("startShowroomVideoCallListening");
    expect(source).toContain("deepgram_stt_final");
    expect(source).toContain("handsFree={videoCallStt.supported && videoCallStt.status !== \"error\"}");
    expect(source).toContain("submitShowroomTalkQuestion");
    expect(source).toContain("videoChatMotorRef.current");
    expect(source).toContain("processShowroomCommand(videoChatMotorRef.current");
  });

  it("wires openCompanionActivity tool results into a tic-tac-toe FaceTime overlay", () => {
    const source = `${readShowroomSource()}\n${readVideoCallSource()}`;

    expect(source).toContain("activeVideoCallActivity");
    expect(source).toContain("activityRequests");
    expect(source).toContain("openCompanionActivity");
    expect(source).toContain("tic_tac_toe");
    expect(source).toContain("CompanionTicTacToe");
    expect(source).toContain("activitySlot");
  });

  it("bridges video-call play activity events into the existing live session log stream", () => {
    const source = readShowroomSource();

    expect(source).toContain("postShowroomVideoCallActivityEvent");
    expect(source).toContain("game_state_update");
    expect(source).toContain("companion_tic_tac_toe_child_move");
    expect(source).toContain("companion_tic_tac_toe_companion_move");
    expect(source).toContain("companion_tic_tac_toe_round_complete");
    expect(source).toContain("callSource");
    expect(source).toContain("relationshipState");
  });

  it("routes tic-tac-toe moments through AI-authored activity reactions instead of canned voice banter", () => {
    const source = readShowroomSource();

    expect(source).toContain("requestShowroomVideoActivityReaction");
    expect(source).toContain("activityReaction");
    expect(source).toContain("activity_reaction_request_start");
    expect(source).toContain("activity_reaction_fallback");
    expect(source).toContain("onBanter");
    expect(source).toContain("videoChatHandsFreeRearmRef.current?.(");
    expect(source).toContain("videoChatStartListeningRef.current?.()");
    expect(source).not.toContain("speakShowroomVideoGameBanter");
    expect(source).not.toContain('source: "video_game_banter"');
    expect(source).not.toContain("from \"socket.io-client\"");
  });

  it("does not request AI speech for ordinary child moves that will immediately become stale", () => {
    expect(
      shouldRequestShowroomActivityReaction({
        type: "companion_tic_tac_toe_child_move",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 1000,
        board: ["X", null, null, null, null, null, null, null, null],
        square: 1,
        mark: "X",
      }),
    ).toBe(false);
  });

  it("requests AI-authored comments for meaningful tic-tac-toe blocks, not every move", () => {
    expect(
      shouldRequestShowroomActivityReaction({
        type: "companion_tic_tac_toe_companion_move",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 1000,
        board: ["X", "X", "O", null, null, null, null, null, null],
        square: 3,
        mark: "O",
      }),
    ).toBe(true);
    expect(
      shouldRequestShowroomActivityReaction({
        type: "companion_tic_tac_toe_child_move",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 2000,
        board: ["O", "O", "X", null, "X", null, null, null, null],
        square: 3,
        mark: "X",
      }),
    ).toBe(true);
    expect(
      shouldRequestShowroomActivityReaction({
        type: "companion_tic_tac_toe_companion_move",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 3000,
        board: ["X", null, null, null, "O", null, null, null, null],
        square: 5,
        mark: "O",
      }),
    ).toBe(false);
  });

  it("describes meaningful tic-tac-toe moments instead of sending generic move prompts", () => {
    const source = readShowroomSource();

    expect(source).toContain("companion_blocked_child");
    expect(source).toContain("child_blocked_companion");
    expect(source).toContain("child_created_threat");
    expect(source).toContain("suggestedGesture");
    expect(source).toContain("salience");
    expect(source).toContain("blocked the child");
    expect(source).toContain("child blocked");
  });

  it("marks activity reactions stale when the board advances before speech is ready", () => {
    const requestedActivity = createShowroomVideoActivityContextFromEvent({
      type: "companion_tic_tac_toe_companion_move",
      activityId: "tic_tac_toe",
      surface: "video_call_overlay",
      companionName: "Elli",
      timestamp: 1000,
      board: ["X", null, null, "O", "O", null, "X", null, null],
      square: 4,
      mark: "O",
    });
    const completedActivity = createShowroomVideoActivityContextFromEvent(
      {
        type: "companion_tic_tac_toe_round_complete",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 2000,
        board: ["X", "X", "O", "O", "O", "X", "X", "X", "O"],
        result: "draw",
      },
      requestedActivity,
    );
    const reaction = {
      activityId: "tic_tac_toe" as const,
      eventType: "companion_move" as const,
      board: requestedActivity.board,
      childMark: "X" as const,
      companionMark: "O" as const,
      turn: requestedActivity.turn,
      lastMove: requestedActivity.lastMove,
    };

    expect(getShowroomActivityBoardSignature(requestedActivity.board)).toBe(
      "X--OO-X--",
    );
    expect(
      isShowroomActivityReactionCurrent({
        reaction,
        currentActivity: requestedActivity,
      }),
    ).toBe(true);
    expect(
      isShowroomActivityReactionCurrent({
        reaction,
        currentActivity: completedActivity,
      }),
    ).toBe(false);
  });

  it("wires stale activity reaction drops before audio playback can speak old board state", () => {
    const source = readShowroomSource();

    expect(source).toContain("activity_reaction_stale_dropped");
    expect(source).toContain("isShowroomActivityReactionCurrent");
    expect(source).toContain("stale_activity_reaction");
    expect(source).toContain("boardSignature");
    expect(source).toContain("currentBoardSignature");
  });

  it("marks same-board activity reactions stale when a newer board event has already landed", () => {
    const requestedActivity = createShowroomVideoActivityContextFromEvent({
      type: "companion_tic_tac_toe_companion_move",
      activityId: "tic_tac_toe",
      surface: "video_call_overlay",
      companionName: "Elli",
      timestamp: 1000,
      board: ["X", null, null, null, "O", null, null, null, null],
      square: 5,
      mark: "O",
    });
    const reaction = {
      activityId: "tic_tac_toe" as const,
      eventType: "companion_move" as const,
      board: requestedActivity.board,
      boardSignature: getShowroomActivityBoardSignature(requestedActivity.board),
      childMark: "X" as const,
      companionMark: "O" as const,
      turn: requestedActivity.turn,
      lastMove: requestedActivity.lastMove,
      updatedAt: requestedActivity.updatedAt,
    };

    expect(
      isShowroomActivityReactionCurrent({
        reaction,
        currentActivity: {
          ...requestedActivity,
          updatedAt: 2000,
        },
      }),
    ).toBe(false);
  });

  it("throttles AI-authored tic-tac-toe reactions to key moments", () => {
    expect(
      shouldRequestShowroomActivityReaction({
        type: "companion_tic_tac_toe_started",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 1000,
        board: [null, null, null, null, null, null, null, null, null],
      }),
    ).toBe(true);
    expect(
      shouldRequestShowroomActivityReaction({
        type: "companion_tic_tac_toe_companion_move",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 1000,
        board: ["X", null, null, null, "O", null, null, null, null],
        square: 5,
        mark: "O",
      }),
    ).toBe(false);
    expect(
      shouldRequestShowroomActivityReaction({
        type: "companion_tic_tac_toe_child_move",
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        companionName: "Elli",
        timestamp: 1000,
        board: ["X", "X", null, null, "O", null, null, null, null],
        square: 2,
        mark: "X",
      }),
    ).toBe(false);
  });

  it("carries active tic-tac-toe context into video-call talk payloads", () => {
    const activeActivity = createShowroomVideoActivityContextFromEvent({
      type: "companion_tic_tac_toe_child_move",
      activityId: "tic_tac_toe",
      surface: "video_call_overlay",
      companionName: "Elli",
      timestamp: 1000,
      board: ["X", null, null, null, null, null, null, null, null],
      square: 1,
      mark: "X",
    });

    expect(
      createShowroomTalkPayload({
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "What should I do next?",
        activeActivity,
      }),
    ).toMatchObject({
      mode: "video_call",
      activeActivity: {
        activityId: "tic_tac_toe",
        surface: "video_call_overlay",
        status: "active",
        board: ["X", null, null, null, null, null, null, null, null],
        childMark: "X",
        companionMark: "O",
        turn: "companion",
        lastMove: {
          by: "child",
          square: 1,
          mark: "X",
        },
      },
    });
  });

  it("carries conversation intent into video-call talk payloads", () => {
    expect(
      createShowroomTalkPayload({
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "Can you hear me?",
        conversationIntent: "social",
      }),
    ).toMatchObject({
      conversationIntent: "social",
    });
  });

  it("infers repeat-after and social intent even while tic-tac-toe is active", () => {
    expect(
      inferShowroomVideoConversationIntent({
        question: "Can you repeat after me?",
        activeActivity: true,
      }),
    ).toBe("repeat_after");
    expect(
      inferShowroomVideoConversationIntent({
        question: "Ten",
        activeActivity: true,
        repeatAfterActive: true,
      }),
    ).toBe("repeat_after");
    expect(
      inferShowroomVideoConversationIntent({
        question: "Can you hear me?",
        activeActivity: true,
      }),
    ).toBe("social");
    expect(
      inferShowroomVideoConversationIntent({
        question: "What square should I pick?",
        activeActivity: true,
      }),
    ).toBe("game");
  });

  it("queues opening tic-tac-toe until the spoken invite finishes", () => {
    const source = readShowroomSource();

    expect(source).toContain("queuedVideoCallActivityRequestRef");
    expect(source).toContain("flushQueuedVideoCallActivityRequest");
    expect(source).toContain("audio_ended");
    expect(source).toContain("openCompanionActivity");
    expect(source).toContain("activity_open_interrupted_audio");
  });

  it("carries activity reaction context into video-call talk payloads", () => {
    expect(
      createShowroomTalkPayload({
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "React to the tic-tac-toe companion move.",
        activityReaction: {
          activityId: "tic_tac_toe",
          eventType: "companion_move",
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
          desiredTone: "warm_playful",
        },
      }),
    ).toMatchObject({
      mode: "video_call",
      activityReaction: {
        activityId: "tic_tac_toe",
        eventType: "companion_move",
        board: ["X", null, null, null, "O", null, null, null, null],
        turn: "child",
      },
    });
  });

  it("uses ref-backed activity context so delayed hands-free turns do not lose the open game", () => {
    const source = readShowroomSource();

    expect(source).toContain("showroomVideoActiveActivityRef");
    expect(source).toContain("showroomVideoActiveActivityRef.current = nextActivityContext");
    expect(source).toContain("activeActivity: showroomVideoActiveActivityRef.current");
  });

  it("carries the call trace id and turn id into video-call talk payloads", () => {
    expect(
      createShowroomTalkPayload({
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        mode: "video_call",
        question: "Can you see this?",
        callTraceId: "trace123",
        turnId: "trace123_turn_1",
      }),
    ).toMatchObject({
      mode: "video_call",
      callTraceId: "trace123",
      turnId: "trace123_turn_1",
    });
  });

  it("wires copyable trace links through the standalone video-call preview", () => {
    const source = `${readShowroomSource()}\n${readVideoCallSource()}`;

    expect(source).toContain("emitShowroomVideoCallTrace");
    expect(source).toContain("showroomVideoCallTraceId");
    expect(source).toContain("buildCompanionVideoTraceUrl");
    expect(source).toContain("traceLink");
    expect(source).toContain("onCopyTraceLink");
    expect(source).toContain("Copy trace link");
  });

  it("records the selected video-call layout so the lab can compare call versus play sessions", () => {
    const source = `${readShowroomSource()}\n${readVideoCallSource()}`;

    expect(source).toContain("videoCallLayout");
    expect(source).toContain("setVideoCallLayout");
    expect(source).toContain("onLayoutChange");
    expect(source).toContain("layout=");
  });

  it("sends showroom video calls as previewing relationship context", () => {
    expect(
      createShowroomTalkPayload({
        childId: "ila",
        companionId: "elli",
        voiceId: "voice_a",
        showroomTheme: "crystal",
        question: "Can we talk?",
        mode: "video_call",
      }),
    ).toMatchObject({
      callSource: "showroom",
      relationshipState: "previewing",
      mode: "video_call",
    });
  });

  it("supports a dev-preview earned video-call context from query params", () => {
    expect(
      createShowroomVideoCallContextFromSearch(
        "?callSource=dev_preview&relationshipState=earned_reward&rewardId=video_call_ticket&earnedBy=finished%20word%20radar",
      ),
    ).toEqual({
      callSource: "dev_preview",
      relationshipState: "earned_reward",
      rewardContext: {
        rewardId: "video_call_ticket",
        earnedBy: "finished word radar",
      },
    });
  });

  it("can route the standalone preview to a real child context by query param", () => {
    expect(resolveShowroomTalkChildId(undefined, "?child=ila")).toBe("ila");
    expect(resolveShowroomTalkChildId("Reina", "?child=ila")).toBe("reina");
    expect(resolveShowroomTalkChildId(undefined, "")).toBe("showroom");
  });

  it("starts video chat camera and listening from the call entry", () => {
    const source = `${readShowroomSource()}\n${readVideoCallSource()}`;

    expect(source).toContain("playShowroomVideoCallGreeting");
    expect(source).toContain("startCameraOnce(\"audio_start\")");
    expect(source).toContain("rearmAfterGreeting(\"audio_ended\")");
    expect(source).toContain("startShowroomVideoChatCamera({ autoListen: false })");
    expect(source).toContain("startShowroomVideoCallListening");
    expect(source).toContain(".start({");
    expect(source).toContain("cameraState === \"live\"");
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

    const source = readShowroomSource();
    expect(source).toContain("playVideoCallRingtone");
    expect(source).toContain("showroomVideoCallPhase");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_RING_MS");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_ANSWER_MS");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_RINGTONE_STYLE = \"familiar-video-call\"");
    expect(source).toContain("SHOWROOM_VIDEO_CHAT_RINGTONE_NOTES");
    expect(source).toContain("[showroom-video-chat] ringing");
    expect(source).toContain("[showroom-video-chat] answered");
  });

  it("captures one small camera snapshot only for visual video-call moments", () => {
    const source = `${readShowroomSource()}\n${readVideoCallSource()}`;

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
    const source = readShowroomSource();

    expect(source).toContain("videoChatContinuousListenRef");
    expect(source).toContain("startShowroomVideoCallListening");
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

  it("keeps video-call hands-free rearming under a half-second artificial delay", () => {
    expect(getShowroomVideoChatLatencyBudget()).toMatchObject({
      handsFreeRearmMs: 360,
      noSpeechRetryDelayMs: 560,
    });

    const source = readShowroomSource();
    expect(source).toContain("[showroom-talk] request_start");
    expect(source).toContain("[showroom-talk] response_received");
    expect(source).toContain("[showroom-talk] audio_play_start");
  });

  it("uses safer video portrait framing for tall display-scaled companions", () => {
    expect(
      resolveShowroomContainedSlotFraming({ contained: true, displayScale: 2 }),
    ).toEqual({
      cameraAngle: "full-body",
      cssScale: 1.06,
      motorDisplayScale: 1,
      transformOrigin: "50% 50%",
    });

    expect(
      resolveShowroomContainedSlotFraming({ contained: true, displayScale: 1 }),
    ).toMatchObject({
      cameraAngle: "mid-shot",
      cssScale: 1.38,
      motorDisplayScale: 1,
    });
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
    const source = readShowroomSource();
    const listeningBody = source.match(
      /const startShowroomTalkListening = useCallback\([\s\S]*?recognition\.start\(\);/,
    )?.[0];

    expect(listeningBody).toBeDefined();
    expect(listeningBody).toContain("setShowroomTalkResponse(\"\")");
    expect(listeningBody).toContain("setShowroomTalkQuestion(\"\")");
  });

  it("keeps video chat attentive without looping the t-rex-prone think animation", () => {
    const source = readShowroomSource();

    expect(source).toContain("createShowroomEmoteCommand");
    expect(source).toContain("createCompanionActivityThinkingCommand");
    expect(source).toContain("applyShowroomThinkingBodyLanguage");
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
    const source = readShowroomSource();

    expect(source).toContain("[showroom-talk] speaking_start");
    expect(source).toContain("[showroom-talk] audio_ended");
    expect(source).toContain("[showroom-talk] idle_applied");
    expect(source).not.toContain("[showroom-talk] listen_resume");
  });
});
