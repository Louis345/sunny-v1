import fs from "fs";
import path from "path";
import type { NodeConfig } from "../shared/adventureTypes";
import {
  buildActivityIntent,
  selectTargetsForIntent,
  type ActivityIntent,
  type ActivityIntentEvidence,
  type TargetSelectorDecision,
} from "./activityIntent";

export type EvidenceTier =
  | "practice"
  | "clean_recall"
  | "mastery_candidate"
  | "calibration_required";

export type CertificationCheckStatus = "pass" | "fail" | "not_applicable";

export type CertificationIssue = {
  severity: "info" | "warning" | "high";
  code: string;
  message: string;
};

export type CertificationLevelStatus = "pass" | "fail" | "blocked";

export type SpellingCertificationGame = {
  gameId: string;
  displayName: string;
  sourcePath: string;
  manualPreviewUrl: string;
  status: "pass" | "fail" | "blocked";
  allowedInRealChildSession: boolean;
  masteryEligible: boolean;
  evidenceTier: EvidenceTier;
  referenceImplementation: boolean;
  role: "core" | "legacy" | "reward" | "generated";
  checks: {
    debugTrace: CertificationCheckStatus;
    chartEvidence: CertificationCheckStatus;
    liveBoardTruth: CertificationCheckStatus;
    vitalSigns: CertificationCheckStatus;
    evidenceTier: CertificationCheckStatus;
    hiddenAnswerSafety?: CertificationCheckStatus;
  };
  levels: {
    runtime: CertificationLevelStatus;
    intent: CertificationLevelStatus;
    adaptation: CertificationLevelStatus;
  };
  activityIntent?: ActivityIntent;
  targetSelectorDecision?: TargetSelectorDecision;
  issues: CertificationIssue[];
};

export type SpellingCertificationReport = {
  reportVersion: 1;
  childId: string;
  generatedAt: string;
  sessionDir: string;
  games: SpellingCertificationGame[];
  highSeverityIssues: CertificationIssue[];
  summary: {
    totalGames: number;
    passed: number;
    failed: number;
    blocked: number;
    allowedInRealChildSession: number;
    levels: {
      runtime: Record<CertificationLevelStatus, number>;
      intent: Record<CertificationLevelStatus, number>;
      adaptation: Record<CertificationLevelStatus, number>;
    };
  };
  humanGateQuestions: string[];
};

type GameDefinition = {
  gameId: string;
  displayName: string;
  sourceRelPath: string;
  manualPath: string;
  role: "core" | "legacy" | "reward" | "generated";
  evidenceTier: EvidenceTier;
  masteryEligible: boolean;
  referenceImplementation?: boolean;
  hiddenAnswerGame?: boolean;
  requiresNormalizedTargets?: boolean;
  blockIfMissingNormalizedTargets?: boolean;
};

const HUMAN_GATE_QUESTIONS = [
  "What was the child shown?",
  "What did the child do?",
  "What did Sunny record?",
  "What will the psychologist learn?",
  "What should adapt next time?",
  "Did Elli know the exact board state without inventing?",
];

