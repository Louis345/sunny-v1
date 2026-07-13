import fs from "fs";
import os from "os";
import path from "path";
import { execSync, spawn } from "node:child_process";
import { chromium } from "playwright";
import { getChildChart } from "../profiles/childChart";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";
import { normalizeLearningRoutesForPlan } from "../engine/assignmentPlanner";
import { appendContentFeedbackLesson, readContentFeedbackLessons } from "../engine/contentFeedbackMemory";
import {
  encodeSunnyRuntimeConfig,
  resolveSunnyRuntimeConfig,
} from "../shared/runtimeConfig";
import { runIngestHomework } from "./ingestHomework";

const API_PORT = 3001;

const BOARD_THEME = {
  background: { type: "image" as const, value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
  palette: {
    path: "#ffffff",
    completed: "#1f8f68",
    available: "#7c3aed",
    locked: "#aeb7c2",
    current: "#f59e0b",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(15, 23, 42, 0.84)",
  },
};

function downloadsDir(): string {
  return path.join(os.homedir(), "Downloads");
}

function teachingNodeCount(nodePlan: Array<{ activityId?: string; type: string }>): number {
  return nodePlan.filter((node) => {
    const id = (node.activityId ?? node.type).toLowerCase();
    return !["mystery", "quest", "boss"].includes(id);
  }).length;
}

function validatePlan(childId: string, rootDir: string): void {
  const plan = getChildChart(childId, { rootDir }).activeSessionPlan;
  if (!plan) throw new Error(`No active session plan for ${childId}`);

  const normalized = normalizeLearningRoutesForPlan(plan.learningRoutes, plan.nodePlan);
  const board = buildAdventureBoardFromActiveSessionPlan({
    plan: {
      planId: plan.planId,
      childId: plan.childId,
      domain: plan.domain,
      nodePlan: plan.nodePlan.map((node) => ({
        id: node.id,
        type: node.type,
        activityId: node.activityId,
        targets: node.targets,
        targetLane: node.targetLane,
        locked: node.locked,
        choiceMode: node.choiceMode,
        masteryUnlockState: node.masteryUnlockState,
        difficulty: node.difficulty,
        wordRadarConfig: node.wordRadarConfig as never,
      })),
      learningRoutes: normalized.routes,
    },
    boardId: `verify-board-${childId}`,
    title: plan.domain,
    theme: BOARD_THEME,
  });

  const teachingNodes = teachingNodeCount(plan.nodePlan);
  const hasFork = board.nodes.some((node) => node.id === "choose-path");
  const hasMystery = board.nodes.some((node) => node.kind === "mystery");
  const hasQuest = board.nodes.some((node) => node.kind === "quest");
  const hasBoss = board.nodes.some((node) => node.kind === "boss");
  const questBrief = plan.generatedExperienceBriefs?.find((brief) => brief.kind === "quest");

  console.log(`🎮 [verify-math-dod] child=${childId} teachingNodes=${teachingNodes} routes=${normalized.routes.length} fork=${hasFork}`);
  if (teachingNodes < 3) throw new Error(`Expected >= 3 teaching nodes, got ${teachingNodes}`);
  if (!hasFork && normalized.routes.length >= 2) {
    throw new Error("Expected Choose Path fork when distinct learning routes exist");
  }
  if (!hasMystery || !hasQuest || !hasBoss) {
    throw new Error("Board missing mystery, quest, or boss destination");
  }
  if (!questBrief?.evidenceUsed?.length) {
    throw new Error("Quest brief must cite evidenceUsed from captured homework / attempts");
  }
  console.log(`🎮 [verify-math-dod] questBrief="${questBrief.title}" evidence=${questBrief.evidenceUsed.join(", ")}`);
}

async function isUrlReachable(baseUrl: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status === 304;
  } catch {
    return false;
  }
}

