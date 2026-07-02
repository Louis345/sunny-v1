export type QuestBossGateScenarioName =
  | "baseline_fail"
  | "baseline_pass_quest_ready"
  | "quest_fail"
  | "mastery_pass";
export type QuestBossGateNodeState = "locked" | "available" | "completed";
export type QuestBossGatePredictionStatus = "supported" | "falsified" | "missing";
export type QuestBossGateMasteryStatus = "not_ready" | "not_proven" | "supported";
export type QuestBossGateNextAction = "support" | "quest" | "boss" | "complete";

export type QuestBossGateDemoScreenshotSet = {
  board: string | null;
  lockedState: string | null;
  modal: string | null;
  launch: string | null;
  completion: string | null;
};

export type QuestBossGateScenarioInput = {
  scenario: QuestBossGateScenarioName;
  baselineAccuracy: number;
  baselineAttemptCount: number;
  baselineTargetsMeasured: number;
  questAccuracy?: number | null;
  questAttemptCount?: number;
  bossAccuracy?: number | null;
  bossAttemptCount?: number;
  targetWeaknesses: string[];
  screenshots?: Partial<QuestBossGateDemoScreenshotSet>;
};

export type QuestBossGateScenarioResult = {
  scenario: QuestBossGateScenarioName;
  pass: boolean;
  baselineAccuracy: number;
  baselineAttemptCount: number;
  baselineTargetsMeasured: number;
  questState: QuestBossGateNodeState;
  questAccuracy: number | null;
  questPredictionStatus: QuestBossGatePredictionStatus;
  bossState: QuestBossGateNodeState;
  bossAccuracy: number | null;
  masteryStatus: QuestBossGateMasteryStatus;
  nextAction: QuestBossGateNextAction;
  targetWeaknesses: string[];
  carePlanRevisionWritten: boolean;
  screenshots: QuestBossGateDemoScreenshotSet;
  failureReasons: string[];
};

export type QuestBossGateDemoReport = {
  createdAt: string;
  childId: string;
  homeworkId: string;
  outputDir: string;
  scenarioCount: number;
  passCount: number;
  overallPass: boolean;
  scenarios: QuestBossGateScenarioResult[];
  realBoard?: {
    childId: string;
    questState: QuestBossGateNodeState;
    bossState: QuestBossGateNodeState;
    screenshotPath: string | null;
    readOnly: true;
  };
};

function gateScreenshotSet(input?: Partial<QuestBossGateDemoScreenshotSet>): QuestBossGateDemoScreenshotSet {
  return {
    board: input?.board ?? null,
    lockedState: input?.lockedState ?? null,
    modal: input?.modal ?? null,
    launch: input?.launch ?? null,
    completion: input?.completion ?? null,
  };
}

