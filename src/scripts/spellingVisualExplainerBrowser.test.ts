import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium, type Browser, type Locator } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const viewports = [{ width: 1365, height: 768 }, { width: 1280, height: 720 }];
const proofDir = path.join(process.cwd(), "outputs/spelling-visual-explainer-proof");
const config = {
  artifactId: "hw-spelling:visual-light:visual-explainer",
  type: "visual-explainer",
  concept: "The ight chunk",
  learningGoal: "Notice and remember the ight chunk.",
  misconception: "The middle sound maps to one letter.",
  sourceEvidence: { source: "assignment:lab", capturedAt: "2026-10-01T00:00:00Z", summary: "Recorded miss" },
  algorithmTargets: ["error-pattern-remediation", "retrieval-practice"],
  reuseDecision: { status: "candidate", reason: "Checkpoint pending." },
  parentApproval: { status: "pending" },
  mode: { default: "pause-for-question" },
  preview: { allowPlaythrough: true },
  narration: { enabled: false, provider: "companion", voiceId: "runtime", modelId: "runtime", audioPath: "none", scriptPath: "none", timings: [{ id: "strategy", startProgress: 0, endProgress: 100, text: "Keep the chunk together" }] },
  questions: [{ id: "check-ight", prompt: "Which chunk stays together?", options: [{ id: "ight", label: "ight", correct: true }, { id: "ite", label: "ite", correct: false }], correctOptionId: "ight", targetConcept: "frozen-light", misconceptionTag: "chunk-confusion", pauseAtProgress: 48, scaffoldLevel: 2 }],
  companionContext: { role: "hint_only", maxSentences: 3, canRevealAnswer: true },
  evidence: { targetResults: ["frozen-light"], completion: "visual-light:complete" },
  chrome: { childShowsEvidence: false, parentShowsEvidence: true, childShowsCarePlan: false, parentShowsCarePlan: true },
  spellingModel: { strategy: { title: "Keep the chunk together", steps: ["Say light.", "Notice ight.", "Build l + ight."] }, words: [{ id: "frozen-light", text: "light", chunks: ["l", "ight"], focusChunk: "ight", tip: "Keep ight together." }] },
};

let browser: Browser;
const servers: http.Server[] = [];

beforeAll(async () => { fs.mkdirSync(proofDir, { recursive: true }); browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });
afterEach(async () => {
  await Promise.all(browser.contexts().map((context) => context.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

async function assertUsable(control: Locator): Promise<void> {
  expect(await control.isVisible()).toBe(true);
  expect(await control.isEnabled()).toBe(true);
  expect(await control.evaluate((element: any) => {
    const box = element.getBoundingClientRect();
    const view = element.ownerDocument.defaultView!;
    return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0
      && box.right <= view.innerWidth && box.bottom <= view.innerHeight
      && element.contains(element.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}

async function launch(viewport: { width: number; height: number }) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><html><body style="margin:0"><script>window.captured=[];addEventListener('message',event=>{if(event.source===document.querySelector('iframe').contentWindow)window.captured.push(event.data)});</script><iframe title="Visual Explainer" src="/games/spelling-visual-explainer.html?childId=lab-child&nodeId=visual-light&sessionId=visual-proof&companion=elli&companionName=Elli&preview=false&chrome=child&config=%2Fconfig.json" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>`);
      return;
    }
    if (url.pathname === "/config.json") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(config));
      return;
    }
    if (["/games/spelling-visual-explainer.html", "/games/_contract.js", "/generated/openai-visual-probe/artifact-shell.js"].includes(url.pathname)) {
      response.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript" : "text/html");
      response.end(fs.readFileSync(path.join(process.cwd(), "web/public", url.pathname)));
      return;
    }
    response.writeHead(404).end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("spelling_visual_test_address_missing");
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Show me" }).waitFor();
  await expect.poll(() => frame.locator('[data-item-id="frozen-light"] .chunk').count()).toBe(2);
  return { page, frame, errors };
}

describe.each(viewports)("spelling Visual Explainer at $width×$height", (viewport) => {
  it("models the frozen word, records practice only, and completes without clipping", async () => {
    const { page, frame, errors } = await launch(viewport);
    await assertUsable(frame.getByRole("button", { name: "Show me" }));
    await page.screenshot({ path: path.join(proofDir, `opening-${viewport.width}x${viewport.height}.png`) });
    await frame.locator("body").evaluate(() => {
      (globalThis as any).SunnySpellingVisualExplainer.setProgress(48, false);
    });
    const correct = frame.getByRole("button", { name: "ight", exact: true });
    await assertUsable(correct);
    await page.screenshot({ path: path.join(proofDir, `question-${viewport.width}x${viewport.height}.png`) });
    await correct.click();
    const reveal = frame.getByRole("button", { name: "See the strategy" });
    await assertUsable(reveal);
    await reveal.click();
    await page.screenshot({ path: path.join(proofDir, `strategy-${viewport.width}x${viewport.height}.png`) });
    await frame.locator("body").evaluate(() => {
      (globalThis as any).SunnySpellingVisualExplainer.setProgress(100, false);
      (globalThis as any).SunnySpellingVisualExplainer.completeActivity();
    });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(proofDir, `completion-${viewport.width}x${viewport.height}.png`) });
    const captured = await page.evaluate<Array<Record<string, any>>>("window.captured");
    expect(captured.map((message) => message.type)).toContain("node_complete");
    const attempt = captured.find((message) => message.type === "attempt_event")?.payload;
    expect(attempt).toMatchObject({ target: "frozen-light", correct: true, masteryEligible: false });
    const completion = captured.find((message) => message.type === "node_complete");
    expect(completion).toMatchObject({ completed: true, targetResults: [{ target: "frozen-light", masteryEligible: false }] });
    expect(errors).toEqual([]);
  });
});
