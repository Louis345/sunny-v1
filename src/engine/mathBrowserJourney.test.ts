import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { verifyDiscoveryRuntimeScoring } from "./adaptiveMathDiscovery";
import { runDirectBrowserSmokeCheck } from "./directMathExperience";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
async function verify(body: string) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-browser-journey-")); roots.push(rootDir);
  const htmlPath = path.join(rootDir, "node.html");
  fs.writeFileSync(htmlPath, `<!doctype html><h1>Lab</h1>${body}`);
  return runDirectBrowserSmokeCheck({ rootDir, artifacts: [{ nodeId: "node", childId: "lab", homeworkId: "hw-lab", title: "Lab", htmlPath, artworkUrl: "/art.svg", creatorPrompt: "fixture", promptHash: "fixture", plannerModel: "mock", creatorModel: "mock" }] });
}
const journey = `<script>window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#answer'}]}]};</script>`;
it("accepts the teaching attempt protocol before a later completion", async () => {
  const result = await verify(`<button id="answer">Four</button><button id="next" hidden>Finish</button>
    <script>window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#answer'},{action:'click',selector:'#next'}]}]};
    document.querySelector('#answer').onclick=()=>{parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'one',attemptedValue:'4',correct:true,responseTimeMs:100,scaffoldLevel:0}},'*');document.querySelector('#next').hidden=false;};
    document.querySelector('#next').onclick=()=>parent.postMessage({type:'node_complete',payload:{nodeId:'node',targetResults:[{target:'one',attemptedValue:'4',correct:true}]}},'*');</script>`);
  expect(result.failures).toEqual([]);
}, 20000);

