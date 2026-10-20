import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";
import { getChildChart } from "../profiles/childChart";
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn() }));
afterEach(() => vi.clearAllMocks());
function session() {
  vi.mocked(getChildChart).mockReturnValue({ learningCycle: { homeworkId: "hw-words", domain: "spelling", nodes: [{ nodeId: "opening", state: "ready", role: "evaluation", artifactBinding: { contractFingerprint: "frozen" }, evidenceContract: { spellingItems: { i1: { id: "i1", word: "night" }, i2: { id: "i2", word: "light" } } } }] } } as never);
  const s = Object.assign(Object.create(SessionManager.prototype), {
    companion:{name:"Elli"}, chartChildId: "lab-child", childName: "Lab", sessionTtsLabel: "Lab", sessionId: "s1", companionPresence: "collapsed", send: vi.fn(),
    debugRecorder: { recordEvent: vi.fn(), recordGameTrace: vi.fn() },
    ttsBridge: { beginPlayback:vi.fn(), connect: vi.fn(async () => {}), sendText: vi.fn(), finish: vi.fn(async () => {}), hadAudioThisTurn: vi.fn(() => true) },
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
  it("keeps the current private stimulus out of Elli context while the activity owns grading", () => {
    const s=session();
    s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:"opening",itemId:"i2",phase:"response",answerVisibility:"hidden"});
    const context=s.buildCurrentBoardContextForTurn("What word?");
    expect(context).not.toContain("light");
    expect(context).not.toContain("spokenStimulus");
    expect(context).toContain("replayWord");
    expect(context).toContain('"answerVisibility":"hidden"');
    expect(context).toContain("Spoken repetition is not a submitted spelling answer");
  });
  it("retires a pending reply on item advance, but rejects stale launch context", () => {
    const s=session() as any;
    s.spellingLaunch.launchToken="current";
    s.turnSM.clearPendingTranscript=vi.fn();
    s.bargeIn=vi.fn();
    s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:"opening",itemId:"i1",phase:"response",answerVisibility:"hidden",launchToken:"current"});
    s.currentAbort=new AbortController();
    s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:"opening",itemId:"i2",phase:"response",answerVisibility:"hidden",launchToken:"retired"});
    expect(s.bargeIn).not.toHaveBeenCalled();
    expect(s.currentBoardSnapshot.itemId).toBe("i1");
    s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:"opening",itemId:"i2",phase:"response",answerVisibility:"hidden",launchToken:"current"});
    expect(s.bargeIn).toHaveBeenCalledOnce();
    expect(s.turnSM.clearPendingTranscript).toHaveBeenCalledWith("activity_item_changed");
    expect(s.currentBoardSnapshot.itemId).toBe("i2");
  });

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
  it("records help Elli gives on a later item while she stays summoned", () => {
    // Oct 19 human catch: Elli chunked "dissatisfied" during the hidden check
    // while still summoned from an earlier word, and the item saved as
    // unassisted. Support was only recorded on the collapsed-to-summoned
    // transition; logs kept the reply, and the lab never helped on a second
    // item without re-summoning.
    const s = session();
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" });
    s.setCompanionPresence("summoned");
    s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i2", phase: "response", answerVisibility: "hidden" });
    expect(s.getDiscoveryAttemptContext("hw-words", "i2")?.support.status).toBe("unassisted");
    s.recordCompanionHelpTurn("help me with this one", "Dis... sat... is... fied.");
    expect(s.getDiscoveryAttemptContext("hw-words", "i2")?.support.status).toBe("assisted");
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
 (s as any).ttsBridge.getAudioRatesThisTurn=()=>[0.7];
 await s.speakGameNarration('night.',{assessmentMode:true,itemId:'i1'});confirmCurrentPlayback(s);
 expect(exportEvents(db).find(e=>e.type==='stimulus.played')?.payload).toMatchObject({speechRates:[0.7],delivered:true});
 (s as any).companionBridge={};
 const replay=(s.buildAgentToolkit() as any).replayWord;
 expect(replay).toBeDefined();
 await replay.execute({});
 await vi.waitFor(()=>expect((s as any).pendingGameNarrationPlayback).toBeTruthy());
 confirmCurrentPlayback(s);
 expect(s.getDiscoveryAttemptContext('hw-words','i1')).toMatchObject({audioReplays:1});
 s.updateCurrentBoardSnapshot({nodeId:'opening',itemId:'i1',phase:'response',engagement:{id:'input-1',metric:'first_input_ms',value:400}});
 s.updateCurrentBoardSnapshot({nodeId:'opening',itemId:'i1',phase:'response',engagement:{id:'input-1',metric:'first_input_ms',value:400}});
 s.setCompanionPresence('summoned');s.setCompanionPresence('summoned');
 const signals=exportEvents(db).filter(e=>e.type==='engagement.observed');
 expect(signals.map(e=>[e.payload.metric,e.payload.value])).toEqual([['audio_replays',1],['first_input_ms',400],['help_requests',1]]);
 expect(signals.every(e=>e.payload.itemId===s.getDiscoveryAttemptContext('hw-words','i1')?.chartItemId)).toBe(true);
 expect(exportEvents(db).filter(e=>e.type==='response.observed')).toHaveLength(0);
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

it.each(['closed'])('releases only the matching spelling launch on host %s',phase=>{
 const s=session();s.updateCurrentBoardSnapshot({phase:'launched',nodeId:'opening',launchToken:'current'});
 s.updateCurrentBoardSnapshot({phase,nodeId:'opening',launchToken:'stale'});
 expect(s.getSpellingLaunch()?.launchToken).toBe('current');
 s.updateCurrentBoardSnapshot({phase,nodeId:'opening',launchToken:'current'});
 expect(s.getSpellingLaunch()).toBeUndefined();
});

// The projection must reach the actual conversation context, not just a helper.
it("hands the native activity's dictionary-grounded target to Elli's live turn", () => {
  const s = session();
  vi.mocked(getChildChart).mock.results[0].value.learningCycle.nodes[0].role="baseline";
  s.updateCurrentBoardSnapshot({ game: "monster-stampede", nodeId: "opening",
    currentWord: "tonight", itemIndex: 10, phase: "playing", answerVisibility: "visible" });
  const context = s.buildCurrentBoardContextForTurn("Help me with sweetheart");
  expect(context).toContain("Authoritative spelling target (internal): tonight");
  expect(context).toContain("ARPABET: T AH0 N AY1 T");
  expect(context).toContain("Syllable count: 2");
  expect(context).toContain("canonical target comes from this activity, not room conversation");
});

it("records hidden target letter disclosure in the production session trace", () => {
  const s = session();
  const trace = vi.spyOn(s, "recordGameTrace").mockImplementation(() => {});
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    s.updateCurrentBoardSnapshot({ game: "letter-rush", nodeId: "opening",
      currentWord: "tonight", answerVisibility: "unknown" });
    expect(s.recordCompanionTruthContradictions("Try n-i-g-h-t."))
      .toContain("hidden_spelling_letters_disclosed");
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({
      type: "companion_truth_contradiction", code: "hidden_spelling_letters_disclosed",
      game: "letter-rush", response: "Try n-i-g-h-t.",
    }));
  } finally {
    trace.mockRestore();
    warning.mockRestore();
  }
});

