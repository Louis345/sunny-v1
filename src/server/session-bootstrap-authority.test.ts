import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agents/classifier/classifier", () => ({ classifyAndRoute: vi.fn(async () => ({ hasNewFiles: false, routed: [] })) }));
import { createLearningCycle, type CreateLearningCycleInput } from "../engine/learningCycleRepository";
import { publishBoardInstance } from "../engine/learningBoardInstances";
import { getChildChart } from "../profiles/childChart";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { readLearningProfile } from "../utils/learningProfileIO";
import { runSessionStart } from "./session-bootstrap";
import { SessionManager } from "./session-manager";

// Human catch: a completed board plus a missing projection was announced as a new
// evaluation. Helper-only tests missed bootstrap's stale source, while other tests
// explicitly required the unwanted orientation. Exercise real chart projection,
// legacy hydration and bootstrap; replace only external IO / the model boundary.
const childId = "arrival-authority-lab", homeworkId = "hw-spelling-authority";
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-arrival-authority-"));
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(root, "src/context"));
  vi.stubEnv("SUNNY_SESSION_LOG_ROOT", path.join(root, "sessions"));
  vi.stubEnv("SUNNY_CHART_DIR", "");
  vi.stubEnv("SUNNY_MODE", "real");
  vi.stubEnv("SUNNY_SUBJECT", "homework");
  vi.stubEnv("SUNNY_CHILD", childId);
  vi.stubEnv("SUNNY_COMPANION_ID", "elli");
  vi.stubEnv("ADVENTURE_MAP", "true");
  for (const key of ["SUNNY_TEST_MODE", "DEBUG_CLAUDE", "DEMO_MODE", "HOMEWORK_MODE"]) vi.stubEnv(key, "false");
  vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({subject:"homework",childId,homeworkDomain:"spelling",sessionMode:"real",previewMode:"off",nodeAccess:"normal",voiceMode:"normal"}));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("lab_external_network_forbidden"); }));
  seedSpellingLab(root, ["brim"], "", childId);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(root,{recursive:true,force:true}); });

function seed(kind: "probe" | "teaching" | "successor", projection: "missing" | "empty" | "null" | "stale") {
  const context = path.join(root,"src/context",childId);
  const pending = {homeworkId,weekOf:"2026-10-22",testDate:null,wordList:["brim"],contentProfile:{practiceDomain:"spelling"},
    nodes:[{id:"old-discovery",type:"word-radar",targetLane:"independent_discovery",targets:["brim"],difficulty:1,source:"chart_planner"}]};
  const homework = path.join(context,"homework");fs.mkdirSync(homework,{recursive:true});
  fs.writeFileSync(path.join(homework,"current.json"),JSON.stringify({version:1,childId,selectedDomain:"spelling",current:pending,activeByDomain:{spelling:pending}}));
  const planDir = path.join(context,"plans");fs.mkdirSync(planDir,{recursive:true});
  const stalePlan = {planId:"discovery:old-plan",childId,domain:"spelling",activeHomeworkId:homeworkId,nodePlan:pending.nodes,createdAt:"2026-10-22T00:00:00Z"};
  if (projection !== "missing") fs.writeFileSync(path.join(planDir,"active_session_plan.json"),projection === "empty" ? "" : JSON.stringify({version:1,childId,selectedDomain:"spelling",current:projection === "null" ? null : stalePlan,activeByDomain:projection === "null" ? {} : {spelling:stalePlan}}));
  const input: CreateLearningCycleInput = {
    childId,homeworkId,domain:"spelling",assignment:{title:"Synthetic assignment",contentFingerprint:"synthetic",capturedEvidenceIds:["assignment:synthetic"],targets:["brim"]},
    academicTheory:{theoryId:"synthetic-theory",revision:1,hypothesis:"A synthetic test hypothesis",supportCriteria:["Captured response"],reviseCriteria:["Missing response"],falsifyCriteria:["No response"]},engagementTheory:null,
    nodes:[{nodeId:"current-activity",role:kind === "probe" ? "evaluation" : "baseline",title:"Current activity",state:kind === "successor" ? "blocked" : kind === "teaching" ? "completed" : "ready",
      ...(kind === "successor" ? {notReadyReason:"successor_node_failed:human_review_required"} : {}),
      academicTarget:{domain:"spelling",skill:"spelling",targets:["brim"]},algorithmOwner:"retrieval-practice",theoryId:"synthetic-theory",experimentId:"synthetic-experiment",mechanic:"word-radar",theme:"synthetic",
      openingScreen:{title:"Current activity",purpose:"Synthetic activity"},generationPrompt:null,artifactBinding:null,artwork:{status:"pending",localPath:null,prompt:null},sfxContract:["tap","complete"],companionContract:{events:["session_complete"]},evidenceContract:{academic:true,engagement:true,companionObservations:true},evidenceIds:[]}],
  };
  const board = publishBoardInstance({...input,boards:[]} as never,{kind,definition:linearJourneyFixture(["current-activity"]),predecessorBoardId:null,plannerDecisionId:"synthetic-decision",evidenceIds:["assignment:synthetic"],nodeIds:["current-activity"],publishedAt:"2026-10-22T00:00:00Z"});
  createLearningCycle({...input,boards:[board]},{rootDir:root});
  return context;
}

async function start() {
  const ws = {readyState:WebSocket.OPEN,OPEN:WebSocket.OPEN,send:vi.fn()} as unknown as WebSocket;
  const s = new SessionManager(ws,childId as never,false,{silentTts:true,chartChildId:childId,homeworkId});
  const deepgram = vi.spyOn(s as any,"connectDeepgram").mockResolvedValue(undefined);
  const response = vi.spyOn(s as any,"runCompanionResponse").mockResolvedValue(undefined);
  try {await runSessionStart(s,{});return {session:s as any,response};}
  finally {(s as any).clearSessionTimer?.();deepgram.mockRestore();}
}

describe("arrival uses canonical board authority", () => {
  it.each(["missing","empty","null","stale"] as const)("does not classify a completed Teaching board from stale Discovery when the projection is %s", async projection => {
    seed("teaching",projection);
    const chart = getChildChart(childId,{rootDir:root});
    expect(chart.activeSessionPlan?.planId).toMatch(/^learning-cycle:/);
    expect(readLearningProfile(childId)?.pendingHomework?.nodes[0]).toMatchObject({targetLane:"independent_discovery"});
    const {session,response} = await start();
    expect(session.companionWakeGateEnabled).toBe(false);
    expect(response).toHaveBeenCalledOnce(); // Non-gated greeting is explicitly retained in this slice.
    expect(response.mock.calls[0][0]).not.toMatch(/independent evaluation|Tap the speaker|Not sure/i);
  });

  it("keeps genuine canonical Discovery child-invoked even without its projection", async () => {
    seed("probe","null");
    expect(getChildChart(childId,{rootDir:root}).activeSessionPlan?.planId).toMatch(/^learning-cycle:/);
    const {session,response} = await start();
    expect(session.companionWakeGateEnabled).toBe(true);
    expect(response).not.toHaveBeenCalled();
  });

  it("does not announce an evaluation from a published unavailable successor", async () => {
    seed("successor","null");
    const {session,response} = await start();
    expect(session.companionWakeGateEnabled).toBe(false);
    expect(response.mock.calls[0][0]).not.toMatch(/independent evaluation|Tap the speaker|Not sure/i);
  });
});
