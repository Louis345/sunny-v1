import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { AssignmentActivityCard, AssignmentPlannerOutput, AssignmentPlanningPacket } from "../engine/assignmentPlanner";
import type { AssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";
import {
  analyzePlannerTutorOutput,
  evidenceStateSummaries,
  plannerTutorHumanTargetBoard,
  runPlannerTutorLab,
} from "./runPlannerTutorLab";

function extraction(root: string): AssignmentSourceExtraction {
  const imagePath = path.join(root, "page.png");
  fs.writeFileSync(imagePath, "fake worksheet image", "utf8");
  return {
    sourceKind: "scanned_assignment_image",
    sourcePath: "/tmp/5_18_spelling.pdf",
    filename: "5_18_spelling.pdf",
    mediaType: "application/pdf",
    fileHash: "a".repeat(64),
    extractionMethod: "tesseract",
    pages: [{ pageNumber: 1, text: "", imagePath }],
    fullText: "",
    warnings: ["tesseract_unavailable_image_text_empty"],
  };
}

function activityCard(activityId: string, label = activityId): AssignmentActivityCard {
  return {
    activityId,
    sentToPlanner: true,
    launchable: true,
    label,
    purposes: ["practice"],
    domains: ["spelling"],
    skillTargets: ["spelling"],
    evidenceType: "activity_evidence",
    evidenceRole: "spelling_production",
    proofStrength: "diagnostic",
    inputModes: ["default"],
    measures: ["target accuracy"],
    configSource: "test",
    requiredConfig: "none",
    evidencePolicy: "practice-or-diagnostic-evidence",
    bestFor: ["planner-choice tests"],
    contaminationRisks: [],
    modeEvidenceNotes: [],
    strengths: ["useful when the planner chooses it for the right purpose"],
    weakFor: ["unsupported claims"],
    goodFitWhen: ["the planner cites a target-purpose fit"],
    badFitWhen: ["the planner is using it as filler"],
    capabilityModes: [],
    plannerVisibility: "map_node",
    status: "ok",
  };
}

function measurementsForNodes(nodes: ActiveSessionPlan["nodePlan"]): AssignmentPlannerOutput["plannedMeasurements"] {
  return nodes.map((node) => ({
    id: `measure-${node.id}`,
    activityId: node.activityId,
    target: node.targetLane ?? node.targets[0] ?? node.id,
    evidenceType: node.activityId === "mystery" ? "preference_evidence" : "assignment_evidence",
    supportCriteria: `${node.id} produces clean target evidence`,
    reviseCriteria: `${node.id} shows misses, hesitation, or fatigue`,
    falsifyCriteria: `${node.id} produces missing or contaminated evidence`,
  }));
}

function plannerOutput(overrides: Partial<AssignmentPlannerOutput> = {}): AssignmentPlannerOutput {
  const wordGroups = [
    {
      id: "silent_letters",
      label: "Silent Letters",
      purpose: "spell_from_memory" as const,
      words: ["sign", "know", "write"],
      confidence: 0.95,
      evidence: ["Worksheet image labels this column Silent Letters."],
    },
    {
      id: "high_frequency_words",
      label: "High-Frequency Words",
      purpose: "read_fluently" as const,
      words: ["among", "building", "circle"],
      confidence: 0.92,
      evidence: ["Worksheet image labels this column High-Frequency Words."],
    },
  ];
  const output: AssignmentPlannerOutput = {
    capturedContent: {
      title: "Benchmark Advance Spelling Unit 9 Week 3",
      type: "spelling_test",
      rawText: "",
      words: ["sign", "know", "write", "among", "building", "circle"],
      questions: [],
      wordGroups,
      sourceDocuments: [{ filename: "5_18_spelling.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Silent letters and high-frequency words",
        primarySkill: "Spell silent-letter words and read high-frequency words",
        assignmentFormat: "Grouped spelling worksheet",
        concepts: ["silent letters", "high-frequency words"],
        sourceEvidence: ["worksheet page image"],
      },
    },
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups,
      assertions: [],
      selectedTargets: [wordGroups[0]!],
      heldTargets: [wordGroups[1]!],
      clarificationQuestions: [],
      humanAnswers: [],
      memoryMatches: [],
    },
    homeworkWords: [
      { text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "know", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "write", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "among", sourceGroupId: "high_frequency_words", purpose: "read_fluently" },
      { text: "building", sourceGroupId: "high_frequency_words", purpose: "read_fluently" },
      { text: "circle", sourceGroupId: "high_frequency_words", purpose: "read_fluently" },
    ],
    activeSessionPlan: {
      planId: "assignment-plan-lab",
      childId: "ila",
      createdAt: "2026-05-31T12:00:00.000Z",
      source: "ingest_human_loop",
      activeHomeworkId: "hw-spelling-lab",
      domain: "spelling",
      testDate: null,
      nodePlan: [
        {
          id: "spell-check-silent",
          type: "spell-check",
          activityId: "spell-check",
          targets: ["sign", "know", "write"],
          difficulty: 1,
          source: "chart_planner",
          targetLane: "silent_letters",
        },
        {
          id: "pronunciation-hfw",
          type: "pronunciation",
          activityId: "pronunciation",
          targets: ["among", "building", "circle"],
          difficulty: 1,
          source: "chart_planner",
          targetLane: "high_frequency_words",
        },
        {
          id: "letter-rush-silent",
          type: "letter-rush",
          activityId: "letter-rush",
          targets: ["know", "write"],
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
          locked: false,
        },
        {
          id: "quest-transfer",
          type: "quest",
          activityId: "quest",
          targets: ["sign", "know", "write"],
          difficulty: 2,
          source: "chart_planner",
          targetLane: "silent_letters",
          masteryUnlockState: "preparing",
          locked: true,
        },
        {
          id: "boss-mastery",
          type: "boss",
          activityId: "boss",
          targets: [],
          difficulty: 3,
          source: "chart_planner",
          masteryUnlockState: "preparing",
          locked: true,
        },
      ],
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "planner-tutor-lab",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "elli",
        displayName: "Elli",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: [{ id: "assignment-source", type: "assignment_source", summary: "Planner used source page image." }],
      openQuestions: [],
      approvalStatus: "pending",
    },
    plannedMeasurements: [],
    planTheory: {
      hypothesis: "Ila needs spelling-production proof for silent letters and fluent reading support for high-frequency words.",
      evidenceSummary: ["The worksheet image separates the groups."],
      intervention: "Use different materials so the lesson checks, supports, and rewards without feeling like a grind.",
      supportCriteria: ["spelling words improve", "high-frequency words are read fluently"],
      reviseCriteria: ["misses cluster", "engagement drops"],
      falsifyCriteria: ["source grouping was misread"],
    },
    reviewQuestions: [
      "This starts with spelling evidence, then switches to pronunciation and Letter Rush so it does not feel like repeating the same game.",
    ],
  };
  const merged = { ...output, ...overrides };
  if (!overrides.plannedMeasurements) {
    merged.plannedMeasurements = measurementsForNodes(merged.activeSessionPlan.nodePlan);
  }
  return merged;
}

describe("planner tutor lab", () => {
  it("judges a planner output against the real tutor questions without choosing activities for it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-tutor-lab-"));
    const result = analyzePlannerTutorOutput({
      childId: "ila",
      evidenceState: "cold_start",
      packet: {
        childId: "ila",
        sourceDocument: extraction(root),
        childChart: {
          childId: "ila",
          displayName: "Ila",
          selectedCompanionName: "Elli",
          activeHomeworkSummary: null,
          carePlanSummary: "Care plan present.",
          recentEvidence: [],
        },
        activityCatalog: [
          activityCard("spell-check", "Spell Check"),
          activityCard("pronunciation", "Pronunciation"),
          activityCard("letter-rush", "Letter Rush"),
          activityCard("mystery", "Mystery"),
          activityCard("quest", "Quest"),
          activityCard("boss", "Boss"),
        ],
        packetVersion: 1,
        plannerInstruction: "Plan like a tutor.",
      } as unknown as AssignmentPlanningPacket,
      output: plannerOutput(),
      model: "test-model",
      estimatedCostUsd: 0.02,
      telemetry: { model: "test-model", latencyMs: 1 },
    });

    expect(result.passed).toBe(true);
    expect(result.tutorQuestions.map((question) => question.question)).toEqual([
      "Can this tutor read the assignment?",
      "Can they understand my child?",
      "Can they choose materials well?",
      "Can they keep the child engaged?",
      "Can they avoid grind?",
      "Can they explain the plan like a real person?",
      "Can they adapt when evidence changes?",
    ]);
    expect(result.boardSequence).toEqual([
      "spell-check",
      "pronunciation",
      "letter-rush",
      "mystery",
      "quest (locked)",
      "boss (locked)",
    ]);
    expect(result.failures).toEqual([]);
  });

  it("fails a boring repeated-shell board unless the planner gives a tutor-quality rationale", () => {
    const output = plannerOutput({
      activeSessionPlan: {
        ...plannerOutput().activeSessionPlan,
        nodePlan: [
          {
            id: "word-radar-a",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["sign", "know"],
            difficulty: 1,
            source: "chart_planner",
            targetLane: "silent_letters",
            wordRadarConfig: {
              recallMode: "partial_visual_recall",
              inputMode: "letter-by-letter",
              speakStyle: "option-a",
              showTimer: false,
              hideWordDuringResponse: true,
              requiresCapturedResponse: true,
            },
          },
          {
            id: "word-radar-b",
            type: "word-radar",
            activityId: "word-radar",
            targets: ["among", "building"],
            difficulty: 1,
            source: "chart_planner",
            targetLane: "high_frequency_words",
            wordRadarConfig: {
              recallMode: "visible_read",
              inputMode: "whole-word",
              speakStyle: "option-a",
              showTimer: false,
              hideWordDuringResponse: false,
              requiresCapturedResponse: true,
            },
          },
          ...plannerOutput().activeSessionPlan.nodePlan.slice(3),
        ],
      },
      reviewQuestions: ["Approve?"],
    });

    const result = analyzePlannerTutorOutput({
      childId: "ila",
      evidenceState: "cold_start",
      packet: {
        childId: "ila",
        sourceDocument: extraction(fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-tutor-lab-"))),
        childChart: { childId: "ila", displayName: "Ila", recentEvidence: [] },
        activityCatalog: [],
        packetVersion: 1,
        plannerInstruction: "Plan like a tutor.",
      } as unknown as AssignmentPlanningPacket,
      output,
      model: "test-model",
      estimatedCostUsd: 0.02,
      telemetry: { model: "test-model", latencyMs: 1 },
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("same activity shell repeats before Mystery without a believable anti-grind rationale");
  });

  it("runs the same source packet through children and evidence states and writes a read-only proof report", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-tutor-lab-"));
    const outputs: AssignmentPlannerOutput[] = [];
    const report = await runPlannerTutorLab({
      rootDir: root,
      sourceFile: "/tmp/5_18_spelling.pdf",
      children: ["ila", "reina"],
      evidenceStates: ["cold_start", "partial_learning", "strong_mastery", "fatigue_or_boredom"],
      generatedAt: "2026-05-31T12:00:00.000Z",
      extractSource: async () => extraction(root),
      getChart: (childId) => ({
        childId,
        identity: { displayName: childId === "ila" ? "Ila" : "Reina" },
        demographics: { grade: 2 },
        companion: { displayName: childId === "ila" ? "Elli" : "Matilda", presetId: childId === "ila" ? "elli" : "matilda" },
        homework: { pending: null },
        carePlan: { current: { summary: `${childId} care plan` } },
      } as never),
      planAssignment: async (packet) => {
        const evidence = packet.childChart.recentEvidence.join(" ").toLowerCase();
        const baseNodes = plannerOutput().activeSessionPlan.nodePlan;
        const nodePlan = evidence.includes("fatigue")
          ? [
              baseNodes[0]!,
              {
                id: "monster-stampede-energy",
                type: "monster-stampede" as const,
                activityId: "monster-stampede",
                targets: ["know", "write"],
                difficulty: 2 as const,
                source: "chart_planner" as const,
                targetLane: "silent_letters",
              },
              baseNodes[1]!,
              ...baseNodes.slice(3),
            ]
          : evidence.includes("correct first try")
            ? [
                { ...baseNodes[0]!, targets: ["know"] },
                baseNodes[1]!,
                ...baseNodes.slice(3),
              ]
            : evidence.includes("missed know")
              ? [
                  baseNodes[0]!,
                  baseNodes[2]!,
                  baseNodes[1]!,
                  ...baseNodes.slice(3),
                ]
              : baseNodes;
        outputs.push(plannerOutput({
          activeSessionPlan: {
            ...plannerOutput().activeSessionPlan,
            childId: packet.childId,
            nodePlan: nodePlan.map((node) => ({
              ...node,
              id: `${packet.childId}-${packet.childChart.recentEvidence.length}-${node.id}`,
            })),
          },
          planTheory: {
            ...plannerOutput().planTheory,
            evidenceSummary: [
              `${packet.childId} used ${packet.childChart.selectedCompanionName}`,
              ...packet.childChart.recentEvidence,
            ],
          },
        }));
        return outputs[outputs.length - 1]!;
      },
    });

    expect(report.proved).toBe(true);
    expect(report.runs).toHaveLength(8);
    expect(report.totalEstimatedCostUsd).toBeLessThanOrEqual(10);
    expect(report.runs[0]?.packetSummary.sourceHasPageImages).toBe(true);
    expect(report.runs.map((run) => run.evidenceState)).toEqual([
      "cold_start",
      "partial_learning",
      "strong_mastery",
      "fatigue_or_boredom",
      "cold_start",
      "partial_learning",
      "strong_mastery",
      "fatigue_or_boredom",
    ]);
    expect(fs.existsSync(path.join(report.labDir, "planner-tutor-report.json"))).toBe(true);
    expect(fs.existsSync(path.join(report.labDir, "planner-tutor-report.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/context/ila/homework/current.json"))).toBe(false);
  });

  it("keeps the human target board and evidence-state prompts visible as proof targets", () => {
    expect(plannerTutorHumanTargetBoard("ila").nodes.map((node) => node.activityId)).toContain("letter-rush");
    expect(plannerTutorHumanTargetBoard("reina").nodes.map((node) => node.activityId)).toContain("monster-stampede");
    expect(evidenceStateSummaries.partial_learning.join(" ")).toContain("missed know");
    expect(evidenceStateSummaries.strong_mastery.join(" ")).toContain("correct first try");
    expect(evidenceStateSummaries.fatigue_or_boredom.join(" ")).toContain("different-feeling material");
  });

  it("fails fast when a live planner call hangs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-tutor-lab-timeout-"));
    const report = await runPlannerTutorLab({
      rootDir: root,
      sourceFile: "/tmp/5_18_spelling.pdf",
      children: ["ila"],
      evidenceStates: ["cold_start"],
      callTimeoutMs: 1,
      extractSource: async () => extraction(root),
      getChart: (childId) => ({
        childId,
        identity: { displayName: childId },
        demographics: { grade: 2 },
        companion: { displayName: "Elli", presetId: "elli" },
        homework: { pending: null },
        carePlan: { current: null },
      } as never),
      planAssignment: () => new Promise(() => undefined),
      logger: { log: () => undefined },
    });

    expect(report.proved).toBe(false);
    expect(report.failures.join("\n")).toContain("planner_tutor_lab_call_timeout:ila:cold_start");
  });

  it("records planner call failures in the lab report instead of losing the proof artifact", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-tutor-lab-error-"));
    const report = await runPlannerTutorLab({
      rootDir: root,
      sourceFile: "/tmp/5_18_spelling.pdf",
      children: ["reina"],
      evidenceStates: ["partial_learning"],
      extractSource: async () => extraction(root),
      getChart: (childId) => ({
        childId,
        identity: { displayName: childId },
        demographics: { grade: 2 },
        companion: { displayName: "Matilda", presetId: "matilda" },
        homework: { pending: null },
        carePlan: { current: null },
      } as never),
      planAssignment: async () => {
        throw new Error("invalid planner recallMode");
      },
      logger: { log: () => undefined },
    });

    expect(report.proved).toBe(false);
    expect(report.failures.join("\n")).toContain("reina/partial_learning planner call failed: invalid planner recallMode");
    expect(fs.existsSync(path.join(report.labDir, "planner-tutor-report.json"))).toBe(true);
  });
});
