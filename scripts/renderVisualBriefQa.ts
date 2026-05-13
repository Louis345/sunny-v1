import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import WebSocket from "ws";

const execFileAsync = promisify(execFile);
const VIEWPORT = { width: 1600, height: 900 };
const CANONICAL_LAYERS = [
  "bgFar",
  "bgMid",
  "terrain",
  "medium",
  "actors",
  "terrainNear",
  "payload",
  "regionLabels",
  "accents",
] as const;

const PHASES = [
  { name: "intro", progress: 0, mockJumpLabel: "Before" },
  { name: "prediction", progress: 0.48, mockJumpLabel: "Predict" },
  { name: "reveal", progress: 0.78, mockJumpLabel: "Carrying" },
  { name: "complete", progress: 1, mockJumpLabel: "After" },
] as const;

const MOCK_SOURCES: Record<string, string> = {
  erosion: "/Users/jamaltaylor/Downloads/Sunny Explainer _ Erosion _standalone_.html",
  "red-blood-cells":
    "/Users/jamaltaylor/Downloads/Sunny Explainer _ Red Blood Cells _standalone_.html",
};

type PhaseName = (typeof PHASES)[number]["name"];

type QaFailure = {
  check: string;
  message: string;
  phase?: PhaseName;
};

type RawImage = {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
};

type CliOptions = {
  baseUrl: string;
  outDir: string;
  goldenDir: string;
  briefs: string[];
  keep: boolean;
  golden: boolean;
  updateGoldens: boolean;
  mockSource?: string;
  maxDiffPct: number;
};

type CdpResponse = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};

type CdpClient = {
  send: <T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ) => Promise<T>;
  close: () => void;
};

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let baseUrl = "http://localhost:5174";
  let outDir = "/tmp/sunny-visual-qa";
  let goldenDir = "goldens/visual-explainer";
  let keep = false;
  let golden = false;
  let updateGoldens = false;
  let mockSource: string | undefined;
  let maxDiffPct = 32;
  const briefs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--baseUrl") {
      baseUrl = args[(index += 1)] ?? baseUrl;
    } else if (arg === "--outDir") {
      outDir = args[(index += 1)] ?? outDir;
    } else if (arg === "--goldenDir") {
      goldenDir = args[(index += 1)] ?? goldenDir;
    } else if (arg === "--mock") {
      mockSource = args[(index += 1)];
    } else if (arg === "--maxDiffPct") {
      maxDiffPct = Number(args[(index += 1)] ?? maxDiffPct);
    } else if (arg === "--keep") {
      keep = true;
    } else if (arg === "--golden") {
      golden = true;
    } else if (arg === "--update-goldens") {
      updateGoldens = true;
      golden = true;
    } else if (!arg.startsWith("--")) {
      briefs.push(arg);
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    outDir: resolve(outDir),
    goldenDir: resolve(goldenDir),
    briefs: briefs.length > 0 ? briefs : ["erosion", "red-blood-cells"],
    keep,
    golden,
    updateGoldens,
    mockSource,
    maxDiffPct: Number.isFinite(maxDiffPct) ? maxDiffPct : 32,
  };
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
    if (existsSync(candidate)) return candidate;
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

  throw new Error("No Chrome/Chromium binary found. Set CHROME_BIN to run visual QA.");
}

function renderUrl(baseUrl: string, briefId: string, progress: number): string {
  const params = new URLSearchParams({
    brief: briefId,
    progress: String(progress),
  });
  return `${baseUrl}/__render?${params.toString()}`;
}

async function captureScreenshot(
  chrome: string,
  url: string,
  outputPath: string,
): Promise<void> {
  await withMockPage(chrome, url, async (client, sessionId) => {
    const screenshot = await captureMockElement(client, sessionId);
    await normalizeToViewport(screenshot, outputPath);
  });
}

async function dumpDom(chrome: string, url: string): Promise<string> {
  const { stdout } = await execFileAsync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--virtual-time-budget=5000",
    "--dump-dom",
    url,
  ]);
  return stdout;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function createCdpClient(wsUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.once("open", resolveOpen);
    socket.once("error", rejectOpen);
  });

  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }
  >();

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

