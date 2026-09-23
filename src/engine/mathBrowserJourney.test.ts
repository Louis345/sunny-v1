import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { verifyDiscoveryRuntimeScoring } from "./adaptiveMathDiscovery";
import { runDirectBrowserSmokeCheck } from "./directMathExperience";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
async function verify(body: string, itemIds?: string[], itemContracts?: unknown[]) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-browser-journey-")); roots.push(rootDir);
  const htmlPath = path.join(rootDir, "node.html");
  fs.writeFileSync(htmlPath, `<!doctype html><h1>Lab</h1>${body}`);
  return runDirectBrowserSmokeCheck({
    rootDir,
    artifacts: [{ nodeId: "node", childId: "lab", homeworkId: "hw-lab", title: "Lab", htmlPath, artworkUrl: "/art.svg", creatorPrompt: "fixture", promptHash: "fixture", plannerModel: "mock", creatorModel: "mock", ...(itemIds ? { itemIds } : {}) }],
    ...(itemContracts ? { itemContractsByNodeId: { node: itemContracts as never } } : {}),
  });
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
  expect(result.screenshots).toHaveLength(4);
  expect(result.screenshots.filter(file => file.includes("item-01-one"))).toHaveLength(2);
  expect(result.screenshots.filter(file => file.includes("completion"))).toHaveLength(2);
}, 20000);

it("captures every question before answering so blind review cannot see completion only", async () => {
  const result = await verify(`<h2 id="prompt">First prompt</h2><button id="answer">Answer</button>
    <script>
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'#answer'}]}
    ]};
    let item='one';
    const report=()=>parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:item,prompt:document.querySelector('#prompt').textContent}}},'*');
    report();
    document.querySelector('#answer').onclick=()=>{
      parent.postMessage({type:'attempt_event',payload:{domain:'math',target:item,attemptedValue:'4',correct:true}},'*');
      if(item==='one'){
        item='two';document.querySelector('#prompt').textContent='Second prompt';report();
      }else{
        parent.postMessage({type:'node_complete',payload:{nodeId:'node',targetResults:[{target:'one',attemptedValue:'4',correct:true},{target:'two',attemptedValue:'4',correct:true}]}},'*');
      }
    };
    </script>`);

  expect(result.passed).toBe(true);
  expect(result.screenshots).toHaveLength(6);
  expect(result.screenshots.filter(file => file.includes("item-01-one"))).toHaveLength(2);
  expect(result.screenshots.filter(file => file.includes("item-02-two"))).toHaveLength(2);
  expect(result.screenshots.filter(file => file.includes("completion"))).toHaveLength(2);
}, 20000);

it("captures an evidence-free opening separately before the first academic item", async () => {
  const result = await verify(`<section id="opening"><h2>Opening the market</h2><button id="begin">Begin</button></section>
    <section id="question" hidden><h2>How many apples are in three baskets of four?</h2><button id="answer">12</button></section>
    <script>
    window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#begin'},{action:'click',selector:'#answer'}]}]};
    document.querySelector('#begin').onclick=()=>{
      document.querySelector('#opening').hidden=true;
      document.querySelector('#question').hidden=false;
      parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:'one',prompt:'How many apples are in three baskets of four?'}}},'*');
    };
    document.querySelector('#answer').onclick=()=>{
      parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'one',attemptedValue:'12',correct:true}},'*');
      parent.postMessage({type:'node_complete',payload:{nodeId:'node',targetResults:[{target:'one',attemptedValue:'12',correct:true}]}},'*');
    };
    </script>`, ["one"]);

  expect(result.failures).toEqual([]);
  expect(result.screenshots.filter(file => file.includes("-intro"))).toHaveLength(2);
  expect(result.screenshots.filter(file => file.includes("item-01-one"))).toHaveLength(2);
}, 20000);

it("rejects a targeted activity whose evidence claims a frozen wrong answer is correct", async () => {
  const item = {
    id: "one",
    prompt: "Which value is four?",
    lineage: { sourceEvidenceIds: ["assignment:one"], exposure: "unseen", measurementRole: "fresh_checkpoint" },
    response: { mode: "selection", options: [{ id: "four", label: "4", correct: true }, { id: "five", label: "5", correct: false }] },
  };
  const result = await verify(`${journey}<button id="answer" onclick="parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'one',attemptedValue:'five',correct:true}},'*');parent.postMessage({type:'node_complete',payload:{nodeId:'node',targetResults:[{target:'one',attemptedValue:'five',correct:true}]}},'*')">Five</button><script>parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:'one',prompt:'Which value is four?',measurementRole:'fresh_checkpoint',readAloudRequested:false,readAloudCount:0}}},'*');</script>`, ["one"], [item]);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_scoring_mismatch;item=one");
}, 20000);

