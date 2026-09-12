import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import { expect, it, vi } from "vitest";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";
import { buildDiscoveryActiveSessionPlan, createDiscoveryLearningCycle, getMathGenerationStatus, setMathGenerationPhase, type MathDiscoveryEvaluationContract } from "../engine/adaptiveMathDiscovery";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { plan, learningProgram, releaseActivityHtml, graphAuditExamples } from "./fixtures/adaptiveMathRelease";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { generateCanonicalProgressionArtifact } from "../engine/canonicalProgressionGenerator";
import { buildLongitudinalLearningHistory } from "../engine/longitudinalLearning";
import { generateDirectArtifacts, runDirectBrowserSmokeCheck } from "../engine/directMathExperience";
import { createHash } from "node:crypto";
import { projectLearningCycle } from "../engine/learningCycleRepository";
import { advanceCanonicalCycleFromEvidence } from "../engine/learningCycleRuntime";
import { setupRoutes } from "../server/routes";

vi.mock("../engine/directMathExperience", async original => ({...await original<typeof import("../engine/directMathExperience")>(), generateDirectArtifacts:vi.fn(),askDirectMathPlanner:vi.fn(()=>{throw new Error("paid_planner_forbidden");}),askMathExperienceDesigner:vi.fn(()=>{throw new Error("paid_creator_forbidden");})}));

vi.mock("../engine/returnedWorkPipeline",async original=>{
  const actual=await original<typeof import("../engine/returnedWorkPipeline")>();
  return {...actual,createReturnedWorkDraft:(input:any)=>actual.createReturnedWorkDraft(input,{extract:async()=>({items:[{itemId:"graded-1",prompt:"5 × 2",childResponse:"10",correct:true,extractionConfidence:1,constructLinks:[{constructId:"math.multiplication.equal_groups",role:"primary",confidence:1}]}]})}),confirmReturnedWorkDraft:(input:any)=>actual.confirmReturnedWorkDraft(input,{interpret:async (cycle,sourceId)=>({status:"inconclusive",reason:"Observed returned work; assistance unknown",nextAction:"Fresh delayed checkpoint",evidenceIds:cycle.observations.filter(o=>o.sourceId===sourceId).map(o=>o.observationId),predictionEvaluationIds:cycle.predictionEvaluations.filter(e=>e.sourceId===sourceId).map(e=>e.evaluationId),preserve:[],change:[],testNext:[],nextEvidenceRequired:["delayed checkpoint"]})})};
});

vi.mock("../profiles/buildProfile",()=>({buildProfile:async()=>({games:{}})}));
vi.mock("../server/currencyAward",()=>({reconcileCompanionCareCurrencyAward:()=>({ok:true,balance:25})}));
vi.mock("../engine/learningCycleRuntime",async original=>{const actual=await original<typeof import("../engine/learningCycleRuntime")>();return {...actual,advanceCanonicalCycleFromEvidence:(input:any,opts:any)=>input.decide?actual.advanceCanonicalCycleFromEvidence(input,opts):Promise.resolve(getLearningCycle(input.childId,input.homeworkId,opts))};});
const lab = vi.hoisted(() => ({ chart: () => ({}) }));
vi.mock("../profiles/childChart", () => ({ getChildChart: () => lab.chart() }));
vi.mock("../shared/childRegistry", async original => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["lab-child"] }));