async function launchChromeWithCdp(chrome: string): Promise<{
  client: CdpClient;
  process: ChildProcess;
  userDataDir: string;
}> {
  const userDataDir = await mkdtemp(join(tmpdir(), "sunny-visual-qa-chrome-"));
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

async function withMockPage<T>(
  chrome: string,
  urlOrPath: string,
  run: (client: CdpClient, sessionId: string) => Promise<T>,
): Promise<T> {
  const browser = await launchChromeWithCdp(chrome);
  try {
    const { targetId } = await browser.client.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await browser.client.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true },
    );
    await browser.client.send("Page.enable", {}, sessionId);
    await browser.client.send("Runtime.enable", {}, sessionId);
    await browser.client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );
    const url = /^https?:\/\//.test(urlOrPath) ? urlOrPath : pathToFileURL(urlOrPath).href;
    await browser.client.send("Page.navigate", { url }, sessionId);
    await waitForPageReady(browser.client, sessionId);
    return await run(browser.client, sessionId);
  } finally {
    browser.client.close();
    browser.process.kill();
    await rm(browser.userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 120,
    });
  }
}

async function waitForPageReady(client: CdpClient, sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await client.send<{ result?: { value?: boolean } }>(
      "Runtime.evaluate",
      {
        expression:
          "document.readyState === 'complete' && Boolean(document.querySelector('.scene-svg, [data-testid=\"visual-explainer-scene\"], svg'))",
        returnByValue: true,
      },
      sessionId,
    );
    if (result.result?.value) {
      await delay(800);
      return;
    }
    await delay(100);
  }
  throw new Error("Mock page never reached a renderable state.");
}

async function setMockProgress(
  client: CdpClient,
  sessionId: string,
  progress: number,
  jumpLabel: string,
): Promise<void> {
  const expression = `
    (() => {
      const progress = ${JSON.stringify(progress)};
      const jumpLabel = ${JSON.stringify(jumpLabel)};
      document.querySelectorAll('.companion-tag, .burst-layer').forEach((node) => {
        node.style.display = 'none';
      });
      const jump = document.querySelector('[aria-label="Jump to ' + jumpLabel + '"]');
      if (jump) jump.click();
      const input = document.querySelector('.rail-input');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const value = String(Math.round(progress * 1000));
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.__SUNNY_RENDER_PROGRESS__ = progress;
      return {
        ok: true,
        progress,
        inputValue: input?.value ?? null,
        pct: document.querySelector('.t-pct')?.textContent ?? null,
        phase: document.querySelector('.t-now')?.textContent ?? null
      };
    })()
  `;
  await client.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  await delay(900);
}

async function captureMockElement(client: CdpClient, sessionId: string): Promise<Buffer> {
  const clipResult = await client.send<{
    result?: {
      value?: { x: number; y: number; width: number; height: number };
    };
  }>(
    "Runtime.evaluate",
    {
      expression: `
        (() => {
          const el =
            document.querySelector('.scene-svg') ||
            document.querySelector('[data-testid="visual-explainer-scene"]') ||
            document.querySelector('svg') ||
            document.body;
          const r = el.getBoundingClientRect();
          return {
            x: Math.max(0, r.x),
            y: Math.max(0, r.y),
            width: Math.max(1, r.width),
            height: Math.max(1, r.height)
          };
        })()
      `,
      returnByValue: true,
    },
    sessionId,
  );
  const clip = clipResult.result?.value;
  if (!clip) throw new Error("Could not resolve mock scene clip.");

  const screenshot = await client.send<{ data: string }>(
    "Page.captureScreenshot",
    {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
      clip: { ...clip, scale: 1 },
    },
    sessionId,
  );
  return Buffer.from(screenshot.data, "base64");
}

async function normalizeToViewport(input: Buffer | string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(input)
    .resize(VIEWPORT.width, VIEWPORT.height, { fit: "cover", position: "center" })
    .png()
    .toFile(outputPath);
}

