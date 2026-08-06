import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { chromium } from "playwright";
import { getChildChart } from "../profiles/childChart";
import { planBaselineShellsForHomework, shouldTriggerBaselineGeneration } from "../engine/baselinePlannerIntegration";
import {
  attachBaselineShellToHomework,
  catalogBaselineShellArtifact,
  generateBaselineMechanicBriefCandidates,
  generateBaselineShellWithLlm,
  printBaselineBriefMenu,
  refillBaselineLaneConfigs,
  refillBaselineShellConfig,
  reviewBaselineShellArtifact,
  type BaselineShellArtifact,
} from "../engine/baselineGameFactory";
import { selectPreferredBaselineShell } from "../engine/baselineShellGap";
import type { BaselineMechanicBrief } from "../engine/baselineMechanicBrief";
import { distillContentFeedbackSummary, readContentFeedbackLessons, appendContentFeedbackLesson, pickBaselineBriefIndexFromFeedback } from "../engine/contentFeedbackMemory";
import { runIngestHomework } from "./ingestHomework";
import { resolveChildContextDir } from "../utils/contextRoot";

type DemoAssignment = {
  filename: string;
  title: string;
  body: string;
  homeworkId: string;
  configFilename: string;
  rounds: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; label: string; correct: boolean }>;
  }>;
};

const ASSIGNMENTS: DemoAssignment[] = [
  {
    filename: "pashley-math-1-time-money.pdf",
    title: "Pashley Grade 3 - Telling Time and Money",
    homeworkId: "hw-math-1-time-money",
    configFilename: "generated-baseline.json",
    body: `Name: ____________________  Date: ____________________

Unit 4: Telling Time and Money

1. What time is shown on the clock? 2:30
2. What time is shown on the clock? 4:15
3. Sara has 2 quarters and 3 dimes. How much money does she have?
4. Ben buys a pencil for 35 cents. He pays with 2 quarters. How much change should he get?`,
    rounds: [
      {
        id: "q1",
        prompt: "What time is 2:30?",
        options: [
          { id: "a", label: "2:30", correct: true },
          { id: "b", label: "3:30", correct: false },
        ],
      },
    ],
  },
  {
    filename: "pashley-math-2-multiplication.pdf",
    title: "Pashley Grade 3 - Multiplication Facts x2, x5, x10",
    homeworkId: "hw-math-2-multiplication",
    configFilename: "generated-baseline.json",
    body: `Name: ____________________  Date: ____________________

Unit 3: Multiplication Facts x2, x5, x10

Fluency:
5 x 2 = __   5 x 5 = __   5 x 10 = __
2 x 7 = __   10 x 4 = __

Word Problems:
Mrs. K puts 5 pencils in each of 4 boxes. How many pencils are there in all?
There are 3 rows of 10 stars. How many stars are there?`,
    rounds: [
      {
        id: "f1",
        prompt: "5 x 2 = ?",
        options: [
          { id: "a", label: "10", correct: true },
          { id: "b", label: "7", correct: false },
        ],
      },
      {
        id: "f2",
        prompt: "5 x 5 = ?",
        options: [
          { id: "a", label: "25", correct: true },
          { id: "b", label: "20", correct: false },
        ],
      },
    ],
  },
  {
    filename: "pashley-math-3-fractions.pdf",
    title: "Pashley Grade 3 - Unit Fractions",
    homeworkId: "hw-math-3-fractions",
    configFilename: "generated-baseline.json",
    body: `Name: ____________________  Date: ____________________

Unit 5: Fractions

Shade one third of the rectangle.
Shade one fourth of the circle.
Which is larger: 1/3 or 1/4?`,
    rounds: [
      {
        id: "fr1",
        prompt: "Which shows 1/3?",
        options: [
          { id: "a", label: "One of three equal parts", correct: true },
          { id: "b", label: "One of four equal parts", correct: false },
        ],
      },
    ],
  },
];

