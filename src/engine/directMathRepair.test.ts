import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { repairDirectArtifact, generateDirectArtifacts, createDirectBoardThumbnailFilename, buildDirectActivityRepairPrompt, type DirectArtifact } from "./directMathExperience";
import { buildDiscoveryRepairPrompt } from "./adaptiveMathDiscovery";
import { MATH_IMPLEMENTATION_REPAIR_CONTRACT } from "./discoveryVisualReview";
import { plan } from "../scripts/fixtures/adaptiveMathRelease";

let root: string, artifact: DirectArtifact, screenshot: string;
const original = '<!doctype html><html><button id="answer">Answer</button></html>';
const patched = original.replace('id="answer"', 'id="answer" aria-label="Answer"');
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const patch = JSON.stringify({ replacements: [{ oldText: 'id="answer"', newText: 'id="answer" aria-label="Answer"', reason: "accessible name" }] });
const stream = (text: string) => new Response(`data: ${JSON.stringify({type:"response.completed",response:{status:"completed",output_text:text,usage:{input_tokens:12,output_tokens:9}}})}\n\n`, {status:200});
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-repair-receipt-"));
  artifact = { childId:"lab", homeworkId:"hw-lab", nodeId:"activity-1", title:"Lab", htmlPath:path.join(root,"node.html"), htmlHash:hash(original), academicContractHash:"academic", designArtifactHash:"design", artworkUrl:"/art.svg", creatorPrompt:"fixture", promptHash:"fixture", plannerModel:"mock", creatorModel:"mock" };
  fs.writeFileSync(artifact.htmlPath, original);
  fs.writeFileSync(path.join(root,"node.artifact.json"), JSON.stringify(artifact));
  screenshot = path.join(root,"failure.png"); fs.writeFileSync(screenshot, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z0kAAAAASUVORK5CYII=", "base64"));
  vi.stubEnv("OPENAI_API_KEY", "fixture-only");
  vi.stubGlobal("fetch", vi.fn(async () => stream(patch)));
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(root,{recursive:true,force:true});});
const run = () => repairDirectArtifact({artifact,activity:plan(2).activities[0],failures:["missing accessible name"],screenshotPaths:[screenshot],outputDir:path.join(root,"diagnostics")});

it("uses one root-cause repair contract for Discovery and teaching without changing academic authority", async () => {
  const failure='math_hidden_state_visible:#numeric-panel | math_repair_state:{"itemId":"two","notYetVerifiedItemIds":["two","three"],"hidden":[{"selector":"#numeric-panel","computedDisplay":"flex"}]}';
  const activity=plan(2).activities[0];
  const teaching=buildDirectActivityRepairPrompt({activity,html:original,failures:[failure]});
  const discovery=buildDiscoveryRepairPrompt({issues:[failure],runtimeContractJson:'{"items":[]}',contractHash:'academic-hash',academic:{items:[]},designHash:'design-hash',design:{},html:original});
  expect(MATH_IMPLEMENTATION_REPAIR_CONTRACT).toContain('underlying implementation cause across all affected states');
  expect(MATH_IMPLEMENTATION_REPAIR_CONTRACT).toContain('Unvisited states are unverified, not passed');
  for(const prompt of [teaching,discovery]){
    expect(prompt).toContain(MATH_IMPLEMENTATION_REPAIR_CONTRACT);
    expect(prompt).toContain(failure);
    expect(prompt).toContain(original);
    expect(prompt).not.toMatch(/Correct only the listed (?:runtime )?defects/);
    expect(prompt).toContain('Do not redesign');
  }
  expect(teaching).toContain('IMMUTABLE ACADEMIC CONTRACT');
  expect(discovery).toContain('ACADEMIC CONTRACT HASH: academic-hash');
  await repairDirectArtifact({artifact,activity,failures:[failure],screenshotPaths:[screenshot],outputDir:path.join(root,'diagnostics')});
  const body=JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body));
  expect(body.input[0].content).toEqual(expect.arrayContaining([{type:'input_text',text:teaching}]));
  expect(body.input[0].content.filter((row:{type:string})=>row.type==='input_image')).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("resumes a completed repair without another paid request or hash change", async () => {
  const first = await run(); const second = await run();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(first.htmlHash).toBe(hash(patched)); expect(second).toEqual(first);
  expect(first.academicContractHash).toBe("academic"); expect(first.designArtifactHash).toBe("design");
});
it("saves even a malformed response and never buys it twice", async () => {
  vi.mocked(fetch).mockImplementation(async () => stream("malformed patch"));
  await expect(run()).rejects.toThrow(); await expect(run()).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1); expect(fs.readFileSync(artifact.htmlPath,"utf8")).toBe(original);
});
it("does not turn a missing local credential into an uncertain paid request", async () => {
  vi.stubEnv("OPENAI_API_KEY", ""); await expect(run()).rejects.toThrow("preflight_missing"); expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("OPENAI_API_KEY", "fixture-only"); await expect(run()).resolves.toMatchObject({htmlHash:hash(patched)}); expect(fetch).toHaveBeenCalledTimes(1);
});
it("refuses missing failure screenshots before a paid request", async () => {
  fs.unlinkSync(screenshot); await expect(run()).rejects.toThrow("repair_screenshot_missing"); expect(fetch).not.toHaveBeenCalled();
});
it("checks immutable metadata before changing HTML or paying", async () => {
  fs.writeFileSync(path.join(root,"node.artifact.json"), JSON.stringify({...artifact,academicContractHash:"different"}));
  await expect(run()).rejects.toThrow("frozen_hash_mismatch"); expect(fetch).not.toHaveBeenCalled(); expect(fs.readFileSync(artifact.htmlPath,"utf8")).toBe(original);
});
it("recovers after a completed response when installing HTML is interrupted", async () => {
  const write = fs.writeFileSync.bind(fs); let interrupted = false;
  vi.spyOn(fs,"writeFileSync").mockImplementation((file,data,options) => {
    if (!interrupted && String(file).startsWith(artifact.htmlPath) && String(data)===patched) { interrupted=true; throw new Error("installation_interrupted"); }
    return write(file,data,options);
  });
  await expect(run()).rejects.toThrow("installation_interrupted");
  expect((await run()).htmlHash).toBe(hash(patched)); expect(fetch).toHaveBeenCalledTimes(1);
});

it("reuses a paid initial build when metadata installation was interrupted", async () => {
  const program=plan(2), activity=program.activities[0];
  activity.designArtifact={academicContractHash:"frozen"} as never;
  const images=path.join(root,"web/public/generated/direct-math");fs.mkdirSync(images,{recursive:true});
  fs.writeFileSync(path.join(images,createDirectBoardThumbnailFilename("hw-lab",activity)),"saved thumbnail");
  vi.mocked(fetch).mockImplementation(async()=>stream(original));
  const write=fs.writeFileSync.bind(fs);let interrupted=false;
  vi.spyOn(fs,"writeFileSync").mockImplementation((file,data,options)=>{
    if(!interrupted&&String(file).endsWith(activity.id+".artifact.json")){interrupted=true;throw new Error("metadata_interrupted");}
    return write(file,data,options);
  });
  const build=()=>generateDirectArtifacts({rootDir:root,childId:"lab",homeworkId:"hw-lab",plan:program,nodeIds:[activity.id],assignmentFingerprint:"fixture",existingArtworkUrls:{backgroundUrl:"/saved.svg",questArtworkUrl:"/saved.svg",bossArtworkUrl:"/saved.svg"}});
  await expect(build()).rejects.toThrow("metadata_interrupted");
  const result=await build();
  expect(result.artifacts).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});
