import fs from "node:fs";
import { createHash } from "node:crypto";
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
import { seedSpellingLab, writeSpellingPdfFixture, recordedAdaptiveSpellingPlan, recordedSpellingPlan } from "./fixtures/spellingEvidenceFirst";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";
import { handleWsConnection } from "../server/ws-handler";
import * as legacyLearning from "../engine/learningEngine";
const lab = vi.hoisted(() => ({ root: "", plannerCalls: 0, adaptive: false }));
vi.mock("../engine/assignmentPlanner", async original => ({ ...await original<typeof import("../engine/assignmentPlanner")>(), planAssignmentFromSourceWithTelemetry: async (packet: any) => { lab.plannerCalls++; return { output: lab.adaptive ? recordedAdaptiveSpellingPlan(packet, lab.root) : recordedSpellingPlan(packet, lab.root), telemetry: { model: "recorded", latencyMs: 1 } }; } }));
vi.mock("../engine/learningCycleRuntime", async original => { const actual = await original<typeof import("../engine/learningCycleRuntime")>(); return { ...actual, advanceCanonicalCycleFromEvidence: (input: any, opts: any) => actual.advanceCanonicalCycleFromEvidence({ ...input, decide: async cycle => ({ status: "inconclusive", reason: "Immediate recall is not retention", progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Delayed recall"], predictionEvaluationIds: cycle.predictionEvaluations.map(row => row.evaluationId) }) }, opts) }; });
vi.mock("../deepgram-turn", () => ({
  connectFlux: vi.fn(async (callbacks: { onOpen: () => void }) => {
    callbacks.onOpen();
    return { sendAudio() {}, close() {} };
  }),
}));
vi.mock("../shared/childRegistry", async original => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["ila"] }));

function hashFilesUnder(paths: string[]): string {
  const hash = createHash("sha256");
  const visit = (target: string, relativeTo: string): void => {
    if (!fs.existsSync(target)) {
      hash.update(`missing:${path.relative(relativeTo, target)}\n`);
      return;
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) visit(path.join(target, entry), relativeTo);
      return;
    }
    hash.update(`file:${path.relative(relativeTo, target)}\n`);
    hash.update(fs.readFileSync(target));
  };
  for (const target of [...paths].sort()) visit(target, process.cwd());
  return hash.digest("hex");
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

it("keeps the spelling audio proof on Sunny's production WebSocket and TTS path", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/spellingBrowserAcceptance.test.ts"), "utf8");
  expect(source).toContain("handleWsConnection(socket, request)");
  expect(source).not.toContain(["Object.create", "(SessionManager.prototype)"].join(""));
  expect(source).toContain('transport: "production_ws_handler_and_tts_bridge"');
});

it.each([
  { width: 1365, height: 768, adaptive: false },
  { width: 1280, height: 720, adaptive: false },
  { width: 1365, height: 768, adaptive: true },
  { width: 1280, height: 720, adaptive: true },
])("plays spelling through the real host and canonical routes at $width×$height adaptive=$adaptive", async scenario => {
  const childId = "ila";
  const viewport = { width: scenario.width, height: scenario.height };
  const canonicalFamilyPaths = [
    path.join(process.cwd(), "src/context/ila"),
    path.join(process.cwd(), "src/context/reina"),
  ];
  const canonicalFamilyHashBefore = hashFilesUnder(canonicalFamilyPaths);
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-browser-")); lab.root = rootDir; lab.plannerCalls = 0; lab.adaptive = scenario.adaptive;
  const outputDir = scenario.adaptive
    ? path.join(process.cwd(), "outputs/spelling-adaptation-proof")
    : path.join(process.cwd(), "outputs/evidence-first-spelling", `${viewport.width}x${viewport.height}`);
  fs.mkdirSync(outputDir, { recursive: true });
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_MODE", "real");
  vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId, homeworkDomain: "spelling" }));
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: any, init?: any) => { if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(String(url)).hostname)) throw new Error("lab_external_network_forbidden"); return originalFetch(url, init); });
  const words = scenario.adaptive
    ? ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"]
    : ["night", "light"];
  seedSpellingLab(rootDir, words, scenario.adaptive ? "/companions/sample.vrm" : "", childId);
  const source = writeSpellingPdfFixture(rootDir, words);
  const legacyAttempt = vi.spyOn(legacyLearning, "recordAttempt");
  const { homeworkId } = await runSpellingDiscoveryIntake({ childId, sourceFile: source, rootDir }, { callPlannerModel: async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School spelling", words: words.map(word => ({ word, pageNumber: 1 })), uncertainty: [] } }) });
  fs.writeFileSync(path.join(outputDir, "opening-packet.json"), JSON.stringify(buildChildExperiencePacket(getChildChart(childId, { rootDir })), null, 2));
  const app = express(); app.use(express.json());
  app.get("/api/profile/:child", (_req, res) => res.json({ companion: { ...COMPANION_DEFAULTS, vrmUrl: scenario.adaptive ? "/companions/sample.vrm" : "" } }));
  app.get("/api/child-experience/:child", (_req, res) => res.json(buildChildExperiencePacket(getChildChart(childId, { rootDir }))));
  let automaticGeneration: Promise<void> | undefined;
  let generationStartedAt: number | undefined;
  let workerLaunchCount = 0;
  setupRoutes(app, {
    launchAdaptiveMathWorker: (launchedChildId, launchedHomeworkId) => {
      workerLaunchCount += 1;
      generationStartedAt = Date.now();
      automaticGeneration = runAdaptiveMathGeneration(launchedChildId, launchedHomeworkId, rootDir);
    },
  });
  const recordedPcmFrame = Buffer.alloc(4_800).toString("base64");
  let recordedProviderConnections = 0;
  let recordedProviderAudioFrames = 0;
  const ttsProvider = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>(resolve => ttsProvider.once("listening", resolve));
  const ttsAddress = ttsProvider.address();
  if (!ttsAddress || typeof ttsAddress === "string") throw new Error("recorded_tts_address_missing");
  vi.stubEnv("ELEVENLABS_API_KEY", "recorded-local-only");
  vi.stubEnv("ELEVENLABS_WS_BASE_URL", `ws://127.0.0.1:${ttsAddress.port}`);
  ttsProvider.on("connection", socket => {
    recordedProviderConnections += 1;
    socket.on("message", raw => {
      const message = JSON.parse(String(raw)) as { text?: string };
      if (typeof message.text === "string" && message.text.trim()) {
        recordedProviderAudioFrames += 1;
        socket.send(JSON.stringify({ audio: recordedPcmFrame }));
      }
      if (message.text === "") socket.close();
    });
  });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("lab_address_missing");
  const ws = new WebSocketServer({ server, path: "/ws" });
  let serverWebSocketConnections = 0;
  const errors: string[] = [], events: string[] = [];
  let pendingAssessmentPlayback = 0;
  let confirmedAssessmentPlayback = 0;
  let assessmentAudioFrames = 0;
  ws.on("connection", (socket, request) => {
    serverWebSocketConnections += 1;
    const observedSocket = socket as any;
    const productionSend = observedSocket.send.bind(socket);
    observedSocket.send = (data: unknown, ...args: unknown[]) => {
      try {
        const message = JSON.parse(String(data));
        if (message.type === "audio") {
          events.push("server:audio");
          if (pendingAssessmentPlayback > 0) assessmentAudioFrames += 1;
        }
      } catch (error) {
        events.push(`server-send:unparsed:${error instanceof Error ? error.message : String(error)}`);
      }
      return productionSend(data, ...args);
    };
    socket.on("close", (code, reason) => events.push(`server-ws:close:${code}:${String(reason)}`));
    socket.on("error", error => errors.push(`server-ws:${error.message}`));
    socket.on("message", data => {
      const message = JSON.parse(String(data));
      events.push(`ws:${message.type}`);
      const event = message.event;
      if (event?.type === "attempt_event") events.push("canonical-game:attempt_event");
      if (event?.type === "narration_request") pendingAssessmentPlayback += 1;
      if (message.type === "playback_done" && pendingAssessmentPlayback > 0) {
        pendingAssessmentPlayback -= 1;
        confirmedAssessmentPlayback += 1;
        events.push("browser:assessment-playback-confirmed");
      }
    });
    handleWsConnection(socket, request);
  });
  let vite: any, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const module = await import(pathToFileURL(path.join(process.cwd(), "web/node_modules/vite/dist/node/index.js")).href);
    vite = await module.createServer({ configFile: false, root: path.join(process.cwd(), "web"), cacheDir: path.join(rootDir, "vite-cache"), esbuild: { jsx: "automatic" }, css: { postcss: { plugins: [require(path.join(process.cwd(), "web/node_modules/tailwindcss"))({ content: [path.join(process.cwd(), "web/src/**/*.{js,ts,jsx,tsx}")] })] } }, define: { "import.meta.env": JSON.stringify({ VITE_SUNNY_RUNTIME_CONFIG: JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId, homeworkDomain: "spelling" }) }) }, server: { host: "127.0.0.1", port: 0, fs: { allow: [process.cwd()] }, proxy: { "/api": `http://127.0.0.1:${address.port}`, "/ws": { target: `ws://127.0.0.1:${address.port}`, ws: true } } } }); await vite.listen();
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const page = await browser.newPage({ viewport }); page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message)); page.on("response", response => { if (response.url().includes("/api/")) events.push(`${response.status()} ${response.url()}`); });
    page.on("console", message => events.push(`console:${message.type()}:${message.text()}`));
    await page.route("**/*", route => ["127.0.0.1", "localhost", ""].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const entryStartedAt = Date.now();
    await page.goto(vite.resolvedUrls.local[0]);
    await page.getByRole("button", { name: "Hear the word", exact: true }).waitFor();
    expect(serverWebSocketConnections).toBe(1);
    const discoveryReadyMs = Date.now() - entryStartedAt;
    expect(await page.getByText("night", { exact: true }).count()).toBe(0);
    if (scenario.adaptive) {
      const discoveryCompanion = page.locator('[data-testid="companion-layer-stack"], [data-testid="companion-portrait-stack"]');
      await discoveryCompanion.waitFor();
      await expect.poll(() => discoveryCompanion.getAttribute("data-companion-model-status")).toBe("ready");
      await page.screenshot({ path: path.join(outputDir, `discovery-${viewport.width}x${viewport.height}.png`) });
    }
    const answer = async (value: string) => {
      const hear = page.getByRole("button", { name: "Hear the word", exact: true });
      // The existing mic pulses continuously. Verify its real hit target rather
      // than requiring an animated control to stop moving for two frames.
      const hit = await hear.evaluate((element: any) => { const r = element.getBoundingClientRect(); const doc = element.ownerDocument; const x = r.x + r.width / 2, y = r.y + r.height / 2; return { x, y, inside: r.left >= 0 && r.top >= 0 && r.right <= doc.defaultView.innerWidth && r.bottom <= doc.defaultView.innerHeight, clear: element.contains(doc.elementFromPoint(x, y)) }; });
      expect(hit.inside && hit.clear).toBe(true);
      const expectedPlaybackCount = confirmedAssessmentPlayback + 1;
      await page.mouse.click(hit.x, hit.y);
      await expect.poll(() => confirmedAssessmentPlayback).toBe(expectedPlaybackCount);
      await page.getByTestId("word-radar-input").fill(value);
      const written = page.waitForResponse(response => response.url().endsWith("/discovery/attempt"));
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      expect((await written).status()).toBe(200);
    };
    for (const [index, word] of words.entries()) {
      await answer(scenario.adaptive && index >= 6 ? "zzz" : index === 1 && !scenario.adaptive ? "lite" : word);
      if (index < words.length - 1) {
        await page.getByTestId("word-radar-input").waitFor();
      }
      if (scenario.adaptive && index === 1) {
        const committedBeforeRestart = getLearningCycle(childId, homeworkId, { rootDir })!.observations;
        expect(committedBeforeRestart).toHaveLength(2);
        await page.reload();
        await page.getByTestId("word-radar-input").waitFor();
        expect(getLearningCycle(childId, homeworkId, { rootDir })!.observations).toEqual(committedBeforeRestart);
        expect(await page.getByText(words[2], { exact: true }).count()).toBe(0);
      }
    }
    await page.getByText("Skip", { exact: true }).click();
    await Promise.race([
      page.getByRole("button", { name: "Check progress", exact: true }).waitFor(),
      page.getByRole("button", { name: scenario.adaptive ? "Spelling Practice" : "Word workshop", exact: true }).waitFor(),
    ]);
    const before = getLearningCycle(childId, homeworkId, { rootDir })!;
    expect(before.observations.map(row => row.result.correct)).toEqual(scenario.adaptive
      ? [true, true, true, true, true, true, false, false, false, false]
      : [true, false]);
    expect(assessmentAudioFrames).toBe(words.length);
    expect(events.filter(event => event === "browser:assessment-playback-confirmed")).toHaveLength(words.length);
    const discoveryAudioFrames = assessmentAudioFrames;
    const discoveryPlaybackConfirmations = confirmedAssessmentPlayback;
    expect(before.observations.at(-1)?.result.observedErrorType).toBeUndefined();
    await page.screenshot({ path: path.join(outputDir, "preparing.png") });
    expect(workerLaunchCount).toBe(1);
    expect(automaticGeneration).toBeDefined();
    await automaticGeneration;
    const firstReadyMs = Date.now() - generationStartedAt!;
    // An explicit restart must reuse all completed work and never call the Planner again.
    await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
    expect(lab.plannerCalls).toBe(1);
    const checkProgress = page.getByRole("button", { name: "Check progress", exact: true });
    if (await checkProgress.count()) await checkProgress.click();
    await page.getByRole("button", { name: scenario.adaptive ? "Spelling Practice" : "Word workshop", exact: true }).waitFor();
    expect(await page.getByTestId("word-radar-input").count()).toBe(0);
    await page.reload();
    const board = getChildChart(childId, { rootDir }).activeSessionPlan!.adventureBoard!;
    expect(board.theme.background.type).toBe("image");
    const backgroundLoaded = await page.evaluate(async url => new Promise<boolean>(resolve => { const image = new (globalThis as any).Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = url; }), board.theme.background.value);
    expect(backgroundLoaded).toBe(true);
    const expectedThumbnailCount = board.nodes.filter((node) => Boolean(node.thumbnailUrl)).length;
    await expect.poll(() => page.locator(".adventure-board__node-thumbnail").evaluateAll((elements, expectedCount) => elements.length === expectedCount && elements.every((element: any) => element.complete && element.naturalWidth > 0), expectedThumbnailCount)).toBe(true);
    if (scenario.adaptive) {
      const targeted = getLearningCycle(childId, homeworkId, { rootDir })!;
      const missedWords = words.slice(6);
      const final = targeted.nodes.find(node => node.nodeId === "recall-checkpoint")!;
      const routeIds = ["spelling-practice", "sound-and-spell", "wheel-challenge", "recall-practice", "letter-rush"];
      expect(routeIds.every((id) => {
        const node = targeted.nodes.find((candidate) => candidate.nodeId === id);
        return node && missedWords.every((word) => node.academicTarget.targets.includes(word));
      })).toBe(true);
      expect(final.academicTarget.targets).toEqual(words);
      expect(new Set(board.nodes.map((node) => node.slot)).size).toBe(board.nodes.length);
      expect(board.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([...routeIds, "recall-checkpoint"]));
      // Contract 21: no Quest/Boss placeholder appears on the Teaching Board or in its frozen nodes.
      expect(board.nodes.some((node) => node.kind === "quest" || node.kind === "boss")).toBe(false);
      expect(targeted.nodes.some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
      expect(getChildChart(childId, { rootDir }).companion.config.vrmUrl).toBe("/companions/sample.vrm");
      const companion = page.getByTestId("companion-portrait-stack");
      expect(await companion.count()).toBe(1);
      await expect.poll(() => companion.getAttribute("data-companion-model-status")).toBe("ready");
      const companionCanvas = companion.getByTestId("companion-portrait").locator("canvas");
      expect(await companionCanvas.isVisible()).toBe(true);
      expect(await companionCanvas.evaluate((element: any) => element.width > 1 && element.height > 1)).toBe(true);
      const companionModelStatus = await companion.getAttribute("data-companion-model-status");
      const companionCanvasVisible = await companionCanvas.isVisible();
      const boardScreenshotPath = path.join(outputDir, `finished-board-${viewport.width}x${viewport.height}.png`);
      const discoveryScreenshotPath = path.join(outputDir, `discovery-${viewport.width}x${viewport.height}.png`);
      const finalCheckScreenshotPath = path.join(outputDir, `final-check-${viewport.width}x${viewport.height}.png`);
      const completionScreenshotPath = path.join(outputDir, `completed-route-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: boardScreenshotPath });

      await page.getByRole("note", { name: "Choose Path", exact: true }).waitFor();
      await page.getByRole("button", { name: "Recall Practice", exact: true }).click();
      await expect.poll(() =>
        getLearningCycle(childId, homeworkId, { rootDir })?.routeSelection?.selectedRouteId,
      ).toBe("speed-route");

      await page.getByRole("button", { name: "Ready!", exact: true }).click();
      for (const [index, word] of missedWords.entries()) {
        const input = page.getByTestId("word-radar-input");
        await input.waitFor();
        await input.fill(word);
        await input.waitFor({ state: "hidden" });
        if (index < missedWords.length - 1) await page.getByTestId("word-radar-input").waitFor();
      }
      await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
      await expect.poll(() => getLearningCycle(childId, homeworkId, { rootDir })?.nodes.find((node) => node.nodeId === "letter-rush")?.state).toBe("ready");
      await page.getByRole("button", { name: "Letter Rush", exact: true }).click();

      const letterRush = page.frameLocator('iframe[title="letter-rush"]');
      await letterRush.locator("body").evaluate((_body: any) => {
        Math.random = () => 0.1;
      });
      await letterRush.getByRole("button", { name: "Start", exact: true }).click();
      const letterRushWords: string[] = [];
      for (let wordIndex = 0; wordIndex < missedWords.length; wordIndex += 1) {
        const tiles = letterRush.locator("#targetRow .tile");
        await expect.poll(() => tiles.count()).toBeGreaterThan(0);
        const target = (await tiles.allTextContents()).join("").toLowerCase();
        letterRushWords.push(target);
        expect(target).toBe(missedWords[wordIndex]);
        for (const letter of target) {
          const falling = letterRush.locator(`button.falling[data-letter="${letter}"]`).last();
          await falling.waitFor({ state: "visible", timeout: 12000 });
          await falling.evaluate((element: any) => element.click());
        }
        await letterRush.locator("#jackpotBanner.on").waitFor();
        const next = letterRush.getByRole("button", { name: "Next word →", exact: true });
        await next.waitFor();
        await next.click();
      }
      await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
      await expect.poll(() => getLearningCycle(childId, homeworkId, { rootDir })?.nodes.find((node) => node.nodeId === "recall-checkpoint")?.state).toBe("ready");
      await page.getByRole("button", { name: "Recall Checkpoint", exact: true }).click();
      await page.getByRole("button", { name: "Ready!", exact: true }).click();
      await page.getByTestId("word-radar-input").waitFor();
      await page.screenshot({ path: finalCheckScreenshotPath });
      for (const [index, word] of words.entries()) {
        await answer(word);
        if (index < words.length - 1) await page.getByTestId("word-radar-input").waitFor();
      }
      await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Play again", exact: true }).waitFor();
      await page.screenshot({ path: completionScreenshotPath });

      const completed = getLearningCycle(childId, homeworkId, { rootDir })!;
      const finalObservations = completed.observations.filter((observation) => observation.sourceId === "activity:recall-checkpoint:recall");
      const finalItemIds = Object.keys(final.evidenceContract.spellingItems ?? {});
      expect(finalObservations.map((observation) => observation.itemId)).toEqual(finalItemIds);
      expect(finalObservations.map((observation) => observation.result.correct)).toEqual(words.map(() => true));
      expect(completed.nodes.find((node) => node.nodeId === "recall-practice")?.state).toBe("completed");
      expect(completed.nodes.find((node) => node.nodeId === "letter-rush")?.state).toBe("completed");
      expect(completed.nodes.find((node) => node.nodeId === "recall-checkpoint")?.state).toBe("completed");
      const canonicalFamilyHashAfter = hashFilesUnder(canonicalFamilyPaths);
      expect(canonicalFamilyHashAfter).toBe(canonicalFamilyHashBefore);
      expect(errors).toEqual([]);

      const proof = {
        provider: "recorded",
        assignment: { homeworkId, words },
        discovery: before.observations.map((observation) => ({ observationId: observation.observationId, itemId: observation.itemId, correct: observation.result.correct, assistance: observation.assistance.status })),
        targeted: {
          missedWords,
          practiceNodes: targeted.nodes.filter((node) => routeIds.includes(node.nodeId)).map((node) => ({ nodeId: node.nodeId, words: node.academicTarget.targets })),
          selectedRoute: { routeId: "speed-route", nodeIds: ["recall-practice", "letter-rush"], letterRushWords },
          finalCheck: { nodeId: final.nodeId, words: final.academicTarget.targets, itemIds: finalItemIds, observationIds: finalObservations.map((observation) => observation.observationId), allCorrect: finalObservations.every((observation) => observation.result.correct === true) },
        },
        board: { nodeIds: board.nodes.map((node) => node.id), slots: Object.fromEntries(board.nodes.map((node) => [node.id, node.slot])) },
        screenshots: {
          discovery: { path: discoveryScreenshotPath, sha256: hashFile(discoveryScreenshotPath) },
          board: { path: boardScreenshotPath, sha256: hashFile(boardScreenshotPath) },
          finalCheck: { path: finalCheckScreenshotPath, sha256: hashFile(finalCheckScreenshotPath) },
          completion: { path: completionScreenshotPath, sha256: hashFile(completionScreenshotPath) },
        },
        companion: { modelStatus: companionModelStatus, canvasVisible: companionCanvasVisible },
        audio: {
          provider: "recorded_pcm_via_local_elevenlabs_transport",
          transport: "production_ws_handler_and_tts_bridge",
          serverWebSocketConnections,
          recordedProviderConnections,
          recordedProviderAudioFrames,
          discoveryRequested: words.length,
          discoveryFramesDelivered: discoveryAudioFrames,
          discoveryPlaybackConfirmed: discoveryPlaybackConfirmations,
          assessmentFramesDelivered: assessmentAudioFrames,
          totalFramesDelivered: events.filter((event) => event === "server:audio").length,
          totalPlaybackConfirmed: confirmedAssessmentPlayback,
        },
        familyIsolation: { paths: canonicalFamilyPaths, before: canonicalFamilyHashBefore, after: canonicalFamilyHashAfter, unchanged: canonicalFamilyHashBefore === canonicalFamilyHashAfter },
        plannerCalls: lab.plannerCalls,
        timing: { discoveryReadyMs, firstReadyMs, limitation: "Recorded Planner and native games only; not a live provider latency or learning-effect estimate." },
        errors,
      };
      fs.writeFileSync(path.join(outputDir, `recorded-journey-${viewport.width}x${viewport.height}.json`), JSON.stringify(proof, null, 2));
      if (viewport.width === 1280 && viewport.height === 720) fs.writeFileSync(path.join(outputDir, "recorded-journey.json"), JSON.stringify(proof, null, 2));
      return;
    }
    await page.getByText("Word workshop", { exact: true }).first().click();
    await page.getByRole("button", { name: "Ready!", exact: true }).click();
    await page.getByTestId("word-radar-input").fill("light");
    await page.getByText("Skip", { exact: true }).click();
    await page.getByText("Recall check", { exact: true }).first().click();
    await page.getByRole("button", { name: "Ready!", exact: true }).click();
    await answer("night"); await page.getByTestId("word-radar-input").waitFor(); await answer("light");
    await page.getByRole("button", { name: "Play again", exact: true }).waitFor();
    const after = getLearningCycle(childId, homeworkId, { rootDir })!;
    expect(after.predictionEvaluations).toHaveLength(2);
    expect(after.nodes.some(node => node.role === "quest" || node.role === "boss")).toBe(false);
    const attemptsBeforeReplay = events.filter(event => event.includes("/discovery/attempt")).length;
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    const ready = page.getByRole("button", { name: "Ready!", exact: true });
    await Promise.race([ready.waitFor(), page.getByTestId("word-radar-input").waitFor()]);
    if (await ready.isVisible()) await ready.click();
    await page.getByTestId("word-radar-input").waitFor();
    expect(await page.getByTestId("word-radar-submit").count()).toBe(0);
    await page.getByTestId("word-radar-input").fill("nite");
    await page.getByTestId("word-radar-btn-skip").click();
    await page.getByTestId("word-radar-input").waitFor();
    await page.getByTestId("word-radar-input").fill("light");
    await page.getByRole("button", { name: "Play again", exact: true }).waitFor();
    const replayed = getLearningCycle(childId, homeworkId, { rootDir })!;
    expect(replayed.observations.slice(0, after.observations.length)).toEqual(after.observations);
    expect(replayed.predictionEvaluations).toEqual(after.predictionEvaluations);
    const replayFacts = replayed.observations.slice(after.observations.length);
    expect(replayFacts).toHaveLength(2);
    expect(replayFacts.every(row => row.provenance === "practice" && row.exposure === "previously_practiced")).toBe(true);
    expect(replayFacts[0].result.correct).toBeUndefined();
    expect(replayFacts[0].childResponse).not.toBe("night");
    expect(replayFacts[1].childResponse).toBe("light");
    expect(events.filter(event => event.includes("/discovery/attempt"))).toHaveLength(attemptsBeforeReplay);
    await page.getByText("Skip", { exact: true }).click();
    expect(events).toContain("canonical-game:attempt_event");
    expect(legacyAttempt).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify({ provider: "recorded", viewport, before, after, replayed, events, errors, plannerCalls: lab.plannerCalls, timing: { discoveryReadyMs, firstReadyMs, limitation: "Recorded Planner and native games only; not a live provider latency estimate." } }, null, 2));
    await page.screenshot({ path: path.join(outputDir, "complete.png") });
  } finally {
    if (browser) { const page = browser.contexts()[0]?.pages()[0]; if (page) { await page.screenshot({ path: path.join(outputDir, "last-state.png") }); fs.writeFileSync(path.join(outputDir, "diagnostic.json"), JSON.stringify({ events, errors, body: await page.locator("body").innerText() })); } await browser.close(); }
    await vite?.close();
    ws.clients.forEach(socket => socket.terminate());
    await new Promise<void>(resolve => ws.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
    ttsProvider.clients.forEach(socket => socket.terminate());
    await new Promise<void>(resolve => ttsProvider.close(() => resolve()));
    __resetVoiceSessionRegistryForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}, 180000);
import { recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
