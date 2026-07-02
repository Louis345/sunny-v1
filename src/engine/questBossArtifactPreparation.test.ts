import { describe, expect, it } from "vitest";
import { planQuestBossArtifactPreparationJobs } from "./questBossArtifactPreparation";
import type { LearningProfile } from "../context/schemas/learningProfile";

function profile(status: string, kind: "quest" | "boss" = "quest"): LearningProfile {
  return {
    childId: "reina",
    activeSessionPlan: {
      planId: "plan-1",
      childId: "reina",
      createdAt: "2026-05-13T12:00:00.000Z",
      source: "ingest_human_loop",
      activeHomeworkId: "hw-1",
      nodePlan: [],
      evidenceUsed: [],
      openQuestions: [],
      plannerConfidence: 0.8,
      approvalStatus: "approved",
      generatedExperienceBriefs: [
        {
          briefId: `brief-${kind}`,
          kind,
          title: kind,
          learningGoal: "Measure transfer",
          targetSkills: ["spelling"],
          targetConcepts: ["schwa"],
          targetWords: ["above"],
          engagementHooks: ["challenge"],
          algorithmTargets: ["retrieval-practice"],
          evidenceUsed: ["word-radar"],
          artifactStatus: status as never,
          validationRequired: true,
        },
      ],
    },
  } as unknown as LearningProfile;
}

describe("Quest/Boss artifact preparation planning", () => {
  it("selects brief-only Quest artifacts for background preparation", () => {
    const jobs = planQuestBossArtifactPreparationJobs({
      profile: profile("brief_only", "quest"),
      questEvidenceReady: true,
      bossEvidenceReady: false,
      runningKeys: new Set(),
    });

    expect(jobs).toEqual([
      {
        childId: "reina",
        homeworkId: "hw-1",
        briefId: "brief-quest",
        kind: "quest",
        status: "brief_only",
      },
    ]);
  });

  it("skips artifacts that are already running, reviewable, approved, or retired", () => {
    for (const status of ["generating", "validating", "ready_for_review", "approved_ready", "retired"]) {
      const jobs = planQuestBossArtifactPreparationJobs({
        profile: profile(status, "quest"),
        questEvidenceReady: true,
        bossEvidenceReady: false,
        runningKeys: new Set(),
      });

      expect(jobs).toEqual([]);
    }
  });

  it("blocks Boss preparation until Quest measurement evidence exists", () => {
    const jobs = planQuestBossArtifactPreparationJobs({
      profile: profile("brief_only", "boss"),
      questEvidenceReady: true,
      bossEvidenceReady: false,
      runningKeys: new Set(),
    });

    expect(jobs).toEqual([]);
  });
});