export const SPELLING_CERTIFICATION_GAMES: GameDefinition[] = [
  {
    gameId: "spell-check",
    displayName: "Spell Check",
    sourceRelPath: "web/public/games/spell-check.html",
    manualPath: "/games/spell-check.html",
    role: "core",
    evidenceTier: "practice",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "word-radar",
    displayName: "Word Radar",
    sourceRelPath: "web/src/components/WordRadar.tsx",
    manualPath: "/storybook/word-radar",
    role: "core",
    evidenceTier: "clean_recall",
    masteryEligible: true,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "pronunciation",
    displayName: "Pronunciation",
    sourceRelPath: "web/src/components/PronunciationGameCanvas.tsx",
    manualPath: "/storybook/pronunciation",
    role: "core",
    evidenceTier: "practice",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "monster-stampede",
    displayName: "Monster Stampede",
    sourceRelPath: "web/public/games/monster-stampede.html",
    manualPath: "/games/monster-stampede.html",
    role: "core",
    evidenceTier: "practice",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "letter-rush",
    displayName: "Letter Rush",
    sourceRelPath: "web/public/games/letter-rush.html",
    manualPath: "/games/letter-rush.html",
    role: "core",
    evidenceTier: "mastery_candidate",
    masteryEligible: true,
    referenceImplementation: true,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "word-builder",
    displayName: "Word Builder",
    sourceRelPath: "web/public/games/word-builder.html",
    manualPath: "/games/word-builder.html",
    role: "legacy",
    evidenceTier: "practice",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "wordle",
    displayName: "Wordle",
    sourceRelPath: "web/public/games/wordle.html",
    manualPath: "/games/wordle.html",
    role: "legacy",
    evidenceTier: "practice",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "wheel-of-fortune",
    displayName: "Wheel of Fortune",
    sourceRelPath: "web/public/games/WheelOfFortune.html",
    manualPath: "/games/WheelOfFortune.html",
    role: "reward",
    evidenceTier: "practice",
    masteryEligible: false,
    hiddenAnswerGame: true,
  },
  {
    gameId: "speed-catcher",
    displayName: "Speed Catcher",
    sourceRelPath: "web/public/games/speed-catcher.html",
    manualPath: "/games/speed-catcher.html",
    role: "legacy",
    evidenceTier: "practice",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "quest",
    displayName: "Generated Quest",
    sourceRelPath: "src/scripts/generateGame.ts",
    manualPath: "/generated/quest",
    role: "generated",
    evidenceTier: "calibration_required",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
  {
    gameId: "boss",
    displayName: "Generated Boss",
    sourceRelPath: "src/scripts/validateGeneratedGame.ts",
    manualPath: "/generated/boss",
    role: "generated",
    evidenceTier: "calibration_required",
    masteryEligible: false,
    requiresNormalizedTargets: true,
    blockIfMissingNormalizedTargets: true,
  },
];

function readSource(rootDir: string, relPath: string): string {
  try {
    return fs.readFileSync(path.join(rootDir, relPath), "utf8");
  } catch {
    return "";
  }
}

function hasAny(source: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

function checkSourceExists(source: string): CertificationCheckStatus {
  return source.trim() ? "pass" : "fail";
}

function checkDebugTrace(source: string): CertificationCheckStatus {
  return hasAny(source, [
    /GameBridge\.reportState/,
    /reportAction\s*\(/,
    /flowEvents\.reportState/,
    /emitPronunciationGameState/,
    /postActivityEvent/,
    /sendMessage\(["']game_state_update["']/,
  ])
    ? "pass"
    : "fail";
}

function checkChartEvidence(source: string, definition: GameDefinition): CertificationCheckStatus {
  if (definition.role === "reward") {
    return hasAny(source, [/wordsCorrect/, /wordsStruggled/, /flaggedWords/]) ? "pass" : "fail";
  }
  if (definition.role === "generated") {
    return hasAny(source, [/fireAttemptEvent/, /targetResults/, /sendNodeComplete/]) ? "pass" : "fail";
  }
  return hasAny(source, [/targetResults/, /fireAttemptEvent/]) ? "pass" : "fail";
}

function checkLiveBoardTruth(source: string, definition: GameDefinition): CertificationCheckStatus {
  if (definition.role === "generated") return "pass";
  const reportsState = checkDebugTrace(source) === "pass";
  const exposesCurrentState = hasAny(source, [
    /currentTarget/,
    /currentWord/,
    /answerVisibility/,
    /boardState/,
    /itemIndex/,
  ]);
  return reportsState && exposesCurrentState ? "pass" : "fail";
}

function checkVitalSigns(source: string): CertificationCheckStatus {
  return hasAny(source, [
    /vitalSigns/,
    /flowState/,
    /timeSpent_ms/,
    /responseTime_ms/,
    /activeDuration_ms/,
  ])
    ? "pass"
    : "fail";
}

function checkEvidenceTier(source: string, definition: GameDefinition): CertificationCheckStatus {
  if (definition.role === "generated") return "pass";
  return source.includes("evidenceTier") || definition.role === "reward" ? "pass" : "fail";
}

function checkHiddenAnswerSafety(source: string, definition: GameDefinition): CertificationCheckStatus | undefined {
  if (!definition.hiddenAnswerGame) return undefined;
  const declaresVisibility = source.includes("answerVisibility") && source.includes("hidden");
  const usesBoardState = source.includes("boardState");
  return declaresVisibility && usesBoardState ? "pass" : "fail";
}

function addIssue(
  issues: CertificationIssue[],
  severity: CertificationIssue["severity"],
  code: string,
  message: string,
): void {
  issues.push({ severity, code, message });
}

function previewUrl(childId: string, manualPath: string): string {
  const separator = manualPath.includes("?") ? "&" : "?";
  return `http://localhost:3001${manualPath}${separator}childId=${encodeURIComponent(childId)}&certification=1`;
}

function sampleWordsForGame(definition: GameDefinition): string[] {
  if (definition.gameId === "wheel-of-fortune") return ["random", "ahead", "again"];
  if (definition.gameId === "pronunciation") return ["the", "to", "and", "ahead"];
  if (definition.gameId === "quest" || definition.gameId === "boss") return ["ahead", "again", "away"];
  return ["ahead", "again", "above"];
}

function sampleEvidenceForGame(definition: GameDefinition): ActivityIntentEvidence {
  const base: ActivityIntentEvidence = {
    recentMisses: ["ahead"],
    fragileTargets: ["again"],
    scaffoldedTargets: ["ahead"],
    pronunciationConfusions: ["ahead"],
    sm2DueWords: ["above"],
    homeworkWords: ["ahead", "again", "above", "away"],
    highFrequencyWords: ["the", "to", "and"],
    recentlyUsedByActivity: {
      "wheel-of-fortune": ["again"],
    },
  };
  if (definition.gameId === "pronunciation") {
    return {
      ...base,
      recentMisses: ["ahead"],
      highFrequencyWords: ["the", "to", "and"],
    };
  }
  return base;
}

function sampleNodeForGame(definition: GameDefinition): NodeConfig {
  return {
    id: `cert-${definition.gameId}`,
    type: definition.gameId as NodeConfig["type"],
    words: sampleWordsForGame(definition),
    difficulty: 1,
    isLocked: false,
    isCompleted: false,
    isGoal: false,
  };
}

function runtimeLevel(status: SpellingCertificationGame["status"]): CertificationLevelStatus {
  return status === "blocked" ? "blocked" : status === "pass" ? "pass" : "fail";
}

function certifyIntentLevel(intent: ActivityIntent): CertificationLevelStatus {
  const hasCriteria =
    intent.successCriteria.length > 0 &&
    intent.reviseCriteria.length > 0 &&
    intent.falsifyCriteria.length > 0;
  return intent.purpose &&
    intent.targetSelector &&
    intent.selectedTargets.length > 0 &&
    intent.diagnosticQuestion &&
    intent.expectedEvidence.length > 0 &&
    hasCriteria
    ? "pass"
    : "fail";
}

function certifyAdaptationLevel(decision: TargetSelectorDecision): CertificationLevelStatus {
  return decision.selectedTargets.length > 0 &&
    decision.targetReasons.length > 0 &&
    decision.traceSummary.trim().length > 0
    ? "pass"
    : "fail";
}

function certifyGame(rootDir: string, childId: string, definition: GameDefinition): SpellingCertificationGame {
  const source = readSource(rootDir, definition.sourceRelPath);
  const sourceExists = checkSourceExists(source);
  const debugTrace = sourceExists === "pass"
    ? definition.role === "generated" && hasAny(source, [/sendNodeComplete/, /fireAttemptEvent/])
      ? "pass"
      : checkDebugTrace(source)
    : "fail";
  const chartEvidence = sourceExists === "pass" ? checkChartEvidence(source, definition) : "fail";
  const liveBoardTruth = sourceExists === "pass" ? checkLiveBoardTruth(source, definition) : "fail";
  const vitalSigns = sourceExists === "pass"
    ? definition.role === "generated"
      ? "pass"
      : checkVitalSigns(source)
    : "fail";
  const evidenceTier = sourceExists === "pass" ? checkEvidenceTier(source, definition) : "fail";
  const hiddenAnswerSafety = checkHiddenAnswerSafety(source, definition);
  const issues: CertificationIssue[] = [];

  if (sourceExists === "fail") {
    addIssue(issues, "high", "source_missing", `${definition.sourceRelPath} could not be read.`);
  }
  if (debugTrace === "fail") {
    addIssue(issues, "high", "missing_debug_trace", "Game does not emit enough structured game state for post-session AI audit.");
  }
  if (chartEvidence === "fail") {
    addIssue(issues, "high", "missing_chart_evidence", "Game does not emit normalized per-target evidence for the psychologist/planner.");
  }
  if (liveBoardTruth === "fail") {
    addIssue(issues, "high", "missing_live_board_truth", "Game does not expose a tiny current board state for Elli.");
  }
  if (vitalSigns === "fail") {
    addIssue(issues, "warning", "missing_vital_signs", "Game does not expose timing/flow/frustration signals.");
  }
  if (evidenceTier === "fail") {
    addIssue(issues, "warning", "missing_evidence_tier", "Game does not declare whether evidence is practice, clean recall, mastery candidate, or calibration required.");
  }
  if (hiddenAnswerSafety === "fail") {
    addIssue(issues, "high", "hidden_answer_contract_missing", "Hidden-answer game does not clearly expose answerVisibility and safe board state.");
  }

  const sampleNode = sampleNodeForGame(definition);
  const evidence = sampleEvidenceForGame(definition);
  const activityIntent = buildActivityIntent({
    childId,
    node: sampleNode,
    carePlanHypothesis:
      "Certification hypothesis: spelling activities must test chart evidence, not launch as entertainment.",
    evidence,
    now: new Date("2026-05-16T19:00:00.000Z"),
  });
  const targetSelectorDecision = selectTargetsForIntent({
    childId,
    node: sampleNode,
    targetSelector: activityIntent.targetSelector,
    evidence,
    maxTargets: definition.gameId === "wheel-of-fortune" ? 1 : undefined,
    now: new Date("2026-05-16T19:00:00.000Z"),
  });
  const intentLevel = certifyIntentLevel(activityIntent);
  const adaptationLevel = certifyAdaptationLevel(targetSelectorDecision);
  if (intentLevel !== "pass") {
    addIssue(issues, "high", "missing_activity_intent", "Game cannot prove its learning purpose, selector, and criteria before launch.");
  }
  if (adaptationLevel !== "pass") {
    addIssue(issues, "high", "missing_adaptation_trace", "Game cannot explain how selected targets should affect the next plan.");
  }

  const highIssues = issues.some((issue) => issue.severity === "high");
  const shouldBlock =
    highIssues &&
    (definition.blockIfMissingNormalizedTargets ||
      chartEvidence === "fail" ||
      liveBoardTruth === "fail" ||
      hiddenAnswerSafety === "fail" ||
      intentLevel !== "pass" ||
      adaptationLevel !== "pass");
  const status: SpellingCertificationGame["status"] = shouldBlock
    ? "blocked"
    : highIssues || vitalSigns === "fail" || evidenceTier === "fail"
      ? "fail"
      : "pass";
  const levels = {
    runtime: runtimeLevel(status),
    intent: status === "blocked" && intentLevel !== "pass" ? "blocked" as const : intentLevel,
    adaptation:
      status === "blocked" && adaptationLevel !== "pass"
        ? "blocked" as const
        : adaptationLevel,
  };
  const allowedInRealChildSession =
    levels.runtime === "pass" &&
    levels.intent === "pass" &&
    levels.adaptation === "pass";

  return {
    gameId: definition.gameId,
    displayName: definition.displayName,
    sourcePath: path.join(rootDir, definition.sourceRelPath),
    manualPreviewUrl: previewUrl(childId, definition.manualPath),
    status,
    allowedInRealChildSession,
    masteryEligible: definition.masteryEligible && allowedInRealChildSession,
    evidenceTier: definition.evidenceTier,
    referenceImplementation: definition.referenceImplementation === true,
    role: definition.role,
    checks: {
      debugTrace,
      chartEvidence,
      liveBoardTruth,
      vitalSigns,
      evidenceTier,
      ...(hiddenAnswerSafety ? { hiddenAnswerSafety } : {}),
    },
    levels,
    activityIntent,
    targetSelectorDecision,
    issues,
  };
}

function levelCounts(games: SpellingCertificationGame[], level: keyof SpellingCertificationGame["levels"]): Record<CertificationLevelStatus, number> {
  return {
    pass: games.filter((game) => game.levels[level] === "pass").length,
    fail: games.filter((game) => game.levels[level] === "fail").length,
    blocked: games.filter((game) => game.levels[level] === "blocked").length,
  };
}

export function certifySpellingAdaptation(input: {
  childId: string;
  rootDir?: string;
  generatedAt?: string;
  sessionDir?: string;
}): SpellingCertificationReport {
  const rootDir = input.rootDir ?? process.cwd();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sessionDir =
    input.sessionDir ??
    path.join(rootDir, ".sunny-sandbox", "certification", "spelling", input.childId);
  const games = SPELLING_CERTIFICATION_GAMES.map((definition) =>
    certifyGame(rootDir, input.childId, definition),
  );
  const highSeverityIssues = games.flatMap((game) =>
    game.issues
      .filter((issue) => issue.severity === "high")
      .map((issue) => ({
        ...issue,
        message: `${game.gameId}: ${issue.message}`,
      })),
  );
  return {
    reportVersion: 1,
    childId: input.childId,
    generatedAt,
    sessionDir,
    games,
    highSeverityIssues,
    summary: {
      totalGames: games.length,
      passed: games.filter((game) => game.status === "pass").length,
      failed: games.filter((game) => game.status === "fail").length,
      blocked: games.filter((game) => game.status === "blocked").length,
      allowedInRealChildSession: games.filter((game) => game.allowedInRealChildSession).length,
      levels: {
        runtime: levelCounts(games, "runtime"),
        intent: levelCounts(games, "intent"),
        adaptation: levelCounts(games, "adaptation"),
      },
    },
    humanGateQuestions: HUMAN_GATE_QUESTIONS,
  };
}

function checkMark(status: CertificationCheckStatus): string {
  if (status === "pass") return "pass";
  if (status === "not_applicable") return "n/a";
  return "fail";
}

export function renderSpellingCertificationMarkdown(report: SpellingCertificationReport): string {
  const lines = [
    "# Sunny Spelling Adaptation Certification",
    "",
    `childId: ${report.childId}`,
    `generatedAt: ${report.generatedAt}`,
    `sessionDir: ${report.sessionDir}`,
    "",
    "## Summary",
    `- total games: ${report.summary.totalGames}`,
    `- passed: ${report.summary.passed}`,
    `- failed: ${report.summary.failed}`,
    `- blocked: ${report.summary.blocked}`,
    `- Allowed in real child session: ${report.summary.allowedInRealChildSession}`,
    `- Level 1 Runtime: ${report.summary.levels.runtime.pass} pass / ${report.summary.levels.runtime.fail} fail / ${report.summary.levels.runtime.blocked} blocked`,
    `- Level 2 Intent: ${report.summary.levels.intent.pass} pass / ${report.summary.levels.intent.fail} fail / ${report.summary.levels.intent.blocked} blocked`,
    `- Level 3 Adaptation: ${report.summary.levels.adaptation.pass} pass / ${report.summary.levels.adaptation.fail} fail / ${report.summary.levels.adaptation.blocked} blocked`,
    "",
    "## Human Gate Questions",
    ...report.humanGateQuestions.map((question) => `- ${question}`),
    "",
    "## Game Certification",
    "| Game | Status | Allowed in real child session | Level 1 Runtime | Level 2 Intent | Level 3 Adaptation | Evidence tier | Mastery eligible | Debug trace | Psychologist evidence | Live board truth | Vitals | Hidden answer |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const game of report.games) {
    lines.push(
      `| ${game.displayName} | ${game.status} | ${game.allowedInRealChildSession ? "yes" : "no"} | ${game.levels.runtime} | ${game.levels.intent} | ${game.levels.adaptation} | ${game.evidenceTier} | ${game.masteryEligible ? "yes" : "no"} | ${checkMark(game.checks.debugTrace)} | ${checkMark(game.checks.chartEvidence)} | ${checkMark(game.checks.liveBoardTruth)} | ${checkMark(game.checks.vitalSigns)} | ${checkMark(game.checks.hiddenAnswerSafety ?? "not_applicable")} |`,
    );
  }

  lines.push("", "## High Severity Issues");
  if (report.highSeverityIssues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of report.highSeverityIssues) {
      lines.push(`- [${issue.code}] ${issue.message}`);
    }
  }

  lines.push("", "## Manual Preview Links");
  for (const game of report.games) {
    lines.push(`- ${game.displayName}: ${game.manualPreviewUrl}`);
  }

  lines.push("", "## Game Details");
  for (const game of report.games) {
    lines.push("", `### ${game.displayName}`, `- source: ${game.sourcePath}`);
    lines.push(`- reference implementation: ${game.referenceImplementation ? "yes" : "no"}`);
    lines.push(`- levels: runtime=${game.levels.runtime}, intent=${game.levels.intent}, adaptation=${game.levels.adaptation}`);
    if (game.activityIntent) {
      lines.push(`- intent: ${game.activityIntent.purpose}`);
      lines.push(`- selector: ${game.activityIntent.targetSelector}`);
      lines.push(`- diagnostic question: ${game.activityIntent.diagnosticQuestion}`);
      lines.push(`- psychologist learns: ${game.activityIntent.expectedEvidence.join(", ")}`);
    }
    if (game.targetSelectorDecision) {
      lines.push(`- target selector trace: ${game.targetSelectorDecision.traceSummary}`);
    }
    if (game.issues.length === 0) {
      lines.push("- issues: none");
    } else {
      for (const issue of game.issues) {
        lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}
