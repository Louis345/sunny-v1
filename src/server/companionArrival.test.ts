import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("ai", async importOriginal => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: stream,
}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => "recorded-model" }));
vi.mock("../agents/elli/tools/generateToolDocs", async importOriginal => ({
  ...(await importOriginal<typeof import("../agents/elli/tools/generateToolDocs")>()),
  ALL_TOOLS: {},
}));

import { deliverHomeworkArrival } from "./session-bootstrap";
import { runCompanionResponseForSession } from "./companion-response-runner";
import { TurnStateMachine } from "./session-state";
import { SessionManager } from "./session-manager";
import { buildSessionPrompt } from "../agents/prompts";
import { createSessionContext } from "./session-context";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
beforeEach(() => vi.clearAllMocks());

function response(chunks: string[], finishReason = "stop", duringTurn?: () => void, toolCall = false) {
  stream.mockImplementation(options => ({
    fullStream: (async function* () {
      // Use the real turn machine and response runner, including their async start.
      await new Promise(resolve => setImmediate(resolve));
      duringTurn?.();
      if (toolCall) await options.onStepFinish({
        finishReason: "tool-calls",
        toolCalls: [{ toolName: "companionAct", input: { type: "emote", payload: { emote: "happy" } } }],
        toolResults: [{ output: { ok: true } }],
      });
      for (const text of chunks) yield { type: "text-delta", text };
    })(),
    finishReason: Promise.resolve(finishReason),
  }));
}

function harness() {
  let owner: { requestId: string } | undefined;
  const session: any = {
    sessionId: "arrival-demo", options: {}, companionWakeGateEnabled: false,
    companion: { name: "Elli", systemPrompt: "You remember the child and can teach, listen, joke, or be quiet." },
    conversationHistory: [], gamePendingRevision: null,
    setCompanionPresence: vi.fn(), send: vi.fn(),
    recordDebugEvent: vi.fn(), recordDebugError: vi.fn(),
    handleEndOfTurn: vi.fn(async () => {}),
    flushPendingRoundComplete: vi.fn(),
    companionBridge: { expressCompanion: vi.fn(async () => ({ ok: true })), companionAct: vi.fn() },
    buildAgentToolkit: () => ({}),
    ttsBridge: {
      beginPlayback: vi.fn((requestId: string) => { owner = { requestId }; }),
      currentPlaybackIdentity: () => owner,
      connect: vi.fn(async () => {}), sendText: vi.fn(), stop: vi.fn(), finish: vi.fn(),
    },
  };
  session.turnSM = new TurnStateMachine((text: string) => session.ttsBridge.sendText(text), vi.fn());
  session.handleToolCall = vi.fn(() => { session.toolCallsMadeThisTurn++; });
  session.runCompanionResponse = (text: string, options?: { arrival?: boolean }) =>
    runCompanionResponseForSession(session, text, options);
  return session;
}

const context = (policy = "context_start_short") => ({
  pendingHomework: { homeworkId: "demo-homework", nodes: [] },
  activeSessionPlan: {
    activeHomeworkId: "demo-homework", nodePlan: [],
    companionPolicy: { openingLinePolicy: policy },
  },
});

