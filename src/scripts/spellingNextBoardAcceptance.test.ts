import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import { expect, it, vi } from "vitest";
import { setupRoutes } from "../server/routes";
import { getChildChart } from "../profiles/childChart";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";
import { __resetVoiceSessionRegistryForTests } from "../server/voice-session-registry";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { currentBoardInstance } from "../engine/learningBoardInstances";
import { seedSpellingLab, writeSpellingPdfFixture } from "./fixtures/spellingEvidenceFirst";
import type { RecordedToolLab } from "./fixtures/recordedToolPlanner";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";
import { handleWsConnection } from "../server/ws-handler";
import { getActiveVoiceSessionManagerForChild } from "../server/voice-session-registry";

// 2026-10-21 human catch: every fix today passed its own tests, yet each real session on the kiosk Mac
// found the next failure (a rejected canvas, a frozen board, AI rebuilds of reused games, an explainer
// reporting stale IDs, a fatal modal for a memory save). Logs showed each failure only after a person
// played. The lab stopped at the Teaching board, so nothing had ever played a next board end to end.
// This robot plays Discovery, the Teaching board, and the reused next board through the real kiosk.
// 2026-10-24: the Planner now builds every board through small locked tools. The robot used to replace
// the Planner, the next-board decision and the intake with their old single forms, so it never ran the
// tool handlers that real sessions run. It now answers at the Anthropic client boundary instead.
const lab = vi.hoisted(() => ({ voiceRequests: [] as any[], builderCalls: 0, planner: { root: "", childId: "", homeworkId: "", words: [], missedWords: [], requests: [], teachingBoards: 0, decisions: 0 } as RecordedToolLab }));
// Recorded successful quiet at the voice provider boundary; preserve real request assembly and captures.
vi.mock("ai", async original => ({...await original<typeof import("ai")>(), streamText: (request: any) => {
  lab.voiceRequests.push(request);
  return { fullStream:(async function*(){})(), finishReason:Promise.resolve("stop") };
}}));
// Every Planner and artist turn reaches this recorded client; nothing is sent to a provider.
vi.mock("@anthropic-ai/sdk", async original => {
  const actual = await original<typeof import("@anthropic-ai/sdk")>();
  const { recordedToolReply } = await import("./fixtures/recordedToolPlanner");
  class RecordedAnthropic { messages = { stream: (request: any) => ({ finalMessage: async () => recordedToolReply(lab.planner, request) }), create: async (request: any) => recordedToolReply(lab.planner, request) }; }
  return { ...actual, default: RecordedAnthropic, Anthropic: RecordedAnthropic };
});
vi.mock("../deepgram-turn", () => ({ connectFlux: vi.fn(async (callbacks: { onOpen: () => void }) => { callbacks.onOpen(); return { sendAudio() {}, close() {} }; }) }));
vi.mock("../shared/childRegistry", async original => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["ila"] }));
vi.mock("../engine/directMathExperience", async original => ({ ...await original<typeof import("../engine/directMathExperience")>(),
  // Reused activities must never reach the AI builder.
  generateAdaptiveProgressionActivityHtml: vi.fn(async () => { lab.builderCalls++; throw new Error("lab_builder_forbidden"); }),
}));