it("exposes replayWord without stimulus text and counts only browser-acknowledged replays",async()=>{
 const s=session() as any;
 s.companionBridge={};
 s.updateCurrentBoardSnapshot({game:"word-radar",assessmentMode:true,nodeId:"opening",itemId:"i1",phase:"response",answerVisibility:"hidden",currentWord:"night"});
 await s.speakGameNarration("night.",{assessmentMode:true,itemId:"i1"});confirmCurrentPlayback(s);
 const replay=s.buildAgentToolkit().replayWord;
 expect(replay).toBeDefined();
 const result=await replay.execute({});
 expect(JSON.stringify(result)).not.toContain("night");
 await vi.waitFor(()=>expect(s.ttsBridge.sendText).toHaveBeenCalledTimes(2));
 await vi.waitFor(()=>expect(s.pendingGameNarrationPlayback).toBeTruthy());
 expect(s.getDiscoveryAttemptContext("hw-words","i1").audioReplays).toBe(0);
 confirmCurrentPlayback(s);
 expect(s.getDiscoveryAttemptContext("hw-words","i1").audioReplays).toBe(1);
 expect(JSON.stringify(s.getFreshActivityStateForScreenshot())).not.toContain("night");
});
it("does not replay a retired item or provide replayWord during visible teaching",async()=>{
 const s=session() as any;s.companionBridge={};
 s.updateCurrentBoardSnapshot({game:"word-radar",assessmentMode:true,nodeId:"opening",itemId:"i1",phase:"response",answerVisibility:"hidden",currentWord:"night"});
 const replay=s.buildAgentToolkit().replayWord;
 expect(replay).toBeDefined();
 s.updateCurrentBoardSnapshot({game:"word-radar",assessmentMode:true,nodeId:"opening",itemId:"i2",phase:"response",answerVisibility:"hidden",currentWord:"light"});
 expect(await replay.execute({})).toMatchObject({requested:false});
 expect(s.ttsBridge.sendText).not.toHaveBeenCalled();
 s.updateCurrentBoardSnapshot({game:"monster-stampede",currentWord:"tonight",answerVisibility:"visible"});
 expect(s.buildAgentToolkit().replayWord).toBeUndefined();
 expect(s.buildCurrentBoardContextForTurn()).toContain("ARPABET: T AH0 N AY1 T");
});