// Human catch: a prompt-fragment test passed while a real mount produced a
// recap, praise, pet question and activity pitch. That test never exercised
// the assembled model request, silence recovery, audio, or listening state.
// Recorded provider outputs below prove execution, NOT conversational judgment.
describe("homework arrival is an opportunity, not an obligation to speak", () => {
  it.each(["silent", "none"])("honors the Planner's %s policy without a model or voice call", async policy => {
    const session = harness();
    stream.mockClear();
    await deliverHomeworkArrival(session, context(policy));
    expect(stream).not.toHaveBeenCalled();
    expect(session.setCompanionPresence).not.toHaveBeenCalled();
    expect(session.ttsBridge.connect).not.toHaveBeenCalled();
    expect(session.turnSM.getState()).toBe("IDLE");
  });

  it("accepts a successful silent decision without recovery speech or a TTS connection, then handles the child's next turn", async () => {
    response([]);
    const session = harness();
    await runCompanionResponseForSession(session, "[Session opening context] The child has arrived; the board is available.", { arrival: true });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(session.send).not.toHaveBeenCalledWith("response_text", expect.anything());
    expect(session.setCompanionPresence).not.toHaveBeenCalled();
    expect(session.ttsBridge.connect).not.toHaveBeenCalled();
    expect(session.recordDebugError).not.toHaveBeenCalled();
    expect(session.recordDebugEvent).toHaveBeenCalledWith("companion", "arrival_completed", { spoken: false });
    expect(session.turnSM.getState()).toBe("IDLE");
    expect(session.currentAbort).toBeNull();

    response(["Hi, I'm here."]);
    await session.runCompanionResponse("Hi Elli.");
    expect(session.send).toHaveBeenCalledWith("response_text", { chunk: "Hi, I'm here." });
    expect(session.ttsBridge.sendText).toHaveBeenCalled();
    expect(session.ttsBridge.finish).toHaveBeenCalledOnce();
  });

  it("delivers Elli's own words and chosen expression without an arrival script or sentence quota", async () => {
    response(["[smile] Hi there."]);
    const session = harness();
    await deliverHomeworkArrival(session, context());
    const request = stream.mock.calls.at(-1)![0];
    const assembled = JSON.stringify(request.messages);
    expect(assembled).toContain(session.companion.systemPrompt);
    expect(assembled).toContain("The board is available");
    expect(assembled).toContain("silence");
    expect(assembled).not.toMatch(/brief hello is enough|choose what to do next|one or two short sentences/i);
    expect(request.experimental_onToolCallStart).toBeUndefined();
    expect(session.companionBridge.expressCompanion).toHaveBeenCalledExactlyOnceWith({ emote: "happy" });
    expect(session.companionBridge.companionAct).not.toHaveBeenCalled();
    expect(session.setCompanionPresence).toHaveBeenCalledExactlyOnceWith("summoned", "voice");
    expect(session.setCompanionPresence.mock.invocationCallOrder[0]).toBeLessThan(session.ttsBridge.sendText.mock.invocationCallOrder[0]);
    expect(session.ttsBridge.sendText.mock.calls.map((call: any[]) => call[0]).join("")).toBe("Hi there.");
  });

  it("retains the production persona, shared context and live spelling toolkit when assembling an arrival", async () => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    response(["Hi there."]);
    const session = harness();
    session.ctx = createSessionContext({ childName: "arrival-demo", companionName: "Elli", sessionType: "spelling" });
    session.isSpellingSession = true;
    session.companion.systemPrompt = await buildSessionPrompt(
      "arrival-demo" as any, path.resolve(__dirname, "../companions/elli.md"),
      "A saved demo assignment is available.", [], "homework", { carePlan: null },
    );
    session.buildAgentToolkit = () => SessionManager.prototype.buildAgentToolkit.call(session);
    await deliverHomeworkArrival(session, context());
    const request = stream.mock.calls.at(-1)![0];
    const system = request.messages[0].content;
    expect(system).toContain("Conversation belongs to you, not a script.");
    expect(system).toContain("She follows the child's lead");
    expect(system).toContain("Independent outcomes must retain their actual assistance conditions");
    expect(system).not.toMatch(/brief hello is enough|one or two short sentences/i);
    expect(Object.keys(request.tools)).toEqual(Object.keys(session.buildAgentToolkit()));
    expect(request.tools).toHaveProperty("companionAct");
    expect(request.tools).toHaveProperty("recordProductIssue");
    expect(request.tools).toHaveProperty("sessionStatus");
    // Arrival has no selected stimulus; preserve that actual capability state.
    expect(request.tools).not.toHaveProperty("replayWord");
    expect(request.tools).toHaveProperty("setSpeechRate");
  });

  it("can choose just an expression without having a spoken recovery imposed on it", async () => {
    response(["[smile]"]);
    const session = harness();
    await deliverHomeworkArrival(session, context());
    expect(session.companionBridge.expressCompanion).toHaveBeenCalledExactlyOnceWith({ emote: "happy" });
    expect(session.ttsBridge.connect).not.toHaveBeenCalled();
    expect(session.send).not.toHaveBeenCalledWith("response_text", expect.anything());
    expect(session.turnSM.getState()).toBe("IDLE");
  });

  it("preserves a child's request arriving while Elli is deciding to stay quiet", async () => {
    const session = harness();
    response([], "stop", () => session.turnSM.setPendingTranscript("Elli, can you help me?"));
    await deliverHomeworkArrival(session, context());
    await new Promise(resolve => setImmediate(resolve));
    expect(session.handleEndOfTurn).toHaveBeenCalledExactlyOnceWith("Elli, can you help me?", true);
    expect(session.turnSM.consumePendingTranscript()).toBeNull();
    expect(session.turnSM.getState()).toBe("IDLE");
  });

  it("does not label an output-budget failure as a deliberate silent decision", async () => {
    response([], "length");
    const session = harness();
    await deliverHomeworkArrival(session, context());
    expect(session.recordDebugError).toHaveBeenCalledWith("Agent error", expect.objectContaining({ message: "companion_arrival_incomplete:length" }));
    expect(session.recordDebugEvent).not.toHaveBeenCalledWith("companion", "arrival_completed", expect.anything());
  });

  it.each([
    { chunks: [], finish: "length", tool: true },
    { chunks: [], finish: "error", tool: true },
    { chunks: ["Hi there, I was"], finish: "length", tool: false },
  ])("does not report a failed terminal outcome as a successful arrival ($finish, tool=$tool)", async ({ chunks, finish, tool }) => {
    response(chunks, finish, undefined, tool);
    const session = harness();
    await deliverHomeworkArrival(session, context());
    if (tool) expect(session.handleToolCall).toHaveBeenCalled();
    expect(session.recordDebugError).toHaveBeenCalled();
    expect(session.recordDebugEvent).not.toHaveBeenCalledWith("companion", "arrival_completed", expect.anything());
  });

  it("does not wake an independent-evaluation companion when it chooses an orientation", async () => {
    response(["The speaker and response controls are here."]);
    const session = harness();
    session.companionWakeGateEnabled = true;
    await deliverHomeworkArrival(session, context());
    expect(session.setCompanionPresence).not.toHaveBeenCalled();
    expect(session.ttsBridge.sendText).toHaveBeenCalled();
  });

  it("does not mistake a provider error for a successful decision to stay quiet", async () => {
    stream.mockImplementation(() => { throw new Error("recorded_provider_failure"); });
    const session = harness();
    await deliverHomeworkArrival(session, context());
    expect(session.recordDebugError).toHaveBeenCalledWith("Agent error", expect.any(Error));
    expect(session.recordDebugEvent).not.toHaveBeenCalledWith("companion", "arrival_completed", expect.anything());
  });
});