async function waitForApiHealth(port: number, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // API not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/**
 * The app resolves the active child from VITE_SUNNY_RUNTIME_CONFIG at build
 * time (useAdventureState reads import.meta.env), not from URL params. So the
 * board screenshot requires a bundle built with this child baked in.
 */
function runtimeEnvForChild(childId: string): NodeJS.ProcessEnv {
  const config = resolveSunnyRuntimeConfig(process.env, {
    subject: "homework",
    childId,
    homeworkDomain: "math",
    voiceMode: "muted",
  });
  const encoded = encodeSunnyRuntimeConfig(config);
  return {
    ...process.env,
    ADVENTURE_MAP: "true",
    VITE_ADVENTURE_MAP: "true",
    SUNNY_RUNTIME_CONFIG: encoded,
    VITE_SUNNY_RUNTIME_CONFIG: encoded,
    SUNNY_SUBJECT: "homework",
    SUNNY_CHILD: childId,
    VITE_DIAG_CHILD_ID: childId,
    SUNNY_HOMEWORK_DOMAIN: "math",
    VITE_SUNNY_HOMEWORK_DOMAIN: "math",
    TTS_ENABLED: "false",
  };
}

async function startWebStackForChild(childId: string): Promise<{ base: string; cleanup: () => void }> {
  const rootDir = process.cwd();
  const webDir = path.join(rootDir, "web");
  const env = runtimeEnvForChild(childId);

  console.log(`🎮 [verify-math-dod] [screenshot] building web bundle for child=${childId}...`);
  execSync("npm run build", { cwd: webDir, stdio: "inherit", env });

  if (await isUrlReachable(`http://localhost:${API_PORT}`)) {
    throw new Error(
      `Port ${API_PORT} is already in use; stop the running Sunny server first (its bundle would not have child=${childId} baked in).`,
    );
  }

  console.log(`🎮 [verify-math-dod] [screenshot] starting static web stack on port ${API_PORT}...`);
  const server = spawn("npx", ["tsx", "src/server.ts", "--serve-static"], {
    stdio: "inherit",
    env: { ...env, PORT: String(API_PORT) },
  });
  const ready = await waitForApiHealth(API_PORT);
  if (!ready) {
    server.kill();
    throw new Error(`Static web stack did not become ready on port ${API_PORT}`);
  }
  return {
    base: `http://localhost:${API_PORT}`,
    cleanup: () => {
      try {
        server.kill();
      } catch {
        // process may already be gone
      }
    },
  };
}

async function captureBoardScreenshot(childId: string): Promise<string> {
  const { base: webBase, cleanup } = await startWebStackForChild(childId);
  const outPath = path.join(downloadsDir(), `${childId}-math-board-verify.png`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${webBase}/`, { waitUntil: "networkidle", timeout: 120_000 });
    // The board is proven rendered by its node buttons, not by page load.
    await page.waitForSelector(".adventure-board__node", { timeout: 60_000 });
    const nodeLabels = await page.$$eval(".adventure-board__node", (els) =>
      els.map((el) => el.getAttribute("aria-label")),
    );
    const hasFork = nodeLabels.some((label) => label?.toLowerCase().includes("choose path"));
    console.log(`🎮 [verify-math-dod] [screenshot] boardNodes=${nodeLabels.length} fork=${hasFork} labels=${nodeLabels.join(" | ")}`);
    if (nodeLabels.length < 3) {
      throw new Error(`Rendered board shows only ${nodeLabels.length} nodes — expected the full math spine`);
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`🎮 [verify-math-dod] [screenshot] saved ${outPath} from ${webBase}`);
    return outPath;
  } finally {
    await browser.close();
    cleanup();
  }
}

async function recordSampleRouteChoice(childId: string, rootDir: string): Promise<void> {
  appendContentFeedbackLesson(rootDir, childId, {
    mechanic: "Picture It First",
    theme: "visual, control",
    decision: "approve",
    reason: "Verify script simulated board fork pick for preference loop.",
    source: "child_choice",
  });
  const lessons = readContentFeedbackLessons(rootDir, childId);
  const childChoices = lessons.filter((lesson) => lesson.source === "child_choice");
  if (childChoices.length === 0) throw new Error("Choice event lesson was not recorded");
  console.log(`🎮 [verify-math-dod] choiceLessons=${childChoices.length}`);
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const childId = "demo-pashley";
  const shouldIngest = process.argv.includes("--ingest");
  const shouldScreenshot = process.argv.includes("--screenshot");

  if (shouldIngest) {
    const pdfPath = process.argv.find((arg) => arg.endsWith(".pdf"))
      ?? path.join(downloadsDir(), "pashley-math-3-fractions.pdf");
    if (!fs.existsSync(pdfPath)) throw new Error(`Missing worksheet PDF: ${pdfPath}`);
    process.env.SUNNY_NON_INTERACTIVE = "true";
    console.log(`🎮 [verify-math-dod] [ingest] pdf=${pdfPath}`);
    await runIngestHomework([
      `--child=${childId}`,
      "--domain=math",
      `--pdf=${pdfPath}`,
    ]);
  }

  validatePlan(childId, rootDir);
  await recordSampleRouteChoice(childId, rootDir);
  const chart = getChildChart(childId, { rootDir });
  if (!chart.homework.pending?.nodes?.length) {
    throw new Error("Pending homework nodes missing after verify");
  }
  console.log(`🎮 [verify-math-dod] pendingNodes=${chart.homework.pending.nodes.length}`);

  if (shouldScreenshot) {
    await captureBoardScreenshot(childId);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`🎮 [verify-math-dod] [failed] ${message}`);
  process.exit(1);
});
