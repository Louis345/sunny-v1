import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { recordQuestBossArtifactReview, reviewGeneratedExperienceArtifact } from "./generatedArtifactReview";
import type { LearningProfile } from "../context/schemas/learningProfile";

describe("generated artifact review", () => {
  function makeArtifact() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-artifact-review-"));
    const artifactPath = path.join(dir, "failed-generated-artifact.html");
    fs.writeFileSync(artifactPath, "<html><body>candidate</body></html>", "utf-8");
    return { dir, artifactPath };
  }

  it("records a discard decision without deleting the artifact evidence", () => {
    const { artifactPath } = makeArtifact();
    const record = reviewGeneratedExperienceArtifact({
      artifactPath,
      decision: "discard",
      reason: "Rendered its own companion bubble and leaked spelling targets.",
      reviewer: "codex",
      reviewedAt: "2026-05-29T01:00:00.000Z",
    });

    expect(record.decision).toBe("discard");
    expect(record.playableDisposition).toBe("discard_candidate");
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(fs.existsSync(record.reviewPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(record.reviewPath, "utf-8"))).toMatchObject({
      decision: "discard",
      reason: "Rendered its own companion bubble and leaked spelling targets.",
      artifactPath,
    });
  });

  it("preserves an approved artifact by writing a stable review copy", () => {
    const { artifactPath } = makeArtifact();
    const record = reviewGeneratedExperienceArtifact({
      artifactPath,
      decision: "preserve",
      reason: "Good candidate for replay review.",
      reviewer: "codex",
      reviewedAt: "2026-05-29T01:00:00.000Z",
    });

    expect(record.decision).toBe("preserve");
    expect(record.playableDisposition).toBe("preserve_candidate");
    expect(record.preservedCopyPath).toBeTruthy();
    expect(fs.readFileSync(record.preservedCopyPath ?? "", "utf-8")).toContain("candidate");
  });

  it("approves a reviewed Quest artifact and records reusable human guidance", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-artifact-review-profile-"));
    const childId = "reina";
    const artifactPath = path.join(dir, "src/context/reina/homework/games/2026-05-13/quest-brief.html");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, "<html><body>quest</body></html>", "utf-8");
    const profilePath = path.join(dir, "src/context/reina/learning_profile.json");
    const profile = {
      childId,
      activeSessionPlan: {
        planId: "plan-1",
        childId,
        createdAt: "2026-05-13T12:00:00.000Z",
        source: "ingest_human_loop",
        nodePlan: [],
        evidenceUsed: [],
        openQuestions: [],
        plannerConfidence: 0.8,
        approvalStatus: "approved",
        generatedExperienceBriefs: [
          {
            briefId: "brief-quest",
            kind: "quest",
            title: "Quest",
            learningGoal: "Spell words",
            targetSkills: ["spelling"],
            targetConcepts: ["schwa"],
            targetWords: ["above"],
            engagementHooks: ["challenge"],
            algorithmTargets: ["retrieval-practice"],
            evidenceUsed: ["word-radar"],
            artifactStatus: "ready_for_review",
            validationRequired: true,
          },
        ],
      },
      pendingHomework: {
        weekOf: "2026-05-13",
        homeworkId: "hw-1",
        testDate: "2026-05-15",
        testDateSource: "cli",
        testDateConfirmed: true,
        returnTag: "#sunny",
        wordList: ["above"],
        generatedAt: "2026-05-13T12:00:00.000Z",
        capturedContent: null,
        nodes: [
          {
            id: "n-quest",
            type: "quest",
            words: ["above"],
            difficulty: 3,
            gameFile: "quest-brief.html",
            storyFile: null,
            artifactStatus: "ready_for_review",
            adaptiveArtifact: {
              artifactId: "artifact-1",
              contentId: "content-1",
              homeworkId: "hw-1",
              theoryId: "theory-1",
              generationStage: "quest",
              targetGroupIds: ["spell-from-memory"],
              homeworkWordIds: ["hw-1:spell-from-memory:above:0"],
              baselineEvidenceIds: ["word-radar"],
              validationStatus: "passed",
              artifactStatus: "ready_for_review",
            },
          },
        ],
      },
      aiContentCatalog: [
        {
          contentId: "content-1",
          childId,
          source: "generated",
          type: "game",
          title: "Quest",
          algorithmTargets: ["retrieval-practice"],
          targetSkills: ["spelling"],
          targetConcepts: ["schwa"],
          targetWords: ["above"],
          engagementHooks: ["challenge"],
          inputEvidence: {
            activityEvidenceIds: ["word-radar"],
          },
          reuseStatus: "candidate",
          reuseReason: "Needs human review.",
          createdAt: "2026-05-13T12:00:00.000Z",
        },
      ],
    } as unknown as LearningProfile;
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf-8");

    const record = recordQuestBossArtifactReview({
      rootDir: dir,
      childId,
      artifactPath,
      contentId: "content-1",
      briefId: "brief-quest",
      decision: "approve",
      reason: "Good visible recovery and challenge.",
      reusableLessons: ["For Reina, keep the challenge timer visible but not punitive."],
      reviewer: "jamal",
      reviewedAt: "2026-05-13T14:00:00.000Z",
    });

    expect(record.playableDisposition).toBe("approved_ready");
    const updated = JSON.parse(fs.readFileSync(profilePath, "utf-8")) as LearningProfile;
    expect(updated.activeSessionPlan?.generatedExperienceBriefs?.[0]?.artifactStatus).toBe("approved_ready");
    expect(updated.pendingHomework?.nodes[0]?.artifactStatus).toBe("approved_ready");
    expect(updated.pendingHomework?.nodes[0]?.adaptiveArtifact?.artifactStatus).toBe("approved_ready");
    expect(updated.aiContentCatalog?.[0]).toMatchObject({
      reuseStatus: "reuse",
      reviewStatus: "approved_ready",
    });
    expect(updated.aiContentCatalog?.[0]?.reviewLessons).toContain(
      "For Reina, keep the challenge timer visible but not punitive.",
    );
  });
});
