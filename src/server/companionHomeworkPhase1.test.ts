import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { stream, compact } = vi.hoisted(() => ({ stream: vi.fn(), compact: vi.fn() }));
vi.mock("ai", async original => ({ ...(await original<typeof import("ai")>()), streamText: stream }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => "synthetic-model" }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: compact }; } }));
vi.mock("../agents/elli/tools/generateToolDocs", async original => ({
  ...(await original<typeof import("../agents/elli/tools/generateToolDocs")>()), ALL_TOOLS: {},
}));

import { readSoul, buildSessionPrompt } from "../agents/prompts";
import { buildContextStartGreeting, deliverHomeworkArrival } from "./session-bootstrap";
import { runCompanionResponseForSession } from "./companion-response-runner";
import { hostSessionStatus } from "./host-tool-handlers";
import { SessionManager } from "./session-manager";
import { createSessionContext } from "./session-context";
import { TurnStateMachine } from "./session-state";
import { WsTtsBridge } from "./ws-tts-bridge";
import { maybeCompactCompanionInteractionMemory, recordCompanionInteractionEvent } from "./companionInteractionMemory";

const brevity = "Be warm and attentive. Keep ordinary conversation brief and leave room for the child. Expand when useful or requested. Respond meaningfully to direct requests, through speech or an appropriate action.";
let root: string;
const child = "arrival-demo";
const context = (policy = "context_start_short") => ({
  pendingHomework: { homeworkId: "synthetic-homework", nodes: [{ id: "first", targetLane: "forced_agenda" }] },
  activeSessionPlan: { activeHomeworkId: "synthetic-homework", companionPolicy: { openingLinePolicy: policy } },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADVENTURE_MAP", "true");
  vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({subject:"homework", sessionMode:"real", childId:child, homeworkDomain:"spelling", previewMode:"off", nodeAccess:"normal", voiceMode:"normal"}));
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-homework-phase1-"));
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(root, "src/context"));
  const dir = path.join(root, "src/context", child, "companion_care");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "elli.json"), JSON.stringify({
    version: 1, childId: child, companionId: "elli", state: {}, inventory: {}, economy: {},
    memory: { reunionLineSeed: "LEGACY_REUNION_PERFORMANCE", emotionalTone: "LEGACY_IMPOSED_TONE", relationshipFacts: ["The demo likes drawing."] },
  }));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function provider(chunks: string[] = [], finishReason = "stop", during?: () => void) {
  stream.mockImplementation(() => ({
    fullStream: (async function* () {
      await new Promise(resolve => setImmediate(resolve));
      during?.();
      for (const text of chunks) yield { type: "text-delta", text };
    })(), finishReason: Promise.resolve(finishReason),
  }));
}

async function session() {
  const s: any = {
    ctx: createSessionContext({childName: child, sessionType:"homework", chartChildId:child}),
    sessionId: "synthetic-session", chartChildId: child, companionPresence: "collapsed", options: {},
    currentBoardSnapshot: null, conversationHistory: [], gamePendingRevision: null,
    setCompanionPresence: vi.fn((state: string) => { s.companionPresence = state; }),
    send: vi.fn(), recordDebugEvent: vi.fn(), recordDebugError: vi.fn(), recordDebugTranscript: vi.fn(),
    flushPendingRoundComplete: vi.fn(), handleEndOfTurn: vi.fn(async () => {}),
    companionBridge: { companionAct: vi.fn(), expressCompanion: vi.fn() },
    ttsBridge: { beginPlayback: vi.fn(), connect: vi.fn(async () => {}), sendText: vi.fn(), finish: vi.fn(async () => {}), stop: vi.fn() },
  };
  s.ctx.enginePlan = {focusWords:["LEGACY_FOCUS"],reviewWords:[],newWords:[],sessionRecommendation:"forced_agenda"};
  s.companion = { name: "Elli", systemPrompt: await buildSessionPrompt(child as any,
    path.resolve(__dirname, "../companions/elli.md"), "A synthetic saved assignment is available.", [], "homework", { carePlan: null }) };
  s.turnSM = new TurnStateMachine((text) => s.ttsBridge.sendText(text), vi.fn());
  s.buildCurrentBoardContextForTurn = SessionManager.prototype.buildCurrentBoardContextForTurn.bind(s);
  s.buildAgentToolkit = SessionManager.prototype.buildAgentToolkit.bind(s);
  s.runCompanionResponse = (message: string, source?: "system" | "user") => runCompanionResponseForSession(s, message, source);
  return s;
}

