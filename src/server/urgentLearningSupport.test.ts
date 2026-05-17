import { describe, expect, it } from "vitest";
import {
  auditConversationForLearningSignals,
  buildLiveLearningContext,
  chartEvidenceForUrgentIntent,
  detectUrgentChildIntent,
} from "./urgentLearningSupport";

describe("urgent learning support", () => {
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