// Oct 19: "sound it out" during Planner-declared practice became another replay.
// The lab had only checked visibility permissions, never hidden practice's role.
it("lets Elli teach a canonical hidden practice item without claiming independence",()=>{
 const s=session();
 const cycle=vi.mocked(getChildChart).mock.results[0].value.learningCycle;
 cycle.nodes[0].role="baseline";
 cycle.nodes[0].evidenceContract.spellingItems.i1.lineage={measurementRole:"practice"};
 s.updateCurrentBoardSnapshot({phase:"launched",nodeId:"opening",launchToken:"practice"});
 s.updateCurrentBoardSnapshot({game:"word-radar",currentWord:"not-the-assigned-word",practiceCapture:true,nodeId:"opening",itemId:"i1",phase:"response",answerVisibility:"hidden",launchToken:"practice"});
 const context=s.buildCurrentBoardContextForTurn("Can you sound it out?");
 expect(context).toContain("ARPABET: N AY1 T");
 expect(context).toContain("Authoritative spelling target (internal): night");
 s.recordCompanionHelpTurn("Can you sound it out?","Let's listen to the sounds in night.");
 expect(s.getDiscoveryAttemptContext("hw-words","i1","practice")).toMatchObject({practice:true,support:{status:"assisted"}});
});
it.each(["evaluation","checkpoint","checkpoint-visible","evaluation-visible","unverified"])("keeps %s private even if the browser labels it practice",kind=>{
 const s=session();const cycle=vi.mocked(getChildChart).mock.results[0].value.learningCycle;
 cycle.nodes[0].role=kind.startsWith("evaluation")?"evaluation":"baseline";
 cycle.nodes[0].evidenceContract.spellingItems.i1.lineage={measurementRole:kind.startsWith("checkpoint")?"fresh_checkpoint":"practice"};
 s.updateCurrentBoardSnapshot({phase:"launched",nodeId:"opening",launchToken:"live"});
 s.updateCurrentBoardSnapshot({game:"word-radar",currentWord:"night",practiceCapture:true,nodeId:"opening",itemId:"i1",phase:"response",answerVisibility:kind.endsWith("visible")?"visible":"hidden",launchToken:kind==="unverified"?"stale":"live"});
 const context=s.buildCurrentBoardContextForTurn("Help me");
 expect(context).not.toContain("ARPABET");
 expect(context).not.toContain("spokenStimulus");
});

