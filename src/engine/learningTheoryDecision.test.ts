import { describe, expect, it } from "vitest";
import type { ChildChart } from "../profiles/childChart";
import type { PostSessionTruthPacket } from "./postSessionTruthPacket";
import { deriveLearningTheoryDecision } from "./learningTheoryDecision";

function chart(domain = "math"): ChildChart {
  return {
    childId: "reina",
    activeSessionPlan: {
      planId: "plan-math-1",
      domain,
      planTheory: {
        hypothesis: "Visual arrays may support multiplication retrieval.",
        evidenceSummary: ["Prior 6x4 miss"],
        intervention: "Array support followed by cold recall.",
        supportCriteria: ["Cold recall improves"],
        reviseCriteria: ["Only scaffolded accuracy improves"],
        falsifyCriteria: ["Delayed work remains weak"],
      },
    },
    learningProfile: { learningTheoryDecisions: [] },
    contentCatalog: {
      items: [{ contentId: "math-game-1", homeworkId: "hw-math-1" }],
    },
  } as unknown as ChildChart;
}

function packet(): PostSessionTruthPacket {
  return {
    packetVersion: 1,
    sessionDir: "/tmp/session-math-1",
    generatedAt: "2026-07-11T12:00:00.000Z",
    sessionSummary: {
      childId: "reina",
      subject: "math",
      activityCount: 1,
      readingCount: 2,
      targetCount: 1,
      sourceFiles: ["game-traces.ndjson"],
    },
    assignmentSourceSummary: {
      homeworkIds: ["hw-math-1"],
      targetGroups: ["multiplication"],
      targetPurposes: ["retrieval"],
    },
    activityReports: [{
      activityId: "generated-baseline",
      readings: 2,
      targets: ["6x4"],
      correctTargets: ["6x4"],
      missedTargets: [],
      recoveredTargets: ["6x4"],
      contaminatedTargets: [],
      evidenceTiers: ["practice"],
      helpRequests: 0,
      skips: 0,
      accuracy: 1,
      interpretation: ["Recovered after practice"],
    }],
    targetEvidence: [{
      target: "6x4",
      activities: ["generated-baseline"],
      correctCount: 1,
      missedCount: 0,
      recoveredCount: 1,
      contaminatedCount: 0,
      lastStatus: "recovered",
      lastQuality: "clean",
      evidenceTiers: ["practice"],
    }],
    flowAndPreferenceSignals: { helpRequests: 0, skips: 0, replays: 1, frustrationSignals: 0 },
    companionObservations: [{
      source: "companion_observation",
      observation: "Reina said the array made it feel easier.",
    }],
    contradictions: [],
    contaminationWarnings: [],
    questBossReadiness: {
      quest: { status: "locked", evidenceSeen: false },
      boss: { status: "locked", evidenceSeen: false },
    },
    trustworthiness: {
      trustworthyTargets: ["6x4"],
      weakTargets: [],
      contaminatedTargets: [],
      missingEvidence: [],
    },
    evidenceInterpreted: {
      activities: ["generated-baseline"],
      targets: ["6x4"],
      missedTargets: [],
      correctTargets: ["6x4"],
      contaminatedTargets: [],
    },
    adaptationDecision: {
      status: "unchanged",
      reason: "Cold recall improved, but math transfer still needs delayed calibration.",
    },
  };
}

describe("closed learning theory decision", () => {
  it("writes one math decision that stays open for calibration", () => {
    const decision = deriveLearningTheoryDecision(chart(), packet(), {
      now: new Date("2026-07-11T12:05:00.000Z"),
    });
    expect(decision).toMatchObject({
      theoryDecisionId: "theory:plan-math-1",
      status: "awaiting_calibration",
      reason: "Cold recall improved, but math transfer still needs delayed calibration.",
    });
    expect(decision?.contentIds).toEqual(["math-game-1"]);
  });

  it("keeps companion observations separate from academic evidence", () => {
    const decision = deriveLearningTheoryDecision(chart(), packet());
    expect(decision?.companionObservations).toEqual([
      "Reina said the array made it feel easier.",
    ]);
    expect(decision?.academicEvidenceSummary.join(" ")).not.toContain("feel easier");
  });

  it("does not manufacture a theory decision for a non-learning session", () => {
    const empty = packet();
    empty.activityReports = [];
    empty.targetEvidence = [];
    expect(deriveLearningTheoryDecision(chart(), empty)).toBeNull();
  });
});