it("rejects instruction screens that omit Elli's one guided introduction", async () => {
  const item = {
    id: "one",
    prompt: "Choose four.",
    lineage: { sourceEvidenceIds: ["assignment:one"], exposure: "taught", measurementRole: "instruction" },
    response: { mode: "selection", options: [{ id: "four", label: "4", correct: true }] },
  };
  const result = await verify(`<h2>Choose four.</h2><button id="answer" onclick="parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'one',attemptedValue:'four',correct:true}},'*');parent.postMessage({type:'node_complete',payload:{nodeId:'node',accuracy:1,targetResults:[{target:'one',attemptedValue:'four',correct:true}]}},'*')">Four</button>
    <script>window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#answer'}]}]};parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:'one',prompt:'Choose four.',measurementRole:'instruction',readAloudRequested:false,readAloudCount:0}}},'*');</script>`, ["one"], [item]);
  expect(result.failures.join("|")).toContain("math_journey_guided_companion_missing;item=one");
}, 20000);

it("accepts guided teaching but rejects automatic help on a fresh checkpoint", async () => {
  const contract = (measurementRole: "instruction" | "fresh_checkpoint") => ({
    id: "one",
    prompt: "Choose four.",
    lineage: { sourceEvidenceIds: ["assignment:one"], exposure: measurementRole === "instruction" ? "taught" : "unseen", measurementRole },
    response: { mode: "selection", options: [{ id: "four", label: "4", correct: true }] },
  });
  const activity = (measurementRole: string, trigger: string) => `<h2>Choose four.</h2><button id="answer" onclick="parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'one',attemptedValue:'four',correct:true}},'*');parent.postMessage({type:'node_complete',payload:{nodeId:'node',accuracy:1,targetResults:[{target:'one',attemptedValue:'four',correct:true}]}},'*')">Four</button>
    <script>window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#answer'}]}]};parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:'one',prompt:'Choose four.',measurementRole:'${measurementRole}',readAloudRequested:true,readAloudCount:1,companionSupportTrigger:'${trigger}'}}},'*');</script>`;
  await expect(verify(activity("instruction", "guided_prompt"), ["one"], [contract("instruction")])).resolves.toMatchObject({ passed: true });
  const checkpoint = await verify(activity("fresh_checkpoint", "guided_prompt"), ["one"], [contract("fresh_checkpoint")]);
  expect(checkpoint.failures.join("|")).toContain("math_journey_checkpoint_auto_support;item=one");
}, 30000);


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
  expect(result.screenshots).toHaveLength(6);
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

it("waits for the next item identity before reusing persistent controls", async () => {
  const result = await verify(`<p id="prompt">First prompt</p><button id="answer">Commit answer</button>
    <script>
    const rows=[];let active='one',prompt='First prompt';
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'#answer'}]}
    ]};
    const report=()=>parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:active,prompt}}},'*');
    document.querySelector('#answer').onclick=()=>{
      const item=active;
      rows.push({target:item,attemptedValue:item});
      parent.postMessage({type:'attempt_event',payload:{target:item,attemptedValue:item}},'*');
      if(item==='one')setTimeout(()=>{active='two';prompt='Second prompt';document.querySelector('#prompt').textContent=prompt;report()},180);
      else parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');
    };
    report();
    </script>`);
  expect(result.failures).toEqual([]);
},20000);

it("rejects a next-item state announcement while the prior stimulus is still visible", async () => {
  const result = await verify(`<p id="prompt">First prompt</p><button id="answer">Commit answer</button>
    <script>
    const rows=[];let active='one';
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'#answer'}]}
    ]};
    const report=(id,prompt)=>parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id,prompt}}},'*');
    document.querySelector('#answer').onclick=()=>{
      const item=active;
      rows.push({target:item,attemptedValue:item});
      parent.postMessage({type:'attempt_event',payload:{target:item,attemptedValue:item}},'*');
      if(item==='one'){
        active='two';report('two','Second prompt');
        setTimeout(()=>{document.querySelector('#prompt').textContent='Second prompt'},5000);
      } else parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');
    };
    report('one','First prompt');
    </script>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_item_state_not_visible;item=two");
},20000);

it("rejects state announced before a shortly delayed prompt render", async () => {
  const result = await verify(`<p id="prompt">First prompt</p><button id="answer">Commit answer</button>
    <script>
    const rows=[];let active='one';
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'#answer'}]}
    ]};
    const report=(id,prompt)=>parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id,prompt}}},'*');
    document.querySelector('#answer').onclick=()=>{
      const item=active;rows.push({target:item,attemptedValue:item});parent.postMessage({type:'attempt_event',payload:{target:item,attemptedValue:item}},'*');
      if(item==='one'){active='two';report('two','Second prompt');setTimeout(()=>{document.querySelector('#prompt').textContent='Second prompt'},180);}
      else parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');
    };
    report('one','First prompt');
    </script>`, ["one", "two"]);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_item_state_not_visible;item=two");
},20000);

it("does not accept the next prompt when it exists only outside the viewport", async () => {
  const result = await verify(`<p id="prompt">First prompt</p><p style="position:absolute;left:-10000px">Second prompt</p><button id="answer">Commit answer</button>
    <script>
    const rows=[];let active='one';
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'#answer'}]}
    ]};
    const report=(id,prompt)=>parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id,prompt}}},'*');
    document.querySelector('#answer').onclick=()=>{
      const item=active;
      rows.push({target:item,attemptedValue:item});
      parent.postMessage({type:'attempt_event',payload:{target:item,attemptedValue:item}},'*');
      if(item==='one'){active='two';report('two','Second prompt');}
      else parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');
    };
    report('one','First prompt');
    </script>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_item_state_not_visible;item=two");
},20000);

