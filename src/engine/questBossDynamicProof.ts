export type QuestBossDynamicProofScenario =
  | "paid_quest_generation"
  | "boss_blocked_before_quest"
  | "paid_boss_generation"
  | "bad_artifact_rejected";

export type QuestBossDynamicProofOutcome = "generated" | "blocked" | "rejected" | "failed";

export type QuestBossDynamicProofScenarioInput = {
  scenario: QuestBossDynamicProofScenario;
  expectedOutcome: "generated" | "blocked" | "rejected";
  stage: "quest" | "boss";
  model: string;
  contentId: string | null;
  filename: string | null;
  generatedPath: string | null;
  isFallback: boolean;
  staticValidationPassed: boolean;
  runtimeValidationPassed: boolean;
  runtimeEngine: "playwright" | null;
  screenshotPaths: string[];
  targetWordCount: number;
  attemptedTargetCount: number;
  completionEventCount: number;
  completionAccuracy: number | null;
  failureReasons: string[];
  evidenceUsed: string[];
  theoryId: string | null;
  bossRequiredQuestEvidence: boolean;
};

export type QuestBossDynamicProofScenarioResult = QuestBossDynamicProofScenarioInput & {
  actualOutcome: QuestBossDynamicProofOutcome;
  pass: boolean;
  failureReasons: string[];
};

export type QuestBossDynamicProofReport = {
  createdAt: string;
  childId: string;
  homeworkId: string;
  model: string;
  outputDir: string;
  scenarioCount: number;
  passCount: number;
  overallPass: boolean;
  screenshotPaths: string[];
  scenarios: QuestBossDynamicProofScenarioResult[];
};

function actualOutcome(input: QuestBossDynamicProofScenarioInput): QuestBossDynamicProofOutcome {
  if (input.contentId && input.filename && input.generatedPath) return "generated";
  const joinedFailures = input.failureReasons.join(" ").toLowerCase();
  if (joinedFailures.includes("quest_measurement")) return "blocked";
  if (!input.staticValidationPassed || joinedFailures.includes("validation")) return "rejected";
  return "failed";
}

function generatedFailures(input: QuestBossDynamicProofScenarioInput): string[] {
  const failures: string[] = [];
  if (input.isFallback) failures.push("generated_artifact_used_fallback");
  if (!input.staticValidationPassed) failures.push("static_validation_failed");
  if (!input.runtimeValidationPassed) failures.push("runtime_validation_missing");
  if (input.runtimeEngine !== "playwright") failures.push("runtime_engine_not_playwright");
  if (input.screenshotPaths.length === 0) failures.push("runtime_screenshot_missing");
  if (input.attemptedTargetCount < input.targetWordCount) failures.push("attempted_targets_below_target_count");
  if (input.completionEventCount < 1) failures.push("completion_event_missing");
  return failures;
}

export function evaluateQuestBossDynamicProofScenario(
  input: QuestBossDynamicProofScenarioInput,
): QuestBossDynamicProofScenarioResult {
  const outcome = actualOutcome(input);
  const reportedReasons = [...input.failureReasons];
  const proofFailures: string[] = [];

  if (outcome !== input.expectedOutcome) {
    proofFailures.push(`expected_${input.expectedOutcome}_got_${outcome}`);
  }
  if (input.expectedOutcome === "generated") {
    proofFailures.push(...generatedFailures(input));
  }
  if (input.expectedOutcome === "blocked") {
    if (!input.bossRequiredQuestEvidence) proofFailures.push("boss_block_did_not_require_quest_evidence");
    if (!input.failureReasons.some((reason) => reason.includes("quest_measurement"))) {
      proofFailures.push("boss_block_missing_quest_measurement_reason");
    }
  }
  if (input.expectedOutcome === "rejected") {
    if (input.staticValidationPassed && input.runtimeValidationPassed) {
      proofFailures.push("bad_artifact_was_not_rejected");
    }
  }

  const uniqueFailures = [...new Set([...reportedReasons, ...proofFailures])];
  return {
    ...input,
    actualOutcome: outcome,
    pass: proofFailures.length === 0,
    failureReasons: uniqueFailures,
  };
}

export function buildQuestBossDynamicProofReport(input: {
  createdAt: string;
  childId: string;
  homeworkId: string;
  model: string;
  outputDir: string;
  scenarios: QuestBossDynamicProofScenarioResult[];
}): QuestBossDynamicProofReport {
  const passCount = input.scenarios.filter((scenario) => scenario.pass).length;
  return {
    createdAt: input.createdAt,
    childId: input.childId,
    homeworkId: input.homeworkId,
    model: input.model,
    outputDir: input.outputDir,
    scenarioCount: input.scenarios.length,
    passCount,
    overallPass: passCount === input.scenarios.length,
    screenshotPaths: input.scenarios.flatMap((scenario) => scenario.screenshotPaths),
    scenarios: input.scenarios,
  };
}
