import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import type { CapturedHomeworkContent } from "./contentAwareHomeworkPlanner";
import type {
  AssignmentPlannerOutput,
  AssignmentSourceExtraction,
} from "../engine/assignmentPlanner";
import {
  buildSparkOrbPlannerAudit,
  runSparkOrbPlannerVisibilityLab,
} from "./runSparkOrbPlannerVisibilityLab";

function extraction(): AssignmentSourceExtraction {
  return {
    sourceKind: "text_assignment",
    sourcePath: "/Users/jamaltaylor/Downloads/5_18 spelling .pdf",
    filename: "5_18 spelling .pdf",
    mediaType: "application/pdf",
    fileHash: "b".repeat(64),
    extractionMethod: "unpdf",
    pages: [{ pageNumber: 1, text: "Silent Letters\nsign\nknow\nwrite" }],
    fullText: "Silent Letters\nsign\nknow\nwrite",
    warnings: [],
  };
}

function chart(): ChildChart {
  return {
    childId: "ila",
    rootDir: process.cwd(),
    identity: { childId: "ila", displayName: "Ila" },
    homework: { pending: null },
    carePlan: { current: null },
    companion: { presetId: "elli", config: {}, displayName: "Elli" },
    companionCare: { plan: {}, view: {}, filePath: "", existed: true },
    artifacts: { contentCatalog: [] },
    activityResults: { latest: null, recent: [] },
    decisionTrace: [],
  } as unknown as ChildChart;
}

function spineNodes(): ActiveSessionPlan["nodePlan"] {
  return [
    {
      id: "mystery-choice",
      type: "mystery",
      activityId: "mystery",
      targets: ["sign", "know", "write"],
      difficulty: 1,
      source: "chart_planner",
      choiceMode: "choice_lab",
      locked: false,
      targetLane: "silent_letters",
    },
    {
      id: "quest-transfer",
      type: "quest",
      activityId: "quest",
      targets: ["sign", "know", "write"],
      difficulty: 2,
      source: "chart_planner",
      locked: true,
      masteryUnlockState: "preparing",
      targetLane: "silent_letters",
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
  ];
}

function plannerOutput(wrapper = false): AssignmentPlannerOutput {
  const wordGroups = [{
    id: "silent_letters",
    label: "Silent Letters",
    purpose: "spell_from_memory" as const,
    words: ["sign", "know", "write"],
    confidence: 0.95,
    evidence: ["The source lists silent-letter words."],
  }];
  const capturedContent: CapturedHomeworkContent = {
    title: "5/18 spelling",
    type: "spelling_test",
    rawText: extraction().fullText,
    words: ["sign", "know", "write"],
    questions: [],
    sourceDocuments: [{ filename: "5_18 spelling .pdf", mediaType: "application/pdf" }],
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "language_arts",
      topic: "Silent letters",
      primarySkill: "Spell silent-letter words",
      assignmentFormat: "word list",
      concepts: ["silent letters"],
      sourceEvidence: ["Source list"],
    },
    wordGroups,
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups,
      assertions: [],
      selectedTargets: wordGroups,
      heldTargets: [],
      clarificationQuestions: [],
      humanAnswers: [],
      memoryMatches: [],
    },
  };
  return {
    capturedContent,
    assignmentInterpretation: capturedContent.assignmentInterpretation!,
    homeworkWords: [
      { text: "sign", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "know", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
      { text: "write", sourceGroupId: "silent_letters", purpose: "spell_from_memory" },
    ],
    activeSessionPlan: {
      planId: "assignment-plan-ila",
      childId: "ila",
      createdAt: "2026-06-01T00:00:00.000Z",
      source: "ingest_human_loop",
      domain: "spelling",
      testDate: null,
      nodePlan: [
        {
          id: "spell-check-silent-letters",
          type: "spell-check",
          activityId: "spell-check",
          targets: ["sign", "know", "write"],
          difficulty: 1,
          source: "chart_planner",
          targetLane: "silent_letters",
          ...(wrapper
            ? {
              rewardWrapper: {
                activityId: "spark-orb-charge",
                mode: "domain_payload_wrapper",
                reason: "Use Spark Orb as the earned launch wrapper around spelling evidence.",
              },
            }
            : {}),
        } as ActiveSessionPlan["nodePlan"][number],
        ...spineNodes(),
      ],
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "spark-orb-lab",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "elli",
        displayName: "Elli",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: [{ id: "source", type: "assignment_source", summary: "Source list." }],
      openQuestions: [],
    },
    plannedMeasurements: [
      {
        id: "measure-spell-check-silent-letters",
        activityId: "spell-check",
        target: "silent_letters",
        evidenceType: "spell_from_memory",
        supportCriteria: "correct",
        reviseCriteria: "miss",
        falsifyCriteria: "missing",
      },
      {
        id: "measure-mystery-choice",
        activityId: "mystery",
        target: "activity_affinity",
        evidenceType: "preference_signal",
        supportCriteria: "child chooses and completes a valid option",
        reviseCriteria: "child hesitates, skips, or abandons the option",
        falsifyCriteria: "mystery is treated as mastery evidence",
      },
      {
        id: "measure-quest-transfer",
        activityId: "quest",
        target: "silent_letters",
        evidenceType: "transfer",
        supportCriteria: "generated quest preserves target-level evidence",
        reviseCriteria: "quest reveals fragile targets",
        falsifyCriteria: "quest launches without valid generated content",
      },
      {
        id: "measure-boss-mastery",
        activityId: "boss",
        target: "mastery_gate",
        evidenceType: "mastery",
        supportCriteria: "boss confirms transfer without scaffolds",
        reviseCriteria: "boss exposes remaining fragile targets",
        falsifyCriteria: "boss launches before quest evidence",
      },
    ],
    planTheory: {
      hypothesis: "Ila needs hidden spelling production.",
      evidenceSummary: ["The PDF is a spelling list."],
      intervention: "Use a spelling instrument and optional reward wrapper only if useful.",
      supportCriteria: ["target-level spelling results"],
      reviseCriteria: ["misses"],
      falsifyCriteria: ["missing target results"],
    },
    reviewQuestions: ["Spark Orb is optional and not mastery evidence."],
  };
}