const parentOperated = process.env.SUNNY_MATH_PARENT_ACCEPTANCE === "1";
it("plays the isolated math release journey through calibration and the next Planner request", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-host-acceptance-"));
  const outputDir = path.join(process.cwd(), "outputs/math-release-acceptance");
  fs.mkdirSync(outputDir, { recursive: true });
  const childId = "lab-child", homeworkId = "hw-browser-lab";
  const contextRoot = path.join(rootDir, "src/context");
  vi.stubEnv("ANTHROPIC_API_KEY", "");vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("SUNNY_CONTEXT_ROOT", contextRoot);
  vi.stubEnv("SUNNY_MODE", "real");
  vi.stubEnv("SUNNY_STATELESS", "false");
  vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({subject:"homework",sessionMode:"real",previewMode:"off",nodeAccess:"normal",voiceMode:"normal",childId,homeworkDomain:"math"}));
  const games = path.join(contextRoot, childId, "homework/games", homeworkId);
  const draft = path.join(contextRoot, childId, "homework/direct-drafts", homeworkId);
  fs.mkdirSync(games, { recursive: true }); fs.mkdirSync(draft, { recursive: true });
  const evaluation: MathDiscoveryEvaluationContract = {
    evaluationId: "discovery-lab", title: "Lab Discovery", assignmentEvidenceIds: ["assignment:synthetic"],
    constructs: [{ constructId: "math.graph_reading", prerequisiteIds: [] }],
    items: ["graph", "numeric", "skipped"].map((itemId, i) => ({ itemId, constructId: "math.graph_reading", prompt: i===0?graphAuditExamples.corrected.prompt:i===1?"How many books did Nia read?":"How many books did Sol read?", representationSpec: "Bar graph: Cleo=3, Nia=4, Sol=2 books; axis ticks 0,1,2,3,4.", responseContract: { mode: i === 0 ? "tap_selection" : "tap_numeric_pad", representationId: "bar_graph" }, correctAnswerContract: { acceptedValues: [String([3,4,2][i])] }, difficultyBoundary: "unit scale", exposureId: `lab:${itemId}`, possibleConfounds: [], falsifyingEvidence: [], measurementKeys: [] })),
    artifact: { artifactId: "lab", htmlPath: path.join(games, "discovery.html"), artworkPath: "/lab.svg", contractHash: "synthetic", artifactHash: "synthetic" },
  };
  fs.writeFileSync(path.join(draft, "discovery-contract.json"), JSON.stringify(evaluation));
  fs.writeFileSync(evaluation.artifact.htmlPath, `<!doctype html><html><head><style>html,body{background:white;color:#172033;font:20px system-ui;margin:0;padding:16px}svg{display:block;margin:20px 0}button,input{font:20px system-ui;padding:12px;margin:8px}button{cursor:pointer}h1{font-size:30px}</style></head><body><h1 id="question">How many books did Cleo read?</h1><p>Books read</p><svg width="300" height="190"><text x="0" y="170">0</text><text x="0" y="135">1</text><text x="0" y="100">2</text><text x="0" y="65">3</text><text x="0" y="30">4</text><rect x="40" y="65" width="50" height="105" fill="blue"/><text x="40" y="188">Cleo</text><rect x="120" y="30" width="50" height="140" fill="green"/><text x="120" y="188">Nia</text><rect x="200" y="100" width="50" height="70" fill="purple"/><text x="200" y="188">Sol</text></svg><button id="help">Hard to read</button><span id="choices"><button id="three">3 books</button><button id="four">4 books</button><button id="one">1 book</button></span><input id="number" aria-label="Your answer" type="text" hidden><button id="submit" hidden>Submit</button><button id="skip" hidden>Skip question</button><script>
  let item='graph';const post=(type,payload)=>parent.postMessage({type,payload},'*');
  const answer=value=>{post('evaluation_attempt',{attemptId:'attempt-'+item,itemId:item,attemptedValue:value,supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()});};
  document.querySelector('#help').onclick=()=>post('evaluation_friction',{itemId:item,instrumentSignals:['reading_friction']});
  const choose=value=>{answer(value);item='numeric';document.querySelector('#question').textContent='How many books did Nia read?';document.querySelector('#choices').hidden=true;document.querySelector('#number').hidden=false;document.querySelector('#submit').hidden=false;};document.querySelector('#three').onclick=()=>choose('3');document.querySelector('#four').onclick=()=>choose('4');document.querySelector('#one').onclick=()=>choose('1');
  document.querySelector('#submit').onclick=()=>{answer(document.querySelector('#number').value);item='skipped';document.querySelector('#question').textContent='How many books did Sol read?';document.querySelector('#number').hidden=true;document.querySelector('#submit').hidden=true;document.querySelector('#skip').hidden=false;};
  document.querySelector('#skip').onclick=()=>{post('evaluation_complete',{});};post('evaluation_ready',{});
  </script></body></html>`);
  let activeSessionPlan = buildDiscoveryActiveSessionPlan({childId, homeworkId, evaluation, companion:{id:"elli",name:"Elli"}});
  createDiscoveryLearningCycle({rootDir,childId,homeworkId,evaluation,assignment:{title:"Synthetic graph",contentFingerprint:"synthetic",capturedEvidenceIds:["assignment:synthetic"],targets:[]}});
  lab.chart = () => ({rootDir,childId,demographics:{age:9,grade:3},learningProfile:{sessionStats:{}},learningHistory:{constructs:{}},decisionTrace:{},identity:{displayName:"Lab"},companion:{presetId:"elli",displayName:"Elli",config:COMPANION_DEFAULTS},homework:{selectedDomain:"math"},activeSessionPlan:projectLearningCycle(getLearningCycle(childId,homeworkId,{rootDir})!,{presentationPlan:activeSessionPlan}).activeSessionPlan,learningCycle:getLearningCycle(childId,homeworkId,{rootDir}),adventureMapProfile:{},economy:{companionCurrency:0},companionCare:null});
  const app = express(); app.use(express.json());
  app.get("/api/profile/:childId", (_req,res)=>res.json({companion:COMPANION_DEFAULTS}));
  let unavailablePacketReads = 0;
  app.get("/api/child-experience/:childId", (_req,res)=>{
    if (unavailablePacketReads > 0) { unavailablePacketReads -= 1; return res.status(503).json({error:"recorded_packet_outage"}); }
    return res.json(buildChildExperiencePacket(lab.chart() as never));
  });
  app.post("/api/child/:childId/choice-event", (_req,res)=>res.status(503).json({error:"synthetic_engagement_offline"}));
  setupRoutes(app);
  const server = app.listen(0,"127.0.0.1"); await new Promise<void>(resolve=>server.once("listening",resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address_missing");
  const ws = new WebSocketServer({server,path:"/ws"});
  ws.on("connection", socket=>socket.on("message",data=>{if(JSON.parse(String(data)).type==="start_session"){socket.send(JSON.stringify({type:"session_started",child:"Lab-child"}));socket.send(JSON.stringify({type:"session_boot_ready"}));socket.send(JSON.stringify({type:"audio",data:"UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=="}));socket.send(JSON.stringify({type:"audio_done"}));}}));
  let vite: any, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const browserErrors: string[] = [], networkEvents:string[]=[]; let step = "boot";
  let releaseSibling: (()=>void)|undefined, generation: Promise<void>|undefined;
  try {
    const viteModule = await import(pathToFileURL(path.join(process.cwd(),"web/node_modules/vite/dist/node/index.js")).href);
    vite = await viteModule.createServer({configFile:false,root:path.join(process.cwd(),"web"),cacheDir:path.join(rootDir,"vite-cache"),esbuild:{jsx:"automatic"},css:{postcss:{plugins:[require(path.join(process.cwd(),"web/node_modules/tailwindcss"))({content:[path.join(process.cwd(),"web/src/**/*.{js,ts,jsx,tsx}")]})]}},define:{"import.meta.env":JSON.stringify({VITE_SUNNY_RUNTIME_CONFIG:JSON.stringify({subject:"homework",sessionMode:"real",previewMode:"off",nodeAccess:"normal",voiceMode:"normal",childId,homeworkDomain:"math"})})},server:{host:"127.0.0.1",port:0,fs:{allow:[process.cwd()]},proxy:{"/api":`http://127.0.0.1:${address.port}`,"/ws":{target:`ws://127.0.0.1:${address.port}`,ws:true}}}});
    await vite.listen();

    browser = await chromium.launch({headless:!parentOperated,args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
    const page = await browser.newPage({viewport:{width:1365,height:900}}); page.setDefaultTimeout(35000);
    page.on("pageerror",error=>browserErrors.push(error.message));
    page.on("response",response=>{if(response.url().includes("/api/"))networkEvents.push(String(response.status())+" "+response.url());});
    page.on("requestfailed",request=>networkEvents.push(request.url()+":"+request.failure()?.errorText));
    try {
      await page.context().tracing.start({screenshots:true,snapshots:true});
      await page.route("**/*",route=>{const host=new URL(route.request().url()).hostname;return ["127.0.0.1","localhost",""].includes(host)?route.continue():route.abort();});
      // A quiet companion emits no opening audio. The curtain must still open.
      await page.routeWebSocket("**/ws",socket=>socket.onMessage(data=>{if(JSON.parse(String(data)).type==="start_session"){socket.send(JSON.stringify({type:"session_started",child:"Lab-child"}));socket.send(JSON.stringify({type:"session_boot_ready"}));}}));
      await page.goto(vite.resolvedUrls.local[0]);
      step="open Discovery automatically through host";
      const frame = page.frameLocator("iframe").last();
      await frame.locator("#help").waitFor({state:"visible"});
      await page.screenshot({path:path.join(outputDir,"discovery-graph.png")});
      step="Discovery responses";
      if(parentOperated)console.log("PARENT: inspect the graph question. Click Hard to read, choose 3 books, enter 2 and Submit, then Skip question.");
      else {await frame.locator("#help").click();await frame.locator("#three").click();await frame.locator("#number").fill("2");await frame.locator("#submit").click();await frame.locator("#skip").click();}
      await expect.poll(()=>getLearningCycle(childId,homeworkId,{rootDir})?.lifecycle,{timeout:parentOperated?180000:10000}).toBe("evidence_ready");
      const cycle = getLearningCycle(childId,homeworkId,{rootDir})!;
      expect(cycle.observations).toHaveLength(2);
      expect(cycle.observations.some(o=>o.itemId==="skipped")).toBe(false);
      expect(cycle.observations.find(o=>o.itemId==="graph")?.confounds).toContain("reading_friction");
      expect(cycle.observations.find(o=>o.itemId==="numeric")?.result.correct).toBe(false);
      step="rating Skip with engagement offline";
      await Promise.all([page.waitForResponse(response=>response.url().includes("/choice-event")&&response.status()===503,{timeout:parentOperated?180000:35000}), parentOperated?Promise.resolve(console.log("PARENT: click Skip below the fun rating.")):page.getByRole("button",{name:"Skip fun rating",exact:true}).click()]);
      expect(getLearningCycle(childId,homeworkId,{rootDir})!.observations).toEqual(cycle.observations);
      await page.screenshot({path:path.join(outputDir,"discovery-completed.png")});
      step="truthful preparation handoff before a map exists";
      await page.getByRole("button",{name:"Check progress",exact:true}).waitFor({state:"visible",timeout:5000});
      step="finish for now without losing Discovery";
      await page.getByRole("button",{name:"Finish for now",exact:true}).click();
      await page.getByRole("heading",{name:"Finished for now",exact:true}).waitFor({state:"visible",timeout:5000});
      await page.getByRole("button",{name:"Return to assignment",exact:true}).click();
      await page.getByRole("button",{name:"Check progress",exact:true}).waitFor({state:"visible"});
      step="prepare mocked targeted providers";
      const targeted = plan(2);
      for (const activity of targeted.activities) {
        activity.items = ["q1","q2","q3"].map((id,index)=>({...activity.items[0],id,...(index===1?{prompt:"2 × 3 = ?",response:{mode:"numeric",expected:6}}:index===2?{prompt:"Construct the total for 5 × 2",response:{mode:"construction",expectedState:{total:10},successDescription:"Ten counters in the total"}}:{})}));
        activity.academicPrediction.eligibility = {sources:["independent_probe","graded_work"],maxDelayDays:7};
      }
      const program = learningProgram(2);
      program.activities.forEach((activity: any,index:number)=>{activity.items=targeted.activities[index].items;activity.academicPrediction=targeted.activities[index].academicPrediction;});
      const writeDraft=(name:string,value:unknown)=>fs.writeFileSync(path.join(draft,name),JSON.stringify(value));
      writeDraft("assignment-extraction.json",{version:3,fileHash:"lab",extraction:{sourcePath:"lab.pdf",sourceKind:"text_assignment",mediaType:"text/plain",extractionMethod:"text",filename:"lab.pdf",fullText:"Equal groups",fileHash:"lab",pages:[],warnings:[]}});
      writeDraft("math-learning-program.json",program);writeDraft("design-packet.json",{version:1,planId:targeted.planId});writeDraft("designed-plan.json",targeted);
      fs.writeFileSync(path.join(contextRoot,childId,"learning_profile.json"),'{"aiContentCatalog":[]}');
      const sibling = new Promise<void>(resolve=>{releaseSibling=resolve;});
      vi.mocked(generateDirectArtifacts).mockImplementation(async input=>{
        const nodeId=input.nodeIds![0]; if(nodeId==="activity-2")await sibling;
        const htmlPath=path.join(games,nodeId+".html");fs.writeFileSync(htmlPath,releaseActivityHtml(nodeId));
        return {artifacts:[{childId,homeworkId,nodeId,title:nodeId,htmlPath,htmlHash:createHash("sha256").update(fs.readFileSync(htmlPath)).digest("hex"),artworkUrl:"/lab.svg",creatorPrompt:"lab",promptHash:"lab",plannerModel:"mock",creatorModel:"mock"}],backgroundUrl:"/lab.svg",questArtworkUrl:"/lab.svg",bossArtworkUrl:"/lab.svg",stats:{generatedNodeIds:[nodeId],reusedNodeIds:[],generatedImages:0,reusedImages:0,bonusDeferred:true}};
      });
      generation=runAdaptiveMathGeneration(childId,homeworkId,rootDir);
      await expect.poll(()=>getLearningCycle(childId,homeworkId,{rootDir})!.nodes.find(n=>n.nodeId==="activity-1")?.artifactBinding?.validationStatus,{timeout:15000}).toBe("passed");
      const planFile=path.join(contextRoot,childId,"plans/active_session_plan.json");
      const published=JSON.parse(fs.readFileSync(planFile,"utf8"));activeSessionPlan=published.current??published;
      step="reveal the map live while sibling prepares";
      await page.getByRole("button",{name:"Check progress",exact:true}).click();
      await page.getByRole("button",{name:"Adventure 1",exact:true}).waitFor({state:"visible"});
      await page.screenshot({path:path.join(outputDir,"first-ready-sibling-preparing.png")});
      step="launch first ready node";if(parentOperated)console.log("PARENT: open Adventure 1, click 10, enter 6 and Submit, then drag the 10-counter group to Total.");else await page.getByRole("button",{name:"Adventure 1",exact:true}).click();
      const targetedFrame=page.frameLocator("iframe").last();
      step="retain the active activity during a background packet failure";
      const activityUrl=await page.locator("iframe").last().getAttribute("src");
      unavailablePacketReads=1;
      setMathGenerationPhase({rootDir,childId,homeworkId,phase:"board_generating"});
      await page.waitForResponse(response=>response.url().includes("/api/child-experience/")&&response.status()===503,{timeout:40000});
      expect(await page.locator("iframe").last().getAttribute("src")).toBe(activityUrl);
      await page.screenshot({path:path.join(outputDir,"activity-survives-refresh-outage.png")});
      step="targeted click fill drag transitions";if(!parentOperated){await targetedFrame.locator("#tap").click();await targetedFrame.locator("#value").fill("6");await targetedFrame.locator("#submit").click();await targetedFrame.locator("#piece").dragTo(targetedFrame.locator("#target"));}
      await expect.poll(()=>getLearningCycle(childId,homeworkId,{rootDir})!.nodes.find(n=>n.nodeId==="activity-1")?.state,{timeout:parentOperated?180000:10000}).toBe("completed");
      expect(getMathGenerationStatus(childId,homeworkId,{rootDir})!.nodes.find(n=>n.nodeId==="activity-2")?.status).toBe("preparing");
      releaseSibling!();await generation;generation=undefined;
      expect(getLearningCycle(childId,homeworkId,{rootDir})!.lifecycle).toBe("baseline_evaluating");
      const decide = async (action:"generate_support"|"generate_quest"|"generate_boss"|"await_calibration") => advanceCanonicalCycleFromEvidence({childId,homeworkId,decide:async current=>({status:action==="await_calibration"?"awaiting_calibration":"revised",reason:"Explicit laboratory Planner decision",progressionAction:action,preserve:[],change:[],testNext:[],nextEvidenceRequired:["graded work"],predictionEvaluationIds:current.predictionEvaluations.map(e=>e.evaluationId),...(action!=="await_calibration"?{nextInstrument:{nodeId:action==="generate_support"?"support-lab":action.replace("generate_",""),title:action==="generate_support"?"Lab Support":action==="generate_quest"?"Quest":"Boss",academicTarget:"multiplication equal groups",mechanic:"mixed controls",theme:"lab",openingPurpose:"Measure fresh performance",creatorPrompt:"Use fresh synthetic items",items:targeted.activities[0].items.map((item:any)=>({...item,id:(action==="generate_support"?"support-lab":action.replace("generate_",""))+":"+item.id}))}}:{})})},{rootDir});
      for (const action of ["generate_support","generate_quest","generate_boss"] as const) {
        step="Planner "+action;await decide(action);
        let nodeId="";
        await generateCanonicalProgressionArtifact({childId,homeworkId,generateHtml:async ({node})=>{nodeId=node.nodeId;return releaseActivityHtml(node.nodeId,node.openingScreen.title,node.nodeId+":");},generateArtwork:async()=>"/lab.svg",validate:async ({html,node})=>{
          const htmlPath=path.join(games,"validate-"+node.nodeId+".html");fs.writeFileSync(htmlPath,html);
          const report=await runDirectBrowserSmokeCheck({rootDir,artifacts:[{childId,homeworkId,nodeId:node.nodeId,title:node.title,htmlPath,artworkUrl:"/lab.svg",creatorPrompt:"lab",promptHash:"lab",plannerModel:"mock",creatorModel:"mock",itemIds:["q1","q2","q3"].map(id=>node.nodeId+":"+id)}]});return {...report,screenshotPaths:report.screenshots};
        }},{rootDir});
        step="play "+nodeId;await page.reload();
        const title=action==="generate_support"?"Lab Support":action==="generate_quest"?"Quest":"Boss";
        if(parentOperated)console.log(`PARENT: open ${title}; click 10, enter 6 and Submit, then drag the counters to Total.`);else await page.getByRole("button",{name:title,exact:true}).click();
        const activityFrame=page.frameLocator("iframe").last();
        if(!parentOperated){await activityFrame.locator("#tap").click();await activityFrame.locator("#value").fill("6");await activityFrame.locator("#submit").click();await activityFrame.locator("#piece").dragTo(activityFrame.locator("#target"));}
        await expect.poll(()=>getLearningCycle(childId,homeworkId,{rootDir})!.nodes.find(n=>n.nodeId===nodeId)?.state,{timeout:parentOperated?180000:10000}).toBe("completed");
      }
      await decide("await_calibration");
      expect(getLearningCycle(childId,homeworkId,{rootDir})!.lifecycle).toBe("awaiting_calibration");
      step="returned work twice";await page.goto(new URL("/parent/returned-work?child=lab-child",vite.resolvedUrls.local[0]).href);
      await page.getByRole("button",{name:/Synthetic graph|Lab|Equal groups/}).first().click();
      await page.locator("#returned-work-file").setInputFiles({name:"marked.pdf",mimeType:"application/pdf",buffer:Buffer.from("synthetic marked work")});
      await page.getByRole("button",{name:"Review marked work",exact:true}).click();
      await Promise.all([page.waitForResponse(r=>r.url().endsWith("/confirm")&&r.status()===200),page.getByRole("button",{name:"Confirm results",exact:true}).click()]);
      await expect.poll(()=>getLearningCycle(childId,homeworkId,{rootDir})!.decisionHistory.some(d=>d.reason==="Observed returned work; assistance unknown")).toBe(true);
      const confirmed=getLearningCycle(childId,homeworkId,{rootDir})!;
      await Promise.all([page.waitForResponse(r=>r.url().endsWith("/confirm")&&r.status()===200),page.getByRole("button",{name:"Confirm results",exact:true}).click()]);
      expect(getLearningCycle(childId,homeworkId,{rootDir})!.observations).toEqual(confirmed.observations);
      expect(getLearningCycle(childId,homeworkId,{rootDir})!.predictionEvaluations).toEqual(confirmed.predictionEvaluations);
      expect(buildLongitudinalLearningHistory(childId,{rootDir}).constructs["math.multiplication.equal_groups"].observations.some(o=>o.provenance==="graded_work"&&o.assistance.status==="unknown")).toBe(true);
      step="next related assignment Planner context";
      const history=buildLongitudinalLearningHistory(childId,{rootDir});
      const direct=await vi.importActual<typeof import("../engine/directMathExperience")>("../engine/directMathExperience");let nextRequest="";
      await direct.askDirectMathPlanner({childId,chart:{...lab.chart(),learningHistory:history} as never,extraction:{filename:"next.pdf",fullText:"Related equal-groups assignment",fileHash:"next",pages:[],warnings:[]} as never,client:{messages:{stream:(request:unknown)=>{nextRequest=JSON.stringify(request);return {finalMessage:async()=>({content:[{type:"tool_use",name:"create_math_learning_program",input:program}]})};}}} as never});
      expect(nextRequest).toContain(confirmed.observations.find(o=>o.provenance==="graded_work")!.observationId);
      const finalCycle=getLearningCycle(childId,homeworkId,{rootDir})!;
      expect(finalCycle.predictionEvaluations.some(e=>e.sufficiency==="sufficient")).toBe(true);
      expect(finalCycle.predictionEvaluations.every(e=>e.observationIds.every(id=>!cycle.observations.some(o=>o.observationId===id)))).toBe(true);
      expect(browserErrors).toEqual([]);
      fs.writeFileSync(path.join(outputDir,"report.json"),JSON.stringify({passed:true,parentOperated,assessmentValidity:"requires_separate_parent_review",providerMode:"mocked",browserErrors,networkEvents,evidence:finalCycle.observations,evaluations:finalCycle.predictionEvaluations},null,2));
    } catch(error) { await page.screenshot({path:path.join(outputDir,"failed-step.png")}); fs.writeFileSync(path.join(outputDir,"report.json"),JSON.stringify({passed:false,step,error:String(error),browserErrors,networkEvents,cycle:getLearningCycle(childId,homeworkId,{rootDir}),generation:getMathGenerationStatus(childId,homeworkId,{rootDir}),body:await page.locator("body").innerText()},null,2)); throw error; } finally {await page.context().tracing.stop({path:path.join(outputDir,"journey.zip")});}
  } finally { releaseSibling?.(); await generation?.catch(error=>console.error("lab generation failed",error)); await browser?.close(); await vite?.close(); ws.clients.forEach(socket=>socket.terminate()); await new Promise<void>(resolve=>ws.close(()=>resolve())); await new Promise<void>(resolve=>server.close(()=>resolve())); vi.unstubAllEnvs(); fs.rmSync(rootDir,{recursive:true,force:true}); }
},parentOperated?1200000:240000);
