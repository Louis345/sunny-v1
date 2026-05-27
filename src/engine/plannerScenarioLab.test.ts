import { describe, expect, it } from "vitest";
import type { AssignmentPlannerOutput } from "./assignmentPlanner";
import {
  buildPlannerScenarioLabReport,
  estimatePlannerCostUsd,
  plannerScenarioResultFilename,
  type PlannerScenarioRun,
} from "./plannerScenarioLab";

function plannerOutput(args: {
  childId: string;
  evidence: string[];
  nodes: Array<{
    id: string;
    type: string;
    activityId: string;
    targetLane?: string;
    targets?: string[];
    locked?: boolean;
    recallMode?: string;
    inputMode?: string;
  }>;
  board?: {
    nodes?: Array<{ id: string; kind: string; label: string; state: string; lock?: { label: string } }>;
    choiceSets?: Array<{ id: string; kind: string; options: Array<{ id: string; label: string; nodeId?: string }> }>;
  };
}): AssignmentPlannerOutput {
  return {
    capturedContent: {
      title: "Silent Letters Homework",
      type: "spelling_test",
      rawText: "Silent Letters: sign know write. High-Frequency Words: among answer enough.",
      words: ["sign", "know", "write", "among", "answer", "enough"],
      questions: [],
      sourceDocuments: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "silent letters and high-frequency words",
        primarySkill: "spell silent-letter words and read high-frequency words",
        assignmentFormat: "spelling list",
        concepts: ["silent letters", "high-frequency words"],
        sourceEvidence: ["fixture"],
      },
      wordGroups: [],
    },
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups: [],
      assertions: [],
      selectedTargets: [],
      heldTargets: [],
      clarificationQuestions: [],
      humanAnswers: [],
      memoryMatches: [],
    },
    homeworkWords: [],
    activeSessionPlan: {
      planId: `plan-${args.childId}`,
      childId: args.childId,
      createdAt: "2026-05-27T12:00:00.000Z",
      source: "planner_scenario_lab",
      domain: "spelling",
      activeHomeworkId: "hw-silent-letters-fixture",
      nodePlan: args.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        activityId: node.activityId,
        targets: node.targets ?? [],
        targetLane: node.targetLane,
        difficulty: 1,
        source: "chart_planner",
        locked: node.locked,
        wordRadarConfig: node.recallMode
          ? {
              recallMode: node.recallMode,
              inputMode: node.inputMode ?? "whole-word",
              speakStyle: "option-a",
              showTimer: false,
              hideWordDuringResponse: node.recallMode !== "visible_read",
              requiresCapturedResponse: true,
            }
          : undefined,
      })),
      adventureBoard: {
        boardId: `board-${args.childId}`,
        planId: `plan-${args.childId}`,
        childId: args.childId,
        title: "Scenario Board",
        domain: "spelling",
        theme: {
          backgroundImage: "/adventure/backgrounds/silent-letters.png",
          palette: {
            path: "#ffffff",
            completed: "#16a34a",
            available: "#7c3aed",
            locked: "#64748b",
            current: "#f59e0b",
            preview: "#60a5fa",
            text: "#ffffff",
            panel: "rgba(15, 23, 42, 0.68)",
          },
        },
        nodes: args.board?.nodes ?? [
          { id: "start", kind: "start", label: "Start", state: "available" },
          { id: "mystery", kind: "mystery", label: "Mystery", state: "available" },
          { id: "quest", kind: "quest", label: "Quest", state: "preview", lock: { label: "Preparing" } },
          { id: "boss", kind: "boss", label: "Boss", state: "locked", lock: { label: "After Quest" } },
        ],
        edges: [],
        choiceSets: args.board?.choiceSets ?? [
          {
            id: "baseline-route-choice",
            kind: "baseline-route",
            options: [
              { id: "route-a", label: "Careful Read", nodeId: "read-support" },
              { id: "route-b", label: "Spell Challenge", nodeId: "spell-support" },
            ],
          },
        ],
      },
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: args.childId,
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: args.childId === "reina" ? "matilda" : "elli",
        displayName: args.childId === "reina" ? "Matilda" : "Elli",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: args.evidence.map((summary, idx) => ({
        id: `evidence-${idx}`,
        type: "chart",
        summary,
      })),
      openQuestions: [],
      approvalStatus: "pending",
      planTheory: {
        hypothesis: args.evidence.join(" "),
        evidenceSummary: args.evidence,
        intervention: "Adapt the baseline instruments to the child chart.",
        supportCriteria: ["target-level evidence supports the theory"],
        reviseCriteria: ["mixed attempts need a narrower probe"],
        falsifyCriteria: ["failure persists after scaffold"],
      },
      plannedMeasurements: [],
    },
    plannedMeasurements: [],
    planTheory: {
      hypothesis: args.evidence.join(" "),
      evidenceSummary: args.evidence,
      intervention: "Adapt the baseline instruments to the child chart.",
      supportCriteria: ["target-level evidence supports the theory"],
      reviseCriteria: ["mixed attempts need a narrower probe"],
      falsifyCriteria: ["failure persists after scaffold"],
    },
    reviewQuestions: [],
  } as unknown as AssignmentPlannerOutput;
}

