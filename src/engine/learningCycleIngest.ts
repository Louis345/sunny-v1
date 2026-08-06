import crypto from "crypto";
import type { ActiveSessionPlan, EngagementTheory } from "../context/schemas/learningProfile";
import {
  createLearningCycle,
  getLearningCycle,
  repairInvalidLearningCycleForReingestion,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
  type LearningCycleRepositoryOptions,
} from "./learningCycleRepository";

export type LearningCycleIngestInput = {
  childId: string;
  homeworkId: string;
  domain: string;
  title: string;
  contentFingerprint: string;
  capturedEvidenceIds: string[];
  targets: string[];
  plan: ActiveSessionPlan;
  engagementTheory: EngagementTheory | null;
};

function isLocalAssetPath(value: string | undefined): value is string {
  return Boolean(value?.trim()) && !/^https?:\/\//i.test(value!);
}

function roleForNode(node: ActiveSessionPlan["nodePlan"][number]): LearningCycleNodeContract["role"] {
  if (node.type === "quest" || node.activityId === "quest") return "quest";
  if (node.type === "boss" || node.activityId === "boss") return "boss";
  if (node.type === "mystery" || node.activityId === "mystery") return "mystery";
  return "baseline";
}

function staticTitle(role: LearningCycleNodeContract["role"], proposed: string | undefined): string {
  if (role === "quest") return "Quest";
  if (role === "boss") return "Boss";
  if (role === "mystery") return proposed?.trim() || "Mystery";
  return proposed?.trim() || "Learning Activity";
}

