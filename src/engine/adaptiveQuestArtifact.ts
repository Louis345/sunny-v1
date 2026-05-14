import type { AIContentCatalogItem, LearningProfile } from "../context/schemas/learningProfile";
import type {
  CapturedHomeworkContentRecord,
  HomeworkCycle,
  InterventionMeasurement,
  LearningTheory,
} from "../context/schemas/homeworkCycle";
import type { HomeworkCarePlan } from "./homeworkCarePlan";
import type { PlannedHomeworkNode } from "../scripts/contentAwareHomeworkPlanner";
import type { AdaptiveArtifactValidationReport, AdaptiveArtifactValidationStatus } from "../shared/adventureTypes";

type AssignmentWordGroup = NonNullable<
  CapturedHomeworkContentRecord["assignmentInterpretation"]
>["wordGroups"][number];

type AssignmentInterpretation = NonNullable<CapturedHomeworkContentRecord["assignmentInterpretation"]>;

export type AdaptiveQuestArtifactStage = "quest" | "boss";

export type AdaptiveQuestArtifact = {
  artifactId: string;
  homeworkId: string;
  theoryId: string;
  generationStage: AdaptiveQuestArtifactStage;
  targetGroupIds: string[];
  homeworkWordIds: string[];
  targetWords: string[];
  baselineEvidenceIds: string[];
  contentId: string;
  contentFingerprint?: string;
  generatedPath?: string;
  validationStatus?: AdaptiveArtifactValidationStatus;
  validationReport?: AdaptiveArtifactValidationReport;
  successCriteria: LearningTheory["successCriteria"];
  brief: {
    childId: string;
    title: string;
    hypothesis: string;
    intervention: string;
    targetGroups: Array<{
      id: string;
      label: string;
      purpose: string;
      words: string[];
      homeworkWordIds: string[];
    }>;
    baselineSummary: string[];
    catalogMemorySummary: string[];
    adaptiveContext?: {
      mentalLoadSummary: string[];
      preferredActivities: string[];
      avoidedActivities: string[];
      preferredDimensions: string[];
      avoidedDimensions: string[];
      traitContradictions: string[];
      calibrationSummary: string[];
    };
  };
};

export type GenerateAdaptiveQuestArtifactInput = {
  childChart: { childId: string; learningProfile?: LearningProfile };
  homeworkCycle: HomeworkCycle;
  assignmentInterpretation?: AssignmentInterpretation | null;
  carePlan: HomeworkCarePlan | null;
  theory?: LearningTheory | null;
  baselineEvidence: InterventionMeasurement[];
  contentCatalogMemory: AIContentCatalogItem[];
  generationStage?: AdaptiveQuestArtifactStage;
  generatedPath?: string;
};

function fail(reason: string): never {
  throw new Error(`adaptive_quest_artifact_blocked:${reason}`);
}

function normalizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function groupId(group: AssignmentWordGroup): string {
  return group.wordGroupId ?? group.id;
}

function eligibleTargetGroups(groups: AssignmentWordGroup[]): AssignmentWordGroup[] {
  const preferred = groups.filter((group) => group.purpose === "spell_from_memory");
  return preferred.length > 0
    ? preferred
    : groups.filter((group) => group.purpose !== "unknown");
}

function wordsForGroups(captured: CapturedHomeworkContentRecord, groups: AssignmentWordGroup[]): {
  targetWords: string[];
  homeworkWordIds: string[];
} {
  const allowedGroupIds = new Set(groups.map(groupId));
  const scopedWords = (captured.homeworkWords ?? []).filter((word) =>
    word.wordGroupId ? allowedGroupIds.has(word.wordGroupId) : false,
  );
  if (scopedWords.length > 0) {
    return {
      targetWords: [...new Set(scopedWords.map((word) => word.text))],
      homeworkWordIds: scopedWords.map((word) => word.homeworkWordId),
    };
  }
  return {
    targetWords: [...new Set(groups.flatMap((group) => group.words))],
    homeworkWordIds: groups.flatMap((group) => group.homeworkWordIds ?? []),
  };
}

function catalogMemorySummary(items: AIContentCatalogItem[]): string[] {
  return items
    .filter((item) => item.reuseStatus === "reuse" || item.reuseStatus === "revise")
    .slice(0, 5)
    .map((item) => `${item.reuseStatus}:${item.contentId}:${item.reuseReason}`);
}

