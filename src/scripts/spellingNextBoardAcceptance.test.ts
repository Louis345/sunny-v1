import {planAssignmentFromSourceWithTelemetry} from "../engine/assignmentPlanner";
import {linearJourneyFixture} from "./fixtures/authoredJourney";
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
import { seedSpellingLab, writeSpellingPdfFixture, recordedAdaptiveSpellingPlan, recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";
import { handleWsConnection } from "../server/ws-handler";

// 2026-10-21 human catch: every fix today passed its own tests, yet each real session on the kiosk Mac
// found the next failure (a rejected canvas, a frozen board, AI rebuilds of reused games, an explainer
// reporting stale IDs, a fatal modal for a memory save). Logs showed each failure only after a person
// played. The lab stopped at the Teaching board, so nothing had ever played a next board end to end.
// This robot plays Discovery, the Teaching board, and the reused next board through the real kiosk.
const lab = vi.hoisted(() => ({ root: "", plannerCalls: 0, builderCalls: 0, decisions: 0, decide: undefined as undefined | ((cycle: any) => any) }));
vi.mock("../engine/assignmentPlanner", async original => ({ ...await original<typeof import("../engine/assignmentPlanner")>(), planAssignmentFromSourceWithTelemetry: async (packet: any) => { lab.plannerCalls++; return { output: recordedAdaptiveSpellingPlan(packet, lab.root), telemetry: { model: "recorded", latencyMs: 1 } }; } }));
vi.mock("../engine/learningCycleRuntime", async original => { const actual = await original<typeof import("../engine/learningCycleRuntime")>(); return { ...actual, advanceCanonicalCycleFromEvidence: (input: any, opts: any) => actual.advanceCanonicalCycleFromEvidence({ ...input, decide: async (cycle: any) => { lab.decisions++; return lab.decide!(cycle); } }, opts) }; });
vi.mock("../deepgram-turn", () => ({ connectFlux: vi.fn(async (callbacks: { onOpen: () => void }) => { callbacks.onOpen(); return { sendAudio() {}, close() {} }; }) }));
vi.mock("../shared/childRegistry", async original => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["ila"] }));
vi.mock("../engine/directMathExperience", async original => ({ ...await original<typeof import("../engine/directMathExperience")>(),
  askLearningPlanner: vi.fn(async (input: any) => ({ domain: "spelling", planningResult: await planAssignmentFromSourceWithTelemetry(input.packet) })),
  // Reused activities must never reach the AI builder.
  generateAdaptiveProgressionActivityHtml: vi.fn(async () => { lab.builderCalls++; throw new Error("lab_builder_forbidden"); }),
}));