// Human catch: fragment tests omitted SessionManager's real memory/context path.
// These tests capture provider INPUT and execution, never claim to prove warmth.
describe("one factual homework turn path", () => {
  it("captures the complete arrival request with real persona, toolkit and remembered facts, but no legacy direction or agenda", async () => {
    provider();
    const s = await session();
    await deliverHomeworkArrival(s, context());
    const request = stream.mock.calls[0][0];
    const text = JSON.stringify(request.messages);
    // Save the initial assembled request even during the red test, for before/after comparison.
    if (process.env.SUNNY_PHASE1_REQUEST_CAPTURE) fs.writeFileSync(process.env.SUNNY_PHASE1_REQUEST_CAPTURE,
      JSON.stringify({messages: request.messages, tools:Object.fromEntries(Object.entries(request.tools).map(([name,t]:[string,any])=>[name,{description:t.description,inputSchema:z.toJSONSchema(t.inputSchema,{unrepresentable:"any"})}]))},null,2));
    expect(text).not.toMatch(/Session Phase|Learning State|Wilson|Reading Profile|Today's Focus Words|Available teaching games|Available reward games|companion-driven/i);
    for (const name of ["canvasShow", "canvasClear", "launchGame", "sessionLog"]) expect(request.tools).not.toHaveProperty(name);
    expect(request.messages.at(-1).content).toContain("[Runtime context — not child speech]");
    expect(text).toContain("The demo likes drawing.");
    expect(text).not.toMatch(/LEGACY_REUNION_PERFORMANCE|LEGACY_IMPOSED_TONE|LEGACY_FOCUS|forced.agenda|current focus|brief hello is enough/i);
    expect(request.messages[0].content).toContain(brevity);
    expect(request.messages[0].content).not.toMatch(/one or two short sentences|gets genuinely excited|never re-introduces/i);
    expect(request.tools).toHaveProperty("companionAct");
    expect(request.tools).toHaveProperty("sessionStatus");
    expect(stream).toHaveBeenCalledTimes(1);

  });

  it("does not read checkout memory even when a legacy file exists; configured soul paths stay isolated", async () => {
    const originalRead = fs.readFileSync.bind(fs);
    const originalExists = fs.existsSync.bind(fs);
    const exists = vi.spyOn(fs, "existsSync").mockImplementation(file => String(file).endsWith("/companion_context.md") || originalExists(file));
    const reads: string[] = [];
    const spy = vi.spyOn(fs, "readFileSync").mockImplementation(((file: any, ...args: any[]) => {
      reads.push(String(file));
      if(String(file).endsWith("/companion_context.md")) return "STALE_CHECKOUT_PERSONAL_QUESTION";
      return (originalRead as any)(file, ...args);
    }) as any);
    try {
      const s = await session();
      expect(s.companion.systemPrompt).not.toContain("STALE_CHECKOUT_PERSONAL_QUESTION");
      fs.writeFileSync(path.join(root,"src/context",child,"soul.md"),"CONFIGURED_SOUL");
      expect(readSoul(child)).toBe("CONFIGURED_SOUL");
      expect(reads.some(p => p.endsWith("/companion_context.md"))).toBe(false);
    } finally { spy.mockRestore(); exists.mockRestore(); }
  });

  it("keeps a system event out of child speech, user history and learning help evidence", async () => {
    const s = await session();
    provider(["Hello."], "stop", () => expect(s.inFlightReply).toBeNull());
    s.buildCurrentBoardContextForTurn = vi.fn(() => "[Board facts]");
    s.recordCompanionHelpTurn = vi.fn();
    await s.runCompanionResponse("[System event: path choice opened]", "system");
    expect(s.buildCurrentBoardContextForTurn).toHaveBeenCalledWith(undefined);
    expect(stream.mock.calls[0][0].messages.at(-1).content).toContain("[Runtime context — not child speech]");
    expect(s.conversationHistory[0].role).toBe("system");
    expect(s.recordCompanionHelpTurn).not.toHaveBeenCalled();
  });

  it("retains factual status without legacy tutor agenda even after a tool call", async () => {
    const s = await session();
    const status = await hostSessionStatus(s);
    expect(status).toMatchObject({activityMode:"none",activityPauseState:"active"});
    for(const key of ["sessionPhase","canvasOwner","correctStreak","roundNumber"]) expect(status).not.toHaveProperty(key);
  });

  it("keeps the same brevity default on a child-addressed turn", async () => {
    provider(["Here is some help."]);
    const s = await session();
    await s.runCompanionResponse("Please help me.");
    expect(stream.mock.calls[0][0].messages[0].content).toContain(brevity);
  });

  it("executes an expression-only choice without speaking or purchasing a repair", async () => {
    provider(["[smile]"]);
    const s = await session(); await s.runCompanionResponse("A friendly wave.");
    expect(s.companionBridge.expressCompanion).toHaveBeenCalledWith({ emote: "happy" });
    expect(stream).toHaveBeenCalledOnce();
    expect(s.ttsBridge.connect).not.toHaveBeenCalled();
    expect(s.turnSM.getState()).toBe("IDLE");
  });

  it.each(["silent", "none"])("honors explicit %s arrival policy", async policy => {
    provider(); const s = await session();
    await deliverHomeworkArrival(s, context(policy));
    expect(stream).not.toHaveBeenCalled();
    expect(s.ttsBridge.connect).not.toHaveBeenCalled();
  });

  it("honors STT-only mode at arrival", async () => {
    provider(); const s = await session(); s.options.sttOnly = true;
    await deliverHomeworkArrival(s, context());
    expect(stream).not.toHaveBeenCalled();
    expect(s.ttsBridge.connect).not.toHaveBeenCalled();
  });

  it.each(["", "Please wait while I think."])("accepts successful quiet and preserves queued child input (%s)", async message => {
    const s = await session();
    provider([], "stop", () => s.turnSM.setPendingTranscript("A new child request."));
    await s.runCompanionResponse(message || buildContextStartGreeting(context()));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(s.ttsBridge.connect).not.toHaveBeenCalled();
    expect(s.ttsBridge.beginPlayback).not.toHaveBeenCalled();
    expect(s.send.mock.calls.filter(([type]: any[]) => type === "response_text")).toEqual([]);
    expect(s.conversationHistory.filter((entry: any) => entry.role === "assistant")).toEqual([]);
    expect(s.turnSM.getState()).toBe("IDLE");
    expect(s.handleEndOfTurn).toHaveBeenCalledWith("A new child request.", true);
  });

  it.each(["length", "error", "unknown"])("does not call an incomplete %s terminal result quiet or buy a retry", async reason => {
    provider([], reason); const s = await session();
    await s.runCompanionResponse("Help please.");
    expect(stream).toHaveBeenCalledTimes(1);
    expect(s.send).toHaveBeenCalledWith("error", expect.objectContaining({ fatal: false }));
    expect(s.ttsBridge.sendText).not.toHaveBeenCalled();
    expect(s.turnSM.getState()).toBe("IDLE");
  });

  it("reports a provider failure as nonfatal system status, never Elli speech", async () => {
    stream.mockImplementation(() => { throw Object.assign(new Error("synthetic overload"), { statusCode: 529 }); });
    const s = await session(); await s.runCompanionResponse("Can you help?");
    expect(stream).toHaveBeenCalledTimes(1);
    expect(s.send).toHaveBeenCalledWith("error", expect.objectContaining({ fatal: false }));
    expect(s.send.mock.calls.filter(([type]: any[]) => type === "response_text")).toEqual([]);
    expect(s.ttsBridge.connect).not.toHaveBeenCalled();
    expect(s.turnSM.getState()).toBe("IDLE");
  });

  it.each(["length", "throw"])("preserves a new child request queued during a %s failure", async failure => {
    const s = await session();
    provider([], "length", () => {
      s.turnSM.setPendingTranscript("My next request.");
      if (failure === "throw") throw new Error("synthetic provider failure");
    });
    await s.runCompanionResponse("The earlier request.");
    expect(s.handleEndOfTurn).toHaveBeenCalledWith("My next request.", true);
    expect(s.send).toHaveBeenCalledWith("error", expect.objectContaining({ fatal: false }));
  });

  it.each([false, true])("finishes a short reply after a delayed real TTS handshake (deferred=%s)", async deferred => {
    // The earlier mock resolved connect immediately and hid the CONNECTING race.
    const server = http.createServer();
    const sockets = new WebSocketServer({ noServer: true });
    const packets: any[] = [];
    let allowUpgrade!: () => void;
    let sawUpgrade!: () => void;
    const upgrade = new Promise<void>(resolve => { sawUpgrade = resolve; });
    server.on("upgrade", (req, socket, head) => {
      allowUpgrade = () => sockets.handleUpgrade(req, socket, head, peer => sockets.emit("connection", peer));
      sawUpgrade();
    });
    sockets.on("connection", peer => peer.on("message", data => {
      const packet = JSON.parse(String(data)); packets.push(packet);
      if (packet.text === "") peer.send(JSON.stringify({ audio: Buffer.from("local-pcm").toString("base64"), isFinal: true }));
    }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    vi.stubEnv("ELEVENLABS_WS_BASE_URL", `ws://127.0.0.1:${address.port}`);
    vi.stubEnv("ELEVENLABS_API_KEY", "local-only"); vi.stubEnv("TTS_ENABLED", "true");
    const s = await session();
    if (deferred) s.gamePendingRevision = 1;
    const browser = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
    const bridge = new WsTtsBridge(browser, "local-voice", 250);
    s.ttsBridge = bridge;
    s.turnSM = new TurnStateMachine(text => bridge.sendText(text), vi.fn());
    try {
      provider(["Hello."]);
      const running = s.runCompanionResponse("A direct greeting.").then(async () => {
        // Same shared finish boundary used when game/canvas readiness releases speech.
        if (deferred) { expect(s.deferredTtsFinish).toBe(true); await bridge.finish(); }
      });
      await upgrade;
      await new Promise(resolve => setTimeout(resolve, 20));
      allowUpgrade();
      await running;
      expect(packets.some(packet => packet.text === "")).toBe(true);
      expect(s.send).not.toHaveBeenCalledWith("error", expect.anything());
    } finally {
      bridge.close(); sockets.clients.forEach(peer => peer.terminate());
      await new Promise<void>(resolve => sockets.close(() => resolve()));
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("excludes legacy direction from the real compactor request and new writes without migrating old fields", async () => {
    recordCompanionInteractionEvent({ childId: child, companionId: "elli", callSource: "showroom",
      relationshipState: "selected", eventType: "companion_talk_completed", questionText: "I like drawing.",
      companionText: "That looks fun.", commandCount: 0, visionUsed: false }, { rootDir: root });
    compact.mockResolvedValue({ content: [{ type: "tool_use", name: "save_companion_memory_summary", input: {
      lastSessionSummary: "The demo discussed drawing.", reunionLineSeed: "NEW_FORCED_SCRIPT", emotionalTone: "NEW_FORCED_TONE",
    } }] });
    await maybeCompactCompanionInteractionMemory({ childId: child, companionId: "elli" }, { rootDir: root, minEvents: 1 });
    expect(JSON.stringify(compact.mock.calls[0][0])).not.toMatch(/reunionLineSeed|emotionalTone|LEGACY_REUNION|LEGACY_IMPOSED/);
    const memory = JSON.parse(fs.readFileSync(path.join(root, "src/context", child, "companion_care/elli.json"), "utf8")).memory;
    expect(memory.lastSessionSummary).toBe("The demo discussed drawing.");
    expect(memory.reunionLineSeed).toBe("LEGACY_REUNION_PERFORMANCE");
    expect(memory.emotionalTone).toBe("LEGACY_IMPOSED_TONE");
  });
});