function contractFingerprint(input: {
  node: ActiveSessionPlan["nodePlan"][number];
  role: LearningCycleNodeContract["role"];
  title: string;
  purpose: string;
}): string {
  const value = JSON.stringify({
    role: input.role,
    title: input.title,
    purpose: input.purpose,
    domain: input.node.targetLane,
    targets: input.node.targets,
    mechanic: input.node.mechanic,
    theme: input.node.theme,
    sfxProfile: input.node.sfxProfile,
    companionPolicy: input.node.companionPolicy,
  });
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function sfxContract(profile: string | undefined): string[] {
  const values = profile?.split(/[-,]/g).map((value) => value.trim()).filter(Boolean) ?? [];
  return values.length ? values : ["tap", "correct", "incorrect", "progress", "complete"];
}

function generationPromptForBaseline(
  input: LearningCycleIngestInput,
  node: ActiveSessionPlan["nodePlan"][number],
  title: string,
): LearningCycleNodeContract["generationPrompt"] {
  return {
    promptId: `${input.homeworkId}:${node.id}:ingest-prompt`,
    createdFromEvidenceIds: [...input.capturedEvidenceIds],
    text: [
      `Build ${title} for ${input.title}.`,
      `Domain: ${input.domain}.`,
      `Targets: ${node.targets.join(", ")}.`,
      `Mechanic: ${node.mechanic ?? "planner-selected practice"}.`,
      `Theme: ${node.theme ?? "child-centered learning"}.`,
      "The opening screen, artwork, instructions, interaction, and evidence must all express this same contract.",
    ].join(" "),
  };
}

function nodeContract(
  input: LearningCycleIngestInput,
  node: ActiveSessionPlan["nodePlan"][number],
): LearningCycleNodeContract {
  const role = roleForNode(node);
  const title = staticTitle(role, node.title);
  const skill = node.targetLane?.trim() || (role === "quest" ? `${input.domain}_transfer` : role === "boss" ? `${input.domain}_mastery` : `${input.domain}_practice`);
  const mechanic = node.mechanic?.trim() || (role === "quest" ? "generated-after-baseline" : role === "boss" ? "generated-after-quest" : "configured-practice");
  const purpose = role === "quest"
    ? "Locked until baseline evidence is ready."
    : role === "boss"
      ? "Locked until Quest evidence is ready."
      : role === "mystery"
        ? `Choose a ${input.domain} challenge and record real preference evidence.`
        : `Practice ${skill} through ${mechanic}.`;
  const localArtifact = isLocalAssetPath(node.gameHtmlPath) ? node.gameHtmlPath : undefined;
  const localArtwork = isLocalAssetPath(node.thumbnailUrl) ? node.thumbnailUrl : undefined;
  const canBind = role === "baseline" && Boolean(localArtifact && localArtwork && node.contentId);
  const fingerprint = contractFingerprint({ node, role, title, purpose });
  const artifactBinding = canBind
    ? {
        contentId: node.contentId!,
        artifactId: `${node.contentId}:artifact`,
        localArtifactPath: localArtifact!,
        localArtworkPath: localArtwork!,
        ...(node.activityConfigPath ? { activityConfigPath: node.activityConfigPath } : {}),
        contractFingerprint: fingerprint,
        validationStatus: "passed" as const,
      }
    : null;
  const state: LearningCycleNodeContract["state"] = role === "quest" || role === "boss"
    ? "locked"
    : role === "mystery"
      ? "ready"
      : artifactBinding
        ? "ready"
        : "blocked";
  return {
    nodeId: node.id,
    role,
    title,
    state,
    academicTarget: {
      domain: input.domain,
      skill,
      targets: [...node.targets],
    },
    algorithmOwner: role === "quest" || role === "boss" ? "mastery-gating" : role === "mystery" ? "activity-affinity" : "retrieval-practice",
    theoryId: node.theoryId ?? input.plan.planTheory?.hypothesis ?? `${input.homeworkId}:academic-theory`,
    experimentId: node.experimentId ?? `${input.homeworkId}:experiment:${node.id}`,
    mechanic,
    theme: node.theme?.trim() || (role === "quest" || role === "boss" ? "pending" : "learning adventure"),
    openingScreen: { title, purpose },
    generationPrompt: role === "baseline" ? generationPromptForBaseline(input, node, title) : null,
    artifactBinding,
    artwork: localArtwork
      ? { status: "ready", localPath: localArtwork, prompt: node.thumbnailPrompt ?? null }
      : role === "quest" || role === "boss"
        ? {
            status: "placeholder",
            localPath: role === "quest" ? "/generated/adventure-board-demo/quest.jpeg" : "/generated/adventure-board-demo/boss.jpeg",
            prompt: null,
          }
        : { status: "failed", localPath: null, prompt: node.thumbnailPrompt ?? null },
    sfxContract: sfxContract(node.sfxProfile),
    companionContract: { events: ["correct_answer", "wrong_answer", "session_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

export function buildLearningCycleInputFromPlan(input: LearningCycleIngestInput): CreateLearningCycleInput {
  const planTheory = input.plan.planTheory;
  return {
    childId: input.childId.trim().toLowerCase(),
    homeworkId: input.homeworkId,
    domain: input.domain,
    assignment: {
      title: input.title,
      contentFingerprint: input.contentFingerprint,
      capturedEvidenceIds: [...input.capturedEvidenceIds],
      targets: [...input.targets],
    },
    academicTheory: {
      theoryId: input.plan.nodePlan.find((node) => node.theoryId)?.theoryId ?? `${input.homeworkId}:academic-theory`,
      revision: 1,
      hypothesis: planTheory?.hypothesis ?? "Measure the captured assignment before claiming learning.",
      supportCriteria: planTheory?.supportCriteria ?? ["required evidence supports the hypothesis"],
      reviseCriteria: planTheory?.reviseCriteria ?? ["evidence is mixed or support is insufficient"],
      falsifyCriteria: planTheory?.falsifyCriteria ?? ["observed outcomes contradict the hypothesis"],
    },
    engagementTheory: input.engagementTheory,
    nodes: input.plan.nodePlan.map((node) => nodeContract(input, node)),
  };
}

export function persistIngestedLearningCycle(
  input: LearningCycleIngestInput,
  opts: LearningCycleRepositoryOptions = {},
): LearningCycleRecordV2 {
  const nextInput = buildLearningCycleInputFromPlan(input);
  let current: LearningCycleRecordV2 | null;
  try {
    current = getLearningCycle(input.childId, input.homeworkId, opts);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "learning_cycle_boss_progress_requires_quest_evidence") {
      throw error;
    }
    current = repairInvalidLearningCycleForReingestion(nextInput, opts);
  }
  if (!current) return createLearningCycle(nextInput, opts);
  return transitionLearningCycle(input.childId, input.homeworkId, current.revision, {
    type: "plan_reconciled",
    assignment: nextInput.assignment,
    academicTheory: {
      ...nextInput.academicTheory,
      revision: current.academicTheory.revision + 1,
    },
    engagementTheory: nextInput.engagementTheory,
    nodes: nextInput.nodes,
    reason: "Re-ingestion reconciled the canonical cycle without discarding recorded evidence.",
  }, opts);
}