it("preserves legacy visible teaching when the frozen measurement role is absent",()=>{
 const s=session();vi.mocked(getChildChart).mock.results[0].value.learningCycle.nodes[0].role="baseline";s.updateCurrentBoardSnapshot({game:"word-radar",currentWord:"night",practiceCapture:true,nodeId:"opening",itemId:"i1",phase:"response",answerVisibility:"visible"});
 expect(s.buildCurrentBoardContextForTurn()).toContain("ARPABET: N AY1 T");
});
it("reports current pace each turn and retires it at the next item",async()=>{
 const s=session() as any;let speed=1;let selected:string|undefined;
 s.ttsBridge={getSpeechRate:(scope:any)=>scope?.itemId===selected?speed:1,setSpeechRate:async(value:number,scope:any)=>{speed=value;selected=scope?.itemId;return{speed};},stop:vi.fn()};
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:"opening",itemId:"i1",phase:"response",answerVisibility:"hidden"});
 const toolkit=s.buildAgentToolkit();await toolkit.setSpeechRate.execute({speed:0.7});
 expect(s.buildCurrentBoardContextForTurn()).toContain("Configured speech speed: 0.7");
 s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:"opening",itemId:"i2",phase:"response",answerVisibility:"hidden"});
 expect(s.ttsBridge.getSpeechRate({itemId:"i2"})).toBe(1);expect(s.buildCurrentBoardContextForTurn()).toContain("Configured speech speed: 1");
});

it.each(["flash","presentation","playing"])("records practice help before response entry during %s",phase=>{
 const s=session();const cycle=vi.mocked(getChildChart).mock.results[0].value.learningCycle;cycle.nodes[0].role="baseline";cycle.nodes[0].evidenceContract.spellingItems.i1.lineage={measurementRole:"practice"};
 s.updateCurrentBoardSnapshot({game:"word-radar",practiceCapture:true,spellingItemOpened:true,nodeId:"opening",itemId:"i1",phase,answerVisibility:"hidden"});
 s.recordCompanionHelpTurn("Help me sound it out","Let's listen to the sounds in night.");
 expect(s.getDiscoveryAttemptContext("hw-words","i1")?.support.status).toBe("assisted");
});

