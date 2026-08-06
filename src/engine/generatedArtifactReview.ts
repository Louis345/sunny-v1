import * as fs from "node:fs";
import * as path from "node:path";
import type { AIContentCatalogItem, GeneratedArtifactLifecycleStatus, LearningProfile } from "../context/schemas/learningProfile";
import { readWaterfallContentCatalog, writeWaterfallContentCatalog } from "../profiles/chartWaterfall";
import { appendContentFeedbackLesson } from "./contentFeedbackMemory";

export type GeneratedArtifactReviewDecision = "preserve" | "discard" | "revise";
export type QuestBossArtifactReviewDecision = "approve" | "revise" | "reject" | "regenerate";

export interface GeneratedArtifactReviewInput {
  artifactPath: string;
  decision: GeneratedArtifactReviewDecision;
  reason: string;
  reviewer?: string;
  reviewedAt?: string;
}

export interface GeneratedArtifactReviewRecord {
  schemaVersion: 1;
  artifactPath: string;
  decision: GeneratedArtifactReviewDecision;
  playableDisposition: "preserve_candidate" | "discard_candidate" | "needs_revision";
  reason: string;
  reviewer: string;
  reviewedAt: string;
  reviewPath: string;
  preservedCopyPath?: string;
}

export interface QuestBossArtifactReviewInput {
  rootDir?: string;
  childId: string;
  artifactPath: string;
  contentId: string;
  briefId: string;
  decision: QuestBossArtifactReviewDecision;
  reason: string;
  reusableLessons?: string[];
  reviewer?: string;
  reviewedAt?: string;
}

export interface QuestBossArtifactReviewRecord {
  schemaVersion: 1;
  artifactPath: string;
  contentId: string;
  briefId: string;
  decision: QuestBossArtifactReviewDecision;
  playableDisposition: GeneratedArtifactLifecycleStatus;
  reason: string;
  reusableLessons: string[];
  reviewer: string;
  reviewedAt: string;
  reviewPath: string;
}

function playableDisposition(decision: GeneratedArtifactReviewDecision): GeneratedArtifactReviewRecord["playableDisposition"] {
  if (decision === "preserve") return "preserve_candidate";
  if (decision === "discard") return "discard_candidate";
  return "needs_revision";
}

