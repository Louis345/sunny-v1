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
import { SessionManager } from "../server/session-manager";
import { registerActiveVoiceSessionManager, __resetVoiceSessionRegistryForTests } from "../server/voice-session-registry";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { seedSpellingLab, recordedAdaptiveSpellingPlan, recordedSpellingPlan } from "./fixtures/spellingEvidenceFirst";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";
import * as legacyLearning from "../engine/learningEngine";
const lab = vi.hoisted(() => ({ root: "", plannerCalls: 0, adaptive: false }));
vi.mock("../engine/assignmentPlanner", async original => ({ ...await original<typeof import("../engine/assignmentPlanner")>(), planAssignmentFromSourceWithTelemetry: async (packet: any) => { lab.plannerCalls++; return { output: lab.adaptive ? recordedAdaptiveSpellingPlan(packet, lab.root) : recordedSpellingPlan(packet, lab.root), telemetry: { model: "recorded", latencyMs: 1 } }; } }));
vi.mock("../engine/learningCycleRuntime", async original => { const actual = await original<typeof import("../engine/learningCycleRuntime")>(); return { ...actual, advanceCanonicalCycleFromEvidence: (input: any, opts: any) => actual.advanceCanonicalCycleFromEvidence({ ...input, decide: async cycle => ({ status: "inconclusive", reason: "Immediate recall is not retention", progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Delayed recall"], predictionEvaluationIds: cycle.predictionEvaluations.map(row => row.evaluationId) }) }, opts) }; });
vi.mock("../shared/childRegistry", async original => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["lab-child"] }));

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

it.each([
  { width: 1365, height: 768, adaptive: false },
  { width: 1280, height: 720, adaptive: false },
  { width: 1365, height: 768, adaptive: true },
  { width: 1280, height: 720, adaptive: true },
])("plays spelling through the real host and canonical routes at $width×$height adaptive=$adaptive", async scenario => {
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
  vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId: "lab-child", homeworkDomain: "spelling" }));
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: any, init?: any) => { if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(String(url)).hostname)) throw new Error("lab_external_network_forbidden"); return originalFetch(url, init); });
  const words = scenario.adaptive
    ? ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"]
    : ["night", "light"];
  const source = seedSpellingLab(rootDir, words, scenario.adaptive ? "/companions/sample.vrm" : "");
  const legacyAttempt = vi.spyOn(legacyLearning, "recordAttempt");
  const { homeworkId } = await runSpellingDiscoveryIntake({ childId: "lab-child", sourceFile: source, rootDir }, { callPlannerModel: async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School spelling", words: words.map(word => ({ word, pageNumber: 1 })), uncertainty: [] } }) });
  fs.writeFileSync(path.join(outputDir, "opening-packet.json"), JSON.stringify(buildChildExperiencePacket(getChildChart("lab-child", { rootDir })), null, 2));
  const app = express(); app.use(express.json());
  app.get("/api/profile/:child", (_req, res) => res.json({ companion: { ...COMPANION_DEFAULTS, vrmUrl: scenario.adaptive ? "/companions/sample.vrm" : "" } }));
  app.get("/api/child-experience/:child", (_req, res) => res.json(buildChildExperiencePacket(getChildChart("lab-child", { rootDir }))));
  setupRoutes(app);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("lab_address_missing");
  const ws = new WebSocketServer({ server, path: "/ws" });
  const errors: string[] = [], events: string[] = [];
  const voice = Object.assign(Object.create(SessionManager.prototype), { chartChildId: "lab-child", childName: "Lab", sessionTtsLabel: "Lab", sessionId: "recorded-voice", companionPresence: "collapsed", send: () => {}, debugRecorder: { recordEvent: () => {}, recordGameTrace: () => {} }, ttsBridge: { connect: async () => {}, sendText: () => {}, finish: async () => {} } }) as SessionManager;
  registerActiveVoiceSessionManager("lab-child", { noteExternalEvent() {}, getDiscoveryAttemptContext: voice.getDiscoveryAttemptContext.bind(voice) });
  const handleVoiceMessage = (data: string | Buffer, send: (data: string) => void): void => {
    const message = JSON.parse(String(data));
    events.push(`ws:${message.type}`);
    if (message.type === "start_session") {
      send(JSON.stringify({ type: "session_started", child: "Lab" })); send(JSON.stringify({ type: "session_boot_ready" }));
      if (!["evaluation_ready", "evaluation_active"].includes(getLearningCycle("lab-child", homeworkId, { rootDir })!.lifecycle)) {
        send(JSON.stringify({ type: "audio", data: "UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==" })); send(JSON.stringify({ type: "audio_done" }));
      }
    }
    const event = message.event;
    if (event?.type === "attempt_event") { events.push("canonical-game:attempt_event"); voice.handleGameEvent(event); }
    if (event?.type === "game_state_update") voice.updateCurrentBoardSnapshot(event.payload);
    if (event?.type === "narration_request") void voice.speakGameNarration(event.payload.text, event.payload).then(() => { send(JSON.stringify({ type: "audio_done" })); }).catch(error => errors.push(String(error)));
  };
  ws.on("connection", socket => socket.on("message", data => handleVoiceMessage(String(data), value => socket.send(value))));
  let vite: any, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const module = await import(pathToFileURL(path.join(process.cwd(), "web/node_modules/vite/dist/node/index.js")).href);
    vite = await module.createServer({ configFile: false, root: path.join(process.cwd(), "web"), cacheDir: path.join(rootDir, "vite-cache"), esbuild: { jsx: "automatic" }, css: { postcss: { plugins: [require(path.join(process.cwd(), "web/node_modules/tailwindcss"))({ content: [path.join(process.cwd(), "web/src/**/*.{js,ts,jsx,tsx}")] })] } }, define: { "import.meta.env": JSON.stringify({ VITE_SUNNY_RUNTIME_CONFIG: JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId: "lab-child", homeworkDomain: "spelling" }) }) }, server: { host: "127.0.0.1", port: 0, fs: { allow: [process.cwd()] }, proxy: { "/api": `http://127.0.0.1:${address.port}`, "/ws": { target: `ws://127.0.0.1:${address.port}`, ws: true } } } }); await vite.listen();
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const page = await browser.newPage({ viewport }); page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message)); page.on("response", response => { if (response.url().includes("/api/")) events.push(`${response.status()} ${response.url()}`); });
    await page.route("**/*", route => ["127.0.0.1", "localhost", ""].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.routeWebSocket("**/ws", socket => socket.onMessage(data => handleVoiceMessage(data, value => socket.send(value))));
    const entryStartedAt = Date.now();
    await page.goto(vite.resolvedUrls.local[0]);
    await page.getByRole("button", { name: "Hear the word", exact: true }).waitFor();
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
      expect(hit.inside && hit.clear).toBe(true); await page.mouse.click(hit.x, hit.y);
      await page.getByTestId("word-radar-input").fill(value);
      const written = page.waitForResponse(response => response.url().endsWith("/discovery/attempt"));
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      expect((await written).status()).toBe(200);
    };
    for (const [index, word] of words.entries()) {
      await answer(scenario.adaptive && index >= 6 ? "zzz" : index === 1 && !scenario.adaptive ? "lite" : word);
      if (index < words.length - 1) await page.getByTestId("word-radar-input").waitFor();
    }
    await page.getByText("Skip", { exact: true }).click();
    await Promise.race([
      page.getByRole("button", { name: "Check progress", exact: true }).waitFor(),
      page.getByRole("button", { name: scenario.adaptive ? "Spelling Practice" : "Word workshop", exact: true }).waitFor(),
    ]);
    const before = getLearningCycle("lab-child", homeworkId, { rootDir })!;
    expect(before.observations.map(row => row.result.correct)).toEqual(scenario.adaptive
      ? [true, true, true, true, true, true, false, false, false, false]
      : [true, false]);
    expect(before.observations.at(-1)?.result.observedErrorType).toBeUndefined();
    await page.screenshot({ path: path.join(outputDir, "preparing.png") });
    const generationStartedAt = Date.now();
    await runAdaptiveMathGeneration("lab-child", homeworkId, rootDir);
    const firstReadyMs = Date.now() - generationStartedAt;
    await runAdaptiveMathGeneration("lab-child", homeworkId, rootDir);
    expect(lab.plannerCalls).toBe(1);
    const checkProgress = page.getByRole("button", { name: "Check progress", exact: true });
    if (await checkProgress.count()) await checkProgress.click();
    await page.getByRole("button", { name: scenario.adaptive ? "Spelling Practice" : "Word workshop", exact: true }).waitFor();
    expect(await page.getByTestId("word-radar-input").count()).toBe(0);
    await page.reload();
    const board = getChildChart("lab-child", { rootDir }).activeSessionPlan!.adventureBoard!;
    expect(board.theme.background.type).toBe("image");
    const backgroundLoaded = await page.evaluate(async url => new Promise<boolean>(resolve => { const image = new (globalThis as any).Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = url; }), board.theme.background.value);
    expect(backgroundLoaded).toBe(true);
    await expect.poll(() => page.locator(".adventure-board__node-thumbnail").evaluateAll(elements => elements.length >= 3 && elements.every((element: any) => element.complete && element.naturalWidth > 0))).toBe(true);
    if (scenario.adaptive) {
      const targeted = getLearningCycle("lab-child", homeworkId, { rootDir })!;
      const missedWords = words.slice(6);
      const final = targeted.nodes.find(node => node.nodeId === "recall-checkpoint")!;
      const routeIds = ["spelling-practice", "sound-and-spell", "wheel-challenge", "recall-practice", "letter-rush"];
      expect(routeIds.every((id) => {
        const node = targeted.nodes.find((candidate) => candidate.nodeId === id);
        return node && missedWords.every((word) => node.academicTarget.targets.includes(word));
      })).toBe(true);
      expect(final.academicTarget.targets).toEqual(words);
      expect(new Set(board.nodes.map((node) => node.slot)).size).toBe(board.nodes.length);
      expect(board.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([...routeIds, "recall-checkpoint", "quest", "boss"]));
      expect(getChildChart("lab-child", { rootDir }).companion.config.vrmUrl).toBe("/companions/sample.vrm");
      const companion = page.getByTestId("companion-layer-stack");
      expect(await companion.count()).toBe(1);
      await expect.poll(() => companion.getAttribute("data-companion-model-status")).toBe("ready");
      const companionCanvas = companion.getByTestId("companion-full-stage").locator("canvas");
      expect(await companionCanvas.isVisible()).toBe(true);
      expect(await companionCanvas.evaluate((element: any) => element.width > 1 && element.height > 1)).toBe(true);
      const companionModelStatus = await companion.getAttribute("data-companion-model-status");
      const companionCanvasVisible = await companionCanvas.isVisible();
      const boardScreenshotPath = path.join(outputDir, `finished-board-${viewport.width}x${viewport.height}.png`);
      const discoveryScreenshotPath = path.join(outputDir, `discovery-${viewport.width}x${viewport.height}.png`);
      const finalCheckScreenshotPath = path.join(outputDir, `final-check-${viewport.width}x${viewport.height}.png`);
      const completionScreenshotPath = path.join(outputDir, `completed-route-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: boardScreenshotPath });

      await page.getByRole("button", { name: "Choose Path", exact: true }).click();
      const routeDialog = page.getByRole("dialog", { name: "Choose your path", exact: true });
      await routeDialog.waitFor();
      await routeDialog.getByRole("button", { name: /route Speed It$/ }).click();

      await page.getByRole("button", { name: "Ready!", exact: true }).click();
      for (const [index, word] of missedWords.entries()) {
        const input = page.getByTestId("word-radar-input");
        await input.waitFor();
        await input.fill(word);
        await input.waitFor({ state: "hidden" });
        if (index < missedWords.length - 1) await page.getByTestId("word-radar-input").waitFor();
      }
      await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
      await expect.poll(() => getLearningCycle("lab-child", homeworkId, { rootDir })?.nodes.find((node) => node.nodeId === "letter-rush")?.state).toBe("ready");
      await page.getByRole("button", { name: "Letter Rush", exact: true }).click();

      const letterRush = page.frameLocator('iframe[title="letter-rush"]');
      await letterRush.getByRole("button", { name: "Start", exact: true }).click();
      const letterRushWords: string[] = [];
      for (let wordIndex = 0; wordIndex < missedWords.length; wordIndex += 1) {
        const tiles = letterRush.locator("#targetRow .tile");
        await expect.poll(() => tiles.count()).toBeGreaterThan(0);
        const target = (await tiles.allTextContents()).join("").toLowerCase();
        letterRushWords.push(target);
        expect(target).toBe(missedWords[wordIndex]);
        for (const letter of target) {
          const falling = letterRush.locator(`button.falling[data-letter="${letter}"]`).first();
          await falling.waitFor({ state: "attached", timeout: 12000 });
          await falling.click({ force: true });
        }
        const next = letterRush.getByRole("button", { name: "Next word →", exact: true });
        await next.waitFor();
        await next.click();
      }
      await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
      await expect.poll(() => getLearningCycle("lab-child", homeworkId, { rootDir })?.nodes.find((node) => node.nodeId === "recall-checkpoint")?.state).toBe("ready");
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

      const completed = getLearningCycle("lab-child", homeworkId, { rootDir })!;
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
    const after = getLearningCycle("lab-child", homeworkId, { rootDir })!;
    expect(after.predictionEvaluations).toHaveLength(2);
    expect(after.nodes.find(node => node.role === "quest")?.state).toBe("locked");
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
    const replayed = getLearningCycle("lab-child", homeworkId, { rootDir })!;
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
    await vite?.close(); ws.clients.forEach(socket => socket.terminate()); await new Promise<void>(resolve => ws.close(() => resolve())); await new Promise<void>(resolve => server.close(() => resolve())); __resetVoiceSessionRegistryForTests(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fs.rmSync(rootDir, { recursive: true, force: true });
  }
}, 180000);
import { recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
