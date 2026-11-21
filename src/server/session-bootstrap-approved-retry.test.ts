import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../agents/classifier/classifier", () => ({ classifyAndRoute: vi.fn(async () => ({ hasNewFiles: false, routed: [] })) }));
// The model boundary only: the Planner decision and the successor build are stubbed (no paid calls).
const advance = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
vi.mock("../engine/learningCycleRuntime", async (importOriginal) => ({ ...(await importOriginal<object>()), advanceCanonicalCycleFromEvidence: advance }));
vi.mock("../engine/canonicalProgressionGenerator", async (importOriginal) => ({ ...(await importOriginal<object>()), prepareSuccessorBoard: prepare }));
import { createLearningCycle, getLearningCycle, transitionLearningCycle, type CreateLearningCycleInput } from "../engine/learningCycleRepository";
import { publishBoardInstance } from "../engine/learningBoardInstances";
import { seedSpellingLab } from "../scripts/fixtures/spellingEvidenceFirst";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { runSessionStart } from "./session-bootstrap";
import { SessionManager } from "./session-manager";

// BUGS.md S19, human-caught 2026-11-18: the owner approved a Planner retry for a blocked board, but it
// ran only at the next server startup (resumeSuccessorBoards), so her next session opened on the same
// blocked board until someone restarted the kiosk.
// Why the human caught it: the approval printed "queued" and nothing happened until a restart.
// Why logs missed it: there was nothing to log; no code path looked at an approved retry after startup.
// Why the lab missed it: retry tests called advanceCanonicalCycleFromEvidence directly, never through a session start.
const childId = "approved-retry-lab", homeworkId = "hw-approved-retry";
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-approved-retry-"));
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
  advance.mockReset(); prepare.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(root,{recursive:true,force:true}); });

function seed(approved: boolean) {
  const context = path.join(root,"src/context",childId);
  const pending = {homeworkId,weekOf:"2026-11-16",testDate:null,wordList:["brim"],contentProfile:{practiceDomain:"spelling"},
    nodes:[{id:"current-activity",type:"word-radar",targets:["brim"],difficulty:1,source:"chart_planner"}]};
  const homework = path.join(context,"homework");fs.mkdirSync(homework,{recursive:true});
  fs.writeFileSync(path.join(homework,"current.json"),JSON.stringify({version:1,childId,selectedDomain:"spelling",current:pending,activeByDomain:{spelling:pending}}));
  const input: CreateLearningCycleInput = {
    childId,homeworkId,domain:"spelling",initialLifecycle:"baseline_evaluating",assignment:{title:"Synthetic assignment",contentFingerprint:"synthetic",capturedEvidenceIds:["assignment:synthetic"],targets:["brim"]},
    academicTheory:{theoryId:"synthetic-theory",revision:1,hypothesis:"A synthetic test hypothesis",supportCriteria:["Captured response"],reviseCriteria:["Missing response"],falsifyCriteria:["No response"]},engagementTheory:null,
    nodes:[{nodeId:"current-activity",role:"baseline",title:"Current activity",state:"completed",
      academicTarget:{domain:"spelling",skill:"spelling",targets:["brim"]},algorithmOwner:"retrieval-practice",theoryId:"synthetic-theory",experimentId:"synthetic-experiment",mechanic:"word-radar",theme:"synthetic",
      openingScreen:{title:"Current activity",purpose:"Synthetic activity"},generationPrompt:null,artifactBinding:null,artwork:{status:"pending",localPath:null,prompt:null},sfxContract:["tap","complete"],companionContract:{events:["session_complete"]},evidenceContract:{academic:true,engagement:true,companionObservations:true},evidenceIds:[]}],
  };
  const board = publishBoardInstance({...input,boards:[]} as never,{kind:"teaching",definition:linearJourneyFixture(["current-activity"]),predecessorBoardId:null,plannerDecisionId:"synthetic-decision",evidenceIds:["assignment:synthetic"],nodeIds:["current-activity"],publishedAt:"2026-11-16T00:00:00Z"});
  let cycle = createLearningCycle({...input,boards:[board]},{rootDir:root});
  cycle = transitionLearningCycle(childId,homeworkId,cycle.revision,{type:"block",reason:"provider_outcome_uncertain:Request was aborted."},{rootDir:root});
  if (approved) cycle = transitionLearningCycle(childId,homeworkId,cycle.revision,{type:"planner_retry_authorized",blockedDecisionId:cycle.decisionHistory.at(-1)!.decisionId,reason:"Owner approved one fresh attempt"},{rootDir:root});
  return cycle;
}

async function start() {
  const ws = {readyState:WebSocket.OPEN,OPEN:WebSocket.OPEN,send:vi.fn()} as unknown as WebSocket;
  const s = new SessionManager(ws,childId as never,false,{silentTts:true,chartChildId:childId,homeworkId});
  const deepgram = vi.spyOn(s as any,"connectDeepgram").mockResolvedValue(undefined);
  const response = vi.spyOn(s as any,"runCompanionResponse").mockResolvedValue(undefined);
  try {await runSessionStart(s,{});}
  finally {(s as any).clearSessionTimer?.();deepgram.mockRestore();response.mockRestore();}
}

it("decides an owner-approved Planner retry when her next session opens, with no restart", async () => {
  const approved = seed(true);
  expect(approved.lifecycle).toBe("baseline_evaluating");
  advance.mockImplementation(async () => getLearningCycle(childId,homeworkId,{rootDir:root}));
  prepare.mockImplementation(async () => getLearningCycle(childId,homeworkId,{rootDir:root}));
  await start();
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledWith({childId,homeworkId}));
  expect(advance).toHaveBeenCalledTimes(1);
  expect(advance).toHaveBeenCalledWith({childId,homeworkId});
});

it("never buys a decision for a blocked board nobody approved", async () => {
  seed(false);
  await start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(advance).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
});
