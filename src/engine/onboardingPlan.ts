import fs from "fs";
import path from "path";
import type { ActivityPurpose } from "../context/schemas/learningProfile";
import { getChildChart, type ChildChart } from "../profiles/childChart";
import {
  chooseAttentionTaskWithReason,
  type AttentionTaskMetadata,
  type AttentionTaskRuntimeConfig,
} from "./attentionVitals";

export type OnboardingIntakeMode = "known_child_intake" | "new_child_intake";
export type OnboardingShape =
  | "single_measurement_node"
  | "measurement_plus_dopamine_break"
  | "mini_intake_path";

export type OnboardingNode = {
  id: string;
  title: string;
  purpose: ActivityPurpose;
  activityId: string;
  affectsBaselineScore: boolean;
  companionMode: "instruct" | "quiet_during_measurement" | "supportive";
  measures: string[];
  config?: AttentionTaskRuntimeConfig;
};

export type OnboardingTheory = {
  theoryId: string;
  statement: string;
  confidence: number;
  evidence: string[];
  supportCriteria: string[];
  reviseCriteria: string[];
  nextIfSupported: string;
  nextIfRevised: string;
};

export type OnboardingPlan = {
  childId: string;
  intakeMode: OnboardingIntakeMode;
  shape: OnboardingShape;
  careQuestion: string;
  selectedAttentionTask: AttentionTaskMetadata;
  selectedAttentionTaskReason: string;
  selectedAttentionTaskConfig: AttentionTaskRuntimeConfig;
  nodes: OnboardingNode[];
  theories: OnboardingTheory[];
  evidenceSummary: string[];
  createdAt: string;
};

export type OnboardingPlanOptions = {
  rootDir?: string;
  now?: Date;
};