it("records practice stimulus pace even when narration is not an assessment replay",async()=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');const {openChart}=await import('../chart/db');const {recordAssignment}=await import('../chart/spelling/record');const {exportEvents}=await import('../chart/exportEvents');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'practice-audio-'));vi.stubEnv('SUNNY_CHART_DIR',root);vi.stubEnv('SUNNY_MODE','real');const db=openChart('lab-child');
 try{
  recordAssignment(db,{assignmentId:'hw-words',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
  const s=session() as any;s.ttsBridge.getAudioRatesThisTurn=()=>[0.75];
  s.updateCurrentBoardSnapshot({game:'word-radar',practiceCapture:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden'});
  await s.speakGameNarration('night.',{nodeId:'opening',itemId:'i1',assessmentMode:false});
  s.playbackDone({audible:true,requestId:s.pendingGameNarrationPlayback.requestId,itemId:'i1'});
  expect(exportEvents(db).find(e=>e.type==='stimulus.played')?.payload).toMatchObject({speechRates:[0.75],delivered:true});
  expect(exportEvents(db).filter(e=>e.type==='response.observed')).toHaveLength(0);
 }finally{db.close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
});

it("releases playback and counts delivery even if its typed receipt write fails",async()=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');const {openChart}=await import('../chart/db');const {recordAssignment}=await import('../chart/spelling/record');const writes=await import('../chart/spelling/originalResponses');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'audio-write-failure-'));vi.stubEnv('SUNNY_CHART_DIR',root);vi.stubEnv('SUNNY_MODE','real');const db=openChart('lab-child');
 const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{});let writer:{mockRestore:()=>void}|undefined;
 try{
  recordAssignment(db,{assignmentId:'hw-words',words:['night','light'],testDate:null,sourcePhotoHash:'a'.repeat(64)});
  const s=session() as any;s.updateCurrentBoardSnapshot({assessmentMode:true,nodeId:'opening',itemId:'i1',phase:'response',answerVisibility:'hidden'});
  await s.speakGameNarration('night.',{assessmentMode:true,itemId:'i1'});
  writer=vi.spyOn(writes,'recordPresentedAudio').mockImplementation(()=>{throw Error('sqlite busy');});
  expect(()=>confirmCurrentPlayback(s)).not.toThrow();
  expect(s.spellingAssessment.audioPlaybacks).toBe(1);expect(s.pendingGameNarrationPlayback).toBeNull();
  expect(errorLog.mock.calls.some(args=>String(args[0]).includes('[spelling-audio] [record] [failed]'))).toBe(true);
 }finally{writer?.mockRestore();errorLog.mockRestore();db.close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
});

it('permits requested letter demonstrations in practice and records them as assistance',()=>{
 const s=session();const cycle=vi.mocked(getChildChart).mock.results[0].value.learningCycle;cycle.nodes[0].role='baseline';cycle.nodes[0].evidenceContract.spellingItems.i1.lineage={measurementRole:'practice'};
 s.updateCurrentBoardSnapshot({game:'word-radar',nodeId:'opening',itemId:'i1',practiceCapture:true,phase:'response',answerVisibility:'hidden'});
 const trace=vi.spyOn(s,'recordGameTrace').mockImplementation(()=>{});const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try{
  expect(s.recordCompanionTruthContradictions('Try n-i-g-h-t.')).toEqual([]);
  s.recordCompanionHelpTurn('Show me the letters','Try n-i-g-h-t.');
  expect(s.getDiscoveryAttemptContext('hw-words','i1')?.support.status).toBe('assisted');
  expect(trace).not.toHaveBeenCalled();
 }finally{trace.mockRestore();warning.mockRestore();}
});

// Oct 20 human catch: periodic Word Radar updates removed the canonical item.
// The lab supplied only complete snapshots, so context and speech scope loss escaped it.
it("retains the same practice item's teaching context through periodic updates",async()=>{
 const s=session() as any;const cycle=vi.mocked(getChildChart).mock.results[0].value.learningCycle;
 cycle.nodes[0].role='baseline';cycle.nodes[0].evidenceContract.spellingItems.i1.lineage={measurementRole:'practice'};
 s.updateCurrentBoardSnapshot({phase:'launched',nodeId:'opening',launchToken:'live'});
 s.updateCurrentBoardSnapshot({game:'word-radar',nodeId:'opening',itemId:'i1',itemIndex:0,practiceCapture:true,phase:'response',answerVisibility:'hidden',launchToken:'live'});
 let selectedScope:any;
 s.ttsBridge.getSpeechRate=(scope:any)=>scope?.itemId===selectedScope?.itemId?0.75:1;
 s.ttsBridge.setSpeechRate=vi.fn(async(speed:number,scope:any)=>{selectedScope=scope;return{speed};});
 for(const typed of ['n','ni','nig']) {
  s.updateCurrentBoardSnapshot({game:'word-radar',nodeId:'opening',itemIndex:0,practiceCapture:true,answerVisibility:'hidden',launchToken:'live',typed});
  expect(s.currentBoardSnapshot).toMatchObject({itemId:'i1',phase:'response',spellingTarget:'night',spellingSupportMode:'pronunciation_model',launchToken:'live'});
  expect(s.buildCurrentBoardContextForTurn('Please sound it out')).toContain('ARPABET: N AY1 T');
 }
 const tool=s.buildAgentToolkit().setSpeechRate;
 await tool.execute({speed:0.75});
 expect(s.ttsBridge.setSpeechRate).toHaveBeenCalledWith(0.75,{itemId:'i1',launchToken:'live'});
 s.recordCompanionHelpTurn('Help me','The letters are n-i-g-h-t.');
 expect(s.getDiscoveryAttemptContext('hw-words','i1','live').support.status).toBe('assisted');
 s.updateCurrentBoardSnapshot({game:'word-radar',nodeId:'opening',itemIndex:1,practiceCapture:true,answerVisibility:'hidden',launchToken:'live'});
 expect(s.currentBoardSnapshot.itemId).toBeUndefined(); // Never carry the old word into a new item.
 s.updateCurrentBoardSnapshot({nodeId:'opening',phase:'closed',launchToken:'live'});
 expect(s.currentBoardSnapshot.spellingTarget).toBeUndefined();
});
