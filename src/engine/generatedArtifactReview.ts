import * as fs from "node:fs";
import * as path from "node:path";

export type GeneratedArtifactReviewDecision = "preserve" | "discard" | "revise";

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
