import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";
import { getChildChart } from "../profiles/childChart";
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn() }));
afterEach(() => vi.clearAllMocks());
function session() {
  vi.mocked(getChildChart).mockReturnValue({ learningCycle: { homeworkId: "hw-words", domain: "spelling", nodes: [{ nodeId: "opening", state: "ready", role: "evaluation", artifactBinding: { contractFingerprint: "frozen" }, evidenceContract: { spellingItems: { i1: { id: "i1", word: "night" }, i2: { id: "i2", word: "light" } } } }] } } as never);
  const s = Object.assign(Object.create(SessionManager.prototype), {
    chartChildId: "lab-child", childName: "Lab", sessionTtsLabel: "Lab", sessionId: "s1", companionPresence: "collapsed", send: vi.fn(),
    debugRecorder: { recordEvent: vi.fn() },
    ttsBridge: { connect: vi.fn(async () => {}), sendText: vi.fn(), finish: vi.fn(async () => {}), hadAudioThisTurn: vi.fn(() => true) },
    turnSM: { onPlaybackComplete: vi.fn(), consumePendingTranscript: vi.fn() },
    flushPendingRoundComplete: vi.fn(),
  }) as SessionManager;
  s.updateCurrentBoardSnapshot({phase:"launched",nodeId:"opening"});
  return s;
}
function confirmCurrentPlayback(s: SessionManager): void {
  const pending = (s as unknown as {
    pendingGameNarrationPlayback: { requestId: string; assessmentItemId: string };
  }).pendingGameNarrationPlayback;
  s.playbackDone({
    audible: true,
    requestId: pending.requestId,
    itemId: pending.assessmentItemId,
  });
}
describe("live spelling assistance and audio provenance", () => {
  it("retains exposure and support when delayed writes arrive after the next item", async () => {
    const s = session();
    s.setCompanionPresence("summoned");
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" });
    await s.speakGameNarration("night.", { assessmentMode: true, itemId: "i1" });
    confirmCurrentPlayback(s);
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "feedback", answerVisibility: "visible" });
    s.setCompanionPresence("collapsed");
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i2", phase: "response", answerVisibility: "hidden" });
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")).toMatchObject({ support: { status: "assisted" }, instrumentSignals: ["answer_exposure"] });
  });
  it("requires the frozen active item and successful stimulus delivery", async () => {
    const s = session();
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")).toBeUndefined();
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" });
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")?.instrumentSignals).toContain("audio_unavailable");
    await s.speakGameNarration("night.", { assessmentMode: true, itemId: "i1" });
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")?.instrumentSignals).toContain("audio_unavailable");
    confirmCurrentPlayback(s);
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")).toMatchObject({ support: { status: "unassisted" }, instrumentSignals: [], artifactHash: "frozen" });
    expect(s.getDiscoveryAttemptContext("other-homework", "i1")).toBeUndefined();
  });
  it("keeps a help request assisted even after Elli collapses", async () => {
    const s = session();
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" });
    await s.speakGameNarration("night.", { assessmentMode: true, itemId: "i1" });
    s.setCompanionPresence("summoned"); s.setCompanionPresence("collapsed");
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")?.support.status).toBe("assisted");
  });
  it("does not carry one item's help into the next item while the companion remains open", async () => {
    // Human catch: one summoned companion state made every later spelling word
    // look assisted. The logs recorded the bad classification but the lab never
    // advanced to a second item without collapsing the companion first.
    const s = session();
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" });
    s.setCompanionPresence("summoned");
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")?.support.status).toBe("assisted");

    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i2", phase: "response", answerVisibility: "hidden" });

    expect(s.getDiscoveryAttemptContext("hw-words", "i2")?.support).toEqual({
      status: "unassisted",
      scaffolds: [],
    });
  });
  it("does not misreport a failed or mismatched audio stimulus as delivered", async () => {
    const s = session();
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" });
    await expect(s.speakGameNarration("light.", { assessmentMode: true, itemId: "i1" })).rejects.toThrow("spelling_stimulus_mismatch");
    (s as unknown as { ttsBridge: { finish: () => Promise<void> } }).ttsBridge.finish = async () => { throw new Error("audio failed"); };
    await expect(s.speakGameNarration("night.", { assessmentMode: true, itemId: "i1" })).rejects.toThrow("audio failed");
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")?.instrumentSignals).toContain("audio_unavailable");
  });
  it("rejects a TTS stream that finishes without sending playable audio", async () => {
    const s = session();
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" });
    (s as unknown as { ttsBridge: { hadAudioThisTurn: () => boolean } }).ttsBridge.hadAudioThisTurn = () => false;

    await expect(s.speakGameNarration("night.", { assessmentMode: true, itemId: "i1" }))
      .rejects.toThrow("spelling_stimulus_audio_unavailable");
    expect(s.getDiscoveryAttemptContext("hw-words", "i1")?.instrumentSignals).toContain("audio_unavailable");
  });
});

