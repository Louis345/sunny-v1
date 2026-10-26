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

async function launch(
  viewport: { width: number; height: number },
  options: { configAvailable?: boolean; preview?: "false" | "true"; modelConfig?: typeof config } = {},
) {
  const activeConfig=options.modelConfig ?? config;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><html><body style="margin:0"><script>window.captured=[];addEventListener('message',event=>{if(event.source===document.querySelector('iframe').contentWindow)window.captured.push(event.data)});</script><iframe title="Visual Explainer" src="/games/spelling-visual-explainer.html?childId=lab-child&nodeId=visual-light&sessionId=visual-proof&launchToken=visual-launch&spellingItemBindings=${encodeURIComponent(JSON.stringify(activeConfig.spellingModel.words.map(word=>({itemId:word.id,word:word.text}))))}&companion=elli&companionName=Elli&preview=${options.preview ?? "false"}&chrome=child&config=%2Fconfig.json" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>`);
      return;
    }
    if (url.pathname === "/config.json") {
      if (options.configAvailable === false) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(activeConfig));
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
  if (options.configAvailable !== false || options.preview === "true") {
    await frame.getByRole("button", { name: "Show me" }).waitFor();
    const expectedItemId = options.configAvailable === false ? "fallback" : activeConfig.spellingModel.words[0].id;
    await expect.poll(() => frame.locator(`[data-item-id="${expectedItemId}"] .chunk`).count()).toBe(options.configAvailable === false ? 2 : activeConfig.spellingModel.words[0].chunks.length);
  }
  return { page, frame, errors };
}

describe.each(viewports)("spelling Visual Explainer at $width×$height", (viewport) => {
  it("models the frozen word, records practice only, and completes without clipping", async () => {
    const { page, frame, errors } = await launch(viewport);
    await assertUsable(frame.getByRole("button", { name: "Show me" }));
    await page.screenshot({ path: path.join(proofDir, `opening-${viewport.width}x${viewport.height}.png`) });
    await frame.locator("body").evaluate(() => {
      (globalThis as any).SunnySpellingVisualExplainer.setProgress(85, false);
    });
    const correct = frame.getByRole("button", { name: "ight", exact: true });
    await assertUsable(correct);
    await page.screenshot({ path: path.join(proofDir, `question-${viewport.width}x${viewport.height}.png`) });
    await correct.click();
    const reveal = frame.getByRole("button", { name: "Keep going" });
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
    const completion = captured.find((message) => message.type === "node_complete");
    // A completion must cross the same JSON transport used by the kiosk/server.
    expect(() => JSON.stringify(completion)).not.toThrow();
    expect(() => JSON.stringify(captured.find((message) => message.type === "game_complete"))).not.toThrow();
    const attempts=captured.filter(message=>message.type==='attempt_event');
    expect(attempts).toHaveLength(2);
    expect(attempts[0].payload).toMatchObject({launchToken:'visual-launch',evidenceLimitation:'non_spelling_response',rawChoice:'ight',aggregateAccuracy:null});
    expect(attempts[0].payload).not.toHaveProperty('attemptedValue');
    expect(attempts[1].payload).toMatchObject({launchToken:'visual-launch',evidenceLimitation:'per_word_results_unavailable'});
    expect(attempts[1].payload).not.toHaveProperty('attemptedValue');
    const shown=captured.filter(message=>message.type==='game_state_update'&&message.payload.spellingItemOpened);
    expect(shown).toHaveLength(1);
    expect(shown[0].payload).toMatchObject({itemId:'frozen-light',launchToken:'visual-launch',practiceCapture:true,answerVisibility:'visible'});
    expect(captured.indexOf(shown[0])).toBeLessThan(captured.indexOf(attempts[0]));
    expect(completion).toMatchObject({
      completed: true,
      targetResults: [{
        target: "frozen-light",
        evidenceRole: "assisted_instruction",
        masteryEligible: false,
      }],
    });
    expect(completion).toBeDefined();
    expect(completion!.targetResults[0]).not.toHaveProperty("attemptedValue");
    expect(completion!.targetResults[0]).not.toHaveProperty("correct");
    expect(errors).toEqual([]);
  });

  it("keeps the completed strategy readable until Done is tapped", async () => {
    const { page, frame } = await launch(viewport);
    await frame.locator("body").evaluate(() => (globalThis as any).SunnySpellingVisualExplainer.setProgress(85, false));
    await frame.getByRole("button", { name: "ight", exact: true }).click();
    await frame.getByRole("button", { name: "Keep going" }).click();
    await frame.locator("body").evaluate(() => {
      (globalThis as any).SunnySpellingVisualExplainer.pause();
      (globalThis as any).SunnySpellingVisualExplainer.setProgress(99, false);
      (globalThis as any).SunnySpellingVisualExplainer.play();
    });
    await expect.poll(async () => frame.locator("#progressOut").textContent()).toBe("100%");
    await page.waitForTimeout(100);
    expect((await page.evaluate<Array<Record<string, any>>>("window.captured")).some(message => message.type === "node_complete")).toBe(false);
    const done = frame.getByRole("button", { name: "Done" });
    await assertUsable(done);
    await done.click();
    await expect.poll(async () => (await page.evaluate<Array<Record<string, any>>>("window.captured")).some(message => message.type === "node_complete")).toBe(true);
  });

  it("lets Ila request each visible chunk aloud", async () => {
    const { page, frame } = await launch(viewport);
    await frame.locator("body").evaluate(() => (globalThis as any).SunnySpellingVisualExplainer.setProgress(85, false));
    await frame.getByRole("button", { name: "ight", exact: true }).click();
    await frame.getByRole("button", { name: "Keep going" }).click();
    await frame.locator("body").evaluate(() => {
      (globalThis as any).SunnySpellingVisualExplainer.pause();
      (globalThis as any).SunnySpellingVisualExplainer.setProgress(70, false);
    });
    const chunk = frame.getByRole("button", { name: "Hear ight" });
    await assertUsable(chunk);
    await chunk.click();
    await expect.poll(async () => (await page.evaluate<Array<Record<string, any>>>("window.captured")).find(message => message.type === "narration_request")?.text).toBe("ight");
  });

  it("blocks safely instead of teaching fallback content when production config is missing", async () => {
    const { page, frame, errors } = await launch(viewport, { configAvailable: false });
    await frame.getByRole("alert").waitFor();
    expect(await frame.getByRole("alert").textContent()).toContain("This activity needs a quick reset");
    await assertUsable(frame.getByRole("alert").getByRole("button", { name: "Back to map" }));
    expect(await frame.locator('[data-item-id="fallback"]').count()).toBe(0);
    await frame.getByRole("alert").getByRole("button", { name: "Back to map" }).click();
    await expect.poll(async () => (await page.evaluate<Array<Record<string, any>>>("window.captured")).map(message => message.type)).toContain("map_back");
    const captured = await page.evaluate<Array<Record<string, any>>>("window.captured");
    expect(captured.map((message) => message.type)).not.toContain("node_complete");
    expect(captured.map((message) => message.type)).not.toContain("attempt_event");
    expect(errors).toEqual([]);
  });

  it("allows the embedded demonstration only in a non-writing preview", async () => {
    const { page, frame, errors } = await launch(viewport, { configAvailable: false, preview: "true" });
    await assertUsable(frame.getByRole("button", { name: "Show me" }));
    expect(await frame.locator('[data-item-id="fallback"]').count()).toBe(1);
    expect(await frame.getByRole("alert").count()).toBe(0);
    const captured = await page.evaluate<Array<Record<string, any>>>("window.captured");
    expect(captured.map(message => message.type)).not.toContain("node_complete");
    expect(captured.map(message => message.type)).not.toContain("attempt_event");
    expect(errors).toEqual([]);
  });
});

// Real run with five words clipped its entire strategy and Done controls.
// Prior browser tests used one word; config readiness did not prove payload fit.
it.each([{width:1280,height:720},{width:768,height:1024},{width:548,height:1024}])('keeps a full eight-word intervention readable and actionable at $width×$height',async viewport=>{
 const modelConfig=structuredClone(config);
 modelConfig.concept='Long e spelling patterns across the complete homework list';
 modelConfig.learningGoal='Notice the vowel pattern, hear each chunk, and rebuild each assigned word without losing the controls.';
 modelConfig.spellingModel.strategy.steps=['Find the letter team that spells the vowel sound in each word.','Count the chunks and say each chunk as you write it.','Reread the whole word to check it looks right.'];
 modelConfig.spellingModel.words=Array.from({length:8},(_,i)=>({id:'frozen-word-'+i,text:'believe',chunks:['be','lie','ve'],focusChunk:'lie',tip:'Notice the letter team and keep the vowel sound together as you rebuild this word.'}));
 const {page,frame,errors}=await launch(viewport,{modelConfig});
 await assertUsable(frame.getByRole('button',{name:'Show me'}));
 expect(await frame.locator('.card').evaluate((e:any)=>{const card=e.getBoundingClientRect(),header=e.ownerDocument.querySelector('header').getBoundingClientRect();return card.top>=header.bottom && card.bottom<=e.ownerDocument.defaultView.innerHeight;})).toBe(true);
 expect(await frame.locator('header').evaluate((e:any)=>e.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
 await frame.locator('body').evaluate(()=>(globalThis as any).SunnySpellingVisualExplainer.setProgress(85,false));
 await frame.getByRole('button',{name:'ight',exact:true}).click();
 await frame.getByRole('button',{name:'Keep going',exact:true}).click();
 await frame.locator('body').evaluate(()=>(globalThis as any).SunnySpellingVisualExplainer.setProgress(100,false));
 await assertUsable(frame.getByRole('button',{name:'Done',exact:true}));
 await frame.locator('#wordModels').evaluate(async(e:any)=>Promise.all(e.getAnimations({subtree:true}).map((a:any)=>a.finished)));
 const last=frame.locator('[data-item-id="frozen-word-7"] .chunk').last();
 await last.scrollIntoViewIfNeeded();await assertUsable(last);
 await assertUsable(frame.getByRole('button',{name:'Done',exact:true}));
 await page.screenshot({path:path.join(proofDir,`full-intervention-${viewport.width}x${viewport.height}.png`)});
 await frame.getByRole('button',{name:'Done',exact:true}).click();
 await expect.poll(()=>page.evaluate<any[]>('window.captured')).toContainEqual(expect.objectContaining({type:'node_complete'}));
 expect(errors).toEqual([]);
},20000);


// The worker previously repartitioned chunks to match the focus substring,
// breaking their paired audio. Highlighting belongs in the renderer instead.
it('highlights a focus across authored chunk boundaries without changing tiles or sound cues',async()=>{
 const modelConfig=structuredClone(config);
 Object.assign(modelConfig.spellingModel.words[0],{chunks:['li','ght'],spokenChunks:['lih sound','t sound'],focusChunk:'ight'});
 const {page,frame,errors}=await launch({width:1280,height:720},{modelConfig});
 await frame.locator('body').evaluate(()=>(globalThis as any).SunnySpellingVisualExplainer.setProgress(85,false));
 await frame.getByRole('button',{name:'ight',exact:true}).click();
 await frame.getByRole('button',{name:'Keep going',exact:true}).click();
 await frame.locator('body').evaluate(()=>(globalThis as any).SunnySpellingVisualExplainer.setProgress(100,false));
 expect(await frame.locator('.chunk').allTextContents()).toEqual(['li','ght']);
 expect((await frame.locator('.focus-letter').allTextContents()).join('')).toBe('ight');
 await frame.getByRole('button',{name:'Hear li',exact:true}).click();
 await frame.getByRole('button',{name:'Hear ght',exact:true}).click();
 await expect.poll(async()=>(await page.evaluate<any[]>('window.captured')).filter(message=>message.type==='narration_request').length).toBe(2);
 const requests=await page.evaluate<any[]>('window.captured');
 expect(requests.filter(message=>message.type==='narration_request').map(message=>({text:message.text,chunk:message.chunk,index:message.chunkIndex}))).toEqual([{text:'lih sound',chunk:'li',index:0},{text:'t sound',chunk:'ght',index:1}]);
 expect(errors).toEqual([]);
});

// 2026-10-26 parent test (Saori, demo-pashley): the syllables page quizzed her on one word ("thumb") halfway
// through, before anything was taught, showed a teacher's note about her as the heading, and put every word
// and tip on screen at once. Nothing failed, so no log showed it; these tests only checked that it completed.
it('teaches one word at a time under her trick, and checks only after the lesson',async()=>{
 const modelConfig=structuredClone(config);
 modelConfig.learningGoal='She will recognize the ight pattern and keep it together.';
 modelConfig.spellingModel.strategy={title:'Keep ight together',steps:['ight is a team.','Write it as one.']};
 modelConfig.spellingModel.words=['light','night','right'].map(text=>({id:'frozen-'+text,text,chunks:[text[0],'ight'],focusChunk:'ight',tip:'ight sticks together.'}));
 // A saved explainer still asks for its check at 48%; the page waits for the end of the lesson anyway.
 (modelConfig.questions[0] as any).pauseAtProgress=48;
 const {frame,errors}=await launch({width:1280,height:720},{modelConfig});
 expect(await frame.locator('h1').textContent()).toBe('Keep ight together');
 expect(await frame.locator('#strategySteps li').allTextContents()).toEqual(['ight is a team.','Write it as one.']);
 for(const note of await frame.getByText('She will recognize',{exact:false}).all())expect(await note.isVisible()).toBe(false);
 const shown=async()=>frame.locator('.word-model:not([hidden])').evaluateAll((rows:any[])=>rows.map(row=>row.dataset.itemId));
 await frame.locator('body').evaluate(()=>(globalThis as any).SunnySpellingVisualExplainer.setProgress(20,false));
 expect(await shown()).toEqual(['frozen-light']);
 await frame.locator('body').evaluate(()=>(globalThis as any).SunnySpellingVisualExplainer.setProgress(60,false));
 expect(await shown()).toEqual(['frozen-right']);
 expect(await frame.locator('body').evaluate((body:any)=>body.classList.contains('question-active'))).toBe(false);
 await frame.locator('body').evaluate(()=>(globalThis as any).SunnySpellingVisualExplainer.setProgress(85,false));
 expect(await frame.locator('body').evaluate((body:any)=>body.classList.contains('question-active'))).toBe(true);
 expect(await shown()).toEqual(['frozen-light','frozen-night','frozen-right']);
 expect(errors).toEqual([]);
});

it('leaves an older saved explainer\'s long adult steps off her screen',async()=>{
 const modelConfig=structuredClone(config);
 modelConfig.spellingModel.strategy.steps=['Find the hidden-letter pattern in the word: kn, wr, or mb.','Say the word slowly and notice the silent letter makes no sound of its own.','Write the whole pattern together as one chunk so you do not skip it.','Check your word.'];
 const {frame,errors}=await launch({width:1280,height:720},{modelConfig});
 expect(await frame.locator('#strategySteps li').count()).toBe(0);
 expect(errors).toEqual([]);
});
