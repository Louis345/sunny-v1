import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  maybeCompactCompanionInteractionMemory,
  recordCompanionInteractionEvent,
} from "./companionInteractionMemory";
import { shouldPersistSessionData } from "../utils/runtimeMode";

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
  auditConversationForLearningSignals,
  buildLiveLearningContext,
  chartEvidenceForUrgentIntent,
  detectUrgentChildIntent,
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
  it("routes activity speech through an explicit wake and dismiss presence contract", () => {
    expect(
      routeCompanionPresenceTranscript({
        transcript: "The rectangles look equal",
        presence: "collapsed",
        companionName: "Elli",
      }),
    ).toEqual({ action: "ignore_ambient" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Hey Sunny, I don't understand",
        presence: "collapsed",
        companionName: "Elli",
      }),
    ).toEqual({ action: "summon_and_respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Bye Elli",
        presence: "summoned",
        companionName: "Elli",
      }),
    ).toEqual({ action: "dismiss" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Bye Elli, bye Sunny.",
        presence: "summoned",
        companionName: "Elli",
      }),
    ).toEqual({ action: "dismiss" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Alright, bye Sony.",
        presence: "summoned",
        companionName: "Elli",
      }),
    ).toEqual({ action: "dismiss" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "Can you explain this another way?",
        presence: "summoned",
        companionName: "Elli",
      }),
    ).toEqual({ action: "respond" });
    expect(
      routeCompanionPresenceTranscript({
        transcript: "three equal parts",
        presence: "collapsed",
        companionName: "Elli",
        speechCaptureArmed: true,
      }),
    ).toEqual({ action: "route_to_game" });
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
      companionName: "Elli",
      speechCaptureArmed: false,
      sendFinal,
      setPresence,
      recordEvent,
    };

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "Hey Sunny",
      presence: "collapsed",
    })).toBe(true);
    expect(setPresence).toHaveBeenCalledWith("summoned", "voice");
    expect(sendFinal).not.toHaveBeenCalled();

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "Bye Elli, bye Sunny",
      presence: "summoned",
    })).toBe(true);
    expect(setPresence).toHaveBeenCalledWith("collapsed", "voice");

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "three equal parts",
      presence: "collapsed",
    })).toBe(true);
    expect(recordEvent).toHaveBeenCalledWith("transcript", "ambient_ignored", expect.any(Object));

    expect(handleCompanionPresenceTranscript({
      ...base,
      transcript: "three equal parts",
      presence: "collapsed",
      speechCaptureArmed: true,
    })).toBe(true);
    expect(sendFinal).toHaveBeenCalledWith("three equal parts");
  });

  it("detects active-game help and scaffolds from the current word", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "pronunciation",
        currentWord: "able",
        wordIndex: 0,
        totalWords: 10,
        phase: "approaching",
      },
    });

    const intent = detectUrgentChildIntent("Can you help me, Ellie?", context);
    expect(intent?.type).toBe("help_request");
    expect(intent?.shouldInterrupt).toBe(true);

    const evidence = chartEvidenceForUrgentIntent(intent!, context!, "Can you help me, Ellie?");
    expect(evidence.childSignals[0]).toMatchObject({
      signalType: "help_needed",
      dimension: "help",
      valence: "negative",
    });
  });

  it("backs off and records autonomy pushback when a child rejects help", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "spell-check",
        currentWord: "slowly",
        phase: "active",
      },
    });

    const intent = detectUrgentChildIntent("I don't need help.", context);
    expect(intent?.type).toBe("autonomy_pushback");

    const evidence = chartEvidenceForUrgentIntent(intent!, context!, "I don't need help.");
    expect(evidence.childSignals[0]).toMatchObject({
      signalType: "autonomy_pushback",
      dimension: "autonomy",
      valence: "negative",
    });
  });

  it("separates product complaints from learning preference signals", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "pronunciation",
        currentWord: "common",
        phase: "approaching",
      },
    });

    const intent = detectUrgentChildIntent("There is a bug, you are behind.", context);
    expect(intent?.type).toBe("bug_report");

    const evidence = chartEvidenceForUrgentIntent(intent!, context!, "There is a bug, you are behind.");
    expect(evidence.childSignals).toHaveLength(0);
    expect(evidence.productIssues[0]).toMatchObject({
      issueType: "companion_lag",
      severity: "high",
      childUtterance: "There is a bug, you are behind.",
    });
  });

  it("captures missing-word-audio complaints as product issues", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "spell-check",
        currentWord: "shiny",
        phase: "spelling",
      },
    });

    const intent = detectUrgentChildIntent("It didn't say the word.", context);
    expect(intent?.type).toBe("bug_report");

    const evidence = chartEvidenceForUrgentIntent(intent!, context!, "It didn't say the word.");
    expect(evidence.productIssues[0]).toMatchObject({
      issueType: "flow_complaint",
      severity: "medium",
      childUtterance: "It didn't say the word.",
    });
  });

  it("captures session-quality product complaints during active games", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "pronunciation",
        currentWord: "government",
        phase: "playing",
      },
    });

    const intent = detectUrgentChildIntent("It's worse than before.", context);
    expect(intent?.type).toBe("bug_report");

    const evidence = chartEvidenceForUrgentIntent(intent!, context!, "It's worse than before.");
    expect(evidence.productIssues[0]).toMatchObject({
      issueType: "flow_complaint",
      childUtterance: "It's worse than before.",
    });
  });

  it("captures say-before-spell complaints as product issues", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "spell-check",
        currentWord: "neatly",
        phase: "spelling",
      },
    });

    const intent = detectUrgentChildIntent("You have to say it before I spell it.", context);
    expect(intent?.type).toBe("bug_report");

    const evidence = chartEvidenceForUrgentIntent(
      intent!,
      context!,
      "You have to say it before I spell it.",
    );
    expect(evidence.productIssues[0]).toMatchObject({
      issueType: "flow_complaint",
      childUtterance: "You have to say it before I spell it.",
    });
  });

  it("captures grounded wrong-product complaints without treating plain mistakes as bugs", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "wheel-of-fortune",
        phase: "playing",
      },
    });

    const intent = detectUrgentChildIntent("That's wrong.", context);
    expect(intent?.type).toBe("bug_report");

    expect(detectUrgentChildIntent("wrong", context)).toBeNull();
  });

  it("does not classify child name pronunciation corrections as product bugs", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "pronunciation",
        currentWord: "ahead",
        phase: "playing",
      },
    });

    expect(
      detectUrgentChildIntent("Can you say my name? Ayla, not Ee-lah.", context),
    ).toBeNull();
  });

  it("does not turn a bug report into a stale current-word scaffold", () => {
    const context = buildLiveLearningContext({
      childId: "reina",
      childName: "Reina",
      companionName: "Matilda",
      currentActivityState: {
        game: "spell-check",
        currentWord: "about",
        phase: "full_word",
      },
    });

    const transcript =
      "Matilda, can you log the bug? The bug happened on ago, not about.";
    const intent = detectUrgentChildIntent(transcript, context);
    expect(intent?.type).toBe("bug_report");
  });

  it("keeps a long companion-name explanation out of the urgent decoding lane", () => {
    const context = buildLiveLearningContext({
      childId: "reina",
      childName: "Reina",
      companionName: "Matilda",
      currentActivityState: {
        game: "wheel-of-fortune",
        currentWord: "ago",
        phase: "playing",
      },
    });

    const intent = detectUrgentChildIntent(
      "Matilda, I was explaining how the missing letters worked earlier and the game skipped a step.",
      context,
    );
    expect(intent).toBeNull();
  });

  it("answers a simple companion name call without injecting a word hint", () => {
    const context = buildLiveLearningContext({
      childId: "reina",
      childName: "Reina",
      companionName: "Matilda",
      currentActivityState: {
        game: "wheel-of-fortune",
        currentWord: "ago",
        phase: "playing",
      },
    });

    const intent = detectUrgentChildIntent("Matilda?", context);
    expect(intent?.type).toBe("companion_name_call");
  });

  it("does not misroute misheard session-end commands into pause support", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "monster-stampede",
        phase: "playing",
      },
    });

    const transcript =
      "Nope. Not yet. Hold on. Ellie, n session. Ellie, n session.";
    const intent = detectUrgentChildIntent(transcript, context);

    expect(intent).toBeNull();
  });

  it("does not invent a this-word scaffold when pause support has no current word", () => {
    const context = buildLiveLearningContext({
      childId: "ila",
      childName: "Ila",
      companionName: "Elli",
      currentActivityState: {
        game: "monster-stampede",
        phase: "playing",
      },
    });

    const intent = detectUrgentChildIntent("Hold on.", context);
    expect(intent?.type).toBe("stop_or_pause");
  });

  it("audits parent comments for missed reading struggle signals", () => {
    const findings = auditConversationForLearningSignals({
      childId: "ila",
      sessionId: "session-1",
      messages: [
        "This is the biggest signal. This means that you have to practice reading. No more listening to the book. You need sunny time.",
      ],
      recentActivityState: {
        game: "pronunciation",
        currentWord: "able",
      },
    });

    expect(findings.childSignals).toEqual([
      expect.objectContaining({
        signalType: "reading_struggle",
        dimension: "reading",
        source: "parent_comment",
      }),
    ]);
  });
});