async function captureMockGoldens(options: {
  chrome: string;
  briefId: string;
  htmlPath: string;
  goldenDir: string;
}): Promise<Map<PhaseName, string>> {
  const { chrome, briefId, htmlPath, goldenDir } = options;
  if (!existsSync(htmlPath)) {
    throw new Error(`Mock source not found for ${briefId}: ${htmlPath}`);
  }

  const phasePaths = new Map<PhaseName, string>();
  await withMockPage(chrome, htmlPath, async (client, sessionId) => {
    for (const phase of PHASES) {
      await setMockProgress(client, sessionId, phase.progress, phase.mockJumpLabel);
      const screenshot = await captureMockElement(client, sessionId);
      const outputPath = join(goldenDir, briefId, `${briefId}-${phase.name}.png`);
      await normalizeToViewport(screenshot, outputPath);
      phasePaths.set(phase.name, outputPath);
    }
  });
  return phasePaths;
}

function goldenPathFor(goldenDir: string, briefId: string, phase: PhaseName): string {
  return join(goldenDir, briefId, `${briefId}-${phase}.png`);
}

async function loadRawImage(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path)
    .resize(VIEWPORT.width, VIEWPORT.height, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function changedPixelPct(a: RawImage, b: RawImage): number {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error("Cannot compare images with different dimensions.");
  }
  let changed = 0;
  const total = a.width * a.height;
  for (let index = 0; index < a.data.length; index += a.channels) {
    const diff =
      Math.abs(a.data[index]! - b.data[index]!) +
      Math.abs(a.data[index + 1]! - b.data[index + 1]!) +
      Math.abs(a.data[index + 2]! - b.data[index + 2]!);
    if (diff > 42) changed += 1;
  }
  return (changed / total) * 100;
}

async function createDiffImage(goldenPath: string, sunnyPath: string, diffPath: string): Promise<number> {
  const golden = await loadRawImage(goldenPath);
  const sunny = await loadRawImage(sunnyPath);
  let changed = 0;
  const total = golden.width * golden.height;
  const output = Buffer.alloc(golden.width * golden.height * 4);

  for (let source = 0, target = 0; source < golden.data.length; source += golden.channels, target += 4) {
    const diff =
      Math.abs(golden.data[source]! - sunny.data[source]!) +
      Math.abs(golden.data[source + 1]! - sunny.data[source + 1]!) +
      Math.abs(golden.data[source + 2]! - sunny.data[source + 2]!);
    const isChanged = diff > 54;
    if (isChanged) changed += 1;

    output[target] = isChanged ? 255 : Math.round(sunny.data[source]! * 0.42);
    output[target + 1] = isChanged ? Math.max(0, 80 - diff * 0.08) : Math.round(sunny.data[source + 1]! * 0.42);
    output[target + 2] = isChanged ? 128 : Math.round(sunny.data[source + 2]! * 0.42);
    output[target + 3] = 255;
  }

  await mkdir(dirname(diffPath), { recursive: true });
  await sharp(output, {
    raw: {
      width: golden.width,
      height: golden.height,
      channels: 4,
    },
  })
    .png()
    .toFile(diffPath);

  return (changed / total) * 100;
}

function rgbToHueBucket(r: number, g: number, b: number): number | null {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta < 0.08 || max < 0.18 || max > 0.98) return null;

  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  const degrees = Math.round(hue * 60);
  const normalized = degrees < 0 ? degrees + 360 : degrees;
  return Math.floor(normalized / 30);
}

