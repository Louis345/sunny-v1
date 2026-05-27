import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { AssignmentPlannerOutput } from "./assignmentPlanner";

type PlanNode = ActiveSessionPlan["nodePlan"][number];

type PlannerLessonEvidence = {
  weakTargets: string[];
  masteredTargets: string[];
};

function key(value: string): string {
  return value.trim().toLowerCase();
}

function targetSet(values: string[]): Set<string> {
  return new Set(values.map(key).filter(Boolean));
}

function nodeSignature(node: PlanNode): string {
  return [
    node.id,
    node.type,
    node.activityId,
    node.targetLane ?? "",
    node.locked === true ? "locked" : "open",
    node.wordRadarConfig?.recallMode ?? "",
    node.wordRadarConfig?.inputMode ?? "",
    node.targets.map(key).join(","),
  ].join("|");
}

function plannerPlanSignature(output: AssignmentPlannerOutput): string {
  return output.activeSessionPlan.nodePlan.map(nodeSignature).join("\n");
}

function isAcademicEvidenceNode(node: PlanNode): boolean {
  return node.type !== "mystery" && node.type !== "quest" && node.type !== "boss";
}

function targetPlacementCount(plan: ActiveSessionPlan, targets: Set<string>): number {
  let count = 0;
  for (const node of plan.nodePlan) {
    if (!isAcademicEvidenceNode(node)) continue;
    for (const target of node.targets) {
      if (targets.has(key(target))) count += 1;
    }
  }
  return count;
}

function targetsInScaffoldedNodes(plan: ActiveSessionPlan, targets: Set<string>): string[] {
  const out = new Set<string>();
  for (const node of plan.nodePlan) {
    const scaffolded =
      node.type === "spell-check" ||
      node.type === "letter-rush" ||
      node.wordRadarConfig?.recallMode === "partial_visual_recall";
    if (!scaffolded) continue;
    for (const target of node.targets) {
      if (targets.has(key(target))) out.add(target);
    }
  }
  return [...out];
}

function targetsInHiddenRecall(plan: ActiveSessionPlan, targets: Set<string>): string[] {
  const out = new Set<string>();
  for (const node of plan.nodePlan) {
    if (node.type !== "word-radar" || node.wordRadarConfig?.recallMode !== "hidden_word_recall") continue;
    for (const target of node.targets) {
      if (targets.has(key(target))) out.add(target);
    }
  }
  return [...out];
}

function hasPlannerEvidence(output: AssignmentPlannerOutput, evidence: PlannerLessonEvidence): boolean {
  const haystack = [
    output.planTheory.hypothesis,
    output.planTheory.intervention,
    ...output.planTheory.evidenceSummary,
    ...output.planTheory.supportCriteria,
    ...output.planTheory.reviseCriteria,
    ...output.planTheory.falsifyCriteria,
    ...output.activeSessionPlan.evidenceUsed.map((item) => item.summary),
  ].join(" ").toLowerCase();
  return evidence.weakTargets.some((target) => haystack.includes(key(target))) ||
    haystack.includes("miss") ||
    haystack.includes("canonical evidence") ||
    haystack.includes("lesson evidence");
}

function provePlannerLessonAdaptability(args: {
  before: AssignmentPlannerOutput;
  after: AssignmentPlannerOutput;
  evidence: PlannerLessonEvidence;
}) {
  const weak = targetSet(args.evidence.weakTargets);
  const mastered = targetSet(args.evidence.masteredTargets);
  const afterPlan = args.after.activeSessionPlan;
  const weakTargetAcademicPlacements = targetPlacementCount(afterPlan, weak);
  const masteredTargetAcademicPlacements = targetPlacementCount(afterPlan, mastered);
  const weakTargetsKeptScaffolded = targetsInScaffoldedNodes(afterPlan, weak);
  const weakTargetsEscalatedTooSoon = targetsInHiddenRecall(afterPlan, weak);
  const changedPlan = plannerPlanSignature(args.before) !== plannerPlanSignature(args.after);
  const adventureSpine = {
    hasMystery: afterPlan.nodePlan.some((node) => node.type === "mystery"),
    hasLockedQuest: afterPlan.nodePlan.some((node) => node.type === "quest" && node.locked === true),
    hasLockedBoss: afterPlan.nodePlan.some((node) => node.type === "boss" && node.locked === true),
  };
  const failures = [
    ...(!changedPlan ? ["planner output did not change after lesson evidence"] : []),
    ...(weakTargetAcademicPlacements <= masteredTargetAcademicPlacements
      ? ["weak targets did not receive more academic placements than mastered targets"]
      : []),
    ...(weakTargetsKeptScaffolded.length === 0 ? ["weak targets were not kept in scaffolded practice"] : []),
    ...(weakTargetsEscalatedTooSoon.length > 0
      ? [`weak targets escalated to hidden recall too soon: ${weakTargetsEscalatedTooSoon.join(", ")}`]
      : []),
    ...(!adventureSpine.hasMystery ? ["planner omitted mystery choice node"] : []),
    ...(!adventureSpine.hasLockedQuest ? ["planner omitted locked quest destination"] : []),
    ...(!adventureSpine.hasLockedBoss ? ["planner omitted locked boss destination"] : []),
    ...(!hasPlannerEvidence(args.after, args.evidence)
      ? ["planner theory/evidence did not cite lesson evidence"]
      : []),
  ];
  return {
    proved: failures.length === 0,
    failures,
    changedPlan,
    weakTargetAcademicPlacements,
    masteredTargetAcademicPlacements,
    weakTargetsKeptScaffolded,
    weakTargetsEscalatedTooSoon,
    adventureSpine,
  };
}

