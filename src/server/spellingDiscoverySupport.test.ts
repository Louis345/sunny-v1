import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";
import { getChildChart } from "../profiles/childChart";
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn() }));
afterEach(() => vi.clearAllMocks());
function session() {
  vi.mocked(getChildChart).mockReturnValue({ learningCycle: { homeworkId: "hw-words", domain: "spelling", nodes: [{ nodeId: "opening", role: "evaluation", artifactBinding: { contractFingerprint: "frozen" }, evidenceContract: { spellingItems: { i1: { id: "i1", word: "night" }, i2: { id: "i2", word: "light" } } } }] } } as never);
  return Object.assign(Object.create(SessionManager.prototype), {
    chartChildId: "lab-child", childName: "Lab", sessionTtsLabel: "Lab", sessionId: "s1", companionPresence: "collapsed", send: vi.fn(),
    debugRecorder: { recordEvent: vi.fn() },
    ttsBridge: { connect: vi.fn(async () => {}), sendText: vi.fn(), finish: vi.fn(async () => {}), hadAudioThisTurn: vi.fn(() => true) },
    turnSM: { onPlaybackComplete: vi.fn(), consumePendingTranscript: vi.fn() },
    flushPendingRoundComplete: vi.fn(),
  }) as SessionManager;
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