function downloadsDir(): string {
  return path.join(os.homedir(), "Downloads");
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function writePdfFromHtml(outputPath: string, title: string, body: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;padding:32px;">
    <h1>${title}</h1>
    <pre style="white-space:pre-wrap;font-size:16px;line-height:1.5">${body}</pre>
  </body></html>`);
  await page.pdf({ path: outputPath, format: "Letter" });
  await browser.close();
}

function writeActivityConfig(rootDir: string, childId: string, assignment: DemoAssignment): string {
  const configDir = path.join(
    resolveChildContextDir(childId, { rootDir }),
    "homework",
    "games",
    assignment.homeworkId,
  );
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, assignment.configFilename);
  const config = {
    schemaVersion: 1,
    activityId: "generated-baseline",
    engine: { id: "generated-baseline", mode: "practice" },
    topic: assignment.title,
    domain: "math",
    learningGoal: assignment.title,
    gradeBand: "early_elementary",
    targets: assignment.rounds.map((round) => ({ id: round.id, label: round.prompt, type: "fact" })),
    rounds: assignment.rounds,
    evidencePolicy: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: false,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice"],
    },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

function upsertCatalogItem(rootDir: string, childId: string, item: ReturnType<typeof catalogBaselineShellArtifact>): void {
  const profilePath = path.join(resolveChildContextDir(childId, { rootDir }), "learning_profile.json");
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8")) as { aiContentCatalog?: unknown[] };
  profile.aiContentCatalog = [...(profile.aiContentCatalog ?? []), item];
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  const catalogPath = path.join(resolveChildContextDir(childId, { rootDir }), "content_catalog.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as { items: unknown[] };
  catalog.items = [...(catalog.items ?? []), item];
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

async function ingestAssignmentPdf(input: {
  rootDir: string;
  childId: string;
  pdfPath: string;
}): Promise<void> {
  process.env.SUNNY_NON_INTERACTIVE = "true";
  console.log(`🎮 [demo:game-factory] [ingest] child=${input.childId} pdf=${path.basename(input.pdfPath)}`);
  await runIngestHomework([
    `--child=${input.childId}`,
    "--domain=math",
    `--pdf=${input.pdfPath}`,
  ]);
}

function copyGameplayScreenshotsToDownloads(
  artifact: Awaited<ReturnType<typeof generateBaselineShellWithLlm>>,
  assignment: DemoAssignment,
): void {
  const screenshots = artifact.validationReport?.screenshotPaths ?? [];
  if (screenshots.length === 0) {
    console.log(`🎮 [demo:game-factory] [screenshot-missing] homework=${assignment.homeworkId}`);
    return;
  }
  const suffixes = ["load", "midplay", "completion"];
  screenshots.forEach((sourcePath, index) => {
    const suffix = suffixes[index] ?? `frame-${index + 1}`;
    const destPath = path.join(downloadsDir(), `${assignment.homeworkId}-gameplay-${suffix}.png`);
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Screenshot saved: ${destPath}`);
  });
}

function pickBriefIndexFromFeedback(
  briefs: Awaited<ReturnType<typeof generateBaselineMechanicBriefCandidates>>,
  lessons: ReturnType<typeof readContentFeedbackLessons>,
  explicit?: number,
): number {
  return pickBaselineBriefIndexFromFeedback(briefs, lessons, explicit);
}

