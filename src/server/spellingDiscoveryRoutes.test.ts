import express from "express";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle, buildSpellingDiscoveryPlan } from "../engine/learningCycleIngest";
import { hashDiscoveryContract, publishDiscoveryExperience } from "../engine/adaptiveMathDiscovery";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { setupRoutes } from "./routes";
import { registerActiveVoiceSessionManager, __resetVoiceSessionRegistryForTests } from "./voice-session-registry";
vi.mock("../shared/childRegistry", async (original) => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["lab-child"] }));
const roots: string[] = [];
const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(() => { servers.splice(0).forEach(server => server.close()); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); vi.unstubAllEnvs(); __resetVoiceSessionRegistryForTests(); });
async function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-routes-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_MODE", "real");
  const items = buildSpellingRecallItems({ homeworkId: "hw-words", words: ["night", "light"], evidenceIds: ["school:one"], measurementRole: "fresh_checkpoint" });
  const cycle = createSpellingDiscoveryCycle({ childId: "lab-child", homeworkId: "hw-words", title: "Words", contentFingerprint: "source", items }, { rootDir });
  publishDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-words", spellingItems: items, assignment: cycle.assignment, activeSessionPlan: buildSpellingDiscoveryPlan({ cycle, companion: { id: "elli", name: "Elli" } }) });
  const app = express(); app.use(express.json()); setupRoutes(app); const server = app.listen(0); servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/learning/lab-child/assignments/hw-words/discovery`;
  const post = (suffix: string, body: unknown) => fetch(`${base}/${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { rootDir, items, post, origin: new URL(base).origin };
}
describe("spelling through the production Discovery routes", () => {
  it("serves a native spelling config from the isolated context root", async () => {
    const { rootDir, origin } = await fixture();
    const dir = path.join(rootDir, "src/context/lab-child/homework/games/hw-words"); fs.mkdirSync(dir, { recursive: true });
    const config = { schemaVersion: 1, activityId: "letter-rush", mode: "read-and-race", topic: "Words", domain: "spelling", learningGoal: "Practice", gradeBand: "early_elementary", scaffolds: { showWord: true, letterBank: true, allowRetryBeforeScore: true, companionHints: false }, words: [{ id: "frozen-night", text: "night" }], evidencePolicy: { writesPracticeEvidence: true, writesMasteryEvidence: false, requiresPerTargetResult: true, allowedEvidence: ["practice"] } };
    fs.writeFileSync(path.join(dir, "practice.json"), JSON.stringify(config));
    const response = await fetch(`${origin}/api/activity-config/lab-child/hw-words/practice.json`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ words: [{ id: "frozen-night", text: "night" }], evidencePolicy: { writesMasteryEvidence: false } });
  });
  it("uses live support provenance, grades frozen answers, and ignores forged correctness", async () => {
    const { rootDir, items, post } = await fixture();
    registerActiveVoiceSessionManager("lab-child", { noteExternalEvent() {}, getSessionId: () => "s1", getDiscoveryAttemptContext: () => ({ nodeId: getLearningCycle("lab-child", "hw-words", {rootDir})!.nodes[0].nodeId, support: { status: "unassisted", scaffolds: [] }, instrumentSignals: [], artifactHash: hashDiscoveryContract(items), sessionId: "s1" }) });
    const body = { attemptId: "a1", sessionId: "s1", itemId: items[0].id, attemptedValue: "nite", observedAt: "2026-09-08T12:00:00Z", supportEventIds: [], instrumentSignals: [], correct: true, constructId: "invented", assistance: "unassisted" };
    expect((await post("attempt", body)).status).toBe(200);
    expect((await post("attempt", body)).status).toBe(200);
    const cycle = getLearningCycle("lab-child", "hw-words", { rootDir })!;
    expect(cycle.observations).toHaveLength(1);
    expect(cycle.observations[0]).toMatchObject({ result: { correct: false }, constructLinks: [{ constructId: items[0].constructId }], assistance: { status: "unassisted" } });
  });
  it("does not infer independence without a live server context and keeps Not sure unknown", async () => {
    const { rootDir, items, post } = await fixture();
    const body = { attemptId: "a1", itemId: items[0].id, attemptedValue: "", skipped: true, observedAt: "2026-09-08T12:00:00Z", supportEventIds: [], instrumentSignals: [] };
    expect((await post("attempt", body)).status).toBe(200);
    expect((await post("attempt", body)).status).toBe(200);
    const observed = getLearningCycle("lab-child", "hw-words", { rootDir })!.observations[0];
    expect(observed.result.correct).toBeUndefined(); expect(observed.assistance.status).toBe("unknown");
    expect((await post("complete", {})).status).toBe(409);
  });
});

it('rejects a live spelling node mismatch before recording any response',async()=>{
 const {rootDir,items,post}=await fixture();
 registerActiveVoiceSessionManager('lab-child',{noteExternalEvent(){},getSessionId:()=> 's1',getDiscoveryAttemptContext:()=>({nodeId:'other-node',support:{status:'unassisted',scaffolds:[]},instrumentSignals:[],artifactHash:hashDiscoveryContract(items),sessionId:'s1'})});
 const response=await post('attempt',{attemptId:'wrong-node',sessionId:'s1',itemId:items[0].id,attemptedValue:'night',observedAt:'2026-10-03T12:00:00Z',supportEventIds:[],instrumentSignals:[]});
 expect(response.status).toBe(409);
 expect(getLearningCycle('lab-child','hw-words',{rootDir})!.observations).toHaveLength(0);
});