describe("live math Discovery assistance provenance", () => {
  it("binds Elli help to the frozen math item even when the browser reports no help", () => {
    vi.mocked(getChildChart).mockReturnValue({
      learningCycle: {
        homeworkId: "hw-math",
        domain: "math",
        nodes: [{
          nodeId: "probe-arrays",
          role: "evaluation",
          artifactBinding: { contractFingerprint: "math-frozen" },
          evidenceContract: {},
        }],
      },
    } as never);
    const s = Object.assign(Object.create(SessionManager.prototype), {
      chartChildId: "lab-child",
      sessionId: "s-math",
      companionPresence: "collapsed",
      send: vi.fn(),
    }) as SessionManager;

    s.updateCurrentBoardSnapshot({
      nodeId: "probe-arrays",
      phase: "question",
      currentChallenge: { id: "math-item-1", prompt: "Choose the matching array." },
      answerVisibility: "hidden",
    });
    s.setCompanionPresence("summoned");

    expect(s.getDiscoveryAttemptContext("hw-math", "math-item-1")).toMatchObject({
      artifactHash: "math-frozen",
      support: {
        status: "assisted",
        scaffolds: ["support:s-math:math-item-1"],
      },
    });
  });
});

it('keeps the frozen node identity with each spelling response context',()=>{
 const s=session();
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden'});
 expect(s.getDiscoveryAttemptContext('hw-words','i1')).toMatchObject({nodeId:'opening',sessionId:'s1'});
});

it('cannot verify an item snapshot without a matching server-recorded launch',()=>{
 const s=session();
 s.updateCurrentBoardSnapshot({phase:'launched',nodeId:'not-in-cycle'});
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden'});
 const context=s.getDiscoveryAttemptContext('hw-words','i1');
 expect(context?.support.status).toBe('unknown');
 expect(context?.instrumentSignals).toContain('launch_unverified');
});
it('records a valid launch before accepting that nodes item context',()=>{
 const s=session();
 s.updateCurrentBoardSnapshot({phase:'launched',nodeId:'opening'});
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden'});
 expect(s.getDiscoveryAttemptContext('hw-words','i1')).toMatchObject({nodeId:'opening',launchId:expect.any(String)});
});

