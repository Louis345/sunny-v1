import http from "node:http";
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  AdaptiveArtifactRuntimeValidationReport,
  AdaptiveArtifactValidationReport,
} from "../shared/adventureTypes";
import { resolveSyntheticChildBrowserAvailability } from "./syntheticChildBrowserDriver";

const VIEWPORT = { width: 1365, height: 768 };

export type GeneratedArtifactBrowserSnapshot = {
  screenshotPaths: string[];
  bodyText: string;
  consoleErrors: string[];
  pageErrors: string[];
  attemptEvents: unknown[];
  companionEvents: unknown[];
  completionEvents: unknown[];
  validationHookResult: { used: boolean; error?: string };
};

export type GeneratedArtifactActivityConfigRoute = {
  urlPath: string;
  filePath: string;
};

export type GeneratedArtifactRuntimeValidationInput = {
  html: string;
  childId: string;
  stage: "quest" | "boss" | "baseline";
  homeworkType: string;
  words: string[];
  outputDir: string;
  now?: Date;
  activityConfig?: GeneratedArtifactActivityConfigRoute;
  runBrowser?: (input: GeneratedArtifactRuntimeValidationInput) => Promise<GeneratedArtifactBrowserSnapshot>;
};

function contentTypeForPublicAsset(filePath: string): string {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function serveArtifact(
  html: string,
  activityConfig?: GeneratedArtifactActivityConfigRoute,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const publicDir = path.join(process.cwd(), "web", "public");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/artifact.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (
      activityConfig &&
      url.pathname === activityConfig.urlPath &&
      fs.existsSync(activityConfig.filePath)
    ) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(fs.readFileSync(activityConfig.filePath));
      return;
    }
    if (url.pathname.startsWith("/api/activity-config/") && activityConfig?.filePath) {
      if (url.pathname === activityConfig.urlPath && fs.existsSync(activityConfig.filePath)) {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(fs.readFileSync(activityConfig.filePath));
        return;
      }
    }
    if (url.pathname.startsWith("/games/")) {
      const file = path.join(publicDir, url.pathname.replace(/^\//, ""));
      if (fs.existsSync(file)) {
        res.writeHead(200, { "content-type": contentTypeForPublicAsset(file) });
        res.end(fs.readFileSync(file));
        return;
      }
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not bind artifact validation server.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
}

function instrumentationScript(): string {
  return `
(() => {
  const store = {
    messages: [],
    consoleErrors: [],
    pageErrors: []
  };
  window.__sunnyValidation = store;
  window.addEventListener("message", (event) => {
    store.messages.push(event.data);
  });
  const originalError = console.error;
  console.error = (...args) => {
    store.consoleErrors.push(args.map(String).join(" "));
    originalError.apply(console, args);
  };
  window.addEventListener("error", (event) => {
    store.pageErrors.push(String(event.message || "page error"));
  });
  window.addEventListener("unhandledrejection", (event) => {
    store.pageErrors.push(String(event.reason && event.reason.message ? event.reason.message : event.reason));
  });
})();
`;
}

function playthroughScript(words: string[]): string {
  return `
(async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const words = ${JSON.stringify(words)};
  if (window.SUNNY_VALIDATION_HOOKS && typeof window.SUNNY_VALIDATION_HOOKS.playthrough === "function") {
    await window.SUNNY_VALIDATION_HOOKS.playthrough({ words });
    await delay(250);
    return { used: true };
  }
  let steps = 0;
  for (let index = 0; index < 30; index += 1) {
    steps += 1;
    const input = Array.from(document.querySelectorAll("input, textarea"))
      .find((el) => !el.disabled && el.offsetParent !== null);
    if (input) {
      input.focus();
      input.value = words[Math.min(index, Math.max(0, words.length - 1))] || "answer";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const buttons = Array.from(document.querySelectorAll("button"))
      .filter((button) => !button.disabled && button.offsetParent !== null);
    const button = buttons.find((item) => /start|go|submit|check|next|finish|complete|answer/i.test(item.textContent || "")) || buttons[0];
    if (button) button.click();
    await delay(180);
    const messages = window.__sunnyValidation?.messages || [];
    if (messages.some((message) => message && (message.type === "node_complete" || message.type === "game_complete"))) {
      break;
    }
  }
  await delay(250);
  return { used: false, steps };
})()
`;
}

function completionObservedScript(): string {
  return `
(() => {
  const messages = window.__sunnyValidation?.messages || [];
  return messages.some((message) => message && (message.type === "node_complete" || message.type === "game_complete"));
})()
`;
}

function normalizeMessagePayload(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const record = message as Record<string, unknown>;
  return record.payload && typeof record.payload === "object" ? record.payload : record;
}

async function runPlaywrightBrowser(input: GeneratedArtifactRuntimeValidationInput): Promise<GeneratedArtifactBrowserSnapshot> {
  const availability = await resolveSyntheticChildBrowserAvailability();
  if (!availability.available) {
    throw new Error(`Playwright unavailable: ${availability.reason ?? "unknown reason"}`);
  }
  const server = await serveArtifact(input.html, input.activityConfig);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  const browserConsoleErrors: string[] = [];
  const browserPageErrors: string[] = [];
  const screenshotPaths: string[] = [];
  const captureGameplayFrames = input.stage === "baseline" ? 3 : 1;
  try {
    page.on("console", (message) => {
      if (message.type() === "error") browserConsoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      browserPageErrors.push(error.message);
    });
    await page.addInitScript(instrumentationScript());
    const params = new URLSearchParams({
      childId: input.childId,
      nodeId: `validation-${input.stage}`,
      sessionId: "artifact-validation",
      preview: "go-live",
      words: input.words.join(","),
      isQuest: input.stage === "quest" ? "true" : "false",
    });
    if (input.activityConfig) {
      params.set("config", input.activityConfig.urlPath);
    }
    await page.goto(`${server.baseUrl}/artifact.html?${params}`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    await mkdir(input.outputDir, { recursive: true });

    if (captureGameplayFrames >= 3) {
      const loadPath = path.join(input.outputDir, `${input.stage}-load.png`);
      await page.screenshot({ path: loadPath, fullPage: true });
      screenshotPaths.push(loadPath);
    }

    const playPromise = page.evaluate<{ used: boolean; error?: string }>(
      `${playthroughScript(input.words)}.catch((err) => ({ used: false, error: String(err && err.message ? err.message : err) }))`,
    );

    if (captureGameplayFrames >= 3) {
      await page.waitForTimeout(600);
      const midPath = path.join(input.outputDir, `${input.stage}-midplay.png`);
      await page.screenshot({ path: midPath, fullPage: true });
      screenshotPaths.push(midPath);
    }

    const hook = await playPromise;
    await page.waitForFunction(completionObservedScript(), null, { timeout: 2500 }).catch(() => undefined);

    if (captureGameplayFrames >= 3) {
      const completePath = path.join(input.outputDir, `${input.stage}-completion.png`);
      await page.screenshot({ path: completePath, fullPage: true });
      screenshotPaths.push(completePath);
    } else {
      const screenshotPath = path.join(input.outputDir, `${input.stage}-runtime.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshotPaths.push(screenshotPath);
    }

    const value = await page.evaluate<{
      bodyText?: string;
      messages?: unknown[];
      consoleErrors?: string[];
      pageErrors?: string[];
    }>(`(() => {
      const validation = window.__sunnyValidation || {};
      return {
        bodyText: document.body ? document.body.innerText : "",
        messages: validation.messages || [],
        consoleErrors: validation.consoleErrors || [],
        pageErrors: validation.pageErrors || []
      };
    })()`);
    const messages = Array.isArray(value.messages) ? value.messages : [];
    return {
      screenshotPaths,
      bodyText: String(value.bodyText ?? ""),
      consoleErrors: [...browserConsoleErrors, ...(value.consoleErrors ?? [])],
      pageErrors: [...browserPageErrors, ...(value.pageErrors ?? [])],
      attemptEvents: messages
        .filter((message) => (message as { type?: unknown })?.type === "attempt_event")
        .map(normalizeMessagePayload),
      companionEvents: messages
        .filter((message) => (message as { type?: unknown })?.type === "companion_event")
        .map(normalizeMessagePayload),
      completionEvents: messages
        .filter((message) => {
          const type = (message as { type?: unknown })?.type;
          return type === "node_complete" || type === "game_complete";
        })
        .map(normalizeMessagePayload),
      validationHookResult: hook ?? { used: false },
    };
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

function targetFromAttempt(attempt: unknown): string | null {
  if (!attempt || typeof attempt !== "object") return null;
  const record = attempt as Record<string, unknown>;
  const raw = record.target ?? record.word;
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
}

export async function validateGeneratedArtifactRuntime(
  input: GeneratedArtifactRuntimeValidationInput,
): Promise<AdaptiveArtifactValidationReport> {
  const now = input.now ?? new Date();
  let snapshot: GeneratedArtifactBrowserSnapshot;
  try {
    snapshot = await (input.runBrowser ?? runPlaywrightBrowser)(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const runtimeValidation: AdaptiveArtifactRuntimeValidationReport = {
      engine: "playwright",
      passed: false,
      screenshotPaths: [],
      consoleErrors: [],
      pageErrors: [message],
      attemptedTargets: 0,
      completed: false,
      completionPayloads: [],
      usedValidationHook: false,
    };
    return {
      passed: false,
      score: 0,
      failures: [`Playwright runtime validation failed: ${message}`],
      warnings: [],
      attempts: 1,
      validatedAt: now.toISOString(),
      runtimeValidation,
    };
  }
  const failures: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!snapshot.bodyText.trim()) {
    failures.push("Runtime validation rendered a blank artifact.");
    score -= 40;
  }
  if (snapshot.consoleErrors.length > 0) {
    failures.push(`Runtime console errors: ${snapshot.consoleErrors.join(" | ")}`);
    score -= 20;
  }
  if (snapshot.pageErrors.length > 0) {
    failures.push(`Runtime page errors: ${snapshot.pageErrors.join(" | ")}`);
    score -= 20;
  }
  if (snapshot.screenshotPaths.length === 0) {
    failures.push("Runtime validation did not capture a screenshot.");
    score -= 20;
  }
  if (input.stage === "baseline" && snapshot.screenshotPaths.length < 3) {
    failures.push(`Baseline runtime validation expected 3 gameplay screenshots, got ${snapshot.screenshotPaths.length}.`);
    score -= 15;
  }

  const attemptedTargets = new Set(snapshot.attemptEvents.map(targetFromAttempt).filter(Boolean)).size;
  const expectedAttempts = input.words.length > 0 ? input.words.length : 1;
  if (attemptedTargets < expectedAttempts) {
    failures.push(`Runtime attempt event count ${attemptedTargets}/${expectedAttempts} is too low.`);
    score -= 30;
  }
  const completed = snapshot.completionEvents.length > 0;
  if (!completed) {
    failures.push("Runtime validation did not observe node_complete/game_complete.");
    score -= 30;
  }
  if (input.stage === "boss" && input.homeworkType === "spelling_test") {
    const visible = input.words.find((word) =>
      word.length > 2 && snapshot.bodyText.toLowerCase().includes(word.toLowerCase()),
    );
    if (visible) {
      failures.push(`Boss runtime validation found visible spelling target "${visible}".`);
      score -= 30;
    }
  }
  if (!snapshot.validationHookResult.used) {
    warnings.push("Runtime validation used generic click/type playthrough; add SUNNY_VALIDATION_HOOKS.playthrough for reliable QA.");
    score -= 5;
  }
  if (snapshot.validationHookResult.error) {
    failures.push(`Runtime validation hook failed: ${snapshot.validationHookResult.error}`);
    score -= 20;
  }

  const runtimeValidation: AdaptiveArtifactRuntimeValidationReport = {
    engine: "playwright",
    passed: failures.length === 0,
    screenshotPaths: [...snapshot.screenshotPaths],
    consoleErrors: [...snapshot.consoleErrors],
    pageErrors: [...snapshot.pageErrors],
    attemptedTargets,
    completed,
    completionPayloads: [...snapshot.completionEvents],
    usedValidationHook: snapshot.validationHookResult.used,
  };

  return {
    passed: failures.length === 0,
    score: Math.max(0, score),
    failures,
    warnings,
    attempts: 1,
    validatedAt: now.toISOString(),
    runtimeValidation,
  };
}
