import fs from "fs";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import { buildExperiencePlannerInput, draftPsychologistExperiencePlan } from "../engine/experiencePlanner";
import { buildExperienceContextPacket } from "../engine/experienceContextPacket";
import { writeActiveSessionPlan } from "../engine/sessionPlanFromChart";
import { appendChildActivityEvidence } from "../engine/learningDecisionContext";
import { initializeLearningProfile } from "../utils/learningProfileIO";

export const ADAPTABILITY_DEMO_CHILD_ID = "demo_adaptive";

export type AdaptabilityScenario =
  | "near_test"
  | "strong_mastery"
  | "weak_performance"
  | "stale_activity"
  | "generated_ready";

export type ResetAdaptabilityDemoOptions = {
  rootDir?: string;
  scenario?: AdaptabilityScenario;
};

export type AdaptabilityLabOptions = ResetAdaptabilityDemoOptions & {
  reset?: boolean;
  preview?: boolean;
};

export type AdaptabilityLabReport = {
  childId: string;
  scenario: AdaptabilityScenario;
  contextRoot: string;
  preview: boolean;
  before: {
    planId: string;
    nodeTypes: string[];
    selectedInterventionSequence: string[];
    wordRadarConfig: unknown;
    planTheory: string;
    criteria: {
      support: string[];
      revise: string[];
      falsify: string[];
    };
  };
  after: {
    planId: string;
    nodeTypes: string[];
    selectedInterventionSequence: string[];
    wordRadarConfig: unknown;
    configChanges: string[];
    staleRetiredActivityDecisions: string[];
    planTheory: string;
    criteria: {
      support: string[];
      revise: string[];
      falsify: string[];
    };
    plannedMeasurements: string[];
    evidenceWritePath: string;
    experiencePacketId: string;
    questContextSourcePacketId?: string;
    bossContextSourcePacketId?: string;
  };
};

const HIDDEN_WORD_RECALL_CONFIG = {
  recallMode: "hidden_word_recall" as const,
  inputMode: "whole-word" as const,
  speakStyle: "option-b" as const,
  showTimer: true,
  timerSeconds: 10,
  hideWordDuringResponse: true,
  requiresCapturedResponse: true,
};

export function sandboxContextRoot(rootDir = process.cwd()): string {
  return path.join(rootDir, ".sunny-sandbox", "context");
}

