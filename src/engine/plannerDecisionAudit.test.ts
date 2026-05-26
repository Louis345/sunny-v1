import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { AdventureBoardJson } from "../shared/adventureBoardJson";
import type { AssignmentPlannerOutput } from "./assignmentPlanner";
import { buildPlannerDecisionAudit } from "./plannerDecisionAudit";

const theme: AdventureBoardJson["theme"] = {
  background: { type: "solid", value: "#123" },
  palette: {
    path: "#fff",
    completed: "#2f9f6f",
    available: "#7058f4",
    locked: "#aeb7c2",
    current: "#ef9825",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(21, 31, 50, 0.80)",
  },
};

function activeSessionPlan(board: AdventureBoardJson): ActiveSessionPlan {
  return {
    planId: "assignment-plan-reina",
    childId: "reina",
    createdAt: "2026-05-25T00:00:00.000Z",
    source: "ingest_human_loop",
    domain: "spelling",
    testDate: "2026-05-26",
    nodePlan: [
      {
        id: "baseline_spelling_diagnostic",
        type: "spell-check",
        activityId: "spell-check",
        targets: ["sign", "know"],
        difficulty: 1,
        source: "chart_planner",
        targetLane: "silent_letters",
      },
      {
        id: "mystery_choice",
        type: "mystery",
        activityId: "mystery",
        targets: ["sign", "know"],
        difficulty: 1,
        source: "chart_planner",
        targetLane: "silent_letters",
        choiceMode: "choice_lab",
      },
      {
        id: "quest_transfer",
        type: "quest",
        activityId: "quest",
        targets: ["sign", "know"],
        difficulty: 2,
        source: "chart_planner",
        targetLane: "silent_letters",
        locked: false,
      },
      {
        id: "boss_mastery",
        type: "boss",
        activityId: "boss",
        targets: [],
        difficulty: 3,
        source: "chart_planner",
        targetLane: "silent_letters",
        locked: true,
      },
    ],
    adventureBoard: board,
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "assignment-plan",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [{ id: "assignment-source", type: "assignment_source", summary: "OCR source text" }],
    openQuestions: [],
    approvalStatus: "pending",
  };
}

function board(overrides: Partial<AdventureBoardJson> = {}): AdventureBoardJson {
  return {
    schemaVersion: 1,
    boardId: "planner-board",
    planId: "assignment-plan-reina",
    childId: "reina",
    domain: "spelling",
    theme,
    nodes: [
      {
        id: "baseline_spelling_diagnostic",
        kind: "activity",
        activityId: "spell-check",
        label: "Verify",
        state: "completed",
        evidenceRole: "baseline",
      },
      {
        id: "mystery_choice",
        kind: "mystery",
        activityId: "mystery",
        label: "Mystery",
        state: "available",
        evidenceRole: "preference",
      },
      {
        id: "quest_transfer",
        kind: "quest",
        activityId: "quest",
        label: "Quest",
        state: "available",
        evidenceRole: "transfer",
      },
      {
        id: "boss_mastery",
        kind: "boss",
        activityId: "boss",
        label: "Boss",
        state: "locked",
        evidenceRole: "mastery",
      },
    ],
    edges: [
      { id: "e-verify-mystery", from: "baseline_spelling_diagnostic", to: "mystery_choice", state: "completed" },
      { id: "e-mystery-quest", from: "mystery_choice", to: "quest_transfer", state: "available" },
      { id: "e-quest-boss", from: "quest_transfer", to: "boss_mastery", state: "locked" },
    ],
    ...overrides,
  };
}

function output(boardJson = board()): AssignmentPlannerOutput {
  return {
    capturedContent: {
      title: "Silent Letters",
      type: "spelling_test",
      rawText: "Silent Letters\nsign\nknow",
      words: ["sign", "know"],
      questions: [],
      sourceDocuments: [{ filename: "demo.pdf", mediaType: "application/pdf" }],
      wordGroups: [
        {
          id: "silent_letters",
          label: "Silent Letters",
          purpose: "spell_from_memory",
          words: ["sign", "know"],
          confidence: 0.95,
          evidence: ["source heading"],
        },
      ],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Silent letters",
        primarySkill: "spell from memory",
        assignmentFormat: "word list",
        concepts: ["Silent Letters"],
        sourceEvidence: ["source heading"],
      },
    },
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups: [
        {
          id: "silent_letters",
          label: "Silent Letters",
          purpose: "spell_from_memory",
          words: ["sign", "know"],
          confidence: 0.95,
          evidence: ["source heading"],
        },
      ],
      selectedTargets: [],
      heldTargets: [],
      assertions: [],
      clarificationQuestions: [],
      humanAnswers: [],
      memoryMatches: [],
    },
    homeworkWords: [
      { text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "know", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
    ],
    activeSessionPlan: activeSessionPlan(boardJson),
    plannedMeasurements: [],
    planTheory: {
      hypothesis: "Silent letters need spelling-production evidence.",
      evidenceSummary: ["source heading"],
      intervention: "Spell check then generated transfer.",
      supportCriteria: ["accurate spelling"],
      reviseCriteria: ["missed silent-letter words"],
      falsifyCriteria: ["source corrected"],
    },
    reviewQuestions: [],
  };
}

describe("PlannerDecisionAudit", () => {
  it("prints a node/source/purpose/activity/algorithm/status table", () => {
    const audit = buildPlannerDecisionAudit(output());

    expect(audit.markdown).toContain("| node | source evidence | target purpose | activity/mode | algorithm feed | expected signal | status |");
    expect(audit.markdown).toContain("baseline_spelling_diagnostic");
    expect(audit.markdown).toContain("spell_from_memory");
    expect(audit.markdown).toContain("masteryGate");
  });

  it("flags preference routes that claim mastery evidence", () => {
    const audit = buildPlannerDecisionAudit(output(board({
      nodes: [
        {
          id: "story_spark",
          kind: "reward",
          label: "Story Spark",
          state: "available",
          evidenceRole: "mastery",
        },
      ],
      edges: [],
    })));

    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "preference_claims_mastery" }),
    ]));
  });

  it("flags Quest or Boss unlocked before their evidence gates are satisfied", () => {
    const audit = buildPlannerDecisionAudit(output());

    expect(audit.issues).toEqual([
      expect.objectContaining({ code: "quest_unlocked_without_required_evidence" }),
    ]);
  });
});
