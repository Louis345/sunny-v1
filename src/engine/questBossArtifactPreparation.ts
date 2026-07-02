import type { GeneratedArtifactLifecycleStatus, LearningProfile } from "../context/schemas/learningProfile";
import { readLearningProfile } from "../utils/learningProfileIO";
import {
  generateExperienceArtifactFromChart,
  generateExperienceHtmlWithSonnet,
  type GenerateExperienceHtmlArgs,
} from "./generatedExperienceArtifact";

export interface QuestBossArtifactPreparationJob {
  childId: string;
  homeworkId?: string;
  briefId: string;
  kind: "quest" | "boss";
  status: GeneratedArtifactLifecycleStatus;
}

export interface PlanQuestBossArtifactPreparationJobsInput {
  profile: LearningProfile;
  questEvidenceReady: boolean;
  bossEvidenceReady: boolean;
  runningKeys?: ReadonlySet<string>;
}

export interface QuestBossArtifactPreparationStatus {
  ok: true;
  childId: string;
  jobs: QuestBossArtifactPreparationJob[];
  running: string[];
  briefs: Array<{
    briefId: string;
    kind: "quest" | "boss";
    status: GeneratedArtifactLifecycleStatus;
  }>;
}

export interface QuestBossArtifactPreparationError {
  ok: false;
  childId: string;
  error: "learning_profile_missing";
}

export interface StartQuestBossArtifactPreparationInput {
  childId: string;
  rootDir?: string;
  generateHtml?: (args: GenerateExperienceHtmlArgs) => Promise<string> | string;
}

const ELIGIBLE_STATUSES = new Set<GeneratedArtifactLifecycleStatus>([
  "brief_only",
  "failed_retryable",
]);

const runningPreparationKeys = new Set<string>();

function jobKey(childId: string, briefId: string): string {
  return `${childId}:${briefId}`;
}

function bossEvidenceReady(profile: LearningProfile): boolean {
  const bossNode = profile.pendingHomework?.nodes.find((node) => node.type === "boss");
  if (bossNode?.adaptiveArtifact?.baselineEvidenceIds?.some((id) => /quest/i.test(id))) return true;
  return Boolean(profile.activeSessionPlan?.evidenceUsed?.some((item) => /quest/i.test(item.id)));
}

function questEvidenceReady(profile: LearningProfile): boolean {
  const planEvidence = profile.activeSessionPlan?.evidenceUsed ?? [];
  if (planEvidence.length > 0) return true;
  return Boolean(profile.pendingHomework?.nodes.some((node) =>
    node.type !== "quest" &&
    node.type !== "boss" &&
    node.type !== "mystery" &&
    Boolean(node.gameFile || node.storyFile || node.adaptiveArtifact?.validationStatus),
  ));
}

export function planQuestBossArtifactPreparationJobs(
  input: PlanQuestBossArtifactPreparationJobsInput,
): QuestBossArtifactPreparationJob[] {
  const childId = input.profile.childId.trim().toLowerCase();
  const homeworkId = input.profile.activeSessionPlan?.activeHomeworkId ?? input.profile.pendingHomework?.homeworkId;
  const runningKeys = input.runningKeys ?? new Set<string>();
  const briefs = input.profile.activeSessionPlan?.generatedExperienceBriefs ?? [];
  const jobs: QuestBossArtifactPreparationJob[] = [];

  for (const brief of briefs) {
    if (brief.kind !== "quest" && brief.kind !== "boss") continue;
    if (!ELIGIBLE_STATUSES.has(brief.artifactStatus)) continue;
    if (runningKeys.has(jobKey(childId, brief.briefId))) continue;
    if (brief.kind === "quest" && !input.questEvidenceReady) continue;
    if (brief.kind === "boss" && !input.bossEvidenceReady) continue;
    jobs.push({
      childId,
      homeworkId,
      briefId: brief.briefId,
      kind: brief.kind,
      status: brief.artifactStatus,
    });
  }

  return jobs;
}

export function readQuestBossArtifactPreparationStatus(
  input: Pick<StartQuestBossArtifactPreparationInput, "childId" | "rootDir">,
): QuestBossArtifactPreparationStatus | QuestBossArtifactPreparationError {
  const childId = input.childId.trim().toLowerCase();
  const profile = readLearningProfile(childId, { rootDir: input.rootDir });
  if (!profile) return { ok: false, childId, error: "learning_profile_missing" };
  const jobs = planQuestBossArtifactPreparationJobs({
    profile,
    questEvidenceReady: questEvidenceReady(profile),
    bossEvidenceReady: bossEvidenceReady(profile),
    runningKeys: runningPreparationKeys,
  });
  const briefs = (profile.activeSessionPlan?.generatedExperienceBriefs ?? [])
    .filter((brief): brief is typeof brief & { kind: "quest" | "boss" } => brief.kind === "quest" || brief.kind === "boss")
    .map((brief) => ({
      briefId: brief.briefId,
      kind: brief.kind,
      status: brief.artifactStatus,
    }));
  return {
    ok: true,
    childId,
    jobs,
    running: [...runningPreparationKeys].filter((key) => key.startsWith(`${childId}:`)),
    briefs,
  };
}

async function runPreparationJob(input: StartQuestBossArtifactPreparationInput, job: QuestBossArtifactPreparationJob): Promise<void> {
  try {
    await generateExperienceArtifactFromChart({
      childId: job.childId,
      rootDir: input.rootDir,
      briefId: job.briefId,
      kind: job.kind,
      generateHtml: input.generateHtml ?? generateExperienceHtmlWithSonnet,
    });
  } finally {
    runningPreparationKeys.delete(jobKey(job.childId, job.briefId));
  }
}

export function startQuestBossArtifactPreparation(
  input: StartQuestBossArtifactPreparationInput,
): QuestBossArtifactPreparationStatus | QuestBossArtifactPreparationError {
  const status = readQuestBossArtifactPreparationStatus(input);
  if (!status.ok) return status;

  for (const job of status.jobs) {
    const key = jobKey(job.childId, job.briefId);
    runningPreparationKeys.add(key);
    void runPreparationJob(input, job).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`🎮 [quest-boss-prep] [background-failed] child=${job.childId} brief=${job.briefId} error=${message}`);
      runningPreparationKeys.delete(key);
    });
  }

  return {
    ...status,
    running: [...new Set([...status.running, ...status.jobs.map((job) => jobKey(job.childId, job.briefId))])],
  };
}