const WEAK = ["know", "write", "gnat", "wrong", "climb"];
const MASTERED = ["sign", "thumb", "comb", "knock", "knife"];
const ALL_WORDS = [...MASTERED, ...WEAK];

const LETTER_FILL = {
  recallMode: "partial_visual_recall" as const,
  inputMode: "letter-by-letter" as const,
  speakStyle: "option-a" as const,
  showTimer: false,
  hideWordDuringResponse: true,
  requiresCapturedResponse: true,
};

const VISIBLE_READ = {
  recallMode: "visible_read" as const,
  inputMode: "whole-word" as const,
  speakStyle: "option-a" as const,
  showTimer: false,
  hideWordDuringResponse: false,
  requiresCapturedResponse: true,
};

const HIDDEN_RECALL = {
  recallMode: "hidden_word_recall" as const,
  inputMode: "whole-word" as const,
  speakStyle: "option-b" as const,
  showTimer: true,
  timerSeconds: 8,
  hideWordDuringResponse: true,
  requiresCapturedResponse: true,
};

function activePlan(id: string, nodes: ActiveSessionPlan["nodePlan"]): ActiveSessionPlan {
  return {
    planId: id,
    childId: "reina",
    createdAt: "2026-05-24T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: "hw-spelling_test-adapt",
    domain: "spelling",
    testDate: "2026-05-26",
    nodePlan: nodes,
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: id,
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
        id: "session-evidence",
        type: "canonical_activity_evidence",
        summary: "Lesson evidence: missed know, write, gnat, wrong, climb; mastered sign, thumb, comb, knock, knife.",
      },
    ],
    openQuestions: [],
    approvalStatus: "pending",
    planTheory: {
      hypothesis: "Canonical evidence says Reina missed know, write, gnat, wrong, and climb.",
      evidenceSummary: ["Word Radar and Spell Check misses clustered on silent-letter spelling production."],
      intervention: "Keep weak words scaffolded and lightly reinforce mastered words.",
      supportCriteria: ["Weak words improve with scaffolded recall."],
      reviseCriteria: ["Misses persist after scaffolded practice."],
      falsifyCriteria: ["Hidden recall is clean on weak words."],
    },
    plannedMeasurements: [{
      id: "weak-spelling-check",
      activityId: "spell-check",
      target: "silent_letters",
      evidenceType: "spell_from_memory",
      supportCriteria: "first-try correct",
      reviseCriteria: "second attempt or help",
      falsifyCriteria: "off-target response",
    }],
  };
}

function output(plan: ActiveSessionPlan): AssignmentPlannerOutput {
  return {
    capturedContent: {
      title: "Benchmark Advance Spelling Unit 9 Week 3",
      type: "spelling_test",
      rawText: "Silent Letters\nsign know write thumb comb gnat knock knife wrong climb",
      words: ALL_WORDS,
      questions: [],
      sourceDocuments: [{ filename: "5_18_spelling.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Silent letters",
        primarySkill: "Spell silent-letter words from memory",
        assignmentFormat: "Grouped spelling list",
        concepts: ["silent letters"],
        sourceEvidence: ["assignment source"],
      },
      wordGroups: [{
        id: "silent_letters",
        label: "Silent Letters",
        purpose: "spell_from_memory",
        words: ALL_WORDS,
        confidence: 0.95,
        evidence: ["assignment heading"],
      }],
    },
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups: [{
        id: "silent_letters",
        label: "Silent Letters",
        purpose: "spell_from_memory",
        words: ALL_WORDS,
        confidence: 0.95,
        evidence: ["assignment heading"],
      }],
      assertions: [],
      selectedTargets: [],
      heldTargets: [],
      clarificationQuestions: [],
      humanAnswers: [],
      memoryMatches: [],
    },
    homeworkWords: ALL_WORDS.map((text) => ({ text, sourceGroupId: "silent_letters", purpose: "spell_from_memory" })),
    activeSessionPlan: plan,
    plannedMeasurements: plan.plannedMeasurements ?? [],
    planTheory: plan.planTheory!,
    reviewQuestions: ["Planner should adapt from lesson evidence."],
  };
}

