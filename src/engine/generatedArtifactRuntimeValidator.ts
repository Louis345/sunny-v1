import { execFile, spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import WebSocket from "ws";
import type {
  AdaptiveArtifactRuntimeValidationReport,
  AdaptiveArtifactValidationReport,
} from "../shared/adventureTypes";

const execFileAsync = promisify(execFile);
const VIEWPORT = { width: 1365, height: 768 };

type CdpResponse = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};

type CdpClient = {
  send: <T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<T>;
  close: () => void;
};

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

export type GeneratedArtifactRuntimeValidationInput = {
  html: string;
  childId: string;
  stage: "quest" | "boss";
  homeworkType: string;
  words: string[];
  outputDir: string;
  now?: Date;
  runBrowser?: (input: GeneratedArtifactRuntimeValidationInput) => Promise<GeneratedArtifactBrowserSnapshot>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findChrome(): Promise<string> {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const command of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      const { stdout } = await execFileAsync("which", [command]);
      const found = stdout.trim();
      if (found) return found;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("No Chrome/Chromium binary found. Set CHROME_BIN to run generated artifact validation.");
}

async function createCdpClient(wsUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.once("open", resolveOpen);
    socket.once("error", rejectOpen);
  });

  let nextId = 1;
  const pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }>();

  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as CdpResponse;
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(message.error.message ?? "CDP command failed."));
      return;
    }
    waiter.resolve(message.result);
  });

  socket.on("close", () => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error("Chrome DevTools socket closed."));
    }
    pending.clear();
  });

  return {
    send<T = unknown>(method: string, params = {}, sessionId?: string): Promise<T> {
      const id = nextId;
      nextId += 1;
      const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
      const response = new Promise<T>((resolveSend, rejectSend) => {
        pending.set(id, { resolve: (value) => resolveSend(value as T), reject: rejectSend });
      });
      socket.send(JSON.stringify(payload));
      return response;
    },
    close() {
      socket.close();
    },
  };
}

async function launchChrome(chrome: string): Promise<{
  client: CdpClient;
  process: ChildProcess;
  userDataDir: string;
}> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "sunny-artifact-validator-chrome-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const wsUrl = await new Promise<string>((resolveUrl, rejectUrl) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      rejectUrl(new Error(`Timed out waiting for Chrome DevTools URL. ${stderr}`));
    }, 8000);
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolveUrl(match[1]!);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      rejectUrl(new Error(`Chrome exited before DevTools was ready: ${String(code)}. ${stderr}`));
    });
  });

  return {
    client: await createCdpClient(wsUrl),
    process: child,
    userDataDir,
  };
}

async function serveArtifact(html: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const publicDir = path.join(process.cwd(), "web", "public");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/artifact.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (url.pathname.startsWith("/games/")) {
      const file = path.join(publicDir, url.pathname.replace(/^\//, ""));
      if (fs.existsSync(file)) {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
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

function normalizeMessagePayload(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const record = message as Record<string, unknown>;
  return record.payload && typeof record.payload === "object" ? record.payload : record;
}

async function runChromeBrowser(input: GeneratedArtifactRuntimeValidationInput): Promise<GeneratedArtifactBrowserSnapshot> {
  const chrome = await findChrome();
  const server = await serveArtifact(input.html);
  const browser = await launchChrome(chrome);
  try {
    const { targetId } = await browser.client.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.client.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true },
    );
    await browser.client.send("Page.enable", {}, sessionId);
    await browser.client.send("Runtime.enable", {}, sessionId);
    await browser.client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: instrumentationScript(),
    }, sessionId);
    await browser.client.send("Emulation.setDeviceMetricsOverride", {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
    const params = new URLSearchParams({
      childId: input.childId,
      nodeId: `validation-${input.stage}`,
      sessionId: "artifact-validation",
      preview: "go-live",
      words: input.words.join(","),
      isQuest: input.stage === "quest" ? "true" : "false",
    });
    await browser.client.send("Page.navigate", { url: `${server.baseUrl}/artifact.html?${params}` }, sessionId);
    for (let i = 0; i < 60; i += 1) {
      const ready = await browser.client.send<{ result?: { value?: boolean } }>(
        "Runtime.evaluate",
        { expression: "document.readyState === 'complete'", returnByValue: true },
        sessionId,
      );
      if (ready.result?.value) break;
      await delay(100);
    }
    await delay(300);
    const hook = await browser.client.send<{ result?: { value?: { used: boolean; error?: string } } }>(
      "Runtime.evaluate",
      {
        expression: `
          ${playthroughScript(input.words)}.catch((err) => ({ used: false, error: String(err && err.message ? err.message : err) }))
        `,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    const screenshot = await browser.client.send<{ data: string }>(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false, fromSurface: true },
      sessionId,
    );
    await mkdir(input.outputDir, { recursive: true });
    const screenshotPath = path.join(input.outputDir, `${input.stage}-runtime.png`);
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    const state = await browser.client.send<{
      result?: {
        value?: {
          bodyText?: string;
          messages?: unknown[];
          consoleErrors?: string[];
          pageErrors?: string[];
        };
      };
    }>(
      "Runtime.evaluate",
      {
        expression: `(() => ({
          bodyText: document.body ? document.body.innerText : "",
          messages: window.__sunnyValidation?.messages || [],
          consoleErrors: window.__sunnyValidation?.consoleErrors || [],
          pageErrors: window.__sunnyValidation?.pageErrors || []
        }))()`,
        returnByValue: true,
      },
      sessionId,
    );
    const value = state.result?.value ?? {};
    const messages = Array.isArray(value.messages) ? value.messages : [];
    return {
      screenshotPaths: [screenshotPath],
      bodyText: String(value.bodyText ?? ""),
      consoleErrors: value.consoleErrors ?? [],
      pageErrors: value.pageErrors ?? [],
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
      validationHookResult: hook.result?.value ?? { used: false },
    };
  } finally {
    browser.client.close();
    browser.process.kill();
    await rm(browser.userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
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
  const snapshot = await (input.runBrowser ?? runChromeBrowser)(input);
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
