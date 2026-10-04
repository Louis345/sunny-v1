import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { expect, it } from "vitest";
import { buildNodeUrlSearchParams } from "../shared/nodeRegistry";

it("carries frozen spelling identities through the real native game bridge without inventing responses", () => {
  const params = buildNodeUrlSearchParams({ id: "wheel", words: ["night"], spellingItemBindings: [{ itemId: "frozen-night", word: "night" }] } as never, { childId: "lab", companion: "elli", previewParam: "go-live" } as never);
  const messages: any[] = [];
  const sandbox: any = { location: { search: `?${params}` }, URLSearchParams, console, Date, Math, document: { title: "Wheel", addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ style: {} }) }, window: { parent: { postMessage: (message: unknown) => messages.push(message) } } };
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), "web/public/games/_contract.js"), "utf8"), sandbox);
  sandbox.window.sendNodeComplete({ completed: true, accuracy: 1, targetResults: [{ target: "night", correct: true }] });
  const result = messages.find(row => row.type === "node_complete");
  expect(result.targetResults).toEqual([{ target: "frozen-night", correct: true }]);
  expect(result.targetResults[0].attemptedValue).toBeUndefined();
  sandbox.window.fireAttemptEvent({ target: "night", attemptedValue: "nite", correct: false });
  expect(messages.at(-1).payload).toMatchObject({ target: "frozen-night", attemptedValue: "nite" });
  sandbox.window.sendNodeComplete({ completed: true, targetResults: [{ target: "invented", attemptedValue: "night" }] });
  expect(messages.at(-1).targetResults[0].target).toBe("invented"); // Server must reject, never guess.
});

it("announces a native spelling item before its answer with frozen identity and launch correlation", () => {
  const messages: any[] = [];
  const sandbox: any = { location: { search: '?nodeId=native&launchToken=launch-one&spellingItemBindings='+encodeURIComponent(JSON.stringify([{itemId:'frozen-night',word:'night'}])) }, URLSearchParams, console, Date, Math, document: { title:'Letter Rush',addEventListener(){} }, window: { parent:{postMessage:(m:unknown)=>messages.push(m)} } };
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(),'web/public/games/_contract.js'),'utf8'),sandbox);
  sandbox.window.GameBridge.reportState('word opened',{spellingItemOpened:true,currentWord:'night',phase:'flash',answerVisibility:'visible'});
  expect(messages.at(-1).payload).toMatchObject({itemId:'frozen-night',nodeId:'native',launchToken:'launch-one',practiceCapture:true,phase:'flash'});
  expect(messages).toHaveLength(1);
  sandbox.window.fireAttemptEvent({target:'night',attemptedValue:'nite'});
  expect(messages.at(-1).payload).toMatchObject({target:'frozen-night',launchToken:'launch-one',attemptedValue:'nite'});
  sandbox.window.GameBridge.reportState('unknown word',{spellingItemOpened:true,currentWord:'other',phase:'flash'});
  expect(messages.at(-1).payload.practiceCapture).not.toBe(true);
});

it.each(['read-and-race','type-and-spell','hear-and-spell','mastery-run','trap-the-imposter'])('opens the actual Letter Rush %s item before narration or response', mode => {
  const html=fs.readFileSync(path.join(process.cwd(),'web/public/games/letter-rush.html'),'utf8');
  const begin=html.slice(html.indexOf('      function beginWord() {'),html.indexOf('      function startWordPlay() {'));
  const calls:any[]=[];
  const sandbox:any={config:{mode,words:[{text:'night'}],scaffolds:{}},state:{index:0},isTrapMode:()=>mode==='trap-the-imposter',buildTrapRound:()=>({}),normalizeWord:(s:string)=>s,
    byId:()=>({innerHTML:'',value:'',textContent:'',classList:{remove(){}}}),visiblePromptForWord:()=>'',resetMasteryTimerDisplay(){},resetTrapTimerDisplay(){},renderTiles(){},updateHud(){},flashWord(){},
    report:(progress:string,extras:any)=>calls.push({progress,...extras}),requestNarration:()=>{calls.push({narration:true});return 650;},flashCompanion(){},modeDef:()=>({intro:''}),fireCompanion(){},companionVisibleWord:()=>'',roundCount:()=>1,setTimeout:()=>1,startWordPlay(){}};
  vm.runInNewContext(begin+'\nbeginWord();',sandbox);
  const openings=calls.filter(c=>c.spellingItemOpened);
  if (mode === 'trap-the-imposter') { expect(openings).toHaveLength(0); return; } // Trap choices are not whole-word spelling answers.
  expect(openings).toHaveLength(1);
  expect(openings[0]).toMatchObject({currentWord:'night',phase:'presentation',answerVisibility:mode==='read-and-race'?'visible':'unknown'});
  expect(calls[0]).toBe(openings[0]);
});

