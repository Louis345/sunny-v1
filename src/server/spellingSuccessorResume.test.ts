import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { WebSocketServer } from "ws";
import express from "express";
import { expect, it, vi } from "vitest";
import { setupRoutes, resumeSuccessorBoards } from "./routes";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { builtInWordRadar } from "../scripts/fixtures/builtInSpellingActivity";
import { buildSpellingRecallItems } from "../engine/learningCycleIngest";
import { createLearningCycle, getLearningCycle, projectLearningCycle, type LearningCycleNodeContract } from "../engine/learningCycleRepository";
import { currentBoardInstance, publishBoardInstance } from "../engine/learningBoardInstances";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { getChildChart } from "../profiles/childChart";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";
import { handleWsConnection } from "./ws-handler";
import { __resetVoiceSessionRegistryForTests } from "./voice-session-registry";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";

const lab = vi.hoisted(() => ({ decisions: 0, builds: 0, interruptBeforePreparing: true, interrupted: false }));
vi.mock("../deepgram-turn", () => ({ connectFlux: vi.fn(async (callbacks: { onOpen: () => void }) => { callbacks.onOpen(); return { sendAudio() {}, close() {} }; }) }));
vi.mock("../shared/childRegistry", async original => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["ila"] }));
vi.mock("../engine/learningCycleRuntime", async original => {
  const actual = await original<typeof import("../engine/learningCycleRuntime")>();
  return { ...actual, advanceCanonicalCycleFromEvidence: (input: any, opts: any) => actual.advanceCanonicalCycleFromEvidence({ ...input, decide: async cycle => {
    lab.decisions += 1;
    const wordIds = Object.values(cycle.nodes[0].evidenceContract.spellingItems!).map(item => item.wordId);
    return { status: "revised", reason: "Recorded support decision from the completed spelling evidence", progressionAction: "generate_support", preserve: [], change: ["guided practice"], testNext: ["later recall"], nextEvidenceRequired: ["delayed recall"], predictionEvaluationIds: cycle.predictionEvaluations.map(row => row.evaluationId), successor: { boardDefinition: linearJourneyFixture(["support-0", "support-1"]), instruments: ["Sound workshop", "Later recall"].map((title, index) => ({ nodeId: `support-${index}`, title, academicTarget: "spelling.night", mechanic: "guided spelling", theme: "recorded harbor", openingPurpose: "Practice the observed spelling gap", creatorPrompt: "Recorded fixture: practice night using the saved evidence", spelling: { wordIds, measurementRole: index === 0 ? "practice" : "fresh_checkpoint", responseMode: "spelling_letters", builtInActivityId: "practice" } })) } };
  } }, opts) };
});
vi.mock("../engine/canonicalProgressionGenerator", async original => {
  const actual = await original<typeof import("../engine/canonicalProgressionGenerator")>();
  return { ...actual, prepareSuccessorBoard: async (input: any, opts: any) => {
    // Recorded Creator and verifier receipts test handoff/recovery, not content quality.
    const fixtureInput = { ...input, generateHtml: async ({ node }: { node: LearningCycleNodeContract }) => { lab.builds += 1; return `<html><body><h1>${node.title}</h1></body></html>`; }, validate: async () => ({ passed: true, failures: [] }), generateArtwork: async () => "/generated/recorded-harbor.png" };
    // The first background preparation is interrupted before it binds anything.
    if (lab.interruptBeforePreparing) {
      lab.interruptBeforePreparing = false; lab.interrupted = true;
      return getLearningCycle(input.childId, input.homeworkId)!;
    }
    return actual.prepareSuccessorBoard(fixtureInput, opts);
  } };
});