function safeScenario(raw: string | undefined): AdaptabilityScenario {
  if (
    raw === "near_test" ||
    raw === "strong_mastery" ||
    raw === "weak_performance" ||
    raw === "stale_activity" ||
    raw === "generated_ready"
  ) {
    return raw;
  }
  return "near_test";
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function demoProfile(scenario: AdaptabilityScenario): LearningProfile {
  const now = new Date("2026-05-15T12:00:00.000Z");
  const testDate = scenario === "near_test" ? "2026-05-16" : "2026-05-22";
  const profile = initializeLearningProfile({
    childId: ADAPTABILITY_DEMO_CHILD_ID,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling", "reading"],
  });
  profile.companionCurrency = 120;
  profile.pendingHomework = {
    weekOf: "2026-05-15",
    homeworkId: `hw-adapt-${scenario}`,
    testDate,
    testDateSource: "cli",
    testDateConfirmed: true,
    wordList: ["above", "again", "around", "away", "alone", "awake"],
    generatedAt: now.toISOString(),
    completedAdventureNodeIds:
      scenario === "near_test" || scenario === "strong_mastery"
        ? [`n-word-radar-hw-adapt-${scenario}`, `n-spell-check-hw-adapt-${scenario}`]
        : [],
    reinforceWords: scenario === "weak_performance" ? ["again", "around"] : [],
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "spelling",
      topic: "adaptive spelling demo",
      primarySkill: "Spelling recall",
      assignmentFormat: "spelling list",
      concepts: ["memory", "automaticity"],
      sourceEvidence: ["adaptability fixture"],
    },
    capturedContent: null,
    nodes: [
      {
        id: `n-word-radar-hw-adapt-${scenario}`,
        type: "word-radar",
        words: ["above", "again", "around"],
        difficulty: 1,
        gameFile: null,
        storyFile: null,
        wordRadarConfig: HIDDEN_WORD_RECALL_CONFIG,
      },
      {
        id: `n-spell-check-hw-adapt-${scenario}`,
        type: "spell-check",
        words: ["away", "alone", "awake"],
        difficulty: 1,
        gameFile: "spell-check.html",
        storyFile: null,
      },
      {
        id: `n-pronunciation-hw-adapt-${scenario}`,
        type: "pronunciation",
        words: ["above", "again", "around", "away", "alone", "awake"],
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
    ],
  };
  if (scenario === "strong_mastery" || scenario === "generated_ready") {
    profile.adaptiveLoadState = {
      spelling: {
        domain: "spelling",
        currentCohortSize: 6,
        maxRecentSuccessfulCohort: 6,
        challengeRecommendation: "expand_cohort",
        lastLoadEvidence: {
          activityId: "spell-check",
          completed: true,
          accuracy: 0.96,
          targetCount: 6,
          frustrationScore: 0.05,
          strongEvidence: true,
          occurredAt: now.toISOString(),
        },
      },
    };
  }
  if (scenario === "stale_activity") {
    profile.activityModel = {
      "word-radar": {
        activityId: "word-radar",
        plays: 8,
        completions: 8,
        completionRate: 1,
        averageAccuracy: 0.98,
        engagementScore: 0.2,
        frustrationScore: 0.08,
        likedCount: 0,
        dislikedCount: 4,
        lastRating: "dislike",
        lastPlayed: now.toISOString(),
        domains: { spelling: 8 },
        missedWords: [],
      },
    };
  }
  return profile;
}

export function resetAdaptabilityDemo(
  opts: ResetAdaptabilityDemoOptions = {},
): { childId: string; contextRoot: string; childDir: string; scenario: AdaptabilityScenario } {
  const rootDir = opts.rootDir ?? process.cwd();
  const scenario = opts.scenario ?? "near_test";
  const contextRoot = sandboxContextRoot(rootDir);
  const childDir = path.join(contextRoot, ADAPTABILITY_DEMO_CHILD_ID);
  fs.rmSync(childDir, { recursive: true, force: true });
  fs.mkdirSync(childDir, { recursive: true });
  const profile = demoProfile(scenario);
  writeJson(path.join(childDir, "learning_profile.json"), profile);
  const pending = profile.pendingHomework;
  if (pending?.homeworkId) {
    writeJson(path.join(childDir, "homework", "cycles", `${pending.homeworkId}.json`), {
      homeworkId: pending.homeworkId,
      subject: "spelling_test",
      wordList: pending.wordList ?? [],
      ingestedAt: pending.weekOf ?? "2026-05-15",
      testDate: pending.testDate,
      testDateSource: pending.testDateSource,
      testDateConfirmed: pending.testDateConfirmed,
      contentProfile: pending.contentProfile,
      capturedContent: pending.capturedContent,
      nodes: pending.nodes,
      assumptions: null,
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });
  }
  writeJson(path.join(childDir, "word_bank.json"), {
    childId: ADAPTABILITY_DEMO_CHILD_ID,
    version: 1,
    words: [],
    lastUpdated: new Date("2026-05-15T12:00:00.000Z").toISOString(),
  });
  fs.writeFileSync(
    path.join(childDir, `${ADAPTABILITY_DEMO_CHILD_ID}_context.md`),
    "# Demo Adaptive\n\nResettable sandbox child for Sunny adaptability testing.\n",
    "utf8",
  );
  console.log(
    ` 🎮 [adapt-demo] [reset] child=${ADAPTABILITY_DEMO_CHILD_ID} scenario=${scenario} root=${contextRoot}`,
  );
  return { childId: ADAPTABILITY_DEMO_CHILD_ID, contextRoot, childDir, scenario };
}

function withSandboxEnv<T>(rootDir: string, preview: boolean, fn: () => T): T {
  const previousRoot = process.env.SUNNY_CONTEXT_ROOT;
  const previousPreview = process.env.SUNNY_PREVIEW_MODE;
  const previousMode = process.env.SUNNY_MODE;
  process.env.SUNNY_CONTEXT_ROOT = sandboxContextRoot(rootDir);
  process.env.SUNNY_MODE = preview ? "as-child" : "real";
  process.env.SUNNY_PREVIEW_MODE = preview ? "free" : "";
  try {
    return fn();
  } finally {
    if (previousRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
    else process.env.SUNNY_CONTEXT_ROOT = previousRoot;
    if (previousPreview === undefined) delete process.env.SUNNY_PREVIEW_MODE;
    else process.env.SUNNY_PREVIEW_MODE = previousPreview;
    if (previousMode === undefined) delete process.env.SUNNY_MODE;
    else process.env.SUNNY_MODE = previousMode;
  }
}

function summarizePlan(plan: ReturnType<typeof draftPsychologistExperiencePlan>) {
  const criteria = {
    support: plan.planTheory?.supportCriteria ?? [],
    revise: plan.planTheory?.reviseCriteria ?? [],
    falsify: plan.planTheory?.falsifyCriteria ?? [],
  };
  return {
    planId: plan.planId,
    nodeTypes: plan.nodePlan.map((node) => node.type),
    selectedInterventionSequence: plan.nodePlan.map((node) => `${node.type}:${node.id}`),
    wordRadarConfig: plan.nodePlan.find((node) => node.type === "word-radar")?.wordRadarConfig ?? null,
    planTheory: plan.planTheory?.hypothesis ?? "",
    criteria,
    plannedMeasurements: (plan.plannedMeasurements ?? []).map(
      (measurement) =>
        `${measurement.activityId}:${measurement.target}:${measurement.evidenceType}`,
    ),
  };
}

function diffJson(label: string, before: unknown, after: unknown): string[] {
  const left = JSON.stringify(before ?? null);
  const right = JSON.stringify(after ?? null);
  return left === right ? [] : [`${label}: ${left} -> ${right}`];
}

function staleActivityDecisions(profile: LearningProfile): string[] {
  return Object.values(profile.activityModel ?? {})
    .filter((entry) => entry.plays >= 3 && entry.engagementScore < 0.35)
    .map(
      (entry) =>
        `${entry.activityId}: low-value candidate after ${entry.plays} plays, engagement=${entry.engagementScore}, lastRating=${entry.lastRating ?? "unknown"}`,
    );
}

export async function runAdaptabilityLab(
  opts: AdaptabilityLabOptions = {},
): Promise<AdaptabilityLabReport> {
  const rootDir = opts.rootDir ?? process.cwd();
  const scenario = opts.scenario ?? "near_test";
  const preview = opts.preview === true;
  if (opts.reset !== false) {
    resetAdaptabilityDemo({ rootDir, scenario });
  }

  return withSandboxEnv(rootDir, preview, () => {
    const chart = getChildChart(ADAPTABILITY_DEMO_CHILD_ID, { rootDir });
    const beforeInput = buildExperiencePlannerInput(chart, { rootDir });
    const beforePlan = draftPsychologistExperiencePlan(beforeInput);
    if (!preview) {
      writeActiveSessionPlan(ADAPTABILITY_DEMO_CHILD_ID, beforePlan, { rootDir });
      appendChildActivityEvidence(ADAPTABILITY_DEMO_CHILD_ID, {
        activityId: scenario === "weak_performance" ? "spell-check" : "word-radar",
        domain: "spelling",
        completed: scenario !== "weak_performance",
        accuracy: scenario === "weak_performance" ? 0.42 : 0.95,
        targetCount: 6,
        engagementScore: scenario === "stale_activity" ? 0.2 : 0.8,
        frustrationScore: scenario === "weak_performance" ? 0.75 : 0.08,
        missedWords: scenario === "weak_performance" ? ["again", "around"] : [],
        occurredAt: new Date().toISOString(),
      }, { rootDir });
    }

    const afterChart = getChildChart(ADAPTABILITY_DEMO_CHILD_ID, { rootDir });
    const afterInput = buildExperiencePlannerInput(afterChart, { rootDir });
    const afterPlan = draftPsychologistExperiencePlan(afterInput);
    const packet = buildExperienceContextPacket(afterInput, afterPlan);
    const beforeSummary = summarizePlan(beforePlan);
    const afterSummary = summarizePlan(afterPlan);
    const evidenceWritePath = path.join(
      sandboxContextRoot(rootDir),
      ADAPTABILITY_DEMO_CHILD_ID,
      "learning_profile.json",
    );
    const report: AdaptabilityLabReport = {
      childId: ADAPTABILITY_DEMO_CHILD_ID,
      scenario,
      contextRoot: sandboxContextRoot(rootDir),
      preview,
      before: beforeSummary,
      after: {
        ...afterSummary,
        configChanges: diffJson("word-radar", beforeSummary.wordRadarConfig, afterSummary.wordRadarConfig),
        staleRetiredActivityDecisions: staleActivityDecisions(afterChart.learningProfile),
        evidenceWritePath,
        experiencePacketId: packet.packetId,
        questContextSourcePacketId: packet.quest.sourcePacketId,
        bossContextSourcePacketId: packet.boss.sourcePacketId,
      },
    };
    console.log(JSON.stringify(report, null, 2));
    return report;
  });
}

function readFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`) || argv.includes(`--${name}=true`);
}

export async function runAdaptabilityDemoCli(argv: string[]): Promise<void> {
  const scenario = safeScenario(readFlag(argv, "scenario"));
  const rootDir = readFlag(argv, "rootDir") ?? process.cwd();
  if (hasFlag(argv, "reset-only")) {
    resetAdaptabilityDemo({ rootDir, scenario });
    return;
  }
  await runAdaptabilityLab({
    rootDir,
    scenario,
    reset: hasFlag(argv, "no-reset") ? false : true,
    preview: hasFlag(argv, "preview"),
  });
}

if (typeof require !== "undefined" && require.main === module) {
  runAdaptabilityDemoCli(process.argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(` 🎮 [adapt-demo] [failed] ${message}`);
    process.exit(1);
  });
}