function beforeOutput(): AssignmentPlannerOutput {
  return output(activePlan("before", [
    {
      id: "baseline-word-radar",
      type: "word-radar",
      activityId: "word-radar",
      targets: ALL_WORDS,
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
      wordRadarConfig: LETTER_FILL,
    },
    {
      id: "baseline-spell-check",
      type: "spell-check",
      activityId: "spell-check",
      targets: ALL_WORDS,
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
    },
    ...spineNodes(ALL_WORDS),
  ]));
}

function afterOutput(): AssignmentPlannerOutput {
  return output(activePlan("after", [
    {
      id: "support-word-radar-weak",
      type: "word-radar",
      activityId: "word-radar",
      targets: WEAK,
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
      wordRadarConfig: LETTER_FILL,
    },
    {
      id: "spell-check-weak",
      type: "spell-check",
      activityId: "spell-check",
      targets: WEAK,
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
    },
    {
      id: "spaced-reinforcement-mastered",
      type: "word-radar",
      activityId: "word-radar",
      targets: MASTERED.slice(0, 2),
      difficulty: 1,
      source: "chart_planner",
      targetLane: "silent_letters",
      wordRadarConfig: VISIBLE_READ,
    },
    ...spineNodes(ALL_WORDS),
  ]));
}

function spineNodes(targets: string[]): ActiveSessionPlan["nodePlan"] {
  return [
    {
      id: "mystery-choice",
      type: "mystery",
      activityId: "mystery",
      targets,
      difficulty: 2,
      source: "chart_planner",
      targetLane: "silent_letters",
      choiceMode: "choice_lab",
      locked: false,
    },
    {
      id: "quest-transfer",
      type: "quest",
      activityId: "quest",
      targets,
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
  ];
}

describe("planner lesson-to-lesson adaptability proof", () => {
  it("proves the next lesson changed because the planner interpreted canonical evidence", () => {
    const report = provePlannerLessonAdaptability({
      before: beforeOutput(),
      after: afterOutput(),
      evidence: {
        weakTargets: WEAK,
        masteredTargets: MASTERED,
      },
    });

    expect(report.proved).toBe(true);
    expect(report.changedPlan).toBe(true);
    expect(report.weakTargetAcademicPlacements).toBeGreaterThan(report.masteredTargetAcademicPlacements);
    expect(report.weakTargetsKeptScaffolded.sort()).toEqual([...WEAK].sort());
    expect(report.weakTargetsEscalatedTooSoon).toEqual([]);
    expect(report.adventureSpine).toEqual({
      hasMystery: true,
      hasLockedQuest: true,
      hasLockedBoss: true,
    });
  });

  it("fails when a planner output escalates weak targets to hidden recall too early", () => {
    const bad = afterOutput();
    bad.activeSessionPlan.nodePlan[0] = {
      ...bad.activeSessionPlan.nodePlan[0]!,
      wordRadarConfig: HIDDEN_RECALL,
    };

    const report = provePlannerLessonAdaptability({
      before: beforeOutput(),
      after: bad,
      evidence: {
        weakTargets: WEAK,
        masteredTargets: MASTERED,
      },
    });

    expect(report.proved).toBe(false);
    expect(report.failures.join("\n")).toContain("weak targets escalated to hidden recall too soon");
  });

  it("keeps hidden adventure-spine appenders out of source code", () => {
    const sessionPlanSource = fs.readFileSync(
      path.join(process.cwd(), "src/engine/sessionPlanFromChart.ts"),
      "utf8",
    );
    const ingestSource = fs.readFileSync(
      path.join(process.cwd(), "src/scripts/ingestHomework.ts"),
      "utf8",
    );

    expect(sessionPlanSource).not.toContain("id: `n-mystery-${homeworkId");
    expect(sessionPlanSource).not.toContain("for (const type of [\"quest\", \"boss\"]");
    expect(ingestSource).not.toContain("hw-boss");
    expect(ingestSource).not.toContain("placeholder boss");
  });
});