it("resumes an interrupted spelling successor after HTTP completion without another decision or any AI build", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-handoff-"));
  // The kiosk supports the family identities; all files here are synthetic and
  // physically isolated under rootDir, as in spellingBrowserAcceptance.
  const childId = "ila", homeworkId = "recorded-spelling";
  const runtimeConfig = { subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "muted", childId, homeworkDomain: "spelling" };
  let server: import("node:http").Server | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let vite: any;
  let ws: WebSocketServer | undefined;
  try {
    vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
    vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true");
    vi.stubEnv("SUNNY_MODE", "real");
    // Startup recovery clears VITEST below; session shutdown must remain local.
    vi.stubEnv("SUNNY_LOG_UPLOAD_ON_END", "false");
    vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify(runtimeConfig));
    vi.stubEnv("SUNNY_CHART_DIR", "");
    vi.stubEnv("SUNNY_CERTIFICATION_RUN_ID", "");
    vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ELEVENLABS_API_KEY", ""); vi.stubEnv("TTS_ENABLED", "false");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (url: any, init?: any) => {
      if (!["127.0.0.1", "localhost"].includes(new URL(String(url)).hostname)) throw new Error("handoff_lab_external_network_forbidden");
      return originalFetch(url, init);
    });
    seedSpellingLab(rootDir, ["night"], "", childId);
    // Match ingestion's selected assignment; an orphan cycle is not a session.
    const profilePath = path.join(rootDir, "src/context", childId, "learning_profile.json");
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    profile.selectedHomeworkDomain = "spelling";
    profile.pendingHomework = { homeworkId, weekOf: "2026-10-01", wordList: ["night"], generatedAt: "2026-10-01T00:00:00Z", nodes: [] };
    fs.writeFileSync(profilePath, JSON.stringify(profile));
    const item = buildSpellingRecallItems({ homeworkId, words: ["night"], evidenceIds: ["school:one"], measurementRole: "fresh_checkpoint", exposure: "practiced" })[0]!;
    const node: LearningCycleNodeContract = {
      nodeId: "practice", role: "baseline", title: "Night practice", state: "ready",
      academicTarget: { domain: "spelling", skill: "spelling.night", targets: ["night"] },
      algorithmOwner: "retrieval-practice", theoryId: "spelling-theory", experimentId: "practice",
      mechanic: "guided spelling", theme: "harbor", openingScreen: { title: "Night practice", purpose: "Practice night" },
      generationPrompt: null,
      artwork: { status: "ready", localPath: "/generated/practice.png", prompt: null }, sfxContract: [], companionContract: { events: ["completion"] },
      evidenceIds: [],
      ...builtInWordRadar({ rootDir, childId, homeworkId, nodeId: "practice", title: "Night practice", items: [item], checkpoint: true }),
    };
    const base = { childId, homeworkId, domain: "spelling", assignment: { title: "School spelling", contentFingerprint: "recorded", capturedEvidenceIds: ["school:one"], targets: ["night"] }, academicTheory: { theoryId: "spelling-theory", revision: 1, hypothesis: "Test the spelling gap", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node], initialLifecycle: "board_ready" as const };
    const board = publishBoardInstance({ ...base, boards: [] } as never, { kind: "teaching", definition: linearJourneyFixture([node.nodeId]), predecessorBoardId: null, plannerDecisionId: "original-plan", evidenceIds: ["school:one"], nodeIds: [node.nodeId], publishedAt: "2026-10-01T00:00:00Z" });
    createLearningCycle({ ...base, boards: [board], academicPredictions: [{
      predictionId: "night-recall-prediction", theoryId: "spelling-theory", constructId: item.constructId,
      context: "Immediate independent recall after practice", horizon: "Immediate, not retention",
      eligibility: { sources: ["practice"], maxDelayDays: 1, checkpointItemIds: [item.id] },
      expectedMetric: { key: "unassisted_recall_accuracy", min: 0.8, max: 1 },
      predictedErrorPatterns: [], confidence: 0.5, evidenceIds: ["school:one"],
      intervention: "Recorded practice", evidenceLimit: "practice_only",
      createdAt: "2026-10-01T00:00:00Z", lockedAt: "2026-10-01T00:00:00Z",
    }] }, { rootDir, now: new Date("2026-10-01T00:00:00Z") });
    recordSpellingDiscoveryAttempt({ childId, homeworkId,
      attempt: { attemptId: "recorded-recall", itemId: item.id, attemptedValue: "wrong", observedAt: "2026-10-01T00:01:00Z" },
      support: { status: "unassisted", scaffolds: [] },
    }, { rootDir, now: new Date("2026-10-01T00:01:00Z") });
    const app = express(); app.use(express.json());
    app.get("/api/profile/:child", (_req, res) => res.json({ companion: { ...COMPANION_DEFAULTS, vrmUrl: "" } }));
    app.get("/api/child-experience/:child", (_req, res) => res.json(buildChildExperiencePacket(getChildChart(childId, { rootDir }))));
    setupRoutes(app);
    const activeServer = app.listen(0, "127.0.0.1"); server = activeServer;
    await new Promise<void>(resolve => activeServer.once("listening", resolve));
    const address = activeServer.address(); if (!address || typeof address === "string") throw new Error("handoff_address_missing");
    const post = () => fetch(`http://127.0.0.1:${address.port}/api/learning-cycle/node-complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childId, homeworkId, nodeId: node.nodeId, result: { sessionId: "recorded-session", completed: true, accuracy: 0, timeSpent_ms: 1000, targetResults: [{ target: item.id, correct: false, attemptedValue: "wrong" }] } }) });
    expect((await post()).status).toBe(200);
    await vi.waitFor(() => expect(lab.interrupted).toBe(true));
    const partial = getLearningCycle(childId, homeworkId)!;
    expect(partial.nodes[0]!.state).toBe("completed");
    expect(partial.observations[0]!.result.correct).toBe(false);
    expect(partial.observations[0]!.childResponse).toBe("wrong");
    expect(partial.observations[0]!.assistance.status).toBe("unassisted");
    expect(currentBoardInstance(partial).boardId).toBe(board.boardId);
    expect(projectLearningCycle(partial).adventureBoard.boardId).toBe(board.boardId);
    const completedEvidence = structuredClone(partial.observations);
    // Execute the production startup recovery against the persisted synthetic cycle.
    vi.stubEnv("VITEST", ""); resumeSuccessorBoards();
    await vi.waitFor(() => expect(currentBoardInstance(getLearningCycle(childId, homeworkId)!).boardId).not.toBe(board.boardId), {timeout:5000});
    const ready = getLearningCycle(childId, homeworkId)!;
    expect(ready.boards).toHaveLength(2);
    expect(ready.observations).toEqual(completedEvidence);
    expect(ready.nodes.filter(row => currentBoardInstance(ready).nodeIds.includes(row.nodeId)).every(row => row.state === "ready" && row.artifactBinding?.validationStatus === "passed")).toBe(true);
    expect(lab.decisions).toBe(1); expect(lab.builds).toBe(0);
    // Publication alone did not prove that a returning session consumes the
    // decision. Exercise the same chart doorway and packet used at startup.
    const decisions = ready.decisionHistory.filter(row => row.eventType === "theory_decided");
    expect(decisions).toHaveLength(1);
    expect(ready.predictionEvaluations).toHaveLength(1);
    expect(ready.predictionEvaluations[0]).toMatchObject({ predictionId: "night-recall-prediction", observedMetric: 0, sufficiency: "sufficient", attribution: "observational_not_causal" });
    expect(decisions[0].predictionEvaluationIds).toEqual([ready.predictionEvaluations[0].evaluationId]);
    const successor = currentBoardInstance(ready);
    expect(successor.plannerDecisionId).toBe(decisions[0].decisionId);
    const citedCompletion = ready.evidence.academic.find(row => row.evidenceId === "recorded-session:practice:completion");
    expect(citedCompletion).toMatchObject({ accuracy: 0 });
    expect(decisions[0].evidenceIds).toContain(citedCompletion!.evidenceId);
    const returningChart = getChildChart(childId, { rootDir });
    const returningPacket = buildChildExperiencePacket(returningChart);
    expect(returningPacket.childChart.learningCycle?.boardKind).toBe("successor");
    expect(returningPacket.activeSessionPlan?.adventureBoard?.boardId).toBe(successor.boardId);
    expect(returningPacket.activeSessionPlan?.nodePlan.map(row => row.id)).toEqual(successor.nodeIds);
    expect(returningPacket.activeSessionPlan?.nodePlan.map(row => row.title)).toEqual(["Sound workshop", "Later recall"]);
    expect(returningChart.learningHistory.recentDecisions.map(row => row.decisionId)).toContain(decisions[0].decisionId);
    resumeSuccessorBoards();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(lab.decisions).toBe(1); expect(lab.builds).toBe(0);
    expect(getLearningCycle(childId, homeworkId)!.revision).toBe(ready.revision);
    const proofDir = path.join(process.cwd(), "outputs/spelling-next-session-proof");
    fs.mkdirSync(proofDir, { recursive: true });
    ws = new WebSocketServer({ server: activeServer, path: "/ws" });
    ws.on("connection", (socket, request) => handleWsConnection(socket, request));
    const module = await import(pathToFileURL(path.join(process.cwd(), "web/node_modules/vite/dist/node/index.js")).href);
    vite = await module.createServer({ configFile: false, root: path.join(process.cwd(), "web"), cacheDir: path.join(rootDir, "vite-cache"), esbuild: { jsx: "automatic" }, css: { postcss: { plugins: [require(path.join(process.cwd(), "web/node_modules/tailwindcss"))({ content: [path.join(process.cwd(), "web/src/**/*.{js,ts,jsx,tsx}")] })] } }, define: { "import.meta.env": JSON.stringify({ VITE_SUNNY_RUNTIME_CONFIG: JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "muted", childId, homeworkDomain: "spelling" }) }) }, server: { host: "127.0.0.1", port: 0, fs: { allow: [process.cwd()] }, proxy: { "/api": `http://127.0.0.1:${address.port}`, "/ws": { target: `ws://127.0.0.1:${address.port}`, ws: true } } } });
    await vite.listen();
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: proofDir } });
    page.setDefaultTimeout(15000);
    await page.route("**/*", route => ["127.0.0.1", "localhost", ""].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.goto(vite.resolvedUrls.local[0]);
    await page.locator(".adventure-board").waitFor();
    // Frozen authored labels are support-0/support-1 in this recorded program.
    await page.getByRole("button", { name: "support-0", exact: true }).waitFor();
    await page.screenshot({ path: path.join(proofDir, "next-board.png") });
    await page.getByRole("button", { name: "support-0", exact: true }).click();
    // The re-run built-in Word Radar opens natively in the kiosk (no generated page).
    await expect.poll(async () => page.getByTestId("word-radar-root").isVisible(), { timeout: 15000 }).toBe(true);
    await page.screenshot({ path: path.join(proofDir, "next-activity.png") });
    expect(lab.decisions).toBe(1); expect(lab.builds).toBe(0);
    await page.context().close();
    fs.writeFileSync(path.join(proofDir, "report.json"), JSON.stringify({
      provider: "recorded", authority: "simulation", passed: true,
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      workingTreeStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
      observations: ready.observations,
      predictions: ready.academicPredictions,
      evaluations: ready.predictionEvaluations,
      decision: decisions[0],
      nextSession: { boardId: successor.boardId, plannerDecisionId: successor.plannerDecisionId, activities: returningPacket.activeSessionPlan?.nodePlan.map(row => ({ id: row.id, title: row.title })) },
      decisionCount: lab.decisions, buildCount: lab.builds,
      retention: "unknown", improvement: "unknown",
      browser: { nextBoardVisible: true, successorActivityOpened: true, video: path.basename(await page.video()!.path()), screenshots: ["next-board.png", "next-activity.png"] },
      limitations: ["Recorded Planner, Creator and verifier", "Static recorded activity verifies launch, not teaching quality", "Synthetic performance is not child learning evidence"],
    }, null, 2));
  } finally {
    try {
      const remainingPage = browser?.contexts()[0]?.pages()[0];
      if (remainingPage && !remainingPage.isClosed()) {
        const diagnosticsDir = path.join(process.cwd(), "outputs/spelling-next-session-proof");
        fs.mkdirSync(diagnosticsDir, { recursive: true });
        fs.writeFileSync(path.join(diagnosticsDir, "last-page.txt"), await remainingPage.locator("body").innerText());
        await remainingPage.screenshot({ path: path.join(diagnosticsDir, "last-page.png") });
      }
      await browser?.close();
      await vite?.close();
      if (ws) { ws.clients.forEach(socket => socket.terminate()); await new Promise<void>(resolve => ws!.close(() => resolve())); }
      __resetVoiceSessionRegistryForTests();
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    } finally {
      vi.unstubAllGlobals(); vi.unstubAllEnvs();
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
}, 60000);
