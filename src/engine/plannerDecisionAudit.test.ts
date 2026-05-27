import { describe, expect, it } from "vitest";
import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  PlannedMeasurement,
  PlanTheory,
} from "../context/schemas/learningProfile";
import {
  auditPlannerDecisions,
  type PlannerDecisionAuditInput,
} from "./plannerDecisionAudit";

type SourceGroup = PlannerDecisionAuditInput["sourceGroups"][number];

const WORD_RADAR_VISIBLE_READ_CONFIG = {
  recallMode: "visible_read" as const,
  inputMode: "whole-word" as const,
  speakStyle: "option-a" as const,
  showTimer: false,
  hideWordDuringResponse: false,
  requiresCapturedResponse: true,
};

const WORD_RADAR_LETTER_FILL_CONFIG = {
  recallMode: "partial_visual_recall" as const,
  inputMode: "letter-by-letter" as const,
  speakStyle: "option-a" as const,
  showTimer: false,
  hideWordDuringResponse: true,
  requiresCapturedResponse: true,
};

const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: "silent_letters",
    label: "Silent Letters",
    purpose: "spell_from_memory",
    words: ["sign", "know", "write"],
    evidence: ["Teacher heading says Silent Letters under spelling list."],
  },
  {
    id: "high_frequency_words",
    label: "High-Frequency Words",
    purpose: "read_fluently",
    words: ["among", "building", "circle"],
    evidence: ["Teacher heading separates high-frequency reading words."],
  },
];

const THEORY: PlanTheory = {
  hypothesis: "Silent-letter words need spelling support; high-frequency words need fluent reading checks.",
  evidenceSummary: [
    "The worksheet separates spelling-production words from high-frequency reading words.",
  ],
  intervention: "Use Word Radar visible reading and Spell Check as baseline instruments before Quest.",
  supportCriteria: ["Baseline evidence is accurate with low frustration."],
  reviseCriteria: ["Misses, hesitation, or frustration cluster by target lane."],
  falsifyCriteria: ["Quest or graded work contradicts baseline confidence."],
};

function measurement(
  id: string,
  activityId: string,
  target: string,
  evidenceType: string,
): PlannedMeasurement {
  return {
    id,
    activityId,
    target,
    evidenceType,
    supportCriteria: `${activityId} supports the theory for ${target}.`,
    reviseCriteria: `${activityId} shows mixed evidence for ${target}.`,
    falsifyCriteria: `${activityId} contradicts the theory for ${target}.`,
  };
}

function plan(overrides: Partial<ActiveSessionPlan> = {}): ActiveSessionPlan {
  return {
    planId: "plan-audit-demo",
    childId: "reina",
    createdAt: "2026-05-25T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: "hw-spelling-demo",
    domain: "spelling",
    testDate: "2026-05-26",
    nodePlan: [
      {
        id: "read-high-frequency",
        type: "word-radar",
        activityId: "word-radar",
        targets: ["among", "building", "circle"],
        difficulty: 1,
        source: "chart_planner",
        targetLane: "high_frequency_words",
        wordRadarConfig: WORD_RADAR_VISIBLE_READ_CONFIG,
      },
      {
        id: "spell-silent-letters",
        type: "spell-check",
        activityId: "spell-check",
        targets: ["sign", "know", "write"],
        difficulty: 2,
        source: "chart_planner",
        targetLane: "silent_letters",
      },
      {
        id: "mystery-choice",
        type: "mystery",
        activityId: "mystery",
        targets: ["sign", "know", "write", "among", "building", "circle"],
        difficulty: 1,
        source: "chart_planner",
        choiceMode: "choice_lab",
        choiceSource: "child_choice",
        locked: false,
      },
      {
        id: "quest-transfer",
        type: "quest",
        activityId: "quest",
        targets: ["sign", "know", "write", "among", "building", "circle"],
        difficulty: 2,
        source: "chart_planner",
        locked: true,
        masteryUnlockState: "preparing",
      },
      {
        id: "boss-mastery",
        type: "boss",
        activityId: "boss",
        targets: [],
        difficulty: 3,
        source: "chart_planner",
        locked: true,
        masteryUnlockState: "preparing",
      },
    ],
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "audit-seed",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [
      {
        id: "assignment-source",
        type: "assignment_source",
        summary: "Planner used the uploaded spelling worksheet.",
      },
    ],
    openQuestions: [],
    plannerConfidence: 0.82,
    approvalStatus: "pending",
    planTheory: THEORY,
    plannedMeasurements: [
      measurement("measure-read-high-frequency", "word-radar", "high_frequency_words", "practice:visible_read"),
      measurement("measure-spell-silent-letters", "spell-check", "silent_letters", "diagnostic"),
      measurement("measure-mystery-choice", "mystery", "preference", "reward"),
      measurement("measure-quest-transfer", "quest", "transfer", "generated"),
      measurement("measure-boss-mastery", "boss", "mastery", "mastery"),
    ],
    ...overrides,
  };
}

function input(overrides: Partial<PlannerDecisionAuditInput> = {}): PlannerDecisionAuditInput {
  const activeSessionPlan = plan(overrides.activeSessionPlan ? overrides.activeSessionPlan : undefined);
  return {
    childId: "reina",
    activeSessionPlan,
    sourceGroups: SOURCE_GROUPS,
    planTheory: activeSessionPlan.planTheory!,
    plannedMeasurements: activeSessionPlan.plannedMeasurements!,
    generatedExperienceBriefs: activeSessionPlan.generatedExperienceBriefs ?? [],
    questEvidence: [],
    algorithmFeeds: [
      { id: "spaced-repetition", status: "ready", summary: "Due words loaded." },
      { id: "activity-affinity", status: "ready", summary: "Choice and replay evidence loaded." },
      { id: "quest-threshold", status: "empty", summary: "Quest is still gated." },
    ],
    ...overrides,
  };
}