async function runAssignment(input: {
  rootDir: string;
  childId: string;
  assignment: DemoAssignment;
  pickBriefIndex?: number;
  autoApprove?: boolean;
  reviewReason?: string;
  autoMode?: boolean;
}): Promise<void> {
  const chart = getChildChart(input.childId, { rootDir: input.rootDir });
  const decision = planBaselineShellsForHomework({
    chart,
    homeworkId: input.assignment.homeworkId,
    domain: "math",
    title: input.assignment.title,
    conceptText: input.assignment.body,
  });
  console.log(decision.message);

  const chartAfterIngest = getChildChart(input.childId, { rootDir: input.rootDir });
  const pendingHomeworkId =
    chartAfterIngest.homework.pending?.homeworkId ??
    chartAfterIngest.homework.pending?.weekOf ??
    input.assignment.homeworkId;
  const activityConfigPath = `/api/activity-config/${input.childId}/${pendingHomeworkId}/${input.assignment.configFilename}`;
  const configPath = writeActivityConfig(
    input.rootDir,
    input.childId,
    { ...input.assignment, homeworkId: pendingHomeworkId },
  );

  if (!shouldTriggerBaselineGeneration(decision)) {
    console.log(`Preferred shells: ${decision.preferredNodeTypes.join(", ")}`);
    const generatedShell = selectPreferredBaselineShell(
      decision.matchedShells,
      readContentFeedbackLessons(input.rootDir, input.childId),
    ) ?? decision.matchedShells.find((shell) => shell.source === "generated_shell");
    if (generatedShell?.gameHtmlPath && generatedShell.experienceBrief) {
      const refill = refillBaselineShellConfig({
        rootDir: input.rootDir,
        childId: input.childId,
        shell: generatedShell,
        homeworkId: pendingHomeworkId,
        title: input.assignment.title,
        homeworkRounds: input.assignment.rounds,
        configFilename: input.assignment.configFilename,
      });
      const laneConfigs = refillBaselineLaneConfigs({
        rootDir: input.rootDir,
        childId: input.childId,
        homeworkId: pendingHomeworkId,
        title: input.assignment.title,
        homeworkRounds: input.assignment.rounds,
        nodes: chartAfterIngest.homework.pending?.nodes ?? [],
      });
      attachBaselineShellToHomework({
        rootDir: input.rootDir,
        childId: input.childId,
        artifact: {
          contentId: generatedShell.contentId ?? `${pendingHomeworkId}:generated-baseline:reuse`,
          briefId: "reuse",
          filename: path.basename(generatedShell.gameHtmlPath),
          filePath: generatedShell.gameHtmlPath,
          gameHtmlPath: generatedShell.gameHtmlPath,
          artifactStatus: "approved_ready",
          brief: { ...generatedShell.experienceBrief, briefId: "reuse" } satisfies BaselineMechanicBrief,
        } satisfies BaselineShellArtifact,
        activityConfigPath: refill.activityConfigPath,
        configPathByNodeId: laneConfigs,
      });
    }
    return;
  }

  const briefs = await generateBaselineMechanicBriefCandidates({
    chart,
    gap: decision.gap,
    rootDir: input.rootDir,
    homeworkBody: input.assignment.body,
  });
  printBaselineBriefMenu(briefs);
  const lessons = readContentFeedbackLessons(input.rootDir, input.childId);
  const preferenceSummary = distillContentFeedbackSummary(lessons);
  console.log("\nPreference summary for generation:\n", preferenceSummary);

  const pick = pickBriefIndexFromFeedback(
    briefs,
    lessons,
    input.pickBriefIndex ??
      (input.autoMode
        ? undefined
        : Number(await promptLine(`Pick mechanic brief [1-${briefs.length}]: `)) - 1),
  );
  const brief = briefs[pick] ?? briefs[0];
  if (!brief) throw new Error("No mechanic brief selected");

  const artifact = await generateBaselineShellWithLlm({
    chart,
    gap: decision.gap,
    brief,
    homeworkId: input.assignment.homeworkId,
    configFilename: input.assignment.configFilename,
    homework: {
      title: input.assignment.title,
      body: input.assignment.body,
      rounds: input.assignment.rounds,
    },
    configFilePath: configPath,
    rootDir: input.rootDir,
    validationOutputDir: path.join(downloadsDir(), `${input.assignment.homeworkId}-validation`),
  });

  copyGameplayScreenshotsToDownloads(artifact, input.assignment);

  const decisionText =
    input.autoApprove || input.autoMode
      ? "approve"
      : await promptLine("Review generated shell [approve/revise/reject]: ");
  const reason =
    input.reviewReason ??
    (decisionText === "approve"
      ? "Fun, engaging, and teaches the concept."
      : input.autoMode
        ? "Auto-approved for demo run."
        : await promptLine("Reason: "));
  reviewBaselineShellArtifact({
    rootDir: input.rootDir,
    childId: input.childId,
    artifact,
    decision: decisionText === "approve" ? "approve" : decisionText === "reject" ? "reject" : "revise",
    reason,
  });
  upsertCatalogItem(
    input.rootDir,
    input.childId,
    catalogBaselineShellArtifact({
      artifact,
      childId: input.childId,
      homeworkId: input.assignment.homeworkId,
      evidenceUsed: [input.assignment.homeworkId],
    }),
  );
  if (decisionText === "approve") {
    const laneConfigs = refillBaselineLaneConfigs({
      rootDir: input.rootDir,
      childId: input.childId,
      homeworkId: pendingHomeworkId,
      title: input.assignment.title,
      homeworkRounds: input.assignment.rounds,
      nodes: getChildChart(input.childId, { rootDir: input.rootDir }).homework.pending?.nodes ?? [],
    });
    attachBaselineShellToHomework({
      rootDir: input.rootDir,
      childId: input.childId,
      artifact: { ...artifact, artifactStatus: "approved_ready" },
      activityConfigPath,
      configPathByNodeId: laneConfigs,
    });
  }
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const childId = "demo-pashley";
  const replayFeedback = process.argv.includes("--replay-feedback");
  const autoMode = process.env.SUNNY_DEMO_AUTO === "true" || process.argv.includes("--auto");

  console.log("🎮 [demo:game-factory] Generating Pashley PDFs into Downloads...");
  for (const assignment of ASSIGNMENTS) {
    const pdfPath = path.join(downloadsDir(), assignment.filename);
    await writePdfFromHtml(pdfPath, assignment.title, assignment.body);
    console.log(`PDF saved: ${pdfPath}`);
  }

  const incomingDir = path.join(resolveChildContextDir(childId, { rootDir }), "homework", "incoming");
  fs.mkdirSync(incomingDir, { recursive: true });

  console.log("\n=== PDF 1: time/money (reuse path) ===");
  const pdf1 = path.join(downloadsDir(), ASSIGNMENTS[0]!.filename);
  fs.copyFileSync(pdf1, path.join(incomingDir, ASSIGNMENTS[0]!.filename));
  await ingestAssignmentPdf({ rootDir, childId, pdfPath: pdf1 });
  await runAssignment({ rootDir, childId, assignment: ASSIGNMENTS[0]!, autoMode });

  console.log("\n=== PDF 2: multiplication (gap + generation) ===");
  const pdf2 = path.join(downloadsDir(), ASSIGNMENTS[1]!.filename);
  fs.copyFileSync(pdf2, path.join(incomingDir, ASSIGNMENTS[1]!.filename));
  await ingestAssignmentPdf({ rootDir, childId, pdfPath: pdf2 });
  await runAssignment({
    rootDir,
    childId,
    assignment: ASSIGNMENTS[1]!,
    pickBriefIndex: 0,
    autoApprove: replayFeedback || autoMode,
    reviewReason: replayFeedback ? "Approved for demo replay." : autoMode ? "Auto-approved demo shell." : undefined,
    autoMode,
  });

  if (replayFeedback) {
    appendRejectLesson(rootDir, childId);
  }

  console.log("\n=== PDF 3: fractions (feedback-informed generation) ===");
  const pdf3 = path.join(downloadsDir(), ASSIGNMENTS[2]!.filename);
  fs.copyFileSync(pdf3, path.join(incomingDir, ASSIGNMENTS[2]!.filename));
  await ingestAssignmentPdf({ rootDir, childId, pdfPath: pdf3 });
  await runAssignment({
    rootDir,
    childId,
    assignment: ASSIGNMENTS[2]!,
    pickBriefIndex: replayFeedback ? 1 : undefined,
    autoMode,
  });
}

function appendRejectLesson(rootDir: string, childId: string): void {
  appendContentFeedbackLesson(rootDir, childId, {
    mechanic: "Falling targets show products; blast the one that matches the spoken fact.",
    theme: "adventure space arcade with streak rewards",
    decision: "reject",
    reason: "Timer pressure felt stressful; avoid rapid-fire timer mechanics.",
    source: "human_review",
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`🎮 [demo:game-factory] [failed] ${message}`);
  process.exit(1);
});