function run(overrides: Partial<PlannerScenarioRun> & { childId: string; output: AssignmentPlannerOutput }): PlannerScenarioRun {
  const { childId, output, ...rest } = overrides;
  return {
    scenarioId: "silent-letters-adaptive",
    childId,
    model: "claude-sonnet-4-5",
    latencyMs: 1200,
    telemetry: {
      model: "claude-sonnet-4-5",
      latencyMs: 1200,
    },
    tokenEstimate: {
      inputTokens: 20_000,
      outputTokens: 4_000,
    },
    preflight: { status: "pass", issues: [] },
    expectedEvidenceTerms: [],
    output,
    ...rest,
  };
}

describe("planner scenario lab", () => {
  it("builds a zero-cost side-by-side QA report for child-specific planner runs", () => {
    const ila = run({
      childId: "ila",
      expectedEvidenceTerms: ["decoding hesitation", "voice avoidance"],
      output: plannerOutput({
        childId: "ila",
        evidence: ["Ila has decoding hesitation and voice avoidance, so start low-pressure."],
        nodes: [
          { id: "read-support", type: "word-radar", activityId: "word-radar", targetLane: "high_frequency", targets: ["among", "answer"], recallMode: "visible_read" },
          { id: "spell-support", type: "spell-check", activityId: "spell-check", targetLane: "silent_letters", targets: ["sign", "know"] },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });
    const reina = run({
      childId: "reina",
      expectedEvidenceTerms: ["challenge", "spelling production"],
      output: plannerOutput({
        childId: "reina",
        evidence: ["Reina responds to challenge and needs spelling production proof."],
        nodes: [
          { id: "letter-recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign", "know", "write"], recallMode: "partial_visual_recall", inputMode: "letter-by-letter" },
          { id: "spell-check", type: "spell-check", activityId: "spell-check", targetLane: "silent_letters", targets: ["sign", "know", "write"] },
          { id: "pronunciation", type: "pronunciation", activityId: "pronunciation", targetLane: "high_frequency", targets: ["among", "answer"] },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });

    const report = buildPlannerScenarioLabReport([ila, reina]);

    expect(report.pass).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.runSummaries).toHaveLength(2);
    expect(report.runSummaries[0].estimatedCostUsd).toBeCloseTo(0.12, 5);
    expect(report.runSummaries[0].wordRadarModes).toEqual(["visible_read/whole-word"]);
    expect(report.runSummaries[1].wordRadarModes).toEqual(["partial_visual_recall/letter-by-letter"]);
    expect(report.comparisons[0].learningRelevantDifferenceCount).toBeGreaterThan(0);
    expect(report.markdown).toContain("silent-letters-adaptive");
    expect(report.markdown).toContain("estimated_cost_usd");
  });

  it("fails when child plans collapse to the same learning-relevant signature", () => {
    const sharedOutput = plannerOutput({
      childId: "ila",
      evidence: ["Ila has decoding hesitation."],
      nodes: [
        { id: "same", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign", "know"], recallMode: "visible_read" },
        { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
        { id: "quest", type: "quest", activityId: "quest", locked: true },
        { id: "boss", type: "boss", activityId: "boss", locked: true },
      ],
    });

    const report = buildPlannerScenarioLabReport([
      run({ childId: "ila", expectedEvidenceTerms: ["decoding hesitation"], output: sharedOutput }),
      run({
        childId: "reina",
        expectedEvidenceTerms: ["challenge"],
        output: {
          ...sharedOutput,
          activeSessionPlan: {
            ...sharedOutput.activeSessionPlan,
            childId: "reina",
            evidenceUsed: [{ id: "reina-style", type: "chart", summary: "Reina likes purple labels." }],
          },
        } as AssignmentPlannerOutput,
      }),
    ]);

    expect(report.pass).toBe(false);
    expect(report.failures.map((failure) => failure.code)).toContain("child_plans_collapsed");
    expect(report.failures.map((failure) => failure.code)).toContain("child_difference_not_evidence_tied");
  });

  it("fails planner runs that omit the adventure spine", () => {
    const report = buildPlannerScenarioLabReport([
      run({
        childId: "ila",
        expectedEvidenceTerms: ["decoding hesitation"],
        output: plannerOutput({
          childId: "ila",
          evidence: ["Ila has decoding hesitation."],
          nodes: [
            { id: "read", type: "word-radar", activityId: "word-radar", targets: ["among"], recallMode: "visible_read" },
          ],
          board: {
            nodes: [{ id: "read", kind: "activity", label: "Read", state: "available" }],
            choiceSets: [],
          },
        }),
      }),
    ]);

    expect(report.pass).toBe(false);
    expect(report.failures.map((failure) => failure.code)).toContain("adventure_spine_missing");
  });

  it("estimates cost and creates model-comparable result filenames", () => {
    expect(estimatePlannerCostUsd({
      model: "claude-haiku-4-5",
      inputTokens: 10_000,
      outputTokens: 2_000,
    })).toBeCloseTo(0.02, 5);

    expect(plannerScenarioResultFilename({
      scenarioId: "Silent Letters: Adaptive!",
      childId: "Reina",
      model: "claude-sonnet-4-5",
      createdAt: "2026-05-27T12:34:56.000Z",
    })).toBe("silent-letters-adaptive/reina/claude-sonnet-4-5/2026-05-27T12-34-56-000Z.json");
  });
});