function adaptiveContextSummary(profile: LearningProfile | undefined): AdaptiveQuestArtifact["brief"]["adaptiveContext"] | undefined {
  if (!profile) return undefined;
  const activityEntries = Object.values(profile.activityModel ?? {});
  const activityScore = (item: typeof activityEntries[number]) =>
    item.engagementScore + item.completionRate - item.frustrationScore;
  const preferredActivities = [...activityEntries]
    .filter((item) => item.plays > 0 && activityScore(item) >= 1)
    .sort((a, b) => activityScore(b) - activityScore(a))
    .slice(0, 5)
    .map((item) => `${item.activityId}:engagement=${item.engagementScore}:completion=${item.completionRate}`);
  const avoidedActivities = [...activityEntries]
    .filter((item) => item.frustrationScore >= 0.6 || (item.dislikedCount ?? 0) > (item.likedCount ?? 0))
    .sort((a, b) => b.frustrationScore - a.frustrationScore)
    .slice(0, 5)
    .map((item) => `${item.activityId}:frustration=${item.frustrationScore}:dislikes=${item.dislikedCount ?? 0}`);
  const mentalLoadSummary = Object.values(profile.adaptiveLoadState ?? {})
    .slice(0, 5)
    .map((item) =>
      `${item.domain}:cohort=${item.currentCohortSize}:recommendation=${item.challengeRecommendation}:strong=${item.lastLoadEvidence.strongEvidence}`,
    );
  const calibrationSummary = (profile.learningCalibrationJournal ?? [])
    .slice(0, 5)
    .map((item) => `${item.status}:${item.homeworkId}:${item.nextAdjustment}`);
  const traitEntries = Object.values(profile.activityTraitModel ?? {});
  const preferredDimensions = [...traitEntries]
    .filter((item) => item.positiveWeight > item.negativeWeight)
    .sort((a, b) => (b.positiveWeight - b.negativeWeight) - (a.positiveWeight - a.negativeWeight))
    .slice(0, 5)
    .map((item) => `${item.dimension}:positive=${item.positiveWeight}:confidence=${item.confidence}`);
  const avoidedDimensions = [...traitEntries]
    .filter((item) => item.negativeWeight > item.positiveWeight)
    .sort((a, b) => (b.negativeWeight - b.positiveWeight) - (a.negativeWeight - a.positiveWeight))
    .slice(0, 5)
    .map((item) => `${item.dimension}:negative=${item.negativeWeight}:confidence=${item.confidence}`);
  const traitContradictions = [...traitEntries]
    .filter((item) => item.positiveWeight > 0 && item.negativeWeight > 0)
    .slice(0, 5)
    .map((item) => `${item.dimension}:positive=${item.positiveWeight}:negative=${item.negativeWeight}`);
  return {
    mentalLoadSummary,
    preferredActivities,
    avoidedActivities,
    preferredDimensions,
    avoidedDimensions,
    traitContradictions,
    calibrationSummary,
  };
}

export function generateAdaptiveQuestArtifact(
  input: GenerateAdaptiveQuestArtifactInput,
): AdaptiveQuestArtifact {
  const stage = input.generationStage ?? "quest";
  const captured = input.homeworkCycle.capturedContent;
  if (!captured) fail("captured_homework");
  const interpretation = input.assignmentInterpretation ?? captured.assignmentInterpretation;
  if (!interpretation?.wordGroups?.length) fail("assignment_interpretation");
  const theory = input.theory ?? (stage === "boss" ? input.homeworkCycle.bossTheory : input.homeworkCycle.theory);
  if (!theory) fail("pre_quest_theory");
  if (input.baselineEvidence.length === 0) fail("baseline_evidence");
  if (stage === "boss" && !input.homeworkCycle.questMeasurement) fail("quest_measurement");

  const targetGroups = eligibleTargetGroups(interpretation.wordGroups);
  if (targetGroups.length === 0) fail("target_groups");
  const targetGroupIds = targetGroups.map(groupId);
  const { targetWords, homeworkWordIds } = wordsForGroups(captured, targetGroups);
  if (targetWords.length === 0 || homeworkWordIds.length === 0) fail("homework_word_ids");

  const baselineEvidenceIds = input.baselineEvidence.map((item) => item.nodeId);
  const suffix = normalizeId(`${stage}-${theory.theoryId}-${targetGroupIds.join("-")}`);
  const artifactId = `${input.homeworkCycle.homeworkId}:${suffix}`;
  const contentId = `${input.homeworkCycle.homeworkId}:${stage}:${suffix}`;
  const adaptiveContext = adaptiveContextSummary(input.childChart.learningProfile);
  return {
    artifactId,
    homeworkId: input.homeworkCycle.homeworkId,
    theoryId: theory.theoryId,
    generationStage: stage,
    targetGroupIds,
    homeworkWordIds,
    targetWords,
    baselineEvidenceIds,
    contentId,
    ...(input.homeworkCycle.contentFingerprint ? { contentFingerprint: input.homeworkCycle.contentFingerprint } : {}),
    ...(input.generatedPath ? { generatedPath: input.generatedPath } : {}),
    successCriteria: theory.successCriteria,
    brief: {
      childId: input.childChart.childId,
      title: captured.title,
      hypothesis: theory.hypothesis,
      intervention: theory.intervention,
      targetGroups: targetGroups.map((group) => ({
        id: groupId(group),
        label: group.label,
        purpose: group.purpose,
        words: [...group.words],
        homeworkWordIds: [...(group.homeworkWordIds ?? [])],
      })),
      baselineSummary: input.baselineEvidence.map((item) =>
        `${item.nodeId}:${item.nodeType}:accuracy=${item.interventionAccuracy}:status=${item.status}`,
      ),
      catalogMemorySummary: catalogMemorySummary(input.contentCatalogMemory),
      ...(adaptiveContext ? { adaptiveContext } : {}),
    },
  };
}

