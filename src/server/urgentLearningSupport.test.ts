import { describe, expect, it } from "vitest";
import {
  auditConversationForLearningSignals,
  buildLiveLearningContext,
  buildUrgentSupportResponse,
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

    const response = buildUrgentSupportResponse(intent!, context!);
    expect(response.text).toContain("able");
    expect(response.text).toContain("a-ble");
    expect(response.text).not.toMatch(/what are you trying to spell/i);
    expect(response.gameMessage).toMatchObject({
      type: "pronunciation_support",
      word: "able",
    });

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

    const response = buildUrgentSupportResponse(intent!, context!);
    expect(response.text).toMatch(/back off/i);

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