it("rejects reused controls when the activity omits item-state transitions", async () => {
  const result = await verify(`<p>First prompt</p><button id="answer">Commit answer</button>
    <script>
    const rows=[];let active='one';
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'#answer'}]}
    ]};
    document.querySelector('#answer').onclick=()=>{
      const item=active;
      rows.push({target:item,attemptedValue:item});
      parent.postMessage({type:'attempt_event',payload:{target:item,attemptedValue:item}},'*');
      if(item==='one')active='two';
      else parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');
    };
    </script>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_item_state_missing;item=two");
},20000);

it("recognizes selector aliases that resolve to the same persistent control", async () => {
  const result = await verify(`<p>First prompt</p><button id="answer">Commit answer</button>
    <script>
    const rows=[];let active='one';
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#answer'}]},
      {itemId:'two',steps:[{action:'click',selector:'button#answer'}]}
    ]};
    document.querySelector('#answer').onclick=()=>{
      const item=active;
      rows.push({target:item,attemptedValue:item});
      parent.postMessage({type:'attempt_event',payload:{target:item,attemptedValue:item}},'*');
      if(item==='one')active='two';
      else parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');
    };
    </script>`);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_item_state_missing;item=two");
},20000);

it("requires item-state transitions for a current frozen journey even when controls differ", async () => {
  const result = await verify(`<p>First prompt</p><button id="one">First</button><button id="two">Second</button>
    <script>
    const rows=[];
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#one'}]},
      {itemId:'two',steps:[{action:'click',selector:'#two'}]}
    ]};
    document.querySelector('#one').onclick=()=>{rows.push({target:'one',attemptedValue:'one'});parent.postMessage({type:'attempt_event',payload:rows.at(-1)},'*');};
    document.querySelector('#two').onclick=()=>{rows.push({target:'two',attemptedValue:'two'});parent.postMessage({type:'attempt_event',payload:rows.at(-1)},'*');parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');};
    </script>`, ["one", "two"]);
  expect(result.passed).toBe(false);
  expect(result.failures.join("|")).toContain("math_journey_item_state_missing;item=two");
},20000);

it("waits for a frozen journey's first item-state event after the transition", async () => {
  const result = await verify(`<p id="prompt">First prompt</p><button id="one">First</button><button id="two" hidden>Second</button>
    <script>
    const rows=[];
    window.SUNNY_VALIDATION_HOOKS={journey:[
      {itemId:'one',steps:[{action:'click',selector:'#one'}]},
      {itemId:'two',steps:[{action:'click',selector:'#two'}]}
    ]};
    document.querySelector('#one').onclick=()=>{
      rows.push({target:'one',attemptedValue:'one'});parent.postMessage({type:'attempt_event',payload:rows.at(-1)},'*');
      setTimeout(()=>{document.querySelector('#prompt').textContent='Second prompt';document.querySelector('#one').hidden=true;document.querySelector('#two').hidden=false;parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:'two',prompt:'Second prompt'}}},'*');},180);
    };
    document.querySelector('#two').onclick=()=>{rows.push({target:'two',attemptedValue:'two'});parent.postMessage({type:'attempt_event',payload:rows.at(-1)},'*');parent.postMessage({type:'node_complete',payload:{targetResults:rows}},'*');};
    </script>`, ["one", "two"]);
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
  expect(result.screenshots).toHaveLength(4);
  expect(result.screenshots.every(file=>fs.existsSync(file))).toBe(true);
},20000);