export function validateAdaptiveQuestArtifact(
  artifact: AdaptiveQuestArtifact,
): { ok: true } | { ok: false; error: string } {
  if (!artifact.artifactId) return { ok: false, error: "missing_artifact_id" };
  if (!artifact.homeworkId) return { ok: false, error: "missing_homework_id" };
  if (!artifact.theoryId) return { ok: false, error: "missing_theory_id" };
  if (!artifact.targetGroupIds.length) return { ok: false, error: "missing_target_groups" };
  if (!artifact.homeworkWordIds.length) return { ok: false, error: "missing_homework_words" };
  if (!artifact.baselineEvidenceIds.length) return { ok: false, error: "missing_baseline_evidence" };
  if (!artifact.contentId) return { ok: false, error: "missing_content_id" };
  return { ok: true };
}

export function markAdaptiveArtifactValidation(
  artifact: AdaptiveQuestArtifact,
  report: AdaptiveArtifactValidationReport & { status?: AdaptiveArtifactValidationStatus },
): AdaptiveQuestArtifact {
  const validationStatus = report.status ?? (report.passed ? (report.warnings.length ? "warning" : "passed") : "failed");
  const validationReport: AdaptiveArtifactValidationReport = {
    passed: report.passed,
    score: report.score,
    failures: [...report.failures],
    warnings: [...report.warnings],
    attempts: report.attempts,
    validatedAt: report.validatedAt,
  };
  return {
    ...artifact,
    validationStatus,
    validationReport,
  };
}

export function catalogAdaptiveQuestArtifact(
  artifact: AdaptiveQuestArtifact,
  args: { childId: string; title?: string },
): AIContentCatalogItem {
  const validation = validateAdaptiveQuestArtifact(artifact);
  if (!validation.ok) throw new Error(validation.error);
  return {
    contentId: artifact.contentId,
    homeworkId: artifact.homeworkId,
    childId: args.childId,
    type: "game",
    source: "generated",
    purpose: artifact.generationStage === "boss" ? "mastery_gate" : "learning_intervention",
    title: args.title ?? `${artifact.brief.title} ${artifact.generationStage}`,
    algorithmTargets: artifact.generationStage === "boss"
      ? ["mastery-gating", "retrieval-practice"]
      : ["error-pattern-remediation", "retrieval-practice", "desirable-difficulty"],
    targetSkills: [artifact.brief.intervention],
    targetConcepts: artifact.brief.targetGroups.map((group) => group.label),
    targetWords: artifact.targetWords,
    engagementHooks: [],
    inputEvidence: {
      ...(artifact.contentFingerprint ? { contentFingerprint: artifact.contentFingerprint } : {}),
      patternIds: [artifact.theoryId, ...artifact.targetGroupIds],
      activityEvidenceIds: artifact.baselineEvidenceIds,
    },
    reuseStatus: "candidate",
    reuseReason: `${artifact.generationStage} generated to test theory ${artifact.theoryId}.`,
    ...(artifact.validationStatus ? { validationStatus: artifact.validationStatus } : {}),
    ...(artifact.validationReport ? { validationReport: artifact.validationReport } : {}),
  };
}

export function attachArtifactToHomeworkNode(
  node: PlannedHomeworkNode,
  artifact: AdaptiveQuestArtifact,
): PlannedHomeworkNode {
  return {
    ...node,
    words: [...artifact.targetWords],
    gameFile: artifact.generatedPath ?? node.gameFile ?? null,
    adaptiveArtifact: {
      artifactId: artifact.artifactId,
      contentId: artifact.contentId,
      homeworkId: artifact.homeworkId,
      theoryId: artifact.theoryId,
      generationStage: artifact.generationStage,
      targetGroupIds: [...artifact.targetGroupIds],
      homeworkWordIds: [...artifact.homeworkWordIds],
      baselineEvidenceIds: [...artifact.baselineEvidenceIds],
      ...(artifact.generatedPath ? { generatedPath: artifact.generatedPath } : {}),
      ...(artifact.validationStatus ? { validationStatus: artifact.validationStatus } : {}),
      ...(artifact.validationReport ? { validationReport: artifact.validationReport } : {}),
    },
  };
}