function existsDir(dir: string): boolean {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

function fileCount(dir: string, suffixes: string[]): number {
  if (!existsDir(dir)) return 0;
  return fs.readdirSync(dir).filter((file) => suffixes.some((suffix) => file.endsWith(suffix))).length;
}

function hasContextEvidence(chart: ChildChart): boolean {
  return chart.childContext.trim().length > 40;
}

function hasPriorEvidence(chart: ChildChart): boolean {
  return chart.learningProfile.sessionStats.totalSessions > 0 ||
    hasContextEvidence(chart) ||
    chart.wordBankSummary.totalWords > 0 ||
    fileCount(chart.links.attempts, [".ndjson", ".json"]) > 0 ||
    fileCount(chart.links.vitals, [".ndjson", ".json"]) > 0 ||
    fileCount(chart.homework.cyclesDir, [".json"]) > 0;
}

function hasFatigueOrRewardNeed(chart: ChildChart): boolean {
  const text = [
    chart.childContext,
    chart.learningProfile.readingProfile.flaggedPatterns.join(" "),
    chart.learningProfile.demographics.diagnoses.join(" "),
    chart.learningProfile.rewardPreferences.favoriteGames.join(" "),
  ].join(" ").toLowerCase();
  return /fatigue|adhd|frustrat|break|reward|game|avoid|dyslexia/.test(text);
}

function hasConflictingOrRichEvidence(chart: ChildChart): boolean {
  const profile = chart.learningProfile;
  return hasContextEvidence(chart) &&
    (
      profile.demographics.diagnoses.length > 0 ||
      profile.readingProfile.flaggedPatterns.length > 0 ||
      profile.sessionStats.totalSessions >= 5
    );
}

function careQuestionFor(chart: ChildChart): string {
  const text = [
    chart.childContext,
    chart.learningProfile.demographics.diagnoses.join(" "),
    chart.learningProfile.readingProfile.flaggedPatterns.join(" "),
  ].join(" ").toLowerCase();
  if (/impuls|rapid wrong|guessing|guessed/.test(text)) {
    return "Is impulsive responding or inhibition the main attention bottleneck?";
  }
  if (/read|dyslexia|decod|fluency/.test(text)) {
    return "Can the child sustain attention on a low-reading task before testing academic reading load?";
  }
  return "Can the child sustain attention on a low-reading task?";
}

function evidenceSummary(chart: ChildChart): string[] {
  const out = [
    `sessions=${chart.learningProfile.sessionStats.totalSessions}`,
    `diagnoses=${chart.learningProfile.demographics.diagnoses.join(",") || "none"}`,
    `words=${chart.wordBankSummary.totalWords}`,
    `context=${chart.childContext.trim() ? "present" : "empty"}`,
    `priorAttention=${chart.attention.source}:${chart.attention.status}`,
  ];
  if (chart.homework.pending) out.push("pendingHomework=present");
  return out;
}

function shapeFor(chart: ChildChart, intakeMode: OnboardingIntakeMode): OnboardingShape {
  if (intakeMode === "new_child_intake") return "single_measurement_node";
  if (hasConflictingOrRichEvidence(chart)) return "mini_intake_path";
  if (hasFatigueOrRewardNeed(chart)) return "measurement_plus_dopamine_break";
  return "single_measurement_node";
}

function nodesFor(
  shape: OnboardingShape,
  task: AttentionTaskMetadata,
  config: AttentionTaskRuntimeConfig,
): OnboardingNode[] {
  const screen: OnboardingNode = {
    id: `onboarding-${task.taskId}`,
    title: `Attention screen: ${task.taskId}`,
    purpose: "attention_screening",
    activityId: task.taskId,
    affectsBaselineScore: true,
    companionMode: "quiet_during_measurement",
    measures: task.measures,
    config,
  };
  const reward: OnboardingNode = {
    id: "onboarding-dopamine-break",
    title: "Short reward break",
    purpose: "dopamine_reward",
    activityId: "mystery-reward",
    affectsBaselineScore: false,
    companionMode: "supportive",
    measures: ["engagement_recovery", "frustration_recovery", "time_on_task"],
  };
  const academic: OnboardingNode = {
    id: "onboarding-academic-load-check",
    title: "Tiny academic load check",
    purpose: "hybrid_learning_attention",
    activityId: "tiny-academic-baseline",
    affectsBaselineScore: false,
    companionMode: "supportive",
    measures: ["academic_accuracy", "attention_under_load", "recovery_after_miss"],
  };
  if (shape === "single_measurement_node") return [screen];
  if (shape === "measurement_plus_dopamine_break") return [screen, reward];
  return [screen, reward, academic];
}

function theoryFor(
  chart: ChildChart,
  task: AttentionTaskMetadata,
  careQuestion: string,
  intakeMode: OnboardingIntakeMode,
): OnboardingTheory {
  const known = intakeMode === "known_child_intake";
  return {
    theoryId: `onboarding-${chart.childId}-${task.taskId}`,
    statement: known
      ? `${chart.identity.displayName}'s existing chart suggests ${careQuestion.toLowerCase()}`
      : `${chart.identity.displayName} has sparse chart evidence, so Sunny will start with a conservative low-load attention screen.`,
    confidence: known ? 0.62 : 0.25,
    evidence: evidenceSummary(chart),
    supportCriteria: [
      "practice gate passes",
      "measured omissions/commissions are interpretable",
      "late-task dropoff can be compared with future hybrid academic work",
    ],
    reviseCriteria: [
      "practice gate fails",
      "frustration or abandonment contaminates the baseline",
      "task wrapper produces noisy or invalid data",
    ],
    nextIfSupported: "Use the measured window to pace homework/review bursts and compare against hybrid academic attention.",
    nextIfRevised: "Switch to another attention screen or reduce rule/visual burden before updating the attention model.",
  };
}

export function createOnboardingPlan(
  childId: string,
  opts: OnboardingPlanOptions = {},
): OnboardingPlan {
  const rootDir = opts.rootDir ?? process.cwd();
  const chart = getChildChart(childId, { rootDir });
  const intakeMode: OnboardingIntakeMode = hasPriorEvidence(chart)
    ? "known_child_intake"
    : "new_child_intake";
  const careQuestion = careQuestionFor(chart);
  const selection = chooseAttentionTaskWithReason({
    careQuestion,
    avoidReadingDemand: true,
  }, chart.learningProfile);
  const task = selection.task;
  const shape = shapeFor(chart, intakeMode);
  return {
    childId: chart.childId,
    intakeMode,
    shape,
    careQuestion,
    selectedAttentionTask: task,
    selectedAttentionTaskReason: selection.reason,
    selectedAttentionTaskConfig: selection.config,
    nodes: nodesFor(shape, task, selection.config),
    theories: [theoryFor(chart, task, careQuestion, intakeMode)],
    evidenceSummary: evidenceSummary(chart),
    createdAt: (opts.now ?? new Date()).toISOString(),
  };
}

export function writeOnboardingPlan(plan: OnboardingPlan, rootDir = process.cwd()): string {
  const file = path.join(
    rootDir,
    "src",
    "context",
    plan.childId,
    "care_plans",
    `onboarding-${plan.createdAt.slice(0, 10)}.json`,
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(plan, null, 2), "utf8");
  return file;
}
