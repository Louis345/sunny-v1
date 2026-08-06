import { describe, expect, it } from "vitest";
import {
  buildBaselineMechanicBriefCandidates,
  parseBaselineMechanicBrief,
} from "./baselineMechanicBrief";

describe("baselineMechanicBrief", () => {
  it("parses a valid brief schema", () => {
    const brief = parseBaselineMechanicBrief({
      briefId: "hw-1-candidate-1",
      title: "Meteor Multiplier",
      mechanic: "Blast matching products",
      theme: "space arcade",
      domain: "math",
      skillTarget: "multiplication_fluency",
      engagementWrapper: "monster challenge",
      controlledExperiment: {
        engagementVariable: "speed",
        holdConstant: ["academic targets"],
      },
      experienceLoop: {
        childAction: "Choose a product.",
        worldReaction: "The target bursts.",
        anticipation: "The next target approaches.",
        rewardMoment: "The arena transforms.",
      },
      deterministicMath: {
        source: "activity-config",
        artworkMayDefineQuantities: false,
      },
      sfxContract: ["tap", "correct", "incorrect", "progress", "complete"],
      recentThemeExclusions: [],
      configInjection: {
        configUrlParam: "config",
        requiredFields: ["targets", "rounds"],
        description: "Load config JSON",
      },
      evidenceContract: {
        gameStateUpdate: true,
        attemptEvents: true,
        targetResults: true,
        completionSummary: true,
      },
      guardPushback: {
        behavior: "Shake without revealing answer",
        tone: "firm-but-playful",
        mustNotRevealAnswer: true,
      },
      companionRules: {
        sunnyCompanionAnchor: true,
        noInGameCompanionChrome: true,
        fireCompanionEvents: true,
        reportGameState: true,
      },
    });
    expect(brief.skillTarget).toBe("multiplication_fluency");
  });

  it("accepts an AI-authored named SFX contract without discarding the experience brief", () => {
    const source = {
      briefId: "hw-1-candidate-1",
      title: "Signal Forge",
      mechanic: "Build equal groups to power a signal",
      theme: "mystery signal workshop",
      domain: "math",
      skillTarget: "multiplication_fluency",
      engagementWrapper: "strategy and visual construction",
      controlledExperiment: { engagementVariable: "visual", holdConstant: ["academic targets"] },
      experienceLoop: {
        childAction: "Place objects into equal groups.",
        worldReaction: "The signal tower lights one ring.",
        anticipation: "A hidden transmission becomes clearer.",
        rewardMoment: "The completed transmission appears.",
      },
      deterministicMath: { source: "activity-config", artworkMayDefineQuantities: false },
      sfxContract: {
        tap: "short tactile click",
        correct: "bright confirmation",
        incorrect: "soft recovery cue",
        progress: "rising signal tone",
        complete: "transmission reveal",
      },
      recentThemeExclusions: [],
      configInjection: { configUrlParam: "config", requiredFields: ["targets", "rounds"], description: "Load config JSON" },
      evidenceContract: { gameStateUpdate: true, attemptEvents: true, targetResults: true, completionSummary: true },
      guardPushback: { behavior: "Offer a clue", tone: "firm-but-playful", mustNotRevealAnswer: true },
      companionRules: { sunnyCompanionAnchor: true, noInGameCompanionChrome: true, fireCompanionEvents: true, reportGameState: true },
    };

    expect(parseBaselineMechanicBrief(source).sfxContract).toEqual([
      "tap", "correct", "incorrect", "progress", "complete",
    ]);
  });

  it("builds three candidate briefs for a gap", () => {
    const briefs = buildBaselineMechanicBriefCandidates({
      gap: {
        childId: "demo-pashley",
        homeworkId: "hw-math-2",
        domain: "math",
        skillTarget: "multiplication_fluency",
        title: "Multiplication Facts",
        reason: "gap",
        matchedShells: [],
        needsGeneration: true,
      },
      preferenceSummary: "Avoid timer pressure",
      childHooks: ["monster themes"],
    });
    expect(briefs).toHaveLength(3);
    expect(briefs[0]?.guardPushback.behavior).toContain("Avoid prior rejected patterns");
  });

  it("requires a complete experience loop instead of a mechanic label and theme", () => {
    const [brief] = buildBaselineMechanicBriefCandidates({
      gap: {
        childId: "reina",
        homeworkId: "hw-math-2",
        domain: "math",
        skillTarget: "multiplication_fluency",
        title: "Multiplication Facts",
        reason: "Measure x2, x5, and x10 retrieval",
        matchedShells: [],
        needsGeneration: true,
      },
      preferenceSummary: "Prefer strategy; rotate recently used wrestling themes.",
      childHooks: ["strategy", "control", "competition"],
    });

    expect(brief).toMatchObject({
      controlledExperiment: {
        engagementVariable: expect.any(String),
        holdConstant: expect.arrayContaining(["academic targets"]),
      },
      experienceLoop: {
        childAction: expect.any(String),
        worldReaction: expect.any(String),
        anticipation: expect.any(String),
        rewardMoment: expect.any(String),
      },
      deterministicMath: {
        source: "activity-config",
        artworkMayDefineQuantities: false,
      },
      sfxContract: expect.arrayContaining(["tap", "correct", "incorrect", "progress", "complete"]),
      recentThemeExclusions: expect.arrayContaining(["wrestling"]),
    });
  });
});