it("still rejects a teaching item that emits no committed response", async () => {
  const result = await verify(`${journey}<button id="answer">No response</button>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_item_commit_missing");
}, 20000);

it("does not accept a Discovery event in place of a teaching answer", async () => {
  const result = await verify(`${journey}<button id="answer" onclick="parent.postMessage({type:'evaluation_attempt',payload:{itemId:'one',attemptedValue:'4'}},'*')">Wrong protocol</button>`);
  expect(result.failures.join("|")).toContain("math_journey_item_commit_missing");
}, 20000);
it("requires an actual control journey, even when a generated hook claims completion", async () => {
  const result = await verify(`<button>Answer</button><script>window.SUNNY_VALIDATION_HOOKS={playthrough:async()=>parent.postMessage({type:'node_complete'},'*')};</script>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("journey_missing");
}, 20000);
it("detects a later-screen trap through real clicks", async () => {
  const result = await verify(`${journey}<button id="answer" onclick="throw new Error('later_screen_failure')">Answer</button>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toMatch(/later_screen_failure|completion_missing/);
}, 20000);
it("verifies actual completion at both release sizes", async () => {
  const result = await verify(`${journey}<button id="answer" onclick="parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'one',attemptedValue:'4',correct:true}},'*');parent.postMessage({type:'node_complete',payload:{nodeId:'node',targetResults:[{target:'one',attemptedValue:'4',correct:true}]}},'*')">Answer</button>`);
  expect(result.passed).toBe(true);
  expect(result.screenshots).toHaveLength(2);
}, 20000);


it("does not approve Discovery when the scorer works but the child cannot finish", async () => {
  const academic = {items: [{itemId: "one", constructId: "math.count", correctAnswerContract: {acceptedValues: ["4"]}}]} as never;
  const html = `<!doctype html><button id="answer">Answer</button>
  <script id="sunny-discovery-contract" type="application/json">{"items":[{"itemId":"one","constructId":"math.count","acceptedValues":["4"]}]}</script>
  <script>window.__SUNNY_DISCOVERY_TEST__={evaluate:(itemId,value)=>({itemId,constructId:'math.count',correct:value==='4'})};
  // evaluation_ready evaluation_attempt evaluation_complete
  </script>${journey}`;
  await expect(verifyDiscoveryRuntimeScoring({html,academic,outputDir:os.tmpdir()})).rejects.toThrow(/math_journey_item_commit_missing/);
}, 20000);

it("rejects completion sent before decorative controls are exercised", async () => {
  const result = await verify(`${journey}<button id="answer">Decorative answer</button><script>parent.postMessage({type:'node_complete',payload:{nodeId:'node',targetResults:[{target:'one',attemptedValue:'4'}]}},'*');</script>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("premature_evidence");
},20000);

it("recognizes native draggable controls through the response-mode transitions", async () => {
  const {releaseActivityHtml}=await import("../scripts/fixtures/adaptiveMathRelease");
  const result=await verify(releaseActivityHtml("node"));
  expect(result.failures).toEqual([]);
});


it("closes the verifier server when diagnostic setup fails", async () => {
  const handles=()=> (process as NodeJS.Process & {_getActiveHandles:()=>unknown[]})._getActiveHandles();const before=new Set(handles());
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-verifier-cleanup-"));roots.push(rootDir);fs.mkdirSync(path.join(rootDir,"outputs"));fs.writeFileSync(path.join(rootDir,"outputs/math-browser-verification"),"not a directory");
  try {await expect(runDirectBrowserSmokeCheck({rootDir,artifacts:[]})).rejects.toThrow();expect(handles().filter(handle=>handle instanceof http.Server&&!before.has(handle)&&handle.listening)).toHaveLength(0);}
  finally {await Promise.all(handles().filter((handle):handle is http.Server=>handle instanceof http.Server&&!before.has(handle)&&handle.listening).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));}
});


it("reports the hidden overlay that CSS accidentally displays", async () => {
  const {withDiscoveryBrowserPage, assertMathControlsVisible} = await import("./discoveryVisualReview");
  await expect(withDiscoveryBrowserPage(`<style>#pause-overlay{display:flex;position:fixed;inset:0}</style><button>Answer</button><div id="pause-overlay" hidden><button>Resume</button></div>`, page => assertMathControlsVisible(page)))
    .rejects.toThrow(/hidden.*pause-overlay/);
});

it("reports all visible repairable defects together at both viewports", async () => {
  const result = await verify(`<style>#explain-area{display:block}#dot-tuesday{animation:pulse 2s infinite}@keyframes pulse{to{transform:scale(1.1)}}</style>
    <div id="explain-area" hidden>Hidden explanation</div>
    <svg width="100" height="100"><circle id="dot-tuesday" cx="40" cy="40" r="15" /></svg>
    <button id="submit">Submit</button>
    <script>window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'record-modeled',steps:[{action:'click',selector:'#dot-tuesday'},{action:'click',selector:'#submit'}]}]};</script>`);
  expect(result.passed).toBe(false);
  expect(result.failures).toHaveLength(2);
  for (const failure of result.failures) {
    expect(failure).toContain("math_hidden_state_visible:#explain-area");
    expect(failure).toContain("item=record-modeled");
    expect(failure).toContain("selector=#dot-tuesday");
    expect(failure).toContain("semantic_action_marker,accessible_name");
    expect(failure).toContain("interaction_stability");
  }
  expect(result.screenshots).toHaveLength(2);
}, 20000);

it("accepts the flat evidence messages supported by Sunny's actual host", async () => {
  const {withDiscoveryBrowserPage, verifyMathControlJourney} = await import("./discoveryVisualReview");
  await expect(withDiscoveryBrowserPage(`${journey}<button id="answer" onclick="parent.postMessage({type:'evaluation_attempt',attemptId:'attempt-one',observedAt:new Date().toISOString(),supportEventIds:[],instrumentSignals:[],itemId:'one',attemptedValue:'4'},'*');parent.postMessage({type:'evaluation_complete'},'*')">Answer</button>`, page => verifyMathControlJourney(page,{completionType:"evaluation_complete",itemIds:["one"]}))).resolves.toBeUndefined();
});


it("rejects answer messages the persistence endpoint cannot accept", async () => {
  const {withDiscoveryBrowserPage, verifyMathControlJourney}=await import("./discoveryVisualReview");
  await expect(withDiscoveryBrowserPage(`${journey}<button id="answer" onclick="parent.postMessage({type:'evaluation_attempt',payload:{itemId:'one',attemptedValue:'4'}},'*');parent.postMessage({type:'evaluation_complete'},'*')">Answer</button>`,page=>verifyMathControlJourney(page,{completionType:"evaluation_complete",itemIds:["one"]}))).rejects.toThrow("math_journey_attempt_contract");
});

function stagedGraph(activateSemantics: boolean, transitionMs = 0) {
  return `<button id="first">First answer</button><svg width="140" height="100"><circle id="later-dot" cx="50" cy="50" r="15" /></svg>
  <script>
  window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#first'}]},{itemId:'two',steps:[{action:'click',selector:'#later-dot'}]}]};
  const rows=[];const commit=(target)=>{rows.push({target,attemptedValue:'4'});parent.postMessage({type:'attempt_event',payload:{target,attemptedValue:'4'}},'*');};
  document.querySelector('#first').onclick=()=>{commit('one');document.querySelector('#first').hidden=true;setTimeout(()=>{const dot=document.querySelector('#later-dot');
  ${activateSemantics ? "dot.setAttribute('role','button');dot.setAttribute('aria-label','Second answer');" : ""}
  dot.onclick=()=>{commit('two');parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');};},${transitionMs});};
  </script>`;
}

it("checks a persistent graph point when its question activates, not while it is scenery", async () => {
  const result=await verify(stagedGraph(true));
  expect(result.failures).toEqual([]);
  expect(result.screenshots).toHaveLength(2);
},20000);

it("still rejects that same point if it lacks semantics when its question activates", async () => {
  const result=await verify(stagedGraph(false));
  expect(result.passed).toBe(false);
  for(const failure of result.failures){expect(failure).toContain('item=two');expect(failure).toContain('selector=#later-dot');expect(failure).toContain('semantic_action_marker');expect(failure).toContain(';visible=true');}
},20000);

it("waits for an existing graph point to become actionable after the prior answer transition", async () => {
  const result=await verify(stagedGraph(true,650));
  expect(result.failures).toEqual([]);
},20000);

it("identifies a later hidden-state defect and leaves unreached items explicitly unverified", async () => {
  const result=await verify(`<style>#numeric-panel{display:flex}</style>
    <div id="numeric-panel"><button id="first">First answer</button></div>
    <textarea id="explanation" aria-label="Explain" hidden></textarea><button id="last" hidden>Last answer</button>
    <script>
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#first'}]},
      {itemId:'two',steps:[{action:'fill',selector:'#explanation',value:'because'}]},
      {itemId:'three',steps:[{action:'click',selector:'#last'}]}]};
    document.querySelector('#first').onclick=()=>{
      parent.postMessage({type:'attempt_event',payload:{target:'one',attemptedValue:'4'}},'*');
      document.querySelector('#numeric-panel').hidden=true;
      document.querySelector('#first').disabled=true;
      document.querySelector('#explanation').hidden=false;
    };
    </script>`);
  expect(result.passed).toBe(false);
  expect(result.failures).toHaveLength(2);
  for(const failure of result.failures){
    expect(failure).toContain('math_hidden_state_visible:#numeric-panel');
    const state=JSON.parse(failure.split('math_repair_state:')[1]!);
    expect(state.itemId).toBe('two');
    expect(state.notYetVerifiedItemIds).toEqual(['two','three']);
    expect(state.hidden).toEqual([expect.objectContaining({selector:'#numeric-panel',tag:'div',hiddenAttribute:'',computedDisplay:'flex',rect:expect.objectContaining({width:expect.any(Number),height:expect.any(Number)})})]);
  }
  expect(result.screenshots).toHaveLength(2);
  expect(result.screenshots.every(file=>fs.existsSync(file))).toBe(true);
},20000);