function hueCoverage(image: RawImage): number {
  const buckets = new Set<number>();
  for (let index = 0; index < image.data.length; index += image.channels * 12) {
    const bucket = rgbToHueBucket(
      image.data[index]!,
      image.data[index + 1]!,
      image.data[index + 2]!,
    );
    if (bucket != null) buckets.add(bucket);
  }
  return buckets.size;
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function extractLayerOrder(dom: string): string[] {
  return [...dom.matchAll(/data-layer="([^"]+)"/g)].map((match) => match[1]!);
}

function findClippedTextLabels(dom: string): string[] {
  const viewBoxMatch = dom.match(/viewBox="([^"]+)"/);
  if (!viewBoxMatch) return [];
  const [minX, minY, width, height] = viewBoxMatch[1]!.split(/\s+/).map(Number);
  if (![minX, minY, width, height].every(Number.isFinite)) return [];
  const maxX = minX! + width!;
  const maxY = minY! + height!;
  const clipped: string[] = [];

  for (const match of dom.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = match[1]!;
    const label = match[2]!.trim();
    const xMatch = attrs.match(/\bx="([^"]+)"/);
    const yMatch = attrs.match(/\by="([^"]+)"/);
    if (!xMatch || !yMatch || !label) continue;
    const x = Number(xMatch[1]);
    const y = Number(yMatch[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX! - 16 || x > maxX + 16 || y < minY! - 16 || y > maxY + 16) {
      clipped.push(label);
    }
  }

  return clipped;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function createContactSheet(
  briefId: string,
  screenshots: Map<PhaseName, string>,
  outputPath: string,
): Promise<void> {
  const tileWidth = 760;
  const tileHeight = 428;
  const labelHeight = 46;
  const gap = 28;
  const padding = 34;
  const width = padding * 2 + tileWidth * 2 + gap;
  const height = padding * 2 + (tileHeight + labelHeight) * 2 + gap + 54;

  const composites: sharp.OverlayOptions[] = [];
  for (const [index, phase] of PHASES.entries()) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = padding + column * (tileWidth + gap);
    const top = padding + 54 + row * (tileHeight + labelHeight + gap);
    const imageBuffer = await sharp(screenshots.get(phase.name)!)
      .resize(tileWidth, tileHeight, { fit: "cover" })
      .png()
      .toBuffer();
    const label = Buffer.from(`
      <svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="18" y="30" fill="#dbeafe" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800">
          ${escapeSvgText(phase.name)} · ${Math.round(phase.progress * 100)}%
        </text>
      </svg>
    `);
    composites.push({ input: imageBuffer, left, top });
    composites.push({ input: label, left, top: top + tileHeight });
  }

  const title = Buffer.from(`
    <svg width="${width}" height="54" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0f172a"/>
      <text x="0" y="35" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="900">
        ${escapeSvgText(briefId)} visual QA contact sheet
      </text>
    </svg>
  `);
  composites.push({ input: title, left: padding, top: padding - 8 });

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#0f172a",
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function createGoldenContactSheet(options: {
  briefId: string;
  goldenScreenshots: Map<PhaseName, string>;
  sunnyScreenshots: Map<PhaseName, string>;
  diffScreenshots: Map<PhaseName, string>;
  outputPath: string;
}): Promise<void> {
  const { briefId, goldenScreenshots, sunnyScreenshots, diffScreenshots, outputPath } = options;
  const tileWidth = 492;
  const tileHeight = 277;
  const labelHeight = 42;
  const gap = 18;
  const padding = 28;
  const headerHeight = 92;
  const rowHeight = tileHeight + labelHeight + gap;
  const width = padding * 2 + tileWidth * 3 + gap * 2;
  const height = padding * 2 + headerHeight + PHASES.length * rowHeight;
  const columns = ["golden mock", "sunny render", "diff"] as const;
  const composites: sharp.OverlayOptions[] = [];

  const title = Buffer.from(`
    <svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0f172a"/>
      <text x="0" y="38" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="900">
        ${escapeSvgText(briefId)} golden comparison
      </text>
      <text x="0" y="72" fill="#bfdbfe" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800">
        left: target mock · middle: Sunny renderer · right: pixel diff
      </text>
    </svg>
  `);
  composites.push({ input: title, left: padding, top: padding - 4 });

  for (const [row, phase] of PHASES.entries()) {
    const top = padding + headerHeight + row * rowHeight;
    const phasePaths = [
      goldenScreenshots.get(phase.name)!,
      sunnyScreenshots.get(phase.name)!,
      diffScreenshots.get(phase.name)!,
    ];
    for (const [column, columnName] of columns.entries()) {
      const left = padding + column * (tileWidth + gap);
      const imageBuffer = await sharp(phasePaths[column]!)
        .resize(tileWidth, tileHeight, { fit: "cover" })
        .png()
        .toBuffer();
      const label = Buffer.from(`
        <svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#111827"/>
          <text x="14" y="28" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="900">
            ${escapeSvgText(phase.name)} · ${escapeSvgText(columnName)}
          </text>
        </svg>
      `);
      composites.push({ input: imageBuffer, left, top });
      composites.push({ input: label, left, top: top + tileHeight });
    }
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#0f172a",
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function runBriefQa(options: {
  chrome: string;
  baseUrl: string;
  outDir: string;
  goldenDir: string;
  briefId: string;
  golden: boolean;
  updateGoldens: boolean;
  mockSource?: string;
  maxDiffPct: number;
}): Promise<QaFailure[]> {
  const {
    chrome,
    baseUrl,
    outDir,
    goldenDir,
    briefId,
    golden,
    updateGoldens,
    mockSource,
    maxDiffPct,
  } = options;
  const briefOutDir = join(outDir, briefId);
  await mkdir(briefOutDir, { recursive: true });
  const screenshots = new Map<PhaseName, string>();

  for (const phase of PHASES) {
    const url = renderUrl(baseUrl, briefId, phase.progress);
    const screenshotPath = join(briefOutDir, `${briefId}-${phase.name}.png`);
    await captureScreenshot(chrome, url, screenshotPath);
    screenshots.set(phase.name, screenshotPath);
  }
  const contactSheetPath = join(briefOutDir, `${briefId}-contact-sheet.png`);
  await createContactSheet(briefId, screenshots, contactSheetPath);

  const failures: QaFailure[] = [];
  const intro = await loadRawImage(screenshots.get("intro")!);
  const reveal = await loadRawImage(screenshots.get("reveal")!);
  const complete = await loadRawImage(screenshots.get("complete")!);
  const sceneChange = changedPixelPct(intro, reveal);
  const finalSceneChange = changedPixelPct(intro, complete);
  const hues = hueCoverage(reveal);

  if (sceneChange < 2.5) {
    failures.push({
      check: "scene_change_between_phases",
      message: `Intro to reveal changed only ${sceneChange.toFixed(2)}% of pixels.`,
    });
  }
  if (finalSceneChange < 3) {
    failures.push({
      check: "complete_scene_change",
      message: `Intro to complete changed only ${finalSceneChange.toFixed(2)}% of pixels.`,
    });
  }
  if (hues < 4) {
    failures.push({
      check: "palette_coverage",
      phase: "reveal",
      message: `Reveal render exposes only ${hues} hue buckets.`,
    });
  }

  const dom = await dumpDom(chrome, renderUrl(baseUrl, briefId, 0.78));
  const layerOrder = extractLayerOrder(dom);
  const clippedLabels = findClippedTextLabels(dom);
  const carrierCount = countOccurrences(dom, "data-testid=\"carrier-flow-carrier\"");
  const ready = dom.includes('data-render-ready="true"');

  if (!ready) {
    failures.push({
      check: "render_ready",
      message: "Render route did not mark data-render-ready=true.",
    });
  }
  if (JSON.stringify(layerOrder) !== JSON.stringify(CANONICAL_LAYERS)) {
    failures.push({
      check: "canonical_layers",
      message: `Expected layer order ${CANONICAL_LAYERS.join(" > ")}, found ${layerOrder.join(" > ")}.`,
    });
  }
  if (carrierCount < 1) {
    failures.push({
      check: "carrier_presence",
      message: "No carrier primitives rendered in the scene DOM.",
    });
  }
  if (clippedLabels.length > 0) {
    failures.push({
      check: "label_clipping",
      message: `Text labels outside the active camera view: ${clippedLabels.join(", ")}.`,
    });
  }

  if (briefId === "red-blood-cells") {
    const cellBodyCount = countOccurrences(dom, "data-carrier-body=\"cell\"");
    const cargoCount = countOccurrences(dom, "data-testid=\"carrier-flow-cargo\"");
    if (cellBodyCount < 5) {
      failures.push({
        check: "rbc_cell_visibility",
        message: `Expected at least 5 red blood cell bodies, found ${cellBodyCount}.`,
      });
    }
    if (cargoCount < 5) {
      failures.push({
        check: "rbc_cargo_visibility",
        message: `Expected oxygen cargo on each cell after pickup, found ${cargoCount}.`,
      });
    }
  }

  const goldenDiffs: Record<string, number> = {};
  let goldenContactSheet: string | undefined;
  if (golden) {
    const sourcePath =
      mockSource ??
      MOCK_SOURCES[briefId] ??
      (() => {
        throw new Error(`No mock source configured for ${briefId}. Pass --mock <standalone.html>.`);
      })();
    const goldenScreenshots = updateGoldens
      ? await captureMockGoldens({ chrome, briefId, htmlPath: sourcePath, goldenDir })
      : new Map<PhaseName, string>(
          PHASES.map((phase) => [phase.name, goldenPathFor(goldenDir, briefId, phase.name)]),
        );

    const diffScreenshots = new Map<PhaseName, string>();
    for (const phase of PHASES) {
      const goldenPath = goldenScreenshots.get(phase.name)!;
      if (!existsSync(goldenPath)) {
        failures.push({
          check: "golden_missing",
          phase: phase.name,
          message: `Golden screenshot missing: ${goldenPath}. Run with --update-goldens.`,
        });
        continue;
      }
      const diffPath = join(briefOutDir, `${briefId}-${phase.name}-diff.png`);
      const diffPct = await createDiffImage(goldenPath, screenshots.get(phase.name)!, diffPath);
      goldenDiffs[phase.name] = Number(diffPct.toFixed(2));
      diffScreenshots.set(phase.name, diffPath);
      if (diffPct > maxDiffPct) {
        failures.push({
          check: "golden_diff_threshold",
          phase: phase.name,
          message: `Golden diff is ${diffPct.toFixed(2)}%, above ${maxDiffPct.toFixed(2)}%.`,
        });
      }
    }

    if (diffScreenshots.size === PHASES.length) {
      goldenContactSheet = join(briefOutDir, `${briefId}-golden-contact-sheet.png`);
      await createGoldenContactSheet({
        briefId,
        goldenScreenshots,
        sunnyScreenshots: screenshots,
        diffScreenshots,
        outputPath: goldenContactSheet,
      });
    }
  }

  console.log(
    ` 🎮 [visual-qa] ${briefId} metrics ${JSON.stringify({
      sceneChangePct: Number(sceneChange.toFixed(2)),
      completeChangePct: Number(finalSceneChange.toFixed(2)),
      hueBuckets: hues,
      layerOrder,
      clippedLabels,
      carrierCount,
      goldenDiffs,
      contactSheet: contactSheetPath,
      goldenContactSheet,
      outDir: briefOutDir,
    })}`,
  );

  return failures;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const chrome = await findChrome();
  if (!options.keep) {
    await rm(options.outDir, { recursive: true, force: true });
  }
  await mkdir(options.outDir, { recursive: true });

  const allFailures: Array<{ briefId: string; failures: QaFailure[] }> = [];
  for (const briefId of options.briefs) {
    const failures = await runBriefQa({
      chrome,
      baseUrl: options.baseUrl,
      outDir: options.outDir,
      goldenDir: options.goldenDir,
      briefId,
      golden: options.golden,
      updateGoldens: options.updateGoldens,
      mockSource: options.mockSource,
      maxDiffPct: options.maxDiffPct,
    });
    if (failures.length > 0) {
      allFailures.push({ briefId, failures });
    }
  }

  if (allFailures.length > 0) {
    const reportPath = join(options.outDir, "visual-qa-failures.json");
    await writeFile(reportPath, JSON.stringify({ status: "rejected", failures: allFailures }, null, 2));
    console.error(JSON.stringify({ status: "rejected", failures: allFailures, reportPath }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    ` 🎮 [visual-qa] approved ${JSON.stringify({
      briefs: options.briefs,
      outDir: options.outDir,
      goldenDir: options.goldenDir,
    })}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
