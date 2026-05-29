import { spawn, type ChildProcess } from "node:child_process";
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
} from "../engine/generatedExperienceArtifact";
import { resolveSyntheticChildBrowserAvailability } from "../engine/syntheticChildBrowserDriver";
import { initializeLearningProfile } from "../utils/learningProfileIO";

const CHILD_ID = "reina";
const HOMEWORK_ID = "hw-quest-boss-smoke";
const GAME_DATE = "2026-05-27";
const WORDS = ["sign", "know", "write"];

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
    `${useAi ? "paid-ai=true model=claude-sonnet-4-20250514" : "paid-ai=false deterministic fixture"} stage=${stageFilter ?? "quest,boss"}`,
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
    model: useAi ? "claude-sonnet-4-20250514" : "deterministic-smoke-html",
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
      `- model: ${useAi ? "claude-sonnet-4-20250514" : "deterministic-smoke-html"}`,
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

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`🎮 [quest-boss-smoke] [failed] ${message}`);
  process.exitCode = 1;
});
