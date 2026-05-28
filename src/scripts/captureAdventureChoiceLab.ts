import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { resolveSyntheticChildBrowserAvailability } from "../engine/syntheticChildBrowserDriver";

type SmokeScenario = {
  storyId: string;
  buttonName: string;
  expectedChoiceKind: string;
  outputName: string;
};

const SCENARIOS: SmokeScenario[] = [
  {
    storyId: "adventure-board-json-renderer--quest-choice-unlocked",
    buttonName: "Quest",
    expectedChoiceKind: "quest-wrapper",
    outputName: "quest-unlocked.png",
  },
  {
    storyId: "adventure-board-json-renderer--boss-choice-unlocked",
    buttonName: "Boss",
    expectedChoiceKind: "boss-wrapper",
    outputName: "boss-unlocked.png",
  },
];

function log(action: string, result: string) {
  console.log(`🎮 [adventure-choice-lab] [${action}] ${result}`);
}

function parsePort(): number {
  const arg = process.argv.find((item) => item.startsWith("--port="));
  if (!arg) return 6007;
  const port = Number(arg.slice("--port=".length));
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`Invalid --port value: ${arg}`);
  }
  return port;
}

function getUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
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
}

async function waitForStorybook(baseUrl: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    if (await getUrl(`${baseUrl}/iframe.html`)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Storybook at ${baseUrl}`);
}

async function openChoiceModal(page: any, scenario: SmokeScenario): Promise<any> {
  const modal = page.getByTestId("adventure-choice-modal");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const nodeButton = page.getByRole("button", { name: scenario.buttonName, exact: true });
    await nodeButton.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(350);
    await nodeButton.click();
    try {
      await modal.waitFor({ state: "attached", timeout: 3_000 });
      const box = await modal.boundingBox();
      if (box && box.width > 0 && box.height > 0) return modal;
    } catch {
      log("retry", `${scenario.storyId} modal was not ready after click ${attempt}`);
    }
  }
  throw new Error(`Timed out opening ${scenario.expectedChoiceKind} modal in ${scenario.storyId}`);
}

function startStorybook(port: number): ChildProcess {
  const child = spawn(
    "npm",
    ["run", "storybook", "--", "--ci", "--no-open", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: path.join(process.cwd(), "web"),
      env: { ...process.env, NO_COLOR: "1" },
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

async function stopStorybook(child: ChildProcess): Promise<void> {
  if (child.killed) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1500);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  const availability = await resolveSyntheticChildBrowserAvailability();
  if (!availability.available) {
    throw new Error(`Playwright unavailable: ${availability.reason ?? "unknown reason"}`);
  }

  const port = parsePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const outputDir = path.join(process.cwd(), "web", "test-artifacts", "adventure-choice-lab");
  await fs.mkdir(outputDir, { recursive: true });
  if (await getUrl(baseUrl)) {
    throw new Error(`Port ${port} is already serving a page. Stop that server or pass --port=<free port>.`);
  }

  const storybook = startStorybook(port);
  try {
    await waitForStorybook(baseUrl);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    try {
      for (const scenario of SCENARIOS) {
        const url = `${baseUrl}/iframe.html?id=${scenario.storyId}&viewMode=story`;
        log("open", url);
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const modal = await openChoiceModal(page, scenario);
        const kind = await modal.getAttribute("data-choice-kind");
        if (kind !== scenario.expectedChoiceKind) {
          throw new Error(`Expected ${scenario.expectedChoiceKind} modal, got ${String(kind)}`);
        }

        const cards = modal.getByTestId("adventure-choice-card");
        const count = await cards.count();
        if (count < 2 || count > 3) {
          throw new Error(`Expected 2-3 choice cards for ${scenario.storyId}, got ${count}`);
        }
        for (let index = 0; index < count; index += 1) {
          const card = cards.nth(index);
          const report = await card.evaluate((element: any) => {
            const copy = element.querySelector(".adventure-choice-modal__copy");
            return {
              text: element.textContent?.trim() ?? "",
              copyOverflows: copy ? copy.scrollHeight > copy.clientHeight + 4 : false,
            };
          });
          if (!report.text) {
            throw new Error(`Choice card ${index + 1} in ${scenario.storyId} has no readable text.`);
          }
          if (report.copyOverflows) {
            throw new Error(`Choice card ${index + 1} in ${scenario.storyId} has overflowing copy.`);
          }
        }

        const outputPath = path.join(outputDir, scenario.outputName);
        await page.screenshot({ path: outputPath, fullPage: true });
        log("screenshot", outputPath);
      }
    } finally {
      await page.close();
      await browser.close();
    }
  } finally {
    await stopStorybook(storybook);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`🎮 [adventure-choice-lab] [failed] ${message}`);
  process.exitCode = 1;
});
