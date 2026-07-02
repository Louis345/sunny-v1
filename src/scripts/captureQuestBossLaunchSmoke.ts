import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type {
  ActiveSessionPlan,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type {
  HomeworkCycle,
  LearningTheory,
} from "../context/schemas/homeworkCycle";
import {
  generateExperienceArtifactFromChart,
  generateExperienceHtmlWithSonnet,
  type GenerateExperienceHtmlArgs,
  type GeneratedExperienceArtifactResult,
} from "../engine/generatedExperienceArtifact";
import {
  buildQuestBossDynamicProofReport,
  evaluateQuestBossDynamicProofScenario,
  type QuestBossDynamicProofReport,
  type QuestBossDynamicProofScenarioInput,
  type QuestBossDynamicProofScenarioResult,
} from "../engine/questBossDynamicProof";
import {
  buildQuestBossGateDemoReport,
  evaluateQuestBossGateScenario,
  type QuestBossGateDemoReport,
  type QuestBossGateDemoScreenshotSet,
  type QuestBossGateNodeState,
  type QuestBossGateScenarioInput,
  type QuestBossGateScenarioResult,
} from "../engine/questBossGateDemo";
import { resolveSyntheticChildBrowserAvailability } from "../engine/syntheticChildBrowserDriver";
import { SONNET_MODEL } from "./generateGame";
import { initializeLearningProfile } from "../utils/learningProfileIO";

const CHILD_ID = "reina";
const HOMEWORK_ID = "hw-quest-boss-smoke";
const GAME_DATE = "2026-05-27";
const WORDS = ["sign", "know", "write"];
export const PAID_QUEST_BOSS_SMOKE_MODEL = SONNET_MODEL;

function log(action: string, result: string) {
  console.log(`🎮 [quest-boss-smoke] [${action}] ${result}`);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`) || process.argv.includes(`--${name}=true`);
}

function optionValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gateDemoScenarioInputs(): QuestBossGateScenarioInput[] {
  return [
    {
      scenario: "baseline_fail",
      baselineAccuracy: 0.5,
      baselineAttemptCount: 3,
      baselineTargetsMeasured: 3,
      targetWeaknesses: ["write"],
    },
    {
      scenario: "baseline_pass_quest_ready",
      baselineAccuracy: 0.91,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      targetWeaknesses: [],
    },
    {
      scenario: "quest_fail",
      baselineAccuracy: 0.92,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      questAccuracy: 0.58,
      questAttemptCount: 3,
      targetWeaknesses: ["sign", "write"],
    },
    {
      scenario: "mastery_pass",
      baselineAccuracy: 0.93,
      baselineAttemptCount: 6,
      baselineTargetsMeasured: 3,
      questAccuracy: 0.9,
      questAttemptCount: 3,
      bossAccuracy: 0.9,
      bossAttemptCount: 3,
      targetWeaknesses: [],
    },
  ];
}

function gateDemoHtml(
  result: QuestBossGateScenarioResult,
  view: keyof QuestBossGateDemoScreenshotSet,
): string {
  const status = result.pass ? "PASS" : "FAIL";
  const title = `${result.scenario.replace(/_/g, " ")} - ${view}`;
  const weaknesses = result.targetWeaknesses.length ? result.targetWeaknesses.join(", ") : "none";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, sans-serif; background: #102a43; color: #f8fafc; display: grid; place-items: center; }
    main { width: min(980px, calc(100vw - 48px)); border: 3px solid #f8fafc; border-radius: 8px; padding: 28px; background: #1f2937; box-shadow: 0 12px 0 rgba(0,0,0,.35); }
    h1 { margin: 0 0 8px; font-size: 36px; text-transform: capitalize; }
    .badge { display:inline-block; padding: 8px 12px; border-radius: 999px; font-weight: 900; background: ${result.pass ? "#16a34a" : "#dc2626"}; color: white; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 24px; }
    .card { border: 2px solid rgba(255,255,255,.35); border-radius: 8px; padding: 16px; background: rgba(15,23,42,.75); min-height: 120px; }
    .label { color: #facc15; font-size: 13px; font-weight: 800; text-transform: uppercase; }
    .value { font-size: 24px; font-weight: 900; margin-top: 6px; }
    .small { font-size: 15px; line-height: 1.45; color: #dbeafe; }
  </style>
</head>
<body>
  <main data-testid="quest-boss-gate-demo" data-scenario="${escapeHtml(result.scenario)}" data-view="${escapeHtml(view)}">
    <span class="badge">${status}</span>
    <h1>${escapeHtml(title)}</h1>
    <p class="small">Quest and Boss are evidence gates. This frame demonstrates whether the node should be locked, launched, revised, or marked mastery-supported.</p>
    <section class="grid">
      <div class="card"><div class="label">Baseline</div><div class="value">${Math.round(result.baselineAccuracy * 100)}%</div><div class="small">${result.baselineAttemptCount} attempts / ${result.baselineTargetsMeasured} targets</div></div>
      <div class="card"><div class="label">Quest</div><div class="value">${escapeHtml(result.questState)}</div><div class="small">accuracy: ${result.questAccuracy == null ? "n/a" : `${Math.round(result.questAccuracy * 100)}%`} / ${result.questPredictionStatus}</div></div>
      <div class="card"><div class="label">Boss</div><div class="value">${escapeHtml(result.bossState)}</div><div class="small">accuracy: ${result.bossAccuracy == null ? "n/a" : `${Math.round(result.bossAccuracy * 100)}%`}</div></div>
      <div class="card"><div class="label">Mastery</div><div class="value">${escapeHtml(result.masteryStatus)}</div><div class="small">next: ${escapeHtml(result.nextAction)}</div></div>
      <div class="card"><div class="label">Weaknesses</div><div class="value">${escapeHtml(weaknesses)}</div><div class="small">recorded as target-level evidence</div></div>
      <div class="card"><div class="label">Care plan</div><div class="value">${result.carePlanRevisionWritten ? "revised" : "stable"}</div><div class="small">${result.failureReasons.length ? result.failureReasons.join(", ") : "gate expectation satisfied"}</div></div>
    </section>
  </main>
</body>
</html>`;
}

async function captureGateDemoScreenshots(
  outputDir: string,
  input: QuestBossGateScenarioInput,
): Promise<QuestBossGateScenarioResult> {
  const initial = evaluateQuestBossGateScenario(input);
  const scenarioDir = path.join(outputDir, initial.scenario);
  fs.mkdirSync(scenarioDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const paths: QuestBossGateDemoScreenshotSet = {
    board: path.join(scenarioDir, "board.png"),
    lockedState: path.join(scenarioDir, "locked-state.png"),
    modal: initial.questState === "locked" ? null : path.join(scenarioDir, "quest-modal.png"),
    launch: initial.questState === "locked" ? null : path.join(scenarioDir, "quest-launch.png"),
    completion: initial.questState === "locked" ? null : path.join(scenarioDir, "completion.png"),
  };
  try {
    for (const [view, file] of Object.entries(paths) as Array<[keyof QuestBossGateDemoScreenshotSet, string | null]>) {
      if (!file) continue;
      await page.setContent(gateDemoHtml(initial, view), { waitUntil: "load" });
      await page.screenshot({ path: file, fullPage: true });
      log("gate-demo-screenshot", file);
    }
  } finally {
    await page.close();
    await browser.close();
  }
  return evaluateQuestBossGateScenario({ ...input, screenshots: paths });
}

function scenarioRow(result: QuestBossGateScenarioResult): string {
  return [
    `| ${result.scenario}`,
    result.pass ? "pass" : "fail",
    `${Math.round(result.baselineAccuracy * 100)}%`,
    result.questState,
    result.questAccuracy == null ? "n/a" : `${Math.round(result.questAccuracy * 100)}%`,
    result.bossState,
    result.bossAccuracy == null ? "n/a" : `${Math.round(result.bossAccuracy * 100)}%`,
    result.masteryStatus,
    result.nextAction,
    result.carePlanRevisionWritten ? "yes" : "no",
    result.failureReasons.join(", ") || "none",
  ].join(" | ") + " |";
}

function writeGateDemoReport(report: QuestBossGateDemoReport): { reportPath: string; markdownPath: string } {
  fs.mkdirSync(report.outputDir, { recursive: true });
  const reportPath = path.join(report.outputDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  const markdownPath = path.join(report.outputDir, "report.md");
  fs.writeFileSync(
    markdownPath,
    [
      "# Quest/Boss Gate Demo",
      "",
      `- child: ${report.childId}`,
      `- homework: ${report.homeworkId}`,
      `- output: ${report.outputDir}`,
      `- overall: ${report.overallPass ? "pass" : "fail"} (${report.passCount}/${report.scenarioCount})`,
      "",
      "| scenario | result | baseline | quest | quest accuracy | boss | boss accuracy | mastery | next | care plan revised | failures |",
      "| --- | --- | ---: | --- | ---: | --- | ---: | --- | --- | --- | --- |",
      ...report.scenarios.map(scenarioRow),
      "",
      "## Screenshots",
      "",
      ...report.scenarios.flatMap((scenario) => [
        `### ${scenario.scenario}`,
        `- board: ${scenario.screenshots.board ?? "n/a"}`,
        `- locked state: ${scenario.screenshots.lockedState ?? "n/a"}`,
        `- modal: ${scenario.screenshots.modal ?? "n/a"}`,
        `- launch: ${scenario.screenshots.launch ?? "n/a"}`,
        `- completion: ${scenario.screenshots.completion ?? "n/a"}`,
        "",
      ]),
      ...(report.realBoard ? [
        "## Real Board Smoke",
        "",
        `- child: ${report.realBoard.childId}`,
        `- quest: ${report.realBoard.questState}`,
        `- boss: ${report.realBoard.bossState}`,
        `- screenshot: ${report.realBoard.screenshotPath ?? "n/a"}`,
        `- read-only: ${report.realBoard.readOnly ? "yes" : "no"}`,
        "",
      ] : []),
    ].join("\n"),
    "utf8",
  );
  return { reportPath, markdownPath };
}

function dynamicProofRow(result: QuestBossDynamicProofScenarioResult): string {
  return [
    `| ${result.scenario}`,
    result.pass ? "pass" : "fail",
    result.expectedOutcome,
    result.actualOutcome,
    result.stage,
    result.runtimeEngine ?? "n/a",
    result.runtimeValidationPassed ? "yes" : "no",
    result.screenshotPaths.length,
    `${result.attemptedTargetCount}/${result.targetWordCount}`,
    result.completionEventCount,
    result.completionAccuracy == null ? "n/a" : `${Math.round(result.completionAccuracy * 100)}%`,
    result.isFallback ? "yes" : "no",
    result.failureReasons.join(", ") || "none",
  ].join(" | ") + " |";
}

function writeDynamicProofReport(report: QuestBossDynamicProofReport): { reportPath: string; markdownPath: string } {
  fs.mkdirSync(report.outputDir, { recursive: true });
  const reportPath = path.join(report.outputDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  const markdownPath = path.join(report.outputDir, "report.md");
  fs.writeFileSync(
    markdownPath,
    [
      "# Paid Dynamic Quest/Boss Proof",
      "",
      `- child: ${report.childId}`,
      `- homework: ${report.homeworkId}`,
      `- model: ${report.model}`,
      `- output: ${report.outputDir}`,
      `- overall: ${report.overallPass ? "pass" : "fail"} (${report.passCount}/${report.scenarioCount})`,
      "",
      "| scenario | result | expected | actual | stage | runtime | runtime passed | screenshots | attempts | completions | accuracy | fallback | reasons |",
      "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
      ...report.scenarios.map(dynamicProofRow),
      "",
      "## Screenshots",
      "",
      ...report.scenarios.flatMap((scenario) => [
        `### ${scenario.scenario}`,
        ...scenario.screenshotPaths.map((screenshot) => `- ${screenshot}`),
        scenario.screenshotPaths.length ? "" : "- none",
        "",
      ]),
    ].join("\n"),
    "utf8",
  );
  return { reportPath, markdownPath };
}

function runtimeCompletionAccuracy(payloads: unknown[]): number | null {
  for (const payload of payloads) {
    if (!payload || typeof payload !== "object") continue;
    const raw = (payload as Record<string, unknown>).accuracy;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function resultToDynamicScenario(input: {
  scenario: QuestBossDynamicProofScenarioInput["scenario"];
  expectedOutcome: QuestBossDynamicProofScenarioInput["expectedOutcome"];
  stage: "quest" | "boss";
  model: string;
  result: GeneratedExperienceArtifactResult;
  targetWordCount: number;
  evidenceUsed: string[];
  theoryId: string | null;
  bossRequiredQuestEvidence: boolean;
}): QuestBossDynamicProofScenarioResult {
  const report = input.result.ok ? input.result.validationReport : input.result.validationReport;
  const runtime = report?.runtimeValidation;
  const failureReasons = input.result.ok
    ? input.result.validationReport.failures
    : [input.result.reason, ...(input.result.validationReport?.failures ?? [])];
  const scenario = evaluateQuestBossDynamicProofScenario({
    scenario: input.scenario,
    expectedOutcome: input.expectedOutcome,
    stage: input.stage,
    model: input.model,
    contentId: input.result.ok ? input.result.contentId : null,
    filename: input.result.ok ? input.result.filename : null,
    generatedPath: input.result.ok ? input.result.filePath : null,
    isFallback: input.result.ok ? input.result.filePath.includes("/games/quest.html") || input.result.filename === "quest.html" : false,
    staticValidationPassed: report?.staticValidation?.passed ?? false,
    runtimeValidationPassed: runtime?.passed ?? false,
    runtimeEngine: runtime?.engine === "playwright" ? "playwright" : null,
    screenshotPaths: runtime?.screenshotPaths ?? [],
    targetWordCount: input.targetWordCount,
    attemptedTargetCount: runtime?.attemptedTargets ?? 0,
    completionEventCount: runtime?.completionPayloads?.length ?? 0,
    completionAccuracy: runtimeCompletionAccuracy(runtime?.completionPayloads ?? []),
    failureReasons,
    evidenceUsed: input.evidenceUsed,
    theoryId: input.theoryId,
    bossRequiredQuestEvidence: input.bossRequiredQuestEvidence,
  });
  log("dynamic-proof-scenario", `${scenario.scenario} pass=${scenario.pass} actual=${scenario.actualOutcome}`);
  return scenario;
}

function fixtureRoot(outputDir: string, name: string): string {
  return path.join(outputDir, "fixture-roots", name);
}

function writeFixture(root: string, cycle: HomeworkCycle): void {
  writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
  writeJson(root, `src/context/${CHILD_ID}/word_bank.json`, { childId: CHILD_ID, words: [] });
  writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, cycle);
}

function cycleWithoutQuestEvidence(): HomeworkCycle {
  const cycle = homeworkCycle();
  delete cycle.questMeasurement;
  delete cycle.bossTheory;
  cycle.interventionHistory = (cycle.interventionHistory ?? []).filter((item) => item.nodeType !== "quest");
  return cycle;
}

async function badArtifactHtml(): Promise<string> {
  return `<!doctype html><html><body><main><h1>Bad artifact</h1><button>Done</button></main></body></html>`;
}

async function runDynamicProof(): Promise<void> {
  const useAi = hasFlag("ai");
  if (!useAi) {
    throw new Error("dynamic_proof_requires_paid_ai_flag");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for --dynamic-proof --ai");
  }
  const availability = await resolveSyntheticChildBrowserAvailability();
  if (!availability.available) {
    throw new Error(`Playwright unavailable: ${availability.reason ?? "unknown reason"}`);
  }
  const model = PAID_QUEST_BOSS_SMOKE_MODEL;
  const outputDir = path.join(
    process.cwd(),
    "web",
    "test-artifacts",
    "quest-boss-dynamic-proof",
    timestamp(),
  );
  fs.mkdirSync(outputDir, { recursive: true });
  log("mode", `dynamic-proof paid-ai=true model=${model}`);

  const scenarios: QuestBossDynamicProofScenarioResult[] = [];

  const questRoot = fixtureRoot(outputDir, "paid-quest");
  writeFixture(questRoot, homeworkCycle());
  const questResult = await generateExperienceArtifactFromChart({
    childId: CHILD_ID,
    rootDir: questRoot,
    now: new Date(`${GAME_DATE}T13:00:00.000Z`),
    kind: "quest",
    briefId: "quest-story-smoke",
    parentFeedback: "Paid dynamic proof: create child-specific spelling Quest content and preserve target-level evidence.",
    generateHtml: generateExperienceHtmlWithSonnet,
  });
  scenarios.push(resultToDynamicScenario({
    scenario: "paid_quest_generation",
    expectedOutcome: "generated",
    stage: "quest",
    model,
    result: questResult,
    targetWordCount: WORDS.length,
    evidenceUsed: ["baseline-spell-check"],
    theoryId: homeworkCycle().theory?.theoryId ?? null,
    bossRequiredQuestEvidence: false,
  }));

  const bossBlockedRoot = fixtureRoot(outputDir, "boss-blocked-before-quest");
  writeFixture(bossBlockedRoot, cycleWithoutQuestEvidence());
  const bossBlockedResult = await generateExperienceArtifactFromChart({
    childId: CHILD_ID,
    rootDir: bossBlockedRoot,
    now: new Date(`${GAME_DATE}T13:05:00.000Z`),
    kind: "boss",
    briefId: "boss-showdown-smoke",
    parentFeedback: "Paid dynamic proof: this should block because Quest evidence is missing.",
    generateHtml: generateExperienceHtmlWithSonnet,
  });
  scenarios.push(resultToDynamicScenario({
    scenario: "boss_blocked_before_quest",
    expectedOutcome: "blocked",
    stage: "boss",
    model,
    result: bossBlockedResult,
    targetWordCount: WORDS.length,
    evidenceUsed: ["baseline-spell-check"],
    theoryId: cycleWithoutQuestEvidence().theory?.theoryId ?? null,
    bossRequiredQuestEvidence: true,
  }));

  const bossRoot = fixtureRoot(outputDir, "paid-boss-after-quest");
  writeFixture(bossRoot, homeworkCycle());
  const bossResult = await generateExperienceArtifactFromChart({
    childId: CHILD_ID,
    rootDir: bossRoot,
    now: new Date(`${GAME_DATE}T13:10:00.000Z`),
    kind: "boss",
    briefId: "boss-showdown-smoke",
    parentFeedback: "Paid dynamic proof: create child-specific Boss content from supported Quest evidence and preserve mastery evidence.",
    generateHtml: generateExperienceHtmlWithSonnet,
  });
  scenarios.push(resultToDynamicScenario({
    scenario: "paid_boss_generation",
    expectedOutcome: "generated",
    stage: "boss",
    model,
    result: bossResult,
    targetWordCount: WORDS.length,
    evidenceUsed: ["baseline-spell-check", "quest-destination"],
    theoryId: homeworkCycle().bossTheory?.theoryId ?? homeworkCycle().theory?.theoryId ?? null,
    bossRequiredQuestEvidence: true,
  }));

  const badRoot = fixtureRoot(outputDir, "bad-artifact-rejected");
  writeFixture(badRoot, homeworkCycle());
  const badResult = await generateExperienceArtifactFromChart({
    childId: CHILD_ID,
    rootDir: badRoot,
    now: new Date(`${GAME_DATE}T13:15:00.000Z`),
    kind: "quest",
    briefId: "quest-story-smoke",
    parentFeedback: "Paid dynamic proof: intentionally invalid generated content should fail validation.",
    generateHtml: badArtifactHtml,
  });
  scenarios.push(resultToDynamicScenario({
    scenario: "bad_artifact_rejected",
    expectedOutcome: "rejected",
    stage: "quest",
    model,
    result: badResult,
    targetWordCount: WORDS.length,
    evidenceUsed: ["baseline-spell-check"],
    theoryId: homeworkCycle().theory?.theoryId ?? null,
    bossRequiredQuestEvidence: false,
  }));

  const report = buildQuestBossDynamicProofReport({
    createdAt: new Date().toISOString(),
    childId: CHILD_ID,
    homeworkId: HOMEWORK_ID,
    model,
    outputDir,
    scenarios,
  });
  const { reportPath, markdownPath } = writeDynamicProofReport(report);
  log("report", reportPath);
  log("report", markdownPath);
  if (!report.overallPass) {
    throw new Error("quest_boss_dynamic_proof_failed");
  }
}

function nodeStateFromPlanNode(node: { locked?: boolean; masteryUnlockState?: string } | undefined): QuestBossGateNodeState {
  if (!node) return "locked";
  if (node.locked) return "locked";
  return "available";
}

async function captureReadOnlyRealBoardSmoke(outputDir: string, childId: string): Promise<QuestBossGateDemoReport["realBoard"]> {
  const file = path.join(process.cwd(), "src", "context", childId, "plans", "active_session_plan.json");
  if (!fs.existsSync(file)) {
    return {
      childId,
      questState: "locked",
      bossState: "locked",
      screenshotPath: null,
      readOnly: true,
    };
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    current?: {
      nodePlan?: Array<{ type?: string; activityId?: string; locked?: boolean; masteryUnlockState?: string }>;
      adventureBoard?: { nodes?: Array<{ kind?: string; state?: string; label?: string }> };
    };
  };
  const plan = raw.current;
  const questNode = plan?.nodePlan?.find((node) => node.type === "quest" || node.activityId === "quest");
  const bossNode = plan?.nodePlan?.find((node) => node.type === "boss" || node.activityId === "boss");
  const realBoard = {
    childId,
    questState: nodeStateFromPlanNode(questNode),
    bossState: nodeStateFromPlanNode(bossNode),
    screenshotPath: path.join(outputDir, `real-${childId}-board-state.png`),
    readOnly: true as const,
  };
  const boardLabels = plan?.adventureBoard?.nodes?.map((node) => `${node.label ?? node.kind ?? "node"}:${node.state ?? "unknown"}`) ?? [];
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Real ${escapeHtml(childId)} Quest/Boss State</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:#172554; color:#f8fafc; font-family:Inter,system-ui,sans-serif; }
    main { width:min(900px,calc(100vw - 48px)); border:3px solid white; border-radius:8px; padding:28px; background:#0f172a; }
    h1 { margin:0 0 12px; font-size:34px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:20px 0; }
    .card { border:2px solid rgba(255,255,255,.45); border-radius:8px; padding:18px; }
    .label { color:#facc15; font-weight:900; text-transform:uppercase; font-size:13px; }
    .value { font-size:30px; font-weight:900; margin-top:8px; }
    li { margin:6px 0; }
  </style>
</head>
<body>
  <main>
    <h1>Read-only real board smoke: ${escapeHtml(childId)}</h1>
    <p>This reads the active session plan only. It does not inject synthetic evidence into the child chart.</p>
    <section class="grid">
      <div class="card"><div class="label">Quest</div><div class="value">${escapeHtml(realBoard.questState)}</div></div>
      <div class="card"><div class="label">Boss</div><div class="value">${escapeHtml(realBoard.bossState)}</div></div>
    </section>
    <div class="label">Board labels</div>
    <ul>${boardLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>
  </main>
</body>
</html>`;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: realBoard.screenshotPath, fullPage: true });
    log("real-board-screenshot", realBoard.screenshotPath);
  } finally {
    await page.close();
    await browser.close();
  }
  return realBoard;
}

function buildStaticWebForChild(childId: string): void {
  const runtimeConfig = {
    subject: "homework",
    sessionMode: "as-child",
    previewMode: "free",
    voiceMode: "muted",
    childId,
    homeworkDomain: "spelling",
  };
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js"), "build"],
    {
      cwd: path.join(process.cwd(), "web"),
      env: {
        ...process.env,
        VITE_SUNNY_RUNTIME_CONFIG: JSON.stringify(runtimeConfig),
      },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`real_app_board_build_failed:${result.stderr || result.stdout}`);
  }
}

function startStaticSunnyServer(port: number): ChildProcess {
  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "src/server.ts", "--serve-static"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        TTS_ENABLED: "false",
        SUNNY_SUBJECT: "homework",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) log("static-server", line.split("\n").at(-1) ?? line);
  });
  child.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) log("static-server", line.split("\n").at(-1) ?? line);
  });
  return child;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
      resolve();
    }, 3000).unref();
  });
}

async function captureRealAppBoardScreenshot(outputDir: string, childId: string): Promise<string> {
  const port = 3067;
  buildStaticWebForChild(childId);
  const server = startStaticSunnyServer(port);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  try {
    await waitForHttp(`http://127.0.0.1:${port}`);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.getByText("Quest", { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("Boss", { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
    const screenshotPath = path.join(outputDir, `real-${childId}-app-board.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log("real-app-board-screenshot", screenshotPath);
    return screenshotPath;
  } finally {
    await page.close();
    await browser.close();
    await stopChild(server);
  }
}

async function runGateDemo(): Promise<void> {
  const realChild = optionValue("real-child");
  const stageFilter = optionValue("stage");
  if (stageFilter && stageFilter !== "current") {
    throw new Error(`Unsupported --stage=${stageFilter} for --gate-demo; expected current`);
  }
  const availability = await resolveSyntheticChildBrowserAvailability();
  if (!availability.available) {
    throw new Error(`Playwright unavailable: ${availability.reason ?? "unknown reason"}`);
  }
  const outputDir = path.join(
    process.cwd(),
    "web",
    "test-artifacts",
    "quest-boss-gate-demo",
    timestamp(),
  );
  fs.mkdirSync(outputDir, { recursive: true });
  log("mode", `gate-demo deterministic scenarios real-child=${realChild ?? "none"}`);
  const scenarios = [];
  for (const input of gateDemoScenarioInputs()) {
    scenarios.push(await captureGateDemoScreenshots(outputDir, input));
  }
  let realBoard = realChild ? await captureReadOnlyRealBoardSmoke(outputDir, realChild) : undefined;
  if (realChild && realBoard) {
    realBoard = {
      ...realBoard,
      screenshotPath: await captureRealAppBoardScreenshot(outputDir, realChild),
    };
  }
  const report = buildQuestBossGateDemoReport({
    createdAt: new Date().toISOString(),
    childId: realChild ?? CHILD_ID,
    homeworkId: HOMEWORK_ID,
    outputDir,
    scenarios,
    realBoard,
  });
  const { reportPath, markdownPath } = writeGateDemoReport(report);
  log("report", reportPath);
  log("report", markdownPath);
  if (!report.overallPass) {
    throw new Error("quest_boss_gate_demo_failed");
  }
}

function theory(stage: "pre_quest" | "boss"): LearningTheory {
  return {
    theoryId: `${HOMEWORK_ID}:${stage}:2026-05-27T12:00:00.000Z`,
    stage,
    createdAt: "2026-05-27T12:00:00.000Z",
    hypothesis: "Reina can transfer silent-letter spelling when the task hides the answer.",
    predictedPattern: "silent_letter_transfer",
    predictedRiskWords: ["sign", "write"],
    intervention: stage === "boss" ? "mastery finale" : "generated transfer quest",
    successCriteria: { minAccuracy: 0.85, minImprovement: 0.1 },
    evidence: ["Baseline spelling evidence was strong enough for a smoke gate."],
    status: "pending",
    markdown: "## Hypothesis\nSilent-letter transfer should hold in generated content.",
  };
}

function homeworkCycle(): HomeworkCycle {
  const homeworkWordIds = WORDS.map((word, index) => `${HOMEWORK_ID}:silent_letters:${word}:${index}`);
  return {
    homeworkId: HOMEWORK_ID,
    subject: "spelling_test",
    wordList: WORDS,
    capturedContent: {
      title: "Quest Boss Smoke Spelling",
      type: "spelling_test",
      rawText: WORDS.join("\n"),
      words: WORDS,
      questions: [],
      homeworkWords: WORDS.map((word, index) => ({
        homeworkWordId: homeworkWordIds[index]!,
        text: word,
        normalizedText: word,
        wordGroupId: "silent_letters",
        purpose: "spell_from_memory",
        positionIndex: index,
      })),
      wordGroups: [{
        id: "silent_letters",
        wordGroupId: "silent_letters",
        label: "Silent Letters",
        purpose: "spell_from_memory",
        words: WORDS,
        homeworkWordIds,
        confidence: 0.95,
        evidence: ["Smoke spelling list."],
      }],
      assignmentInterpretation: {
        schemaVersion: 1,
        status: "ready",
        wordGroups: [{
          id: "silent_letters",
          wordGroupId: "silent_letters",
          label: "Silent Letters",
          purpose: "spell_from_memory",
          words: WORDS,
          homeworkWordIds,
          confidence: 0.95,
          evidence: ["Smoke spelling list."],
        }],
        assertions: [],
        selectedTargets: [],
        heldTargets: [],
        clarificationQuestions: [],
        humanAnswers: [],
        memoryMatches: [],
      },
      sourceDocuments: [{ filename: "smoke-spelling.txt", mediaType: "text/plain" }],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Silent letters",
        primarySkill: "spelling recall",
        assignmentFormat: "spelling test",
        concepts: ["silent letters"],
        sourceEvidence: ["smoke fixture"],
      },
    },
    contentFingerprint: "quest-boss-smoke",
    calibrationStatus: "unverified",
    ingestedAt: GAME_DATE,
    testDate: "2026-05-29",
    testDateSource: "cli",
    testDateConfirmed: true,
    returnTag: "#sunny_reina_quest_boss_smoke",
    assumptions: "Smoke fixture for Quest/Boss validated launch.",
    theory: theory("pre_quest"),
    bossTheory: theory("boss"),
    questMeasurement: {
      nodeId: "quest-destination",
      nodeType: "quest",
      measuredAt: "2026-05-27T12:30:00.000Z",
      baselineAccuracy: 1,
      interventionAccuracy: 1,
      improvement: 0,
      predictionMet: true,
      status: "supported",
    },
    interventionHistory: [
      {
        nodeId: "baseline-spell-check",
        nodeType: "spell-check",
        measuredAt: "2026-05-27T12:05:00.000Z",
        baselineAccuracy: 1,
        interventionAccuracy: 1,
        improvement: 0,
        predictionMet: true,
        status: "supported",
      },
      {
        nodeId: "quest-destination",
        nodeType: "quest",
        measuredAt: "2026-05-27T12:30:00.000Z",
        baselineAccuracy: 1,
        interventionAccuracy: 1,
        improvement: 0,
        predictionMet: true,
        status: "supported",
      },
    ],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  };
}

function activePlan(): ActiveSessionPlan {
  return {
    planId: "plan-quest-boss-smoke",
    childId: CHILD_ID,
    createdAt: `${GAME_DATE}T12:00:00.000Z`,
    source: "ingest_human_loop",
    activeHomeworkId: HOMEWORK_ID,
    domain: "spelling",
    testDate: "2026-05-29",
    nodePlan: [
      {
        id: "baseline-spell-check",
        type: "spell-check",
        activityId: "spell-check",
        targets: WORDS,
        difficulty: 2,
        source: "chart_planner",
      },
      {
        id: "quest-destination",
        type: "quest",
        activityId: "quest",
        targets: WORDS,
        difficulty: 3,
        source: "chart_planner",
        masteryUnlockState: "preparing",
        locked: true,
      },
      {
        id: "boss-destination",
        type: "boss",
        activityId: "boss",
        targets: WORDS,
        difficulty: 3,
        source: "chart_planner",
        masteryUnlockState: "preparing",
        locked: true,
      },
    ],
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "quest-boss-smoke",
      previousCompletedNodeCount: 1,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "silent",
      verbosity: "low",
      maxMicroProbes: 0,
    },
    evidenceUsed: [{ id: "baseline-spell-check", type: "activity_result", summary: "100%" }],
    openQuestions: [],
    planTheory: {
      hypothesis: "Quest/Boss smoke proves generated artifacts can validate and launch.",
      evidenceSummary: ["Baseline smoke evidence exists."],
      intervention: "validated generated Quest/Boss artifacts",
      supportCriteria: ["Playwright validation passes"],
      reviseCriteria: ["runtime warnings appear"],
      falsifyCriteria: ["artifact fails validation"],
    },
    generatedExperienceBriefs: [
      {
        briefId: "quest-story-smoke",
        experimentId: "experiment-quest-smoke",
        kind: "quest",
        title: "Story Quest Smoke",
        learningGoal: "Prove silent-letter spelling transfer.",
        targetSkills: ["spelling recall"],
        targetConcepts: ["silent letters"],
        targetWords: WORDS,
        engagementHooks: ["story"],
        algorithmTargets: ["retrieval-practice"],
        evidenceUsed: ["baseline-spell-check"],
        artifactStatus: "brief_only",
        validationRequired: true,
      },
      {
        briefId: "boss-showdown-smoke",
        experimentId: "experiment-boss-smoke",
        kind: "boss",
        title: "Boss Showdown Smoke",
        learningGoal: "Prove final mastery without visible answers.",
        targetSkills: ["spelling recall"],
        targetConcepts: ["silent letters"],
        targetWords: WORDS,
        engagementHooks: ["showdown"],
        algorithmTargets: ["mastery-gating"],
        evidenceUsed: ["baseline-spell-check", "quest-destination"],
        artifactStatus: "brief_only",
        validationRequired: true,
      },
    ],
  };
}

function profile(): LearningProfile {
  const p = initializeLearningProfile({
    childId: CHILD_ID,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  p.selectedHomeworkDomain = "spelling";
  p.pendingHomework = {
    weekOf: GAME_DATE,
    homeworkId: HOMEWORK_ID,
    testDate: "2026-05-29",
    testDateSource: "cli",
    testDateConfirmed: true,
    returnTag: "#sunny_reina_quest_boss_smoke",
    wordList: WORDS,
    generatedAt: `${GAME_DATE}T12:00:00.000Z`,
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "language_arts",
      topic: "Silent letters",
      primarySkill: "spelling recall",
      assignmentFormat: "spelling test",
      concepts: ["silent letters"],
      sourceEvidence: ["smoke fixture"],
    },
    capturedContent: null,
    nodes: [
      {
        id: "baseline-spell-check",
        type: "spell-check",
        words: WORDS,
        difficulty: 2,
        gameFile: null,
        storyFile: null,
        date: GAME_DATE,
      },
      {
        id: "quest-destination",
        type: "quest",
        words: WORDS,
        difficulty: 3,
        gameFile: null,
        storyFile: null,
        date: GAME_DATE,
      },
      {
        id: "boss-destination",
        type: "boss",
        words: WORDS,
        difficulty: 3,
        gameFile: null,
        storyFile: null,
        date: GAME_DATE,
      },
    ],
  };
  p.activeSessionPlan = activePlan();
  return p;
}

function smokeHtml(args: GenerateExperienceHtmlArgs): string {
  const stage = args.brief.kind;
  const title = args.brief.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const wordsJson = JSON.stringify(args.artifact.targetWords);
  const visibleTargetCopy = stage === "boss"
    ? "Final answers stay hidden until the mission is complete."
    : "The mission asks for each spelling target in a new scene.";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="/games/_contract.js"></script>
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, system-ui, sans-serif; background: linear-gradient(135deg, #102a43, #f97316); color: #fff7ed; }
    main { width: min(760px, calc(100vw - 48px)); border: 3px solid rgba(255,255,255,.85); border-radius: 8px; padding: 28px; background: rgba(15,23,42,.78); box-shadow: 0 12px 0 rgba(0,0,0,.28); }
    h1 { margin: 0 0 12px; font-size: 36px; }
    p { font-size: 18px; line-height: 1.45; }
    button { border: 3px solid #fff7ed; border-radius: 8px; background: #7c3aed; color: white; font-weight: 800; font-size: 20px; padding: 14px 18px; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${visibleTargetCopy}</p>
    <button id="start">Start Smoke Run</button>
    <p id="done" hidden>Complete.</p>
  </main>
  <script>
    const params = window.GAME_PARAMS || {};
    const words = ${wordsJson};
    function finish() {
      words.forEach((word) => {
        window.fireAttemptEvent({ target: word, word, correct: true });
      });
      window.fireCompanionEvent("correct_answer", { childId: params.childId || "", timestamp: Date.now() });
      window.sendNodeComplete({ completed: true, accuracy: 1, wordsAttempted: words.length });
      document.getElementById("done").hidden = false;
    }
    document.getElementById("start").addEventListener("click", finish);
    window.SUNNY_VALIDATION_HOOKS = { playthrough: async () => finish() };
  </script>
</body>
</html>`;
}

function createLaunchServer(root: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const publicDir = path.join(process.cwd(), "web", "public");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/games/")) {
      const file = path.join(publicDir, url.pathname.replace(/^\//, ""));
      if (fs.existsSync(file)) {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        res.end(fs.readFileSync(file));
        return;
      }
    }
    const match = url.pathname.match(/^\/homework\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (match) {
      const [, childId, date, filename] = match;
      const file = path.resolve(root, "src", "context", childId!, "homework", "games", date!, filename!);
      const base = path.resolve(root, "src", "context", childId!, "homework", "games", date!);
      if (file.startsWith(base) && fs.existsSync(file)) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(file));
        return;
      }
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not bind smoke launch server."));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

async function screenshotLaunch(root: string, outputDir: string, stage: "quest" | "boss", filename: string) {
  const server = await createLaunchServer(root);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  try {
    const url = `${server.baseUrl}/homework/${CHILD_ID}/${GAME_DATE}/${filename}?preview=go-live&childId=${CHILD_ID}&nodeId=${stage}-smoke&words=${encodeURIComponent(WORDS.join(","))}`;
    await page.goto(url, { waitUntil: "load" });
    const loadedScreenshotPath = path.join(outputDir, `${stage}-loaded.png`);
    await page.screenshot({ path: loadedScreenshotPath, fullPage: true });
    log("launch-screenshot", loadedScreenshotPath);
    const launchButton = page.getByRole("button").filter({
      hasText: /start|let'?s go|begin|play|launch|continue/i,
    }).first();
    if (await launchButton.count()) {
      await launchButton.click();
      await page.waitForTimeout(500);
    }
    const afterStartScreenshotPath = path.join(outputDir, `${stage}-after-start.png`);
    await page.screenshot({ path: afterStartScreenshotPath, fullPage: true });
    log("launch-screenshot", afterStartScreenshotPath);
    return {
      url,
      screenshotPath: afterStartScreenshotPath,
      loadedScreenshotPath,
      afterStartScreenshotPath,
    };
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

function startStorybook(port: number): ChildProcess {
  const storybookBin = path.join(process.cwd(), "web", "node_modules", "storybook", "dist", "bin", "dispatcher.js");
  const fakeBin = path.join(process.cwd(), ".sunny-local", "storybook-package-manager");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeNpm = path.join(fakeBin, "npm");
  if (!fs.existsSync(fakeNpm)) {
    fs.writeFileSync(fakeNpm, "#!/bin/sh\necho 10.0.0\n", { mode: 0o755 });
  }
  const child = spawn(
    process.execPath,
    [storybookBin, "dev", "--ci", "--no-open", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: path.join(process.cwd(), "web"),
      env: {
        ...process.env,
        NO_COLOR: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) log("storybook", line.split("\n").at(-1) ?? line);
  });
  child.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) log("storybook", line.split("\n").at(-1) ?? line);
  });
  return child;
}

async function waitForHttp(url: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode < 500));
      });
      req.on("error", () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function captureChoiceModalScreenshots(outputDir: string) {
  const port = 6017;
  const baseUrl = `http://127.0.0.1:${port}`;
  const storybook = startStorybook(port);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const scenarios = [
    {
      storyId: "adventure-board-json-renderer--quest-choice-unlocked",
      buttonName: "Quest",
      kind: "quest-wrapper",
      outputName: "quest-modal-choice.png",
    },
    {
      storyId: "adventure-board-json-renderer--boss-choice-unlocked",
      buttonName: "Boss",
      kind: "boss-wrapper",
      outputName: "boss-modal-choice.png",
    },
  ];
  try {
    await waitForHttp(`${baseUrl}/iframe.html`);
    for (const scenario of scenarios) {
      const url = `${baseUrl}/iframe.html?id=${scenario.storyId}&viewMode=story`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: scenario.buttonName, exact: true }).click();
      const modal = page.getByTestId("adventure-choice-modal");
      await modal.waitFor({ state: "visible", timeout: 10_000 });
      const kind = await modal.getAttribute("data-choice-kind");
      if (kind !== scenario.kind) {
        throw new Error(`Expected ${scenario.kind} modal, got ${String(kind)}`);
      }
      const cards = modal.getByTestId("adventure-choice-card");
      const count = await cards.count();
      if (count < 2 || count > 3) throw new Error(`Expected 2-3 cards for ${scenario.kind}, got ${count}`);
      const screenshotPath = path.join(outputDir, scenario.outputName);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log("modal-screenshot", screenshotPath);
      await cards.first().click();
    }
  } finally {
    await page.close();
    await browser.close();
    storybook.kill("SIGTERM");
  }
}

async function main() {
  if (hasFlag("dynamic-proof")) {
    await runDynamicProof();
    return;
  }
  if (hasFlag("gate-demo")) {
    await runGateDemo();
    return;
  }
  const useAi = hasFlag("ai");
  const stageFilter = optionValue("stage");
  if (stageFilter && stageFilter !== "quest" && stageFilter !== "boss") {
    throw new Error(`Unsupported --stage=${stageFilter}; expected quest or boss`);
  }
  const availability = await resolveSyntheticChildBrowserAvailability();
  if (!availability.available) {
    throw new Error(`Playwright unavailable: ${availability.reason ?? "unknown reason"}`);
  }

  const outputDir = path.join(
    process.cwd(),
    "web",
    "test-artifacts",
    useAi ? "quest-boss-paid-smoke" : "quest-boss-launch-smoke",
    timestamp(),
  );
  const root = path.join(outputDir, "fixture-root");
  fs.mkdirSync(outputDir, { recursive: true });
  log(
    "mode",
    `${useAi ? `paid-ai=true model=${PAID_QUEST_BOSS_SMOKE_MODEL}` : "paid-ai=false deterministic fixture"} stage=${stageFilter ?? "quest,boss"}`,
  );
  writeJson(root, `src/context/${CHILD_ID}/learning_profile.json`, profile());
  writeJson(root, `src/context/${CHILD_ID}/word_bank.json`, { childId: CHILD_ID, words: [] });
  writeJson(root, `src/context/${CHILD_ID}/homework/cycles/${HOMEWORK_ID}.json`, homeworkCycle());

  await captureChoiceModalScreenshots(outputDir);

  const outputs = [];
  const stageBriefs = [
    ["quest", "quest-story-smoke"],
    ["boss", "boss-showdown-smoke"],
  ] as const;
  for (const [stage, briefId] of stageBriefs.filter(([stage]) => !stageFilter || stage === stageFilter)) {
    const result = await generateExperienceArtifactFromChart({
      childId: CHILD_ID,
      rootDir: root,
      now: new Date(`${GAME_DATE}T13:00:00.000Z`),
      kind: stage,
      briefId,
      parentFeedback: [
        `Smoke selected ${briefId}.`,
        "Use flow-state design guidance: clear goal, immediate feedback, challenge-skill balance, control, and low-friction focus.",
        "Hide the spelling proof inside the adventure loop, but preserve mastery evidence through per-target attempt events.",
      ].join(" "),
      generateHtml: useAi ? generateExperienceHtmlWithSonnet : smokeHtml,
    });
    if (!result.ok) {
      throw new Error(`${stage} generation failed: ${result.reason}`);
    }
    const launch = await screenshotLaunch(root, outputDir, stage, result.filename);
    outputs.push({
      stage,
      briefId,
      filename: result.filename,
      filePath: result.filePath,
      contentId: result.contentId,
      validationReport: result.validationReport,
      launch,
    });
    log("validated", `${stage} file=${result.filename} score=${result.validationReport.score}`);
  }

  const report = {
    createdAt: new Date().toISOString(),
    childId: CHILD_ID,
    homeworkId: HOMEWORK_ID,
    paidAi: useAi,
    model: useAi ? PAID_QUEST_BOSS_SMOKE_MODEL : "deterministic-smoke-html",
    outputDir,
    outputs,
  };
  const reportPath = path.join(outputDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  const markdownPath = path.join(outputDir, "report.md");
  fs.writeFileSync(
    markdownPath,
    [
      "# Quest/Boss Launch Smoke",
      "",
      `- child: ${CHILD_ID}`,
      `- homework: ${HOMEWORK_ID}`,
      `- paid AI: ${useAi ? "yes" : "no"}`,
      `- model: ${useAi ? PAID_QUEST_BOSS_SMOKE_MODEL : "deterministic-smoke-html"}`,
      `- output: ${outputDir}`,
      "",
      ...outputs.map((item) => [
        `## ${item.stage}`,
        `- file: ${item.filename}`,
        `- contentId: ${item.contentId}`,
        `- validation: ${item.validationReport.passed ? "passed" : "failed"} (${item.validationReport.score})`,
        `- runtime engine: ${item.validationReport.runtimeValidation?.engine ?? "unknown"}`,
        `- runtime screenshot: ${item.validationReport.runtimeValidation?.screenshotPaths.join(", ") ?? ""}`,
        `- launch screenshot: ${item.launch.screenshotPath}`,
      ].join("\n")),
      "",
    ].join("\n"),
    "utf8",
  );
  log("report", reportPath);
  log("report", markdownPath);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`🎮 [quest-boss-smoke] [failed] ${message}`);
    process.exitCode = 1;
  });
}
