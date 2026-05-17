import { describe, expect, it } from "vitest";
import {
  SPELLING_CERTIFICATION_GAMES,
  certifySpellingAdaptation,
  renderSpellingCertificationMarkdown,
} from "./spellingCertification";

describe("spelling adaptation certification", () => {
  it("certifies every spelling-related game against the activity measurement contract", () => {
    const report = certifySpellingAdaptation({ childId: "demo_adaptive" });
    const certifiedIds = new Set(report.games.map((game) => game.gameId));

    for (const expected of [
      "spell-check",
      "word-radar",
      "pronunciation",
      "monster-stampede",
      "letter-rush",
      "word-builder",
      "wordle",
      "wheel-of-fortune",
      "speed-catcher",
      "quest",
      "boss",
    ]) {
      expect(certifiedIds.has(expected)).toBe(true);
    }

    expect(report.games).toHaveLength(SPELLING_CERTIFICATION_GAMES.length);
  });

  it("marks Letter Rush as the reference spelling evidence implementation", () => {
    const report = certifySpellingAdaptation({ childId: "demo_adaptive" });
    const letterRush = report.games.find((game) => game.gameId === "letter-rush");

    expect(letterRush).toMatchObject({
      status: "pass",
      allowedInRealChildSession: true,
      referenceImplementation: true,
      checks: {
        debugTrace: "pass",
        chartEvidence: "pass",
        liveBoardTruth: "pass",
        vitalSigns: "pass",
        evidenceTier: "pass",
      },
    });
  });

  it("blocks spelling games that do not yet produce normalized psychologist evidence", () => {
    const report = certifySpellingAdaptation({ childId: "demo_adaptive" });
    const blocked = report.games.filter((game) => game.status === "blocked");
    const blockedIds = new Set(blocked.map((game) => game.gameId));

    expect(blockedIds).toContain("word-builder");
    expect(blockedIds).toContain("wordle");
    expect(blocked.every((game) => game.allowedInRealChildSession === false)).toBe(true);
    expect(blocked.every((game) => game.issues.some((issue) => issue.severity === "high"))).toBe(true);
  });

  it("treats reward/practice games as non-mastery evidence", () => {
    const report = certifySpellingAdaptation({ childId: "demo_adaptive" });
    const wheel = report.games.find((game) => game.gameId === "wheel-of-fortune");
    const monster = report.games.find((game) => game.gameId === "monster-stampede");

    expect(wheel?.evidenceTier).toBe("practice");
    expect(wheel?.masteryEligible).toBe(false);
    expect(wheel?.checks.hiddenAnswerSafety).toBe("pass");

    expect(monster?.evidenceTier).toBe("practice");
    expect(monster?.masteryEligible).toBe(false);
  });

  it("reports runtime, intent, and adaptation certification levels", () => {
    const report = certifySpellingAdaptation({ childId: "demo_adaptive" });
    const wheel = report.games.find((game) => game.gameId === "wheel-of-fortune");

    expect(report.summary.levels).toMatchObject({
      runtime: expect.any(Object),
      intent: expect.any(Object),
      adaptation: expect.any(Object),
    });
    expect(wheel?.levels).toMatchObject({
      runtime: "pass",
      intent: "pass",
      adaptation: "pass",
    });
    expect(wheel?.activityIntent).toMatchObject({
      purpose: "playful_retrieval_probe",
      targetSelector: "fragile_or_recent_miss",
    });
    expect(wheel?.targetSelectorDecision?.traceSummary).toMatch(/Wheel selected/);
  });

  it("renders a human gate report that answers the manual pass/fail questions", () => {
    const report = certifySpellingAdaptation({ childId: "demo_adaptive" });
    const markdown = renderSpellingCertificationMarkdown(report);

    expect(markdown).toContain("# Sunny Spelling Adaptation Certification");
    expect(markdown).toContain("childId: demo_adaptive");
    expect(markdown).toContain("What was the child shown?");
    expect(markdown).toContain("What will the psychologist learn?");
    expect(markdown).toContain("Allowed in real child session");
    expect(markdown).toContain("Level 1 Runtime");
    expect(markdown).toContain("Level 2 Intent");
    expect(markdown).toContain("Level 3 Adaptation");
    expect(markdown).toContain("Manual Preview Links");
  });
});