function clampMetric(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function isBaselineReady(input: QuestBossGateScenarioInput): boolean {
  return input.baselineAccuracy >= 0.8 &&
    input.baselineAttemptCount >= 3 &&
    input.baselineTargetsMeasured > 0;
}

function predictionStatus(accuracy: number | null): QuestBossGatePredictionStatus {
  if (accuracy == null) return "missing";
  return accuracy >= 0.8 ? "supported" : "falsified";
}

function baseScenarioResult(input: QuestBossGateScenarioInput): Omit<QuestBossGateScenarioResult, "pass" | "failureReasons"> {
  const baselineReady = isBaselineReady(input);
  const questAccuracy = clampMetric(input.questAccuracy);
  const bossAccuracy = clampMetric(input.bossAccuracy);
  const questStatus = predictionStatus(questAccuracy);
  const bossSupported = bossAccuracy != null && bossAccuracy >= 0.85;

  if (input.scenario === "baseline_fail") {
    return {
      scenario: input.scenario,
      baselineAccuracy: clampMetric(input.baselineAccuracy) ?? 0,
      baselineAttemptCount: input.baselineAttemptCount,
      baselineTargetsMeasured: input.baselineTargetsMeasured,
      questState: "locked",
      questAccuracy: null,
      questPredictionStatus: "missing",
      bossState: "locked",
      bossAccuracy: null,
      masteryStatus: "not_ready",
      nextAction: "support",
      targetWeaknesses: input.targetWeaknesses,
      carePlanRevisionWritten: true,
      screenshots: {
        ...gateScreenshotSet(input.screenshots),
        launch: null,
        completion: null,
      },
    };
  }

  if (input.scenario === "baseline_pass_quest_ready") {
    return {
      scenario: input.scenario,
      baselineAccuracy: clampMetric(input.baselineAccuracy) ?? 0,
      baselineAttemptCount: input.baselineAttemptCount,
      baselineTargetsMeasured: input.baselineTargetsMeasured,
      questState: baselineReady ? "available" : "locked",
      questAccuracy: null,
      questPredictionStatus: "missing",
      bossState: "locked",
      bossAccuracy: null,
      masteryStatus: baselineReady ? "not_proven" : "not_ready",
      nextAction: baselineReady ? "quest" : "support",
      targetWeaknesses: input.targetWeaknesses,
      carePlanRevisionWritten: !baselineReady,
      screenshots: {
        ...gateScreenshotSet(input.screenshots),
        completion: null,
      },
    };
  }

  if (input.scenario === "quest_fail") {
    return {
      scenario: input.scenario,
      baselineAccuracy: clampMetric(input.baselineAccuracy) ?? 0,
      baselineAttemptCount: input.baselineAttemptCount,
      baselineTargetsMeasured: input.baselineTargetsMeasured,
      questState: baselineReady ? "completed" : "locked",
      questAccuracy,
      questPredictionStatus: questStatus,
      bossState: "locked",
      bossAccuracy: null,
      masteryStatus: "not_proven",
      nextAction: "support",
      targetWeaknesses: input.targetWeaknesses,
      carePlanRevisionWritten: true,
      screenshots: gateScreenshotSet(input.screenshots),
    };
  }

  return {
    scenario: input.scenario,
    baselineAccuracy: clampMetric(input.baselineAccuracy) ?? 0,
    baselineAttemptCount: input.baselineAttemptCount,
    baselineTargetsMeasured: input.baselineTargetsMeasured,
    questState: baselineReady ? "completed" : "locked",
    questAccuracy,
    questPredictionStatus: questStatus,
    bossState: questStatus === "supported" ? "completed" : "locked",
    bossAccuracy,
    masteryStatus: bossSupported ? "supported" : "not_proven",
    nextAction: bossSupported ? "complete" : "support",
    targetWeaknesses: input.targetWeaknesses,
    carePlanRevisionWritten: !bossSupported,
    screenshots: gateScreenshotSet(input.screenshots),
  };
}

function scenarioFailureReasons(result: Omit<QuestBossGateScenarioResult, "pass" | "failureReasons">): string[] {
  const failures: string[] = [];
  if (result.scenario === "baseline_fail") {
    if (result.questState !== "locked") failures.push("baseline_fail_requires_locked_quest");
    if (result.bossState !== "locked") failures.push("baseline_fail_requires_locked_boss");
    if (result.masteryStatus !== "not_ready") failures.push("baseline_fail_requires_not_ready");
    if (result.nextAction !== "support") failures.push("baseline_fail_requires_support_route");
  }
  if (result.scenario === "baseline_pass_quest_ready") {
    if (result.questState !== "available") failures.push("baseline_pass_requires_available_quest");
    if (result.questPredictionStatus !== "missing") failures.push("baseline_pass_requires_missing_quest_prediction");
    if (result.bossState !== "locked") failures.push("baseline_pass_requires_locked_boss");
    if (result.masteryStatus !== "not_proven") failures.push("baseline_pass_requires_not_proven_mastery");
    if (result.nextAction !== "quest") failures.push("baseline_pass_requires_quest_next_action");
    if (result.carePlanRevisionWritten) failures.push("baseline_pass_should_not_write_revision");
  }
  if (result.scenario === "quest_fail") {
    if (result.questState !== "completed") failures.push("quest_fail_requires_completed_quest");
    if (result.questPredictionStatus !== "falsified") failures.push("quest_fail_requires_falsified_quest");
    if (result.bossState !== "locked") failures.push("quest_fail_requires_locked_boss");
    if (result.masteryStatus !== "not_proven") failures.push("quest_fail_requires_not_proven_mastery");
    if (!result.carePlanRevisionWritten) failures.push("quest_fail_requires_care_plan_revision");
  }
  if (result.scenario === "mastery_pass") {
    if (result.questPredictionStatus !== "supported") failures.push("mastery_pass_requires_supported_quest");
    if (result.bossState !== "completed") failures.push("mastery_pass_requires_completed_boss");
    if (result.masteryStatus !== "supported") failures.push("mastery_pass_requires_supported_mastery");
    if (result.nextAction !== "complete") failures.push("mastery_pass_requires_complete_next_action");
  }
  return failures;
}

export function evaluateQuestBossGateScenario(input: QuestBossGateScenarioInput): QuestBossGateScenarioResult {
  const base = baseScenarioResult(input);
  const failureReasons = scenarioFailureReasons(base);
  return {
    ...base,
    pass: failureReasons.length === 0,
    failureReasons,
  };
}

export function buildQuestBossGateDemoReport(input: {
  createdAt: string;
  childId: string;
  homeworkId: string;
  outputDir: string;
  scenarios: QuestBossGateScenarioResult[];
  realBoard?: QuestBossGateDemoReport["realBoard"];
}): QuestBossGateDemoReport {
  const passCount = input.scenarios.filter((scenario) => scenario.pass).length;
  return {
    createdAt: input.createdAt,
    childId: input.childId,
    homeworkId: input.homeworkId,
    outputDir: input.outputDir,
    scenarioCount: input.scenarios.length,
    passCount,
    overallPass: passCount === input.scenarios.length,
    scenarios: input.scenarios,
    ...(input.realBoard ? { realBoard: input.realBoard } : {}),
  };
}
