import { describe, expect, it } from "vitest";
import {
  buildQuestBossGateDemoReport,
  evaluateQuestBossGateScenario,
  type QuestBossGateDemoScreenshotSet,
} from "../engine/questBossGateDemo";
import { SONNET_MODEL } from "./generateGame";
import { PAID_QUEST_BOSS_SMOKE_MODEL } from "./captureQuestBossLaunchSmoke";

const screenshots: QuestBossGateDemoScreenshotSet = {
  board: "/tmp/board.png",
  lockedState: "/tmp/locked.png",
  modal: "/tmp/modal.png",
  launch: "/tmp/launch.png",
  completion: "/tmp/completion.png",
};

describe("Quest/Boss gate demo metrics", () => {
  it("uses the shared paid Sonnet model label for smoke metadata", () => {
    expect(PAID_QUEST_BOSS_SMOKE_MODEL).toBe(SONNET_MODEL);
  });

  it("keeps Quest and Boss locked when baseline evidence is weak", () => {
    const result = evaluateQuestBossGateScenario({
      scenario: "baseline_fail",
      baselineAccuracy: 0.5,
      baselineAttemptCount: 3,
      baselineTargetsMeasured: 3,
      targetWeaknesses: ["write"],
      screenshots,
    });

    expect(result).toMatchObject({
      scenario: "baseline_fail",
      pass: true,
      questState: "locked",
      bossState: "locked",
      masteryStatus: "not_ready",
      nextAction: "support",
      carePlanRevisionWritten: true,
    });
    expect(result.screenshots.launch).toBeNull();
    expect(result.failureReasons).toEqual([]);
  });

  it("keeps Boss locked and revises the care plan after a failed Quest", () => {
    const result = evaluateQuestBossGateScenario({
      scenario: "quest_fail",
      baselineAccuracy: 0.92,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      questAccuracy: 0.58,
      questAttemptCount: 3,
      targetWeaknesses: ["sign", "write"],
      screenshots,
    });

    expect(result).toMatchObject({
      scenario: "quest_fail",
      pass: true,
      questState: "completed",
      questPredictionStatus: "falsified",
      bossState: "locked",
      masteryStatus: "not_proven",
      nextAction: "support",
      carePlanRevisionWritten: true,
    });
    expect(result.screenshots.launch).toBe("/tmp/launch.png");
    expect(result.failureReasons).toEqual([]);
  });

  it("allows Quest preparation after strong baseline while Boss remains locked", () => {
    const result = evaluateQuestBossGateScenario({
      scenario: "baseline_pass_quest_ready",
      baselineAccuracy: 0.91,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      targetWeaknesses: [],
      screenshots,
    });

    expect(result).toMatchObject({
      scenario: "baseline_pass_quest_ready",
      pass: true,
      questState: "available",
      questPredictionStatus: "missing",
      bossState: "locked",
      masteryStatus: "not_proven",
      nextAction: "quest",
      carePlanRevisionWritten: false,
    });
    expect(result.failureReasons).toEqual([]);
  });

  it("rejects Quest readiness when the baseline is too weak", () => {
    const result = evaluateQuestBossGateScenario({
      scenario: "baseline_pass_quest_ready",
      baselineAccuracy: 0.6,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      targetWeaknesses: ["write"],
      screenshots,
    });

    expect(result.pass).toBe(false);
    expect(result.questState).toBe("locked");
    expect(result.bossState).toBe("locked");
    expect(result.failureReasons).toContain("baseline_pass_requires_available_quest");
  });

  it("marks mastery supported only after strong baseline, supported Quest, and passed Boss", () => {
    const result = evaluateQuestBossGateScenario({
      scenario: "mastery_pass",
      baselineAccuracy: 0.93,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      questAccuracy: 0.9,
      questAttemptCount: 3,
      bossAccuracy: 0.9,
      bossAttemptCount: 3,
      targetWeaknesses: [],
      screenshots,
    });

    expect(result).toMatchObject({
      scenario: "mastery_pass",
      pass: true,
      questState: "completed",
      questPredictionStatus: "supported",
      bossState: "completed",
      masteryStatus: "supported",
      nextAction: "complete",
      carePlanRevisionWritten: false,
    });
    expect(result.failureReasons).toEqual([]);
  });

  it("reports failure when a scenario violates its own gate expectation", () => {
    const result = evaluateQuestBossGateScenario({
      scenario: "mastery_pass",
      baselineAccuracy: 0.93,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      questAccuracy: 0.9,
      questAttemptCount: 3,
      bossAccuracy: 0.55,
      bossAttemptCount: 3,
      targetWeaknesses: ["know"],
      screenshots,
    });

    expect(result.pass).toBe(false);
    expect(result.masteryStatus).toBe("not_proven");
    expect(result.failureReasons).toContain("mastery_pass_requires_supported_mastery");
  });

  it("builds a report with all required deterministic scenarios", () => {
    const report = buildQuestBossGateDemoReport({
      childId: "reina",
      homeworkId: "hw-demo",
      outputDir: "/tmp/demo",
      createdAt: "2026-06-24T00:00:00.000Z",
      scenarios: [
        evaluateQuestBossGateScenario({
          scenario: "baseline_fail",
          baselineAccuracy: 0.5,
          baselineAttemptCount: 3,
          baselineTargetsMeasured: 3,
          targetWeaknesses: ["write"],
          screenshots,
        }),
        evaluateQuestBossGateScenario({
          scenario: "baseline_pass_quest_ready",
          baselineAccuracy: 0.91,
          baselineAttemptCount: 6,
          baselineTargetsMeasured: 3,
          targetWeaknesses: [],
          screenshots,
        }),
        evaluateQuestBossGateScenario({
          scenario: "quest_fail",
          baselineAccuracy: 0.92,
          baselineAttemptCount: 6,
          baselineTargetsMeasured: 3,
          questAccuracy: 0.58,
          questAttemptCount: 3,
          targetWeaknesses: ["sign"],
          screenshots,
        }),
        evaluateQuestBossGateScenario({
          scenario: "mastery_pass",
          baselineAccuracy: 0.93,
          baselineAttemptCount: 6,
          baselineTargetsMeasured: 3,
          questAccuracy: 0.9,
          questAttemptCount: 3,
          bossAccuracy: 0.9,
          bossAttemptCount: 3,
          targetWeaknesses: [],
          screenshots,
        }),
      ],
    });

    expect(report.overallPass).toBe(true);
    expect(report.scenarioCount).toBe(4);
    expect(report.passCount).toBe(4);
    expect(report.scenarios.map((scenario) => scenario.scenario)).toEqual([
      "baseline_fail",
      "baseline_pass_quest_ready",
      "quest_fail",
      "mastery_pass",
    ]);
  });
});
