import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Locator } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLearningCycle, type LearningCycleNodeContract } from "../engine/learningCycleRepository";
import { recordCanonicalNodeCompletion, type CanonicalCompletionResult } from "../engine/learningCycleRuntime";

const word = { id: "frozen-night", text: "night", definition: "The dark part of the day." };
const recordedConfig = {
  schemaVersion: 1, activityId: "letter-rush", domain: "spelling", mode: "type-and-spell", topic: "Recorded assigned word",
  words: [word], scaffolds: { showWord: false, letterBank: false, allowRetryBeforeScore: true, companionHints: false },
  evidencePolicy: { writesPracticeEvidence: true, writesMasteryEvidence: false, requiresPerTargetResult: true, allowedEvidence: ["practice"] },
  bonusRound: { enabled: false }, sfx: { enabled: false },
};
const viewports = [{ width: 1365, height: 768 }, { width: 1280, height: 720 }];
let browser: Browser;
const servers: http.Server[] = [];
const roots: string[] = [];
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });
afterEach(async () => {
  await Promise.all(browser.contexts().map(context => context.close()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
  vi.unstubAllEnvs();
});

async function launch(viewport: { width: number; height: number }, options: { bindings?: boolean; config?: string | null; body?: unknown; status?: number; malformedJson?: boolean } = {}) {
  const requests: string[] = [];
  const params = new URLSearchParams({ childId: "lab-child", nodeId: "letter-practice", sessionId: "frozen-launch", companion: "off" });
  if (options.bindings !== false) params.set("spellingItemBindings", JSON.stringify([{ itemId: word.id, word: word.text }]));
  if (options.config !== null) params.set("config", options.config ?? "/recorded-config.json");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    requests.push(url.pathname);
    if (requests.filter(value => value === url.pathname).length > 10) { response.writeHead(429).end(); return; }
    if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><html><head><title>Isolated native host</title></head><body style="margin:0">
        <button id="hostExit" style="position:fixed;left:12px;top:12px;z-index:10;padding:12px">Back to Map</button>
        <script>window.captured=[];window.exited=false;
        addEventListener('message',event=>{if(event.source!==document.querySelector('iframe')?.contentWindow)return;
          if(window.captured.filter(row=>row.type===event.data.type).length>=10)throw Error('native_event_loop');
          window.captured.push(event.data);});
        document.getElementById('hostExit').onclick=()=>{document.querySelector('iframe').remove();window.exited=true;};</script>
        <iframe title="Letter Rush" src="/games/letter-rush.html?${params.toString()}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
      </body></html>`);
    } else if (["/games/letter-rush.html", "/games/_contract.js"].includes(url.pathname)) {
      response.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript" : "text/html");
      response.end(fs.readFileSync(path.join(process.cwd(), "web/public", url.pathname)));
    } else if (url.pathname === "/recorded-config.json") {
      response.writeHead(options.status ?? 200, { "Content-Type": "application/json" });
      response.end(options.malformedJson ? "{not-json" : JSON.stringify(options.body ?? recordedConfig));
    } else response.writeHead(404).end();
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("native_test_address_missing");
  const origin = `http://127.0.0.1:${address.port}`;
  const page = await browser.newPage({ viewport }); page.setDefaultTimeout(4000);
  const errors: string[] = [], forbidden: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith("/api/")) { forbidden.push(url.origin + url.pathname); return route.abort(); }
    return route.continue();
  });
  await page.goto(origin);
  const frame = page.frameLocator("iframe");
  await frame.locator("#startSub").waitFor();
  await expect.poll(() => frame.locator("#startSub").textContent()).not.toBe("Config loading...");
  const messages = () => page.evaluate<Array<Record<string, any>>>("window.captured");
  return { page, frame, messages, requests, errors, forbidden };
}