it('records explainer exposure only when a word chunk actually becomes visible',()=>{
 const html=fs.readFileSync(path.join(process.cwd(),'web/public/games/spelling-visual-explainer.html'),'utf8');
 const source=html.slice(html.indexOf('      function renderScene('),html.indexOf('      function checkEvidence('));
 const calls:any[]=[];const toggle={toggle(){}};
 const sandbox:any={modelNodes:[{word:{text:'night'},chunkNodes:[{classList:toggle,dataset:{}}],tip:{classList:toggle}},{word:{text:'light'},chunkNodes:[{classList:toggle,dataset:{}}],tip:{classList:toggle}}],el:{finishButton:{}},window:{GameBridge:{reportState:(label:string,payload:any)=>calls.push(payload)}}};
 vm.runInNewContext(source+'\nrenderScene({progress:0});',sandbox);expect(calls).toHaveLength(0);
 vm.runInNewContext('renderScene({progress:8});renderScene({progress:8});',sandbox);
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({spellingItemOpened:true,currentWord:'night',answerVisibility:'visible'});
 vm.runInNewContext('renderScene({progress:12});',sandbox);expect(calls.map(c=>c.currentWord)).toEqual(['night','light']);
});

it('preserves the explainer chunk choice as non-spelling evidence at its source',()=>{
 const source=fs.readFileSync(path.join(process.cwd(),'web/public/generated/openai-visual-probe/artifact-shell.js'),'utf8');
 const fn=source.slice(source.indexOf('    function recordPrediction('),source.indexOf('    function completeActivity('));const calls:any[]=[];
 const sandbox:any={state:{},artifactConfig:{spellingModel:{},concept:'chunk'},currentQuestion:()=>({id:'q',targetConcept:'chunk',options:[{id:'choice',label:'ight'}],correctOptionId:'choice'}),Date,sessionStartedAt:Date.now(),emitEvidence(){},reportState(){},reportCompanionAnchor(){},updatePredictionPanel(){},window:{fireAttemptEvent:(p:any)=>calls.push(p)}};
 vm.runInNewContext(fn+"\nrecordPrediction('choice');",sandbox);
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({domain:'spelling',evidenceLimitation:'non_spelling_response',rawChoice:'ight',aggregateAccuracy:null});
 expect(calls[0].attemptedValue).toBeUndefined();
});
it('reports trap selection success as a limitation instead of a fabricated word response',()=>{
 const html=fs.readFileSync(path.join(process.cwd(),'web/public/games/letter-rush.html'),'utf8');
 const fn=html.slice(html.indexOf('      function emitTargetResult('),html.indexOf('      function startingLivesForSession('));const calls:any[]=[];
 const sandbox:any={params:{nodeId:'n'},config:{mode:'trap-the-imposter'},state:{typed:[],wordStartedAt:Date.now(),targetResults:[]},normalizeWord:(v:string)=>v,Date,scaffoldLevelForMode:()=>1,canWriteMasteryEvidence:()=>false,postActivityEvent(){},isTrapMode:()=>true,fireCompanion(){},window:{fireAttemptEvent:(p:any)=>calls.push(p)}};
 vm.runInNewContext(fn+"\nemitTargetResult({id:'i',text:'night'},true,'',null);",sandbox);
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({evidenceLimitation:'per_word_results_unavailable',rawChoice:null,aggregateAccuracy:1});
 expect(calls[0].attemptedValue).toBeUndefined();
});