describe("PlannerDecisionAudit", () => {
  it("builds one audit row per planned node with the evidence table Sunny needs", () => {
    const report = auditPlannerDecisions(input());

    expect(report.summary).toMatchObject({
      nodeCount: 5,
      warningCount: 0,
      blockerCount: 0,
    });

    const readingRow = report.rows.find((row) => row.nodeId === "read-high-frequency");
    expect(readingRow).toMatchObject({
      nodeId: "read-high-frequency",
      targetPurpose: "read_fluently",
      activityId: "word-radar",
      activityMode: "visible_read",
      severity: "ok",
      algorithmFeeds: expect.arrayContaining(["retrieval-practice", "activity-affinity"]),
      sourceEvidence: expect.arrayContaining([
        "Teacher heading separates high-frequency reading words.",
      ]),
      supportCriteria: expect.stringMatching(/supports the theory/i),
      reviseCriteria: expect.stringMatching(/mixed evidence/i),
      falsifyCriteria: expect.stringMatching(/contradicts/i),
    });
    expect(readingRow?.expectedSignal).toMatch(/visible|read|captured/i);

    const mysteryRow = report.rows.find((row) => row.nodeId === "mystery-choice");
    expect(mysteryRow).toMatchObject({
      targetPurpose: "preference",
      evidenceRole: "preference",
      algorithmFeeds: expect.arrayContaining(["activity-affinity", "variable-reward"]),
      severity: "ok",
    });
    expect(mysteryRow?.algorithmFeeds).not.toContain("mastery-gating");
  });

  it("warns when planner routes a recognition or fluency lane into spelling production", () => {
    const badPlan = plan({
      nodePlan: [
        {
          id: "bad-spell-high-frequency",
          type: "spell-check",
          activityId: "spell-check",
          targets: ["among", "building", "circle"],
          difficulty: 1,
          source: "chart_planner",
          targetLane: "high_frequency_words",
        },
      ],
      plannedMeasurements: [
        measurement("measure-bad-spell-high-frequency", "spell-check", "high_frequency_words", "diagnostic"),
      ],
    });

    const report = auditPlannerDecisions(input({ activeSessionPlan: badPlan }));

    expect(report.summary.warningCount).toBe(1);
    expect(report.rows[0]).toMatchObject({
      nodeId: "bad-spell-high-frequency",
      targetPurpose: "read_fluently",
      activityId: "spell-check",
      severity: "warning",
      findings: [
        expect.objectContaining({
          code: "target_purpose_activity_mismatch",
          severity: "warning",
        }),
      ],
    });
  });

  it("blocks reward or preference nodes from becoming the academic intervention", () => {
    const rewardTheory: PlanTheory = {
      ...THEORY,
      intervention: "Use Mystery as the intervention that teaches the spelling pattern.",
    };
    const activeSessionPlan = plan({ planTheory: rewardTheory });

    const report = auditPlannerDecisions(input({
      activeSessionPlan,
      planTheory: rewardTheory,
    }));

    expect(report.summary.blockerCount).toBe(1);
    expect(report.reportFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "preference_node_as_academic_intervention",
          severity: "blocker",
        }),
      ]),
    );
  });

  it("blocks Quest and Boss if they become playable before their evidence gates are satisfied", () => {
    const activeSessionPlan = plan({
      nodePlan: [
        {
          id: "quest-transfer",
          type: "quest",
          activityId: "quest",
          targets: ["sign", "know", "write"],
          difficulty: 2,
          source: "chart_planner",
          locked: false,
          masteryUnlockState: "unlocked",
        },
        {
          id: "boss-mastery",
          type: "boss",
          activityId: "boss",
          targets: [],
          difficulty: 3,
          source: "chart_planner",
          locked: false,
          masteryUnlockState: "unlocked",
        },
      ],
    });

    const report = auditPlannerDecisions(input({
      activeSessionPlan,
      generatedExperienceBriefs: [],
      questEvidence: [],
    }));

    expect(report.summary.blockerCount).toBeGreaterThanOrEqual(2);
    expect(report.reportFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quest_playable_without_validated_artifact",
          nodeId: "quest-transfer",
          severity: "blocker",
        }),
        expect.objectContaining({
          code: "boss_playable_without_quest_evidence",
          nodeId: "boss-mastery",
          severity: "blocker",
        }),
      ]),
    );
  });

  it("requires every node to have support, revise, and falsify criteria", () => {
    const activeSessionPlan = plan({
      nodePlan: [
        {
          id: "unmeasured-node",
          type: "word-radar",
          activityId: "word-radar",
          targets: ["sign", "know", "write"],
          difficulty: 2,
          source: "chart_planner",
          targetLane: "silent_letters",
          wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
        },
      ],
      plannedMeasurements: [],
    });

    const report = auditPlannerDecisions(input({
      activeSessionPlan,
      plannedMeasurements: [],
    }));

    expect(report.summary.blockerCount).toBe(1);
    expect(report.rows[0]).toMatchObject({
      nodeId: "unmeasured-node",
      severity: "blocker",
      findings: [
        expect.objectContaining({
          code: "missing_support_revise_falsify_criteria",
          severity: "blocker",
        }),
      ],
    });
  });
});