async function assertUsable(control: Locator) {
  expect(await control.isEnabled()).toBe(true);
  expect(await control.evaluate((element: any) => {
    const box = element.getBoundingClientRect(), win = element.ownerDocument.defaultView!;
    return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.right <= win.innerWidth && box.bottom <= win.innerHeight
      && element.contains(element.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}

function commitCaptured(result: CanonicalCompletionResult) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-native-config-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  const node: LearningCycleNodeContract = {
    nodeId: "letter-practice", role: "baseline", state: "ready", title: "Letter practice",
    academicTarget: { domain: "spelling", skill: "spelling", targets: [word.text] }, algorithmOwner: "retrieval-practice", theoryId: "lab", experimentId: "lab", mechanic: "letter-rush", theme: "lab",
    openingScreen: { title: "Letter practice", purpose: "Practice" }, generationPrompt: null,
    artifactBinding: { artifactId: "native", contentId: "native", localArtifactPath: "/games/letter-rush.html", localArtworkPath: "/lab.svg", contractFingerprint: "frozen", validationStatus: "passed" },
    artwork: { status: "ready", localPath: "/lab.svg", prompt: null }, sfxContract: [], companionContract: { events: [] }, evidenceIds: [],
    evidenceContract: { academic: true, engagement: true, companionObservations: true, itemRoles: { [word.id]: "practice" }, spellingItems: {
      [word.id]: { domain: "spelling", id: word.id, wordId: "word-night", word: word.text, constructId: "spelling.night", lineage: { sourceEvidenceIds: ["recorded:config"], exposure: "practiced", measurementRole: "practice" }, response: { mode: "spelling_letters", acceptedForms: [word.text], caseSensitive: false } },
    } },
  };
  createLearningCycle({ childId: "lab-child", homeworkId: "hw-native-config", domain: "spelling", assignment: { title: "Recorded words", contentFingerprint: "recorded", capturedEvidenceIds: ["recorded:config"], targets: [word.text] }, academicTheory: { theoryId: "lab", revision: 1, hypothesis: "Practice", supportCriteria: [], reviseCriteria: [], falsifyCriteria: [] }, engagementTheory: null, nodes: [node] }, { rootDir });
  return recordCanonicalNodeCompletion({ childId: "lab-child", homeworkId: "hw-native-config", nodeId: node.nodeId, sessionId: "frozen-launch", result }, { rootDir })!;
}

// Human saw an unrelated sample after a config outage. The console error still
// led to normal gameplay; config-shape/unit tests never exercised the real fetch.
describe.each(viewports)("native frozen LetterRush at $width×$height", viewport => {
  it("fetches the supplied config and commits actual input under the frozen target", async () => {
    const { page, frame, messages, requests, errors, forbidden } = await launch(viewport);
    expect(await frame.locator("#startSub").textContent()).toContain(recordedConfig.topic);
    const start = frame.getByRole("button", { name: "Start", exact: true });
    await assertUsable(start); await start.click();
    const input = frame.getByRole("textbox", { name: "Type the spelling word" });
    await input.waitFor({ state: "visible" }); await assertUsable(input); await input.fill("night");
    const submit = frame.getByRole("button", { name: "Lock it", exact: true });
    await assertUsable(submit); await submit.click();
    await frame.getByRole("button", { name: "Next word →", exact: true }).click();
    await expect.poll(async () => (await messages()).filter(message => message.type === "node_complete").length).toBe(1);
    const captured = await messages();
    expect(captured.filter(message => message.type === "attempt_event").map(message => message.payload)).toMatchObject([{ target: word.id, attemptedValue: "night", masteryEligible: false }]);
    const completion = captured.find(message => message.type === "node_complete")!;
    expect(completion.targetResults).toMatchObject([{ target: word.id, attemptedValue: "night", correct: true }]);
    const saved = commitCaptured(completion as CanonicalCompletionResult);
    expect(saved.nodes[0].state).toBe("completed");
    expect(saved.observations).toHaveLength(1);
    expect(saved.observations[0]).toMatchObject({ itemId: word.id, childResponse: "night", result: { correct: true }, provenance: "practice", exposure: "previously_practiced" });
    expect(requests.filter(request => request === "/recorded-config.json")).toHaveLength(1);
    expect(errors).toEqual([]); expect(forbidden).toEqual([]);
    await assertUsable(page.getByRole("button", { name: "Back to Map", exact: true }));
  });

  it.each([
    { name: "failed fetch", status: 503 },
    { name: "malformed JSON", malformedJson: true },
    { name: "missing words", body: { ...recordedConfig, words: [] } },
    { name: "wrong frozen ID", body: { ...recordedConfig, words: [{ ...word, id: "other-id" }] } },
    { name: "wrong word", body: { ...recordedConfig, words: [{ ...word, text: "farmer" }] } },
    { name: "missing config", config: null },
    { name: "sample config", config: "sample-type" },
  ])("fails closed on $name, emits only instrument failure, and leaves host exit usable", async options => {
    const { page, frame, messages, errors, forbidden, requests } = await launch(viewport, options);
    expect(await frame.getByRole("alert").count()).toBe(1);
    expect(await frame.getByRole("alert").innerText()).toMatch(/could not load|unavailable/i);
    expect(await frame.locator("#startBtn").isDisabled()).toBe(true);
    expect(await frame.locator("#spellingInput").isVisible()).toBe(false);
    expect(await frame.locator("#targetRow").innerText()).toBe("");
    expect(await frame.locator("#starfield .star").count()).toBe(0); // start(sampleConfig(...)) never ran.
    const captured = await messages();
    const issues = captured.filter(message => message.type === "companion_event" && message.payload.trigger === "product_issue");
    expect(issues).toHaveLength(1);
    expect(issues[0].payload).toMatchObject({ activityId: "letter-rush", category: "instrument_failure", code: "letter_rush_config_unavailable" });
    expect(captured.filter(message => message.type !== "ready")).toEqual(issues);
    expect(requests.filter(request => request === "/recorded-config.json")).toHaveLength(options.config === null || options.config === "sample-type" ? 0 : 1);
    const exit = page.getByRole("button", { name: "Back to Map", exact: true });
    await assertUsable(exit); await exit.click();
    expect(await page.locator("iframe").count()).toBe(0);
    expect(errors).toEqual([]); expect(forbidden).toEqual([]);
  });

  it("preserves sample demos without frozen bindings after a config failure", async () => {
    const { frame, errors, forbidden } = await launch(viewport, { bindings: false, status: 503 });
    expect(await frame.getByRole("alert").count()).toBe(0);
    expect(await frame.locator("#startSub").textContent()).toContain("Week 5 spelling");
    const start = frame.getByRole("button", { name: "Start", exact: true });
    await assertUsable(start); await start.click();
    expect(await frame.locator("#targetRow .tile").count()).toBe(6);
    expect(errors).toEqual([]); expect(forbidden).toEqual([]);
  });
});
