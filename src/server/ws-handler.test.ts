import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startMock = vi.fn();
const endMock = vi.fn();
const receiveAudioMock = vi.fn();
const handleGameEventMock = vi.fn();
const setCompanionPresenceMock = vi.fn();
const getChildChartMock = vi.fn();

vi.mock("./audioGate", () => ({
  createAudioGate: vi.fn(() => ({
    receiveChunk: vi.fn(),
    setMute: vi.fn(),
  })),
}));

vi.mock("./session-manager", () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    start: startMock,
    end: endMock,
    receiveAudio: receiveAudioMock,
    handleGameEvent: handleGameEventMock,
    setCompanionPresence: setCompanionPresenceMock,
  })),
}));

vi.mock("../profiles/childChart", () => ({
  getChildChart: (...args: unknown[]) => getChildChartMock(...args),
}));

import { handleWsConnection } from "./ws-handler";
import { SessionManager } from "./session-manager";

class FakeWs extends EventEmitter {
  sent: unknown[] = [];

  send(raw: string): void {
    this.sent.push(JSON.parse(raw));
  }
}

function req() {
  return {
    socket: { remoteAddress: "127.0.0.1" },
  };
}

async function sendJson(ws: FakeWs, payload: Record<string, unknown>): Promise<void> {
  ws.emit("message", Buffer.from(JSON.stringify(payload)));
  await Promise.resolve();
}

describe("ws handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChildChartMock.mockReturnValue({
      childId: "ila",
      activeSessionPlan: {
        activeHomeworkId: "hw-spelling-1",
        domain: "spelling",
        adventureBoard: { boardId: "board-1" },
      },
      learningCycle: {
        homeworkId: "hw-spelling-1",
        domain: "spelling",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to infer a homework assignment from ambient child state", async () => {
    vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({
      subject: "homework",
      sessionMode: "real",
      previewMode: "off",
      voiceMode: "normal",
      childId: null,
      homeworkDomain: "spelling",
    }));
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, { type: "start_session", child: "Ila" });

    expect(startMock).not.toHaveBeenCalled();
    expect(ws.sent).toContainEqual({
      type: "error",
      code: "homework_assignment_identity_required",
      message: "Choose a ready assignment before starting Sunny.",
    });
  });

  it("starts homework voice only for the exact chart-backed assignment", async () => {
    vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({
      subject: "homework",
      sessionMode: "real",
      previewMode: "off",
      voiceMode: "normal",
      childId: null,
      homeworkDomain: "spelling",
    }));
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, {
      type: "start_session",
      child: "Ila",
      homeworkId: "hw-spelling-1",
    });

    expect(getChildChartMock).toHaveBeenCalledWith("ila");
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(SessionManager).toHaveBeenCalledWith(
      expect.anything(),
      "Ila",
      false,
      { homeworkId: "hw-spelling-1" },
    );
    expect(ws.sent).not.toContainEqual(expect.objectContaining({ type: "error" }));
  });

  it("reports a chart-read failure instead of leaving the socket unresolved", async () => {
    vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({
      subject: "homework",
      sessionMode: "real",
      previewMode: "off",
      voiceMode: "normal",
      homeworkDomain: "spelling",
    }));
    getChildChartMock.mockImplementationOnce(() => {
      throw new Error("chart unavailable");
    });
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, {
      type: "start_session",
      child: "Ila",
      homeworkId: "hw-spelling-1",
    });

    expect(startMock).not.toHaveBeenCalled();
    expect(ws.sent).toContainEqual({
      type: "error",
      code: "homework_assignment_unavailable",
      message: "Sunny could not load that assignment. Return to the child picker.",
    });
  });

  it("rejects a stale homework identity before constructing a voice session", async () => {
    vi.stubEnv("SUNNY_RUNTIME_CONFIG", JSON.stringify({
      subject: "homework",
      sessionMode: "real",
      previewMode: "off",
      voiceMode: "normal",
      childId: null,
      homeworkDomain: "spelling",
    }));
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, {
      type: "start_session",
      child: "Ila",
      homeworkId: "hw-stale",
    });

    expect(startMock).not.toHaveBeenCalled();
    expect(ws.sent).toContainEqual({
      type: "error",
      code: "homework_assignment_identity_mismatch",
      message: "That assignment is no longer ready. Return to the child picker.",
    });
  });

  it("routes raw game_state_update messages into the active session instead of erroring", async () => {
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, { type: "start_session", child: "Reina" });
    await sendJson(ws, {
      type: "game_state_update",
      game: "pronunciation",
      currentWord: "able",
      phase: "approaching",
    });

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(handleGameEventMock).toHaveBeenCalledWith({
      type: "game_state_update",
      game: "pronunciation",
      currentWord: "able",
      phase: "approaching",
    });
    expect(ws.sent).not.toContainEqual(
      expect.objectContaining({ message: "Unknown type: game_state_update" }),
    );
  });

  it("routes locked_node_tap as internal game context, not transcript text", async () => {
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, { type: "start_session", child: "Ila" });
    await sendJson(ws, {
      type: "locked_node_tap",
      childId: "ila",
      nodeId: "n-quest",
      nodeType: "quest",
      currentUnlockedNodeId: "n-pronunciation",
    });

    expect(handleGameEventMock).toHaveBeenCalledWith({
      type: "game_state_update",
      game: "adventure-map",
      phase: "locked_node_tap",
      childId: "ila",
      nodeId: "n-quest",
      nodeType: "quest",
      currentUnlockedNodeId: "n-pronunciation",
      instruction:
        "Locked map node tapped. Reply in one short warm sentence that encourages finishing the unlocked activity first. Do not start a new game.",
    });
    expect(ws.sent).not.toContainEqual(
      expect.objectContaining({ message: "Unknown type: locked_node_tap" }),
    );
  });

  it("routes companion presence controls to the active voice session", async () => {
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, { type: "start_session", child: "Reina" });
    await sendJson(ws, { type: "companion_presence", state: "summoned" });

    expect(setCompanionPresenceMock).toHaveBeenCalledWith("summoned", "client");
  });

  it("reports session start failures without crashing the websocket handler", async () => {
    startMock.mockRejectedValueOnce(new Error("DEEPGRAM_API_KEY not set in .env"));
    const ws = new FakeWs();
    handleWsConnection(ws as never, req() as never);

    await sendJson(ws, {
      type: "start_session",
      child: "Ila",
      sttOnly: true,
      silentTts: true,
    });
    await Promise.resolve();

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(ws.sent).toContainEqual({
      type: "error",
      code: "voice_connection_unavailable",
      message: "Voice connection is having trouble. You can still type.",
    });
  });
});