it("plays Discovery, the Teaching board and a reused next board through the real kiosk, then hands back to the Planner", async () => {
  const childId = "ila", viewport = { width: 1280, height: 720 };
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-next-board-"));
  const outputDir = path.join(process.cwd(), "outputs/next-board-acceptance"); fs.mkdirSync(outputDir, { recursive: true });
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_MODE", "real");
  vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  // The key only satisfies preflight checks: the Anthropic client is the recorded one above.
  vi.stubEnv("ANTHROPIC_API_KEY", "recorded-local-only"); vi.stubEnv("OPENAI_API_KEY", "");
  // 2026-10-22 kiosk-Mac catch: the robot inherited SUNNY_CHART_DIR from the kiosk shell and switched into real-chart
  // intake (planner_model_required). It must never depend on, or write to, the machine's real data settings.
  for (const name of ["SUNNY_CHART_DIR", "SUNNY_PREVIEW_MODE", "SUNNY_CERTIFICATION_RUN_ID", "SUNNY_ACTIVITY_RESULT_LOG_ROOT", "SUNNY_LOG_REPO_DIR", "SUNNY_IMAGE_CACHE_PATH"]) vi.stubEnv(name, "");
  vi.stubEnv("ADVENTURE_MAP", "true");
  vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId, homeworkDomain: "spelling" }));
  vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId, homeworkDomain: "spelling" }));
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: any, init?: any) => { if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(String(url)).hostname)) throw new Error("lab_external_network_forbidden"); return originalFetch(url, init); });
  const words = ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"];
  const missedWords = words.slice(6);
  seedSpellingLab(rootDir, words, "", childId);
  const source = writeSpellingPdfFixture(rootDir, words);
  Object.assign(lab.planner, { root: rootDir, childId, words, missedWords });
  const { homeworkId } = await runSpellingDiscoveryIntake({ childId, sourceFile: source, rootDir });
  lab.planner.homeworkId = homeworkId;
  const app = express(); app.use(express.json());
  app.get("/api/profile/:child", (_req, res) => res.json({ companion: { ...COMPANION_DEFAULTS, vrmUrl: "" } }));
  app.get("/api/child-experience/:child", (_req, res) => res.json(buildChildExperiencePacket(getChildChart(childId, { rootDir }))));
  let automaticGeneration: Promise<void> | undefined;
  setupRoutes(app, { launchAdaptiveMathWorker: (launchedChildId, launchedHomeworkId) => { automaticGeneration = runAdaptiveMathGeneration(launchedChildId, launchedHomeworkId, rootDir); } });
  const ttsProvider = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>(resolve => ttsProvider.once("listening", resolve));
  const ttsAddress = ttsProvider.address();
  if (!ttsAddress || typeof ttsAddress === "string") throw new Error("recorded_tts_address_missing");
  vi.stubEnv("ELEVENLABS_API_KEY", "recorded-local-only");
  vi.stubEnv("ELEVENLABS_WS_BASE_URL", `ws://127.0.0.1:${ttsAddress.port}`);
  const recordedPcmFrame = Buffer.alloc(4_800).toString("base64");
  ttsProvider.on("connection", socket => socket.on("message", raw => {
    const message = JSON.parse(String(raw)) as { text?: string };
    if (typeof message.text === "string" && message.text.trim()) socket.send(JSON.stringify({ audio: recordedPcmFrame }));
    if (message.text === "") socket.close();
  }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("lab_address_missing");
  const ws = new WebSocketServer({ server, path: "/ws" });
  const errors: string[] = [], events: string[] = [], serverErrors: unknown[] = [], wordAdvanceMs: number[] = [], screenChecks: string[] = [];
  let confirmedPlayback = 0;
  const notReadySeen: string[] = [];
  ws.on("connection", (socket, request) => {
    const observed = socket as any, productionSend = observed.send.bind(socket);
    observed.send = (data: unknown, ...args: unknown[]) => {
      try { const message = JSON.parse(String(data)); if (message.type === "error") serverErrors.push(message); } catch { /* binary audio frames */ }
      return productionSend(data, ...args);
    };
    socket.on("message", data => { const message = JSON.parse(String(data)); if (message.type === "playback_done") confirmedPlayback += 1; });
    handleWsConnection(socket, request);
  });
  let vite: any, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const module = await import(pathToFileURL(path.join(process.cwd(), "web/node_modules/vite/dist/node/index.js")).href);
    vite = await module.createServer({ configFile: false, root: path.join(process.cwd(), "web"), cacheDir: path.join(rootDir, "vite-cache"), esbuild: { jsx: "automatic" }, css: { postcss: { plugins: [require(path.join(process.cwd(), "web/node_modules/tailwindcss"))({ content: [path.join(process.cwd(), "web/src/**/*.{js,ts,jsx,tsx}")] })] } }, define: { "import.meta.env": JSON.stringify({ VITE_SUNNY_RUNTIME_CONFIG: JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId, homeworkDomain: "spelling" }) }) }, server: { host: "127.0.0.1", port: 0, fs: { allow: [process.cwd()] }, proxy: { "/api": `http://127.0.0.1:${address.port}`, "/ws": { target: `ws://127.0.0.1:${address.port}`, ws: true } } } }); await vite.listen();
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport }); page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.url().includes("/api/")) events.push(`${response.status()} ${response.url()}`); });
    page.on("console", message => events.push(`console:${message.type()}:${message.text()}`));
    await page.route("**/*", route => ["127.0.0.1", "localhost", ""].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const noModal = async () => expect(await page.getByText("Sunny lost the connection.", { exact: true }).count()).toBe(0);
    await page.goto(vite.resolvedUrls.local[0]);
    await page.getByRole("button", { name: "Hear the word", exact: true }).waitFor({ timeout: 45000 });
    const hearAndSpell = async (value: string) => {
      const hear = page.getByRole("button", { name: "Hear the word", exact: true });
      const hit = await hear.evaluate((element: any) => { const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const expected = confirmedPlayback + 1;
      await page.mouse.click(hit.x, hit.y);
      await expect.poll(() => confirmedPlayback).toBe(expected);
      await page.getByTestId("word-radar-input").fill(value);
      // Submit animates once letters are entered; check it is truly enabled, then press it in the page.
      const submit = page.getByRole("button", { name: "Submit", exact: true });
      await expect.poll(() => submit.isEnabled()).toBe(true);
      await submit.evaluate((element: any) => element.click());
    };
    // Discovery: six correct, four missed.
    for (const [index, word] of words.entries()) {
      await page.getByText(`Word ${index + 1} of ${words.length}`, { exact: true }).waitFor();
      await hearAndSpell(index >= 6 ? "zzz" : word);
      if (index < words.length - 1) await page.getByTestId("word-radar-input").waitFor();
    }
    await page.getByText("Skip", { exact: true }).click();
    await page.getByRole("button", { name: "Let's go!", exact: true }).or(page.locator(".adventure-board")).first().waitFor({ timeout: 60000 });
    expect(automaticGeneration).toBeDefined();
    await automaticGeneration;
    const playRadar = async (targets: string[], hidden: boolean) => {
      const ready = page.getByRole("button", { name: "Ready!", exact: true }), firstInput = page.getByTestId("word-radar-input");
      await ready.or(firstInput).first().waitFor();
      // Some radars start on their own and replace the Ready screen; tap it only while it is still the way in.
      if (!(await firstInput.isVisible())) await ready.click({ timeout: 5000 }).catch(() => events.push("robot:ready-replaced"));
      await firstInput.waitFor();
      for (const [index, word] of targets.entries()) {
        // A hidden-word check is in step only once its counter shows this word (the proven Discovery pattern).
        if (hidden) {
          // Measured, not assumed: how long the child waits for each next word is reported with the run.
          const waitedFrom = Date.now();
          await page.getByText(`Word ${index + 1} of ${targets.length}`, { exact: true }).waitFor({ timeout: 30000 });
          wordAdvanceMs.push(Date.now() - waitedFrom);
          await hearAndSpell(word);
          continue;
        }
        const input = page.getByTestId("word-radar-input");
        await input.waitFor();
        await input.fill(word);
        await input.waitFor({ state: "hidden" });
        if (index < targets.length - 1) await page.getByTestId("word-radar-input").waitFor();
      }
    };
    const playLetterRush = async (title: string, targets: string[]) => {
      await page.getByRole("button", { name: title, exact: true }).click();
      const rush = page.frameLocator('iframe[title="letter-rush"]');
      await rush.locator("body").evaluate(() => { Math.random = () => 0.1; });
      await rush.getByRole("button", { name: "Start", exact: true }).click();
      for (const word of targets) {
        const tiles = rush.locator("#targetRow .tile");
        await expect.poll(() => tiles.count()).toBeGreaterThan(0);
        expect((await tiles.allTextContents()).join("").toLowerCase()).toBe(word);
        for (const letter of word) {
          const falling = rush.locator(`button.falling[data-letter="${letter}"]`).last();
          await falling.waitFor({ state: "visible", timeout: 12000 });
          await falling.evaluate((element: any) => element.click());
        }
        await rush.locator("#jackpotBanner.on").waitFor();
        await rush.getByRole("button", { name: "Next word →", exact: true }).click();
      }
      await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
    };
    // What Elli would be told about the screen right now: her real per-turn builder on the live session.
    const elliScreen = () => {
      const live = getActiveVoiceSessionManagerForChild(childId) as { buildCurrentBoardContextForTurn?: () => string } | undefined;
      const context = live?.buildCurrentBoardContextForTurn?.() ?? "";
      const start = context.indexOf("[Screen:");
      return start < 0 ? "" : context.slice(start);
    };
    const elliSeesScreen = async (expected: RegExp) => { await expect.poll(elliScreen, { timeout: 10000 }).toMatch(expected); screenChecks.push(elliScreen()); };
    const enterBoard = async () => {
      const enter = page.getByRole("button", { name: "Let's go!", exact: true }), board = page.locator(".adventure-board");
      await enter.or(board).first().waitFor({ timeout: 45000 });
      if (await enter.isVisible()) await enter.click();
      await board.waitFor({ timeout: 30000 });
      if (await page.getByText(/not ready/i).count()) notReadySeen.push(await board.innerText());
    };
    // Teaching board: the Speed route, then the final check.
    await enterBoard();
    const teaching = currentBoardInstance(getLearningCycle(childId, homeworkId, { rootDir })!);
    await elliSeesScreen(/The board is showing[^]*No activity is open/);
    await page.getByRole("button", { name: "Choose your path", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Speed It/ }).click();
    await playRadar(missedWords, false);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
    await playLetterRush("Letter Rush", missedWords);
    await page.getByRole("button", { name: "Recall Checkpoint", exact: true }).click();
    await page.getByText(`Word 1 of ${words.length}`, { exact: true }).waitFor();
    const checkpointId = getLearningCycle(childId, homeworkId, { rootDir })!.nodes.find(node => teaching.nodeIds.includes(node.nodeId) && node.title === "Recall Checkpoint")!.nodeId;
    await elliSeesScreen(new RegExp(`Recall Checkpoint is open[^]*Current node: ${checkpointId}`));
    // A dropped connection mid-activity: the kiosk reconnects and re-reports, so Elli still sees the open activity.
    ws.clients.forEach(socket => socket.terminate());
    await elliSeesScreen(/Recall Checkpoint is open/);
    await playRadar(words, true);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Play again", exact: true }).waitFor();
    await noModal();
    // Completing the Teaching board calls the Planner once, and the server builds the next board by itself.
    await expect.poll(() => { const cycle = getLearningCycle(childId, homeworkId, { rootDir })!; const board = currentBoardInstance(cycle); return board.boardId !== teaching.boardId && board.publishedAt !== null; }, { timeout: 60000 }).toBe(true);
    expect(lab.planner.decisions).toBe(1);
    expect(lab.builderCalls).toBe(0);
    const next = getLearningCycle(childId, homeworkId, { rootDir })!;
    const nextBoard = currentBoardInstance(next);
    const nextNodes = next.nodes.filter(node => nextBoard.nodeIds.includes(node.nodeId));
    const teachingId = (title: string) => next.nodes.find(node => teaching.nodeIds.includes(node.nodeId) && node.title === title)!.nodeId;
    // The first stop is a fresh game from the menu; the other two re-run what she played.
    expect(nextNodes.map(node => node.reusedFrom)).toEqual([undefined, ...["Letter Rush", "Recall Checkpoint"].map(teachingId)]);
    expect(nextNodes[0]).toMatchObject({ implementationType: "word-radar", title: "Fresh Radar" });
    expect(nextNodes.every(node => node.artifactBinding?.validationStatus === "passed" && !node.notReadyReason)).toBe(true);
    // Without a reload, the kiosk learns by itself that the next board is published and says so truthfully;
    // by contract the new board opens at the child's next visit, never mid-session.
    const label = (title: string) => nextBoard.definition!.portals.find(portal => portal.activityNodeId === (title === "Fresh Radar" ? nextNodes[0] : nextNodes.find(node => node.reusedFrom === teachingId(title))!).nodeId)!.label;
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
    await page.getByText("Your next adventure is ready for your next visit", { exact: false }).waitFor({ timeout: 30000 });
    await elliSeesScreen(/The board is showing[^]*No activity is open\.\nThe next board is ready for the next visit\./);
    // The next visit: the published board opens with Let's go, never a stale "Planning your map".
    await page.reload();
    await enterBoard();
    expect(await page.getByText("Planning your map", { exact: true }).count()).toBe(0);
    await page.getByRole("button", { name: label("Fresh Radar"), exact: true }).waitFor();
    await elliSeesScreen(/The board is showing[^]*No activity is open/);
    await page.getByRole("button", { name: label("Fresh Radar"), exact: true }).click();
    await playRadar(missedWords, false);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
    await playLetterRush(label("Letter Rush"), missedWords);
    await page.getByRole("button", { name: label("Recall Checkpoint"), exact: true }).click();
    await playRadar(words, true);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Play again", exact: true }).waitFor();
    await noModal();
    // Every answer lands on the next board's fresh questions, and finishing it hands back to the Planner.
    await expect.poll(() => lab.planner.decisions, { timeout: 60000 }).toBe(2);
    const finished = getLearningCycle(childId, homeworkId, { rootDir })!;
    for (const node of finished.nodes.filter(row => nextBoard.nodeIds.includes(row.nodeId))) {
      expect(node.state).toBe("completed");
      const itemIds = Object.keys(node.evidenceContract.spellingItems ?? {});
      const recorded = finished.observations.filter(row => itemIds.includes(row.itemId));
      expect(recorded.length).toBeGreaterThan(0);
    }
    expect(lab.builderCalls).toBe(0);
    expect(serverErrors.filter((message: any) => message.fatal === true)).toEqual([]);
    expect(lab.voiceRequests.length).toBeGreaterThan(0);
    for(const request of lab.voiceRequests) for(const name of ["canvasShow","canvasClear","launchGame","sessionLog"]) expect(request.tools).not.toHaveProperty(name);
    for (const request of lab.voiceRequests) {
      const text = JSON.stringify(request.messages);
      expect(text).toContain("[Screen:");
      expect(text).not.toMatch(/Independent evaluation is ready|board is available|No activity has been selected|\[Canvas State\]/);
    }
    // The tiny-tools contract, measured at the provider boundary: every Planner and artist turn is a
    // locked tool call (only the explainer's large form is unlocked), nothing buys a correction, and no
    // board she sees has a Not-ready stop.
    const requests = lab.planner.requests;
    expect(lab.planner.teachingBoards).toBe(1);
    expect(requests.flatMap(request => request.tools ?? []).filter((tool: any) => tool.strict !== true && tool.name !== "add_explainer").map((tool: any) => tool.name)).toEqual([]);
    const stages = (fs.readdirSync(rootDir, { recursive: true }) as string[]).map(String).filter(name => name.endsWith(".stage.json"));
    expect(stages.filter(name => /tools-turn-\d+\.stage\.json$/.test(name)).length).toBeGreaterThanOrEqual(5);
    expect(stages.filter(name => /correction|patch/.test(name))).toEqual([]);
    expect(finished.nodes.filter(node => node.notReadyReason).map(node => `${node.nodeId}: ${node.notReadyReason}`)).toEqual([]);
    expect(notReadySeen).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: path.join(outputDir, "next-board-complete.png") });
  } finally {
    if (browser) {
      const page = browser.contexts()[0]?.pages()[0];
      if (page) {
        // A diagnostic failure must not replace the actual acceptance failure or skip cleanup.
        await page.screenshot({ path: path.join(outputDir, "last-state.png") }).catch(error => console.warn("robot diagnostic screenshot failed:", error));
        fs.writeFileSync(path.join(outputDir, "diagnostic.json"), JSON.stringify({ screenChecks, wordAdvanceMs, events, errors, serverErrors, decisions: lab.planner.decisions, builderCalls: lab.builderCalls, body: await page.locator("body").innerText(), cycle: getLearningCycle(childId, homeworkId, { rootDir }) }));
      }
      await browser.close();
    }
    await vite?.close();
    ws.clients.forEach(socket => socket.terminate());
    await new Promise<void>(resolve => ws.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
    ttsProvider.clients.forEach(socket => socket.terminate());
    await new Promise<void>(resolve => ttsProvider.close(() => resolve()));
    __resetVoiceSessionRegistryForTests();
    vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}, 300000);
