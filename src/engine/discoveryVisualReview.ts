import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";

export const DISCOVERY_RELEASE_VIEWPORTS = [
  { name: "generation", width: 1365, height: 768 },
  { name: "sunny", width: 1280, height: 720 },
] as const;

export type DiscoveryVisualReviewAudit = {
  status: "approved" | "rejected_after_repair";
  controllingGate: "browser";
  iterations: Array<{
    iteration: 1 | 2;
    htmlHash: string;
    screenshotPath: string;
    screenshotPaths: string[];
    issues: string[];
  }>;
};

type RenderInput = { html: string; iteration: 1 | 2; outputDir: string };
type DiscoveryRenderedScreenshots = string[] & { issues?: string[] };
type RepairInput = { html: string; issues: string[]; screenshotPaths: string[] };
type BrowserPage = Awaited<ReturnType<Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>["newPage"]>>;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeAudit(outputDir: string, audit: DiscoveryVisualReviewAudit): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const target = path.join(outputDir, "visual-review.json");
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

type VisualReviewCheckpoint = {
  version: 2;
  initialHtmlHash: string;
  html: string;
  iterations: DiscoveryVisualReviewAudit["iterations"];
};

function writeReviewCheckpoint(outputDir: string, checkpoint: VisualReviewCheckpoint): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const target = path.join(outputDir, "visual-review-checkpoint.json");
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

export async function reviewDiscoveryCandidate(input: {
  html: string;
  outputDir: string;
  render: (input: RenderInput) => Promise<DiscoveryRenderedScreenshots>;
  repair: (input: RepairInput) => Promise<string>;
}): Promise<{ html: string; audit: DiscoveryVisualReviewAudit }> {
  const initialHtmlHash = hash(input.html);
  const checkpointFile = path.join(input.outputDir, "visual-review-checkpoint.json");
  let checkpoint: VisualReviewCheckpoint | null = null;
  try {
    const saved = JSON.parse(fs.readFileSync(checkpointFile, "utf8")) as VisualReviewCheckpoint;
    if (saved.version === 2 && saved.initialHtmlHash === initialHtmlHash && typeof saved.html === "string" && Array.isArray(saved.iterations)) {
      checkpoint = saved;
    }
  } catch {
    checkpoint = null;
  }
  let html = checkpoint?.html ?? input.html;
  const iterations: DiscoveryVisualReviewAudit["iterations"] = checkpoint?.iterations ?? [];

  const prior = iterations.at(-1);
  if (prior && prior.issues.length === 0) {
    const audit: DiscoveryVisualReviewAudit = { status: "approved", controllingGate: "browser", iterations };
    writeAudit(input.outputDir, audit);
    console.log(` 🎮 [adaptive-math] [visual-review] [reused] iteration=${prior.iteration}`);
    return { html, audit };
  }
  if (prior?.iteration === 1 && prior.issues.length > 0 && hash(html) === prior.htmlHash) {
    html = await input.repair({ html, issues: prior.issues, screenshotPaths: prior.screenshotPaths ?? [prior.screenshotPath] });
    writeReviewCheckpoint(input.outputDir, { version: 2, initialHtmlHash, html, iterations });
  }

  for (const iteration of [1, 2] as const) {
    if (iterations.some((saved) => saved.iteration === iteration)) continue;
    const screenshotPaths = await input.render({ html, iteration, outputDir: input.outputDir });
    const deterministicIssues = screenshotPaths.issues ?? [];
    const screenshotPath = screenshotPaths[0];
    if (!screenshotPath) throw new Error("discovery_visual_screenshot_missing");
    iterations.push({ iteration, htmlHash: hash(html), screenshotPath, screenshotPaths, issues: deterministicIssues });
    writeReviewCheckpoint(input.outputDir, { version: 2, initialHtmlHash, html, iterations });
    console.log(` 🎮 [adaptive-math] [visual-review] [${deterministicIssues.length === 0 ? "approve" : "repair_required"}] iteration=${iteration} gate=browser`);

    if (deterministicIssues.length === 0) {
      const audit: DiscoveryVisualReviewAudit = {
        status: "approved",
        controllingGate: "browser",
        iterations,
      };
      writeAudit(input.outputDir, audit);
      return { html, audit };
    }
    if (iteration === 1) {
      html = await input.repair({ html, issues: deterministicIssues, screenshotPaths });
      writeReviewCheckpoint(input.outputDir, { version: 2, initialHtmlHash, html, iterations });
      continue;
    }
  }

  const audit: DiscoveryVisualReviewAudit = {
    status: "rejected_after_repair",
    controllingGate: "browser",
    iterations,
  };
  writeAudit(input.outputDir, audit);
  throw new Error("discovery_visual_review_failed_after_bounded_repair");
}

async function serveHtml(html: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("discovery_visual_server_failed");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function withDiscoveryBrowserPage<T>(
  html: string,
  run: (page: BrowserPage) => Promise<T>,
  viewport: { width: number; height: number } = { width: 1365, height: 768 },
): Promise<T> {
  const server = await serveHtml(html);
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(server.url, { waitUntil: "networkidle" });
    if (pageErrors.length > 0) throw new Error(`discovery_browser_exception:${pageErrors.join("|")}`);
    const result = await run(page);
    if (pageErrors.length > 0) throw new Error(`discovery_browser_exception:${pageErrors.join("|")}`);
    return result;
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await server.close();
    }
  }
}

export async function renderDiscoveryCandidate(input: RenderInput): Promise<DiscoveryRenderedScreenshots> {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const screenshots = [] as DiscoveryRenderedScreenshots;
  const issues: string[] = [];
  for (const viewport of DISCOVERY_RELEASE_VIEWPORTS) {
    const rendered = await withDiscoveryBrowserPage(input.html, async (page) => {
      const usability = await page.evaluate(() => {
        type BrowserElement = {
          id: string;
          tagName: string;
          textContent: string | null;
          getAttribute: (name: string) => string | null;
          getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
        };
        const browser = globalThis as unknown as {
          document: { querySelectorAll: (selector: string) => Iterable<BrowserElement> };
          getComputedStyle: (element: BrowserElement) => { display: string; visibility: string; opacity: string };
          innerWidth: number;
          innerHeight: number;
        };
        const candidates = [...browser.document.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[role="button"],[data-sunny-required-action]',
        )];
        const visible = candidates.filter((element) => {
          const style = browser.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
        });
        const clipped = visible.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < 0 || rect.top < 0 || rect.right > browser.innerWidth || rect.bottom > browser.innerHeight;
        }).map((element) => element.id || element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 40) || element.tagName);
        return { visibleCount: visible.length, clipped };
      });
      if (usability.visibleCount === 0) throw new Error(`discovery_required_action_missing:${viewport.name}`);
      const target = path.join(input.outputDir, `iteration-${input.iteration}-${viewport.name}-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: target, fullPage: false });
      return {
        path: target,
        issues: usability.clipped.length > 0
          ? [`${viewport.name}:required_action_clipped:${usability.clipped.join("|")}`]
          : [],
      };
    }, viewport);
    screenshots.push(rendered.path);
    issues.push(...rendered.issues);
  }
  screenshots.issues = issues;
  return screenshots;
}