it('commits the original presentation before any answer and counts acknowledged audio replays',async()=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const {openChart}=await import('../chart/db');const {recordAssignment}=await import('../chart/spelling/record');const {exportEvents}=await import('../chart/exportEvents');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'live-chart-'));vi.stubEnv('SUNNY_CHART_DIR',root);vi.stubEnv('SUNNY_MODE','real');
 const db=openChart('lab-child',{chartDir:root});
 try{
 recordAssignment(db,{assignmentId:'hw-words',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const s=session();s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden'});
 expect(exportEvents(db).map(e=>e.type)).toEqual(['assignment.ingested','item.presented']);
 expect(s.getDiscoveryAttemptContext('hw-words','i1')).toMatchObject({chartItemId:expect.any(String),audioReplays:0});
 await s.speakGameNarration('night.',{assessmentMode:true,itemId:'i1'});confirmCurrentPlayback(s);
 await s.speakGameNarration('night.',{assessmentMode:true,itemId:'i1'});confirmCurrentPlayback(s);
 expect(s.getDiscoveryAttemptContext('hw-words','i1')).toMatchObject({audioReplays:1});
 }finally{db.close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
});

it('keeps replay and delayed responses attached to their distinct launches',async()=>{
 const s=session();
 s.updateCurrentBoardSnapshot({phase:'launched',nodeId:'opening',launchToken:'first'});
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden',launchToken:'first'});
 s.setCompanionPresence('summoned');
 const first=s.getDiscoveryAttemptContext('hw-words','i1','first');
 s.updateCurrentBoardSnapshot({phase:'launched',nodeId:'opening',launchToken:'second'});
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden',launchToken:'second'});
 const second=s.getDiscoveryAttemptContext('hw-words','i1','second');
 expect(second?.launchId).not.toBe(first?.launchId);
 expect(second?.support.status).toBe('unassisted');
 expect(s.getDiscoveryAttemptContext('hw-words','i1','first')?.support.status).toBe('assisted');
 expect(s.getDiscoveryAttemptContext('hw-words','i1')).toBeUndefined();
 expect(s.getDiscoveryAttemptContext('hw-words','i1','invented')).toBeUndefined();
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'feedback',answerVisibility:'visible',launchToken:'first'});
 expect(s.getDiscoveryAttemptContext('hw-words','i1','second')?.instrumentSignals).not.toContain('answer_exposure');
 await expect(s.speakGameNarration('night.',{assessmentMode:true,itemId:'i1',launchToken:'first'})).rejects.toThrow('spelling_stimulus_mismatch');
});

 it('captures a practice presentation before answering with unknown support instead of invented independence',async()=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const {openChart}=await import('../chart/db');const {recordAssignment}=await import('../chart/spelling/record');const {exportEvents}=await import('../chart/exportEvents');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'practice-chart-'));vi.stubEnv('SUNNY_CHART_DIR',root);vi.stubEnv('SUNNY_MODE','real');const db=openChart('lab-child');
 try{
 recordAssignment(db,{assignmentId:'hw-words',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const s=session();s.updateCurrentBoardSnapshot({practiceCapture:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'visible'});
 const p=exportEvents(db).find(e=>e.type==='item.presented');
 expect(p?.payload).toMatchObject({instrument:'practice',shown:{lettersVisible:true,hint:null,companionHelp:null}});
 expect(s.getDiscoveryAttemptContext('hw-words','i1')).toMatchObject({practice:true,support:{status:'unknown'},audioReplays:null,instrumentSignals:[]});
 }finally{db.close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
 });

 it.each(['visible', 'hidden', undefined])('persists native opening visibility %s before any answer arrives',async(answerVisibility)=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');const vm=await import('node:vm');
 const {openChart}=await import('../chart/db');const {recordAssignment}=await import('../chart/spelling/record');const {exportEvents}=await import('../chart/exportEvents');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-presentation-'));vi.stubEnv('SUNNY_CHART_DIR',root);vi.stubEnv('SUNNY_MODE','real');const db=openChart('lab-child');
 try{
 recordAssignment(db,{assignmentId:'hw-words',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
 const s=session();s.updateCurrentBoardSnapshot({phase:'launched',nodeId:'opening',launchToken:'native-launch'});
 const sandbox={location:{search:'?nodeId=opening&launchToken=native-launch&spellingItemBindings='+encodeURIComponent(JSON.stringify([{itemId:'i1',word:'night'}]))},URLSearchParams,console,Date,Math,document:{title:'Letter Rush',addEventListener(){}},window:{parent:{postMessage:(message:{type:string;payload:Record<string,unknown>})=>{if(message.type==='game_state_update')s.updateCurrentBoardSnapshot(message.payload);}}}};
 vm.runInNewContext(fs.readFileSync(path.join(process.cwd(),'web/public/games/_contract.js'),'utf8'),sandbox);
 (sandbox.window as any).GameBridge.reportState('item opened',{spellingItemOpened:true,currentWord:'night',phase:'presentation',answerVisibility});
 const events=exportEvents(db);expect(events.filter(e=>e.type==='response.observed')).toHaveLength(0);
 expect(events.find(e=>e.type==='item.presented')?.payload).toMatchObject({instrument:'practice',shown:{lettersVisible:answerVisibility === 'visible' ? true : answerVisibility === 'hidden' ? false : null,hint:null,companionHelp:null},provenance:{nodeId:'opening',sourceItemId:'i1'}});
 expect(s.getDiscoveryAttemptContext('hw-words','i1','native-launch')?.chartItemId).toBeTruthy();
 expect(s.getDiscoveryAttemptContext('hw-words','i1','native-launch')?.spellingShown).toBe(answerVisibility === 'visible' ? true : answerVisibility === 'hidden' ? false : null);
 s.updateCurrentBoardSnapshot({practiceCapture:true,nodeId:'opening',itemId:'i1',launchToken:'native-launch',phase:'response',answerVisibility:'hidden'});
 expect(s.getDiscoveryAttemptContext('hw-words','i1','native-launch')?.spellingShown).toBe(answerVisibility === 'visible' ? true : answerVisibility === 'hidden' ? false : null);
 }finally{db.close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
 });

it('keeps launch correlation through the production narration event adapter',async()=>{
 const {handleGameEventForSession}=await import('./game-event-handler');
 const speakGameNarration=vi.fn(async()=>true);
 handleGameEventForSession({speakGameNarration},{type:'narration_request',payload:{text:'night',word:'night',game:'word-radar',nodeId:'opening',itemId:'i1',assessmentMode:true,launchToken:'launch-one'}});
 expect(speakGameNarration).toHaveBeenCalledWith('night.',expect.objectContaining({itemId:'i1',launchToken:'launch-one'}));
});
