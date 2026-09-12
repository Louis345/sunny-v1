import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, expect, it, vi} from "vitest";

const transport=vi.hoisted(()=>vi.fn());
vi.mock("@anthropic-ai/sdk",()=>({default:class {messages={stream:(request:unknown)=>({finalMessage:()=>transport(request)})};}}));
import {ingestMathAssignment} from "./ingestMathDirect";
import {getLearningCycle} from "../engine/learningCycleRepository";

const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true}));});

it("runs the actual intake, resumes a saved paid response, repairs the browser journey, and reuses publication",async()=>{
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-intake-acceptance-"));roots.push(rootDir);
  vi.stubEnv("ANTHROPIC_API_KEY","synthetic-provider-only");
  vi.stubEnv("OPENAI_API_KEY","synthetic-provider-only");
  const context=path.join(rootDir,"src/context/lab-child");fs.mkdirSync(context,{recursive:true});
  fs.writeFileSync(path.join(context,"learning_profile.json"),JSON.stringify({childId:"lab-child"}));
  const pdf=path.join(rootDir,"assignment.txt");fs.writeFileSync(pdf,"How many equal groups? Read the diagram.");
  const academic={evaluationId:"synthetic-discovery",title:"Count groups",assignmentEvidenceIds:["synthetic-source"],constructs:[{constructId:"math.groups",prerequisiteIds:[]}],items:[{itemId:"one",constructId:"math.groups",prompt:"How many groups?",responseContract:{mode:"tap_selection",representationId:"groups"},correctAnswerContract:{acceptedValues:["4"]},difficultyBoundary:"four groups",exposureId:"synthetic:one",possibleConfounds:[],falsifyingEvidence:["cannot count groups"],measurementKeys:["independent_correct"]}]};
  const html=`<!doctype html><html><body><style>[hidden]{display:none!important}</style><button id="answer">Four</button><div id="pause-overlay" hidden><button>Resume</button></div>
  <script id="sunny-discovery-contract" type="application/json">{"items":[{"itemId":"one","constructId":"math.groups","acceptedValues":["4"]}]}</script>
  <script>window.__SUNNY_DISCOVERY_TEST__={evaluate:(itemId,value)=>({itemId,constructId:'math.groups',correct:value==='4'})};
  window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#answer'}]}]};
  parent.postMessage({type:'evaluation_ready'},'*');document.querySelector('#answer').onclick=()=>{parent.postMessage({type:'evaluation_attempt',attemptId:'synthetic-one',itemId:'one',attemptedValue:'4',supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()},'*');parent.postMessage({type:'evaluation_complete'},'*');};</script></body></html>`;
  transport.mockReset().mockImplementation(async(request:{tools?:Array<{name:string}>;messages:Array<{content:string|unknown[]}>})=>{
    const name=request.tools?.[0]?.name;
    if(name==="create_math_discovery_contract")return {content:[{type:"tool_use",name,input:academic}]};
    if(name==="create_math_discovery_design")return {content:[{type:"tool_use",name,input:{contractHash:String(request.messages[0].content).match(/CONTRACT HASH: ([a-f0-9]+)/)?.[1],design:{firstAction:"Count groups"},backgroundSvg:"<svg/>"}}]};
    return {content:[{type:"text",text:html.replace("[hidden]{display:none!important}","#pause-overlay{display:flex;position:fixed;inset:0}")}]};
  });
  const patch=JSON.stringify({replacements:[{oldText:"#pause-overlay{display:flex;position:fixed;inset:0}",newText:"[hidden]{display:none!important}",reason:"Keep the hidden pause overlay from obscuring the answer control."}]});
  const fetchMock=vi.fn(async()=>new Response(`data: ${JSON.stringify({type:"response.output_text.delta",delta:patch})}\n\ndata: ${JSON.stringify({type:"response.completed",response:{status:"completed",usage:{input_tokens:10,output_tokens:10}}})}\n\ndata: [DONE]\n\n`,{status:200,headers:{"content-type":"text/event-stream"}}));
  vi.stubGlobal("fetch",fetchMock);
  const rename=fs.renameSync.bind(fs);let interrupted=false;
  const failure=vi.spyOn(fs,"renameSync").mockImplementation((from,to)=>{
    if(!interrupted && String(to).endsWith("discovery-builder.json")){interrupted=true;throw new Error("synthetic_checkpoint_interruption");}return rename(from,to);
  });
  await expect(ingestMathAssignment({rootDir,childId:"lab-child",pdf})).rejects.toThrow("synthetic_checkpoint_interruption");failure.mockRestore();
  expect(transport).toHaveBeenCalledTimes(3);
  await ingestMathAssignment({rootDir,childId:"lab-child",pdf});
  expect(transport).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const drafts=path.join(context,"homework/direct-drafts");
  const homeworkId=fs.readdirSync(drafts).find(name=>name.startsWith("hw-math-"))!;
  const draft=path.join(drafts,homeworkId);
  const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(draft,name),"utf8"));
  expect(read("visual-review/visual-review.json").iterations).toHaveLength(2);
  expect(read("runtime-verification/acceptance.json")).toMatchObject({passed:true,htmlHash:read("discovery-contract.json").artifact.artifactHash,completedItemIds:["one"]});
  expect(read("discovery-ingestion-job.json").state).toBe("ready");
  const before=JSON.stringify(getLearningCycle("lab-child",homeworkId,{rootDir}));
  await ingestMathAssignment({rootDir,childId:"lab-child",pdf});
  expect(transport).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(getLearningCycle("lab-child",homeworkId,{rootDir}))).toBe(before);
},60000);


it("refuses empty captured assignment evidence before paying a Planner",async()=>{
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"sunny-intake-empty-"));roots.push(rootDir);
  vi.stubEnv("ANTHROPIC_API_KEY","synthetic-provider-only");
  vi.stubEnv("OPENAI_API_KEY","synthetic-provider-only");
  const context=path.join(rootDir,"src/context/lab-child");fs.mkdirSync(context,{recursive:true});fs.writeFileSync(path.join(context,"learning_profile.json"),JSON.stringify({childId:"lab-child"}));
  const pdf=path.join(rootDir,"blank.txt");fs.writeFileSync(pdf,"   ");transport.mockReset().mockRejectedValue(new Error("provider must not run"));
  await expect(ingestMathAssignment({rootDir,childId:"lab-child",pdf})).rejects.toThrow("assignment_evidence_empty");
  expect(transport).not.toHaveBeenCalled();
});