it("plays Discovery, the Teaching board and a reused next board through the real kiosk, then hands back to the Planner", async () => {
  const childId = "ila", viewport = { width: 1280, height: 720 };
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-next-board-")); lab.root = rootDir;
  const outputDir = path.join(process.cwd(), "outputs/next-board-acceptance"); fs.mkdirSync(outputDir, { recursive: true });
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_MODE", "real");
  vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
  vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId, homeworkDomain: "spelling" }));
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: any, init?: any) => { if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(String(url)).hostname)) throw new Error("lab_external_network_forbidden"); return originalFetch(url, init); });
  const words = ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"];
  const missedWords = words.slice(6);
  seedSpellingLab(rootDir, words, "", childId);
  const source = writeSpellingPdfFixture(rootDir, words);
  const { homeworkId } = await runSpellingDiscoveryIntake({ childId, sourceFile: source, rootDir }, { callPlannerModel: async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { boardDefinition: linearJourneyFixture(["diagnostic"]), diagnostic: recordedSpellingDiagnostic(packet), title: "School spelling", words: words.map(word => ({ word, pageNumber: 1 })), uncertainty: [] } }) });
  // The recorded Planner's next board names three Teaching-board activities: practice radar, Letter Rush, final check.
  lab.decide = (cycle: any) => {
    const evidence = cycle.predictionEvaluations.map((row: any) => row.evaluationId);
    if (lab.decisions > 1) return { status: "inconclusive", reason: "Immediate recall is not retention", progressionAction: "await_calibration", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Delayed recall"], predictionEvaluationIds: evidence };
    const wordIds = new Map<string, string>(Object.values(cycle.nodes.find((node: any) => node.role === "evaluation").evidenceContract.spellingItems as Record<string, any>).map((item: any) => [item.word, item.wordId]));
    const instrument = (nodeId: string, title: string, mechanic: string, targets: string[], measurementRole: string) => ({ nodeId, title, academicTarget: "Spelling", mechanic, theme: "Harbor", openingPurpose: "Practice again", creatorPrompt: `Reuse ${nodeId} exactly as before.`, spelling: { wordIds: targets.map(word => wordIds.get(word)!), measurementRole, responseMode: "spelling_letters" } });
    const instruments = [instrument("recall-practice", "Radar Again", "word-radar", missedWords, "practice"), instrument("letter-rush", "Rush Again", "letter-rush", missedWords, "practice"), instrument("recall-checkpoint", "Final Radar", "word-radar", words, "fresh_checkpoint")];
    return { status: "revised", reason: "Practice the missed words again, then recheck all words.", progressionAction: "generate_support", preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Independent recall"], predictionEvaluationIds: evidence, successor: { instruments, boardDefinition: linearJourneyFixture(instruments.map(row => row.nodeId)) } };
  };
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
  const errors: string[] = [], events: string[] = [], serverErrors: unknown[] = [], wordAdvanceMs: number[] = [];
  let confirmedPlayback = 0;
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
    await page.getByRole("button", { name: "Let's go!", exact: true }).waitFor({ timeout: 60000 });
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
    const enterBoard = async () => {
      const enter = page.getByRole("button", { name: "Let's go!", exact: true }), board = page.locator(".adventure-board");
      await enter.or(board).first().waitFor({ timeout: 45000 });
      if (await enter.isVisible()) await enter.click();
      await board.waitFor({ timeout: 30000 });
    };
    // Teaching board: the Speed route, then the final check.
    await enterBoard();
    const teaching = currentBoardInstance(getLearningCycle(childId, homeworkId, { rootDir })!);
    await page.getByRole("button", { name: "Choose your path", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Speed It/ }).click();
    await playRadar(missedWords, false);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
    await playLetterRush("Letter Rush", missedWords);
    await page.getByRole("button", { name: "Recall Checkpoint", exact: true }).click();
    await playRadar(words, true);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Play again", exact: true }).waitFor();
    await noModal();
    // Completing the Teaching board calls the Planner once, and the server builds the next board by itself.
    await expect.poll(() => { const cycle = getLearningCycle(childId, homeworkId, { rootDir })!; const board = currentBoardInstance(cycle); return board.boardId !== teaching.boardId && board.publishedAt !== null; }, { timeout: 60000 }).toBe(true);
    expect(lab.decisions).toBe(1);
    expect(lab.builderCalls).toBe(0);
    const next = getLearningCycle(childId, homeworkId, { rootDir })!;
    const nextBoard = currentBoardInstance(next);
    const nextNodes = next.nodes.filter(node => nextBoard.nodeIds.includes(node.nodeId));
    expect(nextNodes.map(node => node.reusedFrom)).toEqual(["recall-practice", "letter-rush", "recall-checkpoint"]);
    expect(nextNodes.every(node => node.artifactBinding?.validationStatus === "passed" && !node.notReadyReason)).toBe(true);
    // The robot plays the reused board in the real kiosk.
    await page.reload();
    await enterBoard();
    // Each spot shows the label the Planner authored on the published board.
    const label = (source: string) => nextBoard.definition!.portals.find(portal => portal.activityNodeId === nextNodes.find(node => node.reusedFrom === source)!.nodeId)!.label;
    await page.getByRole("button", { name: label("recall-practice"), exact: true }).click();
    await playRadar(missedWords, false);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
    await playLetterRush(label("letter-rush"), missedWords);
    await page.getByRole("button", { name: label("recall-checkpoint"), exact: true }).click();
    await playRadar(words, true);
    await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Play again", exact: true }).waitFor();
    await noModal();
    // Every answer lands on the next board's fresh questions, and finishing it hands back to the Planner.
    await expect.poll(() => lab.decisions, { timeout: 60000 }).toBe(2);
    const finished = getLearningCycle(childId, homeworkId, { rootDir })!;
    for (const node of finished.nodes.filter(row => nextBoard.nodeIds.includes(row.nodeId))) {
      expect(node.state).toBe("completed");
      const itemIds = Object.keys(node.evidenceContract.spellingItems ?? {});
      const recorded = finished.observations.filter(row => itemIds.includes(row.itemId));
      expect(recorded.length).toBeGreaterThan(0);
    }
    expect(lab.builderCalls).toBe(0);
    expect(serverErrors.filter((message: any) => message.fatal === true)).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: path.join(outputDir, "next-board-complete.png") });
  } finally {
    if (browser) {
      const page = browser.contexts()[0]?.pages()[0];
      if (page) {
        await page.screenshot({ path: path.join(outputDir, "last-state.png") });
        fs.writeFileSync(path.join(outputDir, "diagnostic.json"), JSON.stringify({ wordAdvanceMs, events, errors, serverErrors, decisions: lab.decisions, builderCalls: lab.builderCalls, body: await page.locator("body").innerText(), cycle: getLearningCycle(childId, homeworkId, { rootDir }) }));
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