describe("Spark Orb planner visibility lab", () => {
  it("audits available-not-selected as a successful organic outcome", () => {
    const audit = buildSparkOrbPlannerAudit({
      packetActivityIds: ["spell-check", "spark-orb-charge", "mystery", "quest", "boss"],
      output: plannerOutput(false),
      validationIssues: [],
      scenario: "baseline-first",
    });

    expect(audit.sparkOrbAvailable).toBe(true);
    expect(audit.sparkOrbSelection).toBe("available_not_selected");
    expect(audit.validationStatus).toBe("valid");
  });

  it("writes dry-run artifacts when the planner organically attaches Spark Orb", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "spark-orb-lab-"));
    const result = await runSparkOrbPlannerVisibilityLab({
      childId: "ila",
      sourceFile: "/Users/jamaltaylor/Downloads/5_18 spelling .pdf",
      scenario: "domain-wrapper",
      outputDir,
      extraction: extraction(),
      childChart: chart(),
      planAssignment: async () => plannerOutput(true),
      now: () => "2026-06-01T00-00-00-000Z",
    });

    expect(result.audit.sparkOrbAvailable).toBe(true);
    expect(result.audit.sparkOrbSelection).toBe("selected_as_wrapper");
    expect(result.audit.wrapperModes).toEqual(["domain_payload_wrapper"]);
    expect(result.audit.validationStatus).toBe("valid");
    expect(fs.existsSync(path.join(result.runDir, "assignment-planning-packet.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.runDir, "assignment-planner-output.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.runDir, "assignment-plan-review.md"))).toBe(true);
    expect(fs.existsSync(path.join(result.runDir, "spark-orb-planner-audit.json"))).toBe(true);
  });
});
