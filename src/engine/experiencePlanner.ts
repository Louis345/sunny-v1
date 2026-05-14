import fs from "fs";
import path from "path";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type {
  ActiveSessionPlan,
  GeneratedExperienceBrief,
  LearningProfile,
  PlanTheory,
  PlannedMeasurement,
  PlannerReviewDecision,
  PlannerTrustState,
} from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import { buildActivityTraitSignalSummary, type ActivityTraitSignalSummary } from "./childSignals";
import {
  buildLearningDecisionContext,
  type LearningDecisionContext,
} from "./learningDecisionContext";
import {
  listActivityToolContracts,
  type ActivityCapabilityMode,
  type ActivityToolContract,
} from "./activityToolCatalog";
import { planHomeworkSessionFromChart } from "./sessionPlanFromChart";

export type ExperienceActivityCard = {
  activityId: string;
  label: string;
  gameIds: string[];
  configSource: string;
  domains: string[];
  skillTargets: string[];
  evidenceQuality: string;
  engagementHooks: string[];
  difficultyKnobs: string[];
  contaminationRisks: string[];
  validConfigOptions: string[];
  capabilityModes: ActivityCapabilityMode[];
  measures: string[];
  configKnobs: string[];
  realDifficultyLevels: string[];
  signalsEmitted: string[];
  signalsMissing: string[];
  psychologistGuidance: string[];
};

export type ExperiencePlannerInput = {
  childId: string;
  chart: ChildChart;
  learningContext: LearningDecisionContext;
  homeworkGoal: LearningDecisionContext["homework"];
  plannerTrust: PlannerTrustState;
  activityCards: ExperienceActivityCard[];
  engagementSummary: string[];
  traitSignalSummary: ActivityTraitSignalSummary;
  calibrationSummary: string[];
  companionConversationAudit: {
    status: "ready" | "empty";
    summary: string[];
  };
};

export type ExperiencePlannerOptions = {
  rootDir?: string;
  now?: Date;
  parentNote?: string;
  companionConversationAudit?: string[];
  useAi?: boolean;
  model?: string;
};

export type PlannerReviewOptions = {
  rootDir?: string;
  now?: Date;
};

const AUTO_PLAN_THRESHOLD = 5;

const planTheorySchema = z.object({
  hypothesis: z.string().min(1),
  evidenceSummary: z.array(z.string().min(1)).min(1),
  intervention: z.string().min(1),
  supportCriteria: z.array(z.string().min(1)).min(1),
  reviseCriteria: z.array(z.string().min(1)).min(1),
  falsifyCriteria: z.array(z.string().min(1)).min(1),
});

const plannedMeasurementSchema = z.object({
  id: z.string().min(1),
  activityId: z.string().min(1),
  target: z.string().min(1),
  evidenceType: z.string().min(1),
  supportCriteria: z.string().min(1),
  reviseCriteria: z.string().min(1),
  falsifyCriteria: z.string().min(1),
});

const generatedExperienceBriefSchema = z.object({
  briefId: z.string().min(1),
  kind: z.enum(["quest", "boss", "visual-explainer"]),
  title: z.string().min(1),
  learningGoal: z.string().min(1),
  targetSkills: z.array(z.string().min(1)),
  targetConcepts: z.array(z.string().min(1)),
  targetWords: z.array(z.string().min(1)),
  engagementHooks: z.array(z.string().min(1)),
  algorithmTargets: z.array(z.string().min(1)).min(1),
  evidenceUsed: z.array(z.string().min(1)).min(1),
  artifactStatus: z.enum(["brief_only", "generated", "validated", "failed"]),
  validationRequired: z.boolean(),
});

const aiPlannerDecisionSchema = z.object({
  plannerConfidence: z.number().min(0).max(1),
  planTheory: planTheorySchema,
  plannedMeasurements: z.array(plannedMeasurementSchema).min(1),
  generatedExperienceBriefs: z.array(generatedExperienceBriefSchema).max(3),
});

function profilePath(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId.trim().toLowerCase(), "learning_profile.json");
}

