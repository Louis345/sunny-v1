import { describe, expect, it } from "vitest";
import type { AssignmentPlannerOutput } from "./assignmentPlanner";
import {
  DEFAULT_BASELINE_PLANNER_MODEL,
  DEFAULT_STRONGER_PLANNER_MODEL,
  buildPlannerScenarioBatchMetadata,
  buildPlannerScenarioLabReport,
  comparePlannerScenarioRunSets,
  estimatePlannerCostUsd,
  filterPlannerScenarioPaidFixtures,
  plannerScenarioResultFilename,
  selectPlannerScenarioRunSet,
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
    expect(DEFAULT_BASELINE_PLANNER_MODEL).toBe("claude-sonnet-4-5");
    expect(DEFAULT_STRONGER_PLANNER_MODEL).toBe("claude-opus-4-5");
    expect(estimatePlannerCostUsd({
      model: "claude-haiku-4-5",
      inputTokens: 10_000,
      outputTokens: 2_000,
    })).toBeCloseTo(0.02, 5);
    expect(estimatePlannerCostUsd({
      model: DEFAULT_STRONGER_PLANNER_MODEL,
      inputTokens: 10_000,
      outputTokens: 2_000,
    })).toBeCloseTo(0.1, 5);

    expect(plannerScenarioResultFilename({
      scenarioId: "Silent Letters: Adaptive!",
      childId: "Reina",
      model: "claude-sonnet-4-5",
      createdAt: "2026-05-27T12:34:56.000Z",
    })).toBe("silent-letters-adaptive/reina/claude-sonnet-4-5/2026-05-27T12-34-56-000Z.json");
  });

  it("passes spelling ability-band fixtures when plans adapt by evidence and instrument need", () => {
    const advanced = run({
      scenarioId: "spelling-ability-bands",
      childId: "advanced_speller",
      expectedEvidenceTerms: ["first-try accurate", "low latency"],
      scenarioExpectations: {
        requiredEvidenceRoles: ["clean_spelling_recall"],
        discouragedActivities: ["word-builder"],
        discouragedFirstActivities: ["word-builder", "letter-rush"],
        expectedTargetLanes: ["silent_letters"],
      },
      output: plannerOutput({
        childId: "advanced_speller",
        evidence: ["Recent spelling was first-try accurate with low latency, so use a short spaced proof."],
        nodes: [
          { id: "spaced-recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign", "know"], recallMode: "hidden_word_recall", inputMode: "whole-word" },
          { id: "cold-check", type: "spell-check", activityId: "spell-check", targetLane: "silent_letters", targets: ["write"] },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });
    const typical = run({
      scenarioId: "spelling-ability-bands",
      childId: "typical_speller",
      expectedEvidenceTerms: ["no prior spelling baseline"],
      scenarioExpectations: {
        requiredEvidenceRoles: ["spelling_production", "scaffolded_spelling_practice"],
        expectedWordRadarModes: ["partial_visual_recall/letter-by-letter"],
        expectedTargetLanes: ["silent_letters", "high_frequency"],
      },
      output: plannerOutput({
        childId: "typical_speller",
        evidence: ["There is no prior spelling baseline, so start with clean baseline evidence."],
        nodes: [
          { id: "letter-recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign", "know"], recallMode: "partial_visual_recall", inputMode: "letter-by-letter" },
          { id: "spell-check", type: "spell-check", activityId: "spell-check", targetLane: "silent_letters", targets: ["sign", "know"] },
          { id: "read-hf", type: "word-radar", activityId: "word-radar", targetLane: "high_frequency", targets: ["among"], recallMode: "visible_read", inputMode: "whole-word" },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });
    const slow = run({
      scenarioId: "spelling-ability-bands",
      childId: "slow_decoder",
      expectedEvidenceTerms: ["misses silent letters", "high retry"],
      scenarioExpectations: {
        requiredEvidenceRoles: ["construction_support", "scaffolded_spelling_practice"],
        discouragedFirstActivities: ["letter-rush"],
        forbiddenWordRadarModes: ["hidden_word_recall/whole-word"],
        expectedWordRadarModes: ["partial_visual_recall/letter-by-letter"],
        expectedTargetLanes: ["silent_letters"],
      },
      output: plannerOutput({
        childId: "slow_decoder",
        evidence: ["This child misses silent letters with high retry count, so teach before pressure."],
        nodes: [
          { id: "build", type: "word-builder", activityId: "word-builder", targetLane: "silent_letters", targets: ["sign", "know"] },
          { id: "guided-radar", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign", "know"], recallMode: "partial_visual_recall", inputMode: "letter-by-letter" },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });

    const report = buildPlannerScenarioLabReport([advanced, typical, slow]);

    expect(report.pass).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.comparisons[0].learningRelevantDifferenceCount).toBe(3);
    expect(report.markdown).toContain("## Instrument QA");
    expect(report.markdown).toContain("advanced_speller");
  });

  it("passes role-equivalent clean spelling evidence instead of exact spell-check", () => {
    const report = buildPlannerScenarioLabReport([
      run({
        scenarioId: "spelling-ability-bands",
        childId: "advanced_speller",
        expectedEvidenceTerms: ["first-try accurate"],
        scenarioExpectations: {
          requiredEvidenceRoles: ["clean_spelling_recall"],
          maximumAcademicNodeCount: 1,
        },
        output: plannerOutput({
          childId: "advanced_speller",
          evidence: ["Recent spelling was first-try accurate, so use one clean recall check."],
          nodes: [
            { id: "recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign"], recallMode: "hidden_word_recall", inputMode: "whole-word" },
            { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
            { id: "quest", type: "quest", activityId: "quest", locked: true },
            { id: "boss", type: "boss", activityId: "boss", locked: true },
          ],
        }),
      }),
    ]);

    expect(report.pass).toBe(true);
    expect(report.instrumentFindings).toEqual([
      expect.objectContaining({ status: "pass", code: "scenario_expectations_met" }),
    ]);
  });

  it("fails visible Word Radar when spelling production evidence is required", () => {
    const report = buildPlannerScenarioLabReport([
      run({
        scenarioId: "spelling-ability-bands",
        childId: "typical_speller",
        expectedEvidenceTerms: ["no prior spelling baseline"],
        scenarioExpectations: {
          requiredEvidenceRoles: ["spelling_production"],
        },
        output: plannerOutput({
          childId: "typical_speller",
          evidence: ["There is no prior spelling baseline."],
          nodes: [
            { id: "visible", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign"], recallMode: "visible_read", inputMode: "whole-word" },
            { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
            { id: "quest", type: "quest", activityId: "quest", locked: true },
            { id: "boss", type: "boss", activityId: "boss", locked: true },
          ],
        }),
      }),
    ]);

    expect(report.pass).toBe(false);
    expect(report.failures.map((failure) => failure.code)).toContain("expected_instrument_missing");
  });

  it("fails when a struggling spelling learner starts with hidden recall or speed pressure", () => {
    const report = buildPlannerScenarioLabReport([
      run({
        scenarioId: "spelling-ability-bands",
        childId: "slow_decoder",
        expectedEvidenceTerms: ["misses silent letters"],
        scenarioExpectations: {
          discouragedFirstActivities: ["letter-rush"],
          forbiddenWordRadarModes: ["hidden_word_recall/whole-word"],
        },
        output: plannerOutput({
          childId: "slow_decoder",
          evidence: ["This child misses silent letters and needs support."],
          nodes: [
            { id: "rush", type: "letter-rush", activityId: "letter-rush", targetLane: "silent_letters", targets: ["sign", "know"] },
            { id: "hard-recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["write"], recallMode: "hidden_word_recall", inputMode: "whole-word" },
            { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
            { id: "quest", type: "quest", activityId: "quest", locked: true },
            { id: "boss", type: "boss", activityId: "boss", locked: true },
          ],
        }),
      }),
    ]);

    expect(report.pass).toBe(false);
    expect(report.failures.map((failure) => failure.code)).toContain("unsafe_first_instrument");
    expect(report.failures.map((failure) => failure.code)).toContain("word_radar_mode_mismatch");
  });

  it("fails when an advanced spelling learner gets redundant scaffolding", () => {
    const report = buildPlannerScenarioLabReport([
      run({
        scenarioId: "spelling-ability-bands",
        childId: "advanced_speller",
        expectedEvidenceTerms: ["first-try accurate"],
        scenarioExpectations: {
          discouragedActivities: ["word-builder"],
          maximumAcademicNodeCount: 2,
        },
        output: plannerOutput({
          childId: "advanced_speller",
          evidence: ["Targets were first-try accurate yesterday."],
          nodes: [
            { id: "builder", type: "word-builder", activityId: "word-builder", targetLane: "silent_letters", targets: ["sign"] },
            { id: "radar", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["know"], recallMode: "partial_visual_recall", inputMode: "letter-by-letter" },
            { id: "spell", type: "spell-check", activityId: "spell-check", targetLane: "silent_letters", targets: ["write"] },
            { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
            { id: "quest", type: "quest", activityId: "quest", locked: true },
            { id: "boss", type: "boss", activityId: "boss", locked: true },
          ],
        }),
      }),
    ]);

    expect(report.pass).toBe(false);
    expect(report.failures.map((failure) => failure.code)).toContain("redundant_baseline_for_mastered_targets");
  });

  it("reports missing instrument gaps separately from planner failures", () => {
    const report = buildPlannerScenarioLabReport([
      run({
        scenarioId: "spelling-ability-bands",
        childId: "handwriting_transfer_gap",
        scenarioExpectations: {
          missingInstrumentSignals: ["paper_handwriting_transfer"],
          requiredActivities: ["spell-check"],
        },
        output: plannerOutput({
          childId: "handwriting_transfer_gap",
          evidence: ["Digital spelling is clean but paper handwriting transfer is unknown."],
          nodes: [
            { id: "spell", type: "spell-check", activityId: "spell-check", targetLane: "silent_letters", targets: ["sign"] },
            { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
            { id: "quest", type: "quest", activityId: "quest", locked: true },
            { id: "boss", type: "boss", activityId: "boss", locked: true },
          ],
        }),
      }),
    ]);

    expect(report.pass).toBe(false);
    expect(report.failures.map((failure) => failure.code)).toContain("missing_activity_gap_not_reported");
    expect(report.markdown).toContain("paper_handwriting_transfer");
  });

  it("caps paid planner fixtures before model calls", () => {
    const fixtures = [
      { scenarioId: "spelling-ability-bands", childId: "advanced_speller", estimatedCostUsd: 0.2 },
      { scenarioId: "spelling-ability-bands", childId: "typical_speller", estimatedCostUsd: 0.2 },
      { scenarioId: "spelling-ability-bands", childId: "slow_decoder", estimatedCostUsd: 0.2 },
      { scenarioId: "silent-letters-adaptive", childId: "ila", estimatedCostUsd: 0.2 },
    ];

    expect(filterPlannerScenarioPaidFixtures({
      fixtures,
      scenarioFilter: "spelling-ability-bands",
      limit: 2,
      maxCostUsd: 1,
    })).toEqual(fixtures.slice(0, 2));
    expect(() => filterPlannerScenarioPaidFixtures({
      fixtures,
      scenarioFilter: "spelling-ability-bands",
      limit: 6,
      maxCostUsd: 0.3,
    })).toThrow(/planner_scenario_lab_paid_cost_cap/);
  });

  it("filters paid planner fixtures by child case before spending", () => {
    const fixtures = [
      { scenarioId: "spelling-ability-bands", childId: "advanced_speller", estimatedCostUsd: 0.2 },
      { scenarioId: "spelling-ability-bands", childId: "test_tomorrow_mixed", estimatedCostUsd: 0.2 },
      { scenarioId: "silent-letters-adaptive", childId: "test_tomorrow_mixed", estimatedCostUsd: 0.2 },
    ];

    expect(filterPlannerScenarioPaidFixtures({
      fixtures,
      scenarioFilter: "spelling-ability-bands",
      childFilter: "test_tomorrow_mixed",
      maxCostUsd: 0.3,
    })).toEqual([fixtures[1]]);
  });

  it("compares saved run sets and reports fixed planner failures as improvement", () => {
    const baseline = run({
      scenarioId: "spelling-ability-bands",
      childId: "typical_speller",
      expectedEvidenceTerms: ["no prior spelling baseline"],
      scenarioExpectations: {
        requiredEvidenceRoles: ["spelling_production"],
      },
      output: plannerOutput({
        childId: "typical_speller",
        evidence: ["There is no prior spelling baseline."],
        nodes: [
          { id: "radar", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign"], recallMode: "partial_visual_recall", inputMode: "letter-by-letter" },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });
    const candidate = run({
      scenarioId: "spelling-ability-bands",
      childId: "typical_speller",
      expectedEvidenceTerms: ["no prior spelling baseline"],
      scenarioExpectations: {
        requiredEvidenceRoles: ["spelling_production"],
      },
      output: plannerOutput({
        childId: "typical_speller",
        evidence: ["There is no prior spelling baseline."],
        nodes: [
          { id: "spell", type: "spell-check", activityId: "spell-check", targetLane: "silent_letters", targets: ["sign"] },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });

    const comparison = comparePlannerScenarioRunSets({
      scenarioId: "spelling-ability-bands",
      baselineLabel: "first-full:claude-sonnet-4-5",
      candidateLabel: "latest-full:claude-sonnet-4-5",
      baselineRuns: [baseline],
      candidateRuns: [candidate],
    });

    expect(comparison.status).toBe("improved");
    expect(comparison.scoreDelta).toBeGreaterThan(0);
    expect(comparison.childComparisons[0].fixedFailures).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "expected_instrument_missing" })]),
    );
    expect(comparison.markdown).toContain("status: improved");
    expect(comparison.markdown).toContain("fixed");
  });

  it("reports regressions when the candidate loses adventure spine or evidence quality", () => {
    const baseline = run({
      scenarioId: "spelling-ability-bands",
      childId: "advanced_speller",
      output: plannerOutput({
        childId: "advanced_speller",
        evidence: ["first-try accurate"],
        nodes: [
          { id: "recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign"], recallMode: "hidden_word_recall" },
          { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
          { id: "quest", type: "quest", activityId: "quest", locked: true },
          { id: "boss", type: "boss", activityId: "boss", locked: true },
        ],
      }),
    });
    const candidate = run({
      scenarioId: "spelling-ability-bands",
      childId: "advanced_speller",
      output: plannerOutput({
        childId: "advanced_speller",
        evidence: ["first-try accurate"],
        nodes: [
          { id: "recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign"], recallMode: "hidden_word_recall" },
        ],
        board: {
          nodes: [{ id: "recall", kind: "activity", label: "Recall", state: "available" }],
          choiceSets: [],
        },
      }),
    });

    const comparison = comparePlannerScenarioRunSets({
      scenarioId: "spelling-ability-bands",
      baselineLabel: "baseline",
      candidateLabel: "candidate",
      baselineRuns: [baseline],
      candidateRuns: [candidate],
    });

    expect(comparison.status).toBe("regressed");
    expect(comparison.childComparisons[0].newFailures).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "adventure_spine_missing" })]),
    );
  });

  it("selects first-full and latest-full run sets by scenario and model", () => {
    const firstReina = run({
      scenarioId: "spelling-ability-bands",
      childId: "reina",
      createdAt: "2026-05-27T22:00:00.000Z",
      output: plannerOutput({ childId: "reina", evidence: ["first"], nodes: [{ id: "a", type: "spell-check", activityId: "spell-check" }] }),
    });
    const latestReina = run({
      scenarioId: "spelling-ability-bands",
      childId: "reina",
      createdAt: "2026-05-27T23:00:00.000Z",
      output: plannerOutput({ childId: "reina", evidence: ["latest"], nodes: [{ id: "b", type: "word-radar", activityId: "word-radar", recallMode: "visible_read" }] }),
    });
    const firstIla = run({
      scenarioId: "spelling-ability-bands",
      childId: "ila",
      createdAt: "2026-05-27T22:10:00.000Z",
      output: plannerOutput({ childId: "ila", evidence: ["first"], nodes: [{ id: "c", type: "spell-check", activityId: "spell-check" }] }),
    });

    expect(selectPlannerScenarioRunSet({
      runs: [latestReina, firstIla, firstReina],
      scenarioId: "spelling-ability-bands",
      selector: "first-full:claude-sonnet-4-5",
    }).map((selected) => selected.createdAt)).toEqual([
      "2026-05-27T22:10:00.000Z",
      "2026-05-27T22:00:00.000Z",
    ]);
    expect(selectPlannerScenarioRunSet({
      runs: [firstReina, firstIla, latestReina],
      scenarioId: "spelling-ability-bands",
      selector: "latest-full:claude-sonnet-4-5",
    }).map((selected) => selected.createdAt)).toEqual([
      "2026-05-27T22:10:00.000Z",
      "2026-05-27T23:00:00.000Z",
    ]);
  });

  it("selects the previous full run set for before-and-after comparisons", () => {
    const first = run({
      scenarioId: "spelling-ability-bands",
      childId: "reina",
      createdAt: "2026-05-27T22:00:00.000Z",
      output: plannerOutput({ childId: "reina", evidence: ["first"], nodes: [{ id: "a", type: "spell-check", activityId: "spell-check" }] }),
    });
    const previous = run({
      scenarioId: "spelling-ability-bands",
      childId: "reina",
      createdAt: "2026-05-27T23:00:00.000Z",
      output: plannerOutput({ childId: "reina", evidence: ["previous"], nodes: [{ id: "b", type: "word-radar", activityId: "word-radar", recallMode: "visible_read" }] }),
    });
    const latest = run({
      scenarioId: "spelling-ability-bands",
      childId: "reina",
      createdAt: "2026-05-28T00:00:00.000Z",
      output: plannerOutput({ childId: "reina", evidence: ["latest"], nodes: [{ id: "c", type: "word-radar", activityId: "word-radar", recallMode: "hidden_word_recall" }] }),
    });

    expect(selectPlannerScenarioRunSet({
      runs: [latest, first, previous],
      scenarioId: "spelling-ability-bands",
      selector: "previous-full:claude-sonnet-4-5",
    }).map((selected) => selected.createdAt)).toEqual(["2026-05-27T23:00:00.000Z"]);
  });

  it("builds stable batch metadata for fixture and paid planner run sets", () => {
    const runs = [
      run({
        scenarioId: "spelling-ability-bands",
        childId: "advanced_speller",
        output: plannerOutput({
          childId: "advanced_speller",
          evidence: ["first-try accurate"],
          nodes: [
            { id: "recall", type: "word-radar", activityId: "word-radar", targetLane: "silent_letters", targets: ["sign"], recallMode: "hidden_word_recall" },
            { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
            { id: "quest", type: "quest", activityId: "quest", locked: true },
            { id: "boss", type: "boss", activityId: "boss", locked: true },
          ],
        }),
      }),
    ];
    const report = buildPlannerScenarioLabReport(runs);

    const metadata = buildPlannerScenarioBatchMetadata({
      batchId: "spelling-ability-bands-claude-sonnet-4-5-2026-05-27T23-00-00-000Z",
      createdAt: "2026-05-27T23:00:00.000Z",
      model: "claude-sonnet-4-5",
      scenarioId: "spelling-ability-bands",
      promptVersion: "activity-evidence-contract-v1",
      runs,
      report,
    });

    expect(metadata).toMatchObject({
      batchId: "spelling-ability-bands-claude-sonnet-4-5-2026-05-27T23-00-00-000Z",
      model: "claude-sonnet-4-5",
      scenarioId: "spelling-ability-bands",
      promptVersion: "activity-evidence-contract-v1",
      runCount: 1,
      pass: true,
    });
    expect(metadata.totalEstimatedCostUsd).toBeCloseTo(0.12, 5);
    expect(metadata.childIds).toEqual(["advanced_speller"]);
  });
});