export function reviewGeneratedExperienceArtifact(input: GeneratedArtifactReviewInput): GeneratedArtifactReviewRecord {
  const artifactPath = path.resolve(input.artifactPath);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Generated artifact not found: ${artifactPath}`);
  }
  if (!input.reason.trim()) {
    throw new Error("A review reason is required to preserve, discard, or revise a generated artifact.");
  }

  const dir = path.dirname(artifactPath);
  const reviewPath = path.join(dir, "artifact-review.json");
  const record: GeneratedArtifactReviewRecord = {
    schemaVersion: 1,
    artifactPath,
    decision: input.decision,
    playableDisposition: playableDisposition(input.decision),
    reason: input.reason.trim(),
    reviewer: input.reviewer?.trim() || "human",
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
    reviewPath,
  };

  if (input.decision === "preserve") {
    const ext = path.extname(artifactPath) || ".html";
    const preservedCopyPath = path.join(dir, `preserved-generated-artifact${ext}`);
    fs.copyFileSync(artifactPath, preservedCopyPath);
    record.preservedCopyPath = preservedCopyPath;
  }

  fs.writeFileSync(reviewPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  console.log(
    `🎮 [experience-artifact-review] [decision] ${record.decision} artifact=${artifactPath}`,
  );
  return record;
}

function reviewStatusForDecision(decision: QuestBossArtifactReviewDecision): GeneratedArtifactLifecycleStatus {
  if (decision === "approve") return "approved_ready";
  if (decision === "reject") return "retired";
  return "failed_retryable";
}

function catalogReuseForDecision(decision: QuestBossArtifactReviewDecision): AIContentCatalogItem["reuseStatus"] {
  if (decision === "approve") return "reuse";
  if (decision === "reject") return "retire";
  return "revise";
}

export function recordQuestBossArtifactReview(input: QuestBossArtifactReviewInput): QuestBossArtifactReviewRecord {
  const rootDir = input.rootDir ?? process.cwd();
  const childId = input.childId.trim().toLowerCase();
  const artifactPath = path.resolve(input.artifactPath);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Generated artifact not found: ${artifactPath}`);
  }
  if (!input.reason.trim()) {
    throw new Error("A review reason is required before changing generated artifact readiness.");
  }

  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const reviewer = input.reviewer?.trim() || "human";
  const status = reviewStatusForDecision(input.decision);
  const reusableLessons = (input.reusableLessons ?? []).map((lesson) => lesson.trim()).filter(Boolean);
  const reviewPath = path.join(path.dirname(artifactPath), "artifact-review.json");
  const record: QuestBossArtifactReviewRecord = {
    schemaVersion: 1,
    artifactPath,
    contentId: input.contentId,
    briefId: input.briefId,
    decision: input.decision,
    playableDisposition: status,
    reason: input.reason.trim(),
    reusableLessons,
    reviewer,
    reviewedAt,
    reviewPath,
  };

  const profilePath = path.join(rootDir, "src", "context", childId, "learning_profile.json");
  if (fs.existsSync(profilePath)) {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf-8")) as LearningProfile;
    const activeSessionPlan = profile.activeSessionPlan
      ? {
          ...profile.activeSessionPlan,
          generatedExperienceBriefs: (profile.activeSessionPlan.generatedExperienceBriefs ?? []).map((brief) =>
            brief.briefId === input.briefId ? { ...brief, artifactStatus: status } : brief,
          ),
        }
      : profile.activeSessionPlan;
    const pendingHomework = profile.pendingHomework
      ? {
          ...profile.pendingHomework,
          nodes: profile.pendingHomework.nodes.map((node) => {
            if (node.adaptiveArtifact?.contentId !== input.contentId && node.gameFile !== path.basename(artifactPath)) {
              return node;
            }
            return {
              ...node,
              artifactStatus: status,
              adaptiveArtifact: node.adaptiveArtifact
                ? { ...node.adaptiveArtifact, artifactStatus: status }
                : node.adaptiveArtifact,
            };
          }),
        }
      : profile.pendingHomework;
    // Slimmed profiles keep the catalog only in the waterfall file; writing a
    // bare `[]` here would shadow that fallback and hide every approved shell,
    // so hydrate the effective catalog before mapping and sync both stores.
    const effectiveCatalog = profile.aiContentCatalog ??
      readWaterfallContentCatalog(childId, { rootDir }).items;
    const aiContentCatalog = effectiveCatalog.map((item) =>
      item.contentId === input.contentId
        ? {
            ...item,
            reuseStatus: catalogReuseForDecision(input.decision),
            reuseReason: input.reason.trim(),
            reviewStatus: status,
            reviewDecision: input.decision,
            reviewReason: input.reason.trim(),
            reviewLessons: reusableLessons,
            reviewedBy: reviewer,
            reviewedAt,
          }
        : item,
    );
    const nextProfile: LearningProfile = {
      ...profile,
      activeSessionPlan,
      pendingHomework,
      aiContentCatalog,
      lastUpdated: reviewedAt,
    };
    fs.writeFileSync(profilePath, `${JSON.stringify(nextProfile, null, 2)}\n`, "utf-8");
    writeWaterfallContentCatalog(childId, nextProfile, { rootDir });
  }

  fs.writeFileSync(reviewPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  appendContentFeedbackLesson(rootDir, childId, {
    contentId: input.contentId,
    decision: input.decision,
    reason: input.reason.trim(),
    source: "human_review",
  });
  console.log(
    `🎮 [experience-artifact-review] [quest-boss-decision] ${record.decision} status=${status} artifact=${artifactPath}`,
  );
  return record;
}