it('does not infer independent spelling evidence from a live context missing its node identity',async()=>{
 const {rootDir,items,post}=await fixture();
 registerActiveVoiceSessionManager('lab-child',{noteExternalEvent(){},getSessionId:()=> 's1',getDiscoveryAttemptContext:()=>({support:{status:'unassisted',scaffolds:[]},instrumentSignals:[],artifactHash:hashDiscoveryContract(items),sessionId:'s1'})});
 expect((await post('attempt',{attemptId:'missing-node',sessionId:'s1',itemId:items[0].id,attemptedValue:'night',observedAt:'2026-10-03T12:00:00Z',supportEventIds:[],instrumentSignals:[]})).status).toBe(200);
 const observation=getLearningCycle('lab-child','hw-words',{rootDir})!.observations[0];
 expect(observation.assistance.status).toBe('unknown');
 expect(observation.provenance).toBe('practice');
});

it.each([false,true])('writes a typed response through the original HTTP endpoint (practice=%s)',async(practice)=>{
 const {rootDir,items,post}=await fixture();
 const {openChart}=await import('../chart/db');const {recordAssignment}=await import('../chart/spelling/record');const {presentOriginalSpellingItem}=await import('../chart/spelling/originalResponses');const {exportEvents}=await import('../chart/exportEvents');
 vi.stubEnv('SUNNY_CHART_DIR',path.join(rootDir,'charts'));const db=openChart('lab-child');
 try{
 recordAssignment(db,{assignmentId:'hw-words',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const nodeId=getLearningCycle('lab-child','hw-words',{rootDir})!.nodes[0].nodeId;
 const p=presentOriginalSpellingItem(db,{assignmentId:'hw-words',sessionId:'s1',nodeId,launchId:'launch',sourceItemId:items[0].id,word:'night',instrument:practice?'practice':'discovery',shown:{lettersVisible:false,hint:practice?null:false,companionHelp:practice?null:false}});
 registerActiveVoiceSessionManager('lab-child',{noteExternalEvent(){},getSessionId:()=> 's1',getDiscoveryAttemptContext:()=>({nodeId,launchId:'launch',chartItemId:String(p.payload.itemId),practice,audioReplays:practice?null:1,support:{status:practice?'unknown':'unassisted',scaffolds:[]},instrumentSignals:[],artifactHash:hashDiscoveryContract(items),sessionId:'s1'})});
 const body={attemptId:'typed-answer',sessionId:'s1',itemId:items[0].id,attemptedValue:'nite',observedAt:'2026-10-03T12:00:00Z',supportEventIds:[],instrumentSignals:[]};
 expect((await post('attempt',body)).status).toBe(200);
 __resetVoiceSessionRegistryForTests();
 expect((await post('attempt',body)).status).toBe(200);
 const responses=exportEvents(db).filter(e=>e.type==='response.observed');expect(responses).toHaveLength(1);
 expect(responses[0].payload).toMatchObject({rawResponse:'nite',sourceResponseId:'typed-answer',support:{audioReplays:practice?null:1,companionHelp:practice?null:false}});
 expect(getLearningCycle('lab-child','hw-words',{rootDir})!.observations[0].result.correct).toBe(false);
 }finally{db.close();}
});

it('does not advance the legacy cycle when the configured chart cannot record the response',async()=>{
 const {rootDir,items,post}=await fixture();
 vi.stubEnv('SUNNY_CHART_DIR',path.join(rootDir,'charts'));
 registerActiveVoiceSessionManager('lab-child',{noteExternalEvent(){},getSessionId:()=> 's1',getDiscoveryAttemptContext:()=>({nodeId:getLearningCycle('lab-child','hw-words',{rootDir})!.nodes[0].nodeId,launchId:'launch',chartItemId:'missing-presentation',audioReplays:0,support:{status:'unassisted',scaffolds:[]},instrumentSignals:[],artifactHash:hashDiscoveryContract(items),sessionId:'s1'})});
 const response=await post('attempt',{attemptId:'failed-write',sessionId:'s1',itemId:items[0].id,attemptedValue:'night',observedAt:'2026-10-03T12:00:00Z',supportEventIds:[],instrumentSignals:[]});
 expect(response.status).toBe(409);
 expect(getLearningCycle('lab-child','hw-words',{rootDir})!.observations).toHaveLength(0);
});

it.each(['wrong-node','wrong-token','missing'] as const)('refuses spelling completion with %s launch provenance',async(kind)=>{
 const {rootDir,origin}=await fixture();
 const nodeId=getLearningCycle('lab-child','hw-words',{rootDir})!.nodes[0].nodeId;
 if(kind==='missing')vi.stubEnv('SUNNY_CHART_DIR',path.join(rootDir,'charts'));
 registerActiveVoiceSessionManager('lab-child',{noteExternalEvent(){},getSessionId:()=> 's1',getSpellingLaunch:()=>kind==='missing'?undefined:({homeworkId:'hw-words',nodeId:kind==='wrong-node'?'actual-explainer':nodeId,launchId:'server-launch',launchToken:kind==='wrong-token'?'other':'token'})});
 const response=await fetch(origin+'/api/learning-cycle/node-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({childId:'lab-child',homeworkId:'hw-words',nodeId,result:{sessionId:'completion',voiceSessionId:'s1',launchToken:'token',completed:true,accuracy:1}})});
 expect(response.status).toBe(409);
 expect(await response.json()).toMatchObject({error:kind==='missing'?'spelling_completion_launch_required':'spelling_completion_launch_mismatch'});
 expect(getLearningCycle('lab-child','hw-words',{rootDir})!.observations).toHaveLength(0);
});
