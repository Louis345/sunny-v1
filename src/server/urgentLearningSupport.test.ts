import { beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { SessionManager } from "./session-manager";
import {
  maybeCompactCompanionInteractionMemory,
  recordCompanionInteractionEvent,
} from "./companionInteractionMemory";
import { shouldPersistSessionData } from "../utils/runtimeMode";
import { CHARLOTTE_CREATOR, COMPANION_WAKE_NAMES, ELLI, MATILDA } from "../companions/loader";

vi.mock("./companionInteractionMemory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./companionInteractionMemory")>();
  return {
    ...actual,
    recordCompanionInteractionEvent: vi.fn(),
    maybeCompactCompanionInteractionMemory: vi.fn(async () => null),
  };
});

vi.mock("../utils/runtimeMode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/runtimeMode")>();
  return { ...actual, shouldPersistSessionData: vi.fn(() => true) };
});
import {
  buildLiveLearningContext,
  routeCompanionPresenceTranscript,
  companionPresenceAfterSpeech,
  dispositionAfterReset,
  handleCompanionPresenceTranscript,
  prepareInstructionReadRequest,
  recordActivityCompanionHelp,
  transitionCompanionPresence,
} from "./urgentLearningSupport";

describe("urgent learning support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldPersistSessionData).mockReturnValue(true);
  });

  it("separates one-shot activity help from an open child conversation", () => {
    expect(transitionCompanionPresence({ state: "summoned", reason: "read_instruction" })).toEqual({
      presence: "summoned",
      mode: "activity_help",
    });
    expect(dispositionAfterReset("activity_help")).toBe("standby_after_speech");
    expect(companionPresenceAfterSpeech({
      presence: "summoned",
      mode: "activity_help",
      disposition: "standby_after_speech",
    })).toBe("collapse");

    expect(transitionCompanionPresence({ state: "summoned", reason: "voice" })).toEqual({
      presence: "summoned",
      mode: "conversation",
    });
    expect(dispositionAfterReset("conversation")).toBe("await_child_response");
    expect(companionPresenceAfterSpeech({
      presence: "summoned",
      mode: "conversation",
      disposition: "standby_after_speech",
    })).toBe("conversation_open");
  });
  it("hears Elli's name as speech recognition wrote it on Nov 1", () => {
    // Nov 2 human catch: the children said Elli was not responding. Nov 1 had
    // one wake-word summon in four sessions; an accepted turn shows the child
    // saying "Come on, Ellen ... Ellie" - the first call was transcribed as
    // "Ellen" and only the second reached Elli. Ignored lines kept no words, so
    // the logs could not show other misses; the lab only tested exact spellings.
    expect(routeCompanionPresenceTranscript({ transcript: "Come on, Ellen.", presence: "collapsed", companionWakeNames: ELLI.wakeNames }))
      .toEqual({ action: "summon_and_respond" });
  });

  it("wakes any companion by the names listed in every companion file", () => {
    // Nov 2 human catch: the children call "Hey Elli" and asked that every
    // companion be reachable the same way. Elli's names were hardcoded in the
    // gate, so only Elli had misheard spellings and Charlotte could not be
    // called by name. Reina has said "Ellie" to Matilda, so names stay shared.
    expect(ELLI.wakeNames).toEqual(["Elli", "Ellie", "Ellen", "Elliot", "Belly"]);
    expect(MATILDA.wakeNames).toEqual(["Matilda"]);
    expect(CHARLOTTE_CREATOR.wakeNames).toEqual(["Charlotte"]);
    expect([...COMPANION_WAKE_NAMES].sort()).toEqual(["Belly", "Charlotte", "Ellen", "Elli", "Ellie", "Elliot", "Matilda"]);
    const collapsed = (transcript: string) =>
      routeCompanionPresenceTranscript({ transcript, presence: "collapsed", companionWakeNames: COMPANION_WAKE_NAMES }).action;
    expect(collapsed("Hey Matilda, help me")).toBe("summon_and_respond");
    expect(collapsed("Alright, Ellie.")).toBe("summon_and_respond");
    expect(collapsed("Hey Charlotte")).toBe("summon_and_respond");
    expect(collapsed("Hey Sunny, help me")).toBe("summon_and_respond");
    expect(collapsed("The rectangles look equal")).toBe("ignore_ambient");
  });

  it("routes activity speech through an explicit wake and dismiss presence contract", () => {
    // Human catch: Ila called Sunny during a live Word Radar response and heard
    // no answer. Logs showed valid speech recognition, then game routing or
    // suppression; the lab only asserted letter ownership and an unarmed wake.
    expect(
      routeCompanionPresenceTranscript({
        transcript: "The rectangles look equal",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
      }),
    ).toEqual({ action: "ignore_ambient" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Hey Sunny, I don't understand",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
      }),
    ).toEqual({ action: "summon_and_respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Bye Elli",
        presence: "summoned",
        companionWakeNames: ELLI.wakeNames,
      }),
    ).toEqual({ action: "dismiss" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Bye Elli, bye Sunny.",
        presence: "summoned",
        companionWakeNames: ELLI.wakeNames,
      }),
    ).toEqual({ action: "dismiss" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Alright, bye Sony.",
        presence: "summoned",
        companionWakeNames: ELLI.wakeNames,
      }),
    ).toEqual({ action: "dismiss" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "k. Bye, Sunny.",
        presence: "summoned",
        companionWakeNames: ELLI.wakeNames,
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "dismiss" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Can you explain this another way?",
        presence: "summoned",
        companionWakeNames: ELLI.wakeNames,
      }),
    ).toEqual({ action: "respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "three equal parts",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "route_to_game" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Sunny, can you hear me?",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "summon_and_respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Sunny",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "summon_and_respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "B. Sonny, is it B?",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "summon_and_respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "u. Sonny, I'm asking you.",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "summon_and_respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "b",
        presence: "collapsed",
        companionWakeNames: ELLI.wakeNames,
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "route_to_game" });
  });

  it("sends a direct Sunny call to Elli during an armed Word Radar turn", async () => {
    const previousStateless = process.env.SUNNY_STATELESS;
    process.env.SUNNY_STATELESS = "true";
    try {
      const ws = { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
      const session = new SessionManager(ws, "Ila");
      session.companionWakeGateEnabled = true;
      const respond = vi.spyOn(session as unknown as { runCompanionResponse: (text: string) => Promise<void> }, "runCompanionResponse")
        .mockResolvedValue(undefined);
      session.injectGameContext({ game: "word-radar", nodeId: "practice", phase: "response", speechCaptureArmed: true });

      session.injectTranscript("Sunny, can you hear me?");

      await vi.waitFor(() => expect(respond).toHaveBeenCalledWith("Sunny, can you hear me?"));
      expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining('"type":"interim"'));
    } finally {
      process.env.SUNNY_STATELESS = previousStateless;
    }
  });

  it("keeps follow-up speech with Elli after she answers during Word Radar", async () => {
    const previousStateless = process.env.SUNNY_STATELESS;
    process.env.SUNNY_STATELESS = "true";
    try {
      const ws = { readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
      const session = new SessionManager(ws, "Ila");
      session.companionWakeGateEnabled = true;
      const respond = vi.spyOn(session as unknown as { runCompanionResponse: (text: string) => Promise<void> }, "runCompanionResponse")
        .mockResolvedValue(undefined);
      session.injectGameContext({ game: "word-radar", nodeId: "practice", phase: "response", speechCaptureArmed: true });
      session.setCompanionPresence("summoned", "voice");

      session.injectTranscript("Can you hear me?");

      await vi.waitFor(() => expect(respond).toHaveBeenCalledWith("Can you hear me?"));
    } finally {
      process.env.SUNNY_STATELESS = previousStateless;
    }
  });

  it("deduplicates read requests and refuses answer-visible activity state", () => {
    const first = prepareInstructionReadRequest({
      nodeId: "N1",
      activityId: "generated-baseline",
      itemId: "item-1",
      prompt: "Which rectangle has three equal parts?",
      requestCount: 1,
      answerVisibility: "hidden",
      previousRequestKey: null,
    });
    expect(first).toMatchObject({
      requestKey: "N1:item-1:1",
      trace: { evidenceRole: "support", masteryEligible: false },
    });
    expect(prepareInstructionReadRequest({
      nodeId: "N1",
      activityId: "generated-baseline",
      itemId: "item-1",
      prompt: "Which rectangle has three equal parts?",
      requestCount: 1,
      answerVisibility: "hidden",
      previousRequestKey: first!.requestKey,
    })).toBeNull();
    expect(prepareInstructionReadRequest({
      nodeId: "N1",
      activityId: "generated-baseline",
      itemId: "item-1",
      prompt: "The answer is B.",
      requestCount: 2,
      answerVisibility: "shown",
      previousRequestKey: null,
    })).toBeNull();
  });

  it("persists meaningful help only in a real summoned activity session", () => {
    const input = {
      childId: "reina",
      companionId: "elli",
      userMessage: "Can you explain this?",
      companionText: "Try comparing the size of one equal part.",
      snapshot: { nodeId: "N1" } as never,
      presence: "summoned" as const,
    };
    vi.mocked(shouldPersistSessionData).mockReturnValue(false);
    recordActivityCompanionHelp(input);
    expect(recordCompanionInteractionEvent).not.toHaveBeenCalled();

    vi.mocked(shouldPersistSessionData).mockReturnValue(true);
    recordActivityCompanionHelp(input);
    expect(recordCompanionInteractionEvent).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      companionId: "elli",
      callSource: "activity_help",
    }));
    expect(maybeCompactCompanionInteractionMemory).toHaveBeenCalledTimes(1);
  });

  it("applies wake, dismiss, ambient, and game-routing side effects without a model call", () => {
    const sendFinal = vi.fn();
    const setPresence = vi.fn();
    const recordEvent = vi.fn();
    const base = {
      enabled: true,
      companionWakeNames: ELLI.wakeNames,
      speechCaptureArmed: false,
      sendFinal,
      setPresence,
      recordEvent,
    };

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "Hey Sunny",
      presence: "collapsed",
    })).toBe(false);
    expect(setPresence).toHaveBeenCalledWith("summoned", "voice");
    expect(sendFinal).not.toHaveBeenCalled();

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "Sunny, can you hear me?",
      presence: "collapsed",
      speechCaptureArmed: true,
    })).toBe(false);
    expect(sendFinal).not.toHaveBeenCalled();

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "Bye Elli, bye Sunny",
      presence: "summoned",
    })).toBe(true);
    expect(setPresence).toHaveBeenCalledWith("collapsed", "voice");

    sendFinal.mockClear();
    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "k. Bye, Sunny.",
      presence: "summoned",
      speechCaptureArmed: true,
    })).toBe(true);
    expect(setPresence).toHaveBeenLastCalledWith("collapsed", "voice");
    expect(sendFinal).not.toHaveBeenCalled();

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "three equal parts",
      presence: "collapsed",
    })).toBe(true);
    expect(recordEvent).toHaveBeenCalledWith("transcript", "ambient_ignored", expect.objectContaining({
      reason: "companion_collapsed_without_wake_phrase",
      companionPresence: "collapsed",
      speechCaptureArmed: false,
    }));

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "   ",
      presence: "summoned",
    })).toBe(true);
    expect(recordEvent).toHaveBeenLastCalledWith("transcript", "ambient_ignored", expect.objectContaining({
      reason: "transcript_empty_after_normalization",
      companionPresence: "summoned",
      speechCaptureArmed: false,
    }));

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "three equal parts",
      presence: "collapsed",
      speechCaptureArmed: true,
    })).toBe(true);
    expect(sendFinal).toHaveBeenCalledWith("three equal parts");
  });

  it("keeps ignored speech text in the local console log only", () => {
    // Human catch (Nov 1): the child talked and Elli did not answer, 30 times in
    // about 15 minutes. Logs said ambient-ignored but kept no words, so no one
    // could tell which rule dropped speech meant for Elli. Session events are
    // uploaded to the log repo, so the words stay out of them.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const recordEvent = vi.fn();
    try {
      expect(handleCompanionPresenceTranscript({
        enabled: true, companionWakeNames: ELLI.wakeNames, speechCaptureArmed: false,
        sendFinal: vi.fn(), setPresence: vi.fn(), recordEvent,
        transcript: "can you say it again", presence: "collapsed",
      })).toBe(true);
      expect(log.mock.calls.map(call => String(call[0]))).toContain(
        '  🎮 [companion-presence] [ambient-ignored] reason=companion_collapsed_without_wake_phrase text="can you say it again"',
      );
      expect(JSON.stringify(recordEvent.mock.calls)).not.toContain("say it again");
    } finally {
      log.mockRestore();
    }
  });

});