function readProfile(childId: string, opts: Pick<PlannerReviewOptions, "rootDir"> = {}): LearningProfile {
  const file = profilePath(opts.rootDir ?? process.cwd(), childId);
  if (!fs.existsSync(file)) {
    throw new Error(`planner_trust_missing_profile:${childId}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as LearningProfile;
}

function writeProfile(childId: string, profile: LearningProfile, opts: PlannerReviewOptions = {}): void {
  const file = profilePath(opts.rootDir ?? process.cwd(), childId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...profile,
        lastUpdated: (opts.now ?? new Date()).toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function normalizePlannerTrust(profile: Pick<LearningProfile, "plannerTrust">): PlannerTrustState {
  const prior = profile.plannerTrust;
  const approvedCount = Math.max(0, Math.floor(prior?.approvedCount ?? 0));
  const rejectedCount = Math.max(0, Math.floor(prior?.rejectedCount ?? 0));
  const autoPlanThreshold = Math.max(1, Math.floor(prior?.autoPlanThreshold ?? AUTO_PLAN_THRESHOLD));
  return {
    approvedCount,
    rejectedCount,
    autoPlanThreshold,
    autoPlanEnabled: prior?.autoPlanEnabled === true || approvedCount >= autoPlanThreshold,
    ...(prior?.lastDecision ? { lastDecision: prior.lastDecision } : {}),
  };
}

function difficultyKnobsFor(contract: ActivityToolContract): string[] {
  const knobs = ["difficulty"];
  if (contract.evidence.requiresPerTargetResult) knobs.push("targetCount");
  if (contract.traits.inputModes.includes("voice")) knobs.push("speechStrictness");
  if (contract.domains.includes("spelling") || contract.domains.includes("vocabulary")) {
    knobs.push("wordOrder", "visibleWordMode");
  }
  if (contract.id === "word-radar") {
    knobs.push("recallMode", "hideWordDuringResponse", "requiresCapturedResponse");
  }
  if (contract.traits.evidenceType === "reward") knobs.push("rewardTiming");
  return [...new Set(knobs)];
}

function validConfigOptionsFor(contract: ActivityToolContract): string[] {
  const options = ["targetWords", "timeboxSeconds"];
  if (contract.traits.pacing === "fast" || contract.traits.pacing === "burst") {
    options.push("speedMode");
  }
  if (contract.scaffolds.length > 0) options.push("scaffoldLevel");
  if (contract.evidence.requiresPerTargetResult) options.push("perTargetResults");
  if (contract.traits.inputModes.includes("voice")) options.push("acceptedResponses");
  if (contract.id === "word-radar") {
    options.push("recallMode", "hideWordDuringResponse", "requiresCapturedResponse");
  }
  return [...new Set(options)];
}

function cardFromContract(contract: ActivityToolContract): ExperienceActivityCard {
  return {
    activityId: contract.id,
    label: contract.label,
    gameIds: [...contract.gameIds],
    configSource: contract.configSource,
    domains: [...contract.domains],
    skillTargets: [...contract.traits.skillTargets],
    evidenceQuality: contract.traits.evidenceType,
    engagementHooks: [...contract.traits.preferenceDimensions],
    difficultyKnobs: difficultyKnobsFor(contract),
    contaminationRisks: [...contract.evidence.contaminationRisks],
    validConfigOptions: validConfigOptionsFor(contract),
    measures: [...contract.measures],
    configKnobs: [...contract.configKnobs],
    realDifficultyLevels: [...contract.realDifficultyLevels],
    signalsEmitted: [...contract.signalsEmitted],
    signalsMissing: [...contract.signalsMissing],
    psychologistGuidance: [...contract.psychologistGuidance],
    capabilityModes: contract.capabilityModes.map((mode) => ({
      ...mode,
      skillTargets: [...mode.skillTargets],
      inputModes: [...mode.inputModes],
      scaffolds: [...mode.scaffolds],
      config: { ...mode.config },
      measurementRisks: [...mode.measurementRisks],
    })),
  };
}

function engagementSummary(profile: LearningProfile): string[] {
  return Object.values(profile.activityModel ?? {})
    .sort((a, b) =>
      (b.engagementScore + b.completionRate - b.frustrationScore) -
      (a.engagementScore + a.completionRate - a.frustrationScore),
    )
    .slice(0, 8)
    .map((entry) =>
      `${entry.activityId}:plays=${entry.plays}:completion=${entry.completionRate}:accuracy=${entry.averageAccuracy}:engagement=${entry.engagementScore}:frustration=${entry.frustrationScore}`,
    );
}

function calibrationSummary(profile: LearningProfile): string[] {
  return (profile.learningCalibrationJournal ?? [])
    .slice(0, 5)
    .map((entry) => `${entry.status}:${entry.homeworkId}:${entry.nextAdjustment}`);
}

export function buildExperiencePlannerInput(
  chart: ChildChart,
  opts: ExperiencePlannerOptions = {},
): ExperiencePlannerInput {
  const rootDir = opts.rootDir ?? chart.rootDir;
  const learningContext = buildLearningDecisionContext(chart.childId, {
    rootDir,
    now: opts.now,
  });
  const companionAudit = opts.companionConversationAudit ?? [];
  return {
    childId: chart.childId,
    chart,
    learningContext,
    homeworkGoal: learningContext.homework,
    plannerTrust: normalizePlannerTrust(chart.learningProfile),
    activityCards: listActivityToolContracts().map(cardFromContract),
    engagementSummary: engagementSummary(chart.learningProfile),
    traitSignalSummary: buildActivityTraitSignalSummary(chart.childId, { rootDir }),
    calibrationSummary: calibrationSummary(chart.learningProfile),
    companionConversationAudit: {
      status: companionAudit.length ? "ready" : "empty",
      summary: companionAudit.slice(0, 12),
    },
  };
}

function preferredHooks(input: ExperiencePlannerInput): string[] {
  const fromSignals = input.traitSignalSummary.preferredDimensions.map((item) => item.split(":")[0] ?? item);
  const fromActivity = input.activityCards
    .filter((card) => input.engagementSummary.some((summary) => summary.startsWith(`${card.activityId}:`)))
    .flatMap((card) => card.engagementHooks);
  return [...new Set([...fromSignals, ...fromActivity])].slice(0, 8);
}

function strongestActivity(input: ExperiencePlannerInput): string {
  const first = input.engagementSummary[0]?.split(":")[0];
  return first || "baseline activities";
}

function planTheoryFor(input: ExperiencePlannerInput, plan: ActiveSessionPlan): PlanTheory {
  const displayName = input.chart.identity.displayName;
  const domain = plan.domain;
  const hooks = preferredHooks(input);
  const strongest = strongestActivity(input);
  const hookText = hooks.length ? hooks.join(", ") : "measured engagement hooks";
  return {
    hypothesis: `${displayName} can handle a more adaptive ${domain} session when Sunny keeps the academic target fixed but varies the experience around ${hookText}.`,
    evidenceSummary: [
      ...(input.homeworkGoal
        ? [`Active homework ${input.homeworkGoal.homeworkId ?? "unknown"} due ${input.homeworkGoal.testDate ?? "unknown"}.`]
        : ["No active homework goal was present."]),
      ...plan.evidenceUsed.map((item) => item.summary),
      ...input.engagementSummary.slice(0, 3),
    ],
    intervention: `Use ${strongest} and equivalent valid activities as interventions while preserving ${domain} evidence quality.`,
    supportCriteria: [
      "completed node with accuracy >= 0.85",
      "at least 5 targets when the activity is target-based",
      "frustration score below 0.35",
      "delayed or graded work does not contradict the in-app result",
    ],
    reviseCriteria: [
      "accuracy between 0.65 and 0.85",
      "child asks to change activity or shows repeated hesitation",
      "stated preference conflicts with observed behavior",
    ],
    falsifyCriteria: [
      "accuracy below 0.65",
      "high frustration or abandonment",
      "returned test shows the practiced target did not transfer",
    ],
  };
}

function measurementForNode(
  input: ExperiencePlannerInput,
  node: ActiveSessionPlan["nodePlan"][number],
): PlannedMeasurement {
  const card = input.activityCards.find((item) => item.activityId === node.activityId || item.activityId === node.type);
  return {
    id: `measure-${node.id}`,
    activityId: node.activityId,
    target: node.targets.length ? `${node.targets.length} target(s)` : node.type,
    evidenceType: node.type === "word-radar" && node.wordRadarConfig
      ? `${card?.evidenceQuality ?? "practice"}:${node.wordRadarConfig.recallMode}`
      : card?.evidenceQuality ?? "practice",
    supportCriteria: "accuracy >= 0.85 and low frustration",
    reviseCriteria: "partial accuracy, hesitation, or mixed engagement",
    falsifyCriteria: "poor transfer, high frustration, or repeated misses",
  };
}

function generatedBriefForPlan(
  input: ExperiencePlannerInput,
  plan: ActiveSessionPlan,
): GeneratedExperienceBrief | null {
  if (!input.homeworkGoal) return null;
  const pending = input.chart.homework.pending;
  const topic = pending?.contentProfile?.topic ?? input.homeworkGoal.topic;
  const concepts = pending?.contentProfile?.concepts ?? [];
  return {
    briefId: `brief-${plan.planId}-quest`,
    kind: "quest",
    title: `${input.chart.identity.displayName} ${topic} quest`,
    learningGoal: `Create a validated generated quest that tests ${plan.domain} transfer for ${topic}.`,
    targetSkills: [pending?.contentProfile?.primarySkill ?? input.homeworkGoal.type],
    targetConcepts: [...concepts],
    targetWords: plan.wordPlan.words.map((word) => word.text),
    engagementHooks: preferredHooks(input),
    algorithmTargets: ["retrieval-practice", "desirable-difficulty", "activity-affinity", "variable-reward"],
    evidenceUsed: plan.evidenceUsed.map((item) => item.id),
    artifactStatus: "brief_only",
    validationRequired: true,
  };
}

function plannerConfidence(input: ExperiencePlannerInput, plan: ActiveSessionPlan): number {
  let score = 0.45;
  if (input.homeworkGoal) score += 0.15;
  if (input.activityCards.length >= 5) score += 0.1;
  if (input.engagementSummary.length > 0) score += 0.1;
  if (input.traitSignalSummary.preferredDimensions.length > 0) score += 0.1;
  if (plan.variationPolicy.avoidExactPreviousWordOrder) score += 0.05;
  if (input.calibrationSummary.length > 0) score += 0.05;
  return Math.round(Math.min(0.95, score) * 100) / 100;
}

export function draftPsychologistExperiencePlan(
  input: ExperiencePlannerInput,
  opts: Pick<ExperiencePlannerOptions, "now" | "parentNote"> = {},
): ActiveSessionPlan {
  const plan = planHomeworkSessionFromChart(input.chart, {
    source: input.plannerTrust.autoPlanEnabled ? "psychologist_sync" : "ingest_human_loop",
    now: opts.now,
    parentNote: opts.parentNote,
  });
  const confidence = plannerConfidence(input, plan);
  const brief = generatedBriefForPlan(input, plan);
  return {
    ...plan,
    approvalStatus: input.plannerTrust.autoPlanEnabled ? "auto_approved" : "pending",
    plannerConfidence: confidence,
    planTheory: planTheoryFor(input, plan),
    plannedMeasurements: plan.nodePlan
      .filter((node) => node.type !== "quest" && node.type !== "boss")
      .map((node) => measurementForNode(input, node)),
    generatedExperienceBriefs: brief ? [brief] : [],
  };
}

function compactPlannerInput(input: ExperiencePlannerInput): unknown {
  return {
    childId: input.childId,
    child: {
      displayName: input.chart.identity.displayName,
      grade: input.chart.demographics.grade,
      companion: input.chart.companion.displayName,
    },
    homeworkGoal: input.homeworkGoal,
    plannerTrust: input.plannerTrust,
    activeSessionPlan: input.learningContext.chart.activeSessionPlan,
    algorithmFeeds: input.learningContext.algorithmFeeds,
    diagnostics: input.learningContext.diagnostics,
    contentCatalog: input.learningContext.contentCatalog,
    activityCards: input.activityCards,
    engagementSummary: input.engagementSummary,
    traitSignalSummary: {
      preferredDimensions: input.traitSignalSummary.preferredDimensions,
      avoidedDimensions: input.traitSignalSummary.avoidedDimensions,
      contradictions: input.traitSignalSummary.contradictions,
    },
    calibrationSummary: input.calibrationSummary,
    companionConversationAudit: input.companionConversationAudit,
  };
}

export function buildExperiencePlannerPrompt(input: ExperiencePlannerInput): string {
  return `Plan Sunny's next learning experience from the child chart.

Rules:
- The active homework/domain goal is the source of truth.
- Use activity cards as interventions/instruments; do not route outside the domain.
- Baseline activities measure or scaffold; generated quest/boss content is only a brief here.
- State the learning theory, the evidence used, and what would support, revise, or falsify it.
- Prefer variety when prior evidence shows strong performance; do not replay the same script.
- Output only the requested structured object.

Planner input:
${JSON.stringify(compactPlannerInput(input), null, 2)}`;
}

export async function runAiPsychologistExperiencePlanner(
  input: ExperiencePlannerInput,
  opts: Pick<ExperiencePlannerOptions, "model" | "now" | "parentNote"> = {},
): Promise<ActiveSessionPlan> {
  const basePlan = draftPsychologistExperiencePlan(input, opts);
  const { object } = await generateObject({
    model: anthropic(opts.model ?? process.env.SUNNY_EXPERIENCE_PLANNER_MODEL ?? "claude-haiku-4-5-20251001"),
    schema: aiPlannerDecisionSchema,
    system: "You are Sunny's AI psychologist experience planner. You synthesize chart evidence into a safe, measurable learning plan brief. You do not generate playable artifacts.",
    prompt: buildExperiencePlannerPrompt(input),
  });
  return {
    ...basePlan,
    plannerConfidence: Math.round(object.plannerConfidence * 100) / 100,
    planTheory: object.planTheory,
    plannedMeasurements: object.plannedMeasurements,
    generatedExperienceBriefs: object.generatedExperienceBriefs.map((brief) => ({
      ...brief,
      artifactStatus: "brief_only",
      validationRequired: true,
    })),
  };
}

export async function planPsychologistExperience(
  input: ExperiencePlannerInput,
  opts: Pick<ExperiencePlannerOptions, "useAi" | "model" | "now" | "parentNote"> = {},
): Promise<ActiveSessionPlan> {
  if (!opts.useAi) {
    return draftPsychologistExperiencePlan(input, opts);
  }
  try {
    const plan = await runAiPsychologistExperiencePlanner(input, opts);
    console.log(
      `  🎮 [experience-planner] [ai] child=${input.childId} confidence=${plan.plannerConfidence ?? "unknown"}`,
    );
    return plan;
  } catch (err) {
    console.warn("  🎮 [experience-planner] [ai-fallback]", err);
    return draftPsychologistExperiencePlan(input, opts);
  }
}

export function recordPlannerReview(
  childId: string,
  decision: PlannerReviewDecision,
  opts: PlannerReviewOptions = {},
): PlannerTrustState {
  const profile = readProfile(childId, opts);
  const prior = normalizePlannerTrust(profile);
  const approvedCount = prior.approvedCount + (decision.status === "approved" ? 1 : 0);
  const rejectedCount = prior.rejectedCount + (decision.status === "rejected" ? 1 : 0);
  const next: PlannerTrustState = {
    approvedCount,
    rejectedCount,
    autoPlanThreshold: prior.autoPlanThreshold,
    autoPlanEnabled: approvedCount >= prior.autoPlanThreshold,
    lastDecision: decision,
  };
  writeProfile(childId, { ...profile, plannerTrust: next }, opts);
  console.log(
    `  🎮 [experience-planner] [review] child=${childId} plan=${decision.planId} status=${decision.status} auto=${next.autoPlanEnabled}`,
  );
  return next;
}
